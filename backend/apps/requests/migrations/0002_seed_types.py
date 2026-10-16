from django.db import migrations

MANAGER_THEN_HR = [("line_manager", "approve", 2, 4), ("hr_role", "approve", 2, None)]

TYPES = [
    {
        "code": "annual",
        "name_fr": "Congé annuel",
        "name_en": "Annual leave",
        "description_fr": "Jours de repos payés, déduits de votre solde.",
        "description_en": "Paid days off, taken from your balance.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "deducts_annual",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 10,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "sick",
        "name_fr": "Congé maladie",
        "name_en": "Sick leave",
        "description_fr": "Vous êtes malade. Déclarez maintenant, le certificat peut suivre.",
        "description_en": "You are ill. Report it now; the certificate can follow.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "none",
        "document_rule": "required_within_deadline",
        "allows_past_dates": True,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": True,
        "uses_events": False,
        "sort_order": 20,
        "chain": [("line_manager", "notify", 2, None), ("hr_role", "approve", 2, None)],
    },
    {
        "code": "exceptional",
        "name_fr": "Congé exceptionnel",
        "name_en": "Exceptional leave",
        "description_fr": "Un événement familial qui donne droit à des jours.",
        "description_en": "A family event that gives a fixed number of days.",
        "unit": "day",
        "allows_half_day": False,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": False,
        "uses_events": True,
        "sort_order": 30,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "permission",
        "name_fr": "Autorisation de sortie",
        "name_en": "Hourly permission",
        "description_fr": "Quelques heures d'absence dans une journée.",
        "description_en": "A few hours away during a working day.",
        "unit": "hour",
        "allows_half_day": False,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": False,
        "calendar_label": "hidden",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 40,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "remote",
        "name_fr": "Télétravail",
        "name_en": "Remote work",
        "description_fr": "Travailler à distance un jour donné.",
        "description_en": "Work from elsewhere on a given day.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "cap_quantity": "2.00",
        "cap_period": "week",
        "reduces_meal_tickets": False,
        "calendar_label": "remote",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 50,
        "chain": MANAGER_THEN_HR,
    },
]

CODES = [spec["code"] for spec in TYPES]


def seed(apps, schema_editor):
    RequestType = apps.get_model("requests", "RequestType")
    ChainStep = apps.get_model("requests", "ChainStep")
    for spec in TYPES:
        values = {key: value for key, value in spec.items() if key != "chain"}
        request_type, created = RequestType.objects.get_or_create(code=values["code"], defaults=values)
        if not created:
            continue
        for position, (rule, mode, reminder, flag) in enumerate(spec["chain"], start=1):
            ChainStep.objects.create(
                request_type=request_type,
                position=position,
                approver_rule=rule,
                mode=mode,
                reminder_after_days=reminder,
                flag_after_days=flag,
            )


def unseed(apps, schema_editor):
    RequestType = apps.get_model("requests", "RequestType")
    RequestType.objects.filter(code__in=CODES).delete()


class Migration(migrations.Migration):
    dependencies = [("requests", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
