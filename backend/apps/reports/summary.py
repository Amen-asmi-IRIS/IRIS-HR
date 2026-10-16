"""How many things wait in each workspace, for the workspace switcher."""

from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from apps.accounts import selectors as account_selectors
from apps.accounts.roles import Role, roles_of
from apps.core import selectors as core_selectors
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests import selectors as request_selectors

HR_QUEUES = ("hr", "certificates", "stuck")
# The groups of the status page an administrator has to act on. Accounts that only wait for a
# first sign-in are not a problem yet.
ATTENTION_GROUPS = ("locked", "temp_expired", "employees_without_account")


def workspace_summary(user, *, now: datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    roles = roles_of(user)
    counts = {"me": 0, "team": 0, "hr": 0, "overview": 0, "admin": 0}

    me = reach.employee_of(user)
    if me is not None:
        returned = request_selectors.requests_for(user, "mine").filter(status="returned").count()
        certificates = len(request_selectors.outstanding_certificates(employee_ids=[me.id], now=now))
        counts["me"] = returned + certificates
        to_decide = request_selectors.queue(user, "mine").count()
        if Role.MANAGER in roles:
            counts["team"] = to_decide
        else:
            # No My team workspace: the step is reached from My space (the notification links to it).
            counts["me"] += to_decide

    if Role.HR in roles:
        steps: set[int] = set()
        for name in HR_QUEUES:
            steps.update(request_selectors.queue(user, name).values_list("pk", flat=True))
        changes = org_selectors.profile_changes_for(user, scope="all", status="pending").count()
        counts["hr"] = len(steps) + changes

    if Role.SYSADMIN in roles:
        attention = account_selectors.accounts_needing_attention(now=now)
        failed_jobs = sum(1 for row in core_selectors.job_rows(now=now) if row["last_ok"] is False)
        counts["admin"] = sum(len(attention[group]) for group in ATTENTION_GROUPS) + failed_jobs

    return counts
