"""The committed OpenAPI description must be what the code generates (PRD 9.3, 12.4)."""

from pathlib import Path

import yaml
from django.conf import settings
from django.core.management import call_command

COMMITTED = Path(settings.BASE_DIR) / "openapi.yaml"

EXPECTED_OPERATIONS = {
    "health",
    "admin_status",
    "auth_csrf",
    "auth_login",
    "auth_logout",
    "auth_me",
    "auth_me_update",
    "auth_password",
    "accounts_list",
    "accounts_create",
    "accounts_candidates",
    "accounts_detail",
    "accounts_reset_password",
    "accounts_role_add",
    "accounts_role_remove",
    "accounts_disable",
    "accounts_enable",
    "accounts_unlock",
    "audit_business_list",
    "audit_business_export",
    "audit_security_list",
    "audit_security_export",
    "settings_hr_list",
    "settings_hr_update",
    "settings_system_list",
    "settings_system_update",
    "notifications_list",
    "notifications_unread_count",
    "notifications_read",
    "notifications_read_all",
}


def committed() -> dict:
    return yaml.safe_load(COMMITTED.read_text(encoding="utf-8"))


def operations(document: dict) -> dict[str, dict]:
    return {
        operation["operationId"]: operation
        for methods in document["paths"].values()
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete"}
    }


def test_the_committed_description_is_what_the_code_generates(tmp_path):
    generated = tmp_path / "openapi.yaml"

    call_command("spectacular", "--file", str(generated), "--validate", "--fail-on-warn")

    assert generated.read_text(encoding="utf-8") == COMMITTED.read_text(encoding="utf-8"), (
        "backend/openapi.yaml is stale. Run: powershell -File scripts/dev.ps1 openapi"
    )


def test_every_operation_of_this_plan_is_described_under_its_name():
    assert EXPECTED_OPERATIONS <= set(operations(committed()))


def test_every_path_is_under_the_versioned_prefix():
    assert all(path.startswith("/api/v1/") for path in committed()["paths"])


def test_the_session_cookie_is_the_only_security_scheme():
    schemes = committed()["components"]["securitySchemes"]

    assert schemes == {
        "sessionCookie": {"type": "apiKey", "in": "cookie", "name": "sessionid"},
    }


def test_the_me_shape_matches_the_master_plan():
    me = committed()["components"]["schemas"]["MeOut"]

    assert set(me["properties"]) == {
        "public_id",
        "email",
        "name",
        "language",
        "roles",
        "workspaces",
        "last_workspace",
        "must_change_password",
        "previous_login_at",
        "password_reset",
        "employee",
        "environment",
        "version",
    }


def test_every_choice_set_has_its_stable_name():
    schemas = committed()["components"]["schemas"]

    assert {name for name in schemas if name.endswith("Enum")} == {
        "AccountStateEnum",
        "AmendmentKindEnum",
        "AmendmentStatusEnum",
        "ApproverRuleEnum",
        "AssignableRoleEnum",
        "AuditCategoryEnum",
        "BalanceEffectEnum",
        "BlankEnum",  # the empty choice of an optional choice field (gender)
        "CalendarEntryStatusEnum",
        "CalendarLabelEnum",
        "CapPeriodEnum",
        "CertificateStatusEnum",
        "ContractTypeEnum",
        "DecisionChannelEnum",
        "DecisionEnum",
        "DocumentRuleEnum",
        "GenderEnum",
        "LanguageEnum",
        "NeedsYouKindEnum",
        "NullEnum",  # the empty value of a choice field that may be null (the channel of a step)
        "PresenceEnum",
        "ReportColumnKindEnum",
        "ReportScopeEnum",
        "ReportTotalGroupEnum",
        "RequestActionEnum",
        "RequestStateKeyEnum",
        "RequestStatusEnum",
        "RequestUnitEnum",
        "SettingKindEnum",
        "SkipReasonEnum",
        "StepModeEnum",
        "StepStatusEnum",
        "ViewerRelationEnum",
        "WorkspaceEnum",
    }
    assert schemas["AuditCategoryEnum"]["enum"] == ["business", "security"]


def test_lists_are_described_as_pages():
    page = committed()["components"]["schemas"]["PaginatedAccountOut"]

    assert set(page["properties"]) == {"count", "next", "previous", "results"}


def test_removing_a_role_is_described_as_answering_with_the_account():
    """It answers 200 with the account, like the other role and state actions (master 7.2).

    drf-spectacular describes a DELETE as "204, no body" unless the view names the status.
    """
    responses = operations(committed())["accounts_role_remove"]["responses"]

    assert set(responses) == {"200"}
    assert responses["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AccountDetailOut",
    }
