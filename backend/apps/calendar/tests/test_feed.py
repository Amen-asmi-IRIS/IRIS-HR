from datetime import date, time

import pytest
import time_machine

from apps.calendar import services as calendar_services
from apps.calendar.feed import calendar_feed
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import selectors as org_selectors
from apps.requests import services as request_services
from tests.request_flows import NOW, approved, decide, send

pytestmark = pytest.mark.django_db

NOVEMBER = {"start": date(2026, 11, 1), "end": date(2026, 11, 30)}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def entries_of(feed, employee):
    return [entry for entry in feed.entries if entry.employee_public_id == str(employee.public_id)]


# --- department scope -------------------------------------------------------------------


def test_department_scope_shows_a_colleague_as_absent_and_nothing_else(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert entry.label == "absent"
    assert entry.employee_name == org_selectors.full_name(world.peer)
    assert (entry.start_date, entry.end_date) == (date(2026, 11, 2), date(2026, 11, 3))
    assert entry.type_code is None
    assert entry.type_name_fr is None and entry.type_name_en is None
    assert entry.status is None
    assert entry.request_public_id is None
    assert entry.mine is False


def test_department_scope_labels_remote_work_as_remote(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert entry.label == "remote"
    assert entry.type_code is None


def test_department_scope_hides_a_colleagues_pending_request(world):
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_hides_a_colleagues_hourly_permission(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.permission,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
        start_time=time(9, 0),
        end_time=time(11, 0),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_hides_an_hourly_type_whatever_its_calendar_label(world):
    # HR may give a type counted in hours the label "absent" (the default of a new type): it is
    # still an hourly permission, which colleagues never see (CAL-03, A9).
    world.permission.calendar_label = "absent"
    world.permission.save(update_fields=["calendar_label"])
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.permission,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
        start_time=time(9, 0),
        end_time=time(11, 0),
    )

    department = calendar_feed(world.owner_user, **NOVEMBER, scope="department")
    team = calendar_feed(world.manager_user, **NOVEMBER, scope="team")

    assert entries_of(department, world.peer) == []
    assert [entry.type_code for entry in entries_of(team, world.peer)] == ["permission"]


def test_department_scope_hides_refused_and_withdrawn_requests(world):
    refused = send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    decide(refused, "reject", "Too many people away")
    withdrawn = send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 17),
        end=date(2026, 11, 17),
    )
    request_services.withdraw(actor=world.peer_user, request=withdrawn)

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_shows_my_own_requests_in_full_including_pending(world):
    request = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.owner)
    assert entry.mine is True
    assert entry.type_code == "annual"
    assert entry.type_name_fr and entry.type_name_en
    assert entry.status == "pending"
    assert entry.request_public_id == str(request.public_id)


def test_department_scope_does_not_show_another_department(world):
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.outsider) == []


def test_department_scope_ignores_every_filter(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 5),
        end=date(2026, 11, 5),
    )

    plain = calendar_feed(world.owner_user, **NOVEMBER, scope="department")
    probed = calendar_feed(
        world.owner_user,
        **NOVEMBER,
        scope="department",
        type_code="sick",
        status="pending",
        employee_public_id=str(world.owner.public_id),
        department_id=world.dept_b.id,
    )

    assert probed == plain
    assert len(entries_of(probed, world.peer)) == 2


def test_department_scope_is_empty_for_an_account_without_employee_record(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )

    feed = calendar_feed(world.sysadmin_user, **NOVEMBER, scope="department")

    assert feed.entries == []


# --- team scope -------------------------------------------------------------------------


def test_team_scope_shows_types_and_pending_requests_of_the_team_only(world):
    pending = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    feed = calendar_feed(world.manager_user, **NOVEMBER, scope="team")

    [owner_entry] = entries_of(feed, world.owner)
    assert (owner_entry.type_code, owner_entry.status) == ("annual", "pending")
    assert owner_entry.request_public_id == str(pending.public_id)
    [peer_entry] = entries_of(feed, world.peer)
    assert (peer_entry.type_code, peer_entry.status, peer_entry.label) == ("sick", "approved", "absent")
    assert entries_of(feed, world.outsider) == []


def test_team_scope_filters_by_person_and_type(world):
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )

    by_person = calendar_feed(
        world.manager_user, **NOVEMBER, scope="team", employee_public_id=str(world.peer.public_id)
    )
    by_type = calendar_feed(world.manager_user, **NOVEMBER, scope="team", type_code="annual")

    assert {entry.employee_public_id for entry in by_person.entries} == {str(world.peer.public_id)}
    assert {entry.type_code for entry in by_type.entries} == {"annual"}


def test_team_scope_is_refused_to_someone_who_manages_nobody(world):
    with pytest.raises(NotAllowed) as raised:
        calendar_feed(world.owner_user, **NOVEMBER, scope="team")
    assert raised.value.code == "calendar.scope_not_allowed"


# --- company scope ----------------------------------------------------------------------


def test_company_scope_shows_everyone_with_types_to_hr_and_executives(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    for viewer in (world.hr_user, world.exec_user):
        feed = calendar_feed(viewer, **NOVEMBER, scope="company")
        assert {entry.type_code for entry in feed.entries} == {"sick", "annual"}
        assert len(entries_of(feed, world.peer)) == 1
        assert len(entries_of(feed, world.outsider)) == 1


def test_company_scope_filters_by_department_person_type_and_status(world):
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 17),
        end=date(2026, 11, 18),
    )

    def feed(**filters):
        return calendar_feed(world.hr_user, **NOVEMBER, scope="company", **filters)

    assert {e.employee_public_id for e in feed(department_id=world.dept_b.id).entries} == {
        str(world.outsider.public_id)
    }
    assert {e.employee_public_id for e in feed(employee_public_id=str(world.peer.public_id)).entries} == {
        str(world.peer.public_id)
    }
    assert {e.type_code for e in feed(type_code="remote").entries} == {"remote"}
    assert {e.status for e in feed(status="pending").entries} == {"pending"}
    assert {e.status for e in feed(status="approved").entries} == {"approved"}


def test_company_scope_is_refused_to_a_manager(world):
    with pytest.raises(NotAllowed) as raised:
        calendar_feed(world.manager_user, **NOVEMBER, scope="company")
    assert raised.value.code == "calendar.scope_not_allowed"


# --- holidays, half-days, window --------------------------------------------------------


def test_holidays_inside_the_window_are_returned_in_date_order(world):
    calendar_services.create_holiday(
        actor=world.hr_user,
        date=date(2026, 12, 17),
        name_fr="Fête de la Révolution",
        name_en="Revolution Day",
    )
    calendar_services.create_holiday(
        actor=world.hr_user, date=date(2026, 11, 20), name_fr="Jour férié", name_en="Public holiday"
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert [(h.date, h.name_fr, h.name_en) for h in feed.holidays] == [
        (date(2026, 11, 20), "Jour férié", "Public holiday"),
    ]


def test_half_day_flags_are_kept(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
        starts_at_midday=True,
    )

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert (entry.starts_at_midday, entry.ends_at_midday) == (True, False)


def test_entries_are_clipped_to_the_window(world):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 27),
        end=date(2026, 12, 2),
        starts_at_midday=True,
        ends_at_midday=True,
    )

    november = calendar_feed(world.owner_user, **NOVEMBER, scope="department")
    december = calendar_feed(
        world.owner_user, start=date(2026, 12, 1), end=date(2026, 12, 31), scope="department"
    )

    [first] = entries_of(november, world.peer)
    assert (first.start_date, first.end_date) == (date(2026, 11, 27), date(2026, 11, 30))
    assert (first.starts_at_midday, first.ends_at_midday) == (True, False)
    [second] = entries_of(december, world.peer)
    assert (second.start_date, second.end_date) == (date(2026, 12, 1), date(2026, 12, 2))
    assert (second.starts_at_midday, second.ends_at_midday) == (False, True)


@pytest.mark.parametrize(
    "start, end",
    [
        (date(2026, 11, 30), date(2026, 11, 1)),  # end before start
        (date(2026, 1, 1), date(2026, 12, 31)),  # a whole year
    ],
)
def test_an_invalid_window_is_refused(world, start, end):
    with pytest.raises(DomainError) as raised:
        calendar_feed(world.owner_user, start=start, end=end, scope="department")
    assert raised.value.code == "calendar.window_invalid"


def test_an_unknown_scope_is_refused(world):
    with pytest.raises(DomainError) as raised:
        calendar_feed(world.owner_user, **NOVEMBER, scope="everyone")
    assert raised.value.code == "calendar.scope_unknown"
