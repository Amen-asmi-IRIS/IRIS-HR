from apps.accounts.models import User
from apps.accounts.roles import WORKSPACES
from apps.core.errors import DomainError
from apps.core.i18n import LANGUAGES


def update_preferences(*, user: User, language: str | None = None, last_workspace: str | None = None) -> User:
    """The user's own choices (ACC-11, UI 3.2). Not audited: they change nothing anyone else sees."""
    changed = []
    if language is not None:
        if language not in LANGUAGES:
            raise DomainError(field="language")
        user.language = language
        changed.append("language")
    if last_workspace is not None:
        if last_workspace not in {workspace for workspace, _ in WORKSPACES}:
            raise DomainError(field="last_workspace")
        user.last_workspace = last_workspace
        changed.append("last_workspace")
    if changed:
        user.save(update_fields=changed)
    return user
