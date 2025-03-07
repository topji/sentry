from django.db.models import Q
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import features
from sentry.api.base import EnvironmentMixin, region_silo_endpoint
from sentry.api.bases.group import GroupEndpoint
from sentry.api.paginator import DateTimePaginator
from sentry.api.serializers import EventAttachmentSerializer, serialize
from sentry.models import EventAttachment


class GroupEventAttachmentSerializer(EventAttachmentSerializer):
    """
    Serializes event attachments with event id for rendering in the group event
    attachments UI.
    """

    def serialize(self, obj, attrs, user):
        result = super().serialize(obj, attrs, user)
        result["event_id"] = obj.event_id
        return result


@region_silo_endpoint
class GroupAttachmentsEndpoint(GroupEndpoint, EnvironmentMixin):
    def get(self, request: Request, group) -> Response:
        """
        List Event Attachments
        ``````````````````````

        Returns a list of event attachments for an issue.

        :pparam string issue_id: the ID of the issue to retrieve.
        :pparam list   types:    a list of attachment types to filter for.
        :auth: required
        """

        if not features.has(
            "organizations:event-attachments", group.project.organization, actor=request.user
        ):
            return self.respond(status=404)

        attachments = EventAttachment.objects.filter(group_id=group.id)

        types = request.GET.getlist("types") or ()
        event_ids = request.GET.getlist("event_id") or ()
        screenshot = "screenshot" in request.GET

        if screenshot:
            # TODO: Consolidate this with the EventAttachment endpoint logic
            attachments = attachments.filter(Q(name="screenshot.jpg") | Q(name="screenshot.png"))
        if types:
            attachments = attachments.filter(type__in=types)
        if event_ids:
            attachments = attachments.filter(event_id__in=event_ids)

        return self.paginate(
            default_per_page=20,
            request=request,
            queryset=attachments,
            order_by="-date_added",
            on_results=lambda x: serialize(x, request.user, GroupEventAttachmentSerializer()),
            paginator_cls=DateTimePaginator,
        )
