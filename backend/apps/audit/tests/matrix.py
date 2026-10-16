from tests.matrix import Case, P, only

BUSINESS_READERS = only(P.HR, P.EXEC)
SECURITY_READERS = only(P.SYSADMIN, P.EXEC)

CASES = [
    Case("audit:business", "GET", BUSINESS_READERS),
    Case("audit:business-export", "GET", BUSINESS_READERS),
    Case("audit:security", "GET", SECURITY_READERS),
    Case("audit:security-export", "GET", SECURITY_READERS),
]
