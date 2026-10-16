from django.urls import path

from . import views

app_name = "organisation"

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path("departments/<int:id>", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("positions", views.PositionListView.as_view(), name="position-list"),
    path("positions/<int:id>", views.PositionDetailView.as_view(), name="position-detail"),
    path("employees", views.EmployeeListView.as_view(), name="employee-list"),
    path("employees/directory", views.EmployeeDirectoryView.as_view(), name="employee-directory"),
    path("employees/me", views.EmployeeMeView.as_view(), name="employee-me"),
    path("employees/<uuid:public_id>", views.EmployeeDetailView.as_view(), name="employee-detail"),
    path(
        "employees/<uuid:public_id>/archive-preview",
        views.EmployeeArchivePreviewView.as_view(),
        name="employee-archive-preview",
    ),
    path("employees/<uuid:public_id>/archive", views.EmployeeArchiveView.as_view(), name="employee-archive"),
    path(
        "employees/<uuid:public_id>/documents",
        views.EmployeeDocumentsView.as_view(),
        name="employee-documents",
    ),
    path(
        "employees/<uuid:public_id>/documents/<int:id>",
        views.EmployeeDocumentView.as_view(),
        name="employee-document",
    ),
    path(
        "employees/<uuid:public_id>/history",
        views.EmployeeHistoryView.as_view(),
        name="employee-history",
    ),
    path("profile-changes", views.ProfileChangeListView.as_view(), name="profile-change-list"),
    path(
        "profile-changes/<uuid:public_id>",
        views.ProfileChangeDetailView.as_view(),
        name="profile-change-detail",
    ),
    path(
        "profile-changes/<uuid:public_id>/decide",
        views.ProfileChangeDecideView.as_view(),
        name="profile-change-decide",
    ),
    path(
        "profile-changes/<uuid:public_id>/withdraw",
        views.ProfileChangeWithdrawView.as_view(),
        name="profile-change-withdraw",
    ),
]
