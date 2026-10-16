from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED
from apps.core.ordering import apply_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated
from apps.notifications import services
from apps.notifications.api.serializers import NotificationOut, UnreadCountOut

NOTIFICATION_ORDERINGS = {"-created_at": ("-created_at", "-id"), "created_at": ("created_at", "id")}


class NotificationListView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="notifications_list",
        parameters=[
            OpenApiParameter("unread", bool, description="Send 1 to list unread notifications only."),
            ordering_parameter(NOTIFICATION_ORDERINGS, "-created_at"),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(NotificationOut),
    )
    def get(self, request):
        unread_only = request.query_params.get("unread", "").lower() in ("1", "true")
        notifications = services.for_user(request.user, unread_only=unread_only)
        notifications = apply_ordering(request, notifications, NOTIFICATION_ORDERINGS, "-created_at")
        return paginate(request, self, notifications, NotificationOut)


class UnreadCountView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]
    background = True  # the header asks every minute: that is not the person's activity (ACC-04)

    @extend_schema(operation_id="notifications_unread_count", responses=UnreadCountOut)
    def get(self, request):
        return Response(UnreadCountOut({"count": services.unread_count(request.user)}).data)


class NotificationReadView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="notifications_read", request=None, responses={204: None})
    def post(self, request, pk: int):
        services.mark_read(user=request.user, notification_id=pk)
        return Response(status=204)


class NotificationReadAllView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="notifications_read_all", request=None, responses={204: None})
    def post(self, request):
        services.mark_all_read(user=request.user)
        return Response(status=204)
