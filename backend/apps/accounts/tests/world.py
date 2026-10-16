"""Builders for accounts. Used by this app's tests and by the standard cast (backend/tests/world.py)."""

import itertools

from apps.accounts.models import RoleAssignment, User

PASSWORD = "Correct-Horse-42!"

_sequence = itertools.count(1)


def _name_from(email: str) -> str:
    return email.split("@")[0].replace(".", " ").title()


def make_user(email=None, *, password=PASSWORD, full_name=None, roles=(), **extra) -> User:
    address = email or f"person{next(_sequence)}@impactrisks.com"
    name = _name_from(address) if full_name is None else full_name
    user = User.objects.create_user(address, password, full_name=name, **extra)
    for role in roles:
        RoleAssignment.objects.create(user=user, role=str(role))
    return user


def build(world) -> None:
    """The accounts of the standard cast (master 6.11). Later plans attach employee records to them."""
    world.sysadmin_user = make_user("sysadmin@impactrisks.com", full_name="Sonia Admin", roles=["sysadmin"])
    world.exec_user = make_user("ceo@impactrisks.com", full_name="Karim Directeur", roles=["exec"])
    world.hr_user = make_user("hr@impactrisks.com", full_name="Senna RH", roles=["hr"])
    world.manager_user = make_user("manager.a@impactrisks.com", full_name="Mounir Manager")
    world.owner_user = make_user("employee.a1@impactrisks.com", full_name="Amal Employee")
    world.peer_user = make_user("employee.a2@impactrisks.com", full_name="Bilel Employee")
    world.other_manager_user = make_user("manager.b@impactrisks.com", full_name="Nadia Manager")
    world.outsider_user = make_user("employee.b1@impactrisks.com", full_name="Chokri Employee")
