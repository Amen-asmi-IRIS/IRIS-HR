import uuid

from django.utils import translation
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema_field
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.accounts import services as accounts_services
from apps.accounts.roles import Role, has_role

from .. import reach, selectors
from ..models import ContractType, Department, Employee, EmployeeStatus, Gender, Position


def lang() -> str:
    """The reader's language, as activated by LanguageMiddleware."""
    return "en" if (translation.get_language() or "fr").startswith("en") else "fr"


# --- Departments and positions -------------------------------------------------------------


class DepartmentOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name_fr = serializers.CharField()
    name_en = serializers.CharField()
    name = serializers.SerializerMethodField()
    is_active = serializers.BooleanField()
    employee_count = serializers.IntegerField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return getattr(obj, f"name_{lang()}")


class DepartmentIn(serializers.Serializer):
    code = serializers.CharField(
        max_length=20, validators=[UniqueValidator(queryset=Department.objects.all(), lookup="iexact")]
    )
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)


class DepartmentPatchIn(DepartmentIn):
    is_active = serializers.BooleanField(required=False)


class PositionOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    title_fr = serializers.CharField()
    title_en = serializers.CharField()
    title = serializers.SerializerMethodField()
    grade = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    employee_count = serializers.IntegerField()

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj) -> str:
        return getattr(obj, f"title_{lang()}")


class PositionIn(serializers.Serializer):
    code = serializers.CharField(
        max_length=20, validators=[UniqueValidator(queryset=Position.objects.all(), lookup="iexact")]
    )
    title_fr = serializers.CharField(max_length=120)
    title_en = serializers.CharField(max_length=120)
    grade = serializers.CharField(max_length=40, required=False, allow_blank=True)


class PositionPatchIn(PositionIn):
    is_active = serializers.BooleanField(required=False)


# --- Employees -----------------------------------------------------------------------------


class PublicIdRelatedField(serializers.SlugRelatedField):
    """A related row addressed by its public identifier. A malformed identifier is "not found", never a crash."""

    def __init__(self, **kwargs):
        super().__init__(slug_field="public_id", **kwargs)

    def to_internal_value(self, data):
        try:
            uuid.UUID(str(data))
        except ValueError:
            self.fail("does_not_exist", slug_name="public_id", value=data)
        return super().to_internal_value(data)


class DepartmentRefOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return getattr(obj, f"name_{lang()}")


class PositionRefOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    title = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj) -> str:
        return getattr(obj, f"title_{lang()}")


class EmployeeRefOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)


class EmployeeBriefOut(EmployeeRefOut):
    department = serializers.SerializerMethodField()

    class Meta:
        # `accounts` already describes a component named EmployeeBriefOut (the employee of `auth/me`).
        ref_name = "EmployeeDirectoryOut"

    @extend_schema_field(serializers.CharField())
    def get_department(self, obj) -> str:
        return selectors.department_name(obj, lang())


class EmployeeTeamOut(serializers.Serializer):
    """What a manager reads about a member of the team: name, department, position, contact."""

    public_id = serializers.UUIDField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    name = serializers.SerializerMethodField()
    department = DepartmentRefOut()
    position = PositionRefOut()
    professional_email = serializers.EmailField()
    phone = serializers.CharField(allow_blank=True)

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)


class EmployeeOut(EmployeeTeamOut):
    """The whole record: for its owner, HR and executives."""

    employee_number = serializers.CharField()
    date_of_birth = serializers.DateField(allow_null=True)
    gender = serializers.CharField(allow_blank=True)
    personal_email = serializers.CharField(allow_blank=True)
    address = serializers.CharField(allow_blank=True)
    hire_date = serializers.DateField()
    contract_start_date = serializers.DateField(allow_null=True)
    contract_end_date = serializers.DateField(allow_null=True)
    contract_type = serializers.CharField()
    status = serializers.CharField()
    manager = EmployeeRefOut(allow_null=True)
    emergency_contact_name = serializers.CharField(allow_blank=True)
    emergency_contact_phone = serializers.CharField(allow_blank=True)
    archived_at = serializers.DateField(allow_null=True)
    archive_reason = serializers.CharField(allow_blank=True)
    has_account = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    @extend_schema_field(serializers.BooleanField())
    def get_has_account(self, obj) -> bool:
        return obj.user_id is not None


EmployeeDetailOut = PolymorphicProxySerializer(
    component_name="EmployeeDetail",
    serializers=[EmployeeOut, EmployeeTeamOut],
    resource_type_field_name=None,
)


def employee_detail(user, employee: Employee) -> dict:
    """The whole record for its owner, HR and executives; the team view for anyone else who may see it."""
    own = reach.employee_of(user)
    full = has_role(user, Role.HR, Role.EXEC) or (own is not None and own.id == employee.id)
    return (EmployeeOut if full else EmployeeTeamOut)(employee).data


class EmployeeListOut(serializers.Serializer):
    """One row of a list. The last three fields are null for a viewer who is neither HR nor an executive."""

    public_id = serializers.UUIDField()
    name = serializers.SerializerMethodField()
    department = DepartmentRefOut()
    position = PositionRefOut()
    professional_email = serializers.EmailField()
    phone = serializers.CharField(allow_blank=True)
    employee_number = serializers.SerializerMethodField()
    manager = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_employee_number(self, obj):
        return obj.employee_number if self.context.get("full") else None

    @extend_schema_field(EmployeeRefOut(allow_null=True))
    def get_manager(self, obj):
        if not self.context.get("full") or obj.manager_id is None:
            return None
        return EmployeeRefOut(obj.manager).data

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_status(self, obj):
        return obj.status if self.context.get("full") else None


class EmployeeListQuery(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["team", "all"], required=False)
    search = serializers.CharField(required=False, allow_blank=True)
    department = serializers.IntegerField(required=False)
    manager = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=["active", "suspended", "archived", "all"], required=False)
    ordering = serializers.ChoiceField(
        choices=["name", "-name", "employee_number", "-employee_number", "hire_date", "-hire_date"],
        required=False,
    )


_EDITABLE_STATUS = serializers.ChoiceField(choices=[EmployeeStatus.ACTIVE, EmployeeStatus.SUSPENDED])


class EmployeeIn(serializers.Serializer):
    employee_number = serializers.CharField(max_length=20)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=Gender.choices, required=False, allow_blank=True)
    professional_email = serializers.EmailField()
    personal_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    hire_date = serializers.DateField()
    contract_start_date = serializers.DateField(required=False, allow_null=True)
    contract_end_date = serializers.DateField(required=False, allow_null=True)
    contract_type = serializers.ChoiceField(choices=ContractType.choices)
    # Active or suspended only. A plain string in the schema: departures go through `employees/{id}/archive`.
    status = serializers.CharField(required=False)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all())
    position = serializers.PrimaryKeyRelatedField(queryset=Position.objects.all())
    # Someone who left is refused by the service, except as the manager the record already has.
    manager = PublicIdRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    emergency_contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_status(self, value):
        return _EDITABLE_STATUS.run_validation(value)


# --- Departures ----------------------------------------------------------------------------


class ArchiveItemOut(serializers.Serializer):
    label = serializers.CharField()
    link = serializers.CharField(allow_blank=True)


class ArchiveSectionOut(serializers.Serializer):
    key = serializers.CharField()
    items = ArchiveItemOut(many=True)


class ArchivePreviewOut(serializers.Serializer):
    has_account = serializers.BooleanField()
    reports = ArchiveItemOut(many=True)
    sections = ArchiveSectionOut(many=True)


class ArchiveIn(serializers.Serializer):
    leaving_date = serializers.DateField()
    reason = serializers.CharField(max_length=500)


# --- Documents -----------------------------------------------------------------------------


class DocumentFileOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField(source="original_name")
    size = serializers.IntegerField()
    content_type = serializers.CharField()


class DocumentOut(serializers.Serializer):
    id = serializers.IntegerField()
    label = serializers.CharField()
    visible_to_employee = serializers.BooleanField()
    attachment = DocumentFileOut()
    added_by = serializers.SerializerMethodField()
    added_at = serializers.DateTimeField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_added_by(self, obj):
        return accounts_services.display_name(obj.added_by) if obj.added_by_id else None


class DocumentIn(serializers.Serializer):
    # An empty file is let through here so that the files service refuses it with its own message.
    file = serializers.FileField(allow_empty_file=True)
    label = serializers.CharField(max_length=120)
    visible_to_employee = serializers.BooleanField(required=False, default=False)


class DocumentPatchIn(serializers.Serializer):
    visible_to_employee = serializers.BooleanField()


# --- Profile-change proposals --------------------------------------------------------------

_PROPOSABLE_ORDER = (
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "personal_email",
    "phone",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
)


class ProfileChangeFieldOut(serializers.Serializer):
    field = serializers.CharField()
    old = serializers.CharField(allow_null=True, allow_blank=True)
    new = serializers.CharField(allow_null=True, allow_blank=True)


class ProfileChangeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    employee = EmployeeRefOut()
    changes = serializers.SerializerMethodField()
    note = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    decided_by = serializers.SerializerMethodField()
    decided_at = serializers.DateTimeField(allow_null=True)
    comment = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()

    @extend_schema_field(ProfileChangeFieldOut(many=True))
    def get_changes(self, obj):
        return [
            {"field": name, "old": obj.changes[name]["old"], "new": obj.changes[name]["new"]}
            for name in _PROPOSABLE_ORDER
            if name in obj.changes
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_decided_by(self, obj):
        return accounts_services.display_name(obj.decided_by) if obj.decided_by_id else None


class ProposableFieldsIn(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=Gender.choices, required=False, allow_blank=True)
    personal_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)


class ProfileChangeIn(serializers.Serializer):
    changes = ProposableFieldsIn()
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ProfileChangeDecisionIn(serializers.Serializer):
    accept = serializers.BooleanField()
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ProfileChangeListQuery(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["mine", "all"], required=False)
    status = serializers.ChoiceField(
        choices=["pending", "decided", "accepted", "rejected", "withdrawn"], required=False
    )
    employee = serializers.UUIDField(required=False)
