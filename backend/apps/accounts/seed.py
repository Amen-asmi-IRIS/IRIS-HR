"""Demo accounts for development and browser tests: the standard cast of master 6.11. Never used in production."""

from apps.accounts.models import RoleAssignment, User

DEMO_PASSWORD = "Correct-Horse-42!"

# (email, full name, assigned roles). Later plans attach employee records to these accounts.
ACCOUNTS = [
    ("sysadmin@impactrisks.com", "Sonia Admin", ("sysadmin",)),
    ("ceo@impactrisks.com", "Karim Directeur", ("exec",)),
    ("hr@impactrisks.com", "Senna RH", ("hr",)),
    ("manager.a@impactrisks.com", "Mounir Manager", ()),
    ("employee.a1@impactrisks.com", "Amal Employee", ()),
    ("employee.a2@impactrisks.com", "Bilel Employee", ()),
    ("manager.b@impactrisks.com", "Nadia Manager", ()),
    ("employee.b1@impactrisks.com", "Chokri Employee", ()),
]


def seed() -> None:
    """Creates what is missing. An account that exists is left as it is, password included."""
    for email, full_name, roles in ACCOUNTS:
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(email, DEMO_PASSWORD, full_name=full_name)
        for role in roles:
            RoleAssignment.objects.get_or_create(user=user, role=role)
