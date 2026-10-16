from django.apps import AppConfig


class CalendarConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.calendar"
    label = "calendar"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES

        register_messages(MESSAGES)
        register(SettingDef(key="working_week", group="hr", kind="weekdays", default=[1, 2, 3, 4, 5]))
