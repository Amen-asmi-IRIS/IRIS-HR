from django.urls import path

from . import views

app_name = "requests"

urlpatterns = [
    path("request-types", views.TypeListView.as_view(), name="type-list"),
    path("request-types/<int:pk>", views.TypeDetailView.as_view(), name="type-detail"),
    path("request-types/<int:pk>/steps", views.TypeStepsView.as_view(), name="type-steps"),
    path(
        "request-types/<int:pk>/chain-preview",
        views.TypeChainPreviewView.as_view(),
        name="type-chain-preview",
    ),
    path("exceptional-events", views.EventListView.as_view(), name="event-list"),
    path("exceptional-events/<int:pk>", views.EventDetailView.as_view(), name="event-detail"),
    path("requests", views.RequestListView.as_view(), name="request-list"),
    path("requests/preview", views.RequestPreviewView.as_view(), name="request-preview"),
    path("requests/<uuid:public_id>", views.RequestDetailView.as_view(), name="request-detail"),
    path("requests/<uuid:public_id>/history", views.RequestHistoryView.as_view(), name="request-history"),
    path("requests/<uuid:public_id>/submit", views.RequestSubmitView.as_view(), name="request-submit"),
    path("requests/<uuid:public_id>/withdraw", views.RequestWithdrawView.as_view(), name="request-withdraw"),
    path(
        "requests/<uuid:public_id>/attachments",
        views.RequestAttachmentsView.as_view(),
        name="request-attachments",
    ),
    path(
        "requests/<uuid:public_id>/amendments",
        views.RequestAmendmentsView.as_view(),
        name="request-amendments",
    ),
    path("requests/<uuid:public_id>/correct", views.RequestCorrectView.as_view(), name="request-correct"),
    path("requests/<uuid:public_id>/cancel", views.RequestCancelView.as_view(), name="request-cancel"),
    path(
        "requests/<uuid:public_id>/reclassify",
        views.RequestReclassifyView.as_view(),
        name="request-reclassify",
    ),
    path(
        "amendments/<uuid:public_id>/withdraw",
        views.AmendmentWithdrawView.as_view(),
        name="amendment-withdraw",
    ),
    path("approvals", views.ApprovalListView.as_view(), name="approval-list"),
    path("steps/<int:pk>/decide", views.StepDecideView.as_view(), name="step-decide"),
    path(
        "steps/<int:pk>/record-on-behalf",
        views.StepRecordOnBehalfView.as_view(),
        name="step-record-on-behalf",
    ),
    path("steps/<int:pk>/reassign", views.StepReassignView.as_view(), name="step-reassign"),
]
