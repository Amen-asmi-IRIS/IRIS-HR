from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.core.messages import MESSAGES

        register_messages(MESSAGES)
