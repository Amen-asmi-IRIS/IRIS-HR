"""Demo public holidays for development and browser tests. HR enters the real list at go-live."""

from datetime import date

from django.utils import timezone

from . import selectors, services

# Fixed-date holidays only. The religious holidays move each year and are left to HR.
FIXED = [
    (1, 1, "Jour de l'an", "New Year's Day"),
    (3, 20, "Fête de l'Indépendance", "Independence Day"),
    (4, 9, "Journée des Martyrs", "Martyrs' Day"),
    (5, 1, "Fête du Travail", "Labour Day"),
    (7, 25, "Fête de la République", "Republic Day"),
    (8, 13, "Journée de la Femme", "Women's Day"),
    (10, 15, "Fête de l'Évacuation", "Evacuation Day"),
    (12, 17, "Fête de la Révolution", "Revolution Day"),
]


def seed() -> None:
    this_year = timezone.localdate().year
    for year in (this_year, this_year + 1):
        existing = {holiday.date for holiday in selectors.holidays_of_year(year)}
        for month, day, name_fr, name_en in FIXED:
            if date(year, month, day) not in existing:
                services.create_holiday(
                    actor=None,
                    date=date(year, month, day),
                    name_fr=name_fr,
                    name_en=name_en,
                    recurs_yearly=True,
                )
