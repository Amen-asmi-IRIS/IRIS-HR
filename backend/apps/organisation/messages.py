MESSAGES = {
    "organisation.number_taken": {
        "en": "This employee number is already used. Enter another number.",
        "fr": "Ce matricule est déjà utilisé. Saisissez un autre matricule.",
    },
    "organisation.email_taken": {
        "en": "This professional email already belongs to another employee.",
        "fr": "Cette adresse professionnelle appartient déjà à un autre employé.",
    },
    "organisation.email_domain": {
        "en": "The professional email must end with @{domain}.",
        "fr": "L'adresse professionnelle doit se terminer par @{domain}.",
    },
    "organisation.contract_dates": {
        "en": "The contract cannot end before it starts. Correct one of the two dates.",
        "fr": "Le contrat ne peut pas se terminer avant d'avoir commencé. Corrigez l'une des deux dates.",
    },
    "organisation.manager_loop": {
        "en": "This person reports, directly or not, to the employee. Choose a manager outside their team.",
        "fr": "Cette personne dépend, directement ou non, de l'employé. Choisissez un responsable extérieur à son équipe.",
    },
    "organisation.manager_self": {
        "en": "An employee cannot be their own manager. Choose someone else.",
        "fr": "Un employé ne peut pas être son propre responsable. Choisissez une autre personne.",
    },
    "organisation.manager_left": {
        "en": "This person has left the company. Choose another manager.",
        "fr": "Cette personne a quitté l'entreprise. Choisissez un autre responsable.",
    },
    "organisation.already_archived": {
        "en": "This departure has already been recorded.",
        "fr": "Ce départ a déjà été enregistré.",
    },
    "organisation.nothing_to_change": {
        "en": "Nothing differs from your current details. Change at least one field.",
        "fr": "Rien ne diffère de vos informations actuelles. Modifiez au moins un champ.",
    },
    "organisation.field_not_proposable": {
        "en": "The field {name} can only be changed by HR.",
        "fr": "Le champ {name} ne peut être modifié que par les RH.",
    },
    "organisation.change_already_open": {
        "en": "You already have a change waiting for HR. Withdraw it before proposing another.",
        "fr": "Vous avez déjà une modification en attente côté RH. Retirez-la avant d'en proposer une autre.",
    },
    "organisation.change_already_decided": {
        "en": "This proposal has already been decided or withdrawn.",
        "fr": "Cette proposition a déjà été traitée ou retirée.",
    },
    "organisation.delegation_overlap": {
        "en": "Another delegation already covers part of these dates. End it or choose other dates.",
        "fr": "Une autre délégation couvre déjà une partie de ces dates. Terminez-la ou choisissez d'autres dates.",
    },
    "organisation.delegation_self": {
        "en": "Choose someone other than the manager as delegate.",
        "fr": "Choisissez comme délégué une autre personne que le responsable.",
    },
    "organisation.delegation_dates": {
        "en": "A delegation starts today or later and ends on or after its first day.",
        "fr": "Une délégation commence aujourd'hui ou plus tard et se termine au plus tôt le jour de son début.",
    },
    "organisation.delegation_not_manager": {
        "en": "Nobody reports to this person, so there is nothing to delegate.",
        "fr": "Personne ne dépend de cette personne : il n'y a rien à déléguer.",
    },
    "organisation.delegation_delegate_inactive": {
        "en": "This person is not active. Choose an active employee as delegate.",
        "fr": "Cette personne n'est pas active. Choisissez un employé actif comme délégué.",
    },
    "notification.profile_change.proposed.title": {
        "en": "Profile change to decide",
        "fr": "Modification de profil à traiter",
    },
    "notification.profile_change.proposed.body": {
        "en": "{employee} proposes a change to their details.",
        "fr": "{employee} propose une modification de ses informations.",
    },
    "notification.profile_change.accepted.title": {
        "en": "Your profile change was accepted",
        "fr": "Votre modification de profil a été acceptée",
    },
    "notification.profile_change.accepted.body": {
        "en": "HR accepted the change you proposed. Your record is up to date.",
        "fr": "Les RH ont accepté votre proposition. Votre fiche est à jour.",
    },
    "notification.profile_change.rejected.title": {
        "en": "Your profile change was refused",
        "fr": "Votre modification de profil a été refusée",
    },
    "notification.profile_change.rejected.body": {
        "en": "HR refused the change you proposed. Open your profile to read their comment.",
        "fr": "Les RH ont refusé votre proposition. Ouvrez votre profil pour lire leur commentaire.",
    },
    "notification.delegation.started.title": {
        "en": "Delegation started",
        "fr": "Délégation commencée",
    },
    "notification.delegation.started.body": {
        "en": "{delegate} now decides for {manager}, from {start} to {end}.",
        "fr": "{delegate} décide désormais à la place de {manager}, du {start} au {end}.",
    },
    "notification.delegation.ended.title": {
        "en": "Delegation ended",
        "fr": "Délégation terminée",
    },
    "notification.delegation.ended.body": {
        "en": "{delegate} no longer decides for {manager} (delegation from {start} to {end}).",
        "fr": "{delegate} ne décide plus à la place de {manager} (délégation du {start} au {end}).",
    },
}
