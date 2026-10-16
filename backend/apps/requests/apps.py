from django.apps import AppConfig


class RequestsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.requests"
    label = "requests"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.organisation.services import register_archive_contributor, register_departure_listener
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES
        from .services import attachments, departures, notices

        register_messages(MESSAGES)
        notices.register_events()
        attachments.register_access_rules()
        register_archive_contributor(departures.open_requests_section)
        register_archive_contributor(departures.open_steps_section)
        register_departure_listener(departures.flag_open_steps)
        register(
            SettingDef(
                key="certificate_deadline_hours", group="hr", kind="int", default=48, minimum=1, maximum=720
            )
        )
        register(
            SettingDef(
                key="certificate_warning_hours", group="hr", kind="int", default=12, minimum=1, maximum=720
            )
        )
