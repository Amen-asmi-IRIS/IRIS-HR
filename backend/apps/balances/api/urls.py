from django.urls import path

from . import views

app_name = "balances"

urlpatterns = [
    path("balances/<uuid:employee_public_id>", views.BalanceFiguresView.as_view(), name="figures"),
    path("balances/<uuid:employee_public_id>/ledger", views.LedgerView.as_view(), name="ledger"),
    path(
        "balances/<uuid:employee_public_id>/adjustments", views.AdjustmentView.as_view(), name="adjustments"
    ),
]
