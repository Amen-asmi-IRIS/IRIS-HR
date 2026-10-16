"""The committed OpenAPI description carries the request engine as master 7.8 and 7.9 define it."""

from pathlib import Path

import yaml
from django.conf import settings

OPERATIONS = {
    "holidays_list",
    "holidays_create",
    "holidays_update",
    "holidays_delete",
    "holidays_copy",
    "holidays_impact",
    "request_types_list",
    "request_types_create",
    "request_types_detail",
    "request_types_update",
    "request_types_steps",
    "request_types_steps_replace",
    "request_types_chain_preview",
    "exceptional_events_list",
    "exceptional_events_create",
    "exceptional_events_update",
    "requests_list",
    "requests_create",
    "requests_preview",
    "requests_detail",
    "requests_update",
    "requests_discard",
    "requests_submit",
    "requests_withdraw",
    "requests_attachments",
    "requests_attach",
    "requests_amendments",
    "requests_amend",
    "amendments_withdraw",
    "requests_correct",
    "requests_cancel",
    "requests_reclassify",
    "requests_history",
    "approvals_list",
    "steps_decide",
    "steps_record_on_behalf",
    "steps_reassign",
}

REQUEST_OUT = {
    "public_id",
    "version",
    "employee",
    "type",
    "start_date",
    "end_date",
    "starts_at_midday",
    "ends_at_midday",
    "start_time",
    "end_time",
    "quantity",
    "event",
    "comment",
    "comment_hidden",
    "status",
    "state",
    "certificate",
    "amendment",
    "has_override",
    "created_by_hr",
    "viewer",
    "submitted_at",
    "decided_at",
    "created_at",
}


def document() -> dict:
    return yaml.safe_load((Path(settings.BASE_DIR) / "openapi.yaml").read_text(encoding="utf-8"))


def test_every_operation_of_the_request_engine_is_described():
    described = {
        operation["operationId"]
        for methods in document()["paths"].values()
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert OPERATIONS - described == set()


def test_the_request_shapes_match_the_master_plan():
    schemas = document()["components"]["schemas"]
    assert set(schemas["RequestOut"]["properties"]) == REQUEST_OUT
    assert set(schemas["RequestDetailOut"]["properties"]) == REQUEST_OUT | {
        "steps",
        "attachments",
        "amendments",
        "decision_context",
    }
    assert set(schemas["RequestStateOut"]["properties"]) == {
        "key",
        "waiting_on",
        "last_actor",
        "note",
        "since",
    }
    assert set(schemas["RequestViewerOut"]["properties"]) == {"relation", "actions", "step_id"}
    assert set(schemas["PaginatedRequestOut"]["properties"]) == {"count", "next", "previous", "results"}
    assert set(schemas["PreviewOut"]["properties"]) == {
        "quantity",
        "skipped_days",
        "chain",
        "balance",
        "usage",
        "certificate_due_at",
        "problems",
    }
