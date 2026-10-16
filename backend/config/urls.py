from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("config.api_urls")),
]

handler404 = "apps.core.api.problems.not_found_view"
handler500 = "apps.core.api.problems.server_error_view"
