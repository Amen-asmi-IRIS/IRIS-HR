from datetime import date

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError
from apps.organisation import services
from apps.organisation.models import ContractType, Employee, EmployeeStatus

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


def _data(world, **overrides):
    data = {
        "employee_number": "E100",
        "first_name": "Nour",
        "last_name": "Nouvelle",
        "professional_email": "nour.nouvelle@impactrisks.com",
        "hire_date": date(2026, 11, 2),
        "contract_type": ContractType.PERMANENT,
        "department": world.dept_a,
        "position": world.position,
        "manager": world.manager,
    }
    data.update(overrides)
    return data


def _problems(error) -> dict[str, str]:
    return {problem.field: problem.code for problem in error.value.problems}


def test_create_employee_stores_and_audits(world):
    employee = services.create_employee(actor=world.hr_user, data=_data(world, phone=" 20 123 456 "))

    assert employee.status == EmployeeStatus.ACTIVE
    assert employee.phone == "20 123 456"
    assert employee.manager == world.manager
    assert employee.user is None
    event = AuditEvent.objects.get(action="employee.created")
    assert event.object_id == str(employee.public_id)
    assert event.object_label == "Nour Nouvelle"
    assert event.changes["department"] == {"before": None, "after": "DEP-A"}
    assert event.changes["manager"] == {"before": None, "after": "Mounir Manager"}
    assert event.changes["hire_date"] == {"before": None, "after": "2026-11-02"}


def test_professional_email_is_normalised(world):
    employee = services.create_employee(
        actor=world.hr_user, data=_data(world, professional_email="  Nour.Nouvelle@ImpactRisks.COM ")
    )

    assert employee.professional_email == "nour.nouvelle@impactrisks.com"


@pytest.mark.parametrize(
    "email",
    [
        "nour@impactrisks.com.evil.org",
        "nour@impact-risks.com",
        "nour@evilimpactrisks.com",
        "nour@gmail.com",
        "nour@x@impactrisks.com",
    ],
)
def test_lookalike_domains_are_refused(world, email):
    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=_data(world, professional_email=email))

    assert _problems(error) == {"professional_email": "organisation.email_domain"}
    assert error.value.problems[0].params == {"domain": "impactrisks.com"}


def test_email_uniqueness_ignores_case(world):
    taken = world.owner.professional_email.upper()

    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=_data(world, professional_email=taken))

    assert _problems(error) == {"professional_email": "organisation.email_taken"}


def test_every_problem_is_reported_at_once(world):
    data = _data(
        world,
        employee_number="e004",
        professional_email="nour@gmail.com",
        contract_start_date=date(2026, 6, 1),
        contract_end_date=date(2026, 5, 31),
    )

    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=data)

    assert _problems(error) == {
        "employee_number": "organisation.number_taken",
        "professional_email": "organisation.email_domain",
        "contract_end_date": "organisation.contract_dates",
    }
    assert not Employee.objects.filter(first_name="Nour").exists()


def test_update_employee_audits_before_and_after(world):
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000", "department": world.dept_b}
    )

    world.owner.refresh_from_db()
    assert world.owner.department == world.dept_b
    event = AuditEvent.objects.get(action="employee.updated")
    assert event.object_id == str(world.owner.public_id)
    assert event.changes == {
        "phone": {"before": "", "after": "71 000 000"},
        "department": {"before": "DEP-A", "after": "DEP-B"},
    }


def test_an_update_that_changes_nothing_is_not_audited(world):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"first_name": "Amal"})

    assert not AuditEvent.objects.filter(action="employee.updated").exists()


def test_keeping_your_own_number_and_email_is_not_a_duplicate(world):
    services.update_employee(
        actor=world.hr_user,
        employee=world.owner,
        data={"employee_number": "E004", "professional_email": world.owner.professional_email},
    )


def test_manager_cannot_be_the_employee(world):
    with pytest.raises(DomainError) as error:
        services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": world.owner})

    assert _problems(error) == {"manager": "organisation.manager_self"}


def test_manager_loop_is_refused_at_any_depth(world):
    # owner -> manager -> ceo: making the CEO report to the owner would close the loop.
    with pytest.raises(DomainError) as two_levels:
        services.update_employee(actor=world.hr_user, employee=world.ceo, data={"manager": world.owner})
    with pytest.raises(DomainError) as one_level:
        services.update_employee(actor=world.hr_user, employee=world.manager, data={"manager": world.peer})

    assert _problems(two_levels) == {"manager": "organisation.manager_loop"}
    assert _problems(one_level) == {"manager": "organisation.manager_loop"}
    world.ceo.refresh_from_db()
    assert world.ceo.manager is None


def test_moving_someone_to_another_manager_or_to_none_is_allowed(world):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": world.other_manager})
    world.owner.refresh_from_db()
    assert world.owner.manager == world.other_manager

    services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": None})
    world.owner.refresh_from_db()
    assert world.owner.manager is None
    last = AuditEvent.objects.filter(action="employee.updated").order_by("-id").first()
    assert last.changes == {"manager": {"before": "Nadia Manager", "after": None}}


def test_contract_dates_are_checked_against_the_stored_ones(world):
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"contract_start_date": date(2026, 1, 1)}
    )

    with pytest.raises(DomainError) as error:
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"contract_end_date": date(2025, 12, 31)}
        )

    assert _problems(error) == {"contract_end_date": "organisation.contract_dates"}


def test_status_moves_between_active_and_suspended_only(world):
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.SUSPENDED}
    )
    world.owner.refresh_from_db()
    assert world.owner.status == EmployeeStatus.SUSPENDED

    with pytest.raises(ValueError, match="archive_employee"):
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.ARCHIVED}
        )


def test_an_archived_employee_cannot_be_brought_back_by_an_edit(world):
    Employee.objects.filter(pk=world.owner.pk).update(status=EmployeeStatus.ARCHIVED)
    world.owner.refresh_from_db()

    with pytest.raises(Conflict) as error:
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.ACTIVE}
        )

    assert error.value.code == "organisation.already_archived"


def test_someone_who_left_cannot_become_a_manager(world):
    Employee.objects.filter(pk=world.other_manager.pk).update(status=EmployeeStatus.ARCHIVED)
    world.other_manager.refresh_from_db()

    with pytest.raises(DomainError) as error:
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"manager": world.other_manager}
        )
    with pytest.raises(DomainError) as on_creation:
        services.create_employee(actor=world.hr_user, data=_data(world, manager=world.other_manager))

    assert _problems(error) == {"manager": "organisation.manager_left"}
    assert _problems(on_creation) == {"manager": "organisation.manager_left"}


def test_the_record_of_someone_whose_manager_left_can_still_be_edited(world):
    # After a departure the reports keep pointing at the leaver until HR names a new manager (Task 7).
    Employee.objects.filter(pk=world.manager.pk).update(status=EmployeeStatus.ARCHIVED)
    world.manager.refresh_from_db()

    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000", "manager": world.manager}
    )

    world.owner.refresh_from_db()
    assert (world.owner.phone, world.owner.manager) == ("71 000 000", world.manager)
