"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.core.api.urls")),
    path("", include("apps.accounts.api.urls")),
    path("", include("apps.audit.api.urls")),
    path("", include("apps.settings.api.urls")),
    path("", include("apps.notifications.api.urls")),
    path("", include("apps.files.api.urls")),
    path("", include("apps.organisation.api.urls")),
    path("", include("apps.calendar.api.urls")),
    path("", include("apps.requests.api.urls")),
    path("", include("apps.balances.api.urls")),
    path("", include("apps.reports.api.urls")),
]
