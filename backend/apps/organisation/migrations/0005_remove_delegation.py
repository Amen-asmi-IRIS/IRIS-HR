from django.db import migrations

# Delegation is removed (D54). Its notifications are rendered from texts that no longer exist, and its
# job no longer runs: their rows go too. Audit lines stay, as the trail is append-only.
EVENTS = ["delegation.started", "delegation.ended", "delegation.prompt"]
JOB = "organisation.delegation_transitions"


def forget(apps, schema_editor):
    apps.get_model("notifications", "Notification").objects.filter(event_code__in=EVENTS).delete()
    apps.get_model("core", "JobStatus").objects.filter(name=JOB).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("organisation", "0004_profilechange"),
        ("notifications", "0001_initial"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forget, migrations.RunPython.noop),
        migrations.DeleteModel(name="Delegation"),
    ]
