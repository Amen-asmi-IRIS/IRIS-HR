import pytest

from apps.calendar import seed as calendar_seed
from apps.calendar.models import PublicHoliday
from apps.requests import seed as requests_seed
from apps.requests.models import ExceptionalEvent, Request

pytestmark = pytest.mark.django_db


def test_demo_holidays_cover_this_year_and_the_next(world):
    calendar_seed.seed()
    calendar_seed.seed()
    assert PublicHoliday.objects.filter(date__year=2026).count() == 8
    assert PublicHoliday.objects.filter(date__year=2027).count() == 8
    assert PublicHoliday.objects.filter(recurs_yearly=False).count() == 0


def test_demo_requests_show_the_main_states_and_can_be_seeded_twice(world):
    calendar_seed.seed()
    requests_seed.seed()
    requests_seed.seed()

    assert ExceptionalEvent.objects.filter(name_en__in=["Birth", "Death of a close relative"]).count() == 2
    found = {
        (request.employee.professional_email.split("@")[0], request.request_type.code, request.status)
        for request in Request.objects.select_related("employee", "request_type")
    }
    assert found == {
        ("employee.a1", "annual", "pending"),
        ("employee.a1", "remote", "approved"),
        ("employee.a1", "permission", "draft"),
        ("employee.a2", "sick", "pending"),
        ("manager.a", "annual", "approved"),
        ("employee.b1", "remote", "pending"),
    }
