from __future__ import annotations

from django.db import transaction

from apps.audit import services as audit

from ..models import Department, Position

_DEPARTMENT_FIELDS = ("code", "name_fr", "name_en", "is_active")
_POSITION_FIELDS = ("code", "title_fr", "title_en", "grade", "is_active")


def _audit_created(action: str, instance, fields, actor) -> None:
    audit.record(
        action=action,
        obj=instance,
        actor=actor,
        object_label=instance.code,
        changes=audit.diff(dict.fromkeys(fields), audit.snapshot(instance, fields)),
    )


def _audit_changed(action: str, instance, fields, before, actor) -> None:
    changes = audit.diff(before, audit.snapshot(instance, fields))
    if changes:
        audit.record(action=action, obj=instance, actor=actor, object_label=instance.code, changes=changes)


@transaction.atomic
def create_department(*, actor, code: str, name_fr: str, name_en: str) -> Department:
    department = Department.objects.create(
        code=code.strip().upper(), name_fr=name_fr.strip(), name_en=name_en.strip()
    )
    _audit_created("department.created", department, _DEPARTMENT_FIELDS, actor)
    return department


@transaction.atomic
def update_department(
    *,
    actor,
    department: Department,
    code: str | None = None,
    name_fr: str | None = None,
    name_en: str | None = None,
) -> Department:
    before = audit.snapshot(department, _DEPARTMENT_FIELDS)
    if code is not None:
        department.code = code.strip().upper()
    if name_fr is not None:
        department.name_fr = name_fr.strip()
    if name_en is not None:
        department.name_en = name_en.strip()
    department.save()
    _audit_changed("department.updated", department, _DEPARTMENT_FIELDS, before, actor)
    return department


@transaction.atomic
def set_department_active(*, actor, department: Department, is_active: bool) -> Department:
    if department.is_active == is_active:
        return department
    before = audit.snapshot(department, _DEPARTMENT_FIELDS)
    department.is_active = is_active
    department.save(update_fields=["is_active"])
    action = "department.activated" if is_active else "department.deactivated"
    _audit_changed(action, department, _DEPARTMENT_FIELDS, before, actor)
    return department


@transaction.atomic
def create_position(*, actor, code: str, title_fr: str, title_en: str, grade: str = "") -> Position:
    position = Position.objects.create(
        code=code.strip().upper(), title_fr=title_fr.strip(), title_en=title_en.strip(), grade=grade.strip()
    )
    _audit_created("position.created", position, _POSITION_FIELDS, actor)
    return position


@transaction.atomic
def update_position(
    *,
    actor,
    position: Position,
    code: str | None = None,
    title_fr: str | None = None,
    title_en: str | None = None,
    grade: str | None = None,
) -> Position:
    before = audit.snapshot(position, _POSITION_FIELDS)
    if code is not None:
        position.code = code.strip().upper()
    if title_fr is not None:
        position.title_fr = title_fr.strip()
    if title_en is not None:
        position.title_en = title_en.strip()
    if grade is not None:
        position.grade = grade.strip()
    position.save()
    _audit_changed("position.updated", position, _POSITION_FIELDS, before, actor)
    return position


@transaction.atomic
def set_position_active(*, actor, position: Position, is_active: bool) -> Position:
    if position.is_active == is_active:
        return position
    before = audit.snapshot(position, _POSITION_FIELDS)
    position.is_active = is_active
    position.save(update_fields=["is_active"])
    action = "position.activated" if is_active else "position.deactivated"
    _audit_changed(action, position, _POSITION_FIELDS, before, actor)
    return position
