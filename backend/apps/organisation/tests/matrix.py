from apps.organisation.tests.world import make_document, make_profile_change
from tests.matrix import Case, P, only

_MANAGERS = (P.MANAGER, P.OTHER_MANAGER)
_EMPLOYEES = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)
_NOT_THE_OWNER = (P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC)


CASES = [
    # Departments and positions
    Case(route="organisation:department-list", method="GET", expect=only(P.HR, P.EXEC)),
    Case(route="organisation:department-list", method="POST", expect=only(P.HR)),
    Case(
        route="organisation:department-detail",
        method="PATCH",
        expect=only(P.HR),
        kwargs=lambda w: {"id": w.dept_a.id},
    ),
    Case(route="organisation:position-list", method="GET", expect=only(P.HR, P.EXEC)),
    Case(route="organisation:position-list", method="POST", expect=only(P.HR)),
    Case(
        route="organisation:position-detail",
        method="PATCH",
        expect=only(P.HR),
        kwargs=lambda w: {"id": w.position.id},
    ),
    # Employees. The executive of the cast has direct reports, so holds MANAGER too.
    Case(route="organisation:employee-list", method="GET", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:employee-list", method="POST", expect=only(P.HR)),
    Case(route="organisation:employee-directory", method="GET", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:employee-me", method="GET", expect=only(*_EMPLOYEES)),
    Case(
        route="organisation:employee-detail",
        method="GET",
        label="the owner's record",
        expect=only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER)),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    Case(
        route="organisation:employee-detail",
        method="PATCH",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    # Departures. The POST body is empty on purpose: HR gets a validation error, nobody is archived.
    Case(
        route="organisation:employee-archive-preview",
        method="GET",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    Case(
        route="organisation:employee-archive",
        method="POST",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    # Documents. Managers pass the role gate as employees, then find nothing: 404, not 403.
    Case(
        route="organisation:employee-documents",
        method="GET",
        label="the owner's documents",
        expect=only(P.OWNER, P.HR, P.EXEC, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER)),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    Case(
        route="organisation:employee-documents",
        method="POST",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
    Case(
        route="organisation:employee-document",
        method="PATCH",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": w.owner.public_id, "id": make_document(w).id},
    ),
    Case(
        route="files:download",
        method="GET",
        label="a document shared with its owner",
        expect=only(P.OWNER, P.HR, P.EXEC, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": make_document(w, visible=True).attachment.public_id},
    ),
    Case(
        route="files:download",
        method="GET",
        label="a document HR keeps to itself",
        expect=only(P.HR, P.EXEC, hide=(P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": make_document(w, visible=False).attachment.public_id},
    ),
    # Profile-change proposals
    Case(route="organisation:profile-change-list", method="GET", expect=only(*_EMPLOYEES)),
    Case(route="organisation:profile-change-list", method="POST", expect=only(*_EMPLOYEES)),
    Case(
        route="organisation:profile-change-detail",
        method="GET",
        label="the owner's proposal",
        expect=only(P.OWNER, P.HR, hide=_NOT_THE_OWNER),
        kwargs=lambda w: {"public_id": make_profile_change(w).public_id},
    ),
    Case(
        route="organisation:profile-change-decide",
        method="POST",
        expect=only(P.HR),
        kwargs=lambda w: {"public_id": make_profile_change(w).public_id},
    ),
    Case(
        route="organisation:profile-change-withdraw",
        method="POST",
        label="the owner's proposal",
        expect=only(P.OWNER, hide=(*_NOT_THE_OWNER, P.HR)),
        kwargs=lambda w: {"public_id": make_profile_change(w).public_id},
    ),
    # History
    Case(
        route="organisation:employee-history",
        method="GET",
        expect=only(P.HR, P.EXEC),
        kwargs=lambda w: {"public_id": w.owner.public_id},
    ),
]
