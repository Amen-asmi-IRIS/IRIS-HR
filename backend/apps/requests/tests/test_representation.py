import datetime as dt
import json
from decimal import Decimal

import pytest
from django.utils import translation

from apps.accounts.services import display_name
from apps.calendar.lang import active_lang
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.organisation import services as organisation_services
from apps.organisation.selectors import department_name, full_name
from apps.requests import selectors, services
from apps.requests.representation import represent, represent_detail, viewer_for
from apps.requests.tests.helpers import (
    MON,
    NOW,
    THU,
    TODAY,
    TUE,
    WED,
    approved,
    at,
    days,
    decide,
    draft,
    pdf,
    pending_step,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db


def view(request, user) -> dict:
    return represent(selectors.get_request_for(user, str(request.public_id)), viewer_for(user))


def detail(request, user) -> dict:
    return represent_detail(selectors.get_request_for(user, str(request.public_id)), viewer_for(user))


def actions(request, user) -> list[str]:
    return view(request, user)["viewer"]["actions"]


def sick(world):
    return submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe sévère"))


# ------------------------------------------------------------------ shape


def test_the_shape_of_a_pending_request_for_its_owner(world):
    request = submitted(world, data=days(MON, TUE, comment="Vacances"))
    body = view(request, world.owner_user)
    assert (body["public_id"], body["version"], body["status"]) == (request.public_id, 2, "pending")
    assert body["employee"] == {
        "public_id": world.owner.public_id,
        "name": full_name(world.owner),
        "department": department_name(world.owner, active_lang()),
    }
    assert (body["type"]["code"], body["type"]["unit"], body["type"]["calendar_label"]) == (
        "annual",
        "day",
        "absent",
    )
    assert (body["start_date"], body["end_date"], body["starts_at_midday"], body["start_time"]) == (
        MON,
        TUE,
        False,
        None,
    )
    assert (body["quantity"], body["event"], body["comment"], body["comment_hidden"]) == (
        Decimal("2.00"),
        None,
        "Vacances",
        False,
    )
    assert body["state"] == {
        "key": "waiting_manager",
        "waiting_on": [display_name(world.manager_user)],
        "last_actor": None,
        "note": None,
        "since": NOW,
    }
    assert body["certificate"] == {"status": "not_needed", "due_at": None}
    assert (body["amendment"], body["has_override"], body["created_by_hr"]) == (None, False, False)
    assert body["viewer"] == {"relation": "owner", "actions": ["edit", "withdraw", "attach"], "step_id": None}
    assert (body["submitted_at"], body["decided_at"]) == (NOW, None)


def test_names_follow_the_language_of_the_reader(world):
    request = submitted(
        world, request_type=world.exceptional, data=days(MON, exceptional_event_id=world.event.pk)
    )
    with translation.override("en"):
        body = view(request, world.owner_user)
        assert (body["type"]["name"], body["event"]) == (
            "Exceptional leave",
            {"id": world.event.pk, "name": "Marriage"},
        )
    with translation.override("fr"):
        body = view(request, world.owner_user)
        assert (body["type"]["name"], body["event"]["name"]) == ("Congé exceptionnel", "Mariage")


# ------------------------------------------------------------------ actions of the owner (UI 5.4)


def test_owner_actions_follow_the_state(world):
    assert actions(draft(world, data=days(MON)), world.owner_user) == ["edit", "submit", "discard", "attach"]

    pending = submitted(world, data=days(MON))
    assert actions(pending, world.owner_user) == ["edit", "withdraw", "attach"]
    decide(pending, world.manager_user)
    assert actions(pending, world.owner_user) == ["withdraw", "attach"]

    returned = submitted(world, data=days(TUE))
    decide(returned, world.manager_user, "return", "À revoir")
    assert actions(returned, world.owner_user) == ["edit", "submit", "withdraw", "attach"]

    refused = submitted(world, data=days(THU))
    decide(refused, world.manager_user, "reject", "Non")
    assert actions(refused, world.owner_user) == []

    granted = approved(world, data=days(WED))
    assert actions(granted, world.owner_user) == ["amend"]
    services.open_amendment(
        actor=world.owner_user, request=granted, kind="cancel", data=None, reason="Annulé"
    )
    assert actions(granted, world.owner_user) == ["withdraw_amendment"]


def test_a_started_approved_request_offers_nothing_to_its_owner(world, clock):
    request = approved(world, data=days(MON, TUE))
    clock.move_to(at(11, 2))
    assert actions(request, world.owner_user) == []


def test_a_request_entered_by_hr_with_an_exception_is_not_editable_by_the_employee(world):
    request = submitted(world, actor=world.hr_user, override_reason="Accord de la direction")
    body = view(request, world.owner_user)
    assert (body["has_override"], body["created_by_hr"]) == (True, True)
    assert body["viewer"]["actions"] == ["withdraw", "attach"]


# ------------------------------------------------------------------ the people who decide


def test_the_manager_sees_what_to_decide_then_only_follows(world):
    request = submitted(world)
    body = view(request, world.manager_user)
    assert body["viewer"] == {
        "relation": "approver",
        "actions": ["decide"],
        "step_id": pending_step(request).pk,
    }

    decide(request, world.manager_user)
    with translation.override("en"):
        after = view(request, world.manager_user)
    assert after["viewer"] == {"relation": "team", "actions": [], "step_id": None}
    assert (after["state"]["key"], after["state"]["waiting_on"], after["state"]["last_actor"]) == (
        "waiting_hr",
        ["HR"],
        full_name(world.manager),
    )


def test_hr_actions_follow_the_state(world):
    request = submitted(world)
    waiting_on_manager = view(request, world.hr_user)
    assert waiting_on_manager["viewer"] == {
        "relation": "hr",
        "actions": ["attach", "record_on_behalf", "reassign", "correct", "cancel"],
        "step_id": pending_step(request).pk,
    }
    decide(request, world.manager_user)
    assert actions(request, world.hr_user) == [
        "attach",
        "decide",
        "record_on_behalf",
        "reassign",
        "correct",
        "cancel",
    ]
    decide(request, world.hr_user)
    done = view(request, world.hr_user)
    assert done["viewer"] == {"relation": "hr", "actions": ["correct", "cancel"], "step_id": None}


def test_hr_is_offered_reclassification_on_a_sick_leave(world):
    body = view(sick(world), world.hr_user)
    assert body["viewer"]["actions"] == [
        "attach",
        "decide",
        "record_on_behalf",
        "reassign",
        "correct",
        "cancel",
        "reclassify",
    ]
    assert body["certificate"] == {"status": "due", "due_at": NOW + dt.timedelta(hours=48)}


def test_hr_edits_and_resends_a_returned_request_it_entered(world):
    request = submitted(world, actor=world.hr_user, override_reason="Accord")
    decide(request, world.manager_user, "return", "Dates à confirmer")
    assert actions(request, world.hr_user) == ["edit", "submit", "attach"]


def test_an_executive_sees_everything_and_acts_on_nothing_outside_their_team(world):
    request = submitted(world)
    assert view(request, world.exec_user)["viewer"] == {
        "relation": "overview",
        "actions": [],
        "step_id": None,
    }
    of_a_manager = submitted(world, employee=world.manager, data=days(TUE))
    assert view(of_a_manager, world.exec_user)["viewer"]["relation"] == "approver"


def test_hr_never_gets_actions_on_its_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    assert view(request, world.hr_user)["viewer"] == {
        "relation": "owner",
        "actions": ["edit", "withdraw", "attach"],
        "step_id": None,
    }


# ------------------------------------------------------------------ what must never leak


def test_manager_never_receives_the_sick_leave_comment(world):
    request = sick(world)
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    decide(request, world.hr_user, "return", "Certificat illisible")

    for user in (world.manager_user, world.exec_user):
        body = detail(request, user)
        assert (body["comment"], body["comment_hidden"], body["certificate"]) == (None, True, None)
        assert body["attachments"] == []
        assert body["state"]["note"] is None
        assert all(step["comment"] is None for step in body["steps"])
        carried = json.dumps(body, default=str).lower()
        # "certificat" alone is part of the key "certificate": the name of the file is looked for instead.
        for secret in ("grippe", "illisible", "certificat-", ".pdf"):
            assert secret not in carried

    for user in (world.owner_user, world.hr_user):
        body = detail(request, user)
        assert (body["comment"], body["comment_hidden"]) == ("Grippe sévère", False)
        assert body["state"]["note"] == "Certificat illisible"
        assert body["certificate"]["status"] == "attached"
        assert [(item["kind"], item["name"]) for item in body["attachments"]] == [
            ("medical", "certificat-grippe.pdf")
        ]


def test_the_type_of_a_sick_leave_is_visible_to_the_manager_but_nothing_more(world):
    body = view(sick(world), world.manager_user)
    assert body["type"]["code"] == "sick"
    assert body["viewer"] == {"relation": "team", "actions": [], "step_id": None}


# ------------------------------------------------------------------ detail


def test_detail_lists_steps_amendments_files_and_what_is_needed_to_decide(world):
    request = approved(world, data=days(MON, TUE))
    stored(world, employee=world.peer, request_type=world.remote, data=days(TUE))
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Changement"
    )

    body = detail(request, world.manager_user)

    # The two steps of the request itself, then the two steps of the change that is waiting.
    assert [(step["round"], step["position"], step["status"]) for step in body["steps"]] == [
        (1, 1, "approved"),
        (1, 2, "approved"),
        (1, 1, "pending"),
        (1, 2, "waiting"),
    ]
    first = body["steps"][0]
    assert first == {
        "id": first["id"],
        "round": 1,
        "position": 1,
        "rule": "line_manager",
        "mode": "approve",
        "status": "approved",
        "approvers": [],
        "decided_by": full_name(world.manager),
        "decided_at": NOW,
        "recorded_by": None,
        "channel": "in_app",
        "comment": None,
        "amendment_public_id": None,
    }
    change_step = body["steps"][2]
    assert (change_step["amendment_public_id"], change_step["approvers"]) == (
        amendment.public_id,
        [display_name(world.manager_user)],
    )
    assert body["amendment"] == {
        "public_id": amendment.public_id,
        "kind": "change",
        "status": "pending",
        "state_key": "waiting_manager",
        "waiting_on": [display_name(world.manager_user)],
    }
    assert body["amendments"] == [
        {
            "public_id": amendment.public_id,
            "kind": "change",
            "status": "pending",
            "reason": "Changement",
            "new_start_date": WED,
            "new_end_date": WED,
            "new_quantity": Decimal("1.00"),
            "created_at": NOW,
            "decided_at": None,
        }
    ]
    assert body["viewer"] == {"relation": "approver", "actions": ["decide"], "step_id": change_step["id"]}
    assert body["decision_context"] == {
        "balance": {"now": Decimal("10"), "after": Decimal("8")},
        "teammates_away": [
            {"name": full_name(world.peer), "label": "remote", "start_date": TUE, "end_date": TUE}
        ],
        "cap": None,
    }


def test_the_owner_sees_the_balance_but_not_who_else_is_away(world):
    request = submitted(world, data=days(TUE))
    stored(world, employee=world.peer, data=days(TUE))
    context = detail(request, world.owner_user)["decision_context"]
    assert context["teammates_away"] == []
    assert context["balance"] == {"now": Decimal("10"), "after": Decimal("9")}


def test_decision_context_shows_the_weekly_limit_for_remote_work(world):
    stored(world, request_type=world.remote, data=days(MON))
    request = submitted(world, request_type=world.remote, data=days(TUE))
    context = detail(request, world.manager_user)["decision_context"]
    assert context["cap"] == {"used": Decimal("1"), "limit": Decimal("2.00")}
    assert context["balance"] is None


# ------------------------------------------------------------------ reach, scopes, filters


def test_reach_of_a_request(world):
    request = submitted(world)
    for user in (world.owner_user, world.manager_user, world.hr_user, world.exec_user):
        assert selectors.get_request_for(user, str(request.public_id)).pk == request.pk
    for user in (world.peer_user, world.other_manager_user, world.outsider_user, world.sysadmin_user):
        with pytest.raises(NotFound):
            selectors.get_request_for(user, str(request.public_id))


def test_a_draft_is_seen_by_its_creator_only(world):
    own = draft(world)
    entered_by_hr = draft(world, actor=world.hr_user, data=days(TUE))
    assert selectors.can_see(world.owner_user, own) is True
    assert selectors.can_see(world.hr_user, own) is False
    assert selectors.can_see(world.manager_user, own) is False
    assert selectors.can_see(world.hr_user, entered_by_hr) is True
    assert selectors.can_see(world.owner_user, entered_by_hr) is False


def test_a_delegate_reaches_the_team_only_while_the_delegation_runs(world, clock):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=2),
    )
    request = submitted(world)
    delegate = world.other_manager_user

    def in_team_list() -> bool:
        return selectors.requests_for(delegate, "team").filter(pk=request.pk).exists()

    assert selectors.can_see(delegate, request) is True
    assert in_team_list() is True
    assert [step.request_id for step in selectors.queue(delegate, "mine")] == [request.pk]
    assert services.can_act_on(delegate, pending_step(request)) is True

    clock.shift(dt.timedelta(days=3))  # the delegation is over, and the delegate decided nothing

    assert selectors.can_see(delegate, request) is False
    with pytest.raises(NotFound):
        selectors.get_request_for(delegate, str(request.public_id))
    assert in_team_list() is False
    assert list(selectors.queue(delegate, "mine")) == []
    assert services.can_act_on(delegate, pending_step(request)) is False


def test_a_named_approver_and_a_past_decider_keep_access(world):
    request = submitted(world)
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    assert selectors.can_see(world.other_manager_user, request) is True
    decide(request, world.other_manager_user)
    assert selectors.can_see(world.other_manager_user, request) is True
    assert view(request, world.other_manager_user)["viewer"]["relation"] == "approver"


def test_someone_who_decided_from_outside_the_team_no_longer_reads_the_balance(world):
    request = submitted(world)
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    while_deciding = detail(request, world.other_manager_user)
    assert while_deciding["decision_context"]["balance"] == {"now": Decimal("10"), "after": Decimal("9")}

    decide(request, world.other_manager_user)

    afterwards = detail(request, world.other_manager_user)
    assert afterwards["viewer"] == {"relation": "approver", "actions": [], "step_id": None}
    assert afterwards["decision_context"] is None


def test_scopes(world):
    mine = submitted(world, data=days(MON))
    own_draft = draft(world, data=days(TUE))
    of_peer = submitted(world, employee=world.peer, data=days(MON))
    elsewhere = submitted(world, employee=world.outsider, data=days(MON))
    decide(mine, world.manager_user)

    def found(user, scope):
        return set(selectors.requests_for(user, scope).values_list("pk", flat=True))

    assert found(world.owner_user, "mine") == {mine.pk, own_draft.pk}
    assert found(world.manager_user, "team") == {mine.pk, of_peer.pk}
    assert found(world.hr_user, "all") == {mine.pk, of_peer.pk, elsewhere.pk}
    assert found(world.exec_user, "all") == {mine.pk, of_peer.pk, elsewhere.pk}
    assert found(world.manager_user, "decided") == {mine.pk}
    assert found(world.sysadmin_user, "mine") == set()
    with pytest.raises(NotAllowed):
        selectors.requests_for(world.owner_user, "team")
    with pytest.raises(NotAllowed):
        selectors.requests_for(world.manager_user, "all")
    with pytest.raises(DomainError) as error:
        selectors.requests_for(world.hr_user, "everything")
    assert error.value.code == "request.scope_invalid"


def test_filters(world):
    annual = submitted(world, data=days(MON))
    remote = submitted(world, request_type=world.remote, data=days(TUE))
    of_outsider = submitted(world, employee=world.outsider, data=days(MON))
    entered = submitted(
        world, employee=world.peer, actor=world.hr_user, data=days(MON), override_reason="Accord"
    )
    decide(annual, world.manager_user, "reject", "Non")
    viewer = world.hr_user

    def found(**filters):
        queryset = selectors.filter_requests(selectors.requests_for(viewer, "all"), viewer=viewer, **filters)
        return set(queryset.values_list("pk", flat=True))

    everything = {annual.pk, remote.pk, of_outsider.pk, entered.pk}
    assert found() == everything
    assert found(statuses=["rejected"]) == {annual.pk}
    assert found(type_codes=["remote"]) == {remote.pk}
    assert found(employee_public_id=str(world.outsider.public_id)) == {of_outsider.pk}
    assert found(department_id=world.dept_b.pk) == {of_outsider.pk}
    assert found(year=2026) == everything
    assert found(year=2027) == set()
    assert found(date_from=TUE, date_to=TUE) == {remote.pk}
    assert found(on_behalf=True) == {entered.pk}
    assert found(on_behalf=False) == everything - {entered.pk}
    assert found(has_override=True) == {entered.pk}
    assert found(has_override=False) == everything - {entered.pk}


def test_certificate_status_values(world, clock):
    assert selectors.certificate_status(submitted(world, data=days(MON))) == "not_needed"
    ill = sick(world)
    assert selectors.certificate_status(ill) == "due"
    clock.shift(dt.timedelta(hours=49))
    assert selectors.certificate_status(ill) == "overdue"
    services.attach_file(actor=world.owner_user, request=ill, upload=pdf())
    assert selectors.certificate_status(ill) == "attached"
    wedding = submitted(
        world,
        request_type=world.exceptional,
        data=days(dt.date(2026, 11, 16), exceptional_event_id=world.event.pk),
    )
    assert selectors.certificate_status(wedding) == "missing"
    assert selectors.document_requirement(wedding) == "proof"


def test_a_row_of_a_list_costs_few_queries(world, django_assert_max_num_queries):
    """Who the open step is for is worked out once per row, and the relations come with the list."""
    request = submitted(world)
    for user in (world.owner_user, world.manager_user, world.hr_user, world.exec_user):
        loaded = selectors.get_request_for(user, str(request.public_id))
        viewer = viewer_for(user)
        with django_assert_max_num_queries(3):
            represent(loaded, viewer)
