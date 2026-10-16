from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.calendar.lang import pick
from apps.organisation import selectors as organisation_selectors

from ..models import (
    AmendmentKind,
    AmendmentStatus,
    ApproverRule,
    CalendarLabel,
    CapPeriod,
    ChainStep,
    Channel,
    Decision,
    ExceptionalEvent,
    RequestStatus,
    RequestType,
    StepMode,
    StepStatus,
    Unit,
)
from ..services.config import TYPE_FIELDS

# ---------------------------------------------------------------- configuration


class RequestTypeOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = RequestType
        fields = ["id", *TYPE_FIELDS, "name", "description"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, request_type: RequestType) -> str:
        return pick(request_type.name_fr, request_type.name_en)

    @extend_schema_field(serializers.CharField())
    def get_description(self, request_type: RequestType) -> str:
        return pick(request_type.description_fr, request_type.description_en)


class RequestTypeIn(serializers.ModelSerializer):
    class Meta:
        model = RequestType
        fields = list(TYPE_FIELDS)
        # The service reports a taken code with its own problem code.
        extra_kwargs = {"code": {"validators": []}}


class NamedPersonOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()


class ChainStepOut(serializers.ModelSerializer):
    named_person = serializers.SerializerMethodField()

    class Meta:
        model = ChainStep
        fields = [
            "id",
            "position",
            "approver_rule",
            "named_person",
            "mode",
            "reminder_after_days",
            "flag_after_days",
        ]

    @extend_schema_field(NamedPersonOut(allow_null=True))
    def get_named_person(self, step: ChainStep):
        if step.named_person_id is None:
            return None
        person = step.named_person
        return {"public_id": str(person.public_id), "name": organisation_selectors.full_name(person)}


class ChainStepIn(serializers.Serializer):
    approver_rule = serializers.ChoiceField(choices=ApproverRule.choices)
    named_person = serializers.UUIDField(required=False, allow_null=True, default=None)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    reminder_after_days = serializers.IntegerField(min_value=1, max_value=60, required=False, default=2)
    flag_after_days = serializers.IntegerField(
        min_value=1, max_value=60, required=False, allow_null=True, default=None
    )


class ChainStepsIn(serializers.Serializer):
    steps = ChainStepIn(many=True, allow_empty=False)


class ExceptionalEventOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = ExceptionalEvent
        fields = ["id", "name_fr", "name_en", "name", "days_allowed", "proof_required", "is_active"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, event: ExceptionalEvent) -> str:
        return pick(event.name_fr, event.name_en)


class ExceptionalEventIn(serializers.Serializer):
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)
    days_allowed = serializers.DecimalField(max_digits=7, decimal_places=2, min_value=Decimal("0"))
    proof_required = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)


class ChainRowOut(serializers.Serializer):
    position = serializers.IntegerField()
    rule = serializers.ChoiceField(choices=ApproverRule.choices)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    approvers = serializers.ListField(child=serializers.CharField())


# ---------------------------------------------------------------- requests: output (master 7.9)

STATE_KEYS = [
    "draft",
    "waiting_manager",
    "waiting_hr",
    "waiting_person",
    "returned",
    "approved",
    "rejected",
    "withdrawn",
    "cancelled",
]
RELATIONS = ["owner", "approver", "team", "hr", "overview"]
ACTIONS = [
    "edit",
    "submit",
    "discard",
    "withdraw",
    "amend",
    "withdraw_amendment",
    "attach",
    "decide",
    "record_on_behalf",
    "reassign",
    "correct",
    "cancel",
    "reclassify",
]
CERTIFICATE_STATUSES = ["not_needed", "attached", "due", "overdue", "missing"]
SKIP_REASONS = ["weekend", "holiday"]


def _quantity(**options) -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=9, decimal_places=2, **options)


class RequestEmployeeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()
    department = serializers.CharField()


class RequestTypeBrief(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    unit = serializers.ChoiceField(choices=Unit.choices)
    calendar_label = serializers.ChoiceField(choices=CalendarLabel.choices)


class RequestEventBrief(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class RequestStateOut(serializers.Serializer):
    key = serializers.ChoiceField(choices=STATE_KEYS)
    waiting_on = serializers.ListField(child=serializers.CharField())
    last_actor = serializers.CharField(allow_null=True)
    note = serializers.CharField(allow_null=True)
    since = serializers.DateTimeField(allow_null=True)


class RequestCertificateOut(serializers.Serializer):
    status = serializers.ChoiceField(choices=CERTIFICATE_STATUSES)
    due_at = serializers.DateTimeField(allow_null=True)


class RequestAmendmentBrief(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    status = serializers.ChoiceField(choices=AmendmentStatus.choices)
    state_key = serializers.ChoiceField(choices=STATE_KEYS)
    waiting_on = serializers.ListField(child=serializers.CharField())


class RequestViewerOut(serializers.Serializer):
    relation = serializers.ChoiceField(choices=RELATIONS)
    actions = serializers.ListField(child=serializers.ChoiceField(choices=ACTIONS))
    step_id = serializers.IntegerField(allow_null=True)


class RequestOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    version = serializers.IntegerField()
    employee = RequestEmployeeOut()
    type = RequestTypeBrief()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    start_time = serializers.TimeField(allow_null=True)
    end_time = serializers.TimeField(allow_null=True)
    quantity = _quantity()
    event = RequestEventBrief(allow_null=True)
    comment = serializers.CharField(allow_null=True, allow_blank=True)
    comment_hidden = serializers.BooleanField()
    status = serializers.ChoiceField(choices=RequestStatus.choices)
    state = RequestStateOut()
    certificate = RequestCertificateOut(allow_null=True)
    amendment = RequestAmendmentBrief(allow_null=True)
    has_override = serializers.BooleanField()
    created_by_hr = serializers.BooleanField()
    viewer = RequestViewerOut()
    submitted_at = serializers.DateTimeField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class RequestStepOut(serializers.Serializer):
    id = serializers.IntegerField()
    round = serializers.IntegerField()
    position = serializers.IntegerField()
    rule = serializers.ChoiceField(choices=ApproverRule.choices)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    status = serializers.ChoiceField(choices=StepStatus.choices)
    approvers = serializers.ListField(child=serializers.CharField())
    decided_by = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    recorded_by = serializers.CharField(allow_null=True)
    channel = serializers.ChoiceField(choices=Channel.choices, allow_null=True)
    comment = serializers.CharField(allow_null=True)
    amendment_public_id = serializers.UUIDField(allow_null=True)


class RequestAttachmentOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.CharField()  # medical, proof or scanned_form: the kinds of apps.files
    name = serializers.CharField()
    size = serializers.IntegerField()
    uploaded_by = serializers.CharField()
    uploaded_at = serializers.DateTimeField()


class RequestAmendmentOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    status = serializers.ChoiceField(choices=AmendmentStatus.choices)
    reason = serializers.CharField(allow_null=True)
    new_start_date = serializers.DateField(allow_null=True)
    new_end_date = serializers.DateField(allow_null=True)
    new_quantity = _quantity(allow_null=True)
    created_at = serializers.DateTimeField()
    decided_at = serializers.DateTimeField(allow_null=True)


class BalanceNowAfterOut(serializers.Serializer):
    now = _quantity()
    after = _quantity()


class TeammateAwayOut(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class CapUsedOut(serializers.Serializer):
    used = _quantity()
    limit = _quantity()


class DecisionContextOut(serializers.Serializer):
    balance = BalanceNowAfterOut(allow_null=True)
    teammates_away = TeammateAwayOut(many=True)
    cap = CapUsedOut(allow_null=True)


class RequestDetailOut(RequestOut):
    steps = RequestStepOut(many=True)
    attachments = RequestAttachmentOut(many=True)
    amendments = RequestAmendmentOut(many=True)
    decision_context = DecisionContextOut(allow_null=True)


class HistoryItemOut(serializers.Serializer):
    at = serializers.DateTimeField()
    actor = serializers.CharField(allow_null=True)
    action = serializers.CharField()
    summary = serializers.CharField()
    changes = serializers.JSONField()


# ---------------------------------------------------------------- requests: preview


class RequestDataIn(serializers.Serializer):
    """The fields a person fills in. `exceptional_event` is the id of an exceptional event."""

    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    exceptional_event = serializers.IntegerField(required=False, allow_null=True, default=None)


class PreviewIn(RequestDataIn):
    type = serializers.SlugField()
    employee = serializers.UUIDField(required=False, allow_null=True, default=None)
    request = serializers.UUIDField(required=False, allow_null=True, default=None)
    override = serializers.BooleanField(required=False, default=False)


class SkippedDayOut(serializers.Serializer):
    date = serializers.DateField()
    reason = serializers.ChoiceField(choices=SKIP_REASONS)


class BalancePreviewOut(serializers.Serializer):
    now = _quantity()
    on_start = _quantity()
    after = _quantity()


class CapUsageOut(serializers.Serializer):
    used = _quantity()
    limit = _quantity()
    period = serializers.ChoiceField(choices=CapPeriod.choices)


class UsageOut(serializers.Serializer):
    cap = CapUsageOut(allow_null=True)
    month_hours = _quantity(allow_null=True)
    event_days_allowed = _quantity(allow_null=True)


class ProblemOut(serializers.Serializer):
    field = serializers.CharField(allow_null=True)
    code = serializers.CharField()
    detail = serializers.CharField()
    params = serializers.JSONField()


class PreviewOut(serializers.Serializer):
    quantity = _quantity()
    skipped_days = SkippedDayOut(many=True)
    chain = ChainRowOut(many=True)
    balance = BalancePreviewOut(allow_null=True)
    usage = UsageOut()
    certificate_due_at = serializers.DateTimeField(allow_null=True)
    problems = ProblemOut(many=True)


# ---------------------------------------------------------------- requests: input

_REASON = {"required": False, "allow_blank": True, "default": "", "max_length": 2000}


class RequestIn(RequestDataIn):
    type = serializers.SlugField()
    employee = serializers.UUIDField(required=False, allow_null=True, default=None)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=4000)
    override_reason = serializers.CharField(**_REASON)


class RequestPatchIn(serializers.Serializer):
    """Only the fields that are sent are changed. `version` is the version the caller last saw."""

    version = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    starts_at_midday = serializers.BooleanField(required=False)
    ends_at_midday = serializers.BooleanField(required=False)
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    exceptional_event = serializers.IntegerField(required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class VersionIn(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)


class FileIn(serializers.Serializer):
    file = serializers.FileField()


class AmendmentIn(serializers.Serializer):
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(**_REASON)


class CorrectIn(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(**_REASON)


class ReasonIn(serializers.Serializer):
    reason = serializers.CharField(**_REASON)


class ReclassifyIn(serializers.Serializer):
    override_reason = serializers.CharField(**_REASON)


# ---------------------------------------------------------------- approvals and steps


class ApprovalItemOut(serializers.Serializer):
    step_id = serializers.IntegerField()
    request = RequestOut()
    waiting_since = serializers.DateTimeField(allow_null=True)
    via_delegation_from = serializers.CharField(allow_null=True)
    decision_context = DecisionContextOut()


class DecideIn(serializers.Serializer):
    decision = serializers.ChoiceField(choices=Decision.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    version = serializers.IntegerField(min_value=1)


class RecordOnBehalfIn(serializers.Serializer):
    decided_by = serializers.UUIDField()
    decision = serializers.ChoiceField(choices=Decision.choices)
    decided_at = serializers.DateTimeField()
    # Every channel is accepted here; the service refuses "in_app" with a message that says what to choose.
    channel = serializers.ChoiceField(choices=Channel.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    version = serializers.IntegerField(min_value=1)
    scan = serializers.FileField(required=False, allow_null=True, default=None)


class ReassignIn(serializers.Serializer):
    new_approver = serializers.UUIDField()
    reason = serializers.CharField(**_REASON)
