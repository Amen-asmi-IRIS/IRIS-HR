from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    label = "notifications"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.notifications import services
        from apps.notifications.messages import MESSAGES

        register_messages(MESSAGES)
        services.register_event("job.failed", link="/admin")
        services.register_event("error.unexpected", link="/admin")
