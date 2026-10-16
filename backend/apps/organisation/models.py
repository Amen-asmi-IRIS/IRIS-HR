from django.conf import settings
from django.db import models

from apps.core.models import PublicIdModel, TimeStampedModel


class Department(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class Position(models.Model):
    code = models.CharField(max_length=20, unique=True)
    title_fr = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120)
    grade = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class ContractType(models.TextChoices):
    PERMANENT = "permanent"
    FIXED_TERM = "fixed_term"
    TEMPORARY = "temporary"
    CONSULTANT = "consultant"


class EmployeeStatus(models.TextChoices):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class Gender(models.TextChoices):
    FEMALE = "female"
    MALE = "male"


class Employee(PublicIdModel, TimeStampedModel):
    # The account of this person, if one exists (master D6). `user.employee` is the reverse accessor.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="employee"
    )
    employee_number = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    professional_email = models.EmailField(unique=True)
    personal_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    hire_date = models.DateField()
    contract_start_date = models.DateField(null=True, blank=True)
    contract_end_date = models.DateField(null=True, blank=True)
    contract_type = models.CharField(max_length=20, choices=ContractType.choices)
    status = models.CharField(max_length=20, choices=EmployeeStatus.choices, default=EmployeeStatus.ACTIVE)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="employees")
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="employees")
    manager = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="reports"
    )
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=40, blank=True)
    # The leaving date HR gave when recording the departure; empty while the person is employed.
    archived_at = models.DateField(null=True, blank=True)
    archive_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(manager=models.F("id")), name="employee_not_own_manager"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.employee_number} {self.first_name} {self.last_name}"


class EmployeeDocument(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="documents")
    attachment = models.OneToOneField("files.Attachment", on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=120)
    visible_to_employee = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-added_at", "-id"]

    def __str__(self) -> str:
        return f"{self.employee_id}: {self.label}"


class ProfileChangeStatus(models.TextChoices):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class ProfileChange(PublicIdModel):
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="profile_changes")
    # {"phone": {"old": "…", "new": "…"}}; dates are ISO strings.
    changes = models.JSONField()
    note = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=ProfileChangeStatus.choices, default=ProfileChangeStatus.PENDING
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee"],
                condition=models.Q(status="pending"),
                name="one_open_profile_change_per_employee",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.employee_id}: {self.status}"
