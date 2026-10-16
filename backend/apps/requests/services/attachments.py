"""Files on a request (REQ-16): the certificate of a sick leave, the proof of an event, a scanned form."""

from __future__ import annotations

from django.db import transaction

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import Conflict, NotAllowed
from apps.files import services as files_service
from apps.organisation import reach

from ..models import RequestAttachment, RequestStatus
from .common import is_requester, label, locked

MEDICAL = "medical"
PROOF = "proof"
SCANNED_FORM = "scanned_form"
ATTACHABLE = (RequestStatus.DRAFT, RequestStatus.PENDING, RequestStatus.RETURNED, RequestStatus.APPROVED)


def require_attacher(actor, request) -> None:
    if is_requester(actor, request) or has_role(actor, Role.HR):
        return
    raise NotAllowed("core.not_allowed")


@transaction.atomic
def attach_file(*, actor, request, upload) -> RequestAttachment:
    """Add a certificate or a proof. On a sensitive request the file is medical: encrypted, owner and HR only."""
    request = locked(request)
    require_attacher(actor, request)
    if request.status not in ATTACHABLE:
        raise Conflict("request.not_editable")
    kind = MEDICAL if request.sensitive else PROOF
    attachment = files_service.store_upload(actor=actor, upload=upload, kind=kind)
    link = RequestAttachment.objects.create(request=request, attachment=attachment, added_by=actor)
    audit.record(
        action="request.attachment_added",
        obj=request,
        object_label=label(request),
        changes={"kind": {"before": None, "after": kind}},
        actor=actor,
    )
    return link


def may_read_attachment(user, attachment) -> bool:
    """The access rule for files linked to a request (permission matrix, rows on attachments)."""
    link = RequestAttachment.objects.select_related("request").filter(attachment=attachment).first()
    if link is None:
        return False
    request = link.request
    if request.status == RequestStatus.DRAFT:
        return request.created_by_id == user.pk
    if is_requester(user, request) or has_role(user, Role.HR):
        return True
    # Everything on a sensitive request is as restricted as the certificate itself.
    if request.sensitive or attachment.kind == MEDICAL:
        return False
    if has_role(user, Role.EXEC):
        return True
    return request.employee_id in reach.team_ids(user)


def register_access_rules() -> None:
    for kind in (MEDICAL, PROOF, SCANNED_FORM):
        files_service.register_access_rule(kind, may_read_attachment)


def visible_attachments(request, user) -> list[RequestAttachment]:
    """The attachment links of a request that this viewer may see, oldest first."""
    links = (
        RequestAttachment.objects.filter(request=request)
        .select_related("attachment", "attachment__uploaded_by")
        .order_by("added_at", "pk")
    )
    return [link for link in links if may_read_attachment(user, link.attachment)]
