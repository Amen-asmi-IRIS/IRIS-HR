from django.apps import AppConfig


class BalancesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.balances"
    label = "balances"

    def ready(self) -> None:
        from decimal import Decimal

        from apps.core.i18n import register_messages
        from apps.notifications.services import register_event
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES
        from .port import install

        register_messages(MESSAGES)
        register(
            SettingDef(
                key="monthly_credit_days",
                group="hr",
                kind="decimal",
                default=Decimal("2.5"),
                minimum=Decimal("0"),
                maximum=Decimal("31"),
            )
        )
        register(SettingDef(key="credit_start_date", group="hr", kind="date_or_null", default=None))
        register_event("balance.adjusted", link="/me/balance")
        # Master D49: told to the executives when HR changes their own balance; the person's record in Overview.
        register_event("balance.own_adjustment", link="/overview/people/{target}")
        register_event("balance.own_opening", link="/overview/people/{target}")
        install()
