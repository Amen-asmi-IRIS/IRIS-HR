"""Texts of the errors every app can raise. Each says what happened and what to do next (NFR-05)."""

MESSAGES = {
    "core.invalid": {
        "en": "This request is not valid. Check what you entered and try again.",
        "fr": "Cette demande n'est pas valide. Vérifiez votre saisie et réessayez.",
    },
    "core.validation": {
        "en": "Some fields need your attention.",
        "fr": "Certains champs sont à corriger.",
    },
    "core.not_authenticated": {
        "en": "Sign in to continue.",
        "fr": "Connectez-vous pour continuer.",
    },
    "core.not_allowed": {
        "en": "You are not allowed to do this.",
        "fr": "Vous n'êtes pas autorisé à effectuer cette action.",
    },
    "core.not_found": {
        "en": "This page or item is not available.",
        "fr": "Cette page ou cet élément n'est pas disponible.",
    },
    "core.ordering_invalid": {
        "en": "This list cannot be sorted that way. Allowed values: {allowed}.",
        "fr": "Cette liste ne peut pas être triée ainsi. Valeurs possibles : {allowed}.",
    },
    "core.conflict": {
        "en": "Someone else changed this in the meantime. Reload to see the current state.",
        "fr": "Quelqu'un d'autre a modifié cet élément entre-temps. Rechargez pour voir l'état actuel.",
    },
    "core.rate_limited": {
        "en": "Too many attempts. Wait a few minutes and try again.",
        "fr": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
    },
    "core.method_not_allowed": {
        "en": "This action is not available here.",
        "fr": "Cette action n'est pas disponible ici.",
    },
    "core.malformed": {
        "en": "The request could not be read. Reload the page and try again.",
        "fr": "La demande n'a pas pu être lue. Rechargez la page et réessayez.",
    },
    "core.unsupported_media_type": {
        "en": "This kind of content is not accepted here.",
        "fr": "Ce type de contenu n'est pas accepté ici.",
    },
    "core.not_acceptable": {
        "en": "The requested format is not available.",
        "fr": "Le format demandé n'est pas disponible.",
    },
    "core.unexpected": {
        "en": "Something went wrong. Quote the reference {reference} to the administrator.",
        "fr": "Une erreur est survenue. Communiquez la référence {reference} à l'administrateur.",
    },
}
