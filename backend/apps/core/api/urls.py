from django.urls import path

from apps.core.api import views

app_name = "core"

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
    path("admin/status", views.StatusView.as_view(), name="admin-status"),
]
