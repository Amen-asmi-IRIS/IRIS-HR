from apps.notifications import services


def make_notification(user, *, by="Sonia Admin", dedupe_key=None):
    """One "your password was reset" notification for `user`."""
    created = services.notify(
        users=[user],
        event="account.password_reset",
        params={"by": by},
        target_type="account",
        dedupe_key=dedupe_key,
    )
    return created[0]


def build(world) -> None:
    world.owner_notification = make_notification(world.owner_user)
