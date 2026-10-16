from __future__ import annotations

from django.db import transaction

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.files import services as files_services
from apps.files.models import AttachmentKind

from .. import reach
from ..models import Employee, EmployeeDocument
from ..selectors import full_name


@transaction.atomic
def add_document(
    *, actor, employee: Employee, upload, label: str, visible_to_employee: bool
) -> EmployeeDocument:
    attachment = files_services.store_upload(
        actor=actor, upload=upload, kind=AttachmentKind.EMPLOYEE_DOCUMENT
    )
    document = EmployeeDocument.objects.create(
        employee=employee,
        attachment=attachment,
        label=label.strip(),
        visible_to_employee=visible_to_employee,
        added_by=actor,
    )
    audit.record(
        action="document.added",
        obj=employee,
        actor=actor,
        object_label=full_name(employee),
        changes={
            "document": {"before": None, "after": document.label},
            "visible_to_employee": {"before": None, "after": visible_to_employee},
        },
    )
    return document


@transaction.atomic
def set_document_visibility(
    *, actor, document: EmployeeDocument, visible_to_employee: bool
) -> EmployeeDocument:
    if document.visible_to_employee == visible_to_employee:
        return document
    document.visible_to_employee = visible_to_employee
    document.save(update_fields=["visible_to_employee"])
    audit.record(
        action="document.visibility_changed",
        obj=document.employee,
        actor=actor,
        object_label=full_name(document.employee),
        changes={
            "document": {"before": document.label, "after": document.label},
            "visible_to_employee": {"before": not visible_to_employee, "after": visible_to_employee},
        },
    )
    return document


def may_download(user, attachment) -> bool:
    """The access rule for attachments of kind `employee_document` (PRD 7: own if shared, HR, executives)."""
    document = EmployeeDocument.objects.filter(attachment=attachment).first()
    if document is None:
        return False
    if has_role(user, Role.HR, Role.EXEC):
        return True
    own = reach.employee_of(user)
    return own is not None and own.id == document.employee_id and document.visible_to_employee
