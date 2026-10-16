import pytest

from apps.notifications import services
from apps.notifications.tests.world import make_notification

pytestmark = pytest.mark.django_db

LIST = "/api/v1/notifications"
COUNT = "/api/v1/notifications/unread-count"
READ_ALL = "/api/v1/notifications/read-all"


def read_url(notification) -> str:
    return f"/api/v1/notifications/{notification.pk}/read"


@pytest.fixture
def reader(world):
    """The manager, with three notifications; the peer has one."""
    world.first = make_notification(world.manager_user, by="First")
    world.second = make_notification(world.manager_user, by="Second")
    world.third = make_notification(world.manager_user, by="Third")
    world.foreign = make_notification(world.peer_user)
    return world.manager_user


def test_notifications_need_a_session(anon_client):
    assert anon_client.get(LIST).status_code == 401
    assert anon_client.get(COUNT).status_code == 401
    assert anon_client.post(READ_ALL).status_code == 401


def test_the_list_shows_the_readers_notifications_newest_first(world, reader, client_for):
    body = client_for(reader).get(LIST).json()

    assert set(body) == {"count", "next", "previous", "results"}
    assert body["count"] == 3
    assert [item["id"] for item in body["results"]] == [world.third.pk, world.second.pk, world.first.pk]
    assert set(body["results"][0]) == {"id", "event", "title", "body", "link", "created_at", "read_at"}
    assert body["results"][0]["event"] == "account.password_reset"
    assert body["results"][0]["link"] == "/password"
    assert body["results"][0]["read_at"] is None


def test_the_text_follows_the_readers_language(reader, client_for):
    reader.language = "en"
    reader.save(update_fields=["language"])
    english = client_for(reader).get(LIST).json()["results"][0]
    reader.language = "fr"
    reader.save(update_fields=["language"])
    french = client_for(reader).get(LIST).json()["results"][0]

    assert english["title"] == "Your password was reset"
    assert english["body"].startswith("Third reset your password.")
    assert french["title"] == "Votre mot de passe a été réinitialisé"
    assert french["body"].startswith("Third a réinitialisé votre mot de passe.")


def test_the_list_can_be_limited_to_unread(world, reader, client_for):
    services.mark_read(user=reader, notification_id=world.second.pk)

    body = client_for(reader).get(LIST, {"unread": "1"}).json()

    assert [item["id"] for item in body["results"]] == [world.third.pk, world.first.pk]


def test_the_unread_count(world, reader, client_for):
    assert client_for(reader).get(COUNT).json() == {"count": 3}
    assert client_for(world.outsider_user).get(COUNT).json() == {"count": 0}


def test_marking_one_as_read(world, reader, client_for):
    client = client_for(reader)

    response = client.post(read_url(world.first))

    assert response.status_code == 204
    assert client.get(COUNT).json() == {"count": 2}
    read = next(item for item in client.get(LIST).json()["results"] if item["id"] == world.first.pk)
    assert read["read_at"] is not None


def test_someone_elses_notification_is_not_available(world, reader, client_for):
    response = client_for(reader).post(read_url(world.foreign))

    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"
    assert client_for(world.peer_user).get(COUNT).json() == {"count": 1}


def test_a_notification_that_does_not_exist_is_not_available(reader, client_for):
    assert client_for(reader).post("/api/v1/notifications/999999/read").status_code == 404


def test_marking_all_as_read(world, reader, client_for):
    client = client_for(reader)

    assert client.post(READ_ALL).status_code == 204
    assert client.get(COUNT).json() == {"count": 0}
    assert client_for(world.peer_user).get(COUNT).json() == {"count": 1}


def test_the_list_is_paginated(reader, client_for):
    for _ in range(30):
        make_notification(reader)

    body = client_for(reader).get(LIST).json()

    assert body["count"] == 33
    assert len(body["results"]) == 25
    assert "page=2" in body["next"]
