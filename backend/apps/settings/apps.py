from django.apps import AppConfig


class SettingsConfig(AppConfig):
    name = "apps.settings"
    label = "settings"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.settings.defaults import register_system_settings
        from apps.settings.messages import MESSAGES

        register_messages(MESSAGES)
        register_system_settings()
