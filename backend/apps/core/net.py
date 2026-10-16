"""Network facts about a request."""

import ipaddress


def _is_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def client_ip(request) -> str:
    """The caller's address. The reverse proxy sets X-Forwarded-For; without it, the socket address.

    Text that is not an address is never returned: sign-in looks failures up by this value.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    socket = (request.META.get("REMOTE_ADDR", "") or "").strip()
    return next((value for value in (forwarded, socket) if _is_address(value)), "")
