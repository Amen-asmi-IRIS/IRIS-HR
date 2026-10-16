from django.http import HttpResponse
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED

from .. import selectors, services


class AttachmentDownloadView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="attachments_download",
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
    )
    def get(self, request, public_id):
        attachment = selectors.get_attachment(public_id)
        content, name, content_type = services.read_for_download(user=request.user, attachment=attachment)
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = content_disposition_header(True, name)
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "sandbox; default-src 'none'"
        response["Cache-Control"] = "private, no-store"
        return response
