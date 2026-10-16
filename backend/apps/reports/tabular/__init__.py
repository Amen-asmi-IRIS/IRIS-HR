"""Tabular reports and the KPMG export (plan 06). `setup()` is called once from ReportsConfig.ready()."""

from apps.core.i18n import register_messages
from apps.settings.registry import SettingDef, register

from .messages import MESSAGES

_done = False


def setup() -> None:
    global _done
    if _done:
        return
    register_messages(MESSAGES)
    register(
        SettingDef(key="meal_tickets_per_month", group="hr", kind="int", default=21, minimum=0, maximum=31)
    )
    register(
        SettingDef(
            key="export_cutoff_day", group="hr", kind="int_or_null", default=None, minimum=1, maximum=28
        )
    )
    _done = True
