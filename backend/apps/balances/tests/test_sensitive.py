"""Nothing written about a sick leave reaches the ledger, which managers and executives read (master D46, 10.9)."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests import flows
from apps.balances.tests.world import at, give_opening
from apps.requests import services as request_services
from apps.requests.services import RequestData

pytestmark = pytest.mark.usefixtures("ledger_port")

SECRETS = ("zz-secret-grippe", "zz-secret-correction", "zz-secret-annulation")


@pytest.fixture(autouse=True)
def monday_5_october_2026(time_machine):
    time_machine.move_to(at(2026, 10, 5), tick=False)


def test_a_sick_leave_counted_as_annual_leave_leaves_no_reason_in_the_ledger(
    cast, ledger_settings, client_for
):
    ledger_settings()
    give_opening(cast.owner, "10", date(2026, 9, 30))
    request = flows.send(
        cast, date(2026, 10, 5), date(2026, 10, 7), request_type=cast.sick, comment="ZZ-SECRET-GRIPPE sévère"
    )
    request = flows.let_hr_finish(
        cast, request_services.reclassify_as_annual(actor=cast.hr_user, request=request)
    )
    assert (request.status, request.sensitive) == ("approved", True)

    request_services.hr_correct(
        actor=cast.hr_user,
        request=request,
        data=RequestData(start_date=date(2026, 10, 5), end_date=date(2026, 10, 6)),
        reason="ZZ-SECRET-CORRECTION : sortie anticipée",
    )
    request.refresh_from_db()
    request_services.hr_cancel(actor=cast.hr_user, request=request, reason="ZZ-SECRET-ANNULATION : doublon")

    restored = LedgerEntry.objects.filter(employee=cast.owner, kind=LedgerKind.RESTORED)
    assert [(line.amount, line.reason) for line in restored] == [(Decimal("1"), ""), (Decimal("2"), "")]
    url = reverse("balances:ledger", kwargs={"employee_public_id": cast.owner.public_id})
    for user in (cast.manager_user, cast.exec_user, cast.hr_user):
        body = client_for(user).get(url).content.decode().lower()
        for secret in SECRETS:
            assert secret not in body, f"{secret} reached {user.email}"
