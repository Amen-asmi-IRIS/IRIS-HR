from datetime import UTC, date, datetime, timedelta

import pytest
import time_machine

from apps.accounts.tests.world import make_user
from apps.audit import selectors
from apps.audit import services as audit
from apps.core import context

pytestmark = pytest.mark.django_db


def test_events_for_object_returns_the_history_of_one_item():
    sami = make_user("sami@impactrisks.com")
    other = make_user("other@impactrisks.com")
    kept = audit.record(action="account.created", obj=sami, actor=None)
    audit.record(action="account.created", obj=other, actor=None)

    assert list(selectors.events_for_object("user", str(sami.public_id))) == [kept]


def test_count_recent_counts_one_action_from_one_address_in_a_window():
    now = datetime(2026, 10, 6, 9, 0, tzinfo=UTC)
    with time_machine.travel(now - timedelta(minutes=30), tick=False), context.overriding(ip="10.0.0.9"):
        audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)  # too old
    with time_machine.travel(now - timedelta(minutes=5), tick=False):
        with context.overriding(ip="10.0.0.9"):
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)
            audit.record(action="auth.login", category=audit.SECURITY, actor=None)  # other action
        with context.overriding(ip="10.0.0.10"):
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)  # other address

    count = selectors.count_recent(
        action="auth.login_failed", ip_address="10.0.0.9", since=now - timedelta(minutes=15)
    )

    assert count == 2


def test_list_events_filters_by_category_actor_action_item_and_period():
    hr = make_user("hr@impactrisks.com")
    admin = make_user("admin@impactrisks.com")
    sami = make_user("sami@impactrisks.com")
    with time_machine.travel(
        datetime(2026, 10, 1, 22, 30, tzinfo=UTC), tick=False
    ):  # 23:30 on 1 October in Tunis
        late = audit.record(action="employee.updated", obj=sami, actor=hr)
    with time_machine.travel(
        datetime(2026, 10, 1, 23, 30, tzinfo=UTC), tick=False
    ):  # 00:30 on 2 October in Tunis
        after_midnight = audit.record(action="employee.archived", obj=sami, actor=hr)
    with time_machine.travel(datetime(2026, 10, 5, 9, 0, tzinfo=UTC), tick=False):
        security = audit.record(action="role.assigned", category=audit.SECURITY, obj=sami, actor=admin)

    business = selectors.list_events(category=audit.BUSINESS)
    assert list(business) == [after_midnight, late]
    assert list(selectors.list_events(category=audit.SECURITY)) == [security]
    assert list(selectors.list_events(category=audit.BUSINESS, action="employee.archived")) == [
        after_midnight
    ]
    assert list(selectors.list_events(category=audit.BUSINESS, actor_public_id=admin.public_id)) == []
    assert list(selectors.list_events(category=audit.BUSINESS, actor_public_id=hr.public_id)) == [
        after_midnight,
        late,
    ]
    assert list(
        selectors.list_events(category=audit.BUSINESS, object_type="user", object_id=str(sami.public_id))
    ) == [after_midnight, late]
    assert list(selectors.list_events(category=audit.BUSINESS, object_type="request")) == []
    # days are days in Africa/Tunis
    assert list(selectors.list_events(category=audit.BUSINESS, date_to=date(2026, 10, 1))) == [late]
    assert list(selectors.list_events(category=audit.BUSINESS, date_from=date(2026, 10, 2))) == [
        after_midnight
    ]
    assert list(
        selectors.list_events(category=audit.BUSINESS, date_from=date(2026, 10, 1), date_to=date(2026, 10, 2))
    ) == [after_midnight, late]
