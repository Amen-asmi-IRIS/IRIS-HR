from dataclasses import asdict

from rest_framework import serializers

from apps.calendar.lang import pick
from apps.requests.api.serializers import RequestOut
from apps.requests.models import CalendarLabel
from apps.requests.representation import represent, viewer_for

NEEDS_YOU_KINDS = ["returned", "certificate_due"]
PRESENCE_STATES = ["in", "absent", "remote"]
DELEGATION_DIRECTIONS = ["given", "received"]


class HomeBalanceOut(serializers.Serializer):
    current = serializers.DecimalField(max_digits=7, decimal_places=2)
    pending = serializers.DecimalField(max_digits=7, decimal_places=2)
    approved_upcoming = serializers.DecimalField(max_digits=7, decimal_places=2)
    next_credit_amount = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    next_credit_date = serializers.DateField(allow_null=True)


class NeedsYouOut(serializers.Serializer):
    kind = serializers.ChoiceField(choices=NEEDS_YOU_KINDS)
    request = RequestOut()
    due_at = serializers.DateTimeField(allow_null=True)


class MeHomeOut(serializers.Serializer):
    balance = HomeBalanceOut()
    needs_you = NeedsYouOut(many=True)
    in_progress = RequestOut(many=True)
    coming_up = RequestOut(many=True)


def me_home_payload(data, user) -> dict:
    """The home as plain data. Each request is represented for this viewer, as everywhere else."""
    viewer = viewer_for(user)
    return {
        "balance": asdict(data.balance),
        "needs_you": [
            {"kind": item.kind, "request": represent(item.request, viewer), "due_at": item.due_at}
            for item in data.needs_you
        ],
        "in_progress": [represent(request, viewer) for request in data.in_progress],
        "coming_up": [represent(request, viewer) for request in data.coming_up],
    }


class HomePersonOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class OutPersonOut(serializers.Serializer):
    employee = HomePersonOut()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    type_name = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    today = serializers.BooleanField()
    # A sick leave that waits for HR (master D52).
    waiting = serializers.BooleanField()


class DelegationLineOut(serializers.Serializer):
    direction = serializers.ChoiceField(choices=DELEGATION_DIRECTIONS)
    person = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class TeamPersonOut(serializers.Serializer):
    public_id = serializers.CharField()
    today = serializers.ChoiceField(choices=PRESENCE_STATES)
    waiting = serializers.BooleanField()
    balance = serializers.DecimalField(max_digits=7, decimal_places=2)


class TeamHomeOut(serializers.Serializer):
    who_is_out = OutPersonOut(many=True)
    delegation = DelegationLineOut(allow_null=True)
    people = TeamPersonOut(many=True)


def team_home_payload(data) -> dict:
    delegation = data.delegation
    return {
        "who_is_out": [
            {
                "employee": {"public_id": person.employee_public_id, "name": person.name},
                "label": person.label,
                "type_name": pick(person.type_name_fr, person.type_name_en),
                "start_date": person.start_date,
                "end_date": person.end_date,
                "starts_at_midday": person.starts_at_midday,
                "ends_at_midday": person.ends_at_midday,
                "today": person.today,
                "waiting": person.waiting,
            }
            for person in data.who_is_out
        ],
        "delegation": None
        if delegation is None
        else {
            "direction": delegation.direction,
            "person": delegation.person,
            "start_date": delegation.start_date,
            "end_date": delegation.end_date,
        },
        "people": [
            {
                "public_id": person.employee_public_id,
                "today": person.today,
                "waiting": person.waiting,
                "balance": person.balance,
            }
            for person in data.people
        ],
    }


class OutNameOut(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    waiting = serializers.BooleanField()


class OutDepartmentOut(serializers.Serializer):
    department = serializers.CharField()
    today = OutNameOut(many=True)
    week = OutNameOut(many=True)


class AbsenceMonthOut(serializers.Serializer):
    department = serializers.CharField()
    days = serializers.DecimalField(max_digits=7, decimal_places=2)
    previous_days = serializers.DecimalField(max_digits=7, decimal_places=2)


class DepartmentBalanceOut(serializers.Serializer):
    department = serializers.CharField()
    total = serializers.DecimalField(max_digits=9, decimal_places=2)


class PersonBalanceOut(serializers.Serializer):
    name = serializers.CharField()
    department = serializers.CharField()
    balance = serializers.DecimalField(max_digits=7, decimal_places=2)


class LeaveOwedOut(serializers.Serializer):
    departments = DepartmentBalanceOut(many=True)
    largest = PersonBalanceOut(many=True)


class WaitingLineOut(serializers.Serializer):
    request_public_id = serializers.CharField()
    employee_name = serializers.CharField(allow_blank=True)
    type_name = serializers.CharField()
    waiting_on = serializers.ListField(child=serializers.CharField())
    since = serializers.DateTimeField(allow_null=True)


class OverviewHomeOut(serializers.Serializer):
    out_now = OutDepartmentOut(many=True)
    absence_this_month = AbsenceMonthOut(many=True)
    leave_owed = LeaveOwedOut()
    waiting = WaitingLineOut(many=True)


def overview_home_payload(data) -> dict:
    def department(item) -> str:
        return pick(item.department_fr, item.department_en)

    def out_name(person) -> dict:
        return {
            "name": person.name,
            "label": person.label,
            "start_date": person.start_date,
            "end_date": person.end_date,
            "waiting": person.waiting,
        }

    return {
        "out_now": [
            {
                "department": department(group),
                "today": [out_name(p) for p in group.today],
                "week": [out_name(p) for p in group.week],
            }
            for group in data.out_now
        ],
        "absence_this_month": [
            {"department": department(line), "days": line.days, "previous_days": line.previous_days}
            for line in data.absence_this_month
        ],
        "leave_owed": {
            "departments": [
                {"department": department(line), "total": line.total} for line in data.leave_owed.departments
            ],
            "largest": [
                {"name": person.name, "department": department(person), "balance": person.balance}
                for person in data.leave_owed.largest
            ],
        },
        "waiting": [
            {
                "request_public_id": line.request_public_id,
                "employee_name": line.employee_name,
                "type_name": pick(line.type_name_fr, line.type_name_en),
                "waiting_on": line.waiting_on,
                "since": line.since,
            }
            for line in data.waiting
        ],
    }


class WorkspaceSummaryOut(serializers.Serializer):
    me = serializers.IntegerField()
    team = serializers.IntegerField()
    hr = serializers.IntegerField()
    overview = serializers.IntegerField()
    admin = serializers.IntegerField()
