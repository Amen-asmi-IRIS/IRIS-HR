"""What reports need to know about request types, read through the requests app's own selector."""

from __future__ import annotations

from dataclasses import dataclass

from apps.requests import selectors as request_selectors


@dataclass(frozen=True)
class TypeFacts:
    code: str
    name_fr: str
    name_en: str
    unit: str  # "day" | "hour"
    calendar_label: str  # "absent" | "remote" | "hidden"
    reduces_meal_tickets: bool

    def name(self, lang: str) -> str:
        return self.name_en if lang == "en" else self.name_fr


def type_facts() -> dict[str, TypeFacts]:
    """Every request type, active or not, keyed by code, in display order.

    Inactive types are kept: a report on last year must still name a type HR has since retired.
    """
    return {
        request_type.code: TypeFacts(
            code=request_type.code,
            name_fr=request_type.name_fr,
            name_en=request_type.name_en,
            unit=request_type.unit,
            calendar_label=request_type.calendar_label,
            reduces_meal_tickets=request_type.reduces_meal_tickets,
        )
        for request_type in request_selectors.request_types(active_only=False)
    }
