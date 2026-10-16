from decimal import Decimal
from importlib import import_module

from django.apps import apps as django_apps

from apps.requests.models import ExceptionalEvent, RequestType

TYPE_CODES = ("annual", "sick", "exceptional", "permission", "remote")


def ensure_seeded_types() -> None:
    """Put the five seeded request types back when a test emptied the tables.

    A transactional test ends by emptying every table, including the rows a data migration created
    (plan 01a, contract note 27). The migration's own function is reused, so the data exists once.
    """
    if RequestType.objects.filter(code__in=TYPE_CODES).count() == len(TYPE_CODES):
        return
    import_module("apps.requests.migrations.0002_seed_types").seed(django_apps, None)


def build(world) -> None:
    """Add the five seeded request types and one exceptional event to the standard cast."""
    ensure_seeded_types()
    for code in TYPE_CODES:
        setattr(world, code, RequestType.objects.get(code=code))
    world.event = ExceptionalEvent.objects.create(
        name_fr="Mariage", name_en="Marriage", days_allowed=Decimal("3"), proof_required=True
    )
