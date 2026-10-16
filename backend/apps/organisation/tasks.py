from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


@app.periodic(cron="0 5 * * *")  # 06:00 in Africa/Tunis: Procrastinate reads cron expressions in UTC
@app.task(
    name="organisation.delegation_transitions",
    retry=RETRY,
    queueing_lock="organisation.delegation_transitions",
)
@recorded("organisation.delegation_transitions")
def delegation_transitions(timestamp: int) -> dict[str, int]:
    return {"notifications": services.announce_delegation_transitions()}
