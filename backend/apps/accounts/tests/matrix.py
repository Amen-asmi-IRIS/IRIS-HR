from tests.matrix import EVERYONE, SIGNED_IN, Case, P, only


def owner(world) -> dict:
    return {"public_id": world.owner_user.public_id}


ADMIN_ONLY = only(P.SYSADMIN)

CASES = [
    # session
    Case("accounts:csrf", "GET", only(*EVERYONE)),
    Case(
        "accounts:login",
        "POST",
        only(*EVERYONE),
        body=lambda world: {"email": "nobody@impactrisks.com", "password": "not-a-real-password"},
    ),
    Case("accounts:logout", "POST", only(*SIGNED_IN)),
    Case("accounts:me", "GET", only(*SIGNED_IN)),
    Case("accounts:me", "PATCH", only(*SIGNED_IN), body=lambda world: {"language": "en"}),
    Case(
        "accounts:password",
        "POST",
        only(*SIGNED_IN),
        body=lambda world: {"current_password": "not-the-password", "new_password": "Another-Horse-43!"},
    ),
    # account administration: the System Administrator acts, Executive Management reads (PRD section 7)
    Case("accounts:account-list", "GET", only(P.SYSADMIN, P.EXEC)),
    Case(
        "accounts:account-list",
        "POST",
        ADMIN_ONLY,
        body=lambda world: {"email": "new.person@impactrisks.com", "full_name": "New Person", "roles": []},
    ),
    Case("accounts:account-candidates", "GET", ADMIN_ONLY),
    Case("accounts:account-detail", "GET", only(P.SYSADMIN, P.EXEC), kwargs=owner),
    Case("accounts:account-reset-password", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-roles", "POST", ADMIN_ONLY, kwargs=owner, body=lambda world: {"role": "exec"}),
    Case(
        "accounts:account-role",
        "DELETE",
        ADMIN_ONLY,
        kwargs=lambda world: {"public_id": world.exec_user.public_id, "role": "exec"},
    ),
    Case("accounts:account-disable", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-enable", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-unlock", "POST", ADMIN_ONLY, kwargs=owner),
]
