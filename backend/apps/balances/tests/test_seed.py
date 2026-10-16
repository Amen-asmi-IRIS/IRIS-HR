from datetime import date
from decimal import Decimal

import time_machine

from apps.balances import seed, selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at


def test_demo_data_gives_everyone_but_one_an_opening_balance_and_three_credits(cast, real_settings):
    cast.outsider.professional_email = seed.WITHOUT_OPENING
    cast.outsider.save(update_fields=["professional_email"])
    cast.peer.hire_date = date(2026, 8, 17)
    cast.peer.save(update_fields=["hire_date"])

    with time_machine.travel(at(2026, 10, 5), tick=False):
        seed.seed()
        lines_after_the_first_run = LedgerEntry.objects.count()
        seed.seed()

    assert services.credit_start_date() == date(2026, 7, 1)
    assert LedgerEntry.objects.count() == lines_after_the_first_run
    assert LedgerEntry.objects.get(employee=cast.owner, kind=LedgerKind.OPENING).effective_date == date(
        2026, 6, 30
    )
    assert selectors.has_opening(cast.outsider.id) is False
    # 12 days of opening balance, then the credits of July, August and September
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("19.5")
    assert selectors.balance_on(cast.outsider.id, date(2026, 10, 5)) == Decimal("7.5")
    # joined on 17 August, after the credits started: no opening balance, 15 of 31 days of August, then September
    assert selectors.has_opening(cast.peer.id) is False
    assert selectors.balance_on(cast.peer.id, date(2026, 10, 5)) == Decimal("3.5")
