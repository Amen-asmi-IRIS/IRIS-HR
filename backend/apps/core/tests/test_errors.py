import dataclasses

import pytest

from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound, Problem, RateLimited


def test_a_domain_error_carries_one_problem_by_default():
    error = DomainError("request.overlap", field="start_date", other="12/03")

    assert error.status == 400
    assert error.code == "request.overlap"
    assert error.params == {"other": "12/03"}
    assert error.field == "start_date"
    assert error.problems == [Problem("request.overlap", "start_date", {"other": "12/03"})]
    assert str(error) == "request.overlap"


def test_several_problems_can_be_reported_at_once():
    problems = [Problem("request.end_before_start", "end_date"), Problem("request.no_working_day")]

    error = DomainError("core.validation", problems=problems)

    assert error.code == "core.validation"
    assert error.problems == problems
    assert error.field == "end_date"


@pytest.mark.parametrize(
    ("cls", "status", "code"),
    [
        (DomainError, 400, "core.invalid"),
        (NotAllowed, 403, "core.not_allowed"),
        (NotFound, 404, "core.not_found"),
        (Conflict, 409, "core.conflict"),
        (RateLimited, 429, "core.rate_limited"),
    ],
)
def test_each_class_has_a_status_and_a_default_code(cls, status, code):
    error = cls()

    assert error.status == status
    assert error.code == code
    assert error.problems == [Problem(code)]


def test_a_subclass_accepts_a_specific_code():
    error = Conflict("request.already_processed")

    assert error.status == 409
    assert error.code == "request.already_processed"


def test_a_problem_has_no_field_and_no_params_by_default():
    problem = Problem("core.invalid")

    assert problem.field is None
    assert problem.params == {}


def test_a_problem_cannot_be_changed():
    problem = Problem("core.invalid")

    with pytest.raises(dataclasses.FrozenInstanceError):
        problem.code = "other"
