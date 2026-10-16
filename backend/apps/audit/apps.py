from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "apps.audit"
    label = "audit"

    def ready(self) -> None:
        from apps.audit.messages import MESSAGES
        from apps.core.i18n import register_messages

        register_messages(MESSAGES)
