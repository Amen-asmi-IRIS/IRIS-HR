from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import PublicIdModel, TimeStampedModel


class Unit(models.TextChoices):
    DAY = "day", "Day"
    HOUR = "hour", "Hour"


class BalanceEffect(models.TextChoices):
    DEDUCTS_ANNUAL = "deducts_annual", "Deducts from the annual balance"
    NONE = "none", "None"


class DocumentRule(models.TextChoices):
    NONE = "none", "None"
    REQUIRED_WITHIN_DEADLINE = "required_within_deadline", "Required within a deadline"


class CapPeriod(models.TextChoices):
    NONE = "none", "None"
    WEEK = "week", "Week"
    MONTH = "month", "Month"


class CalendarLabel(models.TextChoices):
    ABSENT = "absent", "Absent"
    REMOTE = "remote", "Remote"
    HIDDEN = "hidden", "Hidden"


class ApproverRule(models.TextChoices):
    LINE_MANAGER = "line_manager", "Line manager"
    HR_ROLE = "hr_role", "HR role"
    NAMED_PERSON = "named_person", "Named person"


class StepMode(models.TextChoices):
    APPROVE = "approve", "Approve"
    NOTIFY = "notify", "Notify"


class RequestStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    RETURNED = "returned", "Returned"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"
    CANCELLED = "cancelled", "Cancelled"


class StepStatus(models.TextChoices):
    WAITING = "waiting", "Waiting"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    RETURNED = "returned", "Returned"
    NOTIFIED = "notified", "Notified"
    SKIPPED = "skipped", "Skipped"


class AmendmentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


class AmendmentKind(models.TextChoices):
    CANCEL = "cancel", "Cancel"
    CHANGE = "change", "Change"


class Channel(models.TextChoices):
    IN_APP = "in_app", "In the application"
    VERBAL = "verbal", "Verbal"
    PAPER = "paper", "Paper"


class Decision(models.TextChoices):
    APPROVE = "approve", "Approve"
    REJECT = "reject", "Reject"
    RETURN = "return", "Return"


class RequestType(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    description_fr = models.CharField(max_length=240, blank=True)
    description_en = models.CharField(max_length=240, blank=True)
    unit = models.CharField(max_length=8, choices=Unit.choices)
    allows_half_day = models.BooleanField(default=False)
    balance_effect = models.CharField(
        max_length=20, choices=BalanceEffect.choices, default=BalanceEffect.NONE
    )
    document_rule = models.CharField(max_length=32, choices=DocumentRule.choices, default=DocumentRule.NONE)
    document_deadline_hours = models.PositiveIntegerField(null=True, blank=True)
    allows_past_dates = models.BooleanField(default=False)
    notice_days = models.PositiveIntegerField(default=0)
    cap_quantity = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    cap_period = models.CharField(max_length=8, choices=CapPeriod.choices, default=CapPeriod.NONE)
    reduces_meal_tickets = models.BooleanField(default=False)
    calendar_label = models.CharField(
        max_length=8, choices=CalendarLabel.choices, default=CalendarLabel.ABSENT
    )
    is_sensitive = models.BooleanField(default=False)
    uses_events = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self) -> str:
        return self.code


class ChainStep(models.Model):
    request_type = models.ForeignKey(RequestType, on_delete=models.CASCADE, related_name="chain_steps")
    position = models.PositiveSmallIntegerField()
    approver_rule = models.CharField(max_length=16, choices=ApproverRule.choices)
    named_person = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    mode = models.CharField(max_length=8, choices=StepMode.choices, default=StepMode.APPROVE)
    reminder_after_days = models.PositiveSmallIntegerField(default=2)
    flag_after_days = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["request_type", "position"], name="requests_chainstep_unique_position"
            )
        ]


class ExceptionalEvent(models.Model):
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    days_allowed = models.DecimalField(max_digits=7, decimal_places=2)
    proof_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_fr"]

    def __str__(self) -> str:
        return self.name_en


class Request(PublicIdModel, TimeStampedModel):
    employee = models.ForeignKey("organisation.Employee", on_delete=models.PROTECT, related_name="+")
    request_type = models.ForeignKey(RequestType, on_delete=models.PROTECT, related_name="requests")
    start_date = models.DateField()
    end_date = models.DateField()
    starts_at_midday = models.BooleanField(default=False)
    ends_at_midday = models.BooleanField(default=False)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    exceptional_event = models.ForeignKey(
        ExceptionalEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="requests"
    )
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=RequestStatus.choices, default=RequestStatus.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    override_reason = models.TextField(blank=True)
    certificate_due_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    # Set from the type when the request is created and never cleared, even after reclassification (master D17).
    sensitive = models.BooleanField(default=False)
    reclassified_from = models.ForeignKey(
        RequestType, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["employee", "status"], name="requests_req_emp_status"),
            models.Index(fields=["status", "start_date"], name="requests_req_status_start"),
        ]


class Amendment(PublicIdModel):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="amendments")
    kind = models.CharField(max_length=8, choices=AmendmentKind.choices)
    new_start_date = models.DateField(null=True, blank=True)
    new_end_date = models.DateField(null=True, blank=True)
    new_starts_at_midday = models.BooleanField(default=False)
    new_ends_at_midday = models.BooleanField(default=False)
    new_start_time = models.TimeField(null=True, blank=True)
    new_end_time = models.TimeField(null=True, blank=True)
    new_quantity = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    previous_start_date = models.DateField()
    previous_end_date = models.DateField()
    previous_starts_at_midday = models.BooleanField(default=False)
    previous_ends_at_midday = models.BooleanField(default=False)
    previous_start_time = models.TimeField(null=True, blank=True)
    previous_end_time = models.TimeField(null=True, blank=True)
    previous_quantity = models.DecimalField(max_digits=7, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=12, choices=AmendmentStatus.choices, default=AmendmentStatus.PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["request"],
                condition=models.Q(status="pending"),
                name="requests_one_open_amendment",
            )
        ]


class RequestStep(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="steps")
    amendment = models.ForeignKey(
        Amendment, null=True, blank=True, on_delete=models.CASCADE, related_name="steps"
    )
    round = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveSmallIntegerField()
    approver_rule = models.CharField(max_length=16, choices=ApproverRule.choices)
    mode = models.CharField(max_length=8, choices=StepMode.choices)
    named_person = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=10, choices=StepStatus.choices, default=StepStatus.WAITING)
    activated_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)
    flagged_at = models.DateTimeField(null=True, blank=True)
    # The person whose decision it is. They may have no account when the decision was given on paper.
    decided_by = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    # The HR holder who entered a decision given outside the application. Empty for an in-app decision.
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    channel = models.CharField(max_length=8, choices=Channel.choices, blank=True)
    comment = models.TextField(blank=True)
    reminder_after_days = models.PositiveSmallIntegerField(default=2)
    flag_after_days = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["round", "position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "amendment", "round", "position"],
                name="requests_step_unique_position",
                nulls_distinct=False,
            )
        ]
        indexes = [models.Index(fields=["status", "mode"], name="requests_step_status_mode")]


class RequestAttachment(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="attachment_links")
    attachment = models.OneToOneField("files.Attachment", on_delete=models.PROTECT, related_name="+")
    # Set for the scan of a signed form recorded with an on-behalf decision; empty for a certificate or a proof.
    step = models.ForeignKey(
        RequestStep, null=True, blank=True, on_delete=models.SET_NULL, related_name="scans"
    )
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["added_at", "id"]
