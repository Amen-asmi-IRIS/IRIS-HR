from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


# 01:00 in Africa/Tunis (Procrastinate reads cron expressions in UTC): on the 1st, the month just over is credited.
@app.periodic(cron="0 0 * * *")
@app.task(name="balances.month_end_credit", retry=RETRY, queueing_lock="balances.month_end_credit")
@recorded("balances.month_end_credit")
def month_end_credit(timestamp: int) -> dict[str, int]:
    return {"lines": services.post_month_end_credits()}
