from django.apps import AppConfig


class FilesConfig(AppConfig):
    name = "apps.files"
    label = "files"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.core.i18n import register_messages

        from .messages import MESSAGES

        register_messages(MESSAGES)
