import uuid
from dataclasses import replace
from datetime import date

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.core.ordering import apply_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, DefaultPagination, paginated
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from .. import selectors, services
from ..models import ApproverRule
from ..representation import (
    amendment_bodies,
    attachment_bodies,
    attachment_body,
    preview_body,
    reads_private,
    represent,
    represent_context,
    represent_detail,
    viewer_for,
)
from ..services import RequestData
from ..services.attachments import require_attacher
from ..services.common import require_editor, require_hr_for_other, require_requester
from .serializers import (
    AmendmentIn,
    ApprovalItemOut,
    ChainRowOut,
    ChainStepOut,
    ChainStepsIn,
    CorrectIn,
    DecideIn,
    ExceptionalEventIn,
    ExceptionalEventOut,
    FileIn,
    HistoryItemOut,
    PreviewIn,
    PreviewOut,
    ReasonIn,
    ReassignIn,
    ReclassifyIn,
    RecordOnBehalfIn,
    RequestAmendmentOut,
    RequestAttachmentOut,
    RequestDetailOut,
    RequestIn,
    RequestOut,
    RequestPatchIn,
    RequestTypeIn,
    RequestTypeOut,
    VersionIn,
)

STAFF = {Role.EMPLOYEE, Role.HR, Role.EXEC}
HR_ONLY = {Role.HR}
HR_AND_EXEC = {Role.HR, Role.EXEC}
AUTHORS = {Role.EMPLOYEE, Role.HR}
ORDERINGS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "-id"),
    "start_date": ("start_date", "id"),
    "-start_date": ("-start_date", "-id"),
}


def _sees_everything(request) -> bool:
    """HR and executives see inactive configuration unless they ask for the active part only."""
    return has_role(request.user, Role.HR, Role.EXEC) and request.query_params.get("active") != "1"


# ---------------------------------------------------------------- configuration


class TypeListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": HR_ONLY}

    @extend_schema(
        operation_id="request_types_list",
        parameters=[OpenApiParameter("active", str, required=False)],
        responses=RequestTypeOut(many=True),
    )
    def get(self, request):
        types = selectors.request_types(active_only=not _sees_everything(request))
        return Response(RequestTypeOut(types, many=True).data)

    @extend_schema(
        operation_id="request_types_create", request=RequestTypeIn, responses={201: RequestTypeOut}
    )
    def post(self, request):
        data = RequestTypeIn(data=request.data)
        data.is_valid(raise_exception=True)
        request_type = services.create_request_type(actor=request.user, data=data.validated_data)
        return Response(RequestTypeOut(request_type).data, status=201)


class TypeDetailView(APIView):
    http_method_names = ["get", "patch"]
    access = {"GET": HR_AND_EXEC, "PATCH": HR_ONLY}

    @extend_schema(operation_id="request_types_detail", responses=RequestTypeOut)
    def get(self, request, pk: int):
        return Response(RequestTypeOut(selectors.get_type(pk)).data)

    @extend_schema(operation_id="request_types_update", request=RequestTypeIn, responses=RequestTypeOut)
    def patch(self, request, pk: int):
        request_type = selectors.get_type(pk)
        data = RequestTypeIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        request_type = services.update_request_type(
            actor=request.user, request_type=request_type, data=data.validated_data
        )
        return Response(RequestTypeOut(request_type).data)


class TypeStepsView(APIView):
    http_method_names = ["get", "put"]
    access = {"GET": HR_AND_EXEC, "PUT": HR_ONLY}

    @extend_schema(operation_id="request_types_steps", responses=ChainStepOut(many=True))
    def get(self, request, pk: int):
        request_type = selectors.get_type(pk)
        steps = request_type.chain_steps.select_related("named_person").order_by("position")
        return Response(ChainStepOut(steps, many=True).data)

    @extend_schema(
        operation_id="request_types_steps_replace", request=ChainStepsIn, responses=ChainStepOut(many=True)
    )
    def put(self, request, pk: int):
        request_type = selectors.get_type(pk)
        data = ChainStepsIn(data=request.data)
        data.is_valid(raise_exception=True)
        specs = []
        for item in data.validated_data["steps"]:
            person = None
            if item["approver_rule"] == ApproverRule.NAMED_PERSON and item["named_person"] is not None:
                try:
                    person = organisation_selectors.get_employee_for(request.user, str(item["named_person"]))
                except NotFound:
                    raise DomainError("request.named_person_required", field="steps") from None
            specs.append(
                services.StepSpec(
                    approver_rule=item["approver_rule"],
                    mode=item["mode"],
                    named_person=person,
                    reminder_after_days=item["reminder_after_days"],
                    flag_after_days=item["flag_after_days"],
                )
            )
        services.replace_steps(actor=request.user, request_type=request_type, steps=specs)
        steps = request_type.chain_steps.select_related("named_person").order_by("position")
        return Response(ChainStepOut(steps, many=True).data)


class EventListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": HR_ONLY}

    @extend_schema(
        operation_id="exceptional_events_list",
        parameters=[OpenApiParameter("active", str, required=False)],
        responses=ExceptionalEventOut(many=True),
    )
    def get(self, request):
        events = selectors.events(active_only=not _sees_everything(request))
        return Response(ExceptionalEventOut(events, many=True).data)

    @extend_schema(
        operation_id="exceptional_events_create",
        request=ExceptionalEventIn,
        responses={201: ExceptionalEventOut},
    )
    def post(self, request):
        data = ExceptionalEventIn(data=request.data)
        data.is_valid(raise_exception=True)
        event = services.create_event(actor=request.user, **data.validated_data)
        return Response(ExceptionalEventOut(event).data, status=201)


class EventDetailView(APIView):
    http_method_names = ["patch"]
    access = {"PATCH": HR_ONLY}

    @extend_schema(
        operation_id="exceptional_events_update", request=ExceptionalEventIn, responses=ExceptionalEventOut
    )
    def patch(self, request, pk: int):
        event = selectors.get_event(pk)
        data = ExceptionalEventIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        event = services.update_event(actor=request.user, event=event, **data.validated_data)
        return Response(ExceptionalEventOut(event).data)


class TypeChainPreviewView(APIView):
    http_method_names = ["get"]
    access = {"GET": HR_ONLY}

    @extend_schema(
        operation_id="request_types_chain_preview",
        parameters=[OpenApiParameter("employee", str, required=True)],
        responses=ChainRowOut(many=True),
    )
    def get(self, request, pk: int):
        request_type = selectors.get_type(pk)
        public_id = request.query_params.get("employee")
        if not public_id:
            raise NotFound("core.not_found")
        employee = organisation_selectors.get_employee_for(request.user, public_id)
        rows = services.chain_preview(request_type=request_type, employee=employee)
        return Response(ChainRowOut(rows, many=True).data)


# ---------------------------------------------------------------- requests: helpers


def _csv(value: str | None) -> list[str] | None:
    return [part.strip() for part in value.split(",") if part.strip()] if value else None


def _flag(value: str | None) -> bool | None:
    if value in (None, ""):
        return None
    if value in ("1", "true"):
        return True
    if value in ("0", "false"):
        return False
    raise ValueError(value)


def _year(value: str | None) -> int | None:
    if not value:
        return None
    year = int(value)
    if not date.min.year <= year <= date.max.year:
        raise ValueError(value)
    return year


def _list_filters(params) -> dict:
    """Read the filters of a list. A value that cannot be read is one problem, whatever the filter."""
    try:
        employee = params.get("employee") or None
        if employee:
            uuid.UUID(employee)
        return {
            "statuses": _csv(params.get("status")),
            "type_codes": _csv(params.get("type")),
            "employee_public_id": employee,
            "department_id": int(params["department"]) if params.get("department") else None,
            "year": _year(params.get("year")),
            "date_from": date.fromisoformat(params["from"]) if params.get("from") else None,
            "date_to": date.fromisoformat(params["to"]) if params.get("to") else None,
            "on_behalf": _flag(params.get("on_behalf")),
            "has_override": _flag(params.get("has_override")),
        }
    except ValueError:
        raise DomainError("request.filter_invalid") from None


def _data_from(values: dict, *, comment: str = "") -> RequestData:
    return RequestData(
        start_date=values["start_date"],
        end_date=values["end_date"],
        starts_at_midday=values["starts_at_midday"],
        ends_at_midday=values["ends_at_midday"],
        start_time=values["start_time"],
        end_time=values["end_time"],
        exceptional_event_id=values["exceptional_event"],
        comment=comment,
    )


def _target_employee(user, public_id):
    """The employee a request is for: the one named (reach decides who may name whom), else the caller."""
    if public_id:
        return organisation_selectors.get_employee_for(user, str(public_id))
    employee = reach.employee_of(user)
    if employee is None:
        raise NotAllowed("request.actor_without_record")
    return employee


def _detail(user, public_id, status: int = 200) -> Response:
    """The current detail of a request, read again after any change so that it is never stale."""
    found = selectors.get_request_for(user, str(public_id))
    return Response(RequestDetailOut(represent_detail(found, viewer_for(user))).data, status=status)


LIST_PARAMETERS = [
    OpenApiParameter("scope", str, enum=["mine", "team", "all", "decided"]),
    OpenApiParameter("status", str, description="Comma-separated statuses"),
    OpenApiParameter("type", str, description="Comma-separated type codes"),
    OpenApiParameter("employee", str, description="Employee public id"),
    OpenApiParameter("department", int),
    OpenApiParameter("year", int),
    OpenApiParameter("from", str, description="ISO date"),
    OpenApiParameter("to", str, description="ISO date"),
    OpenApiParameter("on_behalf", str, enum=["1", "0"]),
    OpenApiParameter("has_override", str, enum=["1", "0"]),
    OpenApiParameter("ordering", str, enum=sorted(ORDERINGS)),
    *PAGE_PARAMETERS,
]


# ---------------------------------------------------------------- requests: read


class RequestListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": AUTHORS}

    @extend_schema(operation_id="requests_list", parameters=LIST_PARAMETERS, responses=paginated(RequestOut))
    def get(self, request):
        params = request.query_params
        found = selectors.requests_for(request.user, params.get("scope") or "mine")
        found = selectors.filter_requests(found, viewer=request.user, **_list_filters(params))
        found = found.order_by(*ORDERINGS.get(params.get("ordering") or "", ORDERINGS["-created_at"]))
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(found, request, view=self)
        viewer = viewer_for(request.user)
        return paginator.get_paginated_response(
            RequestOut([represent(item, viewer) for item in page], many=True).data
        )

    @extend_schema(operation_id="requests_create", request=RequestIn, responses={201: RequestDetailOut})
    def post(self, request):
        data = RequestIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        created = services.create_draft(
            actor=request.user,
            employee=_target_employee(request.user, values["employee"]),
            request_type=selectors.get_type_by_code(values["type"]),
            data=_data_from(values, comment=values["comment"]),
            override_reason=values["override_reason"],
        )
        return _detail(request.user, created.public_id, status=201)


class RequestPreviewView(APIView):
    http_method_names = ["post"]
    access = {"POST": AUTHORS}

    @extend_schema(operation_id="requests_preview", request=PreviewIn, responses=PreviewOut)
    def post(self, request):
        data = PreviewIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        request_type = selectors.get_type_by_code(values["type"])
        employee = _target_employee(request.user, values["employee"])
        ignoring = None
        if values["request"]:
            ignoring = selectors.get_request_for(request.user, str(values["request"])).pk
        result = services.preview(
            actor=request.user,
            employee=employee,
            request_type=request_type,
            data=_data_from(values),
            override=values["override"],
            ignoring_request_id=ignoring,
        )
        return Response(PreviewOut(preview_body(result)).data)


class RequestDetailView(APIView):
    http_method_names = ["get", "patch", "delete"]
    access = {"GET": STAFF, "PATCH": AUTHORS, "DELETE": AUTHORS}

    @extend_schema(operation_id="requests_detail", responses=RequestDetailOut)
    def get(self, request, public_id):
        return _detail(request.user, public_id)

    @extend_schema(operation_id="requests_update", request=RequestPatchIn, responses=RequestDetailOut)
    def patch(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_editor(request.user, found)
        data = RequestPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        version = values.pop("version")
        if "exceptional_event" in values:
            values["exceptional_event_id"] = values.pop("exceptional_event")
        merged = replace(services.data_of(found), **values)
        services.update_request(actor=request.user, request=found, data=merged, expected_version=version)
        return _detail(request.user, public_id)

    @extend_schema(operation_id="requests_discard", request=None, responses={204: None})
    def delete(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        services.discard_draft(actor=request.user, request=found)
        return Response(status=204)


class RequestHistoryView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(operation_id="requests_history", responses=HistoryItemOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        private = reads_private(found, viewer_for(request.user))
        return Response(HistoryItemOut(selectors.history(found, private=private), many=True).data)


# ---------------------------------------------------------------- requests: write


class RequestSubmitView(APIView):
    http_method_names = ["post"]
    access = {"POST": AUTHORS}

    @extend_schema(operation_id="requests_submit", request=VersionIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_editor(request.user, found)
        data = VersionIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.submit(actor=request.user, request=found, expected_version=data.validated_data["version"])
        return _detail(request.user, public_id)


class RequestWithdrawView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="requests_withdraw", request=None, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        services.withdraw(actor=request.user, request=found)
        return _detail(request.user, public_id)


class RequestAttachmentsView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": AUTHORS}

    @extend_schema(operation_id="requests_attachments", responses=RequestAttachmentOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        items = attachment_bodies(found, viewer_for(request.user))
        return Response(RequestAttachmentOut(items, many=True).data)

    @extend_schema(
        operation_id="requests_attach",
        request={"multipart/form-data": FileIn},
        responses={201: RequestAttachmentOut},
    )
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_attacher(request.user, found)
        data = FileIn(data=request.data)
        data.is_valid(raise_exception=True)
        link = services.attach_file(actor=request.user, request=found, upload=data.validated_data["file"])
        return Response(RequestAttachmentOut(attachment_body(link)).data, status=201)


class RequestAmendmentsView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="requests_amendments", responses=RequestAmendmentOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        items = amendment_bodies(found, viewer_for(request.user))
        return Response(RequestAmendmentOut(items, many=True).data)

    @extend_schema(operation_id="requests_amend", request=AmendmentIn, responses={201: RequestDetailOut})
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_requester(request.user, found)
        data = AmendmentIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        new = None
        if values["start_date"] is not None and values["end_date"] is not None:
            new = RequestData(
                start_date=values["start_date"],
                end_date=values["end_date"],
                starts_at_midday=values["starts_at_midday"],
                ends_at_midday=values["ends_at_midday"],
                start_time=values["start_time"],
                end_time=values["end_time"],
            )
        services.open_amendment(
            actor=request.user, request=found, kind=values["kind"], data=new, reason=values["reason"]
        )
        return _detail(request.user, public_id, status=201)


class AmendmentWithdrawView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="amendments_withdraw", request=None, responses=RequestDetailOut)
    def post(self, request, public_id):
        amendment = selectors.get_amendment_for(request.user, str(public_id))
        services.withdraw_amendment(actor=request.user, amendment=amendment)
        return _detail(request.user, amendment.request.public_id)


class RequestCorrectView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_correct", request=CorrectIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_hr_for_other(request.user, found)
        data = CorrectIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        new = RequestData(
            start_date=values["start_date"],
            end_date=values["end_date"],
            starts_at_midday=values["starts_at_midday"],
            ends_at_midday=values["ends_at_midday"],
            start_time=values["start_time"],
            end_time=values["end_time"],
        )
        services.hr_correct(actor=request.user, request=found, data=new, reason=values["reason"])
        return _detail(request.user, public_id)


class RequestCancelView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_cancel", request=ReasonIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_hr_for_other(request.user, found)
        data = ReasonIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.hr_cancel(actor=request.user, request=found, reason=data.validated_data["reason"])
        return _detail(request.user, public_id)


class RequestReclassifyView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_reclassify", request=ReclassifyIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_hr_for_other(request.user, found)
        data = ReclassifyIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.reclassify_as_annual(
            actor=request.user, request=found, override_reason=data.validated_data["override_reason"]
        )
        return _detail(request.user, public_id)


# ---------------------------------------------------------------- approvals and steps


def _named_employee(user, public_id, field: str):
    """An employee chosen in a form. An unknown one is a problem of that field, not a missing page."""
    try:
        return organisation_selectors.get_employee_for(user, str(public_id))
    except NotFound:
        raise DomainError("core.not_found", field=field) from None


APPROVAL_ORDERINGS = {
    "waiting_since": ("activated_at", "id"),
    "-waiting_since": ("-activated_at", "-id"),
    "start_date": ("request__start_date", "id"),
    "-start_date": ("-request__start_date", "-id"),
}


class ApprovalListView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(
        operation_id="approvals_list",
        parameters=[
            OpenApiParameter("queue", str, enum=["mine", "hr", "certificates", "stuck"]),
            OpenApiParameter("type", str, description="Comma-separated type codes"),
            OpenApiParameter("department", int),
            ordering_parameter(APPROVAL_ORDERINGS),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(ApprovalItemOut),
    )
    def get(self, request):
        params = request.query_params
        waiting = selectors.queue(request.user, params.get("queue") or "mine")
        codes = _csv(params.get("type"))
        if codes:
            waiting = waiting.filter(request__request_type__code__in=codes)
        if params.get("department"):
            try:
                department = int(params["department"])
            except ValueError:
                raise DomainError("request.filter_invalid") from None
            members = organisation_selectors.employees_for(request.user, include_archived=True).filter(
                department_id=department
            )
            waiting = waiting.filter(request__employee_id__in=list(members.values_list("pk", flat=True)))
        waiting = apply_ordering(request, waiting, APPROVAL_ORDERINGS)  # no default: a queue is oldest first
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(waiting, request, view=self)
        viewer = viewer_for(request.user)
        found = {
            item.pk: item for item in selectors.base_requests().filter(pk__in=[s.request_id for s in page])
        }
        items = [
            {
                "step_id": step.pk,
                "request": represent(found[step.request_id], viewer),
                "waiting_since": step.activated_at,
                "decision_context": represent_context(found[step.request_id], viewer),
            }
            for step in page
        ]
        return paginator.get_paginated_response(ApprovalItemOut(items, many=True).data)


class StepDecideView(APIView):
    http_method_names = ["post"]
    access = {"POST": STAFF}

    @extend_schema(operation_id="steps_decide", request=DecideIn, responses=RequestDetailOut)
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        # A step is "not available" to anyone it is not for, including the requester (master D14).
        if not services.is_eligible_approver(request.user, step):
            raise NotFound("core.not_found")
        data = DecideIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.decide_step(
            actor=request.user,
            step=step,
            decision=values["decision"],
            comment=values["comment"],
            expected_version=values["version"],
        )
        return _detail(request.user, step.request.public_id)


class StepRecordOnBehalfView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(
        operation_id="steps_record_on_behalf",
        request={"multipart/form-data": RecordOnBehalfIn, "application/json": RecordOnBehalfIn},
        responses=RequestDetailOut,
    )
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        require_hr_for_other(request.user, step.request)
        data = RecordOnBehalfIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.record_on_behalf(
            actor=request.user,
            step=step,
            decided_by=_named_employee(request.user, values["decided_by"], "decided_by"),
            decision=values["decision"],
            decided_at=values["decided_at"],
            channel=values["channel"],
            note=values["note"],
            scan=values["scan"],
            expected_version=values["version"],
        )
        return _detail(request.user, step.request.public_id)


class StepReassignView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="steps_reassign", request=ReassignIn, responses=RequestDetailOut)
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        require_hr_for_other(request.user, step.request)
        data = ReassignIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.reassign_step(
            actor=request.user,
            step=step,
            new_approver=_named_employee(request.user, values["new_approver"], "new_approver"),
            reason=values["reason"],
        )
        return _detail(request.user, step.request.public_id)
