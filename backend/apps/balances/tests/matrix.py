from tests.matrix import Case, P, only

READERS = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER])


def _owner(world) -> dict:
    return {"employee_public_id": world.owner.public_id}


def _adjustment(world) -> dict:
    return {
        "kind": "adjustment",
        "amount": "1.00",
        "effective_date": "2026-07-15",
        "reason": "Permission matrix",
    }


CASES = [
    Case(route="balances:figures", method="GET", expect=READERS, kwargs=_owner, label="the owner's balance"),
    Case(route="balances:ledger", method="GET", expect=READERS, kwargs=_owner, label="the owner's ledger"),
    Case(
        route="balances:adjustments",
        method="POST",
        expect=only(P.HR),
        kwargs=_owner,
        body=_adjustment,
        label="adjusting the owner's balance",
    ),
]
