from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "apps.reports"
    label = "reports"

    def ready(self) -> None:
        from apps.reports import tabular

        tabular.setup()
