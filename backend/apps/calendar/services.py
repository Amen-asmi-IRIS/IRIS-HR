from __future__ import annotations

import datetime as dt

from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError

from .models import PublicHoliday

FIELDS = ("date", "name_fr", "name_en", "recurs_yearly")


def _label(holiday: PublicHoliday) -> str:
    return f"{holiday.date:%d/%m/%Y} {holiday.name_fr}"


@transaction.atomic
def create_holiday(
    *, actor, date: dt.date, name_fr: str, name_en: str, recurs_yearly: bool = False
) -> PublicHoliday:
    if PublicHoliday.objects.filter(date=date).exists():
        raise DomainError("calendar.holiday_exists", field="date")
    holiday = PublicHoliday.objects.create(
        date=date, name_fr=name_fr.strip(), name_en=name_en.strip(), recurs_yearly=recurs_yearly
    )
    audit.record(
        action="holiday.created",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(dict.fromkeys(FIELDS), audit.snapshot(holiday, FIELDS)),
        actor=actor,
    )
    return holiday


@transaction.atomic
def update_holiday(
    *, actor, holiday: PublicHoliday, date: dt.date, name_fr: str, name_en: str, recurs_yearly: bool
) -> PublicHoliday:
    if PublicHoliday.objects.filter(date=date).exclude(pk=holiday.pk).exists():
        raise DomainError("calendar.holiday_exists", field="date")
    before = audit.snapshot(holiday, FIELDS)
    holiday.date = date
    holiday.name_fr = name_fr.strip()
    holiday.name_en = name_en.strip()
    holiday.recurs_yearly = recurs_yearly
    holiday.save()
    audit.record(
        action="holiday.updated",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(before, audit.snapshot(holiday, FIELDS)),
        actor=actor,
    )
    return holiday


@transaction.atomic
def delete_holiday(*, actor, holiday: PublicHoliday) -> None:
    before = audit.snapshot(holiday, FIELDS)
    audit.record(
        action="holiday.deleted",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(before, dict.fromkeys(FIELDS)),
        actor=actor,
    )
    holiday.delete()


@transaction.atomic
def copy_recurring_holidays(*, actor, from_year: int, to_year: int) -> list[PublicHoliday]:
    """Copy the holidays marked as recurring to the same day and month of another year."""
    if to_year <= from_year:
        raise DomainError("calendar.year_invalid", field="to_year")
    existing = set(PublicHoliday.objects.filter(date__year=to_year).values_list("date", flat=True))
    created: list[PublicHoliday] = []
    for source in PublicHoliday.objects.filter(date__year=from_year, recurs_yearly=True).order_by("date"):
        try:
            target = source.date.replace(year=to_year)
        except ValueError:  # 29 February in a year that has none
            continue
        if target in existing:
            continue
        created.append(
            PublicHoliday.objects.create(
                date=target, name_fr=source.name_fr, name_en=source.name_en, recurs_yearly=True
            )
        )
    audit.record(
        action="holiday.copied",
        object_type="publicholiday",
        object_id=str(to_year),
        object_label=str(to_year),
        changes={"from_year": from_year, "to_year": to_year, "created": len(created)},
        actor=actor,
    )
    return created
