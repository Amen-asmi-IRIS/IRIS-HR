import pytest
from django.urls import reverse
from django.utils import translation

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.accounts.services import display_name
from apps.accounts.tests.world import make_user
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep
from apps.requests.services import chain
from apps.requests.tests.helpers import MON, NOW, TODAY, days, fresh, pending_step, stored, submitted

pytestmark = pytest.mark.django_db


def resolve(rule, requester, named=None):
    return services.resolve_rule(rule=rule, named_person=named, requester=fresh(requester))


def ids(resolution) -> set[int]:
    return {user.pk for user in resolution.users}


def test_line_manager_rule_gives_the_manager(world):
    resolution = resolve("line_manager", world.owner)
    assert ids(resolution) == {world.manager_user.pk}
    assert (resolution.rule, resolution.skip) == ("line_manager", False)


def test_ceo_request_skips_the_manager_rule(world):
    resolution = resolve("line_manager", world.ceo)
    assert (resolution.skip, resolution.users) == (True, ())


def test_disabled_manager_leaves_nobody(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    resolution = resolve("line_manager", world.owner)
    assert (resolution.skip, resolution.users) == (False, ())


def test_a_manager_who_left_is_not_a_missing_manager(world):
    """The reports of a leaver keep that person as manager until HR names a new one (plan 02, at review)."""
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.manager, leaving_date=TODAY, reason="Départ"
    )
    resolution = resolve("line_manager", world.owner)
    assert (resolution.skip, resolution.users) == (False, ())
    names = chain.waiting_names(rule="line_manager", named_person=None, requester=fresh(world.owner))
    assert names == ["Mounir Manager"]


def test_hr_rule_gives_every_hr_holder_except_the_requester(world):
    account_services.assign_role(actor=world.sysadmin_user, user=world.other_manager_user, role=Role.HR)
    assert ids(resolve("hr_role", world.owner)) == {world.hr_user.pk, world.other_manager_user.pk}
    own = resolve("hr_role", world.hr)
    assert ids(own) == {world.other_manager_user.pk}
    assert own.via_exec is False


def test_the_only_hr_holder_falls_back_to_executives(world):
    resolution = resolve("hr_role", world.hr)
    assert ids(resolution) == {world.exec_user.pk}
    assert (resolution.rule, resolution.via_exec) == ("hr_role", True)


def test_without_hr_or_executive_nobody_is_left(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.exec_user)
    resolution = resolve("hr_role", world.hr)
    assert (resolution.users, resolution.via_exec, resolution.skip) == ((), True, False)


# ------------------------------------------------------------------ only those who can decide (master D47)


def test_an_hr_holder_without_an_employee_record_is_not_counted(world):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    resolution = resolve("hr_role", world.owner)
    assert ids(resolution) == {world.hr_user.pk}
    assert external.pk not in ids(resolution)
    assert resolution.via_exec is False

    request = submitted(world)
    current = services.decide_step(
        actor=world.manager_user,
        step=pending_step(request),
        decision="approve",
        expected_version=request.version,
    )
    step = pending_step(current)
    assert (services.can_act_on(world.hr_user, step), services.can_act_on(external, step)) == (True, False)
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1
    assert not Notification.objects.filter(event_code="step.to_decide", user=external).exists()
    done = services.decide_step(
        actor=world.hr_user, step=step, decision="approve", expected_version=current.version
    )
    assert done.status == "approved"


def test_with_only_hr_holders_without_a_record_the_executives_decide(world):
    make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    resolution = resolve("hr_role", world.hr)  # the only HR holder with a record is the requester
    assert ids(resolution) == {world.exec_user.pk}
    assert (resolution.rule, resolution.via_exec) == ("hr_role", True)

    request = submitted(
        world, employee=world.hr, actor=world.hr_user, request_type=world.sick, data=days(TODAY)
    )
    step = pending_step(request)
    assert step.approver_rule == "hr_role"
    assert services.can_act_on(world.exec_user, step) is True
    assert Notification.objects.filter(event_code="step.to_decide", user=world.exec_user).count() == 1
    assert not Notification.objects.filter(event_code="hr_step.unattended").exists()


def test_with_nobody_who_can_decide_the_administrators_are_told(world):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    make_user("dg.externe@impactrisks.com", full_name="DG Externe", roles=["exec"])
    account_services.disable_account(actor=world.sysadmin_user, user=world.exec_user)
    resolution = resolve("hr_role", world.hr)
    assert (resolution.users, resolution.via_exec) == ((), True)

    request = submitted(
        world, employee=world.hr, actor=world.hr_user, request_type=world.sick, data=days(TODAY)
    )
    step = pending_step(request)
    assert (step.status, step.approver_rule) == ("pending", "hr_role")
    assert services.can_act_on(external, step) is False
    assert Notification.objects.filter(event_code="hr_step.unattended", user=world.sysadmin_user).count() == 1
    assert not Notification.objects.filter(event_code="step.to_decide").exists()


def test_named_person_rule_gives_that_person(world):
    resolution = resolve("named_person", world.owner, named=world.other_manager)
    assert ids(resolution) == {world.other_manager_user.pk}
    assert resolution.rule == "named_person"


def test_named_person_who_is_the_requester_becomes_an_hr_step(world):
    resolution = resolve("named_person", world.other_manager, named=world.other_manager)
    assert resolution.rule == "hr_role"
    assert ids(resolution) == {world.hr_user.pk}


def test_named_person_without_a_usable_account_leaves_nobody(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    resolution = resolve("named_person", world.owner, named=fresh(world.other_manager))
    assert (resolution.rule, resolution.users) == ("named_person", ())


def test_waiting_names_say_hr_or_name_the_people(world):
    owner = fresh(world.owner)
    with translation.override("en"):
        assert chain.waiting_names(rule="hr_role", named_person=None, requester=owner) == ["HR"]
    with translation.override("fr"):
        assert chain.waiting_names(rule="hr_role", named_person=None, requester=owner) == ["RH"]
    manager_name = display_name(world.manager_user)
    assert chain.waiting_names(rule="line_manager", named_person=None, requester=owner) == [manager_name]
    assert chain.waiting_names(rule="hr_role", named_person=None, requester=fresh(world.hr)) == [
        display_name(world.exec_user)
    ]
    assert chain.waiting_names(rule="line_manager", named_person=None, requester=fresh(world.ceo)) == []


def test_a_manager_who_cannot_act_is_still_named(world):
    manager_name = display_name(world.manager_user)
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    names = chain.waiting_names(rule="line_manager", named_person=None, requester=fresh(world.owner))
    assert names == [manager_name]


def test_chain_preview_lists_who_will_decide_and_leaves_out_skipped_steps(world):
    rows = services.chain_preview(request_type=world.annual, employee=fresh(world.owner))
    assert [(row.position, row.rule, row.mode) for row in rows] == [
        (1, "line_manager", "approve"),
        (2, "hr_role", "approve"),
    ]
    assert rows[0].approvers == [display_name(world.manager_user)]
    for_ceo = services.chain_preview(request_type=world.annual, employee=fresh(world.ceo))
    assert [(row.position, row.rule) for row in for_ceo] == [(2, "hr_role")]


def test_who_can_act_on_a_step(world):
    request = stored(world, data=days(MON), status=RequestStatus.PENDING)
    step = RequestStep.objects.create(
        request=request, round=1, position=1, approver_rule="line_manager", mode="approve", status="pending"
    )
    assert services.can_act_on(world.manager_user, step) is True
    assert services.can_act_on(world.peer_user, step) is False
    assert services.can_act_on(world.other_manager_user, step) is False
    assert services.can_act_on(world.hr_user, step) is False
    assert [user.pk for user in services.resolve_approvers(step)] == [world.manager_user.pk]

    step.flagged_at = NOW
    step.save()
    assert services.can_act_on(world.hr_user, step) is True  # a step HR was alerted about

    step.status = "approved"
    step.save()
    assert services.can_act_on(world.manager_user, step) is False
    assert services.is_eligible_approver(world.manager_user, step) is True


def test_hr_previews_the_chain_for_an_employee(world, client_for):
    url = reverse("requests:type-chain-preview", kwargs={"pk": world.annual.pk})
    response = client_for(world.hr_user).get(url, {"employee": str(world.owner.public_id)})
    assert response.status_code == 200
    body = response.json()
    assert [(row["position"], row["rule"], row["mode"]) for row in body] == [
        (1, "line_manager", "approve"),
        (2, "hr_role", "approve"),
    ]
    assert body[0]["approvers"] == [display_name(world.manager_user)]
    assert client_for(world.hr_user).get(url).status_code == 404
