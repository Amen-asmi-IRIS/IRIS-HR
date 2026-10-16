from procrastinate.contrib.django import app

from apps.accounts import services
from apps.core.jobs import RETRY, recorded


@app.periodic(cron="30 1 * * *")  # 02:30 in Africa/Tunis: Procrastinate reads cron expressions in UTC
@app.task(name="accounts.cleanup", retry=RETRY, queueing_lock="accounts.cleanup")
@recorded("accounts.cleanup")
def cleanup(timestamp: int) -> dict[str, int]:
    return services.cleanup()
