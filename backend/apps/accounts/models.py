from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.accounts.emails import normalise_email
from apps.core.models import PublicIdModel

LANGUAGE_CHOICES = [("fr", "Français"), ("en", "English")]
ASSIGNABLE_ROLE_CHOICES = [
    ("hr", "HR"),
    ("exec", "Executive Management"),
    ("sysadmin", "System Administrator"),
]


def default_language() -> str:
    return settings.DEFAULT_LANGUAGE


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        user = self.model(email=normalise_email(email), **extra)
        if password is None:
            user.set_unusable_password()
        else:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, email):
        return self.get(email=normalise_email(email))


class User(PublicIdModel, AbstractBaseUser):
    """A local account. The link to an employee record is `Employee.user`, added by plan 02 (master D6)."""

    last_login = None  # replaced by last_login_at and previous_login_at (ACC-07)

    email = models.EmailField(unique=True, max_length=254)
    full_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=False)
    temp_password_expires_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    previous_login_at = models.DateTimeField(null=True, blank=True)
    password_reset_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    password_reset_at = models.DateTimeField(null=True, blank=True)
    language = models.CharField(max_length=2, choices=LANGUAGE_CHOICES, default=default_language)
    last_workspace = models.CharField(max_length=10, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["email"]
        constraints = [
            models.CheckConstraint(condition=Q(email=Lower("email")), name="accounts_user_email_lower"),
        ]

    def __str__(self) -> str:
        return self.email


class RoleAssignment(models.Model):
    """One assignable role held by one account. EMPLOYEE and MANAGER are derived, never stored (PRD 3)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.CharField(max_length=10, choices=ASSIGNABLE_ROLE_CHOICES)
    assigned_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    assigned_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["role"]
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="accounts_roleassignment_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.user.email}: {self.role}"
