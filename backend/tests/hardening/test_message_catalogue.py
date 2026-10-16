"""Every code and event of the contract has French and English text, and they differ (U9, NFR-06)."""

from __future__ import annotations

import re
import string

from apps.core.i18n import all_messages, translate

ERROR_CODES = [
    "core.not_allowed",
    "core.not_found",
    "core.unexpected",
    "core.validation",
    "auth.invalid_credentials",
    "auth.domain_not_allowed",
    "auth.locked",
    "auth.disabled",
    "auth.temp_password_expired",
    "auth.rate_limited",
    "auth.password_change_required",
    "auth.wrong_current_password",
    "auth.weak_password",
    "accounts.email_taken",
    "accounts.employee_has_account",
    "accounts.employee_unknown",
    "accounts.roles_incompatible",
    "accounts.last_sysadmin",
    "accounts.cannot_change_self",
    "settings.unknown_key",
    "settings.invalid_value",
    "settings.out_of_range",
    "files.too_large",
    "files.type_not_allowed",
    "files.content_mismatch",
    "files.empty",
    # `organisation.in_use` is left out: plan 02 has no delete route, so it is never raised (its contract note 2).
    *[
        f"organisation.{name}"
        for name in (
            "number_taken",
            "email_taken",
            "email_domain",
            "contract_dates",
            "manager_loop",
            "manager_self",
            "already_archived",
            "nothing_to_change",
            "field_not_proposable",
            "change_already_open",
            "change_already_decided",
            "delegation_overlap",
            "delegation_self",
            "delegation_dates",
            "delegation_not_manager",
        )
    ],
    *[
        f"request.{name}"
        for name in (
            "actor_without_record",
            "end_before_start",
            "no_working_day",
            "half_day_not_allowed",
            "half_day_on_non_working_day",
            "past_dates",
            "notice",
            "overlap",
            "balance_insufficient",
            "cap_exceeded",
            "event_required",
            "event_days_exceeded",
            "permission_non_working_day",
            "permission_times",
            "permission_overlaps_absence",
            "reason_required",
            "comment_required",
            "not_editable",
            "not_withdrawable",
            "already_processed",
            "own_request",
            "not_started_only",
            "amendment_open",
            "type_inactive",
            "chain_needs_approver",
        )
    ],
    "balances.reason_required",
    "balances.zero_amount",
    "balances.opening_exists",
    "calendar.window_invalid",
    "reports.unknown_report",
    "reports.nothing_to_export",
]
EVENTS = [
    "account.password_reset",
    "job.failed",
    "error.unexpected",
    "profile_change.proposed",
    "profile_change.accepted",
    "profile_change.rejected",
    "delegation.started",
    "delegation.ended",
    "step.to_decide",
    "step.reminder",
    "step.flagged",
    "step.informed",
    "request.approved",
    "request.rejected",
    "request.returned",
    "request.withdrawn",
    "request.cancelled",
    "request.corrected",
    "amendment.submitted",
    "amendment.approved",
    "amendment.rejected",
    "sick.declared",
    "certificate.due_soon",
    "certificate.overdue",
    "delegation.prompt",
    "hr_step.unattended",
    "balance.adjusted",
]
# Texts that are rightly the same in both languages. Add a code here only with the reason beside it.
SAME_ON_PURPOSE: set[str] = {
    "audit.column.action",  # "Action": the same word in French and English
    "reports.total",  # "Total"
    "reports.col_total",  # "Total"
    "reports.col_type",  # "Type"
    "reports.col_period",  # "Dates"
}
TRAILING_PLACEHOLDER = re.compile(r"\s*\{[a-z_]+(:[a-z]+)?\}$")
ONLY_SYMBOLS = re.compile(r"^[\W\d{}a-z_]*$")  # placeholders, digits and punctuation: nothing to translate


def _placeholders(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_every_error_code_of_the_contract_has_both_texts():
    catalogue = all_messages()
    missing = [
        code
        for code in ERROR_CODES
        if not catalogue.get(code, {}).get("fr") or not catalogue.get(code, {}).get("en")
    ]
    assert missing == []


def test_every_notification_event_has_a_title_and_a_body_in_both_languages():
    catalogue = all_messages()
    missing = [
        f"notification.{event}.{part}"
        for event in EVENTS
        for part in ("title", "body")
        if not catalogue.get(f"notification.{event}.{part}", {}).get("fr")
        or not catalogue.get(f"notification.{event}.{part}", {}).get("en")
    ]
    assert missing == []


def test_no_text_is_a_copy_of_the_other_language():
    copies = [
        code
        for code, texts in all_messages().items()
        if texts.get("fr") == texts.get("en")
        and code not in SAME_ON_PURPOSE
        and not ONLY_SYMBOLS.match(texts.get("fr", ""))
    ]
    assert copies == [], f"untranslated: {copies}"


def test_every_text_renders_in_both_languages():
    for code, texts in all_messages().items():
        params = {name: "X" for name in _placeholders(texts["en"]) | _placeholders(texts["fr"])}
        for language in ("fr", "en"):
            rendered = translate(code, language, **params)
            assert rendered and "{" not in rendered, (code, language)


def test_every_error_text_is_a_sentence():
    for code in ERROR_CODES:
        for language in ("fr", "en"):
            text = all_messages()[code][language]
            assert len(text.split()) >= 3, f"{code} ({language}) is not a sentence: {text!r}"
            # A text may end with a placeholder that brings sentences of its own (`{reasons}`).
            sentence = TRAILING_PLACEHOLDER.sub("", text).rstrip()
            assert text[0].isupper() and sentence[-1] in ".!?", f"{code} ({language}): {text!r}"


def test_no_notification_about_sickness_has_room_for_a_comment_or_a_file():
    forbidden = {"comment", "file", "file_name", "filename", "certificate", "note", "reason", "type"}
    for event in ("sick.declared", "certificate.due_soon", "certificate.overdue"):
        for part in ("title", "body"):
            used = _placeholders(all_messages()[f"notification.{event}.{part}"]["en"])
            assert used & forbidden == set(), f"{event}.{part} uses {used & forbidden}"
