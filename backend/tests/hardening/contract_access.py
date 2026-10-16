"""The access contract of the master plan (sections 7.1 to 7.11) as data.

Key: (route name, method). Value: the roles allowed, or {"auth"} / {"public"}.
"""

from __future__ import annotations

E, M, H, X, S = "employee", "manager", "hr", "exec", "sysadmin"
AUTH = frozenset({"auth"})
PUBLIC = frozenset({"public"})


def roles(*names: str) -> frozenset[str]:
    return frozenset(names)


EXPECTED: dict[tuple[str, str], frozenset[str]] = {
    # 7.1 core
    ("core:health", "GET"): PUBLIC,
    ("core:admin-status", "GET"): roles(S, X),
    # 7.2 accounts
    ("accounts:csrf", "GET"): PUBLIC,
    ("accounts:login", "POST"): PUBLIC,
    ("accounts:logout", "POST"): AUTH,
    ("accounts:me", "GET"): AUTH,
    ("accounts:me", "PATCH"): AUTH,
    ("accounts:password", "POST"): AUTH,
    ("accounts:account-list", "GET"): roles(S, X),
    ("accounts:account-list", "POST"): roles(S),
    ("accounts:account-candidates", "GET"): roles(S),
    ("accounts:account-detail", "GET"): roles(S, X),
    ("accounts:account-reset-password", "POST"): roles(S),
    ("accounts:account-roles", "POST"): roles(S),
    ("accounts:account-role", "DELETE"): roles(S),
    ("accounts:account-disable", "POST"): roles(S),
    ("accounts:account-enable", "POST"): roles(S),
    ("accounts:account-unlock", "POST"): roles(S),
    # 7.3 audit
    ("audit:business", "GET"): roles(H, X),
    ("audit:security", "GET"): roles(S, X),
    ("audit:business-export", "GET"): roles(H, X),
    ("audit:security-export", "GET"): roles(S, X),
    # 7.4 settings
    ("settings:hr", "GET"): roles(H, X),
    ("settings:hr-item", "PUT"): roles(H),
    ("settings:system", "GET"): roles(S, X),
    ("settings:system-item", "PUT"): roles(S),
    # 7.5 notifications
    ("notifications:list", "GET"): AUTH,
    ("notifications:unread-count", "GET"): AUTH,
    ("notifications:read", "POST"): AUTH,
    ("notifications:read-all", "POST"): AUTH,
    # 7.6 files
    ("files:download", "GET"): AUTH,
    # 7.7 organisation
    ("organisation:department-list", "GET"): roles(H, X),
    ("organisation:department-list", "POST"): roles(H),
    ("organisation:department-detail", "PATCH"): roles(H),
    ("organisation:position-list", "GET"): roles(H, X),
    ("organisation:position-list", "POST"): roles(H),
    ("organisation:position-detail", "PATCH"): roles(H),
    ("organisation:employee-list", "GET"): roles(M, H, X),
    ("organisation:employee-list", "POST"): roles(H),
    ("organisation:employee-directory", "GET"): roles(M, H, X),
    ("organisation:employee-me", "GET"): roles(E),
    ("organisation:employee-detail", "GET"): roles(E, H, X),
    ("organisation:employee-detail", "PATCH"): roles(H),
    ("organisation:employee-archive-preview", "GET"): roles(H),
    ("organisation:employee-archive", "POST"): roles(H),
    ("organisation:employee-documents", "GET"): roles(E, H, X),
    ("organisation:employee-documents", "POST"): roles(H),
    ("organisation:employee-document", "PATCH"): roles(H),
    ("organisation:employee-history", "GET"): roles(H, X),
    ("organisation:profile-change-list", "GET"): roles(E, H),
    ("organisation:profile-change-list", "POST"): roles(E),
    ("organisation:profile-change-detail", "GET"): roles(E, H),
    ("organisation:profile-change-decide", "POST"): roles(H),
    ("organisation:profile-change-withdraw", "POST"): roles(E),
    ("organisation:delegation-list", "GET"): roles(M, H),
    ("organisation:delegation-list", "POST"): roles(M, H),
    ("organisation:delegation-end", "POST"): roles(M, H),
    # 7.8 calendar
    ("calendar:holiday-list", "GET"): roles(E, H, X),
    ("calendar:holiday-list", "POST"): roles(H),
    ("calendar:holiday-detail", "PATCH"): roles(H),
    ("calendar:holiday-detail", "DELETE"): roles(H),
    ("calendar:holiday-copy", "POST"): roles(H),
    ("calendar:holiday-impact", "GET"): roles(H),
    ("calendar:feed", "GET"): roles(E, H, X),
    # 7.9 requests
    ("requests:type-list", "GET"): roles(E, H, X),
    ("requests:type-list", "POST"): roles(H),
    ("requests:type-detail", "GET"): roles(H, X),
    ("requests:type-detail", "PATCH"): roles(H),
    ("requests:type-steps", "GET"): roles(H, X),
    ("requests:type-steps", "PUT"): roles(H),
    ("requests:type-chain-preview", "GET"): roles(H),
    ("requests:event-list", "GET"): roles(E, H, X),
    ("requests:event-list", "POST"): roles(H),
    ("requests:event-detail", "PATCH"): roles(H),
    ("requests:request-list", "GET"): roles(E, H, X),
    ("requests:request-list", "POST"): roles(E, H),
    ("requests:request-preview", "POST"): roles(E, H),
    ("requests:request-detail", "GET"): roles(E, H, X),
    ("requests:request-detail", "PATCH"): roles(E, H),
    ("requests:request-detail", "DELETE"): roles(E, H),
    ("requests:request-submit", "POST"): roles(E, H),
    ("requests:request-withdraw", "POST"): roles(E),
    ("requests:request-attachments", "GET"): roles(E, H, X),
    ("requests:request-attachments", "POST"): roles(E, H),
    ("requests:request-amendments", "GET"): roles(E, H, X),
    ("requests:request-amendments", "POST"): roles(E),
    ("requests:amendment-withdraw", "POST"): roles(E),
    ("requests:request-correct", "POST"): roles(H),
    ("requests:request-cancel", "POST"): roles(H),
    ("requests:request-reclassify", "POST"): roles(H),
    ("requests:request-history", "GET"): roles(E, H, X),
    ("requests:approval-list", "GET"): roles(E, H, X),
    ("requests:step-decide", "POST"): roles(E, H, X),
    ("requests:step-record-on-behalf", "POST"): roles(H),
    ("requests:step-reassign", "POST"): roles(H),
    # 7.10 balances
    ("balances:figures", "GET"): roles(E, H, X),
    ("balances:ledger", "GET"): roles(E, H, X),
    ("balances:adjustments", "POST"): roles(H),
    # 7.11 reports
    ("reports:home-me", "GET"): roles(E),
    ("reports:home-team", "GET"): roles(M),
    ("reports:home-overview", "GET"): roles(X),
    ("reports:workspace-summary", "GET"): AUTH,
    ("reports:report-filters", "GET"): roles(M, H, X),  # added by plan 06 (its contract note 1)
    ("reports:report", "GET"): roles(M, H, X),
    ("reports:kpmg-export", "GET"): roles(H),
    ("reports:kpmg-default-period", "GET"): roles(H),
}

# Routes the System Administrator may call. Everything else is business data.
SYSADMIN_MAY_CALL = frozenset(
    key for key, allowed in EXPECTED.items() if S in allowed or allowed in (AUTH, PUBLIC)
)
