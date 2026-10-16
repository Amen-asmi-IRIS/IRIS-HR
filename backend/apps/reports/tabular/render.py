"""Turns a ReportResult into the JSON body of the API or into a workbook."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.core.i18n import translate
from apps.core.xlsx import Column as SheetColumn
from apps.core.xlsx import build_workbook

from .framework import Period, ReportResult

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_TWO_PLACES = Decimal("0.01")


def _json_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value.quantize(_TWO_PLACES))
    if isinstance(value, Period):
        return {"start": value.start.isoformat(), "end": value.end.isoformat()}
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def to_json(result: ReportResult) -> dict[str, Any]:
    return {
        "columns": [
            {"key": column.key, "label": column.label, "kind": column.kind} for column in result.columns
        ],
        "rows": [{key: _json_cell(value) for key, value in row.items()} for row in result.rows],
        "totals": None
        if result.totals is None
        else {
            "lines": [
                {
                    "group": line.group,
                    "label": line.label,
                    "values": {key: _json_cell(value) for key, value in line.values.items()},
                }
                for line in result.totals
            ]
        },
        "notes": list(result.notes),
    }


def _sheet_cell(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime) and timezone.is_aware(value):
        # Excel has no time zones: write the Tunis wall-clock time.
        return timezone.localtime(value).replace(tzinfo=None)
    return value


def _sheet_columns(result: ReportResult, lang: str | None) -> list[SheetColumn]:
    columns: list[SheetColumn] = []
    for column in result.columns:
        if column.kind == "period":
            columns.append(
                SheetColumn(
                    key=f"{column.key}_start", header=translate("reports.col_from", lang), kind="date"
                )
            )
            columns.append(
                SheetColumn(key=f"{column.key}_end", header=translate("reports.col_to", lang), kind="date")
            )
        else:
            columns.append(SheetColumn(key=column.key, header=column.label, kind=column.kind))
    return columns


def _sheet_row(result: ReportResult, row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for column in result.columns:
        value = row.get(column.key)
        if column.kind == "period":
            out[f"{column.key}_start"] = value.start if value else None
            out[f"{column.key}_end"] = value.end if value else None
        else:
            out[column.key] = _sheet_cell(value)
    return out


def _total_rows(result: ReportResult, lang: str | None) -> list[dict[str, Any]]:
    if not result.totals:
        return []
    label_key = next(
        (column.key for column in result.columns if column.kind == "text"), result.columns[0].key
    )
    word = translate("reports.total", lang)
    rows = []
    for line in result.totals:
        row = {key: _sheet_cell(value) for key, value in line.values.items()}
        row[label_key] = word if line.group == "overall" else f"{word} – {line.label}"
        rows.append(row)
    return rows


def to_workbook(result: ReportResult, *, title: str, lang: str | None = None) -> bytes:
    """The table and its totals on the first sheet; the notes, if any, on a sheet "Notes" of their own."""
    rows = [_sheet_row(result, row) for row in result.rows] + _total_rows(result, lang)
    return build_workbook(title=title, columns=_sheet_columns(result, lang), rows=rows, notes=result.notes)
