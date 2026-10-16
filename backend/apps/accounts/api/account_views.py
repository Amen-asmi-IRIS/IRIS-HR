from django.db.models import F
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import selectors, services
from apps.accounts.api.account_serializers import (
    AccountCreatedOut,
    AccountCreateIn,
    AccountDetailOut,
    AccountFilterIn,
    AccountOut,
    CandidateOut,
    RoleIn,
    TemporaryPasswordOut,
)
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role
from apps.core.errors import NotFound
from apps.core.ordering import apply_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

READERS = {Role.SYSADMIN, Role.EXEC}
ADMINISTRATOR = {Role.SYSADMIN}

ACCOUNT_ORDERINGS = {
    "email": ("email",),
    "-email": ("-email",),
    # The name shown in the list: the employee's current one, not the copy kept on the account.
    "name": ("sort_name", "email"),
    "-name": ("-sort_name", "-email"),
    # Accounts that never signed in come last when the newest sign-in is asked first.
    "last_login_at": (F("last_login_at").asc(nulls_first=True), "email"),
    "-last_login_at": (F("last_login_at").desc(nulls_last=True), "email"),
}


def _detail(user) -> Response:
    return Response(AccountDetailOut(user).data)


class AccountListView(APIView):
    access = {"GET": READERS, "POST": ADMINISTRATOR}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="accounts_list",
        parameters=[AccountFilterIn, ordering_parameter(ACCOUNT_ORDERINGS, "email"), *PAGE_PARAMETERS],
        responses=paginated(AccountOut),
    )
    def get(self, request):
        filters = AccountFilterIn(data=request.query_params)
        filters.is_valid(raise_exception=True)
        found = apply_ordering(
            request, selectors.accounts(**filters.validated_data), ACCOUNT_ORDERINGS, "email"
        )
        return paginate(request, self, found, AccountOut)

    @extend_schema(
        operation_id="accounts_create", request=AccountCreateIn, responses={201: AccountCreatedOut}
    )
    def post(self, request):
        data = AccountCreateIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        employee = values.get("employee")
        user, temporary = services.create_account(
            actor=request.user,
            email=values.get("email", ""),
            full_name=values.get("full_name", ""),
            employee_public_id=str(employee) if employee else None,
            roles=values.get("roles", []),
        )
        created = {
            "account": user,
            "temporary_password": temporary,
            "expires_at": user.temp_password_expires_at,
        }
        return Response(AccountCreatedOut(created).data, status=201)


class AccountCandidatesView(APIView):
    """Employees who have no account yet (empty until plan 02 provides the employee directory)."""

    access = {"GET": ADMINISTRATOR}
    http_method_names = ["get"]

    @extend_schema(operation_id="accounts_candidates", responses=CandidateOut(many=True))
    def get(self, request):
        return Response(CandidateOut(employee_directory().candidates(), many=True).data)


class AccountDetailView(APIView):
    access = {"GET": READERS}
    http_method_names = ["get"]

    @extend_schema(operation_id="accounts_detail", responses=AccountDetailOut)
    def get(self, request, public_id):
        return _detail(selectors.get_account(public_id))


class AccountResetPasswordView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_reset_password", request=None, responses=TemporaryPasswordOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        temporary = services.reset_password(actor=request.user, user=user)
        issued = {"temporary_password": temporary, "expires_at": user.temp_password_expires_at}
        return Response(TemporaryPasswordOut(issued).data)


class AccountRolesView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_role_add", request=RoleIn, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        data = RoleIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.assign_role(actor=request.user, user=user, role=data.validated_data["role"])
        return _detail(user)


class AccountRoleView(APIView):
    access = {"DELETE": ADMINISTRATOR}
    http_method_names = ["delete"]

    @extend_schema(operation_id="accounts_role_remove", responses={200: AccountDetailOut})
    def delete(self, request, public_id, role: str):
        user = selectors.get_account(public_id)
        try:
            wanted = Role(role)
        except ValueError:
            raise NotFound() from None
        if wanted not in ASSIGNABLE:
            raise NotFound()
        services.remove_role(actor=request.user, user=user, role=wanted)
        return _detail(user)


class AccountDisableView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_disable", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.disable_account(actor=request.user, user=user)
        return _detail(user)


class AccountEnableView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_enable", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.enable_account(actor=request.user, user=user)
        return _detail(user)


class AccountUnlockView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_unlock", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.unlock_account(actor=request.user, user=user)
        return _detail(user)
