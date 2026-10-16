from django.urls import path

from . import views

app_name = "files"

urlpatterns = [
    path("attachments/<uuid:public_id>/download", views.AttachmentDownloadView.as_view(), name="download"),
]
