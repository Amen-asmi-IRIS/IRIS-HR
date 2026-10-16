from datetime import date

import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications import services as notification_services
from apps.notifications.models import Notification
from apps.organisation import services
from apps.organisation.models import ProfileChange

pytestmark = pytest.mark.django_db

LIST = "organisation:profile-change-list"


def _propose(world, user=None, **changes):
    return services.propose_profile_change(
        user=user or world.owner_user, changes=changes or {"phone": "20 111 222"}
    )


def _url(name, change) -> str:
    return reverse(f"organisation:profile-change-{name}", kwargs={"public_id": change.public_id})


def test_an_employee_proposes_a_change(world):
    change = _propose(world, phone=" 20 111 222 ", address="12 rue de Carthage, Tunis", first_name="Amal")

    assert change.status == "pending"
    # The first name is unchanged, so it is not part of the proposal.
    assert change.changes == {
        "phone": {"old": "", "new": "20 111 222"},
        "address": {"old": "", "new": "12 rue de Carthage, Tunis"},
    }
    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert AuditEvent.objects.filter(
        action="profile_change.proposed", object_id=str(change.public_id)
    ).exists()
    notified = Notification.objects.filter(event_code="profile_change.proposed")
    assert [notification.user for notification in notified] == [world.hr_user]
    assert notified.get().target_public_id == str(change.public_id)


def test_contractual_fields_cannot_be_proposed(world):
    with pytest.raises(DomainError) as error:
        _propose(world, phone="1", department=world.dept_b.id, hire_date="2019-01-01")

    assert [(problem.field, problem.code, dict(problem.params)) for problem in error.value.problems] == [
        ("changes.department", "organisation.field_not_proposable", {"name": "department"}),
        ("changes.hire_date", "organisation.field_not_proposable", {"name": "hire_date"}),
    ]
    assert ProfileChange.objects.count() == 0


def test_a_proposal_must_change_something(world):
    with pytest.raises(DomainError) as error:
        _propose(world, first_name="Amal", phone="")

    assert error.value.code == "organisation.nothing_to_change"


def test_one_open_proposal_at_a_time(world):
    _propose(world)

    with pytest.raises(Conflict) as error:
        _propose(world, phone="99")

    assert error.value.code == "organisation.change_already_open"


def test_someone_without_a_record_cannot_propose(world):
    with pytest.raises(NotAllowed):
        _propose(world, user=world.sysadmin_user)


def test_acceptance_updates_the_record_and_tells_the_employee(world):
    change = _propose(world, phone="20 111 222", date_of_birth=date(1990, 5, 17))

    decided = services.decide_profile_change(
        actor=world.hr_user, change=change, accept=True, comment=" Merci "
    )

    world.owner.refresh_from_db()
    assert (world.owner.phone, world.owner.date_of_birth) == ("20 111 222", date(1990, 5, 17))
    assert (decided.status, decided.decided_by, decided.comment) == ("accepted", world.hr_user, "Merci")
    assert decided.decided_at is not None
    assert AuditEvent.objects.get(action="employee.updated").changes == {
        "phone": {"before": "", "after": "20 111 222"},
        "date_of_birth": {"before": None, "after": "1990-05-17"},
    }
    assert AuditEvent.objects.filter(action="profile_change.accepted").count() == 1
    accepted = Notification.objects.filter(event_code="profile_change.accepted")
    assert [notification.user for notification in accepted] == [world.owner_user]


def test_refusal_changes_nothing_and_tells_the_employee(world):
    change = _propose(world)

    decided = services.decide_profile_change(
        actor=world.hr_user, change=change, accept=False, comment="Justificatif manquant"
    )

    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert (decided.status, decided.comment) == ("rejected", "Justificatif manquant")
    assert not AuditEvent.objects.filter(action="employee.updated").exists()
    # The employee reads HR's comment in the notification: no other page shows it to them (D55).
    told = Notification.objects.get(user=world.owner_user)
    assert (told.event_code, told.parameters) == (
        "profile_change.rejected_with_comment",
        {"comment": "Justificatif manquant"},
    )
    assert notification_services.render(told, "fr") == {
        "title": "Votre modification de profil a été refusée",
        "body": "Les RH ont refusé votre proposition. Leur commentaire : Justificatif manquant",
        "link": "/me/profile",
    }
    assert notification_services.render(told, "en")["body"] == (
        "HR refused the change you proposed. Their comment: Justificatif manquant"
    )


def test_a_refusal_without_a_comment_says_only_that(world):
    change = _propose(world)

    services.decide_profile_change(actor=world.hr_user, change=change, accept=False, comment="  ")

    told = Notification.objects.get(user=world.owner_user)
    assert (told.event_code, told.parameters) == ("profile_change.rejected", {})
    assert notification_services.render(told, "en")["body"] == "HR refused the change you proposed."


def test_a_proposal_is_decided_once(world):
    change = _propose(world)
    services.decide_profile_change(actor=world.hr_user, change=change, accept=True)

    with pytest.raises(Conflict) as error:
        services.decide_profile_change(actor=world.hr_user, change=change, accept=False)

    assert error.value.code == "organisation.change_already_decided"
    world.owner.refresh_from_db()
    assert world.owner.phone == "20 111 222"
    told = Notification.objects.filter(event_code__startswith="profile_change.", user=world.owner_user)
    assert told.count() == 1


def test_a_withdrawn_proposal_cannot_be_decided(world):
    change = _propose(world)

    withdrawn = services.withdraw_profile_change(user=world.owner_user, change=change)

    assert withdrawn.status == "withdrawn"
    with pytest.raises(Conflict) as error:
        services.decide_profile_change(actor=world.hr_user, change=change, accept=True)
    assert error.value.code == "organisation.change_already_decided"
    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert _propose(world, phone="55").status == "pending"


def test_acceptance_applies_the_proposed_values_over_later_edits(world):
    change = _propose(world, phone="20 111 222")
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000", "address": "Sfax"}
    )

    services.decide_profile_change(actor=world.hr_user, change=change, accept=True)

    world.owner.refresh_from_db()
    assert (world.owner.phone, world.owner.address) == ("20 111 222", "Sfax")


def test_only_the_owner_withdraws_and_only_while_pending(world):
    change = _propose(world)

    with pytest.raises(NotAllowed):
        services.withdraw_profile_change(user=world.peer_user, change=change)
    services.decide_profile_change(actor=world.hr_user, change=change, accept=False)
    with pytest.raises(Conflict):
        services.withdraw_profile_change(user=world.owner_user, change=change)


def test_an_hr_holder_does_not_decide_their_own_proposal(world):
    change = _propose(world, user=world.hr_user)

    with pytest.raises(NotAllowed):
        services.decide_profile_change(actor=world.hr_user, change=change, accept=True)
    # The cast has one HR holder, so nobody is told; they change their own record through the employee form.
    assert Notification.objects.filter(event_code="profile_change.proposed").count() == 0


def test_propose_through_the_api(world, client_for):
    response = client_for(world.owner_user).post(
        reverse(LIST),
        {"changes": {"phone": "20 111 222", "date_of_birth": "1990-05-17"}, "note": "Nouveau numéro"},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["changes"] == [
        {"field": "date_of_birth", "old": None, "new": "1990-05-17"},
        {"field": "phone", "old": "", "new": "20 111 222"},
    ]
    assert body["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
    assert (body["note"], body["decided_by"], body["decided_at"]) == ("Nouveau numéro", None, None)


def test_the_api_refuses_contractual_fields_and_bad_values(world, client_for):
    client = client_for(world.owner_user)

    contractual = client.post(reverse(LIST), {"changes": {"hire_date": "2019-01-01"}}, format="json")
    assert contractual.status_code == 400
    assert contractual.json()["code"] == "organisation.field_not_proposable"
    assert contractual.json()["errors"][0]["field"] == "changes.hire_date"

    bad = client.post(reverse(LIST), {"changes": {"personal_email": "not-an-email"}}, format="json")
    assert bad.status_code == 400
    assert bad.json()["errors"][0]["field"].endswith("personal_email")
    assert ProfileChange.objects.count() == 0


def test_the_hr_queue_and_the_decision(world, client_for):
    change = _propose(world)
    own = _propose(world, user=world.hr_user, phone="1")
    hr = client_for(world.hr_user)

    queue = hr.get(reverse(LIST), {"status": "pending"}).json()
    mine = hr.get(reverse(LIST), {"scope": "mine"}).json()
    # An HR holder's own proposal is not in their queue.
    assert [row["public_id"] for row in queue["results"]] == [str(change.public_id)]
    assert [row["public_id"] for row in mine["results"]] == [str(own.public_id)]

    decided = hr.post(_url("decide", change), {"accept": True, "comment": "Merci"}, format="json")
    assert (decided.status_code, decided.json()["status"], decided.json()["decided_by"]) == (
        200,
        "accepted",
        "Senna RH",
    )
    again = hr.post(_url("decide", change), {"accept": False}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "organisation.change_already_decided")
    assert hr.get(reverse(LIST), {"status": "decided"}).json()["count"] == 1
    assert hr.get(reverse(LIST), {"employee": str(world.owner.public_id)}).json()["count"] == 1
    assert hr.get(reverse(LIST), {"employee": str(world.peer.public_id)}).json()["count"] == 0
    assert hr.post(_url("decide", own), {"accept": True}, format="json").status_code == 403


def test_an_employee_sees_and_withdraws_only_their_own(world, client_for):
    change = _propose(world)
    owner = client_for(world.owner_user)

    assert owner.get(reverse(LIST)).json()["count"] == 1
    assert client_for(world.peer_user).get(reverse(LIST)).json()["count"] == 0
    assert owner.get(reverse(LIST), {"scope": "all"}).status_code == 403
    assert owner.get(_url("detail", change)).status_code == 200
    assert client_for(world.hr_user).get(_url("detail", change)).status_code == 200
    for user in (world.peer_user, world.manager_user, world.exec_user):
        assert client_for(user).get(_url("detail", change)).status_code == 404
    assert client_for(world.hr_user).post(_url("withdraw", change), {}, format="json").status_code == 404

    done = owner.post(_url("withdraw", change), {}, format="json")
    assert (done.status_code, done.json()["status"]) == (200, "withdrawn")
