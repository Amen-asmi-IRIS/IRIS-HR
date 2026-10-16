from django.urls import path

from apps.reports.api import report_views, views

app_name = "reports"

urlpatterns = [
    path("home/me", views.MeHomeView.as_view(), name="home-me"),
    path("home/team", views.TeamHomeView.as_view(), name="home-team"),
    path("home/overview", views.OverviewHomeView.as_view(), name="home-overview"),
    path("workspaces/summary", views.WorkspaceSummaryView.as_view(), name="workspace-summary"),
    path("report-filters", report_views.ReportFiltersView.as_view(), name="report-filters"),
    path("reports/<str:name>", report_views.ReportView.as_view(), name="report"),
    path("exports/kpmg", report_views.KpmgExportView.as_view(), name="kpmg-export"),
    path(
        "exports/kpmg/default-period",
        report_views.KpmgDefaultPeriodView.as_view(),
        name="kpmg-default-period",
    ),
]
