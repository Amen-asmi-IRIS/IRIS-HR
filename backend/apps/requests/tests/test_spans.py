from datetime import date

import pytest
import time_machine

from apps.requests.spans import absence_type_codes, request_spans
from tests.request_flows import NOW, approved, send

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def test_a_span_carries_dates_flags_type_and_label(world):
    request = approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 3),
        end=date(2026, 11, 5),
        ends_at_midday=True,
    )

    spans = request_spans(start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"])

    assert len(spans) == 1
    span = spans[0]
    assert span.request_id == request.id
    assert span.request_public_id == str(request.public_id)
    assert span.employee_id == world.owner.id
    assert (span.type_code, span.unit, span.calendar_label) == ("annual", "day", "absent")
    assert span.type_is_sensitive is False
    assert (span.start_date, span.end_date) == (date(2026, 11, 3), date(2026, 11, 5))
    assert (span.starts_at_midday, span.ends_at_midday) == (False, True)
    assert span.status == "approved"
    assert span.type_name_fr and span.type_name_en


def test_spans_are_filtered_by_window_status_employee_and_type(world):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 3),
        end=date(2026, 11, 4),
    )
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )

    november = {"start": date(2026, 11, 1), "end": date(2026, 11, 30)}
    assert len(request_spans(**november, statuses=["approved", "pending"])) == 2
    assert len(request_spans(**november, statuses=["approved"])) == 1
    assert len(request_spans(**november, statuses=["approved", "pending"], employee_ids=[world.peer.id])) == 1
    assert len(request_spans(**november, statuses=["approved", "pending"], type_codes=["remote"])) == 1
    assert (
        request_spans(start=date(2026, 11, 5), end=date(2026, 11, 9), statuses=["approved", "pending"]) == []
    )
    assert request_spans(**november, statuses=["approved"], employee_ids=[]) == []


def test_a_span_that_only_touches_the_window_is_returned_whole(world):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 30),
        end=date(2026, 12, 2),
    )

    spans = request_spans(start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"])

    assert [(s.start_date, s.end_date) for s in spans] == [(date(2026, 11, 30), date(2026, 12, 2))]


def test_absence_type_codes_are_the_types_labelled_absent(world):
    assert absence_type_codes() == {"annual", "sick", "exceptional"}
