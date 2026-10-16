"""The demo company for development and browser tests. Every name here is invented."""

from datetime import date

from django.contrib.auth import get_user_model

from .models import ContractType, Department, Employee, Position

_DEPARTMENTS = [
    ("DIR", "Direction générale", "Executive office"),
    ("UW", "Souscription", "Underwriting"),
    ("CLM", "Sinistres", "Claims"),
    ("FIN", "Finance et administration", "Finance and administration"),
]

_POSITIONS = [
    ("CEO", "Directeur général", "Chief executive officer", "A1"),
    ("HRR", "Responsable RH", "HR Responsible", "B1"),
    ("HEAD", "Chef de département", "Head of department", "B1"),
    ("OFF", "Chargé de clientèle", "Account officer", "C1"),
]

# number, first name, last name, professional email, department, position, manager, hire date
_PEOPLE = [
    ("E001", "Karim", "Directeur", "ceo@impactrisks.com", "DIR", "CEO", None, date(2015, 3, 2)),
    ("E002", "Senna", "RH", "hr@impactrisks.com", "FIN", "HRR", "E001", date(2018, 9, 3)),
    ("E003", "Mounir", "Manager", "manager.a@impactrisks.com", "UW", "HEAD", "E001", date(2017, 1, 9)),
    ("E004", "Amal", "Employee", "employee.a1@impactrisks.com", "UW", "OFF", "E003", date(2021, 6, 1)),
    ("E005", "Bilel", "Employee", "employee.a2@impactrisks.com", "UW", "OFF", "E003", date(2022, 2, 14)),
    ("E006", "Nadia", "Manager", "manager.b@impactrisks.com", "CLM", "HEAD", "E001", date(2016, 11, 21)),
    ("E007", "Chokri", "Employee", "employee.b1@impactrisks.com", "CLM", "OFF", "E006", date(2023, 4, 3)),
    ("E008", "Leila", "Ayari", "leila.ayari@impactrisks.com", "CLM", "OFF", "E006", date(2026, 9, 1)),
]


def seed() -> None:
    user_model = get_user_model()
    departments = {
        code: Department.objects.update_or_create(
            code=code, defaults={"name_fr": name_fr, "name_en": name_en}
        )[0]
        for code, name_fr, name_en in _DEPARTMENTS
    }
    positions = {
        code: Position.objects.update_or_create(
            code=code, defaults={"title_fr": title_fr, "title_en": title_en, "grade": grade}
        )[0]
        for code, title_fr, title_en, grade in _POSITIONS
    }
    people: dict[str, Employee] = {}
    for number, first_name, last_name, email, department, position, manager, hired in _PEOPLE:
        people[number], _ = Employee.objects.update_or_create(
            employee_number=number,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "professional_email": email,
                "department": departments[department],
                "position": positions[position],
                "manager": people.get(manager),
                "hire_date": hired,
                "contract_type": ContractType.PERMANENT,
                "user": user_model.objects.filter(email=email).first(),
            },
        )
