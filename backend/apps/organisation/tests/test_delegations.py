from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts.roles import Role, roles_of
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotAllowed
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from apps.organisation import reach, selectors, services
from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db
User = get_user_model()

TUNIS = ZoneInfo("Africa/Tunis")
MONDAY = date(2026, 11, 2)
FRIDAY = date(2026, 11, 6)


def _at(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 9, 0, tzinfo=TUNIS)


@pytest.fixture(autouse=True)
def _it_is_monday_morning():
    with time_machine.travel(_at(MONDAY), tick=False):
        yield


def _delegate(world, *, actor=None, manager=None, delegate=None, start=MONDAY, end=FRIDAY):
    return services.create_delegation(
        actor=actor or world.manager_user,
        manager=manager or world.manager,
        delegate=delegate or world.other_manager,
        start_date=start,
        end_date=end,
    )


def _events(code):
    return Notification.objects.filter(event_code=code)


def test_a_manager_names_a_delegate_starting_today(world):
    delegation = _delegate(world)

    assert selectors.delegation_state(delegation) == "active"
    assert reach.acting_for(world.other_manager.id) == {world.other_manager.id, world.manager.id}
    assert reach.team_ids(world.other_manager_user) == {world.outsider.id, world.owner.id, world.peer.id}
    assert reach.can_see_employee(world.other_manager_user, world.owner) is True
    event = AuditEvent.objects.get(action="delegation.created")
    assert event.object_id == str(delegation.public_id)
    assert event.object_label == "Mounir Manager → Nadia Manager"
    assert {n.user for n in _events("delegation.started")} == {world.manager_user, world.other_manager_user}


def test_the_delegate_sees_the_team_only_during_the_period(world):
    _delegate(world)

    assert reach.team_ids(world.other_manager_user, on=FRIDAY) >= {world.owner.id, world.peer.id}
    assert reach.team_ids(world.other_manager_user, on=FRIDAY + timedelta(days=1)) == {world.outsider.id}
    assert reach.acting_for(world.other_manager.id, on=MONDAY - timedelta(days=1)) == {world.other_manager.id}


def test_someone_who_manages_nobody_becomes_a_manager_for_the_period(world):
    _delegate(world, delegate=world.outsider)

    assert Role.MANAGER in roles_of(User.objects.get(pk=world.outsider_user.pk))
    with time_machine.travel(_at(FRIDAY + timedelta(days=3)), tick=False):
        assert Role.MANAGER not in roles_of(User.objects.get(pk=world.outsider_user.pk))


def test_a_delegate_from_the_team_does_not_manage_themselves(world):
    _delegate(world, delegate=world.peer)

    assert reach.team_ids(world.peer_user) == {world.owner.id}


def test_delegation_is_not_passed_on(world):
    _delegate(world)
    _delegate(world, actor=world.other_manager_user, manager=world.other_manager, delegate=world.outsider)

    assert reach.acting_for(world.outsider.id) == {world.outsider.id, world.other_manager.id}


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"delegate": "manager"}, "delegate", "organisation.delegation_self"),
        ({"start": MONDAY - timedelta(days=1)}, "start_date", "organisation.delegation_dates"),
        ({"end": MONDAY - timedelta(days=1)}, "end_date", "organisation.delegation_dates"),
        ({"manager": "owner", "actor": "hr_user"}, "manager", "organisation.delegation_not_manager"),
    ],
)
def test_delegation_rules(world, overrides, field, code):
    arguments = {
        key: getattr(world, value) if isinstance(value, str) else value for key, value in overrides.items()
    }

    with pytest.raises(DomainError) as error:
        _delegate(world, **arguments)

    assert [(problem.field, problem.code) for problem in error.value.problems] == [(field, code)]


def test_the_delegate_must_be_active(world):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.SUSPENDED)
    world.peer.refresh_from_db()

    with pytest.raises(DomainError) as error:
        _delegate(world, delegate=world.peer)

    assert error.value.code == "organisation.delegation_delegate_inactive"


def test_two_delegations_of_one_manager_cannot_overlap(world):
    _delegate(world)

    with pytest.raises(DomainError) as error:
        _delegate(world, delegate=world.peer, start=FRIDAY, end=FRIDAY + timedelta(days=3))

    assert [(problem.field, problem.code) for problem in error.value.problems] == [
        ("start_date", "organisation.delegation_overlap")
    ]
    _delegate(world, delegate=world.peer, start=FRIDAY + timedelta(days=1), end=FRIDAY + timedelta(days=3))


def test_only_the_manager_or_hr_names_a_delegate(world):
    with pytest.raises(NotAllowed):
        _delegate(world, actor=world.other_manager_user)
    with pytest.raises(NotAllowed):
        _delegate(world, actor=world.owner_user)

    delegation = _delegate(world, actor=world.hr_user)
    assert delegation.created_by == world.hr_user


def test_ending_a_running_delegation_takes_effect_at_once(world):
    delegation = _delegate(world)

    delegation = services.end_delegation(actor=world.manager_user, delegation=delegation)
    services.end_delegation(actor=world.manager_user, delegation=delegation)

    assert selectors.delegation_state(delegation) == "ended"
    assert reach.acting_for(world.other_manager.id) == {world.other_manager.id}
    assert AuditEvent.objects.filter(action="delegation.ended").count() == 1
    assert {n.user for n in _events("delegation.ended")} == {world.manager_user, world.other_manager_user}


def test_the_end_is_announced_with_a_page_each_reader_can_open(world):
    """My team closes to a delegate who manages nobody as soon as the delegation is over."""
    services.end_delegation(actor=world.manager_user, delegation=_delegate(world, delegate=world.outsider))

    links = {n.user: notifications.render(n)["link"] for n in _events("delegation.ended")}
    assert links == {world.manager_user: "/team/delegations", world.outsider_user: "/me"}


def test_a_delegate_with_a_team_of_their_own_is_still_led_to_the_delegations(world):
    _delegate(world, start=MONDAY, end=MONDAY + timedelta(days=1))

    started = {n.user: notifications.render(n)["link"] for n in _events("delegation.started")}
    with time_machine.travel(_at(MONDAY + timedelta(days=2)), tick=False):
        services.announce_delegation_transitions()
    ended = {n.user: notifications.render(n)["link"] for n in _events("delegation.ended")}

    everyone = {world.manager_user: "/team/delegations", world.other_manager_user: "/team/delegations"}
    assert (started, ended) == (everyone, everyone)


def test_the_delegate_reads_the_team_through_the_api_only_while_the_delegation_runs(world, client_for):
    _delegate(world, delegate=world.outsider)
    record = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
    people = reverse("organisation:employee-list")

    during = client_for(world.outsider_user)
    assert sorted(during.get(record).json()) == [
        "department",
        "first_name",
        "last_name",
        "name",
        "phone",
        "position",
        "professional_email",
        "public_id",
    ]
    assert [row["name"] for row in during.get(people).json()["results"]] == [
        "Amal Employee",
        "Bilel Employee",
    ]

    # A new session each time: the one opened on Monday would have ended by itself in between.
    with time_machine.travel(_at(FRIDAY), tick=False):
        assert client_for(world.outsider_user).get(record).status_code == 200
    with time_machine.travel(_at(FRIDAY + timedelta(days=1)), tick=False):
        after = client_for(world.outsider_user)
        assert after.get(record).status_code == 404
        assert after.get(people).status_code == 403


def test_a_delegation_ended_early_closes_the_team_to_the_delegate_at_once(world, client_for):
    delegation = _delegate(world, delegate=world.outsider)
    record = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
    client = client_for(world.outsider_user)
    assert client.get(record).status_code == 200

    services.end_delegation(actor=world.manager_user, delegation=delegation)

    assert client.get(record).status_code == 404
    assert client.get(reverse("organisation:delegation-list")).status_code == 403


def test_cancelling_an_upcoming_delegation_tells_nobody(world):
    delegation = _delegate(world, start=MONDAY + timedelta(days=7), end=MONDAY + timedelta(days=11))

    delegation = services.end_delegation(actor=world.hr_user, delegation=delegation)

    assert selectors.delegation_state(delegation) == "cancelled"
    assert AuditEvent.objects.filter(action="delegation.cancelled").count() == 1
    assert Notification.objects.filter(event_code__startswith="delegation.").count() == 0


def test_an_ended_delegation_frees_its_dates(world):
    services.end_delegation(actor=world.manager_user, delegation=_delegate(world))

    replacement = _delegate(world, delegate=world.peer)

    assert selectors.delegation_state(replacement) == "active"


def test_only_the_manager_or_hr_ends_a_delegation(world):
    delegation = _delegate(world)

    with pytest.raises(NotAllowed):
        services.end_delegation(actor=world.other_manager_user, delegation=delegation)


def test_the_daily_job_announces_each_start_and_end_once(world):
    tuesday, wednesday = MONDAY + timedelta(days=1), MONDAY + timedelta(days=2)
    _delegate(world, start=tuesday, end=wednesday)
    assert services.announce_delegation_transitions() == 0

    with time_machine.travel(_at(tuesday), tick=False):
        assert services.announce_delegation_transitions() == 2
        assert services.announce_delegation_transitions() == 0
    with time_machine.travel(_at(wednesday + timedelta(days=1)), tick=False):
        assert services.announce_delegation_transitions() == 2
        assert services.announce_delegation_transitions() == 0

    assert _events("delegation.started").count() == 2
    assert _events("delegation.ended").count() == 2


def test_who_can_act_for_a_manager(world):
    _delegate(world)
    manager = selectors.get_employee(world.manager.public_id)

    assert selectors.acting_users_for_manager(manager) == [world.manager_user, world.other_manager_user]
    assert selectors.acting_users_for_manager(manager, excluding_employee_id=world.other_manager.id) == [
        world.manager_user
    ]
    assert selectors.acting_users_for_manager(manager, on=FRIDAY + timedelta(days=1)) == [world.manager_user]
    assert selectors.manager_user(world.owner) == world.manager_user


def test_a_manager_who_cannot_sign_in_cannot_act(world):
    User.objects.filter(pk=world.manager_user.pk).update(is_active=False)
    _delegate(world, actor=world.hr_user)
    manager = selectors.get_employee(world.manager.public_id)
    owner = selectors.get_employee(world.owner.public_id)

    assert selectors.acting_users_for_manager(manager) == [world.other_manager_user]
    assert selectors.manager_user(owner) is None


def test_my_delegations_are_listed_with_their_direction(world, client_for):
    _delegate(world)
    url = reverse("organisation:delegation-list")

    given = client_for(world.manager_user).get(url).json()["results"][0]
    received = client_for(world.other_manager_user).get(url).json()["results"][0]

    assert (given["direction"], given["state"], given["can_end"]) == ("given", "active", True)
    assert given["delegate"] == {"public_id": str(world.other_manager.public_id), "name": "Nadia Manager"}
    assert (given["start_date"], given["end_date"]) == ("2026-11-02", "2026-11-06")
    assert (received["direction"], received["can_end"]) == ("received", False)


def test_a_manager_names_a_delegate_through_the_api(world, client_for):
    response = client_for(world.manager_user).post(
        reverse("organisation:delegation-list"),
        {"delegate": str(world.peer.public_id), "start_date": "2026-11-09", "end_date": "2026-11-13"},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["manager"]["name"] == "Mounir Manager"
    assert response.json()["state"] == "upcoming"


def test_hr_names_lists_and_ends_a_delegation_for_any_manager(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("organisation:delegation-list"),
        {
            "manager": str(world.manager.public_id),
            "delegate": str(world.peer.public_id),
            "start_date": "2026-11-02",
            "end_date": "2026-11-06",
        },
        format="json",
    )
    assert created.status_code == 201

    listed = client.get(
        reverse("organisation:delegation-list"), {"scope": "all", "manager": str(world.manager.public_id)}
    ).json()
    assert [row["public_id"] for row in listed["results"]] == [created.json()["public_id"]]
    assert listed["results"][0]["can_end"] is True

    url = reverse("organisation:delegation-end", kwargs={"public_id": created.json()["public_id"]})
    ended = client.post(url, {}, format="json")
    assert (ended.status_code, ended.json()["state"], ended.json()["can_end"]) == (200, "ended", False)


def test_delegation_refusals_through_the_api(world, client_for):
    delegation = _delegate(world)
    list_url = reverse("organisation:delegation-list")
    end_url = reverse("organisation:delegation-end", kwargs={"public_id": delegation.public_id})
    body = {"delegate": str(world.peer.public_id), "start_date": "2026-11-04", "end_date": "2026-11-05"}

    assert client_for(world.owner_user).post(list_url, body, format="json").status_code == 403
    assert client_for(world.manager_user).get(list_url, {"scope": "all"}).status_code == 403
    assert client_for(world.exec_user).post(end_url, {}, format="json").status_code == 404

    overlap = client_for(world.manager_user).post(list_url, body, format="json")
    assert overlap.status_code == 400
    assert overlap.json()["code"] == "organisation.delegation_overlap"
    assert overlap.json()["errors"][0]["field"] == "start_date"

    malformed = client_for(world.manager_user).post(list_url, {**body, "delegate": "nobody"}, format="json")
    assert malformed.status_code == 400
    assert malformed.json()["errors"][0]["field"] == "delegate"
