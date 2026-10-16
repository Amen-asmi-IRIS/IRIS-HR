from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


@app.periodic(cron="0 * * * *")
@app.task(name="requests.reminders_and_flags", retry=RETRY, queueing_lock="requests.reminders_and_flags")
@recorded("requests.reminders_and_flags")
def reminders_and_flags(timestamp: int) -> dict[str, int]:
    return services.send_reminders_and_flags()


@app.periodic(cron="15 * * * *")
@app.task(name="requests.certificate_deadlines", retry=RETRY, queueing_lock="requests.certificate_deadlines")
@recorded("requests.certificate_deadlines")
def certificate_deadlines(timestamp: int) -> dict[str, int]:
    return services.check_certificate_deadlines()
