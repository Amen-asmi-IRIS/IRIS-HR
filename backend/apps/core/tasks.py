from procrastinate.contrib.django import app

from apps.core.jobs import HEARTBEAT, RETRY, recorded


@app.periodic(cron="* * * * *")
@app.task(name=HEARTBEAT, queueing_lock=HEARTBEAT)
@recorded(HEARTBEAT)
def heartbeat(timestamp: int) -> None:
    """Proves that the worker is alive: the health check reads when this last ran."""


# Procrastinate reads cron expressions in UTC (master 6.9). Tunis is UTC+1 all year, so 22:30 UTC is 23:30 local.
@app.periodic(cron="30 22 * * *")
@app.task(name="ops.backup", retry=RETRY, queueing_lock="ops.backup")
@recorded("ops.backup")
def backup(timestamp: int) -> dict:
    """Returns the sizes that `admin/status` shows (`apps.core.selectors.backup_info`)."""
    from apps.core import backup as backup_service

    return backup_service.run_backup().as_status()
