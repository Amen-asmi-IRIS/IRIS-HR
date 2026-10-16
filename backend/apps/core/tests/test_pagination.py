import pytest
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.core.pagination import DefaultPagination, paginate, paginated


class NumberOut(serializers.Serializer):
    value = serializers.IntegerField()


ITEMS = [{"value": n} for n in range(1, 151)]


def drf_request(**query):
    return Request(APIRequestFactory().get("/things", query))


def test_the_first_page_holds_25_items():
    response = paginate(drf_request(), None, ITEMS, NumberOut)

    assert response.data["count"] == 150
    assert len(response.data["results"]) == 25
    assert response.data["results"][0] == {"value": 1}
    assert response.data["previous"] is None
    assert "page=2" in response.data["next"]


def test_the_last_page_has_no_next_link():
    response = paginate(drf_request(page=6), None, ITEMS, NumberOut)

    assert [row["value"] for row in response.data["results"]] == list(range(126, 151))
    assert response.data["next"] is None
    assert response.data["previous"] is not None


def test_the_caller_can_ask_for_a_page_size():
    response = paginate(drf_request(page_size=10, page=2), None, ITEMS, NumberOut)

    assert [row["value"] for row in response.data["results"]] == list(range(11, 21))


def test_the_page_size_is_capped_at_100():
    response = paginate(drf_request(page_size=5000), None, ITEMS, NumberOut)

    assert len(response.data["results"]) == 100


def test_a_page_beyond_the_end_is_not_found():
    with pytest.raises(NotFound):
        paginate(drf_request(page=99), None, ITEMS, NumberOut)


def test_the_schema_helper_describes_the_envelope():
    schema = paginated(NumberOut)

    assert schema.__name__ == "PaginatedNumberOut"
    assert list(schema().fields) == ["count", "next", "previous", "results"]
    assert paginated(NumberOut) is schema


def test_the_defaults_match_the_contract():
    assert DefaultPagination.page_size == 25
    assert DefaultPagination.max_page_size == 100
    assert DefaultPagination.page_size_query_param == "page_size"
