from django.urls import path

from apps.audit.api import views

app_name = "audit"

urlpatterns = [
    path("audit/business", views.BusinessAuditView.as_view(), name="business"),
    path("audit/security", views.SecurityAuditView.as_view(), name="security"),
    path("audit/business/export", views.BusinessAuditExportView.as_view(), name="business-export"),
    path("audit/security/export", views.SecurityAuditExportView.as_view(), name="security-export"),
]
