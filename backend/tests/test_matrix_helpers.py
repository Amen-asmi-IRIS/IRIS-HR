from tests.matrix import (
    ALLOW,
    DENY,
    EVERYONE,
    HIDE,
    LOGIN,
    SIGNED_IN,
    Case,
    P,
    missing_cases,
    only,
    unknown_cases,
    verdict,
)


def test_only_allows_the_named_personas_and_denies_the_rest():
    expect = only(P.HR, P.EXEC)

    assert expect[P.HR] == ALLOW and expect[P.EXEC] == ALLOW
    assert expect[P.ANON] == LOGIN
    assert expect[P.OWNER] == DENY and expect[P.SYSADMIN] == DENY
    assert set(expect) == set(P)


def test_only_can_hide_an_item_from_some_personas():
    expect = only(P.OWNER, hide=[P.PEER, P.HR])

    assert expect[P.OWNER] == ALLOW
    assert expect[P.PEER] == HIDE and expect[P.HR] == HIDE
    assert expect[P.MANAGER] == DENY
    assert expect[P.ANON] == LOGIN


def test_everyone_includes_anonymous_callers_and_signed_in_does_not():
    assert only(*EVERYONE)[P.ANON] == ALLOW
    assert only(*SIGNED_IN)[P.ANON] == LOGIN
    assert len(EVERYONE) == 9 and len(SIGNED_IN) == 8


def test_a_case_has_readable_identifiers():
    assert Case("accounts:me", "GET", only(*SIGNED_IN)).id == "GET accounts:me"
    assert Case("requests:detail", "GET", only(P.OWNER), label="draft").id == "GET requests:detail [draft]"


def test_a_case_defaults_to_no_arguments_and_json():
    case = Case("accounts:me", "GET", only(*SIGNED_IN))

    assert case.kwargs(None) == {}
    assert case.body(None) is None
    assert case.query(None) == {}
    assert case.format == "json"


def test_verdict_accepts_any_working_answer_for_an_allowed_persona():
    case = Case("x:y", "POST", only(P.HR))

    assert verdict(case, P.HR, 200) is None
    assert verdict(case, P.HR, 201) is None
    assert verdict(case, P.HR, 400) is None  # allowed in; the payload was simply not valid
    assert verdict(case, P.HR, 409) is None
    assert verdict(case, P.HR, 503) is None


def test_verdict_refuses_a_blocked_or_broken_answer_for_an_allowed_persona():
    case = Case("x:y", "POST", only(P.HR))

    for status in (401, 403, 404, 500):
        assert "HR" in verdict(case, P.HR, status).upper()


def test_verdict_wants_the_exact_refusal_for_the_others():
    case = Case("x:y", "GET", only(P.OWNER, hide=[P.PEER]))

    assert verdict(case, P.ANON, 401) is None
    assert verdict(case, P.MANAGER, 403) is None
    assert verdict(case, P.PEER, 404) is None
    assert verdict(case, P.MANAGER, 200) is not None  # a leak
    assert verdict(case, P.PEER, 403) is not None  # reveals that the item exists
    assert verdict(case, P.ANON, 403) is not None


def test_verdict_refuses_a_case_that_forgets_a_persona():
    case = Case("x:y", "GET", {P.HR: ALLOW})

    assert "does not say" in verdict(case, P.OWNER, 403)


def test_an_endpoint_without_a_case_is_found():
    declared = {("accounts:me", "GET"), ("accounts:me", "PATCH"), ("new:thing", "POST")}
    cases = [Case("accounts:me", "GET", only(*SIGNED_IN)), Case("accounts:me", "PATCH", only(*SIGNED_IN))]

    assert missing_cases(declared, cases) == [("new:thing", "POST")]
    assert missing_cases({("accounts:me", "GET")}, cases) == []


def test_a_case_for_something_that_does_not_exist_is_found():
    cases = [Case("accounts:me", "GET", only(*SIGNED_IN)), Case("accounts:gone", "GET", only(*SIGNED_IN))]

    assert unknown_cases({("accounts:me", "GET")}, cases) == [("accounts:gone", "GET")]
