from django.db.models import Q
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import eventstore, features
from sentry.api.base import region_silo_endpoint
from sentry.api.bases.project import ProjectEndpoint
from sentry.api.paginator import OffsetPaginator
from sentry.api.serializers import serialize
from sentry.models import EventAttachment
from sentry.search.utils import tokenize_query


@region_silo_endpoint
class EventAttachmentsEndpoint(ProjectEndpoint):
    def get(self, request: Request, project, event_id) -> Response:
        """
        Retrieve attachments for an event
        `````````````````````````````````

        :pparam string organization_slug: the slug of the organization the
                                          issues belong to.
        :pparam string project_slug: the slug of the project the event
                                     belongs to.
        :pparam string event_id: the id of the event.
        :auth: required
        """
        if not features.has(
            "organizations:event-attachments", project.organization, actor=request.user
        ):
            return self.respond(status=404)

        event = eventstore.get_event_by_id(project.id, event_id)
        if event is None:
            return self.respond({"detail": "Event not found"}, status=404)

        queryset = EventAttachment.objects.filter(project_id=project.id, event_id=event.event_id)

        query = request.GET.get("query")
        if query:
            tokens = tokenize_query(query)
            for key, value in tokens.items():
                if key == "query":
                    value = " ".join(value)
                    queryset = queryset.filter(name__icontains=value)
                elif key == "is":
                    value = " ".join(value)
                    if value in ["screenshot"]:
                        queryset = queryset.filter(
                            Q(name="screenshot.jpg") | Q(name="screenshot.png")
                        )
                else:
                    queryset = queryset.none()

        return self.paginate(
            request=request,
            queryset=queryset,
            order_by="name",
            on_results=lambda x: serialize(x, request.user),
            paginator_cls=OffsetPaginator,
        )
