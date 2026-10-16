from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role, has_role
from apps.audit import selectors as audit_selectors
from apps.audit.api.serializers import AuditEventOut
from apps.core.errors import DomainError, NotFound
from apps.core.ordering import apply_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

from .. import reach, selectors, services
from . import serializers as s

DELEGATION_ORDERINGS = {
    "-start_date": ("-start_date", "-id"),
    "start_date": ("start_date", "id"),
    "end_date": ("end_date", "id"),
    "-end_date": ("-end_date", "-id"),
}
PROFILE_CHANGE_ORDERINGS = {"created_at": ("created_at", "id"), "-created_at": ("-created_at", "-id")}
HISTORY_ORDERINGS = {"-at": ("-at", "-id"), "at": ("at", "id")}

# --- Departments and positions -------------------------------------------------------------


class DepartmentListView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}, "POST": {Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(operation_id="departments_list", responses=s.DepartmentOut(many=True))
    def get(self, request):
        return Response(s.DepartmentOut(selectors.departments(), many=True).data)

    @extend_schema(
        operation_id="departments_create", request=s.DepartmentIn, responses={201: s.DepartmentOut}
    )
    def post(self, request):
        data = s.DepartmentIn(data=request.data)
        data.is_valid(raise_exception=True)
        department = services.create_department(actor=request.user, **data.validated_data)
        row = selectors.departments().get(pk=department.pk)
        return Response(s.DepartmentOut(row).data, status=status.HTTP_201_CREATED)


class DepartmentDetailView(APIView):
    access = {"PATCH": {Role.HR}}
    http_method_names = ["patch"]

    @extend_schema(operation_id="departments_update", request=s.DepartmentPatchIn, responses=s.DepartmentOut)
    def patch(self, request, id):  # noqa: A002  (the path parameter is named `id` in the contract)
        department = selectors.get_department(id)
        data = s.DepartmentPatchIn(department, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        fields = dict(data.validated_data)
        is_active = fields.pop("is_active", None)
        if fields:
            services.update_department(actor=request.user, department=department, **fields)
        if is_active is not None:
            services.set_department_active(actor=request.user, department=department, is_active=is_active)
        return Response(s.DepartmentOut(selectors.departments().get(pk=department.pk)).data)


class PositionListView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}, "POST": {Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(operation_id="positions_list", responses=s.PositionOut(many=True))
    def get(self, request):
        return Response(s.PositionOut(selectors.positions(), many=True).data)

    @extend_schema(operation_id="positions_create", request=s.PositionIn, responses={201: s.PositionOut})
    def post(self, request):
        data = s.PositionIn(data=request.data)
        data.is_valid(raise_exception=True)
        position = services.create_position(actor=request.user, **data.validated_data)
        row = selectors.positions().get(pk=position.pk)
        return Response(s.PositionOut(row).data, status=status.HTTP_201_CREATED)


class PositionDetailView(APIView):
    access = {"PATCH": {Role.HR}}
    http_method_names = ["patch"]

    @extend_schema(operation_id="positions_update", request=s.PositionPatchIn, responses=s.PositionOut)
    def patch(self, request, id):  # noqa: A002
        position = selectors.get_position(id)
        data = s.PositionPatchIn(position, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        fields = dict(data.validated_data)
        is_active = fields.pop("is_active", None)
        if fields:
            services.update_position(actor=request.user, position=position, **fields)
        if is_active is not None:
            services.set_position_active(actor=request.user, position=position, is_active=is_active)
        return Response(s.PositionOut(selectors.positions().get(pk=position.pk)).data)


# --- Employees -----------------------------------------------------------------------------


class EmployeeListView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}, "POST": {Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="employees_list",
        parameters=[s.EmployeeListQuery, *PAGE_PARAMETERS],
        responses=paginated(s.EmployeeListOut),
    )
    def get(self, request):
        query = s.EmployeeListQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        queryset = selectors.employee_list(request.user, **query.validated_data)
        full = has_role(request.user, Role.HR, Role.EXEC)
        return paginate(request, self, queryset, s.EmployeeListOut, context={"full": full})

    @extend_schema(operation_id="employees_create", request=s.EmployeeIn, responses={201: s.EmployeeOut})
    def post(self, request):
        data = s.EmployeeIn(data=request.data)
        data.is_valid(raise_exception=True)
        employee = services.create_employee(actor=request.user, data=data.validated_data)
        return Response(s.EmployeeOut(employee).data, status=status.HTTP_201_CREATED)


class EmployeeDirectoryView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="employees_directory", responses=s.EmployeeBriefOut(many=True))
    def get(self, request):
        return Response(s.EmployeeBriefOut(selectors.directory(), many=True).data)


class EmployeeMeView(APIView):
    access = {"GET": {Role.EMPLOYEE}}
    http_method_names = ["get"]

    @extend_schema(operation_id="employees_me", responses=s.EmployeeOut)
    def get(self, request):
        own = reach.employee_of(request.user)
        if own is None:
            raise NotFound()
        return Response(s.EmployeeOut(selectors.get_employee(own.public_id)).data)


class EmployeeDetailView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR, Role.EXEC}, "PATCH": {Role.HR}}
    http_method_names = ["get", "patch"]

    @extend_schema(operation_id="employees_detail", responses=s.EmployeeDetailOut)
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        return Response(s.employee_detail(request.user, employee))

    @extend_schema(operation_id="employees_update", request=s.EmployeeIn, responses=s.EmployeeOut)
    def patch(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        data = s.EmployeeIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        employee = services.update_employee(actor=request.user, employee=employee, data=data.validated_data)
        return Response(s.EmployeeOut(selectors.get_employee(employee.public_id)).data)


# --- Delegations ---------------------------------------------------------------------------


class DelegationListView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR}, "POST": {Role.MANAGER, Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="delegations_list",
        parameters=[
            s.DelegationListQuery,
            ordering_parameter(DELEGATION_ORDERINGS, "-start_date"),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(s.DelegationOut),
    )
    def get(self, request):
        query = s.DelegationListQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        queryset = selectors.delegations_for(
            request.user,
            scope=query.validated_data.get("scope", "mine"),
            manager_public_id=query.validated_data.get("manager"),
        )
        queryset = apply_ordering(request, queryset, DELEGATION_ORDERINGS, "-start_date")
        return paginate(request, self, queryset, s.DelegationOut)

    @extend_schema(
        operation_id="delegations_create", request=s.DelegationIn, responses={201: s.DelegationOut}
    )
    def post(self, request):
        data = s.DelegationIn(data=request.data)
        data.is_valid(raise_exception=True)
        fields = dict(data.validated_data)
        manager = fields.pop("manager", None) or reach.employee_of(request.user)
        if manager is None:
            raise DomainError("organisation.delegation_not_manager", field="manager")
        delegation = services.create_delegation(actor=request.user, manager=manager, **fields)
        body = s.DelegationOut(delegation, context={"request": request}).data
        return Response(body, status=status.HTTP_201_CREATED)


class DelegationEndView(APIView):
    access = {"POST": {Role.MANAGER, Role.HR}}
    http_method_names = ["post"]

    @extend_schema(operation_id="delegations_end", request=None, responses=s.DelegationOut)
    def post(self, request, public_id):
        delegation = selectors.get_delegation_for(request.user, public_id)
        delegation = services.end_delegation(actor=request.user, delegation=delegation)
        return Response(s.DelegationOut(delegation, context={"request": request}).data)


# --- Departures ----------------------------------------------------------------------------


class EmployeeArchivePreviewView(APIView):
    access = {"GET": {Role.HR}}
    http_method_names = ["get"]

    @extend_schema(operation_id="employees_archive_preview", responses=s.ArchivePreviewOut)
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        return Response(s.ArchivePreviewOut(services.archive_preview(employee=employee)).data)


class EmployeeArchiveView(APIView):
    access = {"POST": {Role.HR}}
    http_method_names = ["post"]

    @extend_schema(operation_id="employees_archive", request=s.ArchiveIn, responses=s.EmployeeOut)
    def post(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        data = s.ArchiveIn(data=request.data)
        data.is_valid(raise_exception=True)
        employee = services.archive_employee(actor=request.user, employee=employee, **data.validated_data)
        return Response(s.EmployeeOut(employee).data)


# --- Documents -----------------------------------------------------------------------------


class EmployeeDocumentsView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR, Role.EXEC}, "POST": {Role.HR}}
    http_method_names = ["get", "post"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(operation_id="employee_documents_list", responses=s.DocumentOut(many=True))
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        documents = selectors.documents_for(request.user, employee)
        return Response(s.DocumentOut(documents, many=True).data)

    @extend_schema(
        operation_id="employee_documents_add",
        request={"multipart/form-data": s.DocumentIn},
        responses={201: s.DocumentOut},
    )
    def post(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        data = s.DocumentIn(data=request.data)
        data.is_valid(raise_exception=True)
        document = services.add_document(
            actor=request.user,
            employee=employee,
            upload=data.validated_data["file"],
            label=data.validated_data["label"],
            visible_to_employee=data.validated_data["visible_to_employee"],
        )
        return Response(s.DocumentOut(document).data, status=status.HTTP_201_CREATED)


class EmployeeDocumentView(APIView):
    access = {"PATCH": {Role.HR}}
    http_method_names = ["patch"]

    @extend_schema(
        operation_id="employee_documents_update", request=s.DocumentPatchIn, responses=s.DocumentOut
    )
    def patch(self, request, public_id, id):  # noqa: A002
        employee = selectors.get_employee_for(request.user, public_id)
        document = selectors.get_document(employee, id)
        data = s.DocumentPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        document = services.set_document_visibility(
            actor=request.user, document=document, **data.validated_data
        )
        return Response(s.DocumentOut(document).data)


# --- Profile-change proposals --------------------------------------------------------------


class ProfileChangeListView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR}, "POST": {Role.EMPLOYEE}}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="profile_changes_list",
        parameters=[s.ProfileChangeListQuery, ordering_parameter(PROFILE_CHANGE_ORDERINGS), *PAGE_PARAMETERS],
        responses=paginated(s.ProfileChangeOut),
    )
    def get(self, request):
        query = s.ProfileChangeListQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        queryset = selectors.profile_changes_for(
            request.user,
            scope=query.validated_data.get("scope"),
            status=query.validated_data.get("status"),
            employee_public_id=query.validated_data.get("employee"),
        )
        # No default: a queue is read oldest first and a history newest first, as the selector orders them.
        queryset = apply_ordering(request, queryset, PROFILE_CHANGE_ORDERINGS)
        return paginate(request, self, queryset, s.ProfileChangeOut)

    @extend_schema(
        operation_id="profile_changes_create",
        request=s.ProfileChangeIn,
        responses={201: s.ProfileChangeOut},
    )
    def post(self, request):
        # The serializer would silently drop fields it does not know, so ask the rule first.
        proposed = request.data.get("changes") if isinstance(request.data, dict) else None
        if isinstance(proposed, dict):
            services.ensure_proposable(proposed)
        data = s.ProfileChangeIn(data=request.data)
        data.is_valid(raise_exception=True)
        change = services.propose_profile_change(
            user=request.user,
            changes=data.validated_data["changes"],
            note=data.validated_data.get("note", ""),
        )
        return Response(s.ProfileChangeOut(change).data, status=status.HTTP_201_CREATED)


class ProfileChangeDetailView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR}}
    http_method_names = ["get"]

    @extend_schema(operation_id="profile_changes_detail", responses=s.ProfileChangeOut)
    def get(self, request, public_id):
        return Response(s.ProfileChangeOut(selectors.get_profile_change_for(request.user, public_id)).data)


class ProfileChangeDecideView(APIView):
    access = {"POST": {Role.HR}}
    http_method_names = ["post"]

    @extend_schema(
        operation_id="profile_changes_decide",
        request=s.ProfileChangeDecisionIn,
        responses=s.ProfileChangeOut,
    )
    def post(self, request, public_id):
        change = selectors.get_profile_change_for(request.user, public_id)
        data = s.ProfileChangeDecisionIn(data=request.data)
        data.is_valid(raise_exception=True)
        change = services.decide_profile_change(actor=request.user, change=change, **data.validated_data)
        return Response(s.ProfileChangeOut(change).data)


class ProfileChangeWithdrawView(APIView):
    access = {"POST": {Role.EMPLOYEE}}
    http_method_names = ["post"]

    @extend_schema(operation_id="profile_changes_withdraw", request=None, responses=s.ProfileChangeOut)
    def post(self, request, public_id):
        change = selectors.get_profile_change_for(request.user, public_id, own_only=True)
        change = services.withdraw_profile_change(user=request.user, change=change)
        return Response(s.ProfileChangeOut(change).data)


# --- History -------------------------------------------------------------------------------


class EmployeeHistoryView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="employees_history",
        parameters=[ordering_parameter(HISTORY_ORDERINGS, "-at"), *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        events = audit_selectors.events_for_object("employee", str(employee.public_id))
        events = apply_ordering(request, events, HISTORY_ORDERINGS, "-at")
        return paginate(request, self, events, AuditEventOut)
