from rest_framework import serializers

# Named in ENUM_NAME_OVERRIDES (config/settings.py), so the generated client has stable type names.
COLUMN_KINDS = ["text", "number", "date", "datetime", "period"]
TOTAL_GROUPS = ["overall", "by_employee", "by_type"]
SCOPES = ["team", "all"]


class ReportColumnOut(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=COLUMN_KINDS)


class ReportTotalLineOut(serializers.Serializer):
    group = serializers.ChoiceField(choices=TOTAL_GROUPS)
    label = serializers.CharField()
    values = serializers.DictField()


class ReportTotalsOut(serializers.Serializer):
    lines = ReportTotalLineOut(many=True)


class ReportOut(serializers.Serializer):
    columns = ReportColumnOut(many=True)
    rows = serializers.ListField(child=serializers.DictField())
    totals = ReportTotalsOut(allow_null=True)
    # Sentences to read beside the figures, in the reader's language (master 13.1: credits still to come).
    notes = serializers.ListField(child=serializers.CharField())


class DepartmentOptionOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class EmployeeOptionOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class CodeOptionOut(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class ReportFiltersOut(serializers.Serializer):
    scope = serializers.ChoiceField(choices=SCOPES)
    departments = DepartmentOptionOut(many=True)
    employees = EmployeeOptionOut(many=True)
    actors = EmployeeOptionOut(many=True)
    types = CodeOptionOut(many=True)
    steps = CodeOptionOut(many=True)


class KpmgDefaultPeriodOut(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    cutoff_day = serializers.IntegerField(allow_null=True)
