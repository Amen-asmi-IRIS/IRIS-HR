from tests.matrix import EVERYONE, Case, P, only

CASES = [
    Case("core:health", "GET", only(*EVERYONE)),
    Case("core:admin-status", "GET", only(P.SYSADMIN, P.EXEC)),
]
