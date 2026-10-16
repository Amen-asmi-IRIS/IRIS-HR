from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.ordering import chosen_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated
from apps.organisation import selectors as organisation_selectors

from .. import selectors, services
from . import serializers as s

# Own balance for an employee, the team's for a manager (who is an employee too), everyone's for HR and
# executives; `get_employee_for` answers 404 outside that reach. A System Administrator reads none.
READERS = {Role.EMPLOYEE, Role.HR, Role.EXEC}
# The ledger is read newest first; oldest first on request. The running balance is the same either way.
LEDGER_ORDERINGS = {"-date": (), "date": ()}


class BalanceFiguresView(APIView):
    access = {"GET": READERS}
    http_method_names = ["get"]

    @extend_schema(operation_id="balances_figures", parameters=[s.BalanceQuery], responses=s.BalanceOut)
    def get(self, request, employee_public_id):
        employee = organisation_selectors.get_employee_for(request.user, employee_public_id)
        query = s.BalanceQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        on = query.validated_data.get("on")
        figures = selectors.figures(employee.id)
        payload = {
            "employee": {"public_id": employee.public_id, "name": organisation_selectors.full_name(employee)},
            "current": figures.current,
            "pending": figures.pending,
            "approved_upcoming": figures.approved_upcoming,
            "next_credit_amount": figures.next_credit_amount,
            "next_credit_date": figures.next_credit_date,
            "has_opening": selectors.has_opening(employee.id),
            "opening_date": services.opening_date(),
            "can_enter_opening": selectors.can_enter_opening(employee),
            "as_of": selectors.as_of(employee.id, on) if on is not None else None,
        }
        return Response(s.BalanceOut(payload).data)


class LedgerView(APIView):
    access = {"GET": READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="balances_ledger",
        parameters=[ordering_parameter(LEDGER_ORDERINGS, "-date"), *PAGE_PARAMETERS],
        responses=paginated(s.LedgerLineOut),
    )
    def get(self, request, employee_public_id):
        employee = organisation_selectors.get_employee_for(request.user, employee_public_id)
        # Each line with the balance after it; the page shows it newest first (master D41).
        lines = selectors.ledger_lines(employee.id)
        if chosen_ordering(request, LEDGER_ORDERINGS, "-date") == "-date":
            lines = list(reversed(lines))
        return paginate(request, self, lines, s.LedgerLineOut)


class AdjustmentView(APIView):
    access = {"POST": {Role.HR}}
    http_method_names = ["post"]

    @extend_schema(operation_id="balances_adjust", request=s.AdjustmentIn, responses={201: s.LedgerLineOut})
    def post(self, request, employee_public_id):
        employee = organisation_selectors.get_employee_for(request.user, employee_public_id)
        data = s.AdjustmentIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        post = services.post_opening if values.pop("kind") == "opening" else services.adjust
        entry = post(actor=request.user, employee=employee, **values)
        return Response(
            s.LedgerLineOut(selectors.ledger_line(employee.id, entry.id)).data, status=status.HTTP_201_CREATED
        )
