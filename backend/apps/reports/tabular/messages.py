"""Server texts of reports and exports. Checked for language parity by backend/tests/test_messages.py."""

MESSAGES = {
    # problems
    "reports.unknown_report": {
        "en": "This report does not exist. Go back to the list of reports.",
        "fr": "Ce rapport n'existe pas. Revenez à la liste des rapports.",
    },
    "reports.hr_only": {
        "en": "This report is reserved for HR.",
        "fr": "Ce rapport est réservé aux RH.",
    },
    "reports.scope_not_allowed": {
        "en": "You cannot run this report for that group of people.",
        "fr": "Vous ne pouvez pas lancer ce rapport pour ce groupe de personnes.",
    },
    "reports.unknown_scope": {
        "en": "Choose your team or the whole company.",
        "fr": "Choisissez votre équipe ou toute l'entreprise.",
    },
    "reports.period_required": {
        "en": "Choose a start date and an end date.",
        "fr": "Choisissez une date de début et une date de fin.",
    },
    "reports.period_order": {
        "en": "The end date is before the start date. Choose an end date on or after the start.",
        "fr": "La date de fin précède la date de début. Choisissez une date de fin égale ou postérieure au début.",
    },
    "reports.period_too_long": {
        "en": "The period is longer than {days:days}. Choose a shorter period.",
        "fr": "La période dépasse {days:days}. Choisissez une période plus courte.",
    },
    "reports.invalid_date": {
        "en": "This is not a valid date. Pick one from the calendar.",
        "fr": "Cette date n'est pas valide. Choisissez-en une dans le calendrier.",
    },
    "reports.invalid_year": {
        "en": "Choose a year between 2000 and 2100.",
        "fr": "Choisissez une année entre 2000 et 2100.",
    },
    "reports.invalid_filter": {
        "en": "This filter value is not valid. Pick one from the list.",
        "fr": "Cette valeur de filtre n'est pas valide. Choisissez-en une dans la liste.",
    },
    "reports.filter_not_available": {
        "en": "This filter is not available for this report. Remove it.",
        "fr": "Ce filtre n'est pas disponible pour ce rapport. Retirez-le.",
    },
    "reports.unknown_type": {
        "en": "This request type does not exist. Pick one from the list.",
        "fr": "Ce type de demande n'existe pas. Choisissez-en un dans la liste.",
    },
    "reports.unknown_step": {
        "en": "This step does not exist. Pick one from the list.",
        "fr": "Cette étape n'existe pas. Choisissez-en une dans la liste.",
    },
    "reports.employee_not_found": {
        "en": "This person is not available. Pick someone from the list.",
        "fr": "Cette personne n'est pas disponible. Choisissez quelqu'un dans la liste.",
    },
    "reports.nothing_to_export": {
        "en": "Nothing to export for this selection. Widen the period or remove a filter.",
        "fr": "Rien à exporter pour cette sélection. Élargissez la période ou retirez un filtre.",
    },
    # titles
    "reports.title_absences": {"en": "Absences taken", "fr": "Absences prises"},
    "reports.title_balances": {"en": "Balances at a date", "fr": "Soldes à une date"},
    "reports.title_waiting": {"en": "Requests waiting", "fr": "Demandes en attente"},
    "reports.title_permission_hours": {
        "en": "Permission hours by month",
        "fr": "Heures de permission par mois",
    },
    "reports.title_remote_days": {"en": "Remote days by month", "fr": "Jours de télétravail par mois"},
    "reports.title_certificates": {"en": "Certificates outstanding", "fr": "Certificats en attente"},
    "reports.title_kpmg": {"en": "KPMG export", "fr": "Export KPMG"},
    # totals and steps
    "reports.total": {"en": "Total", "fr": "Total"},
    "reports.step_line_manager": {"en": "The manager", "fr": "Le responsable"},
    "reports.step_hr_role": {"en": "HR", "fr": "RH"},
    "reports.step_named_person": {"en": "A named person", "fr": "Une personne désignée"},
    # notes beside the figures
    "reports.note_credits_to_come": {
        "en": "Balances on {on} include the month-end credits that are not posted yet.",
        "fr": "Les soldes au {on} comprennent les crédits de fin de mois qui ne sont pas encore enregistrés.",
    },
    "reports.note_kpmg_credits_to_come": {
        "en": "The annual balance on {on} includes the month-end credits that are not posted yet.",
        "fr": "Le solde annuel au {on} comprend les crédits de fin de mois qui ne sont pas encore enregistrés.",
    },
    # columns of the six reports
    "reports.col_employee": {"en": "Employee", "fr": "Salarié"},
    "reports.col_department": {"en": "Department", "fr": "Département"},
    "reports.col_type": {"en": "Type", "fr": "Type"},
    "reports.col_period": {"en": "Dates", "fr": "Dates"},
    "reports.col_from": {"en": "From", "fr": "Du"},
    "reports.col_to": {"en": "To", "fr": "Au"},
    "reports.col_days": {"en": "Days", "fr": "Jours"},
    "reports.col_hours": {"en": "Hours", "fr": "Heures"},
    "reports.col_balance": {"en": "Balance on the date", "fr": "Solde à la date"},
    "reports.col_pending": {"en": "Days pending", "fr": "Jours en attente"},
    "reports.col_approved_upcoming": {"en": "Days approved and upcoming", "fr": "Jours approuvés à venir"},
    "reports.col_requester": {"en": "Requester", "fr": "Demandeur"},
    "reports.col_waiting_on": {"en": "Waiting on", "fr": "En attente de"},
    "reports.col_since": {"en": "Since", "fr": "Depuis"},
    "reports.col_age_days": {"en": "Days waiting", "fr": "Jours d'attente"},
    "reports.col_reminded": {"en": "Reminded", "fr": "Relancé"},
    "reports.col_alerted": {"en": "HR alerted", "fr": "RH alertées"},
    "reports.col_total": {"en": "Total", "fr": "Total"},
    "reports.col_due": {"en": "Certificate due", "fr": "Certificat attendu"},
    "reports.col_overdue_hours": {"en": "Overdue (hours)", "fr": "Retard (heures)"},
    "reports.col_m01": {"en": "Jan", "fr": "Janv."},
    "reports.col_m02": {"en": "Feb", "fr": "Févr."},
    "reports.col_m03": {"en": "Mar", "fr": "Mars"},
    "reports.col_m04": {"en": "Apr", "fr": "Avr."},
    "reports.col_m05": {"en": "May", "fr": "Mai"},
    "reports.col_m06": {"en": "Jun", "fr": "Juin"},
    "reports.col_m07": {"en": "Jul", "fr": "Juil."},
    "reports.col_m08": {"en": "Aug", "fr": "Août"},
    "reports.col_m09": {"en": "Sep", "fr": "Sept."},
    "reports.col_m10": {"en": "Oct", "fr": "Oct."},
    "reports.col_m11": {"en": "Nov", "fr": "Nov."},
    "reports.col_m12": {"en": "Dec", "fr": "Déc."},
    # columns of the KPMG export (REP-04)
    "reports.col_employee_number": {"en": "Employee number", "fr": "Matricule"},
    "reports.col_name": {"en": "Name", "fr": "Nom"},
    "reports.col_annual_days": {"en": "Annual leave (days)", "fr": "Congé annuel (jours)"},
    "reports.col_sick_days": {"en": "Sick leave (days)", "fr": "Congé maladie (jours)"},
    "reports.col_exceptional_days": {"en": "Exceptional leave (days)", "fr": "Congé exceptionnel (jours)"},
    "reports.col_permission_hours": {"en": "Permissions (hours)", "fr": "Permissions (heures)"},
    "reports.col_remote_days": {"en": "Remote work (days)", "fr": "Télétravail (jours)"},
    "reports.col_balance_end": {"en": "Annual balance at period end", "fr": "Solde annuel en fin de période"},
    "reports.col_meal_tickets": {"en": "Meal tickets", "fr": "Tickets restaurant"},
}
