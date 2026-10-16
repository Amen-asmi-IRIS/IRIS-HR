from tests.matrix import SIGNED_IN, Case, P, only

NOT_THE_OWNER = [persona for persona in SIGNED_IN if persona is not P.OWNER]

CASES = [
    Case("notifications:list", "GET", only(*SIGNED_IN)),
    Case("notifications:unread-count", "GET", only(*SIGNED_IN)),
    Case("notifications:read-all", "POST", only(*SIGNED_IN)),
    # A notification belongs to one user: to everyone else it does not exist.
    Case(
        "notifications:read",
        "POST",
        only(P.OWNER, hide=NOT_THE_OWNER),
        kwargs=lambda world: {"pk": world.owner_notification.pk},
    ),
]
