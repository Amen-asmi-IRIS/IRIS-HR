"""Every text the requests app shows: problems, labels, history lines and notifications."""

_WHO_WHEN = {"en": "{employee}: {start} to {end}.", "fr": "{employee} : du {start} au {end}."}
_WHEN = {"en": "{start} to {end}.", "fr": "Du {start} au {end}."}

PROBLEMS = {
    "request.actor_without_record": {
        "en": "Your account is not linked to an employee record, so you cannot do this. Ask HR to link it.",
        "fr": "Votre compte n'est pas lié à une fiche employé, cette action est donc impossible. Demandez aux RH de le lier.",
    },
    "request.end_before_start": {
        "en": "The end date is before the start date. Choose an end date on or after the start.",
        "fr": "La date de fin précède la date de début. Choisissez une fin égale ou postérieure au début.",
    },
    "request.period_too_long": {
        "en": "A request cannot cover more than {days:days}. Check the year of each date, or split the absence.",
        "fr": "Une demande ne peut pas couvrir plus de {days:days}. Vérifiez l'année de chaque date, ou scindez l'absence.",
    },
    "request.no_working_day": {
        "en": "These dates contain no working day. Choose dates that include at least one.",
        "fr": "Ces dates ne contiennent aucun jour ouvré. Choisissez des dates qui en incluent au moins un.",
    },
    "request.half_day_not_allowed": {
        "en": "This kind of request cannot start or end at midday. Remove the half-day.",
        "fr": "Ce type de demande ne peut pas commencer ni finir à la mi-journée. Retirez la demi-journée.",
    },
    "request.half_day_on_non_working_day": {
        "en": "A half-day can only be set on a working day. Move the date or remove the half-day.",
        "fr": "Une demi-journée ne peut porter que sur un jour ouvré. Déplacez la date ou retirez la demi-journée.",
    },
    "request.half_day_both_ends": {
        "en": "A single day cannot start and end at midday. Choose the morning or the afternoon.",
        "fr": "Une seule journée ne peut pas commencer et finir à la mi-journée. Choisissez le matin ou l'après-midi.",
    },
    "request.past_dates": {
        "en": "These dates are in the past. Choose a later start, or ask HR to enter the request for you.",
        "fr": "Ces dates sont passées. Choisissez un début ultérieur, ou demandez aux RH de saisir la demande pour vous.",
    },
    "request.notice": {
        "en": "This kind of request must be sent at least {days:days} before it starts. Choose a later start.",
        "fr": "Ce type de demande doit être envoyé au moins {days:days} avant son début. Choisissez un début ultérieur.",
    },
    "request.overlap": {
        "en": "These dates overlap another of your requests ({other}). Change the dates or withdraw the other request.",
        "fr": "Ces dates chevauchent une autre de vos demandes ({other}). Modifiez les dates ou retirez l'autre demande.",
    },
    "request.balance_insufficient": {
        "en": "Your leave balance is short by {shortfall:days} for these dates. Shorten the request, or ask HR for an exception.",
        "fr": "Il manque {shortfall:days} à votre solde pour ces dates. Raccourcissez la demande, ou demandez une exception aux RH.",
    },
    "request.cap_exceeded": {
        "en": "The limit is {limit} for this period and {used} are already taken. Choose other dates.",
        "fr": "La limite est de {limit} sur cette période et {used} sont déjà pris. Choisissez d'autres dates.",
    },
    "request.event_required": {
        "en": "Choose the event this leave is for.",
        "fr": "Choisissez l'événement auquel ce congé se rapporte.",
    },
    "request.event_days_exceeded": {
        "en": "This event allows {allowed:days}. Shorten the request.",
        "fr": "Cet événement donne droit à {allowed:days}. Raccourcissez la demande.",
    },
    "request.permission_non_working_day": {
        "en": "A permission must be on a working day. Choose another date.",
        "fr": "Une autorisation doit porter sur un jour ouvré. Choisissez une autre date.",
    },
    "request.permission_times": {
        "en": "Give one date, a start time and a later end time, both on a quarter hour.",
        "fr": "Indiquez une seule date, une heure de début et une heure de fin postérieure, toutes deux au quart d'heure.",
    },
    "request.permission_overlaps_absence": {
        "en": "You are already absent on this half-day. Choose another time or date.",
        "fr": "Vous êtes déjà absent(e) sur cette demi-journée. Choisissez un autre horaire ou une autre date.",
    },
    "request.reason_required": {
        "en": "Give a reason.",
        "fr": "Indiquez un motif.",
    },
    "request.comment_required": {
        "en": "Add a comment so the person knows what to do.",
        "fr": "Ajoutez un commentaire pour que la personne sache quoi faire.",
    },
    "request.not_editable": {
        "en": "This request can no longer be changed here. Reload the page to see what is possible now.",
        "fr": "Cette demande ne peut plus être modifiée ici. Rechargez la page pour voir ce qui est possible.",
    },
    "request.not_withdrawable": {
        "en": "This request can no longer be withdrawn. If it is approved, ask for a change or a cancellation.",
        "fr": "Cette demande ne peut plus être retirée. Si elle est approuvée, demandez une modification ou une annulation.",
    },
    "request.already_processed": {
        "en": "Someone else has already acted on this request. Reload the page to see where it stands.",
        "fr": "Quelqu'un d'autre a déjà agi sur cette demande. Rechargez la page pour voir où elle en est.",
    },
    "request.own_request": {
        "en": "Nobody can act on their own request. Another person must do this.",
        "fr": "Nul ne peut agir sur sa propre demande. Une autre personne doit le faire.",
    },
    "request.not_started_only": {
        "en": "This request has already started, so it cannot be changed here. Ask HR to correct it.",
        "fr": "Cette demande a déjà commencé et ne peut plus être modifiée ici. Demandez aux RH de la corriger.",
    },
    "request.amendment_open": {
        "en": "A change is already waiting on this request. Wait for its outcome or withdraw it first.",
        "fr": "Une modification est déjà en attente sur cette demande. Attendez son issue ou retirez-la d'abord.",
    },
    "request.type_inactive": {
        "en": "This kind of request is no longer available. Choose another kind.",
        "fr": "Ce type de demande n'est plus disponible. Choisissez un autre type.",
    },
    "request.chain_needs_approver": {
        "en": "At least one step must decide. Set one step to approve.",
        "fr": "Au moins une étape doit décider. Mettez une étape en approbation.",
    },
    "request.named_person_required": {
        "en": "Choose the person for each step given to a named person.",
        "fr": "Choisissez la personne pour chaque étape confiée à une personne désignée.",
    },
    "request.step_delay_invalid": {
        "en": "Delays are counted in working days and must be at least 1.",
        "fr": "Les délais se comptent en jours ouvrés et doivent être d'au moins 1.",
    },
    "request.type_code_taken": {
        "en": "Another kind of request already uses this code. Choose a different code.",
        "fr": "Un autre type de demande utilise déjà ce code. Choisissez un code différent.",
    },
    "request.type_fixed": {
        "en": "The code and the unit of a kind of request cannot be changed. Create a new kind instead.",
        "fr": "Le code et l'unité d'un type de demande ne peuvent pas être modifiés. Créez plutôt un nouveau type.",
    },
    "request.type_half_day_hours": {
        "en": "A kind counted in hours cannot allow half-days. Turn half-days off.",
        "fr": "Un type compté en heures ne peut pas autoriser les demi-journées. Désactivez les demi-journées.",
    },
    "request.type_cap_incomplete": {
        "en": "Give both the limit and its period, or neither.",
        "fr": "Indiquez à la fois la limite et sa période, ou aucune des deux.",
    },
    "request.type_unknown": {
        "en": "This kind of request does not exist. Choose one from the list.",
        "fr": "Ce type de demande n'existe pas. Choisissez-en un dans la liste.",
    },
    "request.event_days_invalid": {
        "en": "The days allowed must be more than zero.",
        "fr": "Le nombre de jours accordés doit être supérieur à zéro.",
    },
    "request.scope_invalid": {
        "en": "Unknown list. Use mine, team, all or decided.",
        "fr": "Liste inconnue. Utilisez mine, team, all ou decided.",
    },
    "request.queue_invalid": {
        "en": "Unknown queue. Use mine, hr, certificates or stuck.",
        "fr": "File inconnue. Utilisez mine, hr, certificates ou stuck.",
    },
    "request.filter_invalid": {
        "en": "One of the filters has a value that cannot be read. Check the dates and the year.",
        "fr": "L'un des filtres a une valeur illisible. Vérifiez les dates et l'année.",
    },
    "request.amendment_cannot_return": {
        "en": "A change to an approved request can be approved or refused, not sent back.",
        "fr": "Une modification d'une demande approuvée peut être approuvée ou refusée, pas renvoyée.",
    },
    "request.decided_at_future": {
        "en": "The decision cannot be dated in the future. Give the date and time it was made.",
        "fr": "La décision ne peut pas être datée dans le futur. Indiquez la date et l'heure où elle a été prise.",
    },
    "request.channel_invalid": {
        "en": "Say how the decision was given: verbally or on paper.",
        "fr": "Précisez comment la décision a été donnée : oralement ou sur papier.",
    },
    "request.decided_by_not_approver": {
        "en": "This person is not one of those who decide this step. Choose its approver, or give the step to someone else first.",
        "fr": "Cette personne ne fait pas partie de celles qui décident cette étape. Choisissez son approbateur, ou confiez d'abord l'étape à quelqu'un d'autre.",
    },
    "request.approver_without_account": {
        "en": "This person has no active account and could not decide. Choose someone else.",
        "fr": "Cette personne n'a pas de compte actif et ne pourrait pas décider. Choisissez quelqu'un d'autre.",
    },
    "request.dates_required": {
        "en": "Give the new dates.",
        "fr": "Indiquez les nouvelles dates.",
    },
    "request.nothing_to_change": {
        "en": "The new dates are the same as the current ones. Change something or cancel.",
        "fr": "Les nouvelles dates sont identiques aux dates actuelles. Modifiez quelque chose ou annulez.",
    },
    "request.not_reclassifiable": {
        "en": "Only a sick leave waiting for HR can be counted as annual leave.",
        "fr": "Seul un arrêt maladie en attente des RH peut être compté en congé annuel.",
    },
}

LABELS = {
    "request.label_hr": {"en": "HR", "fr": "RH"},
}

HISTORY = {
    "request.history_request_created": {"en": "Request created", "fr": "Demande créée"},
    "request.history_request_updated": {"en": "Request edited", "fr": "Demande modifiée"},
    "request.history_request_submitted": {"en": "Request sent", "fr": "Demande envoyée"},
    "request.history_request_withdrawn": {"en": "Request withdrawn", "fr": "Demande retirée"},
    "request.history_request_approved": {"en": "Request approved", "fr": "Demande approuvée"},
    "request.history_request_rejected": {"en": "Request refused", "fr": "Demande refusée"},
    "request.history_request_returned": {
        "en": "Request sent back for correction",
        "fr": "Demande renvoyée pour correction",
    },
    "request.history_step_decided": {"en": "Decision recorded", "fr": "Décision enregistrée"},
    "request.history_step_recorded_on_behalf": {
        "en": "Decision entered by HR on someone's behalf",
        "fr": "Décision saisie par les RH au nom d'un tiers",
    },
    "request.history_step_reassigned": {
        "en": "Step given to someone else",
        "fr": "Étape confiée à une autre personne",
    },
    "request.history_amendment_opened": {"en": "Change requested", "fr": "Modification demandée"},
    "request.history_amendment_withdrawn": {"en": "Change withdrawn", "fr": "Modification retirée"},
    "request.history_amendment_approved": {"en": "Change approved", "fr": "Modification approuvée"},
    "request.history_amendment_rejected": {"en": "Change refused", "fr": "Modification refusée"},
    "request.history_request_corrected": {"en": "Corrected by HR", "fr": "Corrigée par les RH"},
    "request.history_request_cancelled": {"en": "Cancelled by HR", "fr": "Annulée par les RH"},
    "request.history_request_reclassified": {
        "en": "Counted as annual leave by HR",
        "fr": "Comptée en congé annuel par les RH",
    },
    "request.history_request_attachment_added": {"en": "File added", "fr": "Fichier ajouté"},
}

NOTIFICATIONS = {
    "notification.step.to_decide.title": {
        "en": "A request is waiting for your decision",
        "fr": "Une demande attend votre décision",
    },
    "notification.step.to_decide.body": _WHO_WHEN,
    "notification.step.reminder.title": {
        "en": "Reminder: a request is still waiting for you",
        "fr": "Rappel : une demande vous attend toujours",
    },
    "notification.step.reminder.body": _WHO_WHEN,
    "notification.step.flagged.title": {
        "en": "A request is stuck with a manager",
        "fr": "Une demande est bloquée chez un responsable",
    },
    "notification.step.flagged.body": {
        "en": "{employee}: {start} to {end}. Nobody has decided yet.",
        "fr": "{employee} : du {start} au {end}. Personne n'a encore décidé.",
    },
    "notification.step.informed.title": {
        "en": "For your information: a request was sent",
        "fr": "Pour information : une demande a été envoyée",
    },
    "notification.step.informed.body": _WHO_WHEN,
    "notification.request.approved.title": {
        "en": "Your request is approved",
        "fr": "Votre demande est approuvée",
    },
    "notification.request.approved.body": _WHEN,
    "notification.request.rejected.title": {
        "en": "Your request was refused",
        "fr": "Votre demande a été refusée",
    },
    "notification.request.rejected.body": {
        "en": "{start} to {end}. Open it to read the reason.",
        "fr": "Du {start} au {end}. Ouvrez-la pour lire le motif.",
    },
    "notification.request.returned.title": {
        "en": "Your request was sent back to you",
        "fr": "Votre demande vous a été renvoyée",
    },
    "notification.request.returned.body": {
        "en": "{start} to {end}. Open it to read the comment, then correct it and send it again.",
        "fr": "Du {start} au {end}. Ouvrez-la pour lire le commentaire, puis corrigez-la et renvoyez-la.",
    },
    "notification.request.withdrawn.title": {
        "en": "A request was withdrawn",
        "fr": "Une demande a été retirée",
    },
    "notification.request.withdrawn.body": _WHO_WHEN,
    "notification.request.cancelled.title": {
        "en": "A request was cancelled by HR",
        "fr": "Une demande a été annulée par les RH",
    },
    "notification.request.cancelled.body": _WHO_WHEN,
    "notification.request.corrected.title": {
        "en": "A request was changed by HR",
        "fr": "Une demande a été modifiée par les RH",
    },
    "notification.request.corrected.body": _WHO_WHEN,
    "notification.request.sent_on_behalf.title": {
        "en": "A request was sent in your name",
        "fr": "Une demande a été envoyée en votre nom",
    },
    "notification.request.sent_on_behalf.body": {
        "en": "{by} sent it for you: {start} to {end}. Open it to check the details.",
        "fr": "{by} l'a envoyée pour vous : du {start} au {end}. Ouvrez-la pour en vérifier le détail.",
    },
    "notification.amendment.submitted.title": {
        "en": "A change to an approved request is waiting for your decision",
        "fr": "Une modification d'une demande approuvée attend votre décision",
    },
    "notification.amendment.submitted.body": _WHO_WHEN,
    "notification.amendment.approved.title": {
        "en": "Your change is approved",
        "fr": "Votre modification est approuvée",
    },
    "notification.amendment.approved.body": _WHEN,
    "notification.amendment.rejected.title": {
        "en": "Your change was refused",
        "fr": "Votre modification a été refusée",
    },
    "notification.amendment.rejected.body": {
        "en": "The original request stays valid: {start} to {end}.",
        "fr": "La demande initiale reste valable : du {start} au {end}.",
    },
    "notification.sick.declared.title": {"en": "Sick leave reported", "fr": "Arrêt maladie déclaré"},
    "notification.sick.declared.body": _WHO_WHEN,
    "notification.certificate.due_soon.title": {
        "en": "Your medical certificate is due soon",
        "fr": "Votre certificat médical est bientôt attendu",
    },
    "notification.certificate.due_soon.body": {
        "en": "Sick leave from {start} to {end}. Add the certificate before {due}.",
        "fr": "Arrêt du {start} au {end}. Ajoutez le certificat avant le {due}.",
    },
    "notification.certificate.overdue.title": {
        "en": "A medical certificate is overdue",
        "fr": "Un certificat médical est en retard",
    },
    "notification.certificate.overdue.body": _WHO_WHEN,
    "notification.hr_step.unattended.title": {
        "en": "A request has nobody to validate it",
        "fr": "Une demande n'a personne pour la valider",
    },
    "notification.hr_step.unattended.body": {
        "en": "No HR or executive account can act on a request waiting for HR. Give the HR role to someone.",
        "fr": "Aucun compte RH ou direction ne peut agir sur une demande en attente des RH. Attribuez le rôle RH à quelqu'un.",
    },
}

MESSAGES = {**PROBLEMS, **LABELS, **HISTORY, **NOTIFICATIONS}
