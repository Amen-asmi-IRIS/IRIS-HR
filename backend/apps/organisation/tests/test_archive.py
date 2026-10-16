from datetime import date

import pytest
from django.urls import reverse

from apps.accounts import services as accounts_services
from apps.accounts.models import RoleAssignment
from apps.accounts.ports import employee_directory
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError
from apps.organisation import reach, selectors, services
from apps.organisation.models import Employee, EmployeeStatus
from apps.organisation.services import archive
from apps.organisation.tests.world import make_employee

pytestmark = pytest.mark.django_db

LEAVING = date(2026, 11, 30)


def _leave(world, employee, reason="Resignation"):
    return services.archive_employee(
        actor=world.hr_user, employee=employee, leaving_date=LEAVING, reason=reason
    )


def test_the_preview_lists_what_the_departure_leaves_behind(world, monkeypatch):
    monkeypatch.setattr(
        archive,
        "_contributors",
        [
            lambda employee: services.ArchiveSection(
                key="open_requests", items=[services.ArchiveItem(label="Annual leave", link="/requests/abc")]
            ),
            lambda employee: None,
            lambda employee: services.ArchiveSection(key="nothing", items=[]),
        ],
    )

    preview = services.archive_preview(employee=selectors.get_employee(world.manager.public_id))

    assert preview.has_account is True
    assert [item.label for item in preview.reports] == ["Amal Employee", "Bilel Employee"]
    assert preview.reports[0].link == f"/hr/employees/{world.owner.public_id}"
    assert [section.key for section in preview.sections] == ["open_requests"]


def test_archiving_a_manager(world):
    employee = _leave(world, world.manager, reason=" Resignation ")

    assert (employee.status, employee.archived_at, employee.archive_reason) == (
        EmployeeStatus.ARCHIVED,
        LEAVING,
        "Resignation",
    )
    world.manager_user.refresh_from_db()
    assert world.manager_user.is_active is False
    # Nothing is deleted, and the reports keep pointing at the leaver until HR names a new manager.
    assert Employee.objects.filter(pk=world.manager.pk).exists()
    world.owner.refresh_from_db()
    assert world.owner.manager == world.manager
    event = AuditEvent.objects.get(action="employee.archived")
    assert event.object_id == str(world.manager.public_id)
    assert event.changes == {
        "status": {"before": "active", "after": "archived"},
        "archived_at": {"before": None, "after": "2026-11-30"},
        "archive_reason": {"before": "", "after": "Resignation"},
    }


def test_archiving_twice_is_a_conflict(world):
    _leave(world, world.owner)

    with pytest.raises(Conflict) as error:
        _leave(world, world.owner)

    assert error.value.code == "organisation.already_archived"
    assert AuditEvent.objects.filter(action="employee.archived").count() == 1


def test_an_hr_holder_does_not_record_their_own_departure(world):
    """Nobody switches off their own account. The refusal undoes the whole departure."""
    with pytest.raises(DomainError) as error:
        _leave(world, world.hr)

    assert error.value.code == "accounts.cannot_change_self"
    world.hr.refresh_from_db()
    world.hr_user.refresh_from_db()
    assert (world.hr.status, world.hr.archived_at, world.hr.archive_reason) == (
        EmployeeStatus.ACTIVE,
        None,
        "",
    )
    assert world.hr_user.is_active is True
    assert not AuditEvent.objects.filter(action="employee.archived").exists()


def test_the_account_of_a_leaver_keeps_its_roles_and_cannot_be_enabled_again(world, client_for):
    """Master D44: the assigned roles stay on the disabled account, for the record, and it stays disabled."""
    accounts_services.assign_role(actor=world.sysadmin_user, user=world.other_manager_user, role="exec")
    user = world.other_manager_user
    assert employee_directory().has_left(user.pk) is False

    _leave(world, world.other_manager)

    user.refresh_from_db()
    assert user.is_active is False
    assert list(RoleAssignment.objects.filter(user=user).values_list("role", flat=True)) == ["exec"]
    assert employee_directory().has_left(user.pk) is True
    with pytest.raises(Conflict) as error:
        accounts_services.enable_account(actor=world.sysadmin_user, user=user)
    assert error.value.code == "accounts.employee_left"

    admin = client_for(world.sysadmin_user)
    account = reverse("accounts:account-detail", kwargs={"public_id": user.public_id})
    seen = admin.get(account).json()
    assert (seen["state"], seen["can_enable"], seen["roles"]) == ("disabled", False, ["exec"])
    refused = admin.post(reverse("accounts:account-enable", kwargs={"public_id": user.public_id}))
    assert (refused.status_code, refused.json()["code"]) == (409, "accounts.employee_left")
    # The administrator is told that the person has left, and nothing else about them.
    assert refused.json()["detail"].startswith("Cette personne a quitté l'entreprise")
    user.refresh_from_db()
    assert user.is_active is False
    assert not AuditEvent.objects.filter(action="account.enabled").exists()


def test_an_account_disabled_for_another_reason_can_still_be_enabled(world, client_for):
    accounts_services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    admin = client_for(world.sysadmin_user)
    account = reverse("accounts:account-detail", kwargs={"public_id": world.owner_user.public_id})
    assert admin.get(account).json()["can_enable"] is True

    accounts_services.enable_account(actor=world.sysadmin_user, user=world.owner_user)

    world.owner_user.refresh_from_db()
    assert world.owner_user.is_active is True


def test_the_last_administrator_cannot_be_made_to_leave(world):
    administrator = make_employee(
        number="E900",
        first_name="Sonia",
        last_name="Admin",
        department=world.dept_b,
        position=world.position,
        user=world.sysadmin_user,
    )

    with pytest.raises(Conflict) as error:
        _leave(world, administrator)

    assert error.value.code == "accounts.last_sysadmin"
    administrator.refresh_from_db()
    world.sysadmin_user.refresh_from_db()
    assert administrator.status == EmployeeStatus.ACTIVE
    assert world.sysadmin_user.is_active is True


def test_someone_without_an_account_can_leave_too(world):
    newcomer = make_employee(
        number="E100",
        first_name="Nour",
        last_name="Nouvelle",
        department=world.dept_a,
        position=world.position,
        manager=world.manager,
    )

    assert _leave(world, newcomer, reason="End of contract").status == EmployeeStatus.ARCHIVED


def test_the_leaver_leaves_lists_and_teams_but_hr_still_finds_the_record(world, client_for):
    _leave(world, world.owner)
    hr = client_for(world.hr_user)
    list_url = reverse("organisation:employee-list")
    detail_url = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})

    assert world.owner.id not in reach.team_ids(world.manager_user)
    assert "E004" not in [row["employee_number"] for row in hr.get(list_url).json()["results"]]
    found = hr.get(list_url, {"status": "archived", "search": "amal"}).json()["results"]
    assert [row["employee_number"] for row in found] == ["E004"]
    assert hr.get(detail_url).json()["archived_at"] == "2026-11-30"
    assert client_for(world.manager_user).get(detail_url).status_code == 404


def test_archive_endpoints(world, client_for):
    client = client_for(world.hr_user)
    kwargs = {"public_id": world.manager.public_id}
    preview_url = reverse("organisation:employee-archive-preview", kwargs=kwargs)
    archive_url = reverse("organisation:employee-archive", kwargs=kwargs)

    preview = client.get(preview_url).json()
    assert preview == {
        "has_account": True,
        "reports": [
            {"label": "Amal Employee", "link": f"/hr/employees/{world.owner.public_id}"},
            {"label": "Bilel Employee", "link": f"/hr/employees/{world.peer.public_id}"},
        ],
        "sections": [],
    }

    without_reason = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": " "}, format="json")
    assert without_reason.status_code == 400
    assert without_reason.json()["errors"][0]["field"] == "reason"

    done = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": "Resignation"}, format="json")
    assert (done.status_code, done.json()["status"], done.json()["archived_at"]) == (
        200,
        "archived",
        "2026-11-30",
    )

    again = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": "Resignation"}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "organisation.already_archived")
