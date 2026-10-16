from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self) -> None:
        from apps.accounts import schema  # noqa: F401  registers the OpenAPI session scheme
        from apps.accounts.messages import MESSAGES
        from apps.core.i18n import register_messages
        from apps.notifications import services as notifications

        register_messages(MESSAGES)
        notifications.register_event("account.password_reset", link="/password")
