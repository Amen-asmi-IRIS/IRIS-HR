from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from ..lang import pick
from ..models import PublicHoliday


class HolidayOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = PublicHoliday
        fields = ["id", "date", "name_fr", "name_en", "name", "recurs_yearly"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, holiday: PublicHoliday) -> str:
        return pick(holiday.name_fr, holiday.name_en)


class HolidayIn(serializers.Serializer):
    date = serializers.DateField()
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)
    recurs_yearly = serializers.BooleanField(required=False, default=False)


class HolidayPatchIn(serializers.Serializer):
    date = serializers.DateField(required=False)
    name_fr = serializers.CharField(max_length=120, required=False)
    name_en = serializers.CharField(max_length=120, required=False)
    recurs_yearly = serializers.BooleanField(required=False)


class HolidayCopyIn(serializers.Serializer):
    from_year = serializers.IntegerField(min_value=1900, max_value=2200)
    to_year = serializers.IntegerField(min_value=1900, max_value=2200)


class HolidayImpactOut(serializers.Serializer):
    """An approved request that covers the date of a holiday being added, moved or removed."""

    public_id = serializers.UUIDField()
    employee = serializers.CharField()
    type = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=9, decimal_places=2)
