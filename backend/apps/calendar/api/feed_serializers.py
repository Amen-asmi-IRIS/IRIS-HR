from rest_framework import serializers

from apps.calendar.feed import CalendarFeed
from apps.calendar.lang import pick
from apps.requests.models import CalendarLabel

SCOPES = ["department", "team", "company"]
# What an entry can be on the calendar; null for a colleague's entry in department scope.
ENTRY_STATUSES = ["pending", "approved"]


class CalendarQuery(serializers.Serializer):
    to = serializers.DateField()
    scope = serializers.ChoiceField(choices=SCOPES)
    department = serializers.IntegerField(required=False)
    employee = serializers.UUIDField(required=False)
    type = serializers.CharField(required=False, max_length=50)
    status = serializers.ChoiceField(choices=ENTRY_STATUSES, required=False)

    def get_fields(self):
        # "from" is a Python keyword, so the field cannot be declared as a class attribute.
        fields = super().get_fields()
        fields["from"] = serializers.DateField()
        return fields


class CalendarHolidayOut(serializers.Serializer):
    date = serializers.DateField()
    name = serializers.CharField()


class CalendarEmployeeOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class CalendarEntryOut(serializers.Serializer):
    employee = CalendarEmployeeOut()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    type_code = serializers.CharField(allow_null=True)
    type_name = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=ENTRY_STATUSES, allow_null=True)
    request_public_id = serializers.CharField(allow_null=True)
    mine = serializers.BooleanField()


class CalendarOut(serializers.Serializer):
    holidays = CalendarHolidayOut(many=True)
    entries = CalendarEntryOut(many=True)
    working_week = serializers.ListField(child=serializers.IntegerField(min_value=1, max_value=7))


def feed_payload(feed: CalendarFeed) -> dict:
    """The feed as plain data, with names in the reader's language."""
    return {
        "working_week": list(feed.working_week),
        "holidays": [
            {"date": holiday.date, "name": pick(holiday.name_fr, holiday.name_en)}
            for holiday in feed.holidays
        ],
        "entries": [
            {
                "employee": {"public_id": entry.employee_public_id, "name": entry.employee_name},
                "start_date": entry.start_date,
                "end_date": entry.end_date,
                "starts_at_midday": entry.starts_at_midday,
                "ends_at_midday": entry.ends_at_midday,
                "label": entry.label,
                "type_code": entry.type_code,
                "type_name": pick(entry.type_name_fr, entry.type_name_en) if entry.type_code else None,
                "status": entry.status,
                "request_public_id": entry.request_public_id,
                "mine": entry.mine,
            }
            for entry in feed.entries
        ],
    }
