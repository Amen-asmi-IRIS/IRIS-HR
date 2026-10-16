"""Django settings. Every infrastructure value comes from config.env; business settings live in the database."""

import logging.config
import sys
from pathlib import Path

from config.env import EnvError, load
from config.logging import build_logging

try:
    ENV = load()
except EnvError as exc:  # the process must not start with a broken configuration (PRD 9.7)
    sys.exit(f"Configuration error: {exc}")

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Values other modules read ---
ENVIRONMENT = ENV.environment
APP_VERSION = ENV.app_version
SITE_HOSTNAME = ENV.site_hostname
ALLOWED_EMAIL_DOMAIN = ENV.allowed_email_domain
DEFAULT_LANGUAGE = ENV.default_language
FILE_ENCRYPTION_KEY = ENV.file_encryption_key
BACKUP_PASSPHRASE = ENV.backup_passphrase
FILES_ROOT = Path("/data/files")
BACKUP_ROOT = Path("/data/backups")

# --- Core ---
SECRET_KEY = ENV.secret_key
DEBUG = False  # identical behaviour on every stack; errors are returned as problem details
ALLOWED_HOSTS = list(ENV.allowed_hosts)
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "drf_spectacular",
    "procrastinate.contrib.django",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.settings",
    "apps.notifications",
    "apps.files",
    "apps.organisation",
    "apps.calendar",
    "apps.requests",
    "apps.balances",
    "apps.reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.InactivityMiddleware",
    "apps.core.middleware.LanguageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": ENV.postgres_db,
        "USER": ENV.postgres_user,
        "PASSWORD": ENV.postgres_password,
        "HOST": "db",
        "PORT": "5432",
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }
}

# --- Accounts (PRD 5.1) ---
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
PASSWORD_HASHERS = ["django.contrib.auth.hashers.Argon2PasswordHasher"]
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "full_name")},
    },
]

# --- API (PRD 9.3) ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.SessionAuth"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.accounts.permissions.RolePermission"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "IRIS HR API",
    "DESCRIPTION": "Internal API of the IRIS HR platform. Errors are problem details (application/problem+json).",
    "VERSION": "1",  # the API version of the /api/v1 prefix, not the application version
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    # One name per choice set, so that the generated client has stable type names.
    # Each entry must be the (value, label) choices the fields use: a bare list of values matches nothing.
    "ENUM_NAME_OVERRIDES": {
        "LanguageEnum": "apps.accounts.models.LANGUAGE_CHOICES",
        "WorkspaceEnum": "apps.accounts.roles.WORKSPACE_CHOICES",
        "AssignableRoleEnum": "apps.accounts.roles.ASSIGNABLE_CHOICES",
        "AccountStateEnum": "apps.accounts.selectors.ACCOUNT_STATE_CHOICES",
        "AuditCategoryEnum": "apps.audit.models.AUDIT_CATEGORY_CHOICES",
        "SettingKindEnum": "apps.settings.registry.KINDS",
        "GenderEnum": "apps.organisation.models.Gender",
        "ContractTypeEnum": "apps.organisation.models.ContractType",
        "RequestUnitEnum": "apps.requests.models.Unit",
        "BalanceEffectEnum": "apps.requests.models.BalanceEffect",
        "DocumentRuleEnum": "apps.requests.models.DocumentRule",
        "CapPeriodEnum": "apps.requests.models.CapPeriod",
        "CalendarLabelEnum": "apps.requests.models.CalendarLabel",
        "ApproverRuleEnum": "apps.requests.models.ApproverRule",
        "StepModeEnum": "apps.requests.models.StepMode",
        "RequestStatusEnum": "apps.requests.models.RequestStatus",
        "StepStatusEnum": "apps.requests.models.StepStatus",
        "AmendmentStatusEnum": "apps.requests.models.AmendmentStatus",
        "AmendmentKindEnum": "apps.requests.models.AmendmentKind",
        "DecisionChannelEnum": "apps.requests.models.Channel",
        "DecisionEnum": "apps.requests.models.Decision",
        "RequestStateKeyEnum": "apps.requests.api.serializers.STATE_KEYS",
        "ViewerRelationEnum": "apps.requests.api.serializers.RELATIONS",
        "RequestActionEnum": "apps.requests.api.serializers.ACTIONS",
        "CertificateStatusEnum": "apps.requests.api.serializers.CERTIFICATE_STATUSES",
        "SkipReasonEnum": "apps.requests.api.serializers.SKIP_REASONS",
        "CalendarEntryStatusEnum": "apps.calendar.api.feed_serializers.ENTRY_STATUSES",
        "NeedsYouKindEnum": "apps.reports.api.serializers.NEEDS_YOU_KINDS",
        "PresenceEnum": "apps.reports.api.serializers.PRESENCE_STATES",
        "ReportColumnKindEnum": "apps.reports.api.report_serializers.COLUMN_KINDS",
        "ReportTotalGroupEnum": "apps.reports.api.report_serializers.TOTAL_GROUPS",
        "ReportScopeEnum": "apps.reports.api.report_serializers.SCOPES",
    },
}

# --- Language and time ---
LANGUAGE_CODE = DEFAULT_LANGUAGE
LANGUAGES = [("fr", "Français"), ("en", "English")]
USE_I18N = True
TIME_ZONE = ENV.time_zone
USE_TZ = True

# --- Transport and browser security (PRD section 10) ---
_SECURE_COOKIES = ENVIRONMENT != "development"  # development is served over plain HTTP on localhost
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_HSTS_SECONDS = 31536000 if _SECURE_COOKIES else 0
X_FRAME_OPTIONS = "DENY"

SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = _SECURE_COOKIES
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # the cookie has no expiry: it ends with the browser (ACC-04)
SESSION_COOKIE_AGE = 60 * 60 * 24  # server-side ceiling; the inactivity limit is a database setting

CSRF_COOKIE_HTTPONLY = False  # the single-page app reads it to send X-CSRFToken
CSRF_COOKIE_SECURE = _SECURE_COOKIES
CSRF_COOKIE_SAMESITE = "Lax"

# --- Logging: structured JSON on standard output (PRD 9.7) ---
LOGGING_CONFIG = None
logging.config.dictConfig(build_logging(ENV.log_level))
