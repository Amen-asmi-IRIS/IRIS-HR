from rest_framework import serializers

from apps.core.i18n import translate

AMOUNT = {"max_digits": 7, "decimal_places": 2}
ADJUSTMENT_KINDS = ("opening", "adjustment")


class BalanceQuery(serializers.Serializer):
    on = serializers.DateField(required=False)


class BalanceEmployeeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()


class BalanceAsOfOut(serializers.Serializer):
    date = serializers.DateField(source="on")
    balance = serializers.DecimalField(**AMOUNT)
    projected = serializers.BooleanField()


class BalanceOut(serializers.Serializer):
    employee = BalanceEmployeeOut()
    current = serializers.DecimalField(**AMOUNT)
    pending = serializers.DecimalField(**AMOUNT)
    approved_upcoming = serializers.DecimalField(**AMOUNT)
    next_credit_amount = serializers.DecimalField(**AMOUNT, allow_null=True)
    next_credit_date = serializers.DateField(allow_null=True)
    has_opening = serializers.BooleanField()
    # The date an opening balance is stated as of (the day before monthly credits start); null while they have none.
    opening_date = serializers.DateField(allow_null=True)
    # HR may still enter an opening balance for this person (none yet, hired before credits start; master D50).
    can_enter_opening = serializers.BooleanField()
    as_of = BalanceAsOfOut(allow_null=True)


class LedgerLineOut(serializers.Serializer):
    id = serializers.IntegerField()
    # A plain string (opening, credit, taken, restored, adjustment): several serializers have a field `kind`,
    # and one more choice set under that name would make the generated enum names unstable.
    kind = serializers.CharField()
    amount = serializers.DecimalField(**AMOUNT)
    effective_date = serializers.DateField()
    period = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    request_public_id = serializers.CharField(allow_null=True)
    created_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    balance_after = serializers.DecimalField(**AMOUNT)


class AdjustmentIn(serializers.Serializer):
    kind = serializers.CharField(help_text="opening or adjustment")
    amount = serializers.DecimalField(**AMOUNT)
    effective_date = serializers.DateField()
    reason = serializers.CharField(allow_blank=True, max_length=500)

    def validate_kind(self, value: str) -> str:
        if value not in ADJUSTMENT_KINDS:
            raise serializers.ValidationError(translate("balances.unknown_kind"), code="invalid_choice")
        return value
