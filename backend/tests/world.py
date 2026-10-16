"""The standard cast used by tests across apps (master 6.11). Each plan adds one line to build_world()."""

from types import SimpleNamespace

from apps.accounts.tests import world as accounts_world
from apps.notifications.tests import world as notifications_world
from apps.organisation.tests import world as organisation_world
from apps.requests.tests import world as requests_world


class World(SimpleNamespace):
    def user_for(self, persona):
        """The account of a persona of the permission matrix ("owner", "hr", ...); None for "anon"."""
        key = str(getattr(persona, "value", persona))
        if key == "anon":
            return None
        return getattr(self, f"{key}_user")


def build_world() -> World:
    world = World()
    accounts_world.build(world)
    notifications_world.build(world)
    organisation_world.build(world)
    requests_world.build(world)
    return world
