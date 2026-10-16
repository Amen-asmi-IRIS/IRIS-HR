from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts import selectors
from apps.accounts.roles import ASSIGNABLE_CHOICES, roles_of
from apps.accounts.selectors import ACCOUNT_STATE_CHOICES
from apps.accounts.services import display_name
from apps.audit import selectors as audit_selectors
from apps.audit.api.serializers import AuditEventOut

RECENT_EVENTS = 20


class AccountOut(serializers.Serializer):
    """One row of the Accounts page (UI 9.2). Takes a User instance."""

    public_id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    last_login_at = serializers.DateTimeField(allow_null=True)
    has_employee = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, user) -> str:
        return display_name(user)

    @extend_schema_field(serializers.ChoiceField(choices=ACCOUNT_STATE_CHOICES))
    def get_state(self, user) -> str:
        return selectors.account_state(user)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_roles(self, user) -> list[str]:
        return sorted(role.value for role in roles_of(user))

    @extend_schema_field(serializers.BooleanField())
    def get_has_employee(self, user) -> bool:
        return selectors.has_employee(user)


class RoleAssignmentOut(serializers.Serializer):
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES)
    assigned_by = serializers.SerializerMethodField()
    assigned_at = serializers.DateTimeField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_assigned_by(self, assignment) -> str | None:
        return display_name(assignment.assigned_by) if assignment.assigned_by_id else None


class AccountDetailOut(AccountOut):
    """The Account page (UI 9.4)."""

    role_assignments = RoleAssignmentOut(many=True)
    previous_login_at = serializers.DateTimeField(allow_null=True)
    failed_attempts = serializers.IntegerField()
    locked_until = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()
    created_by = serializers.SerializerMethodField()
    recent_events = serializers.SerializerMethodField()
    can_enable = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_created_by(self, user) -> str | None:
        return display_name(user.created_by) if user.created_by_id else None

    @extend_schema_field(AuditEventOut(many=True))
    def get_recent_events(self, user) -> list[dict]:
        events = audit_selectors.events_for_object("user", str(user.public_id)).filter(category="security")
        return AuditEventOut(events[:RECENT_EVENTS], many=True).data

    @extend_schema_field(serializers.BooleanField())
    def get_can_enable(self, user) -> bool:
        return selectors.can_enable(user)


class AccountFilterIn(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    state = serializers.ChoiceField(choices=ACCOUNT_STATE_CHOICES, required=False)
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES, required=False)


class AccountCreateIn(serializers.Serializer):
    """Either `employee` (the public id of an employee without account), or `email` and `full_name`."""

    email = serializers.CharField(required=False, allow_blank=True, max_length=254)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    employee = serializers.UUIDField(required=False, allow_null=True)
    roles = serializers.ListField(child=serializers.ChoiceField(choices=ASSIGNABLE_CHOICES), required=False)


class AccountCreatedOut(serializers.Serializer):
    account = AccountOut()
    temporary_password = serializers.CharField()
    expires_at = serializers.DateTimeField()


class TemporaryPasswordOut(serializers.Serializer):
    temporary_password = serializers.CharField()
    expires_at = serializers.DateTimeField()


class RoleIn(serializers.Serializer):
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES)


class CandidateOut(serializers.Serializer):
    public_id = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.CharField()
