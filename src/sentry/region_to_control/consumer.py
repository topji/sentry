import signal
from typing import Callable, Generic, Mapping, Sequence, TypeVar

from arroyo import Partition, Topic
from arroyo.backends.kafka import KafkaConsumer, KafkaPayload
from arroyo.processing import StreamProcessor
from arroyo.processing.strategies import ProcessingStrategy, ProcessingStrategyFactory
from arroyo.processing.strategies.batching import AbstractBatchWorker, BatchProcessingStrategy
from arroyo.types import Message, Position
from django.conf import settings

from sentry.models import UserIP
from sentry.utils import json, metrics

from ..utils.kafka_config import get_kafka_consumer_cluster_options
from .messages import RegionToControlMessage


def get_region_to_control_consumer(
    group_id: str = None,
    auto_offset_reset="earliest",
    max_batch_size=100,
    max_batch_time=1000,
    **opts,
) -> StreamProcessor[KafkaPayload]:
    cluster_name = settings.KAFKA_TOPICS[settings.KAFKA_REGION_TO_CONTROL]["cluster"]
    consumer = KafkaConsumer(
        get_kafka_consumer_cluster_options(
            cluster_name,
            override_params={
                "auto.offset.reset": auto_offset_reset,
                "enable.auto.commit": "false",
                "enable.auto.offset.store": "false",
                "group.id": group_id,
            },
        )
    )

    processor = StreamProcessor(
        consumer=consumer,
        topic=Topic(settings.KAFKA_REGION_TO_CONTROL),
        processor_factory=ProcessorFactory(
            lambda commit: BatchProcessingStrategy(
                commit,
                worker=RegionToControlConsumerWorker(),
                max_batch_size=max_batch_size,
                max_batch_time=max_batch_time,
            )
        ),
    )

    def handler(*args) -> None:
        processor.signal_shutdown()

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)

    return processor


class RegionToControlConsumerWorker(AbstractBatchWorker[KafkaPayload, RegionToControlMessage]):
    def process_message(self, message: Message[KafkaPayload]) -> RegionToControlMessage:
        raw = json.loads(message.payload.value.decode("utf8"))
        return RegionToControlMessage.from_payload(raw)

    def flush_batch(self, batch: Sequence[RegionToControlMessage]):
        with metrics.timer("region_to_control.consumer.flush_batch"):
            return self._flush_batch(batch)

    def _flush_batch(self, batch: Sequence[RegionToControlMessage]):
        for row in batch:
            if row.user_ip_event:
                updated, created = UserIP.objects.create_or_update(
                    values=dict(
                        user_id=row.user_ip_event.user_id,
                        ip_address=row.user_ip_event.ip_address,
                        last_seen=row.user_ip_event.last_seen,
                        country_code=row.user_ip_event.country_code,
                        region_code=row.user_ip_event.region_code,
                    )
                )

                if created:
                    metrics.incr("region_to_control.consumer.user_ip_event.created")
                elif updated:
                    metrics.incr("region_to_control.consumer.user_ip_event.updated", amount=updated)
                else:
                    # This happens when there is an integrity error adding the UserIP -- such as when user is deleted,
                    # or the ip address does not match the db validation.  This is expected and not an error condition
                    # in low quantities.
                    metrics.incr("region_to_control.consumer.user_ip_event.stale_event")


ProcessorT = TypeVar("ProcessorT", bound=ProcessingStrategy[KafkaPayload])
Commit = Callable[[Mapping[Partition, Position]], None]


class ProcessorFactory(ProcessingStrategyFactory[KafkaPayload], Generic[ProcessorT]):
    """
    Generic processor factory that defers to a callable.
    """

    constructor: Callable[[Commit], ProcessorT]

    def __init__(self, constructor: Callable[[Commit], ProcessorT]):
        self.constructor = constructor

    def create_with_partitions(
        self,
        commit: Commit,
        partitions: Mapping[Partition, int],
    ) -> ProcessingStrategy[KafkaPayload]:
        return self.constructor(commit)
