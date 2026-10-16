from django.urls import path

from apps.accounts.api import account_views, session_views

app_name = "accounts"

urlpatterns = [
    path("auth/csrf", session_views.CsrfView.as_view(), name="csrf"),
    path("auth/login", session_views.LoginView.as_view(), name="login"),
    path("auth/logout", session_views.LogoutView.as_view(), name="logout"),
    path("auth/me", session_views.MeView.as_view(), name="me"),
    path("auth/password", session_views.PasswordView.as_view(), name="password"),
    path("accounts", account_views.AccountListView.as_view(), name="account-list"),
    path("accounts/candidates", account_views.AccountCandidatesView.as_view(), name="account-candidates"),
    path("accounts/<uuid:public_id>", account_views.AccountDetailView.as_view(), name="account-detail"),
    path(
        "accounts/<uuid:public_id>/reset-password",
        account_views.AccountResetPasswordView.as_view(),
        name="account-reset-password",
    ),
    path("accounts/<uuid:public_id>/roles", account_views.AccountRolesView.as_view(), name="account-roles"),
    path(
        "accounts/<uuid:public_id>/roles/<str:role>",
        account_views.AccountRoleView.as_view(),
        name="account-role",
    ),
    path(
        "accounts/<uuid:public_id>/disable",
        account_views.AccountDisableView.as_view(),
        name="account-disable",
    ),
    path(
        "accounts/<uuid:public_id>/enable", account_views.AccountEnableView.as_view(), name="account-enable"
    ),
    path(
        "accounts/<uuid:public_id>/unlock", account_views.AccountUnlockView.as_view(), name="account-unlock"
    ),
]
