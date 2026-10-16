import pytest
from django.core.management import call_command

from apps.organisation.models import Department, Employee, Position

pytestmark = pytest.mark.django_db


def test_seed_demo_builds_the_demo_company_once(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"

    call_command("seed_demo")
    call_command("seed_demo")

    assert Department.objects.count() == 4
    assert Position.objects.count() == 4
    assert Employee.objects.count() == 8
    owner = Employee.objects.select_related("user", "manager", "department").get(employee_number="E004")
    assert owner.user.email == "employee.a1@impactrisks.com"
    assert owner.manager.employee_number == "E003"
    assert owner.department.code == "UW"
    assert (owner.first_name, owner.last_name) == ("Amal", "Employee")
    assert owner.user.full_name == "Amal Employee"
    assert Employee.objects.get(employee_number="E001").manager is None
    assert Employee.objects.get(employee_number="E008").user is None
