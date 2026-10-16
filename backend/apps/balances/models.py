from django.conf import settings
from django.db import models
from django.db.models import Q


class LedgerKind(models.TextChoices):
    OPENING = "opening", "Opening balance"
    CREDIT = "credit", "Month-end credit"
    TAKEN = "taken", "Leave taken"
    RESTORED = "restored", "Restoration"
    ADJUSTMENT = "adjustment", "Adjustment"


class LedgerEntry(models.Model):
    """One line of an employee's annual-leave ledger. Never updated, never deleted (BAL-01)."""

    employee = models.ForeignKey(
        "organisation.Employee", on_delete=models.PROTECT, related_name="ledger_entries"
    )
    kind = models.CharField(max_length=12, choices=LedgerKind.choices)
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    effective_date = models.DateField()
    # "2026-03" on a month-end credit, empty on every other line.
    period = models.CharField(max_length=7, blank=True, default="")
    # The request behind a `taken` or `restored` line: a plain integer, no cross-app foreign key (master 7.10).
    request_id = models.BigIntegerField(null=True, blank=True)
    reason = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["effective_date", "id"]
        indexes = [
            models.Index(fields=["employee", "effective_date"], name="balances_emp_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "period"],
                condition=Q(kind="credit"),
                name="balances_one_credit_per_month",
            ),
            models.UniqueConstraint(
                fields=["employee"],
                condition=Q(kind="opening"),
                name="balances_one_opening_per_employee",
            ),
            models.CheckConstraint(
                condition=(Q(kind="credit") & ~Q(period="")) | (~Q(kind="credit") & Q(period="")),
                name="balances_period_only_on_credit",
            ),
            models.CheckConstraint(
                condition=Q(kind__in=["taken", "restored"], request_id__isnull=False)
                | ~Q(kind__in=["taken", "restored"]),
                name="balances_leave_entries_name_request",
            ),
            models.CheckConstraint(
                condition=Q(kind="opening")
                | Q(kind="credit", amount__gt=0)
                | Q(kind="taken", amount__lt=0)
                | Q(kind="restored", amount__gt=0)
                | (Q(kind="adjustment") & ~Q(amount=0)),
                name="balances_amount_sign",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.effective_date} {self.kind} {self.amount}"
