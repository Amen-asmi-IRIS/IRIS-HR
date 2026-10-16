from __future__ import annotations

from datetime import date

from django.db.models import QuerySet

from .models import PublicHoliday


def holidays_between(start: date, end: date) -> QuerySet[PublicHoliday]:
    return PublicHoliday.objects.filter(date__gte=start, date__lte=end).order_by("date")


def holidays_of_year(year: int) -> QuerySet[PublicHoliday]:
    return PublicHoliday.objects.filter(date__year=year).order_by("date")


from apps.calendar.feed import CalendarFeed, FeedEntry, FeedHoliday, calendar_feed  # noqa: E402,F401
