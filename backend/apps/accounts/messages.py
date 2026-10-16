"""Texts for sign-in, passwords and account administration (UI 4.1, 9.3)."""

MESSAGES = {
    # --- signing in ---
    "auth.invalid_credentials": {
        "en": "Wrong email or password. Check both and try again.",
        "fr": "Adresse e-mail ou mot de passe incorrect. Vérifiez les deux et réessayez.",
    },
    "auth.domain_not_allowed": {
        "en": "Only addresses ending in @{domain} can sign in. Use your professional email.",
        "fr": "Seules les adresses se terminant par @{domain} peuvent se connecter. Utilisez votre e-mail professionnel.",
    },
    "auth.locked": {
        "en": "This account is locked until {until}. Try again then, or ask the administrator to unlock it.",
        "fr": "Ce compte est verrouillé jusqu'au {until}. Réessayez ensuite ou demandez à l'administrateur de le déverrouiller.",
    },
    "auth.disabled": {
        "en": "This account is disabled. Contact the administrator.",
        "fr": "Ce compte est désactivé. Contactez l'administrateur.",
    },
    "auth.temp_password_expired": {
        "en": "This temporary password has expired. Ask the administrator for a new one.",
        "fr": "Ce mot de passe temporaire a expiré. Demandez-en un nouveau à l'administrateur.",
    },
    "auth.rate_limited": {
        "en": "Too many sign-in attempts from this network address. Try again in {minutes} minutes.",
        "fr": "Trop de tentatives de connexion depuis cette adresse réseau. Réessayez dans {minutes} minutes.",
    },
    "auth.csrf_failed": {
        "en": "Your session could not be verified. Reload the page and try again.",
        "fr": "Votre session n'a pas pu être vérifiée. Rechargez la page et réessayez.",
    },
    # --- passwords ---
    "auth.password_change_required": {
        "en": "Choose a new password to continue.",
        "fr": "Choisissez un nouveau mot de passe pour continuer.",
    },
    "auth.wrong_current_password": {
        "en": "The current password is not correct.",
        "fr": "Le mot de passe actuel est incorrect.",
    },
    "auth.weak_password": {
        "en": "This password cannot be used. {reasons}",
        "fr": "Ce mot de passe ne peut pas être utilisé. {reasons}",
    },
    "auth.same_password": {
        "en": "The new password must be different from the current one.",
        "fr": "Le nouveau mot de passe doit être différent de l'actuel.",
    },
    # --- account administration ---
    "accounts.email_invalid": {
        "en": "This email address is not valid.",
        "fr": "Cette adresse e-mail n'est pas valide.",
    },
    "accounts.email_taken": {
        "en": "An account already exists for this email.",
        "fr": "Un compte existe déjà pour cette adresse e-mail.",
    },
    "accounts.subject_required": {
        "en": "Choose an employee, or enter a name and an email.",
        "fr": "Choisissez un employé, ou saisissez un nom et une adresse e-mail.",
    },
    "accounts.employee_unknown": {
        "en": "This employee cannot receive an account: the record does not exist, is archived, or is already linked.",
        "fr": "Cet employé ne peut pas recevoir de compte : la fiche n'existe pas, est archivée ou est déjà liée.",
    },
    "accounts.employee_has_account": {
        "en": "This employee already has an account.",
        "fr": "Cet employé a déjà un compte.",
    },
    "accounts.roles_incompatible": {
        "en": "One account cannot be both HR and System Administrator. Remove one role first.",
        "fr": "Un même compte ne peut pas être à la fois RH et Administrateur système. Retirez d'abord l'un des rôles.",
    },
    "accounts.last_sysadmin": {
        "en": "This is the last active System Administrator. Name another one first.",
        "fr": "Il s'agit du dernier Administrateur système actif. Nommez-en un autre d'abord.",
    },
    "accounts.cannot_change_self": {
        "en": "You cannot do this to your own account. Ask another administrator.",
        "fr": "Vous ne pouvez pas effectuer cette action sur votre propre compte. Demandez à un autre administrateur.",
    },
    "accounts.employee_left": {
        "en": "This person has left the company, so the account cannot be enabled again. If they have come back, HR first creates a new employee record; then create a new account for it.",
        "fr": "Cette personne a quitté l'entreprise : le compte ne peut pas être réactivé. Si elle est revenue, les RH créent d'abord une nouvelle fiche employé ; créez ensuite un nouveau compte pour cette fiche.",
    },
    # --- notifications ---
    "notification.account.password_reset.title": {
        "en": "Your password was reset",
        "fr": "Votre mot de passe a été réinitialisé",
    },
    "notification.account.password_reset.body": {
        "en": "{by} reset your password. If you did not ask for this, tell the administrator.",
        "fr": "{by} a réinitialisé votre mot de passe. Si vous ne l'avez pas demandé, prévenez l'administrateur.",
    },
}
