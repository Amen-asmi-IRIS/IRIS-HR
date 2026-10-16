"""Texts of the notifications the platform itself raises. Each app adds its own events in its messages.py."""

MESSAGES = {
    "notification.job.failed.title": {
        "en": "A scheduled job failed",
        "fr": "Une tâche planifiée a échoué",
    },
    "notification.job.failed.body": {
        "en": "The job {job} failed. Open Status to see what happened.",
        "fr": "La tâche {job} a échoué. Ouvrez l'état du système pour voir ce qui s'est passé.",
    },
    "notification.error.unexpected.title": {
        "en": "An unexpected error occurred",
        "fr": "Une erreur inattendue s'est produite",
    },
    "notification.error.unexpected.body": {
        "en": "A user met an error. Search the logs for the reference {reference}.",
        "fr": "Un utilisateur a rencontré une erreur. Cherchez la référence {reference} dans les journaux.",
    },
}
