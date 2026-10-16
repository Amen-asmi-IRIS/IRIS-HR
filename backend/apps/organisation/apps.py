from django.apps import AppConfig


class OrganisationConfig(AppConfig):
    name = "apps.organisation"
    label = "organisation"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.accounts.ports import set_employee_directory
        from apps.accounts.roles import register_derived_role_provider
        from apps.core.i18n import register_messages
        from apps.files import services as files_services
        from apps.notifications import services as notifications

        from . import reach
        from .directory import OrganisationDirectory
        from .messages import MESSAGES
        from .services.documents import may_download

        register_messages(MESSAGES)
        register_derived_role_provider(reach.derived_roles)
        set_employee_directory(OrganisationDirectory())
        files_services.register_access_rule("employee_document", may_download)
        # The page is chosen for each reader when the event is announced (see services.delegations).
        notifications.register_event("delegation.started", link="{page}")
        notifications.register_event("delegation.ended", link="{page}")
        notifications.register_event("profile_change.proposed", link="/hr/profile-changes")
        notifications.register_event("profile_change.accepted", link="/me/profile")
        notifications.register_event("profile_change.rejected", link="/me/profile")
