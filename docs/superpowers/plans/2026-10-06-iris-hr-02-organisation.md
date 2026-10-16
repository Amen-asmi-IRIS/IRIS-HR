# Organisation Implementation Plan (plan 02)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR can enter the whole company (departments, positions, employees, reporting lines, documents, delegations, departures), and an employee can read their own record and propose a change that HR decides.

**Architecture:** Two new Django apps. `files` stores uploads on the file volume under generated names, checks them, encrypts medical ones and serves downloads behind an access-rule registry. `organisation` owns departments, positions, employees, delegations, employee documents and profile-change proposals, plus the `reach` module (own, team, department) that every later plan uses to filter data. The React app gains the employee pages of the HR desk, My space, My team and Overview, built from the shared components of plan 01b and extended later through two registries (`recordBlocks.tsx`, `peopleColumns.tsx`).

**Tech Stack:** Python 3.13, Django 5.2, Django REST Framework, drf-spectacular, cryptography (Fernet), Procrastinate, pytest-django, time-machine. React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, TanStack Query v5, React Router v7, react-i18next, react-hook-form with zod, openapi-fetch, Vitest, Testing Library, MSW v2, Playwright.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (the binding contract; sections 6.8, 7.6, 7.7, 9.3 and 9.4 define this plan's interfaces)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (sections 5.1 ACC-10, 5.2, 5.3 REQ-11, 7, 8.2, 9.6)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (sections 5.8, 5.9, 6.3, 6.6, 7.5, 7.9, 7.12, 8.2, 9.3)
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`

## Global Constraints

Master plan section 2 applies in full. The constraints below bear on this plan in particular and are copied from the specs.

**Employee records (PRD 5.2)**

- "Employee number and professional email are unique."
- "Each employee has at most one line manager, who is another employee. The system rejects a change that would create a loop in the reporting line."
- "Employee records are never deleted. HR archives a leaver with a date and reason; archived records leave normal lists and remain searchable by HR."
- "A department or position in use cannot be removed, only deactivated."
- "An employee views their own record and proposes changes to personal fields: name, date of birth, gender, personal email, phone, address, emergency contact. Contractual fields cannot be proposed."
- "HR accepts or rejects each proposal with an optional comment. On acceptance the record is updated. The employee is notified either way."
- "Go-live data is entered manually by HR. There is no import."
- "Archiving an employee disables the linked account." (ACC-10)
- "Only addresses ending in `@impactrisks.com` are accepted, compared case-insensitively." (ACC-01; the domain comes from `ALLOWED_EMAIL_DOMAIN`)

**Delegation (PRD REQ-11)**

- "A manager names a delegate for a date range. During that range both the manager and the delegate can act on the manager's steps and see what the manager sees. HR can create and end delegations for any manager."

**Reach (PRD 7)**

- "**Own** = the user's own data. **Team** = direct reports, and reports of anyone who delegated to the user, for the delegation period. **Dept** = the user's department. **All** = everyone."
- View employee record: Employee "Own"; Manager "Team (name, department, position, contact)"; HR "All"; Executive "All"; System Administrator "Name, email, account status only".
- Create, edit, archive employee: HR only. Decide profile change: HR only.
- Employee documents: Employee "Own, if shared"; Manager "No"; HR "All"; Executive "All"; System Administrator "No".
- Delegations: Manager "Own"; HR "All"; Executive "Own".
- Anonymous call: 401. Role not allowed on the endpoint: 403. Object outside the user's reach: 404 (master D14).

**Files (PRD 9.6, REQ-16)**

- "Stored on a dedicated volume outside the web root, under generated names."
- "Downloaded only through the API after a permission check; every medical or employee-document download is audited."
- "Medical attachments are encrypted per file with a key from the environment, not the database."
- "The declared type is checked against the file's content. Files are served as downloads with safe headers and are never executed or rendered inline from the application's origin."
- "Access goes through Django's storage interface, so the volume can be swapped for object storage later."
- "Accepted formats are PDF, JPG and PNG up to 10 MB each."

**Pages (UI document)**

- "People who left are hidden unless asked for." (7.9)
- "Before confirming, the page lists the consequences: account disabled; no further monthly credit; requests and steps left open (listed); people who reported to this employee and need a new manager (listed)." (7.9)
- "The whole workspace is read-only: it contains no editing action at all, so nothing appears disabled." (8, Overview)
- "Stated plainly: the change applies once HR accepts it." (5.9)
- "A page or item outside the user's reach shows "not available", without revealing whether it exists." (3.4)

**Decisions of the master that shape this plan:** D4 (delegation lives in `organisation`), D5 (`files` app, no `request` column on `Attachment`), D6 (`Employee.user`), D7 (bilingual department and position names), D24 (`employees/directory`).

## Review Focus

The five inputs most likely to hurt a person using this part of the software. Each has a test in the task named.

1. **Hostile or sloppy uploads.** A renamed executable, an empty file, a 50 MB file, a name with accents or path separators. Expected: a clear refusal next to the file input, nothing written, and a safe stored name. Tests in Task 1 (`test_refuses_bad_files`, `test_refuses_a_50_mb_file_without_reading_it`, `test_clean_name`).
2. **Reporting-line mistakes.** Making someone their own manager, or closing a loop three levels up (the CEO made to report to an employee two levels below). Expected: refused with the message on the manager field, record unchanged. Tests in Task 3 (`test_manager_cannot_be_the_employee`, `test_manager_loop_is_refused_at_any_depth`).
3. **Email typed loosely or on the wrong domain.** Capitals, surrounding spaces, a lookalike domain (`@impactrisks.com.evil.org`, `@impact-risks.com`), the address of a colleague in another case. Expected: stored lower-case and trimmed, or refused naming the company domain. Tests in Task 3 (`test_professional_email_is_normalised`, `test_lookalike_domains_are_refused`, `test_email_uniqueness_ignores_case`).
4. **The departure of someone others depend on.** Archiving a manager who has reports, an account and a running delegation; archiving twice. Expected: the account stops working at once, delegations end, reports are listed for HR and keep their data, nothing is deleted, the second attempt is told it was already done. Tests in Task 7 (`test_archiving_a_manager`, `test_archiving_twice_is_a_conflict`).
5. **Two people acting on one proposal.** HR accepts a proposal the employee withdrew a moment earlier; two HR holders decide the same proposal; HR edited the record after the proposal was made. Expected: exactly one outcome, the late actor is told it was already decided, the accepted values win over the stale ones. Tests in Task 9 (`test_a_withdrawn_proposal_cannot_be_decided`, `test_a_proposal_is_decided_once`, `test_acceptance_applies_the_proposed_values_over_later_edits`).

## What this plan takes from plans 01a and 01b

Nothing here is re-implemented. The names and shapes below were read from the two plans as written; their contract notes 3, 4, 5, 6, 13, 15 and 26 (01a) and 3, 6, 7, 8, 9 and 10 (01b) apply to every task of this plan.

| From | Used as |
|---|---|
| `apps.core.errors` | `DomainError(code, *, field=None, problems=None, **params)`, `NotAllowed`, `NotFound`, `Conflict` (each with a default code), `Problem(code, field, params)` |
| `apps.core.i18n` | `register_messages` |
| `apps.core.models` | `PublicIdModel`, `TimeStampedModel` |
| `apps.core.pagination` | `paginate(request, view, queryset, serializer_class, *, context=None)`, `paginated(serializer_class)`, `PAGE_PARAMETERS` |
| `apps.core.jobs` | `recorded(name)`, `RETRY` |
| `apps.audit.services` (imported as `audit`) | `record(*, action, obj, object_label, changes, actor)`, `snapshot`, `diff` (only what changed; an empty `object_label` falls back to `str(obj)`) |
| `apps.audit.selectors`, `apps.audit.api.serializers`, `apps.audit.models` | `events_for_object`, `AuditEventOut`, `AuditEvent` |
| `apps.notifications.services` (imported as `notifications`) | `register_event`, `notify` (returns the notifications it created; skips inactive accounts) |
| `apps.notifications.models` | `Notification` (tests only) |
| `apps.settings.services` (imported as `settings_service`) | `get`, `set_value` |
| `apps.accounts.roles` | `Role`, `roles_of` (cached on the user object), `has_role`, `register_derived_role_provider`, `users_with_role` |
| `apps.accounts.permissions` | `AUTHENTICATED` (the access sentinel) |
| `apps.accounts.services` (imported as `accounts_services`) | `create_account`, `disable_account`, `display_name` |
| `apps.accounts.ports` | `EmployeeRef`, `set_employee_directory`, `employee_directory` |
| `django.conf.settings` | `FILES_ROOT` (a `Path`, `/data/files`), `FILE_ENCRYPTION_KEY`, `ALLOWED_EMAIL_DOMAIN` |
| `backend/conftest.py` | fixtures `world`, `client_for`, `anon_client` |
| `backend/tests/matrix.py` (module `tests.matrix`) | `Case`, `P`, `only`, `SIGNED_IN` |
| `backend/tests/world.py` | `build_world()`, whose local variable is `world`; the cast accounts carry the demo addresses and names (`employee.a1@impactrisks.com`, "Amal Employee", …) |
| `@/api/client`, `@/api/problem`, `@/api/types` | `api`, `call`, `ProblemError`; `types.ts` holds the helper types `Ok`, `Rows`, `Body`, `Query` and every type derived from the generated schema |
| `@/components` (barrel) | `PageHeader`, `PageLoading`, `DataTable` and `Column<T>`, `Pager` (`page`, `pageSize`, `total`, `onPage`), `FilterBar`, `FilterText`, `FilterSelect`, `useListParams`, `backToList`, `EmptyState`, `TaskSheet`, `ConfirmDialog`, `Disclosure`, `StatusBadge`, `FormSummary`, `useProblemForm(form, { mapField })`, the bound inputs (`control`, `name`, `label`, `hint`), `ProblemBoundary`, `toast(message)` |
| `@/components/ui/button` | `Button`: `variant` is `primary`, `secondary` (the default), `ghost`, `destructive` or `link`; `size` is `default`, `sm`, `icon` or `inline`; `type` defaults to `button` |
| `@/i18n`, `@/lib/format` | `useLang()`, `formatDate(value, lang)`, `formatDateTime(value, lang)`; every `locales/<lang>/<namespace>.json` is discovered by itself, and a missing key throws in tests |
| `@/features/auth/api` | `useCurrentUser()` |
| `@/test/render`, `@/test/fixtures`, `@/test/server` | `renderApp(ui, { route, path, me })` (it shows `data-testid="elsewhere"` with the address when the page navigates away), `makeMe`, `makePage`, `problemResponse`, `server` (an unhandled request fails the test) |
| `frontend/e2e/helpers.ts` | `signIn`, `signOut`, `PASSWORD`, `SYSADMIN`, `uniqueEmail` |

One convention of plan 01b is not followed, on purpose: its components call `useTranslation()` and write `namespace:key`; the components of this plan call `useTranslation("<namespace>")` and write the key alone, which is the same lookup. Keys that cross a namespace are written in full (`employees:fields.phone`).

Commands are those of master section 5. Every backend command runs from the repository root as `docker compose run --rm app …`; every frontend command as `docker compose run --rm web …`.

---

## Part A: Backend

### Task 1: The `files` app

Uploads are checked, stored under generated names, encrypted when medical, and served only through one endpoint that asks a registered access rule.

**Files:**
- Create: `backend/apps/files/__init__.py` (empty), `backend/apps/files/apps.py`, `backend/apps/files/messages.py`, `backend/apps/files/models.py`, `backend/apps/files/services.py`, `backend/apps/files/selectors.py`, `backend/apps/files/testing.py`
- Create: `backend/apps/files/api/__init__.py` (empty), `backend/apps/files/api/views.py`, `backend/apps/files/api/urls.py`
- Create: `backend/apps/files/migrations/__init__.py` (empty), `backend/apps/files/migrations/0001_initial.py` (generated)
- Create: `backend/apps/files/tests/__init__.py` (empty), `backend/apps/files/tests/world.py`, `backend/apps/files/tests/matrix.py`
- Modify: `backend/config/settings.py` (one entry in `INSTALLED_APPS`)
- Modify: `backend/config/api_urls.py` (one line)
- Modify: `backend/conftest.py` (one import line at the end)
- Modify: `backend/tests/test_permission_matrix.py` (one entry in `MATRIX_MODULES`)
- Test: `backend/apps/files/tests/test_services.py`, `backend/apps/files/tests/test_api.py`

**Interfaces:**
- Consumes: `settings_service.get("upload_max_mb") -> int`, `settings_service.get("upload_allowed_types") -> list[str]`, `audit.record(...)`, `DomainError`, `NotFound`, `settings.FILES_ROOT`, `settings.FILE_ENCRYPTION_KEY` (both defined by plan 01a).
- Produces:
  - `apps.files.models.Attachment` (`public_id`, `kind`, `original_name`, `content_type`, `size`, `sha256`, `storage_path`, `is_encrypted`, `uploaded_by`, `uploaded_at`) and `AttachmentKind` (`MEDICAL = "medical"`, `PROOF = "proof"`, `SCANNED_FORM = "scanned_form"`, `EMPLOYEE_DOCUMENT = "employee_document"`)
  - `apps.files.services.store_upload(*, actor: User | None, upload: UploadedFile, kind: str) -> Attachment`
  - `apps.files.services.read_for_download(*, user: User, attachment: Attachment) -> tuple[bytes, str, str]`
  - `apps.files.services.register_access_rule(kind: str, rule: Callable[[User, Attachment], bool]) -> None`
  - `apps.files.services.clean_name(name: str) -> str`
  - `apps.files.selectors.get_attachment(public_id) -> Attachment` (raises `NotFound`)
  - Route `files:download` at `attachments/<uuid:public_id>/download`
  - Error codes `files.too_large` (param `max_mb`), `files.type_not_allowed` (param `allowed`), `files.content_mismatch` (param `allowed`), `files.empty`, each on field `file`
  - Test helpers `apps.files.tests.world.upload(name, content, content_type)`, `PDF_BYTES`, `PNG_BYTES`, `JPG_BYTES`, and the autouse fixture `files_root` (a `pathlib.Path`)

- [ ] **Step 1: Create the app skeleton and switch it on**

Create the four empty `__init__.py` files listed above, then:

`backend/apps/files/apps.py`

```python
from django.apps import AppConfig


class FilesConfig(AppConfig):
    name = "apps.files"
    label = "files"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.core.i18n import register_messages

        from .messages import MESSAGES

        register_messages(MESSAGES)
```

`backend/apps/files/messages.py`

```python
MESSAGES = {
    "files.too_large": {
        "en": "This file is larger than {max_mb} MB. Choose a smaller file.",
        "fr": "Ce fichier dépasse {max_mb} Mo. Choisissez un fichier plus léger.",
    },
    "files.type_not_allowed": {
        "en": "This type of file is not accepted. Accepted types: {allowed}.",
        "fr": "Ce type de fichier n'est pas accepté. Types acceptés : {allowed}.",
    },
    "files.content_mismatch": {
        "en": "The content of this file does not match its name. Save it again as one of {allowed} and retry.",
        "fr": "Le contenu de ce fichier ne correspond pas à son nom. Enregistrez-le à nouveau en {allowed} puis réessayez.",
    },
    "files.empty": {
        "en": "This file is empty. Choose another file.",
        "fr": "Ce fichier est vide. Choisissez un autre fichier.",
    },
}
```

In `backend/config/settings.py`, add `"apps.files",` after `"apps.notifications",` in `INSTALLED_APPS`. The settings the app reads (`FILES_ROOT`, `FILE_ENCRYPTION_KEY`) are already there.

In `backend/config/api_urls.py`, add to `urlpatterns`, after the notifications line:

```python
    path("", include("apps.files.api.urls")),
```

- [ ] **Step 2: Write the test helpers and the storage fixture**

`backend/apps/files/testing.py`

```python
"""Test support: every test stores files in its own temporary folder."""

from pathlib import Path

import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def files_root(settings, tmp_path) -> Path:
    root = tmp_path / "files"
    root.mkdir()
    settings.FILES_ROOT = str(root)
    settings.FILE_ENCRYPTION_KEY = Fernet.generate_key().decode()
    return root
```

Append this line at the very end of `backend/conftest.py`, so the fixture applies to every test of the project:

```python
from apps.files.testing import files_root  # noqa: E402, F401
```

`backend/apps/files/tests/world.py`

```python
from django.core.files.uploadedfile import SimpleUploadedFile

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def upload(name: str = "contract.pdf", content: bytes = PDF_BYTES,
           content_type: str = "application/pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type=content_type)
```

- [ ] **Step 3: Write the failing service tests**

`backend/apps/files/tests/test_services.py`

```python
import hashlib
import re

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotFound
from apps.files import services
from apps.files.models import Attachment, AttachmentKind
from apps.files.tests.world import JPG_BYTES, PDF_BYTES, PNG_BYTES, upload
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_stores_a_pdf_under_a_generated_name(world, files_root):
    attachment = services.store_upload(
        actor=world.hr_user, upload=upload("Contrat signé.pdf"), kind=AttachmentKind.EMPLOYEE_DOCUMENT
    )

    assert attachment.original_name == "Contrat signé.pdf"
    assert attachment.content_type == "application/pdf"
    assert attachment.size == len(PDF_BYTES)
    assert attachment.sha256 == hashlib.sha256(PDF_BYTES).hexdigest()
    assert attachment.is_encrypted is False
    assert attachment.uploaded_by == world.hr_user
    assert re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{32}", attachment.storage_path)
    assert (files_root / attachment.storage_path).read_bytes() == PDF_BYTES
    event = AuditEvent.objects.get(action="attachment.uploaded")
    assert event.object_id == str(attachment.public_id)
    assert event.object_label == "Contrat signé.pdf"


def test_medical_files_are_encrypted_on_disk_and_never_named_in_the_audit(world, files_root):
    attachment = services.store_upload(
        actor=world.owner_user, upload=upload("certificat grippe.pdf"), kind=AttachmentKind.MEDICAL
    )

    on_disk = (files_root / attachment.storage_path).read_bytes()
    assert attachment.is_encrypted is True
    assert b"%PDF" not in on_disk
    assert attachment.size == len(PDF_BYTES)
    # The label of a medical file is its kind and identifier, never its name.
    assert AuditEvent.objects.get(action="attachment.uploaded").object_label == f"medical:{attachment.public_id}"


def test_jpeg_and_png_are_accepted_whatever_the_case_of_the_extension(world):
    photo = services.store_upload(
        actor=world.hr_user, upload=upload("Photo.JPEG", JPG_BYTES, "image/jpeg"), kind=AttachmentKind.PROOF
    )
    scan = services.store_upload(
        actor=world.hr_user, upload=upload("scan.PNG", PNG_BYTES, "image/png"), kind=AttachmentKind.PROOF
    )

    assert photo.content_type == "image/jpeg"
    assert scan.content_type == "image/png"


@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("invoice.pdf", b"MZ\x90\x00" + b"\x00" * 64, "files.content_mismatch"),  # a renamed executable
        ("scan.pdf", PNG_BYTES, "files.content_mismatch"),
        ("notes.docx", b"PK\x03\x04" + b"\x00" * 64, "files.type_not_allowed"),
        ("setup.exe", b"MZ\x90\x00" + b"\x00" * 64, "files.type_not_allowed"),
        ("noextension", PDF_BYTES, "files.type_not_allowed"),
        ("empty.pdf", b"", "files.empty"),
    ],
)
def test_refuses_bad_files(world, files_root, name, content, code):
    with pytest.raises(DomainError) as error:
        services.store_upload(actor=world.hr_user, upload=upload(name, content), kind=AttachmentKind.PROOF)

    assert error.value.code == code
    assert error.value.problems[0].field == "file"
    assert Attachment.objects.count() == 0
    assert list(files_root.rglob("*")) == []


class _Huge:
    name = "huge.pdf"
    size = 50 * 1024 * 1024

    def read(self, *args):
        raise AssertionError("the content of an oversized file must not be read")


def test_refuses_a_50_mb_file_without_reading_it(world):
    with pytest.raises(DomainError) as error:
        services.store_upload(actor=world.hr_user, upload=_Huge(), kind=AttachmentKind.PROOF)

    assert error.value.code == "files.too_large"
    assert error.value.problems[0].params["max_mb"] == 10


def test_the_limits_follow_the_system_settings(world):
    settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=1)
    settings_service.set_value(actor=world.sysadmin_user, key="upload_allowed_types", value=["pdf"])
    settings_service.clear_cache()

    with pytest.raises(DomainError) as too_large:
        services.store_upload(
            actor=world.hr_user, upload=upload("big.pdf", PDF_BYTES + b"0" * (1024 * 1024)), kind=AttachmentKind.PROOF
        )
    with pytest.raises(DomainError) as wrong_type:
        services.store_upload(
            actor=world.hr_user, upload=upload("scan.png", PNG_BYTES, "image/png"), kind=AttachmentKind.PROOF
        )

    assert too_large.value.code == "files.too_large"
    assert wrong_type.value.code == "files.type_not_allowed"
    assert wrong_type.value.problems[0].params["allowed"] == "PDF"


@pytest.mark.parametrize(
    ("given", "stored"),
    [
        ("../../etc/passwd.pdf", "passwd.pdf"),
        ("C:\\Users\\rh\\Bureau\\contrat été.PDF", "contrat été.PDF"),
        ("re\u0301sume\u0301.pdf", "résumé.pdf"),  # decomposed accents become composed ones
        ("tab\tand\x00null.pdf", "tabandnull.pdf"),
        ("a" * 300 + ".pdf", "a" * 190 + ".pdf"),
        ("", "file"),
    ],
)
def test_clean_name(given, stored):
    assert services.clean_name(given) == stored


def test_download_needs_an_access_rule(world, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind=AttachmentKind.PROOF)

    with pytest.raises(NotFound):
        services.read_for_download(user=world.hr_user, attachment=attachment)


def test_download_returns_the_original_content_and_audits_sensitive_kinds(world, monkeypatch):
    monkeypatch.setattr(
        services, "_access_rules", {"medical": lambda user, attachment: user == world.owner_user}
    )
    attachment = services.store_upload(
        actor=world.owner_user, upload=upload("certificat.pdf"), kind=AttachmentKind.MEDICAL
    )

    content, name, content_type = services.read_for_download(user=world.owner_user, attachment=attachment)

    assert (content, name, content_type) == (PDF_BYTES, "certificat.pdf", "application/pdf")
    event = AuditEvent.objects.get(action="attachment.downloaded")
    assert event.object_id == str(attachment.public_id)
    assert "certificat" not in event.object_label
    assert event.actor == world.owner_user
    with pytest.raises(NotFound):
        services.read_for_download(user=world.hr_user, attachment=attachment)


def test_downloading_a_proof_is_not_audited(world, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: True})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind=AttachmentKind.PROOF)

    services.read_for_download(user=world.hr_user, attachment=attachment)

    assert not AuditEvent.objects.filter(action="attachment.downloaded").exists()
```

- [ ] **Step 4: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/files/tests/test_services.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.files.services'`

- [ ] **Step 5: Write the model**

`backend/apps/files/models.py`

```python
from django.conf import settings
from django.db import models

from apps.core.models import PublicIdModel


class AttachmentKind(models.TextChoices):
    MEDICAL = "medical"
    PROOF = "proof"
    SCANNED_FORM = "scanned_form"
    EMPLOYEE_DOCUMENT = "employee_document"


class Attachment(PublicIdModel):
    kind = models.CharField(max_length=20, choices=AttachmentKind.choices)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    storage_path = models.CharField(max_length=255, unique=True)
    is_encrypted = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]

    def __str__(self) -> str:
        return f"{self.kind}:{self.public_id}"
```

Run: `docker compose run --rm app python manage.py makemigrations files`
Expected: `Migrations for 'files': apps/files/migrations/0001_initial.py - Create model Attachment`

- [ ] **Step 6: Write the services and the selector**

`backend/apps/files/services.py`

```python
from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from collections.abc import Callable

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, Storage
from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError, NotFound
from apps.settings import services as settings_service

from .models import Attachment, AttachmentKind

# What a file must start with to be the type its name claims.
_SIGNATURES = (("pdf", b"%PDF-"), ("jpg", b"\xff\xd8\xff"), ("png", b"\x89PNG\r\n\x1a\n"))
_CONTENT_TYPES = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png"}
_ALIASES = {"jpeg": "jpg"}
_AUDITED_DOWNLOADS = {AttachmentKind.MEDICAL, AttachmentKind.EMPLOYEE_DOCUMENT}

_access_rules: dict[str, Callable[[object, Attachment], bool]] = {}


def storage() -> Storage:
    """The only place that knows where files live. Swap it to move to object storage."""
    return FileSystemStorage(location=settings.FILES_ROOT)


def register_access_rule(kind: str, rule: Callable[[object, Attachment], bool]) -> None:
    _access_rules[kind] = rule


def clean_name(name: str) -> str:
    """The name shown to people and used for downloads. Never used as a path."""
    name = unicodedata.normalize("NFC", name or "")
    name = re.split(r"[\\/]", name)[-1]
    name = "".join(character for character in name if character.isprintable()).strip()
    stem, dot, extension = name.rpartition(".")
    if dot and stem:
        name = f"{stem[:190]}.{extension[:9]}"
    else:
        name = name[:200]
    return name or "file"


def _extension(name: str) -> str:
    stem, dot, extension = name.rpartition(".")
    if not dot or not stem:
        return ""
    extension = extension.lower()
    return _ALIASES.get(extension, extension)


def _sniff(head: bytes) -> str | None:
    for extension, signature in _SIGNATURES:
        if head.startswith(signature):
            return extension
    return None


def _cipher() -> Fernet:
    return Fernet(settings.FILE_ENCRYPTION_KEY)


@transaction.atomic
def store_upload(*, actor, upload, kind: str) -> Attachment:
    if kind not in AttachmentKind.values:
        raise ValueError(f"unknown attachment kind: {kind}")
    max_mb = int(settings_service.get("upload_max_mb"))
    allowed = [_ALIASES.get(item.lower(), item.lower()) for item in settings_service.get("upload_allowed_types")]
    allowed = [item for item in allowed if item in _CONTENT_TYPES]
    allowed_label = ", ".join(item.upper() for item in allowed)

    name = clean_name(upload.name)
    if upload.size == 0:
        raise DomainError("files.empty", field="file")
    if upload.size > max_mb * 1024 * 1024:
        raise DomainError("files.too_large", field="file", max_mb=max_mb)
    extension = _extension(name)
    if extension not in allowed:
        raise DomainError("files.type_not_allowed", field="file", allowed=allowed_label)

    data = upload.read()
    if not data:
        raise DomainError("files.empty", field="file")
    if _sniff(data[:16]) != extension:
        raise DomainError("files.content_mismatch", field="file", allowed=allowed_label)

    encrypted = kind == AttachmentKind.MEDICAL
    payload = _cipher().encrypt(data) if encrypted else data
    path = storage().save(f"{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}", ContentFile(payload))
    attachment = Attachment.objects.create(
        kind=kind,
        original_name=name,
        content_type=_CONTENT_TYPES[extension],
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        storage_path=path,
        is_encrypted=encrypted,
        uploaded_by=actor,
    )
    audit.record(
        action="attachment.uploaded", obj=attachment, actor=actor, object_label="" if encrypted else name
    )
    return attachment


def read_for_download(*, user, attachment: Attachment) -> tuple[bytes, str, str]:
    rule = _access_rules.get(attachment.kind)
    if rule is None or not rule(user, attachment):
        raise NotFound()
    with storage().open(attachment.storage_path, "rb") as handle:
        data = handle.read()
    if attachment.is_encrypted:
        data = _cipher().decrypt(data)
    if attachment.kind in _AUDITED_DOWNLOADS:
        audit.record(
            action="attachment.downloaded",
            obj=attachment,
            actor=user,
            object_label="" if attachment.is_encrypted else attachment.original_name,
        )
    return data, attachment.original_name, attachment.content_type
```

`backend/apps/files/selectors.py`

```python
from apps.core.errors import NotFound

from .models import Attachment


def get_attachment(public_id) -> Attachment:
    try:
        return Attachment.objects.get(public_id=public_id)
    except Attachment.DoesNotExist:
        raise NotFound() from None
```

- [ ] **Step 7: Run the service tests and see them pass**

Run: `docker compose run --rm app pytest apps/files/tests/test_services.py -v`
Expected: 20 passed

- [ ] **Step 8: Write the failing endpoint tests and the matrix case**

`backend/apps/files/tests/test_api.py`

```python
import uuid

import pytest
from django.urls import reverse

from apps.files import services
from apps.files.tests.world import PDF_BYTES, upload

pytestmark = pytest.mark.django_db


def _url(public_id) -> str:
    return reverse("files:download", kwargs={"public_id": public_id})


def test_download_serves_the_file_as_an_attachment_with_safe_headers(world, client_for, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: True})
    attachment = services.store_upload(actor=world.hr_user, upload=upload("justificatif été.pdf"), kind="proof")

    response = client_for(world.owner_user).get(_url(attachment.public_id))

    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"].startswith("attachment;")
    assert "justificatif" in response["Content-Disposition"]
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Security-Policy"] == "sandbox; default-src 'none'"
    assert response["Cache-Control"] == "private, no-store"


def test_download_hides_what_the_user_may_not_read(world, client_for, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: False})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind="proof")

    refused = client_for(world.owner_user).get(_url(attachment.public_id))
    unknown = client_for(world.owner_user).get(_url(uuid.uuid4()))

    assert refused.status_code == 404
    assert refused.json()["code"] == "core.not_found"
    assert unknown.status_code == 404
    assert unknown.json() == {**refused.json(), "request_id": unknown.json()["request_id"]}


def test_download_needs_a_session(anon_client):
    assert anon_client.get(_url(uuid.uuid4())).status_code == 401
```

`backend/apps/files/tests/matrix.py`

```python
import uuid

from tests.matrix import SIGNED_IN, Case, only

CASES = [
    Case(
        route="files:download",
        method="GET",
        expect=only(hide=SIGNED_IN),
        kwargs=lambda w: {"public_id": uuid.uuid4()},
        label="an attachment that does not exist",
    ),
]
```

In `backend/tests/test_permission_matrix.py`, add `"apps.files.tests.matrix",` as the last entry of `MATRIX_MODULES`.

Run: `docker compose run --rm app pytest apps/files/tests/test_api.py -v`
Expected: 3 errors, `django.urls.exceptions.NoReverseMatch: 'files' is not a registered namespace`

- [ ] **Step 9: Write the view and its route**

`backend/apps/files/api/views.py`

```python
from django.http import HttpResponse
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED

from .. import selectors, services


class AttachmentDownloadView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="attachments_download",
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
    )
    def get(self, request, public_id):
        attachment = selectors.get_attachment(public_id)
        content, name, content_type = services.read_for_download(user=request.user, attachment=attachment)
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = content_disposition_header(True, name)
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "sandbox; default-src 'none'"
        response["Cache-Control"] = "private, no-store"
        return response
```

`backend/apps/files/api/urls.py`

```python
from django.urls import path

from . import views

app_name = "files"

urlpatterns = [
    path("attachments/<uuid:public_id>/download", views.AttachmentDownloadView.as_view(), name="download"),
]
```

- [ ] **Step 10: Regenerate the API description and run every test this task touches**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` now contain `/api/v1/attachments/{public_id}/download`

Run: `docker compose run --rm app pytest apps/files tests -v`
Expected: all pass, including `files:download GET` once per persona, no "route without a case" failure, and the OpenAPI and message-catalogue checks

Run: `docker compose run --rm app ruff check apps/files && docker compose run --rm app ruff format --check apps/files`
Expected: `All checks passed!` and no file to reformat

- [ ] **Step 11: Commit**

```bash
git add backend/apps/files backend/config/settings.py backend/config/api_urls.py backend/conftest.py backend/tests/test_permission_matrix.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(files): store, check, encrypt and serve attachments"
```

**Every later backend task ends the same way:** regenerate the API description with `powershell -File scripts/dev.ps1 openapi` when the task added or changed an endpoint, run `docker compose run --rm app pytest tests -v` (matrix, OpenAPI, messages) next to the task's own tests, run Ruff on the files touched, and commit `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` with the code. The steps below name these commands again where they apply.

**Every view method of this plan** carries `@extend_schema` with an `operation_id` that is unique in the project, and every `SerializerMethodField` has `@extend_schema_field`: the OpenAPI test of plan 01a fails on any warning.

### Task 2: The `organisation` app: models, the cast, departments and positions

Creates the app with its three structural models (`Department`, `Position`, `Employee`), extends the standard cast, and delivers departments and positions end to end. Employee rules and endpoints follow in Tasks 3 and 4.

**Files:**
- Create: `backend/apps/organisation/__init__.py` (empty), `backend/apps/organisation/apps.py`, `backend/apps/organisation/messages.py`, `backend/apps/organisation/models.py`, `backend/apps/organisation/selectors.py`
- Create: `backend/apps/organisation/services/__init__.py`, `backend/apps/organisation/services/structure.py`
- Create: `backend/apps/organisation/api/__init__.py` (empty), `backend/apps/organisation/api/serializers.py`, `backend/apps/organisation/api/views.py`, `backend/apps/organisation/api/urls.py`
- Create: `backend/apps/organisation/migrations/__init__.py` (empty), `backend/apps/organisation/migrations/0001_initial.py` (generated)
- Create: `backend/apps/organisation/tests/__init__.py` (empty), `backend/apps/organisation/tests/world.py`, `backend/apps/organisation/tests/matrix.py`
- Modify: `backend/config/settings.py` (one entry in `INSTALLED_APPS`), `backend/config/api_urls.py` (one line), `backend/tests/test_permission_matrix.py` (one entry), `backend/tests/world.py` (one import, one line in `build_world()`)
- Test: `backend/apps/organisation/tests/test_structure.py`

**Interfaces:**
- Consumes: `PublicIdModel`, `TimeStampedModel`, `audit.record/snapshot/diff`, `NotFound`, `Role`, the 01a cast (`exec_user`, `hr_user`, `manager_user`, `owner_user`, `peer_user`, `other_manager_user`, `outsider_user`).
- Produces:
  - Models `Department(code, name_fr, name_en, is_active)`, `Position(code, title_fr, title_en, grade, is_active)`, `Employee` (fields of PRD 8.2 plus `public_id` and `user`), enumerations `ContractType`, `EmployeeStatus` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`), `Gender` (`FEMALE`, `MALE`)
  - `services.create_department(*, actor, code: str, name_fr: str, name_en: str) -> Department`
  - `services.update_department(*, actor, department: Department, code: str | None = None, name_fr: str | None = None, name_en: str | None = None) -> Department`
  - `services.set_department_active(*, actor, department: Department, is_active: bool) -> Department`
  - `services.create_position(*, actor, code: str, title_fr: str, title_en: str, grade: str = "") -> Position`
  - `services.update_position(*, actor, position: Position, code: str | None = None, title_fr: str | None = None, title_en: str | None = None, grade: str | None = None) -> Position`
  - `services.set_position_active(*, actor, position: Position, is_active: bool) -> Position`
  - `selectors.full_name(employee) -> str`, `selectors.department_name(employee, lang) -> str`, `selectors.departments()`, `selectors.positions()` (both annotated with `employee_count`), `selectors.get_department(pk)`, `selectors.get_position(pk)`
  - Routes `organisation:department-list`, `organisation:department-detail`, `organisation:position-list`, `organisation:position-detail`
  - Test builders `make_department`, `make_position`, `make_employee`, and the cast attributes `dept_a`, `dept_b`, `position`, `ceo`, `hr`, `manager`, `owner`, `peer`, `other_manager`, `outsider`
  - The whole message catalogue of the app, including codes later tasks raise

- [ ] **Step 1: Create the app, its messages and its models**

Create the empty `__init__.py` files listed above, then:

`backend/apps/organisation/apps.py`

```python
from django.apps import AppConfig


class OrganisationConfig(AppConfig):
    name = "apps.organisation"
    label = "organisation"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.core.i18n import register_messages

        from .messages import MESSAGES

        register_messages(MESSAGES)
```

`backend/apps/organisation/messages.py`

```python
MESSAGES = {
    "organisation.number_taken": {
        "en": "This employee number is already used. Enter another number.",
        "fr": "Ce matricule est déjà utilisé. Saisissez un autre matricule.",
    },
    "organisation.email_taken": {
        "en": "This professional email already belongs to another employee.",
        "fr": "Cette adresse professionnelle appartient déjà à un autre employé.",
    },
    "organisation.email_domain": {
        "en": "The professional email must end with @{domain}.",
        "fr": "L'adresse professionnelle doit se terminer par @{domain}.",
    },
    "organisation.contract_dates": {
        "en": "The contract cannot end before it starts. Correct one of the two dates.",
        "fr": "Le contrat ne peut pas se terminer avant d'avoir commencé. Corrigez l'une des deux dates.",
    },
    "organisation.manager_loop": {
        "en": "This person reports, directly or not, to the employee. Choose a manager outside their team.",
        "fr": "Cette personne dépend, directement ou non, de l'employé. Choisissez un responsable extérieur à son équipe.",
    },
    "organisation.manager_self": {
        "en": "An employee cannot be their own manager. Choose someone else.",
        "fr": "Un employé ne peut pas être son propre responsable. Choisissez une autre personne.",
    },
    "organisation.already_archived": {
        "en": "This departure has already been recorded.",
        "fr": "Ce départ a déjà été enregistré.",
    },
    "organisation.nothing_to_change": {
        "en": "Nothing differs from your current details. Change at least one field.",
        "fr": "Rien ne diffère de vos informations actuelles. Modifiez au moins un champ.",
    },
    "organisation.field_not_proposable": {
        "en": "The field {name} can only be changed by HR.",
        "fr": "Le champ {name} ne peut être modifié que par les RH.",
    },
    "organisation.change_already_open": {
        "en": "You already have a change waiting for HR. Withdraw it before proposing another.",
        "fr": "Vous avez déjà une modification en attente côté RH. Retirez-la avant d'en proposer une autre.",
    },
    "organisation.change_already_decided": {
        "en": "This proposal has already been decided or withdrawn.",
        "fr": "Cette proposition a déjà été traitée ou retirée.",
    },
    "organisation.delegation_overlap": {
        "en": "Another delegation already covers part of these dates. End it or choose other dates.",
        "fr": "Une autre délégation couvre déjà une partie de ces dates. Terminez-la ou choisissez d'autres dates.",
    },
    "organisation.delegation_self": {
        "en": "Choose someone other than the manager as delegate.",
        "fr": "Choisissez comme délégué une autre personne que le responsable.",
    },
    "organisation.delegation_dates": {
        "en": "A delegation starts today or later and ends on or after its first day.",
        "fr": "Une délégation commence aujourd'hui ou plus tard et se termine au plus tôt le jour de son début.",
    },
    "organisation.delegation_not_manager": {
        "en": "Nobody reports to this person, so there is nothing to delegate.",
        "fr": "Personne ne dépend de cette personne : il n'y a rien à déléguer.",
    },
    "organisation.delegation_delegate_inactive": {
        "en": "This person is not active. Choose an active employee as delegate.",
        "fr": "Cette personne n'est pas active. Choisissez un employé actif comme délégué.",
    },
    "notification.profile_change.proposed.title": {
        "en": "Profile change to decide",
        "fr": "Modification de profil à traiter",
    },
    "notification.profile_change.proposed.body": {
        "en": "{employee} proposes a change to their details.",
        "fr": "{employee} propose une modification de ses informations.",
    },
    "notification.profile_change.accepted.title": {
        "en": "Your profile change was accepted",
        "fr": "Votre modification de profil a été acceptée",
    },
    "notification.profile_change.accepted.body": {
        "en": "HR accepted the change you proposed. Your record is up to date.",
        "fr": "Les RH ont accepté votre proposition. Votre fiche est à jour.",
    },
    "notification.profile_change.rejected.title": {
        "en": "Your profile change was refused",
        "fr": "Votre modification de profil a été refusée",
    },
    "notification.profile_change.rejected.body": {
        "en": "HR refused the change you proposed. Open your profile to read their comment.",
        "fr": "Les RH ont refusé votre proposition. Ouvrez votre profil pour lire leur commentaire.",
    },
    "notification.delegation.started.title": {
        "en": "Delegation started",
        "fr": "Délégation commencée",
    },
    "notification.delegation.started.body": {
        "en": "{delegate} now decides for {manager}, from {start} to {end}.",
        "fr": "{delegate} décide désormais à la place de {manager}, du {start} au {end}.",
    },
    "notification.delegation.ended.title": {
        "en": "Delegation ended",
        "fr": "Délégation terminée",
    },
    "notification.delegation.ended.body": {
        "en": "{delegate} no longer decides for {manager} (delegation from {start} to {end}).",
        "fr": "{delegate} ne décide plus à la place de {manager} (délégation du {start} au {end}).",
    },
}
```

`backend/apps/organisation/models.py`

```python
from django.conf import settings
from django.db import models

from apps.core.models import PublicIdModel, TimeStampedModel


class Department(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class Position(models.Model):
    code = models.CharField(max_length=20, unique=True)
    title_fr = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120)
    grade = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class ContractType(models.TextChoices):
    PERMANENT = "permanent"
    FIXED_TERM = "fixed_term"
    TEMPORARY = "temporary"
    CONSULTANT = "consultant"


class EmployeeStatus(models.TextChoices):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class Gender(models.TextChoices):
    FEMALE = "female"
    MALE = "male"


class Employee(PublicIdModel, TimeStampedModel):
    # The account of this person, if one exists (master D6). `user.employee` is the reverse accessor.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="employee"
    )
    employee_number = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    professional_email = models.EmailField(unique=True)
    personal_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    hire_date = models.DateField()
    contract_start_date = models.DateField(null=True, blank=True)
    contract_end_date = models.DateField(null=True, blank=True)
    contract_type = models.CharField(max_length=20, choices=ContractType.choices)
    status = models.CharField(max_length=20, choices=EmployeeStatus.choices, default=EmployeeStatus.ACTIVE)
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="employees")
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="employees")
    manager = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reports")
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=40, blank=True)
    # The leaving date HR gave when recording the departure; empty while the person is employed.
    archived_at = models.DateField(null=True, blank=True)
    archive_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        constraints = [
            models.CheckConstraint(condition=~models.Q(manager=models.F("id")), name="employee_not_own_manager"),
        ]

    def __str__(self) -> str:
        return f"{self.employee_number} {self.first_name} {self.last_name}"
```

In `backend/config/settings.py`, add `"apps.organisation",` after `"apps.files",` in `INSTALLED_APPS`.

Run: `docker compose run --rm app python manage.py makemigrations organisation`
Expected: `Migrations for 'organisation': apps/organisation/migrations/0001_initial.py` listing `Create model Department`, `Create model Position`, `Create model Employee`

- [ ] **Step 2: Extend the standard cast**

`backend/apps/organisation/tests/world.py`

```python
"""Builders for organisation data and the organisation part of the standard cast (master 6.11)."""

from __future__ import annotations

from datetime import date

from apps.organisation.models import ContractType, Department, Employee, Position


def make_department(code: str = "DEP-X", name_fr: str = "Département X", name_en: str = "Department X",
                    **extra) -> Department:
    return Department.objects.create(code=code, name_fr=name_fr, name_en=name_en, **extra)


def make_position(code: str = "POS-X", title_fr: str = "Poste X", title_en: str = "Position X",
                  **extra) -> Position:
    return Position.objects.create(code=code, title_fr=title_fr, title_en=title_en, **extra)


def make_employee(*, number: str, first_name: str, last_name: str, department: Department, position: Position,
                  manager: Employee | None = None, user=None, email: str | None = None, **extra) -> Employee:
    if email is None:
        email = user.email if user is not None else f"{first_name}.{last_name}@impactrisks.com"
    extra.setdefault("hire_date", date(2020, 1, 6))
    extra.setdefault("contract_type", ContractType.PERMANENT)
    return Employee.objects.create(
        employee_number=number,
        first_name=first_name,
        last_name=last_name,
        professional_email=email.lower(),
        department=department,
        position=position,
        manager=manager,
        user=user,
        **extra,
    )


def build(w) -> None:
    """Adds departments, a position and one employee per cast account."""
    w.dept_a = make_department("DEP-A", "Département A", "Department A")
    w.dept_b = make_department("DEP-B", "Département B", "Department B")
    w.position = make_position("POS-1", "Chargé de mission", "Officer")

    def cast(number, first_name, last_name, user, department, manager):
        return make_employee(number=number, first_name=first_name, last_name=last_name, user=user,
                             department=department, position=w.position, manager=manager)

    w.ceo = cast("E001", "Karim", "Directeur", w.exec_user, w.dept_b, None)
    w.hr = cast("E002", "Senna", "RH", w.hr_user, w.dept_b, w.ceo)
    w.manager = cast("E003", "Mounir", "Manager", w.manager_user, w.dept_a, w.ceo)
    w.owner = cast("E004", "Amal", "Employee", w.owner_user, w.dept_a, w.manager)
    w.peer = cast("E005", "Bilel", "Employee", w.peer_user, w.dept_a, w.manager)
    w.other_manager = cast("E006", "Nadia", "Manager", w.other_manager_user, w.dept_b, w.ceo)
    w.outsider = cast("E007", "Chokri", "Employee", w.outsider_user, w.dept_b, w.other_manager)
```

In `backend/tests/world.py`: add the import `from apps.organisation.tests import world as organisation_world` after the notifications import, and add this line in `build_world()`, after `notifications_world.build(world)` and before `return world`:

```python
    organisation_world.build(world)
```

The employees carry the names plan 01a gave the accounts ("Amal Employee", "Senna RH", …). `display_name` prefers the employee record, so with other names the step-1 tests that read a display name would change.

- [ ] **Step 3: Write the failing tests**

`backend/apps/organisation/tests/test_structure.py`

```python
import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.organisation import services
from apps.organisation.models import EmployeeStatus
from apps.organisation.tests.world import make_employee

pytestmark = pytest.mark.django_db


def _speak(user, language):
    user.language = language
    user.save(update_fields=["language"])


def test_the_cast_is_wired_as_the_master_plan_describes(world):
    assert world.ceo.manager is None
    assert world.ceo.user == world.exec_user
    assert world.hr.user == world.hr_user
    assert world.owner.manager == world.peer.manager == world.manager
    assert world.manager.manager == world.other_manager.manager == world.hr.manager == world.ceo
    assert world.outsider.manager == world.other_manager
    assert {e.department for e in (world.manager, world.owner, world.peer)} == {world.dept_a}
    assert {e.department for e in (world.ceo, world.hr, world.other_manager, world.outsider)} == {world.dept_b}
    assert world.owner.professional_email == world.owner_user.email


def test_create_department_normalises_and_audits(world):
    department = services.create_department(actor=world.hr_user, code=" fin ", name_fr="Finance ", name_en="Finance")

    assert (department.code, department.name_fr, department.is_active) == ("FIN", "Finance", True)
    event = AuditEvent.objects.get(action="department.created")
    assert event.object_label == "FIN"
    assert event.changes["code"] == {"before": None, "after": "FIN"}


def test_update_department_audits_only_what_changed(world):
    services.update_department(actor=world.hr_user, department=world.dept_a, name_en="Underwriting")
    services.update_department(actor=world.hr_user, department=world.dept_a, name_en="Underwriting")

    events = AuditEvent.objects.filter(action="department.updated")
    assert events.count() == 1
    assert events.get().changes == {"name_en": {"before": "Department A", "after": "Underwriting"}}


def test_a_department_in_use_can_be_deactivated_and_keeps_its_employees(world):
    services.set_department_active(actor=world.hr_user, department=world.dept_a, is_active=False)
    services.set_department_active(actor=world.hr_user, department=world.dept_a, is_active=False)

    world.dept_a.refresh_from_db()
    world.owner.refresh_from_db()
    assert world.dept_a.is_active is False
    assert world.owner.department == world.dept_a
    assert AuditEvent.objects.filter(action="department.deactivated").count() == 1


def test_positions_follow_the_same_rules(world):
    position = services.create_position(
        actor=world.hr_user, code="acc", title_fr="Comptable", title_en="Accountant", grade="B2"
    )
    services.update_position(actor=world.hr_user, position=position, grade="B3")
    services.set_position_active(actor=world.hr_user, position=position, is_active=False)

    position.refresh_from_db()
    assert (position.code, position.grade, position.is_active) == ("ACC", "B3", False)
    actions = AuditEvent.objects.filter(object_type="position").order_by("id").values_list("action", flat=True)
    assert list(actions) == ["position.created", "position.updated", "position.deactivated"]


def test_hr_lists_departments_with_names_and_head_counts(world, client_for):
    _speak(world.hr_user, "fr")
    make_employee(number="E900", first_name="Lea", last_name="Left", department=world.dept_a,
                  position=world.position, status=EmployeeStatus.ARCHIVED)

    response = client_for(world.hr_user).get(reverse("organisation:department-list"))

    assert response.status_code == 200
    rows = {row["code"]: row for row in response.json()}
    assert rows["DEP-A"] == {
        "id": world.dept_a.id, "code": "DEP-A", "name_fr": "Département A", "name_en": "Department A",
        "name": "Département A", "is_active": True, "employee_count": 3,
    }
    assert rows["DEP-B"]["employee_count"] == 4


def test_names_follow_the_language_of_the_reader(world, client_for):
    _speak(world.exec_user, "en")

    departments = client_for(world.exec_user).get(reverse("organisation:department-list")).json()
    positions = client_for(world.exec_user).get(reverse("organisation:position-list")).json()

    assert {row["name"] for row in departments} == {"Department A", "Department B"}
    assert positions[0]["title"] == "Officer"
    assert positions[0]["employee_count"] == 7


def test_hr_creates_and_edits_a_department(world, client_for):
    client = client_for(world.hr_user)

    created = client.post(
        reverse("organisation:department-list"),
        {"code": "ops", "name_fr": "Opérations", "name_en": "Operations"},
        format="json",
    )
    assert created.status_code == 201
    assert (created.json()["code"], created.json()["employee_count"]) == ("OPS", 0)

    url = reverse("organisation:department-detail", kwargs={"id": created.json()["id"]})
    patched = client.patch(url, {"name_en": "Ops", "is_active": False}, format="json")
    assert patched.status_code == 200
    assert (patched.json()["name_en"], patched.json()["is_active"]) == ("Ops", False)


def test_hr_creates_and_edits_a_position(world, client_for):
    client = client_for(world.hr_user)

    created = client.post(
        reverse("organisation:position-list"),
        {"code": "dir", "title_fr": "Directeur", "title_en": "Director", "grade": "A1"},
        format="json",
    )
    assert created.status_code == 201

    url = reverse("organisation:position-detail", kwargs={"id": created.json()["id"]})
    patched = client.patch(url, {"grade": "A2"}, format="json")
    assert (patched.status_code, patched.json()["grade"], patched.json()["code"]) == (200, "A2", "DIR")


def test_a_duplicate_code_is_refused_next_to_the_field(world, client_for):
    response = client_for(world.hr_user).post(
        reverse("organisation:department-list"),
        {"code": "dep-a", "name_fr": "Doublon", "name_en": "Duplicate"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "code"


def test_an_unknown_department_is_not_found(world, client_for):
    url = reverse("organisation:department-detail", kwargs={"id": 999999})

    assert client_for(world.hr_user).patch(url, {"name_en": "X"}, format="json").status_code == 404


def test_executives_read_but_do_not_write(world, client_for):
    client = client_for(world.exec_user)

    assert client.get(reverse("organisation:position-list")).status_code == 200
    assert client.post(reverse("organisation:position-list"), {}, format="json").status_code == 403
    url = reverse("organisation:position-detail", kwargs={"id": world.position.id})
    assert client.patch(url, {}, format="json").status_code == 403
```

- [ ] **Step 4: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_structure.py -v`
Expected: collection error, `ImportError: cannot import name 'services' from 'apps.organisation'`

- [ ] **Step 5: Write the selectors and the services**

`backend/apps/organisation/selectors.py`

```python
from __future__ import annotations

from django.db.models import Count, Q, QuerySet

from apps.core.errors import NotFound

from .models import Department, Employee, EmployeeStatus, Position


def full_name(employee: Employee) -> str:
    return f"{employee.first_name} {employee.last_name}".strip()


def department_name(employee: Employee, lang: str) -> str:
    return employee.department.name_en if lang == "en" else employee.department.name_fr


def _head_count() -> Count:
    return Count("employees", filter=~Q(employees__status=EmployeeStatus.ARCHIVED))


def departments() -> QuerySet[Department]:
    return Department.objects.annotate(employee_count=_head_count()).order_by("code")


def positions() -> QuerySet[Position]:
    return Position.objects.annotate(employee_count=_head_count()).order_by("code")


def get_department(pk: int) -> Department:
    try:
        return Department.objects.get(pk=pk)
    except Department.DoesNotExist:
        raise NotFound() from None


def get_position(pk: int) -> Position:
    try:
        return Position.objects.get(pk=pk)
    except Position.DoesNotExist:
        raise NotFound() from None
```

`backend/apps/organisation/services/structure.py`

```python
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
def update_department(*, actor, department: Department, code: str | None = None,
                      name_fr: str | None = None, name_en: str | None = None) -> Department:
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
def update_position(*, actor, position: Position, code: str | None = None, title_fr: str | None = None,
                    title_en: str | None = None, grade: str | None = None) -> Position:
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
```

`backend/apps/organisation/services/__init__.py`

```python
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "create_department",
    "create_position",
    "set_department_active",
    "set_position_active",
    "update_department",
    "update_position",
]
```

- [ ] **Step 6: Write the serializers, the views and the routes**

`backend/apps/organisation/api/serializers.py`

```python
from django.utils import translation
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from ..models import Department, Position


def lang() -> str:
    """The reader's language, as activated by LanguageMiddleware."""
    return "en" if (translation.get_language() or "fr").startswith("en") else "fr"


# --- Departments and positions -------------------------------------------------------------


class DepartmentOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name_fr = serializers.CharField()
    name_en = serializers.CharField()
    name = serializers.SerializerMethodField()
    is_active = serializers.BooleanField()
    employee_count = serializers.IntegerField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return getattr(obj, f"name_{lang()}")


class DepartmentIn(serializers.Serializer):
    code = serializers.CharField(
        max_length=20, validators=[UniqueValidator(queryset=Department.objects.all(), lookup="iexact")]
    )
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)


class DepartmentPatchIn(DepartmentIn):
    is_active = serializers.BooleanField(required=False)


class PositionOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    title_fr = serializers.CharField()
    title_en = serializers.CharField()
    title = serializers.SerializerMethodField()
    grade = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    employee_count = serializers.IntegerField()

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj) -> str:
        return getattr(obj, f"title_{lang()}")


class PositionIn(serializers.Serializer):
    code = serializers.CharField(
        max_length=20, validators=[UniqueValidator(queryset=Position.objects.all(), lookup="iexact")]
    )
    title_fr = serializers.CharField(max_length=120)
    title_en = serializers.CharField(max_length=120)
    grade = serializers.CharField(max_length=40, required=False, allow_blank=True)


class PositionPatchIn(PositionIn):
    is_active = serializers.BooleanField(required=False)
```

`backend/apps/organisation/api/views.py`

```python
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role

from .. import selectors, services
from . import serializers as s

# --- Departments and positions -------------------------------------------------------------


class DepartmentListView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}, "POST": {Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(operation_id="departments_list", responses=s.DepartmentOut(many=True))
    def get(self, request):
        return Response(s.DepartmentOut(selectors.departments(), many=True).data)

    @extend_schema(operation_id="departments_create", request=s.DepartmentIn, responses={201: s.DepartmentOut})
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
```

`backend/apps/organisation/api/urls.py`

```python
from django.urls import path

from . import views

app_name = "organisation"

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path("departments/<int:id>", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("positions", views.PositionListView.as_view(), name="position-list"),
    path("positions/<int:id>", views.PositionDetailView.as_view(), name="position-detail"),
]
```

In `backend/config/api_urls.py`, add to `urlpatterns`:

```python
    path("", include("apps.organisation.api.urls")),
```

- [ ] **Step 7: Add the matrix cases**

`backend/apps/organisation/tests/matrix.py`

```python
from tests.matrix import Case, P, only

CASES = [
    # Departments and positions
    Case(route="organisation:department-list", method="GET", expect=only(P.HR, P.EXEC)),
    Case(route="organisation:department-list", method="POST", expect=only(P.HR)),
    Case(route="organisation:department-detail", method="PATCH", expect=only(P.HR),
         kwargs=lambda w: {"id": w.dept_a.id}),
    Case(route="organisation:position-list", method="GET", expect=only(P.HR, P.EXEC)),
    Case(route="organisation:position-list", method="POST", expect=only(P.HR)),
    Case(route="organisation:position-detail", method="PATCH", expect=only(P.HR),
         kwargs=lambda w: {"id": w.position.id}),
]
```

In `backend/tests/test_permission_matrix.py`, add `"apps.organisation.tests.matrix",` as the last entry of `MATRIX_MODULES`.

- [ ] **Step 8: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains `/api/v1/departments`, `/api/v1/departments/{id}`, `/api/v1/positions`, `/api/v1/positions/{id}`

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass (12 tests in `test_structure.py`, the six new matrix cases for every persona, no route without a case)

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 9: Commit**

```bash
git add backend/apps/organisation backend/config/settings.py backend/config/api_urls.py backend/tests/world.py backend/tests/test_permission_matrix.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): departments, positions, the employee model and the standard cast"
```

### Task 3: Employee rules: create and update

**Files:**
- Create: `backend/apps/organisation/services/employees.py`
- Modify: `backend/apps/organisation/services/__init__.py` (replace the whole file)
- Test: `backend/apps/organisation/tests/test_employees.py`

**Interfaces:**
- Consumes: `Employee`, `EmployeeStatus`, `selectors.full_name`, `audit.record`, `audit.diff`, `DomainError`, `Conflict`, `Problem`, `settings.ALLOWED_EMAIL_DOMAIN`.
- Produces:
  - `services.create_employee(*, actor: User, data: Mapping[str, Any]) -> Employee`
  - `services.update_employee(*, actor: User, employee: Employee, data: Mapping[str, Any]) -> Employee`
  - `data` keys: `employee_number`, `first_name`, `last_name`, `date_of_birth`, `gender`, `professional_email`, `personal_email`, `phone`, `address`, `hire_date`, `contract_start_date`, `contract_end_date`, `contract_type`, `status`, `department` (a `Department`), `position` (a `Position`), `manager` (an `Employee` or `None`), `emergency_contact_name`, `emergency_contact_phone`. Unknown keys are ignored.
  - `apps.organisation.services.employees.employee_state(employee) -> dict[str, Any]` (the readable snapshot used for audit; relations appear as department code, position code and manager name)
  - Problems raised together in one `DomainError`: `organisation.number_taken` (field `employee_number`), `organisation.email_domain` (field `professional_email`, param `domain`), `organisation.email_taken` (field `professional_email`), `organisation.contract_dates` (field `contract_end_date`), `organisation.manager_self` and `organisation.manager_loop` (field `manager`). `Conflict("organisation.already_archived")` when an edit tries to bring an archived record back.
  - Audit actions `employee.created`, `employee.updated`

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_employees.py`

```python
from datetime import date

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError
from apps.organisation import services
from apps.organisation.models import ContractType, Employee, EmployeeStatus

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


def _data(world, **overrides):
    data = {
        "employee_number": "E100",
        "first_name": "Nour",
        "last_name": "Nouvelle",
        "professional_email": "nour.nouvelle@impactrisks.com",
        "hire_date": date(2026, 11, 2),
        "contract_type": ContractType.PERMANENT,
        "department": world.dept_a,
        "position": world.position,
        "manager": world.manager,
    }
    data.update(overrides)
    return data


def _problems(error) -> dict[str, str]:
    return {problem.field: problem.code for problem in error.value.problems}


def test_create_employee_stores_and_audits(world):
    employee = services.create_employee(actor=world.hr_user, data=_data(world, phone=" 20 123 456 "))

    assert employee.status == EmployeeStatus.ACTIVE
    assert employee.phone == "20 123 456"
    assert employee.manager == world.manager
    assert employee.user is None
    event = AuditEvent.objects.get(action="employee.created")
    assert event.object_id == str(employee.public_id)
    assert event.object_label == "Nour Nouvelle"
    assert event.changes["department"] == {"before": None, "after": "DEP-A"}
    assert event.changes["manager"] == {"before": None, "after": "Mounir Manager"}
    assert event.changes["hire_date"] == {"before": None, "after": "2026-11-02"}


def test_professional_email_is_normalised(world):
    employee = services.create_employee(
        actor=world.hr_user, data=_data(world, professional_email="  Nour.Nouvelle@ImpactRisks.COM ")
    )

    assert employee.professional_email == "nour.nouvelle@impactrisks.com"


@pytest.mark.parametrize(
    "email",
    [
        "nour@impactrisks.com.evil.org",
        "nour@impact-risks.com",
        "nour@evilimpactrisks.com",
        "nour@gmail.com",
        "nour@x@impactrisks.com",
    ],
)
def test_lookalike_domains_are_refused(world, email):
    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=_data(world, professional_email=email))

    assert _problems(error) == {"professional_email": "organisation.email_domain"}
    assert error.value.problems[0].params == {"domain": "impactrisks.com"}


def test_email_uniqueness_ignores_case(world):
    taken = world.owner.professional_email.upper()

    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=_data(world, professional_email=taken))

    assert _problems(error) == {"professional_email": "organisation.email_taken"}


def test_every_problem_is_reported_at_once(world):
    data = _data(
        world,
        employee_number="e004",
        professional_email="nour@gmail.com",
        contract_start_date=date(2026, 6, 1),
        contract_end_date=date(2026, 5, 31),
    )

    with pytest.raises(DomainError) as error:
        services.create_employee(actor=world.hr_user, data=data)

    assert _problems(error) == {
        "employee_number": "organisation.number_taken",
        "professional_email": "organisation.email_domain",
        "contract_end_date": "organisation.contract_dates",
    }
    assert not Employee.objects.filter(first_name="Nour").exists()


def test_update_employee_audits_before_and_after(world):
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000", "department": world.dept_b}
    )

    world.owner.refresh_from_db()
    assert world.owner.department == world.dept_b
    event = AuditEvent.objects.get(action="employee.updated")
    assert event.object_id == str(world.owner.public_id)
    assert event.changes == {
        "phone": {"before": "", "after": "71 000 000"},
        "department": {"before": "DEP-A", "after": "DEP-B"},
    }


def test_an_update_that_changes_nothing_is_not_audited(world):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"first_name": "Amal"})

    assert not AuditEvent.objects.filter(action="employee.updated").exists()


def test_keeping_your_own_number_and_email_is_not_a_duplicate(world):
    services.update_employee(
        actor=world.hr_user,
        employee=world.owner,
        data={"employee_number": "E004", "professional_email": world.owner.professional_email},
    )


def test_manager_cannot_be_the_employee(world):
    with pytest.raises(DomainError) as error:
        services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": world.owner})

    assert _problems(error) == {"manager": "organisation.manager_self"}


def test_manager_loop_is_refused_at_any_depth(world):
    # owner -> manager -> ceo: making the CEO report to the owner would close the loop.
    with pytest.raises(DomainError) as two_levels:
        services.update_employee(actor=world.hr_user, employee=world.ceo, data={"manager": world.owner})
    with pytest.raises(DomainError) as one_level:
        services.update_employee(actor=world.hr_user, employee=world.manager, data={"manager": world.peer})

    assert _problems(two_levels) == {"manager": "organisation.manager_loop"}
    assert _problems(one_level) == {"manager": "organisation.manager_loop"}
    world.ceo.refresh_from_db()
    assert world.ceo.manager is None


def test_moving_someone_to_another_manager_or_to_none_is_allowed(world):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": world.other_manager})
    world.owner.refresh_from_db()
    assert world.owner.manager == world.other_manager

    services.update_employee(actor=world.hr_user, employee=world.owner, data={"manager": None})
    world.owner.refresh_from_db()
    assert world.owner.manager is None
    last = AuditEvent.objects.filter(action="employee.updated").order_by("-id").first()
    assert last.changes == {"manager": {"before": "Nadia Manager", "after": None}}


def test_contract_dates_are_checked_against_the_stored_ones(world):
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"contract_start_date": date(2026, 1, 1)}
    )

    with pytest.raises(DomainError) as error:
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"contract_end_date": date(2025, 12, 31)}
        )

    assert _problems(error) == {"contract_end_date": "organisation.contract_dates"}


def test_status_moves_between_active_and_suspended_only(world):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.SUSPENDED})
    world.owner.refresh_from_db()
    assert world.owner.status == EmployeeStatus.SUSPENDED

    with pytest.raises(ValueError, match="archive_employee"):
        services.update_employee(
            actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.ARCHIVED}
        )


def test_an_archived_employee_cannot_be_brought_back_by_an_edit(world):
    Employee.objects.filter(pk=world.owner.pk).update(status=EmployeeStatus.ARCHIVED)
    world.owner.refresh_from_db()

    with pytest.raises(Conflict) as error:
        services.update_employee(actor=world.hr_user, employee=world.owner, data={"status": EmployeeStatus.ACTIVE})

    assert error.value.code == "organisation.already_archived"
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_employees.py -v`
Expected: 18 failures, `AttributeError: module 'apps.organisation.services' has no attribute 'create_employee'` (or `update_employee`)

- [ ] **Step 3: Write the service**

`backend/apps/organisation/services/employees.py`

```python
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.conf import settings
from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, Problem

from ..models import Employee, EmployeeStatus
from ..selectors import full_name

_TEXT_FIELDS = (
    "employee_number",
    "first_name",
    "last_name",
    "gender",
    "professional_email",
    "personal_email",
    "phone",
    "address",
    "contract_type",
    "status",
    "emergency_contact_name",
    "emergency_contact_phone",
)
_DATE_FIELDS = ("date_of_birth", "hire_date", "contract_start_date", "contract_end_date")
_RELATIONS = ("department", "position", "manager")
WRITABLE_FIELDS = (*_TEXT_FIELDS, *_DATE_FIELDS, *_RELATIONS)


def employee_state(employee: Employee) -> dict[str, Any]:
    """What the audit trail and the record history show: readable values, no internal identifiers."""
    state: dict[str, Any] = {name: getattr(employee, name) for name in _TEXT_FIELDS}
    for name in _DATE_FIELDS:
        value = getattr(employee, name)
        state[name] = value.isoformat() if value else None
    state["department"] = employee.department.code
    state["position"] = employee.position.code
    state["manager"] = full_name(employee.manager) if employee.manager_id else None
    return state


def _normalise(data: Mapping[str, Any]) -> dict[str, Any]:
    values = {name: data[name] for name in WRITABLE_FIELDS if name in data}
    for name in _TEXT_FIELDS:
        if isinstance(values.get(name), str):
            values[name] = values[name].strip()
    if "professional_email" in values:
        values["professional_email"] = values["professional_email"].lower()
    return values


def _reports_to(person: Employee, boss: Employee) -> bool:
    """True when `person` is `boss` or sits anywhere below `boss` in the reporting line."""
    seen: set[int] = set()
    current: Employee | None = person
    while current is not None and current.pk not in seen:
        if current.pk == boss.pk:
            return True
        seen.add(current.pk)
        current = current.manager
    return False


def _problems(values: Mapping[str, Any], *, instance: Employee | None) -> list[Problem]:
    problems: list[Problem] = []
    others = Employee.objects.all() if instance is None else Employee.objects.exclude(pk=instance.pk)

    number = values.get("employee_number")
    if number is not None and others.filter(employee_number__iexact=number).exists():
        problems.append(Problem("organisation.number_taken", "employee_number"))

    email = values.get("professional_email")
    if email is not None:
        domain = settings.ALLOWED_EMAIL_DOMAIN.lower()
        if email.count("@") != 1 or not email.endswith(f"@{domain}"):
            problems.append(Problem("organisation.email_domain", "professional_email", {"domain": domain}))
        elif others.filter(professional_email__iexact=email).exists():
            problems.append(Problem("organisation.email_taken", "professional_email"))

    start = values.get("contract_start_date", instance.contract_start_date if instance else None)
    end = values.get("contract_end_date", instance.contract_end_date if instance else None)
    if start and end and end < start:
        problems.append(Problem("organisation.contract_dates", "contract_end_date"))

    manager = values.get("manager")
    if manager is not None and instance is not None:
        if manager.pk == instance.pk:
            problems.append(Problem("organisation.manager_self", "manager"))
        elif _reports_to(manager, instance):
            problems.append(Problem("organisation.manager_loop", "manager"))
    return problems


def _raise_if_any(problems: list[Problem]) -> None:
    if problems:
        raise DomainError(problems[0].code, problems=problems)


@transaction.atomic
def create_employee(*, actor, data: Mapping[str, Any]) -> Employee:
    values = _normalise(data)
    values.setdefault("status", EmployeeStatus.ACTIVE)
    if values["status"] == EmployeeStatus.ARCHIVED:
        raise ValueError("a new employee cannot be archived; use archive_employee to record a departure")
    _raise_if_any(_problems(values, instance=None))
    employee = Employee.objects.create(**values)
    after = employee_state(employee)
    audit.record(
        action="employee.created",
        obj=employee,
        actor=actor,
        object_label=full_name(employee),
        changes=audit.diff(dict.fromkeys(after), after),
    )
    return employee


@transaction.atomic
def update_employee(*, actor, employee: Employee, data: Mapping[str, Any]) -> Employee:
    values = _normalise(data)
    status = values.get("status")
    if status == EmployeeStatus.ARCHIVED and employee.status != EmployeeStatus.ARCHIVED:
        raise ValueError("use archive_employee to record a departure")
    if employee.status == EmployeeStatus.ARCHIVED and status not in (None, EmployeeStatus.ARCHIVED):
        raise Conflict("organisation.already_archived")
    _raise_if_any(_problems(values, instance=employee))

    before = employee_state(employee)
    for name, value in values.items():
        setattr(employee, name, value)
    employee.save()
    changes = audit.diff(before, employee_state(employee))
    if changes:
        audit.record(
            action="employee.updated",
            obj=employee,
            actor=actor,
            object_label=full_name(employee),
            changes=changes,
        )
    return employee
```

Replace `backend/apps/organisation/services/__init__.py` with:

```python
from .employees import create_employee, update_employee
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "create_department",
    "create_employee",
    "create_position",
    "set_department_active",
    "set_position_active",
    "update_department",
    "update_employee",
    "update_position",
]
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_employees.py -v`
Expected: 18 passed

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/organisation
git commit -m "feat(organisation): employee create and update rules with audit"
```

### Task 4: Reach, derived roles and the employees API

**Files:**
- Create: `backend/apps/organisation/reach.py`
- Modify: `backend/apps/organisation/apps.py` (replace the whole file)
- Modify: `backend/apps/organisation/selectors.py` (replace the import block, append functions)
- Modify: `backend/apps/organisation/api/serializers.py` (replace the import block, append classes)
- Modify: `backend/apps/organisation/api/views.py` (replace the import block, append classes)
- Modify: `backend/apps/organisation/api/urls.py` (replace the whole file)
- Modify: `backend/apps/organisation/tests/matrix.py` (append cases)
- Modify: `backend/apps/accounts/tests/test_session_api.py`, `backend/apps/accounts/tests/test_administration.py`, `backend/apps/accounts/tests/test_accounts_api.py` (assertions of plan 01a that listed the roles of an account before employee records existed)
- Test: `backend/apps/organisation/tests/test_reach.py`, `backend/apps/organisation/tests/test_employees_api.py`

**Interfaces:**
- Consumes: `Role`, `roles_of`, `has_role`, `register_derived_role_provider`, `paginate`, `paginated`, `PAGE_PARAMETERS`, `NotAllowed`, `NotFound`, `services.create_employee`, `services.update_employee`.
- Produces:
  - `reach.employee_of(user) -> Employee | None`
  - `reach.acting_for(employee_id: int, *, on: date | None = None) -> set[int]` (returns `{employee_id}` until Task 6 adds delegation)
  - `reach.team_ids(user, *, on: date | None = None) -> set[int]` (non-archived employees whose manager is in `acting_for`; never the user)
  - `reach.department_peer_ids(user) -> set[int]`
  - `reach.can_see_employee(user, employee: Employee) -> bool`
  - `reach.lock_employee(employee_id: int) -> Employee`
  - `reach.derived_roles(user) -> set[Role]`, registered as the derived-role provider
  - `selectors.get_employee_for(user, public_id) -> Employee` (raises `NotFound`), `selectors.employees_for(user, *, include_archived: bool = False) -> QuerySet[Employee]`, `selectors.employee_list(user, *, scope=None, search="", department=None, manager=None, status=None, ordering=None) -> QuerySet[Employee]`, `selectors.directory() -> QuerySet[Employee]`, `selectors.direct_reports(employee) -> QuerySet[Employee]`, `selectors.manager_user(employee) -> User | None`
  - Serializers `DepartmentRefOut`, `PositionRefOut`, `EmployeeRefOut`, `EmployeeBriefOut`, `EmployeeTeamOut`, `EmployeeOut`, `EmployeeListOut`, `EmployeeIn`, `PublicIdRelatedField`, `employee_detail(user, employee) -> dict`
  - Routes `organisation:employee-list`, `organisation:employee-directory`, `organisation:employee-me`, `organisation:employee-detail`
  - `GET employees` query parameters: `scope` (`team` or `all`; default `all` for HR and EXEC, `team` otherwise), `search`, `department` (id), `manager` (public id), `status` (`active`, `suspended`, `archived`, `all`; archived people are left out unless asked for), `ordering` (`name`, `-name`, `employee_number`, `-employee_number`, `hire_date`, `-hire_date`), `page`, `page_size`

- [ ] **Step 1: Write the failing reach tests**

`backend/apps/organisation/tests/test_reach.py`

```python
import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

from apps.accounts.roles import Role, roles_of
from apps.organisation import reach
from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db
User = get_user_model()


def _fresh(user):
    """Roles are cached on the user object, so read the account again."""
    return User.objects.get(pk=user.pk)


def test_employee_of(world):
    assert reach.employee_of(world.owner_user) == world.owner
    assert reach.employee_of(world.sysadmin_user) is None
    assert reach.employee_of(AnonymousUser()) is None
    assert reach.employee_of(None) is None


def test_team_is_the_direct_reports(world):
    assert reach.team_ids(world.manager_user) == {world.owner.id, world.peer.id}
    assert reach.team_ids(world.exec_user) == {world.manager.id, world.other_manager.id, world.hr.id}
    assert reach.team_ids(world.owner_user) == set()
    assert reach.team_ids(world.sysadmin_user) == set()


def test_people_who_left_are_not_in_a_team(world):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.ARCHIVED)

    assert reach.team_ids(world.manager_user) == {world.owner.id}


def test_department_peers_include_the_user(world):
    assert reach.department_peer_ids(world.owner_user) == {world.manager.id, world.owner.id, world.peer.id}
    assert reach.department_peer_ids(world.sysadmin_user) == set()


@pytest.mark.parametrize(
    ("viewer", "target", "visible"),
    [
        ("owner_user", "owner", True),
        ("owner_user", "peer", False),
        ("manager_user", "owner", True),
        ("manager_user", "outsider", False),
        ("other_manager_user", "owner", False),
        ("hr_user", "owner", True),
        ("exec_user", "outsider", True),
        ("sysadmin_user", "owner", False),
    ],
)
def test_can_see_employee(world, viewer, target, visible):
    assert reach.can_see_employee(getattr(world, viewer), getattr(world, target)) is visible


def test_roles_are_derived_from_the_record_and_the_reporting_line(world):
    assert Role.EMPLOYEE in roles_of(_fresh(world.owner_user))
    assert Role.MANAGER not in roles_of(_fresh(world.owner_user))
    assert {Role.EMPLOYEE, Role.MANAGER} <= roles_of(_fresh(world.manager_user))
    assert {Role.EMPLOYEE, Role.MANAGER, Role.EXEC} <= roles_of(_fresh(world.exec_user))
    assert {Role.EMPLOYEE, Role.HR} <= roles_of(_fresh(world.hr_user))
    assert roles_of(_fresh(world.sysadmin_user)) == {Role.SYSADMIN}


def test_an_archived_record_gives_no_role(world):
    Employee.objects.filter(pk=world.manager.pk).update(status=EmployeeStatus.ARCHIVED)

    assert roles_of(_fresh(world.manager_user)) == frozenset()


def test_lock_employee_returns_the_row(world):
    assert reach.lock_employee(world.owner.id) == world.owner
```

Run: `docker compose run --rm app pytest apps/organisation/tests/test_reach.py -v`
Expected: collection error, `ImportError: cannot import name 'reach' from 'apps.organisation'`

- [ ] **Step 2: Write `reach.py` and register the role provider**

`backend/apps/organisation/reach.py`

```python
"""Who may see whom. Every app filters employee-related data through this module."""

from __future__ import annotations

from datetime import date

from apps.accounts.roles import Role, has_role

from .models import Employee, EmployeeStatus


def employee_of(user) -> Employee | None:
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.employee
    except Employee.DoesNotExist:
        return None


def acting_for(employee_id: int, *, on: date | None = None) -> set[int]:
    """The managers this employee acts as: themselves, plus (from Task 6) whoever delegated to them."""
    return {employee_id}


def team_ids(user, *, on: date | None = None) -> set[int]:
    employee = employee_of(user)
    if employee is None or employee.status == EmployeeStatus.ARCHIVED:
        return set()
    ids = set(
        Employee.objects.filter(manager_id__in=acting_for(employee.id, on=on))
        .exclude(status=EmployeeStatus.ARCHIVED)
        .values_list("id", flat=True)
    )
    ids.discard(employee.id)
    return ids


def department_peer_ids(user) -> set[int]:
    employee = employee_of(user)
    if employee is None:
        return set()
    return set(
        Employee.objects.filter(department_id=employee.department_id)
        .exclude(status=EmployeeStatus.ARCHIVED)
        .values_list("id", flat=True)
    )


def can_see_employee(user, employee: Employee) -> bool:
    if has_role(user, Role.HR, Role.EXEC):
        return True
    own = employee_of(user)
    if own is None:
        return False
    return own.id == employee.id or employee.id in team_ids(user)


def lock_employee(employee_id: int) -> Employee:
    """Serialises checks that must not run twice at once for one person. Call inside a transaction."""
    return Employee.objects.select_for_update().get(pk=employee_id)


def derived_roles(user) -> set[Role]:
    """EMPLOYEE for a linked record that is not archived; MANAGER when somebody reports to the user today."""
    employee = employee_of(user)
    if employee is None or employee.status == EmployeeStatus.ARCHIVED:
        return set()
    roles = {Role.EMPLOYEE}
    if team_ids(user):
        roles.add(Role.MANAGER)
    return roles
```

Replace `backend/apps/organisation/apps.py` with:

```python
from django.apps import AppConfig


class OrganisationConfig(AppConfig):
    name = "apps.organisation"
    label = "organisation"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.accounts.roles import register_derived_role_provider
        from apps.core.i18n import register_messages

        from . import reach
        from .messages import MESSAGES

        register_messages(MESSAGES)
        register_derived_role_provider(reach.derived_roles)
```

Run: `docker compose run --rm app pytest apps/organisation/tests/test_reach.py -v`
Expected: 15 passed

- [ ] **Step 3: Write the failing API tests**

`backend/apps/organisation/tests/test_employees_api.py`

```python
import pytest
from django.urls import reverse

from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db

LIST = "organisation:employee-list"


@pytest.fixture(autouse=True)
def _company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


def _list(client, **params):
    return client.get(reverse(LIST), params)


def _detail(employee) -> str:
    return reverse("organisation:employee-detail", kwargs={"public_id": employee.public_id})


def _archive(employee) -> None:
    Employee.objects.filter(pk=employee.pk).update(status=EmployeeStatus.ARCHIVED)


def _payload(world, **overrides):
    payload = {
        "employee_number": "E100",
        "first_name": "Nour",
        "last_name": "Nouvelle",
        "professional_email": "Nour.Nouvelle@impactrisks.com",
        "hire_date": "2026-11-02",
        "contract_type": "permanent",
        "department": world.dept_a.id,
        "position": world.position.id,
        "manager": str(world.manager.public_id),
    }
    payload.update(overrides)
    return payload


def test_hr_lists_everyone_still_employed(world, client_for):
    _archive(world.outsider)

    body = _list(client_for(world.hr_user)).json()

    assert body["count"] == 6
    assert "E007" not in [row["employee_number"] for row in body["results"]]
    row = next(row for row in body["results"] if row["employee_number"] == "E004")
    assert set(row) == {
        "public_id", "name", "department", "position", "professional_email", "phone",
        "employee_number", "manager", "status",
    }
    assert row["name"] == "Amal Employee"
    assert row["department"]["code"] == "DEP-A"
    assert row["position"]["code"] == "POS-1"
    assert row["manager"] == {"public_id": str(world.manager.public_id), "name": "Mounir Manager"}
    assert row["status"] == "active"


def test_people_who_left_are_found_only_when_asked_for(world, client_for):
    _archive(world.outsider)
    client = client_for(world.hr_user)

    assert [row["employee_number"] for row in _list(client, status="archived").json()["results"]] == ["E007"]
    assert _list(client, status="all").json()["count"] == 7


def test_search_filters_and_ordering(world, client_for):
    client = client_for(world.hr_user)

    assert [row["name"] for row in _list(client, search="amal emp").json()["results"]] == ["Amal Employee"]
    assert [row["name"] for row in _list(client, search="e005").json()["results"]] == ["Bilel Employee"]
    assert [row["name"] for row in _list(client, search=world.hr.professional_email).json()["results"]] == ["Senna RH"]
    assert _list(client, department=world.dept_a.id).json()["count"] == 3
    reports = _list(client, manager=str(world.manager.public_id)).json()["results"]
    assert {row["name"] for row in reports} == {"Amal Employee", "Bilel Employee"}
    assert _list(client, ordering="-employee_number").json()["results"][0]["employee_number"] == "E007"
    assert _list(client, ordering="nonsense").status_code == 400


def test_a_manager_sees_only_the_team_and_only_contact_details(world, client_for):
    body = _list(client_for(world.manager_user)).json()

    assert {row["name"] for row in body["results"]} == {"Amal Employee", "Bilel Employee"}
    for row in body["results"]:
        assert (row["employee_number"], row["manager"], row["status"]) == (None, None, None)
        assert row["professional_email"].endswith("@impactrisks.com")


def test_scopes_follow_the_roles(world, client_for):
    assert _list(client_for(world.manager_user), scope="all").status_code == 403
    assert _list(client_for(world.hr_user), scope="team").status_code == 403

    team = _list(client_for(world.exec_user), scope="team").json()
    assert {row["name"] for row in team["results"]} == {"Mounir Manager", "Nadia Manager", "Senna RH"}
    assert team["results"][0]["employee_number"] is not None  # an executive keeps the full view


def test_the_record_is_complete_for_its_owner_hr_and_executives(world, client_for):
    for user in (world.owner_user, world.hr_user, world.exec_user):
        body = client_for(user).get(_detail(world.owner)).json()
        assert body["employee_number"] == "E004"
        assert body["hire_date"] == "2020-01-06"
        assert body["manager"] == {"public_id": str(world.manager.public_id), "name": "Mounir Manager"}
        assert body["has_account"] is True
        assert body["archived_at"] is None


def test_a_manager_reads_only_name_department_position_and_contact(world, client_for):
    body = client_for(world.manager_user).get(_detail(world.owner)).json()

    assert set(body) == {
        "public_id", "first_name", "last_name", "name", "department", "position", "professional_email", "phone",
    }


@pytest.mark.parametrize("viewer", ["peer_user", "other_manager_user", "outsider_user"])
def test_a_record_outside_reach_does_not_exist(world, client_for, viewer):
    response = client_for(getattr(world, viewer)).get(_detail(world.owner))

    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"


def test_my_own_record(world, client_for):
    body = client_for(world.owner_user).get(reverse("organisation:employee-me")).json()

    assert body["public_id"] == str(world.owner.public_id)
    assert body["employee_number"] == "E004"
    assert client_for(world.sysadmin_user).get(reverse("organisation:employee-me")).status_code == 403


def test_the_directory_lists_active_people_by_name_and_department_only(world, client_for):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.SUSPENDED)
    url = reverse("organisation:employee-directory")

    body = client_for(world.manager_user).get(url).json()

    assert len(body) == 6
    assert set(body[0]) == {"public_id", "name", "department"}
    assert "Bilel Employee" not in [row["name"] for row in body]
    assert client_for(world.owner_user).get(url).status_code == 403


def test_hr_creates_an_employee(world, client_for):
    response = client_for(world.hr_user).post(reverse(LIST), _payload(world), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["professional_email"] == "nour.nouvelle@impactrisks.com"
    assert body["status"] == "active"
    assert body["has_account"] is False
    assert body["manager"]["name"] == "Mounir Manager"


def test_problems_come_back_next_to_their_fields(world, client_for):
    payload = _payload(world, employee_number="E004", professional_email="nour@gmail.com")

    response = client_for(world.hr_user).post(reverse(LIST), payload, format="json")

    assert response.status_code == 400
    assert {(error["field"], error["code"]) for error in response.json()["errors"]} == {
        ("employee_number", "organisation.number_taken"),
        ("professional_email", "organisation.email_domain"),
    }


def test_mandatory_fields_are_named(world, client_for):
    response = client_for(world.hr_user).post(reverse(LIST), {}, format="json")

    assert response.status_code == 400
    assert {error["field"] for error in response.json()["errors"]} == {
        "employee_number", "first_name", "last_name", "professional_email", "hire_date",
        "contract_type", "department", "position",
    }


def test_a_malformed_or_departed_manager_is_refused_not_crashed(world, client_for):
    _archive(world.outsider)
    client = client_for(world.hr_user)

    for manager in ("not-an-identifier", str(world.outsider.public_id)):
        response = client.post(reverse(LIST), _payload(world, manager=manager), format="json")
        assert response.status_code == 400
        assert response.json()["errors"][0]["field"] == "manager"


def test_hr_edits_an_employee(world, client_for):
    response = client_for(world.hr_user).patch(
        _detail(world.owner), {"phone": "71 000 000", "status": "suspended"}, format="json"
    )

    assert response.status_code == 200
    assert (response.json()["phone"], response.json()["status"]) == ("71 000 000", "suspended")


def test_an_edit_cannot_archive(world, client_for):
    response = client_for(world.hr_user).patch(_detail(world.owner), {"status": "archived"}, format="json")

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "status"


def test_a_manager_loop_is_refused_through_the_api(world, client_for):
    response = client_for(world.hr_user).patch(
        _detail(world.ceo), {"manager": str(world.owner.public_id)}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "organisation.manager_loop"
    assert response.json()["errors"][0]["field"] == "manager"


def test_only_hr_writes(world, client_for):
    assert client_for(world.exec_user).post(reverse(LIST), {}, format="json").status_code == 403
    own = client_for(world.owner_user).patch(_detail(world.owner), {"phone": "1"}, format="json")
    assert own.status_code == 403
```

Run: `docker compose run --rm app pytest apps/organisation/tests/test_employees_api.py -v`
Expected: 20 errors or failures, `NoReverseMatch: Reverse for 'employee-list' not found`

- [ ] **Step 4: Extend the selectors**

In `backend/apps/organisation/selectors.py`, replace the import block at the top with:

```python
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Count, Q, QuerySet, Value
from django.db.models.functions import Concat

from apps.accounts.roles import Role, has_role
from apps.core.errors import NotAllowed, NotFound

from . import reach
from .models import Department, Employee, EmployeeStatus, Position
```

Append at the end of the file:

```python
# --- Employees -----------------------------------------------------------------------------

_ORDERINGS = {
    "name": ("last_name", "first_name"),
    "-name": ("-last_name", "-first_name"),
    "employee_number": ("employee_number",),
    "-employee_number": ("-employee_number",),
    "hire_date": ("hire_date", "last_name"),
    "-hire_date": ("-hire_date", "last_name"),
}


def _with_relations() -> QuerySet[Employee]:
    return Employee.objects.select_related("department", "position", "manager", "user")


def get_employee(public_id) -> Employee:
    """Any employee by public identifier, without a reach check. For services, never for views."""
    try:
        return _with_relations().get(public_id=public_id)
    except (Employee.DoesNotExist, ValidationError, ValueError):
        raise NotFound() from None


def get_employee_for(user, public_id) -> Employee:
    employee = get_employee(public_id)
    if not reach.can_see_employee(user, employee):
        raise NotFound()
    return employee


def employees_for(user, *, include_archived: bool = False) -> QuerySet[Employee]:
    """Everyone the user may see: all for HR and executives, otherwise their own record and their team."""
    queryset = _with_relations()
    if has_role(user, Role.HR, Role.EXEC):
        return queryset if include_archived else queryset.exclude(status=EmployeeStatus.ARCHIVED)
    own = reach.employee_of(user)
    if own is None:
        return queryset.none()
    return queryset.filter(id__in={own.id, *reach.team_ids(user)})


def employee_list(user, *, scope: str | None = None, search: str = "", department: int | None = None,
                  manager=None, status: str | None = None, ordering: str | None = None) -> QuerySet[Employee]:
    """The directory (`all`, HR and executives) or the people of a manager (`team`)."""
    privileged = has_role(user, Role.HR, Role.EXEC)
    scope = scope or ("all" if privileged else "team")
    if scope == "all":
        if not privileged:
            raise NotAllowed()
        queryset = _with_relations()
        if not status:
            queryset = queryset.exclude(status=EmployeeStatus.ARCHIVED)
        elif status != "all":
            queryset = queryset.filter(status=status)
    else:
        if not has_role(user, Role.MANAGER):
            raise NotAllowed()
        queryset = _with_relations().filter(id__in=reach.team_ids(user))
        if status and status != "all":
            queryset = queryset.filter(status=status)
    if department:
        queryset = queryset.filter(department_id=department)
    if manager:
        queryset = queryset.filter(manager__public_id=manager)
    search = (search or "").strip()
    if search:
        queryset = queryset.annotate(_full_name=Concat("first_name", Value(" "), "last_name")).filter(
            Q(_full_name__icontains=search)
            | Q(employee_number__icontains=search)
            | Q(professional_email__icontains=search)
        )
    return queryset.order_by(*_ORDERINGS[ordering or "name"])


def directory() -> QuerySet[Employee]:
    """Active employees, for pickers (master D24). Only name and department are ever serialised."""
    return (
        Employee.objects.filter(status=EmployeeStatus.ACTIVE)
        .select_related("department")
        .order_by("last_name", "first_name")
    )


def direct_reports(employee: Employee) -> QuerySet[Employee]:
    return employee.reports.exclude(status=EmployeeStatus.ARCHIVED).order_by("last_name", "first_name")


def _usable_account(employee: Employee | None):
    """The account of an employee who can act: not archived, with an account that is switched on."""
    if employee is None or employee.status == EmployeeStatus.ARCHIVED or employee.user_id is None:
        return None
    return employee.user if employee.user.is_active else None


def manager_user(employee: Employee):
    """The active account of the employee's manager, or None when nobody can act for that manager."""
    return _usable_account(employee.manager)
```

- [ ] **Step 5: Extend the serializers**

In `backend/apps/organisation/api/serializers.py`, replace the import block at the top (everything above `def lang()`) with:

```python
import uuid

from django.utils import translation
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema_field
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.accounts.roles import Role, has_role

from .. import reach, selectors
from ..models import ContractType, Department, Employee, EmployeeStatus, Gender, Position
```

Append at the end of the file:

```python
# --- Employees -----------------------------------------------------------------------------


class PublicIdRelatedField(serializers.SlugRelatedField):
    """A related row addressed by its public identifier. A malformed identifier is "not found", never a crash."""

    def __init__(self, **kwargs):
        super().__init__(slug_field="public_id", **kwargs)

    def to_internal_value(self, data):
        try:
            uuid.UUID(str(data))
        except ValueError:
            self.fail("does_not_exist", slug_name="public_id", value=data)
        return super().to_internal_value(data)


class DepartmentRefOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return getattr(obj, f"name_{lang()}")


class PositionRefOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    title = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj) -> str:
        return getattr(obj, f"title_{lang()}")


class EmployeeRefOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)


class EmployeeBriefOut(EmployeeRefOut):
    department = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_department(self, obj) -> str:
        return selectors.department_name(obj, lang())


class EmployeeTeamOut(serializers.Serializer):
    """What a manager reads about a member of the team: name, department, position, contact."""

    public_id = serializers.UUIDField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    name = serializers.SerializerMethodField()
    department = DepartmentRefOut()
    position = PositionRefOut()
    professional_email = serializers.EmailField()
    phone = serializers.CharField(allow_blank=True)

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)


class EmployeeOut(EmployeeTeamOut):
    """The whole record: for its owner, HR and executives."""

    employee_number = serializers.CharField()
    date_of_birth = serializers.DateField(allow_null=True)
    gender = serializers.CharField(allow_blank=True)
    personal_email = serializers.CharField(allow_blank=True)
    address = serializers.CharField(allow_blank=True)
    hire_date = serializers.DateField()
    contract_start_date = serializers.DateField(allow_null=True)
    contract_end_date = serializers.DateField(allow_null=True)
    contract_type = serializers.CharField()
    status = serializers.CharField()
    manager = EmployeeRefOut(allow_null=True)
    emergency_contact_name = serializers.CharField(allow_blank=True)
    emergency_contact_phone = serializers.CharField(allow_blank=True)
    archived_at = serializers.DateField(allow_null=True)
    archive_reason = serializers.CharField(allow_blank=True)
    has_account = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    @extend_schema_field(serializers.BooleanField())
    def get_has_account(self, obj) -> bool:
        return obj.user_id is not None


EmployeeDetailOut = PolymorphicProxySerializer(
    component_name="EmployeeDetail",
    serializers=[EmployeeOut, EmployeeTeamOut],
    resource_type_field_name=None,
)


def employee_detail(user, employee: Employee) -> dict:
    """The whole record for its owner, HR and executives; the team view for anyone else who may see it."""
    own = reach.employee_of(user)
    full = has_role(user, Role.HR, Role.EXEC) or (own is not None and own.id == employee.id)
    return (EmployeeOut if full else EmployeeTeamOut)(employee).data


class EmployeeListOut(serializers.Serializer):
    """One row of a list. The last three fields are null for a viewer who is neither HR nor an executive."""

    public_id = serializers.UUIDField()
    name = serializers.SerializerMethodField()
    department = DepartmentRefOut()
    position = PositionRefOut()
    professional_email = serializers.EmailField()
    phone = serializers.CharField(allow_blank=True)
    employee_number = serializers.SerializerMethodField()
    manager = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return selectors.full_name(obj)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_employee_number(self, obj):
        return obj.employee_number if self.context.get("full") else None

    @extend_schema_field(EmployeeRefOut(allow_null=True))
    def get_manager(self, obj):
        if not self.context.get("full") or obj.manager_id is None:
            return None
        return EmployeeRefOut(obj.manager).data

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_status(self, obj):
        return obj.status if self.context.get("full") else None


class EmployeeListQuery(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["team", "all"], required=False)
    search = serializers.CharField(required=False, allow_blank=True)
    department = serializers.IntegerField(required=False)
    manager = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=["active", "suspended", "archived", "all"], required=False)
    ordering = serializers.ChoiceField(
        choices=["name", "-name", "employee_number", "-employee_number", "hire_date", "-hire_date"],
        required=False,
    )


_EDITABLE_STATUS = serializers.ChoiceField(choices=[EmployeeStatus.ACTIVE, EmployeeStatus.SUSPENDED])


class EmployeeIn(serializers.Serializer):
    employee_number = serializers.CharField(max_length=20)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=Gender.choices, required=False, allow_blank=True)
    professional_email = serializers.EmailField()
    personal_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    hire_date = serializers.DateField()
    contract_start_date = serializers.DateField(required=False, allow_null=True)
    contract_end_date = serializers.DateField(required=False, allow_null=True)
    contract_type = serializers.ChoiceField(choices=ContractType.choices)
    # Active or suspended only. A plain string in the schema: departures go through `employees/{id}/archive`.
    status = serializers.CharField(required=False)
    department = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all())
    position = serializers.PrimaryKeyRelatedField(queryset=Position.objects.all())
    manager = PublicIdRelatedField(
        queryset=Employee.objects.exclude(status=EmployeeStatus.ARCHIVED), required=False, allow_null=True
    )
    emergency_contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_status(self, value):
        return _EDITABLE_STATUS.run_validation(value)
```

- [ ] **Step 6: Extend the views and the routes**

In `backend/apps/organisation/api/views.py`, replace the import block at the top with:

```python
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role, has_role
from apps.core.errors import NotFound
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

from .. import reach, selectors, services
from . import serializers as s
```

Append at the end of the file:

```python
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
```

Replace `backend/apps/organisation/api/urls.py` with:

```python
from django.urls import path

from . import views

app_name = "organisation"

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path("departments/<int:id>", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("positions", views.PositionListView.as_view(), name="position-list"),
    path("positions/<int:id>", views.PositionDetailView.as_view(), name="position-detail"),
    path("employees", views.EmployeeListView.as_view(), name="employee-list"),
    path("employees/directory", views.EmployeeDirectoryView.as_view(), name="employee-directory"),
    path("employees/me", views.EmployeeMeView.as_view(), name="employee-me"),
    path("employees/<uuid:public_id>", views.EmployeeDetailView.as_view(), name="employee-detail"),
]
```

- [ ] **Step 7: Add the matrix cases**

In `backend/apps/organisation/tests/matrix.py`, add after the imports:

```python
_MANAGERS = (P.MANAGER, P.OTHER_MANAGER)
_EMPLOYEES = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)
```

and append these cases inside `CASES`:

```python
    # Employees. The executive of the cast has direct reports, so holds MANAGER too.
    Case(route="organisation:employee-list", method="GET", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:employee-list", method="POST", expect=only(P.HR)),
    Case(route="organisation:employee-directory", method="GET", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:employee-me", method="GET", expect=only(*_EMPLOYEES)),
    Case(route="organisation:employee-detail", method="GET", label="the owner's record",
         expect=only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER)),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
    Case(route="organisation:employee-detail", method="PATCH", expect=only(P.HR),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
```

- [ ] **Step 8: Correct the step-1 tests that listed roles before employee records existed**

From this task on every cast account except the administrator has an employee record, so it holds `employee` (and `manager` when somebody reports to it). Three test files of plan 01a compare complete role lists; bring them up to date.

In `backend/apps/accounts/tests/test_session_api.py`, in `test_signing_in_returns_the_user_and_opens_a_browser_session`:

```python
    assert body["roles"] == ["employee"]
    assert body["workspaces"] == ["me"]
```

(in place of `== []` twice).

In `backend/apps/accounts/tests/test_administration.py`:

```python
    # test_assigning_and_removing_a_role_are_audited, after the role is assigned
    assert roles_of(owner) == {Role.EXEC, Role.EMPLOYEE}
```

```python
    # the same test, after the role is removed
    assert roles_of(owner) == {Role.EMPLOYEE}
```

```python
    # test_executive_management_combines_with_either
    assert roles_of(world.hr_user) == {Role.HR, Role.EXEC, Role.EMPLOYEE}
```

(in place of `{Role.EXEC}`, `frozenset()` and `{Role.HR, Role.EXEC}`, in that order).

In `backend/apps/accounts/tests/test_accounts_api.py`:

```python
    # test_the_list_shows_every_account_with_its_state_and_roles
        "roles": ["employee", "hr"],

    # test_the_detail_shows_who_gave_each_role_and_the_recent_security_events
    assert body["roles"] == ["employee", "exec"]
```

Run: `docker compose run --rm app pytest apps/accounts apps/core apps/audit apps/settings apps/notifications tests -q`
Expected: all pass. If another assertion of plan 01a still fails here, it is of the same kind (the complete roles or workspaces of a cast account): add `employee` and `me`, plus `manager` and `team` for `manager_user`, `other_manager_user` and `exec_user`. Anything else that fails is a defect of this task.

- [ ] **Step 9: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no warning from drf-spectacular; `backend/openapi.yaml` gains `/api/v1/employees`, `/api/v1/employees/directory`, `/api/v1/employees/me`, `/api/v1/employees/{public_id}` and the component `EmployeeDetail` with a `oneOf` of `EmployeeOut` and `EmployeeTeamOut`. If spectacular rejects `resource_type_field_name=None`, upgrade it to the current release in `backend/pyproject.toml` (the argument has accepted `None` since 0.22) and run `uv lock`.

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass (15 in `test_reach.py`, 20 in `test_employees_api.py`, the new matrix cases)

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 10: Commit**

```bash
git add backend/apps/organisation backend/apps/accounts/tests backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): reach, derived roles and the employees API"
```

### Task 5: Linking accounts to employees

Implements the `EmployeeDirectory` port of `accounts`, so that an account can be created for an employee, the Administration status page lists employees without an account, and `auth/me` names the employee behind the session.

**Files:**
- Create: `backend/apps/organisation/directory.py`
- Modify: `backend/apps/organisation/apps.py` (replace the whole file)
- Modify: `backend/apps/accounts/tests/test_session_api.py`, `backend/apps/accounts/tests/test_accounts_api.py` (two assertions of plan 01a that said a cast account has no employee record)
- Test: `backend/apps/organisation/tests/test_account_link.py`

**Interfaces:**
- Consumes: `apps.accounts.ports.EmployeeRef(public_id: str, full_name: str, email: str)`, `apps.accounts.ports.set_employee_directory`, `apps.accounts.ports.employee_directory`, `accounts_services.create_account(*, actor, email="", full_name="", employee_public_id=None, roles=()) -> tuple[User, str]`, routes `accounts:account-candidates`, `accounts:account-list`, `accounts:me`, `core:admin-status`.
- Produces: `apps.organisation.directory.OrganisationDirectory` with `candidate(public_id) -> EmployeeRef | None` (None for an unknown or departed employee; raises `Conflict("accounts.employee_has_account", field="employee")` for one who already has an account, as plan 01a's contract note 26 allows), `candidates() -> list[EmployeeRef]`, `link(*, user_id, public_id) -> None` (raises the same `Conflict` when the employee was linked in the meantime), `ref_for_user(user_id) -> EmployeeRef | None`; registered at start-up.

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_account_link.py`

```python
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts import services as accounts_services
from apps.accounts.ports import employee_directory
from apps.accounts.roles import Role, roles_of
from apps.core.errors import Conflict
from apps.organisation.models import Employee, EmployeeStatus
from apps.organisation.tests.world import make_employee

pytestmark = pytest.mark.django_db
User = get_user_model()

NOUR = "nour.nouvelle@impactrisks.com"


@pytest.fixture
def newcomer(world):
    return make_employee(number="E100", first_name="Nour", last_name="Nouvelle", department=world.dept_a,
                         position=world.position, manager=world.manager)


def test_the_directory_offers_only_employees_without_an_account(world, newcomer):
    directory = employee_directory()

    refs = directory.candidates()

    assert [(ref.public_id, ref.full_name, ref.email) for ref in refs] == [
        (str(newcomer.public_id), "Nour Nouvelle", NOUR)
    ]
    assert directory.candidate(str(newcomer.public_id)) == refs[0]
    assert directory.candidate("not-an-identifier") is None
    assert directory.candidate("0f0e0d0c-0000-4000-8000-000000000001") is None
    with pytest.raises(Conflict) as error:
        directory.candidate(str(world.owner.public_id))
    assert error.value.code == "accounts.employee_has_account"


def test_people_who_left_are_not_candidates(world, newcomer):
    Employee.objects.filter(pk=newcomer.pk).update(status=EmployeeStatus.ARCHIVED)

    assert employee_directory().candidates() == []
    assert employee_directory().candidate(str(newcomer.public_id)) is None


def test_ref_for_user(world):
    ref = employee_directory().ref_for_user(world.owner_user.id)

    assert (ref.public_id, ref.full_name, ref.email) == (
        str(world.owner.public_id), "Amal Employee", world.owner.professional_email
    )
    assert employee_directory().ref_for_user(world.sysadmin_user.id) is None


def test_link_attaches_an_account_once(world, newcomer):
    directory = employee_directory()

    directory.link(user_id=world.sysadmin_user.id, public_id=str(newcomer.public_id))

    newcomer.refresh_from_db()
    assert newcomer.user == world.sysadmin_user
    with pytest.raises(Conflict) as error:
        directory.link(user_id=world.sysadmin_user.id, public_id=str(newcomer.public_id))
    assert error.value.code == "accounts.employee_has_account"


def test_an_account_is_created_for_an_employee(world, newcomer):
    user, temporary_password = accounts_services.create_account(
        actor=world.sysadmin_user, employee_public_id=str(newcomer.public_id)
    )

    newcomer.refresh_from_db()
    assert newcomer.user_id == user.id
    assert user.email == NOUR
    assert temporary_password
    assert Role.EMPLOYEE in roles_of(User.objects.get(pk=user.pk))


def test_the_administrator_sees_candidates_and_the_status_page_counts_them(world, newcomer, client_for):
    client = client_for(world.sysadmin_user)

    candidates = client.get(reverse("accounts:account-candidates")).json()
    status = client.get(reverse("core:admin-status")).json()

    assert candidates == [{"public_id": str(newcomer.public_id), "full_name": "Nour Nouvelle", "email": NOUR}]
    assert [row["email"] for row in status["accounts"]["employees_without_account"]] == [NOUR]


def test_creating_the_account_through_the_api_links_it(world, newcomer, client_for):
    client = client_for(world.sysadmin_user)

    response = client.post(
        reverse("accounts:account-list"), {"employee": str(newcomer.public_id), "roles": []}, format="json"
    )

    assert response.status_code == 201
    assert response.json()["account"]["email"] == NOUR
    assert response.json()["account"]["has_employee"] is True
    assert client.get(reverse("accounts:account-candidates")).json() == []


def test_me_names_the_employee_and_the_workspaces(world, client_for):
    owner = client_for(world.owner_user).get(reverse("accounts:me")).json()
    manager = client_for(world.manager_user).get(reverse("accounts:me")).json()

    assert owner["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
    assert owner["name"] == "Amal Employee"
    assert set(owner["workspaces"]) == {"me"}
    assert set(manager["workspaces"]) == {"me", "team"}
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_account_link.py -v`
Expected: `test_me_names_the_employee_and_the_workspaces` may already pass on workspaces alone; the others fail because the null directory of plan 01a returns no candidate (`assert [] == [(...)]`, `accounts.employee_unknown`, `AttributeError: 'NoneType' object has no attribute 'public_id'`)

- [ ] **Step 3: Write the directory and register it**

`backend/apps/organisation/directory.py`

```python
"""The organisation side of the accounts port: accounts never read employee tables themselves."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import QuerySet

from apps.accounts.ports import EmployeeRef
from apps.core.errors import Conflict

from .models import Employee, EmployeeStatus
from .selectors import full_name


def _ref(employee: Employee) -> EmployeeRef:
    return EmployeeRef(
        public_id=str(employee.public_id), full_name=full_name(employee), email=employee.professional_email
    )


class OrganisationDirectory:
    def _without_account(self) -> QuerySet[Employee]:
        return Employee.objects.filter(user__isnull=True).exclude(status=EmployeeStatus.ARCHIVED)

    def candidate(self, public_id: str) -> EmployeeRef | None:
        try:
            employee = Employee.objects.exclude(status=EmployeeStatus.ARCHIVED).get(public_id=public_id)
        except (Employee.DoesNotExist, ValidationError, ValueError):
            return None
        if employee.user_id is not None:
            # Saying so is more useful to the administrator than "unknown employee".
            raise Conflict("accounts.employee_has_account", field="employee")
        return _ref(employee)

    def candidates(self) -> list[EmployeeRef]:
        return [_ref(employee) for employee in self._without_account().order_by("last_name", "first_name")]

    def link(self, *, user_id: int, public_id: str) -> None:
        try:
            updated = Employee.objects.filter(public_id=public_id, user__isnull=True).update(user_id=user_id)
        except (ValidationError, ValueError):
            updated = 0
        if not updated:
            raise Conflict("accounts.employee_has_account", field="employee")

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        employee = Employee.objects.filter(user_id=user_id).first()
        return _ref(employee) if employee is not None else None
```

Replace `backend/apps/organisation/apps.py` with:

```python
from django.apps import AppConfig


class OrganisationConfig(AppConfig):
    name = "apps.organisation"
    label = "organisation"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.accounts.ports import set_employee_directory
        from apps.accounts.roles import register_derived_role_provider
        from apps.core.i18n import register_messages

        from . import reach
        from .directory import OrganisationDirectory
        from .messages import MESSAGES

        register_messages(MESSAGES)
        register_derived_role_provider(reach.derived_roles)
        set_employee_directory(OrganisationDirectory())
```

- [ ] **Step 4: Correct the two step-1 assertions that said a cast account has no employee record**

In `backend/apps/accounts/tests/test_session_api.py`, in `test_signing_in_returns_the_user_and_opens_a_browser_session`, replace `assert body["employee"] is None` with:

```python
    assert body["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
```

In `backend/apps/accounts/tests/test_accounts_api.py`, in `test_the_list_shows_every_account_with_its_state_and_roles`, replace `"has_employee": False,` with:

```python
        "has_employee": True,
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_account_link.py apps/accounts apps/core -q`
Expected: 8 passed in `test_account_link.py`; the tests of plan 01a pass. If another of them still expects a cast account without an employee record, it was written before the cast had employees: point it at `world.sysadmin_user`, the one account that stays without a record.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/organisation backend/apps/accounts/tests
git commit -m "feat(organisation): link accounts to employee records"
```

### Task 6: Delegation

A manager names a delegate for a date range; during it the delegate acts as the manager and sees the manager's team. HR does the same for any manager.

**Files:**
- Create: `backend/apps/organisation/services/delegations.py`, `backend/apps/organisation/tasks.py`
- Create: `backend/apps/organisation/migrations/0002_delegation.py` (generated)
- Modify: `backend/apps/organisation/models.py` (append one model)
- Modify: `backend/apps/organisation/reach.py` (replace the import block and `acting_for`)
- Modify: `backend/apps/organisation/selectors.py` (replace the import block, append functions)
- Modify: `backend/apps/organisation/services/__init__.py`, `backend/apps/organisation/apps.py`, `backend/apps/organisation/api/urls.py` (replace the whole files)
- Modify: `backend/apps/organisation/api/serializers.py`, `backend/apps/organisation/api/views.py` (append; one import line changes in `views.py`)
- Modify: `backend/apps/organisation/tests/world.py`, `backend/apps/organisation/tests/matrix.py` (append)
- Test: `backend/apps/organisation/tests/test_delegations.py`

**Interfaces:**
- Consumes: `notifications.register_event(code, *, link)`, `notifications.notify(*, users, event, params, target_type, target_public_id, dedupe_key) -> list[Notification]`, `recorded`, `RETRY`, `reach`, `selectors.direct_reports`, `selectors._usable_account`.
- Produces:
  - Model `Delegation(public_id, manager, delegate, start_date, end_date, created_by, created_at, ended_at)` and `Delegation.active_on(day) -> Q`
  - `services.create_delegation(*, actor: User | None, manager: Employee, delegate: Employee, start_date: date, end_date: date, today: date | None = None) -> Delegation`
  - `services.end_delegation(*, actor: User | None, delegation: Delegation, today: date | None = None) -> Delegation` (ends a running one at once, cancels an upcoming one, does nothing to one already over)
  - `apps.organisation.services.delegations.close_delegation(*, actor, delegation: Delegation, today: date) -> Delegation` (the same without the rights check, for use inside the package; Task 7 calls it when someone leaves)
  - `services.announce_delegation_transitions(*, today: date | None = None) -> int` (number of notifications created; 0 on a second run)
  - `reach.acting_for(employee_id, *, on=None)` now includes managers who delegated to the employee on that day. Delegation is not passed on: a delegate's own delegate does not inherit it.
  - `selectors.active_delegations(*, manager=None, delegate=None, on=None) -> QuerySet[Delegation]`
  - `selectors.acting_users_for_manager(manager: Employee, *, on: date | None = None, excluding_employee_id: int | None = None) -> list[User]` (the manager first, then delegates; only people with a usable account)
  - `selectors.delegation_state(delegation, *, today=None) -> str` (`upcoming`, `active`, `ended`, `cancelled`), `selectors.delegations_for(user, *, scope="mine", manager_public_id=None)`, `selectors.get_delegation_for(user, public_id)`
  - Routes `organisation:delegation-list`, `organisation:delegation-end`
  - `DelegationOut`: `{public_id, manager: {public_id, name}, delegate: {public_id, name}, start_date, end_date, state, direction, can_end, created_at}`; `direction` is `given`, `received` or null. `POST delegations` takes `{manager?, delegate, start_date, end_date}` (public ids; `manager` defaults to the caller). `GET delegations` takes `scope` (`mine` default, `all` for HR) and `manager`.
  - Notification events `delegation.started`, `delegation.ended`; job `organisation.delegation_transitions` (daily at 06:00 Tunis time, cron `0 5 * * *` in UTC)
  - Problems: `organisation.delegation_dates` (field `start_date` or `end_date`), `organisation.delegation_self` and `organisation.delegation_delegate_inactive` (field `delegate`), `organisation.delegation_not_manager` (field `manager`), `organisation.delegation_overlap` (field `start_date`)
  - Test builder `make_delegation(w, *, manager=None, delegate=None, start=None, days=5)`

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_delegations.py`

```python
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts.roles import Role, roles_of
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.organisation import reach, selectors, services
from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db
User = get_user_model()

TUNIS = ZoneInfo("Africa/Tunis")
MONDAY = date(2026, 11, 2)
FRIDAY = date(2026, 11, 6)


def _at(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 9, 0, tzinfo=TUNIS)


@pytest.fixture(autouse=True)
def _it_is_monday_morning():
    with time_machine.travel(_at(MONDAY), tick=False):
        yield


def _delegate(world, *, actor=None, manager=None, delegate=None, start=MONDAY, end=FRIDAY):
    return services.create_delegation(
        actor=actor or world.manager_user,
        manager=manager or world.manager,
        delegate=delegate or world.other_manager,
        start_date=start,
        end_date=end,
    )


def _events(code):
    return Notification.objects.filter(event_code=code)


def test_a_manager_names_a_delegate_starting_today(world):
    delegation = _delegate(world)

    assert selectors.delegation_state(delegation) == "active"
    assert reach.acting_for(world.other_manager.id) == {world.other_manager.id, world.manager.id}
    assert reach.team_ids(world.other_manager_user) == {world.outsider.id, world.owner.id, world.peer.id}
    assert reach.can_see_employee(world.other_manager_user, world.owner) is True
    event = AuditEvent.objects.get(action="delegation.created")
    assert event.object_id == str(delegation.public_id)
    assert event.object_label == "Mounir Manager → Nadia Manager"
    assert {n.user for n in _events("delegation.started")} == {world.manager_user, world.other_manager_user}


def test_the_delegate_sees_the_team_only_during_the_period(world):
    _delegate(world)

    assert reach.team_ids(world.other_manager_user, on=FRIDAY) >= {world.owner.id, world.peer.id}
    assert reach.team_ids(world.other_manager_user, on=FRIDAY + timedelta(days=1)) == {world.outsider.id}
    assert reach.acting_for(world.other_manager.id, on=MONDAY - timedelta(days=1)) == {world.other_manager.id}


def test_someone_who_manages_nobody_becomes_a_manager_for_the_period(world):
    _delegate(world, delegate=world.outsider)

    assert Role.MANAGER in roles_of(User.objects.get(pk=world.outsider_user.pk))
    with time_machine.travel(_at(FRIDAY + timedelta(days=3)), tick=False):
        assert Role.MANAGER not in roles_of(User.objects.get(pk=world.outsider_user.pk))


def test_a_delegate_from_the_team_does_not_manage_themselves(world):
    _delegate(world, delegate=world.peer)

    assert reach.team_ids(world.peer_user) == {world.owner.id}


def test_delegation_is_not_passed_on(world):
    _delegate(world)
    _delegate(world, actor=world.other_manager_user, manager=world.other_manager, delegate=world.outsider)

    assert reach.acting_for(world.outsider.id) == {world.outsider.id, world.other_manager.id}


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"delegate": "manager"}, "delegate", "organisation.delegation_self"),
        ({"start": MONDAY - timedelta(days=1)}, "start_date", "organisation.delegation_dates"),
        ({"end": MONDAY - timedelta(days=1)}, "end_date", "organisation.delegation_dates"),
        ({"manager": "owner", "actor": "hr_user"}, "manager", "organisation.delegation_not_manager"),
    ],
)
def test_delegation_rules(world, overrides, field, code):
    arguments = {key: getattr(world, value) if isinstance(value, str) else value for key, value in overrides.items()}

    with pytest.raises(DomainError) as error:
        _delegate(world, **arguments)

    assert [(problem.field, problem.code) for problem in error.value.problems] == [(field, code)]


def test_the_delegate_must_be_active(world):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.SUSPENDED)
    world.peer.refresh_from_db()

    with pytest.raises(DomainError) as error:
        _delegate(world, delegate=world.peer)

    assert error.value.code == "organisation.delegation_delegate_inactive"


def test_two_delegations_of_one_manager_cannot_overlap(world):
    _delegate(world)

    with pytest.raises(DomainError) as error:
        _delegate(world, delegate=world.peer, start=FRIDAY, end=FRIDAY + timedelta(days=3))

    assert [(problem.field, problem.code) for problem in error.value.problems] == [
        ("start_date", "organisation.delegation_overlap")
    ]
    _delegate(world, delegate=world.peer, start=FRIDAY + timedelta(days=1), end=FRIDAY + timedelta(days=3))


def test_only_the_manager_or_hr_names_a_delegate(world):
    with pytest.raises(NotAllowed):
        _delegate(world, actor=world.other_manager_user)
    with pytest.raises(NotAllowed):
        _delegate(world, actor=world.owner_user)

    delegation = _delegate(world, actor=world.hr_user)
    assert delegation.created_by == world.hr_user


def test_ending_a_running_delegation_takes_effect_at_once(world):
    delegation = _delegate(world)

    delegation = services.end_delegation(actor=world.manager_user, delegation=delegation)
    services.end_delegation(actor=world.manager_user, delegation=delegation)

    assert selectors.delegation_state(delegation) == "ended"
    assert reach.acting_for(world.other_manager.id) == {world.other_manager.id}
    assert AuditEvent.objects.filter(action="delegation.ended").count() == 1
    assert {n.user for n in _events("delegation.ended")} == {world.manager_user, world.other_manager_user}


def test_cancelling_an_upcoming_delegation_tells_nobody(world):
    delegation = _delegate(world, start=MONDAY + timedelta(days=7), end=MONDAY + timedelta(days=11))

    delegation = services.end_delegation(actor=world.hr_user, delegation=delegation)

    assert selectors.delegation_state(delegation) == "cancelled"
    assert AuditEvent.objects.filter(action="delegation.cancelled").count() == 1
    assert Notification.objects.filter(event_code__startswith="delegation.").count() == 0


def test_an_ended_delegation_frees_its_dates(world):
    services.end_delegation(actor=world.manager_user, delegation=_delegate(world))

    replacement = _delegate(world, delegate=world.peer)

    assert selectors.delegation_state(replacement) == "active"


def test_only_the_manager_or_hr_ends_a_delegation(world):
    delegation = _delegate(world)

    with pytest.raises(NotAllowed):
        services.end_delegation(actor=world.other_manager_user, delegation=delegation)


def test_the_daily_job_announces_each_start_and_end_once(world):
    tuesday, wednesday = MONDAY + timedelta(days=1), MONDAY + timedelta(days=2)
    _delegate(world, start=tuesday, end=wednesday)
    assert services.announce_delegation_transitions() == 0

    with time_machine.travel(_at(tuesday), tick=False):
        assert services.announce_delegation_transitions() == 2
        assert services.announce_delegation_transitions() == 0
    with time_machine.travel(_at(wednesday + timedelta(days=1)), tick=False):
        assert services.announce_delegation_transitions() == 2
        assert services.announce_delegation_transitions() == 0

    assert _events("delegation.started").count() == 2
    assert _events("delegation.ended").count() == 2


def test_who_can_act_for_a_manager(world):
    _delegate(world)
    manager = selectors.get_employee(world.manager.public_id)

    assert selectors.acting_users_for_manager(manager) == [world.manager_user, world.other_manager_user]
    assert selectors.acting_users_for_manager(manager, excluding_employee_id=world.other_manager.id) == [
        world.manager_user
    ]
    assert selectors.acting_users_for_manager(manager, on=FRIDAY + timedelta(days=1)) == [world.manager_user]
    assert selectors.manager_user(world.owner) == world.manager_user


def test_a_manager_who_cannot_sign_in_cannot_act(world):
    User.objects.filter(pk=world.manager_user.pk).update(is_active=False)
    _delegate(world, actor=world.hr_user)
    manager = selectors.get_employee(world.manager.public_id)
    owner = selectors.get_employee(world.owner.public_id)

    assert selectors.acting_users_for_manager(manager) == [world.other_manager_user]
    assert selectors.manager_user(owner) is None


def test_my_delegations_are_listed_with_their_direction(world, client_for):
    _delegate(world)
    url = reverse("organisation:delegation-list")

    given = client_for(world.manager_user).get(url).json()["results"][0]
    received = client_for(world.other_manager_user).get(url).json()["results"][0]

    assert (given["direction"], given["state"], given["can_end"]) == ("given", "active", True)
    assert given["delegate"] == {"public_id": str(world.other_manager.public_id), "name": "Nadia Manager"}
    assert (given["start_date"], given["end_date"]) == ("2026-11-02", "2026-11-06")
    assert (received["direction"], received["can_end"]) == ("received", False)


def test_a_manager_names_a_delegate_through_the_api(world, client_for):
    response = client_for(world.manager_user).post(
        reverse("organisation:delegation-list"),
        {"delegate": str(world.peer.public_id), "start_date": "2026-11-09", "end_date": "2026-11-13"},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["manager"]["name"] == "Mounir Manager"
    assert response.json()["state"] == "upcoming"


def test_hr_names_lists_and_ends_a_delegation_for_any_manager(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("organisation:delegation-list"),
        {
            "manager": str(world.manager.public_id),
            "delegate": str(world.peer.public_id),
            "start_date": "2026-11-02",
            "end_date": "2026-11-06",
        },
        format="json",
    )
    assert created.status_code == 201

    listed = client.get(
        reverse("organisation:delegation-list"), {"scope": "all", "manager": str(world.manager.public_id)}
    ).json()
    assert [row["public_id"] for row in listed["results"]] == [created.json()["public_id"]]
    assert listed["results"][0]["can_end"] is True

    url = reverse("organisation:delegation-end", kwargs={"public_id": created.json()["public_id"]})
    ended = client.post(url, {}, format="json")
    assert (ended.status_code, ended.json()["state"], ended.json()["can_end"]) == (200, "ended", False)


def test_delegation_refusals_through_the_api(world, client_for):
    delegation = _delegate(world)
    list_url = reverse("organisation:delegation-list")
    end_url = reverse("organisation:delegation-end", kwargs={"public_id": delegation.public_id})
    body = {"delegate": str(world.peer.public_id), "start_date": "2026-11-04", "end_date": "2026-11-05"}

    assert client_for(world.owner_user).post(list_url, body, format="json").status_code == 403
    assert client_for(world.manager_user).get(list_url, {"scope": "all"}).status_code == 403
    assert client_for(world.exec_user).post(end_url, {}, format="json").status_code == 404

    overlap = client_for(world.manager_user).post(list_url, body, format="json")
    assert overlap.status_code == 400
    assert overlap.json()["code"] == "organisation.delegation_overlap"
    assert overlap.json()["errors"][0]["field"] == "start_date"

    malformed = client_for(world.manager_user).post(list_url, {**body, "delegate": "nobody"}, format="json")
    assert malformed.status_code == 400
    assert malformed.json()["errors"][0]["field"] == "delegate"
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_delegations.py -v`
Expected: 23 failures, `AttributeError: module 'apps.organisation.services' has no attribute 'create_delegation'`

- [ ] **Step 3: Add the model**

Append to `backend/apps/organisation/models.py`:

```python
class Delegation(PublicIdModel):
    manager = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="delegations_given")
    delegate = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="delegations_received")
    start_date = models.DateField()
    end_date = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Set when the delegation was ended early, or cancelled before it started.
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-start_date", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("start_date")), name="delegation_dates_in_order"
            ),
            models.CheckConstraint(
                condition=~models.Q(manager=models.F("delegate")), name="delegation_not_to_self"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.manager_id} -> {self.delegate_id} ({self.start_date} to {self.end_date})"

    @staticmethod
    def active_on(day) -> models.Q:
        """Delegations in force on a day. One ended early stops counting on the day it was ended."""
        in_range = models.Q(start_date__lte=day, end_date__gte=day)
        not_ended = models.Q(ended_at__isnull=True) | models.Q(ended_at__date__gt=day)
        return in_range & not_ended
```

Run: `docker compose run --rm app python manage.py makemigrations organisation -n delegation`
Expected: `apps/organisation/migrations/0002_delegation.py - Create model Delegation`

- [ ] **Step 4: Make reach and the selectors aware of delegation**

In `backend/apps/organisation/reach.py`, replace the import block and the function `acting_for` with:

```python
from __future__ import annotations

from datetime import date

from django.utils import timezone

from apps.accounts.roles import Role, has_role

from .models import Delegation, Employee, EmployeeStatus
```

```python
def acting_for(employee_id: int, *, on: date | None = None) -> set[int]:
    """The managers this employee acts as on a day: themselves, plus whoever delegated to them.

    Delegation is not passed on: only delegations given directly to this employee count.
    """
    on = on or timezone.localdate()
    delegators = Delegation.objects.filter(Delegation.active_on(on), delegate_id=employee_id).values_list(
        "manager_id", flat=True
    )
    return {employee_id, *delegators}
```

In `backend/apps/organisation/selectors.py`, replace the import block at the top with:

```python
from __future__ import annotations

from datetime import date

from django.core.exceptions import ValidationError
from django.db.models import Count, Q, QuerySet, Value
from django.db.models.functions import Concat
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.core.errors import NotAllowed, NotFound

from . import reach
from .models import Delegation, Department, Employee, EmployeeStatus, Position
```

Append at the end of the file:

```python
# --- Delegations ---------------------------------------------------------------------------


def active_delegations(*, manager: Employee | None = None, delegate: Employee | None = None,
                       on: date | None = None) -> QuerySet[Delegation]:
    on = on or timezone.localdate()
    queryset = Delegation.objects.filter(Delegation.active_on(on)).select_related(
        "manager__user", "delegate__user"
    )
    if manager is not None:
        queryset = queryset.filter(manager=manager)
    if delegate is not None:
        queryset = queryset.filter(delegate=delegate)
    return queryset


def acting_users_for_manager(manager: Employee, *, on: date | None = None,
                             excluding_employee_id: int | None = None) -> list:
    """The accounts that can act on a manager's steps: the manager first, then the delegates of the day."""
    people = [manager, *(delegation.delegate for delegation in active_delegations(manager=manager, on=on))]
    users = []
    for person in people:
        if person.id == excluding_employee_id:
            continue
        user = _usable_account(person)
        if user is not None and user not in users:
            users.append(user)
    return users


def delegation_state(delegation: Delegation, *, today: date | None = None) -> str:
    today = today or timezone.localdate()
    if delegation.ended_at is not None:
        ended_on = timezone.localdate(delegation.ended_at)
        return "cancelled" if ended_on < delegation.start_date else "ended"
    if today < delegation.start_date:
        return "upcoming"
    if today > delegation.end_date:
        return "ended"
    return "active"


def delegations_for(user, *, scope: str = "mine", manager_public_id=None) -> QuerySet[Delegation]:
    """`mine`: given or received by the user. `all`: every delegation, for HR."""
    queryset = Delegation.objects.select_related("manager", "delegate")
    if scope == "all":
        if not has_role(user, Role.HR):
            raise NotAllowed()
    else:
        own = reach.employee_of(user)
        if own is None:
            return queryset.none()
        queryset = queryset.filter(Q(manager=own) | Q(delegate=own))
    if manager_public_id:
        queryset = queryset.filter(manager__public_id=manager_public_id)
    return queryset.order_by("-start_date", "-id")


def get_delegation_for(user, public_id) -> Delegation:
    """A delegation the user may end: one they gave, or any for HR."""
    try:
        delegation = Delegation.objects.select_related("manager", "delegate").get(public_id=public_id)
    except (Delegation.DoesNotExist, ValidationError, ValueError):
        raise NotFound() from None
    if has_role(user, Role.HR):
        return delegation
    own = reach.employee_of(user)
    if own is None or own.id != delegation.manager_id:
        raise NotFound()
    return delegation
```

- [ ] **Step 5: Write the services, the job and the registrations**

`backend/apps/organisation/services/delegations.py`

```python
from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import DomainError, NotAllowed, Problem
from apps.notifications import services as notifications

from .. import reach
from ..models import Delegation, Employee, EmployeeStatus
from ..selectors import direct_reports, full_name

# An end that the daily job missed for longer than this is no longer announced.
_ANNOUNCE_ENDS_FOR_DAYS = 7


def _label(delegation: Delegation) -> str:
    return f"{full_name(delegation.manager)} → {full_name(delegation.delegate)}"


def _may_manage(actor, manager: Employee) -> bool:
    """The system and HR act for any manager; anyone else only for themselves."""
    if actor is None or has_role(actor, Role.HR):
        return True
    own = reach.employee_of(actor)
    return own is not None and own.id == manager.id


def _announce(delegation: Delegation, kind: str) -> int:
    people = (delegation.manager, delegation.delegate)
    users = [person.user for person in people if person.user_id is not None and person.user.is_active]
    created = notifications.notify(
        users=users,
        event=f"delegation.{kind}",
        params={
            "manager": full_name(delegation.manager),
            "delegate": full_name(delegation.delegate),
            "start": delegation.start_date.strftime("%d/%m/%Y"),
            "end": delegation.end_date.strftime("%d/%m/%Y"),
        },
        target_type="delegation",
        target_public_id=str(delegation.public_id),
        dedupe_key=f"delegation:{delegation.public_id}:{kind}",
    )
    return len(created)


@transaction.atomic
def create_delegation(*, actor, manager: Employee, delegate: Employee, start_date: date, end_date: date,
                      today: date | None = None) -> Delegation:
    today = today or timezone.localdate()
    if not _may_manage(actor, manager):
        raise NotAllowed()

    problems: list[Problem] = []
    if start_date < today:
        problems.append(Problem("organisation.delegation_dates", "start_date"))
    elif end_date < start_date:
        problems.append(Problem("organisation.delegation_dates", "end_date"))
    if delegate.pk == manager.pk:
        problems.append(Problem("organisation.delegation_self", "delegate"))
    elif delegate.status != EmployeeStatus.ACTIVE:
        problems.append(Problem("organisation.delegation_delegate_inactive", "delegate"))
    if manager.status == EmployeeStatus.ARCHIVED or not direct_reports(manager).exists():
        problems.append(Problem("organisation.delegation_not_manager", "manager"))
    if not problems:
        overlapping = Delegation.objects.filter(
            manager=manager, ended_at__isnull=True, start_date__lte=end_date, end_date__gte=start_date
        )
        if overlapping.exists():
            problems.append(Problem("organisation.delegation_overlap", "start_date"))
    if problems:
        raise DomainError(problems[0].code, problems=problems)

    delegation = Delegation.objects.create(
        manager=manager, delegate=delegate, start_date=start_date, end_date=end_date, created_by=actor
    )
    audit.record(
        action="delegation.created",
        obj=delegation,
        actor=actor,
        object_label=_label(delegation),
        changes={
            "start_date": {"before": None, "after": start_date.isoformat()},
            "end_date": {"before": None, "after": end_date.isoformat()},
        },
    )
    if start_date <= today:
        _announce(delegation, "started")
    return delegation


@transaction.atomic
def close_delegation(*, actor, delegation: Delegation, today: date) -> Delegation:
    """Ends a running delegation or cancels an upcoming one, without asking who the actor is.

    For use inside this package (ending on request, ending on departure); callers check rights first.
    """
    delegation = (
        Delegation.objects.select_for_update(of=("self",))
        .select_related("manager__user", "delegate__user")
        .get(pk=delegation.pk)
    )
    if delegation.ended_at is not None or delegation.end_date < today:
        return delegation  # already over
    started = delegation.start_date <= today
    delegation.ended_at = timezone.now()
    delegation.save(update_fields=["ended_at"])
    audit.record(
        action="delegation.ended" if started else "delegation.cancelled",
        obj=delegation,
        actor=actor,
        object_label=_label(delegation),
    )
    if started:
        _announce(delegation, "ended")
    return delegation


@transaction.atomic
def end_delegation(*, actor, delegation: Delegation, today: date | None = None) -> Delegation:
    if not _may_manage(actor, delegation.manager):
        raise NotAllowed()
    return close_delegation(actor=actor, delegation=delegation, today=today or timezone.localdate())


@transaction.atomic
def announce_delegation_transitions(*, today: date | None = None) -> int:
    """Tells manager and delegate when a delegation starts and when it runs out. Safe to run any number of times."""
    today = today or timezone.localdate()
    open_ones = Delegation.objects.filter(ended_at__isnull=True).select_related("manager__user", "delegate__user")
    created = 0
    for delegation in open_ones.filter(start_date__lte=today, end_date__gte=today):
        created += _announce(delegation, "started")
    recently = today - timedelta(days=_ANNOUNCE_ENDS_FOR_DAYS)
    for delegation in open_ones.filter(end_date__lt=today, end_date__gte=recently):
        created += _announce(delegation, "ended")
    return created
```

`backend/apps/organisation/tasks.py`

```python
from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


@app.periodic(cron="0 5 * * *")  # 06:00 in Africa/Tunis: Procrastinate reads cron expressions in UTC
@app.task(
    name="organisation.delegation_transitions",
    retry=RETRY,
    queueing_lock="organisation.delegation_transitions",
)
@recorded("organisation.delegation_transitions")
def delegation_transitions(timestamp: int) -> dict[str, int]:
    return {"notifications": services.announce_delegation_transitions()}
```

Replace `backend/apps/organisation/services/__init__.py` with:

```python
from .delegations import announce_delegation_transitions, create_delegation, end_delegation
from .employees import create_employee, update_employee
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "announce_delegation_transitions",
    "create_delegation",
    "create_department",
    "create_employee",
    "create_position",
    "end_delegation",
    "set_department_active",
    "set_position_active",
    "update_department",
    "update_employee",
    "update_position",
]
```

Replace `backend/apps/organisation/apps.py` with:

```python
from django.apps import AppConfig


class OrganisationConfig(AppConfig):
    name = "apps.organisation"
    label = "organisation"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from apps.accounts.ports import set_employee_directory
        from apps.accounts.roles import register_derived_role_provider
        from apps.core.i18n import register_messages
        from apps.notifications import services as notifications

        from . import reach
        from .directory import OrganisationDirectory
        from .messages import MESSAGES

        register_messages(MESSAGES)
        register_derived_role_provider(reach.derived_roles)
        set_employee_directory(OrganisationDirectory())
        notifications.register_event("delegation.started", link="/team/delegations")
        notifications.register_event("delegation.ended", link="/team/delegations")
```

- [ ] **Step 6: Write the serializers, the views and the routes**

Append to `backend/apps/organisation/api/serializers.py`:

```python
# --- Delegations ---------------------------------------------------------------------------


class DelegationOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    manager = EmployeeRefOut()
    delegate = EmployeeRefOut()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    state = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    can_end = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()

    @extend_schema_field(serializers.CharField())
    def get_state(self, obj) -> str:
        return selectors.delegation_state(obj)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_direction(self, obj):
        own = reach.employee_of(self.context["request"].user)
        if own is None:
            return None
        if obj.manager_id == own.id:
            return "given"
        if obj.delegate_id == own.id:
            return "received"
        return None

    @extend_schema_field(serializers.BooleanField())
    def get_can_end(self, obj) -> bool:
        user = self.context["request"].user
        if selectors.delegation_state(obj) not in ("upcoming", "active"):
            return False
        own = reach.employee_of(user)
        return has_role(user, Role.HR) or (own is not None and own.id == obj.manager_id)


class DelegationIn(serializers.Serializer):
    manager = PublicIdRelatedField(queryset=Employee.objects.all(), required=False)
    delegate = PublicIdRelatedField(queryset=Employee.objects.all())
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class DelegationListQuery(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["mine", "all"], required=False)
    manager = serializers.UUIDField(required=False)
```

In `backend/apps/organisation/api/views.py`, change the line `from apps.core.errors import NotFound` to:

```python
from apps.core.errors import DomainError, NotFound
```

and append at the end of the file:

```python
# --- Delegations ---------------------------------------------------------------------------


class DelegationListView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR}, "POST": {Role.MANAGER, Role.HR}}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="delegations_list",
        parameters=[s.DelegationListQuery, *PAGE_PARAMETERS],
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
        return paginate(request, self, queryset, s.DelegationOut)

    @extend_schema(operation_id="delegations_create", request=s.DelegationIn, responses={201: s.DelegationOut})
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
```

Replace `backend/apps/organisation/api/urls.py` with:

```python
from django.urls import path

from . import views

app_name = "organisation"

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path("departments/<int:id>", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("positions", views.PositionListView.as_view(), name="position-list"),
    path("positions/<int:id>", views.PositionDetailView.as_view(), name="position-detail"),
    path("employees", views.EmployeeListView.as_view(), name="employee-list"),
    path("employees/directory", views.EmployeeDirectoryView.as_view(), name="employee-directory"),
    path("employees/me", views.EmployeeMeView.as_view(), name="employee-me"),
    path("employees/<uuid:public_id>", views.EmployeeDetailView.as_view(), name="employee-detail"),
    path("delegations", views.DelegationListView.as_view(), name="delegation-list"),
    path("delegations/<uuid:public_id>/end", views.DelegationEndView.as_view(), name="delegation-end"),
]
```

- [ ] **Step 7: Add the builder and the matrix cases**

Append to `backend/apps/organisation/tests/world.py` (and add `from datetime import timedelta`, `from django.utils import timezone` and `Delegation` to its imports):

```python
def make_delegation(w, *, manager: Employee | None = None, delegate: Employee | None = None,
                    start: date | None = None, days: int = 5) -> Delegation:
    """A delegation that starts in a month by default, so it changes nobody's reach today."""
    start = start or timezone.localdate() + timedelta(days=30)
    return Delegation.objects.create(
        manager=manager or w.manager,
        delegate=delegate or w.peer,
        start_date=start,
        end_date=start + timedelta(days=days - 1),
    )
```

In `backend/apps/organisation/tests/matrix.py`, add the import `from apps.organisation.tests.world import make_delegation` and append these cases inside `CASES`:

```python
    # Delegations
    Case(route="organisation:delegation-list", method="GET", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:delegation-list", method="POST", expect=only(*_MANAGERS, P.HR, P.EXEC)),
    Case(route="organisation:delegation-end", method="POST", label="a delegation the manager gave",
         expect=only(P.MANAGER, P.HR, hide=(P.OTHER_MANAGER, P.EXEC)),
         kwargs=lambda w: {"public_id": make_delegation(w).public_id}),
```

- [ ] **Step 8: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains `/api/v1/delegations` and `/api/v1/delegations/{public_id}/end`

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass (23 in `test_delegations.py`); the reach tests of Task 4 still pass

Run: `docker compose run --rm app python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup(); from procrastinate.contrib.django import app; print(sorted(app.tasks))"`
Expected: the printed list contains `organisation.delegation_transitions` next to the jobs of plan 01a. If it does not, the task module was not discovered: check that plan 01a's Procrastinate settings discover modules named `tasks` and that the decorators match the ones used in `apps/core/tasks.py`.

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 9: Commit**

```bash
git add backend/apps/organisation backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): delegation with reach, notifications and the daily transition job"
```

### Task 7: Recording a departure

Archiving never deletes. It marks the record, switches the account off, ends the leaver's delegations and tells HR, before confirming, what the departure leaves behind.

**Files:**
- Create: `backend/apps/organisation/services/archive.py`
- Modify: `backend/apps/organisation/services/__init__.py`, `backend/apps/organisation/api/urls.py` (replace the whole files)
- Modify: `backend/apps/organisation/api/serializers.py`, `backend/apps/organisation/api/views.py`, `backend/apps/organisation/tests/matrix.py` (append)
- Test: `backend/apps/organisation/tests/test_archive.py`

**Interfaces:**
- Consumes: `accounts_services.disable_account(*, actor, user) -> None`, `close_delegation`, `employee_state`, `selectors.direct_reports`, `selectors.get_employee`.
- Produces:
  - `services.ArchiveItem(label: str, link: str = "")`, `services.ArchiveSection(key: str, items: list[ArchiveItem])`, `services.ArchivePreview(has_account: bool, reports: list[ArchiveItem], sections: list[ArchiveSection])`
  - `services.register_archive_contributor(fn: Callable[[Employee], ArchiveSection | None]) -> None` (later plans add sections; a section that is `None` or empty is left out)
  - `services.archive_preview(*, employee: Employee) -> ArchivePreview` (this plan contributes the section `delegations`)
  - `services.archive_employee(*, actor: User, employee: Employee, leaving_date: date, reason: str) -> Employee` (raises `Conflict("organisation.already_archived")`)
  - Routes `organisation:employee-archive-preview` (GET), `organisation:employee-archive` (POST `{leaving_date, reason}`)
  - Audit action `employee.archived`

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_archive.py`

```python
from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict
from apps.organisation import reach, selectors, services
from apps.organisation.models import Employee, EmployeeStatus
from apps.organisation.services import archive
from apps.organisation.tests.world import make_delegation, make_employee

pytestmark = pytest.mark.django_db

LEAVING = date(2026, 11, 30)


def _leave(world, employee, reason="Resignation"):
    return services.archive_employee(actor=world.hr_user, employee=employee, leaving_date=LEAVING, reason=reason)


def test_the_preview_lists_what_the_departure_leaves_behind(world, monkeypatch):
    make_delegation(world, manager=world.manager, delegate=world.other_manager)
    monkeypatch.setattr(
        archive,
        "_contributors",
        [
            lambda employee: services.ArchiveSection(
                key="open_requests", items=[services.ArchiveItem(label="Annual leave", link="/requests/abc")]
            ),
            lambda employee: None,
            lambda employee: services.ArchiveSection(key="nothing", items=[]),
        ],
    )

    preview = services.archive_preview(employee=selectors.get_employee(world.manager.public_id))

    assert preview.has_account is True
    assert [item.label for item in preview.reports] == ["Amal Employee", "Bilel Employee"]
    assert preview.reports[0].link == f"/hr/employees/{world.owner.public_id}"
    assert [section.key for section in preview.sections] == ["delegations", "open_requests"]
    assert preview.sections[0].items[0].label.startswith("Mounir Manager → Nadia Manager, ")


def test_archiving_a_manager(world):
    today = timezone.localdate()
    running = services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=today, end_date=today + timedelta(days=4),
    )

    employee = _leave(world, world.manager, reason=" Resignation ")

    assert (employee.status, employee.archived_at, employee.archive_reason) == (
        EmployeeStatus.ARCHIVED, LEAVING, "Resignation"
    )
    world.manager_user.refresh_from_db()
    assert world.manager_user.is_active is False
    running.refresh_from_db()
    assert running.ended_at is not None
    assert reach.acting_for(world.other_manager.id) == {world.other_manager.id}
    # Nothing is deleted, and the reports keep pointing at the leaver until HR names a new manager.
    assert Employee.objects.filter(pk=world.manager.pk).exists()
    world.owner.refresh_from_db()
    assert world.owner.manager == world.manager
    event = AuditEvent.objects.get(action="employee.archived")
    assert event.object_id == str(world.manager.public_id)
    assert event.changes == {
        "status": {"before": "active", "after": "archived"},
        "archived_at": {"before": None, "after": "2026-11-30"},
        "archive_reason": {"before": "", "after": "Resignation"},
    }
    assert AuditEvent.objects.filter(action="delegation.ended").count() == 1


def test_archiving_twice_is_a_conflict(world):
    _leave(world, world.owner)

    with pytest.raises(Conflict) as error:
        _leave(world, world.owner)

    assert error.value.code == "organisation.already_archived"
    assert AuditEvent.objects.filter(action="employee.archived").count() == 1


def test_a_delegation_received_by_the_leaver_ends_too(world):
    today = timezone.localdate()
    received = services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=today, end_date=today + timedelta(days=4),
    )
    upcoming = make_delegation(world, manager=world.other_manager, delegate=world.hr)

    _leave(world, world.other_manager)

    received.refresh_from_db()
    upcoming.refresh_from_db()
    assert received.ended_at is not None
    assert selectors.delegation_state(upcoming) == "cancelled"


def test_someone_without_an_account_can_leave_too(world):
    newcomer = make_employee(number="E100", first_name="Nour", last_name="Nouvelle", department=world.dept_a,
                             position=world.position, manager=world.manager)

    assert _leave(world, newcomer, reason="End of contract").status == EmployeeStatus.ARCHIVED


def test_the_leaver_leaves_lists_and_teams_but_hr_still_finds_the_record(world, client_for):
    _leave(world, world.owner)
    hr = client_for(world.hr_user)
    list_url = reverse("organisation:employee-list")
    detail_url = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})

    assert world.owner.id not in reach.team_ids(world.manager_user)
    assert "E004" not in [row["employee_number"] for row in hr.get(list_url).json()["results"]]
    found = hr.get(list_url, {"status": "archived", "search": "amal"}).json()["results"]
    assert [row["employee_number"] for row in found] == ["E004"]
    assert hr.get(detail_url).json()["archived_at"] == "2026-11-30"
    assert client_for(world.manager_user).get(detail_url).status_code == 404


def test_archive_endpoints(world, client_for):
    client = client_for(world.hr_user)
    kwargs = {"public_id": world.manager.public_id}
    preview_url = reverse("organisation:employee-archive-preview", kwargs=kwargs)
    archive_url = reverse("organisation:employee-archive", kwargs=kwargs)

    preview = client.get(preview_url).json()
    assert preview == {
        "has_account": True,
        "reports": [
            {"label": "Amal Employee", "link": f"/hr/employees/{world.owner.public_id}"},
            {"label": "Bilel Employee", "link": f"/hr/employees/{world.peer.public_id}"},
        ],
        "sections": [],
    }

    without_reason = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": " "}, format="json")
    assert without_reason.status_code == 400
    assert without_reason.json()["errors"][0]["field"] == "reason"

    done = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": "Resignation"}, format="json")
    assert (done.status_code, done.json()["status"], done.json()["archived_at"]) == (200, "archived", "2026-11-30")

    again = client.post(archive_url, {"leaving_date": "2026-11-30", "reason": "Resignation"}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "organisation.already_archived")
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_archive.py -v`
Expected: collection error, `ImportError: cannot import name 'archive' from 'apps.organisation.services'`

- [ ] **Step 3: Write the service**

`backend/apps/organisation/services/archive.py`

```python
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.accounts import services as accounts_services
from apps.audit import services as audit
from apps.core.errors import Conflict

from ..models import Delegation, Employee, EmployeeStatus
from ..selectors import direct_reports, full_name
from .delegations import close_delegation
from .employees import employee_state


@dataclass(frozen=True)
class ArchiveItem:
    label: str
    link: str = ""


@dataclass(frozen=True)
class ArchiveSection:
    key: str
    items: list[ArchiveItem] = field(default_factory=list)


@dataclass(frozen=True)
class ArchivePreview:
    has_account: bool
    reports: list[ArchiveItem]
    sections: list[ArchiveSection]


_contributors: list[Callable[[Employee], ArchiveSection | None]] = []


def register_archive_contributor(fn: Callable[[Employee], ArchiveSection | None]) -> None:
    """Lets another app list what a departure would leave open (requests, steps to decide, …)."""
    _contributors.append(fn)


def _open_delegations(employee: Employee) -> QuerySet[Delegation]:
    return Delegation.objects.filter(
        Q(manager=employee) | Q(delegate=employee), ended_at__isnull=True, end_date__gte=timezone.localdate()
    ).select_related("manager", "delegate")


def _delegation_section(employee: Employee) -> ArchiveSection | None:
    items = [
        ArchiveItem(
            label=f"{full_name(delegation.manager)} → {full_name(delegation.delegate)}, "
            f"{delegation.start_date:%d/%m/%Y} – {delegation.end_date:%d/%m/%Y}"
        )
        for delegation in _open_delegations(employee)
    ]
    return ArchiveSection(key="delegations", items=items) if items else None


def archive_preview(*, employee: Employee) -> ArchivePreview:
    reports = [
        ArchiveItem(label=full_name(report), link=f"/hr/employees/{report.public_id}")
        for report in direct_reports(employee)
    ]
    candidates = [_delegation_section(employee), *(contribute(employee) for contribute in _contributors)]
    sections = [section for section in candidates if section is not None and section.items]
    has_account = employee.user_id is not None and employee.user.is_active
    return ArchivePreview(has_account=has_account, reports=reports, sections=sections)


@transaction.atomic
def archive_employee(*, actor, employee: Employee, leaving_date: date, reason: str) -> Employee:
    employee = (
        Employee.objects.select_for_update(of=("self",))
        .select_related("department", "position", "manager", "user")
        .get(pk=employee.pk)
    )
    if employee.status == EmployeeStatus.ARCHIVED:
        raise Conflict("organisation.already_archived")

    before = {**employee_state(employee), "archived_at": None, "archive_reason": ""}
    employee.status = EmployeeStatus.ARCHIVED
    employee.archived_at = leaving_date
    employee.archive_reason = reason.strip()
    employee.save(update_fields=["status", "archived_at", "archive_reason", "updated_at"])
    after = {
        **employee_state(employee),
        "archived_at": leaving_date.isoformat(),
        "archive_reason": employee.archive_reason,
    }

    today = timezone.localdate()
    for delegation in _open_delegations(employee):
        close_delegation(actor=actor, delegation=delegation, today=today)
    if employee.user_id is not None and employee.user.is_active:
        accounts_services.disable_account(actor=actor, user=employee.user)

    audit.record(
        action="employee.archived",
        obj=employee,
        actor=actor,
        object_label=full_name(employee),
        changes=audit.diff(before, after),
    )
    return employee
```

Replace `backend/apps/organisation/services/__init__.py` with:

```python
from .archive import (
    ArchiveItem,
    ArchivePreview,
    ArchiveSection,
    archive_employee,
    archive_preview,
    register_archive_contributor,
)
from .delegations import announce_delegation_transitions, create_delegation, end_delegation
from .employees import create_employee, update_employee
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "ArchiveItem",
    "ArchivePreview",
    "ArchiveSection",
    "announce_delegation_transitions",
    "archive_employee",
    "archive_preview",
    "create_delegation",
    "create_department",
    "create_employee",
    "create_position",
    "end_delegation",
    "register_archive_contributor",
    "set_department_active",
    "set_position_active",
    "update_department",
    "update_employee",
    "update_position",
]
```

- [ ] **Step 4: Write the serializers, the views and the routes**

Append to `backend/apps/organisation/api/serializers.py`:

```python
# --- Departures ----------------------------------------------------------------------------


class ArchiveItemOut(serializers.Serializer):
    label = serializers.CharField()
    link = serializers.CharField(allow_blank=True)


class ArchiveSectionOut(serializers.Serializer):
    key = serializers.CharField()
    items = ArchiveItemOut(many=True)


class ArchivePreviewOut(serializers.Serializer):
    has_account = serializers.BooleanField()
    reports = ArchiveItemOut(many=True)
    sections = ArchiveSectionOut(many=True)


class ArchiveIn(serializers.Serializer):
    leaving_date = serializers.DateField()
    reason = serializers.CharField(max_length=500)
```

Append to `backend/apps/organisation/api/views.py`:

```python
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
```

Replace `backend/apps/organisation/api/urls.py` with:

```python
from django.urls import path

from . import views

app_name = "organisation"

urlpatterns = [
    path("departments", views.DepartmentListView.as_view(), name="department-list"),
    path("departments/<int:id>", views.DepartmentDetailView.as_view(), name="department-detail"),
    path("positions", views.PositionListView.as_view(), name="position-list"),
    path("positions/<int:id>", views.PositionDetailView.as_view(), name="position-detail"),
    path("employees", views.EmployeeListView.as_view(), name="employee-list"),
    path("employees/directory", views.EmployeeDirectoryView.as_view(), name="employee-directory"),
    path("employees/me", views.EmployeeMeView.as_view(), name="employee-me"),
    path("employees/<uuid:public_id>", views.EmployeeDetailView.as_view(), name="employee-detail"),
    path(
        "employees/<uuid:public_id>/archive-preview",
        views.EmployeeArchivePreviewView.as_view(),
        name="employee-archive-preview",
    ),
    path("employees/<uuid:public_id>/archive", views.EmployeeArchiveView.as_view(), name="employee-archive"),
    path("delegations", views.DelegationListView.as_view(), name="delegation-list"),
    path("delegations/<uuid:public_id>/end", views.DelegationEndView.as_view(), name="delegation-end"),
]
```

Append inside `CASES` in `backend/apps/organisation/tests/matrix.py`:

```python
    # Departures. The POST body is empty on purpose: HR gets a validation error, nobody is archived.
    Case(route="organisation:employee-archive-preview", method="GET", expect=only(P.HR),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
    Case(route="organisation:employee-archive", method="POST", expect=only(P.HR),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains `/api/v1/employees/{public_id}/archive-preview` and `/api/v1/employees/{public_id}/archive`

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass (7 in `test_archive.py`)

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add backend/apps/organisation backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): record a departure with its consequences"
```

### Task 8: Employee documents

**Files:**
- Create: `backend/apps/organisation/services/documents.py`
- Create: `backend/apps/organisation/migrations/0003_employeedocument.py` (generated)
- Modify: `backend/apps/organisation/models.py` (append one model)
- Modify: `backend/apps/organisation/services/__init__.py`, `backend/apps/organisation/apps.py`, `backend/apps/organisation/api/urls.py` (replace the whole files)
- Modify: `backend/apps/organisation/selectors.py`, `backend/apps/organisation/api/serializers.py`, `backend/apps/organisation/api/views.py` (append; the import blocks change as shown)
- Modify: `backend/apps/organisation/tests/world.py`, `backend/apps/organisation/tests/matrix.py` (append)
- Test: `backend/apps/organisation/tests/test_documents.py`

**Interfaces:**
- Consumes: `files_services.store_upload(*, actor, upload, kind) -> Attachment`, `files_services.register_access_rule(kind, rule)`, route `files:download`, `accounts_services.display_name(user) -> str`.
- Produces:
  - Model `EmployeeDocument(employee, attachment, label, visible_to_employee, added_by, added_at)`
  - `services.add_document(*, actor: User, employee: Employee, upload: UploadedFile, label: str, visible_to_employee: bool) -> EmployeeDocument`
  - `services.set_document_visibility(*, actor: User, document: EmployeeDocument, visible_to_employee: bool) -> EmployeeDocument`
  - `apps.organisation.services.documents.may_download(user, attachment) -> bool`, registered as the access rule for `employee_document`
  - `selectors.documents_for(user, employee) -> QuerySet[EmployeeDocument]` (all for HR and executives, shared ones for the employee, `NotFound` for anyone else), `selectors.get_document(employee, document_id) -> EmployeeDocument`
  - Routes `organisation:employee-documents` (GET; POST multipart `file`, `label`, `visible_to_employee`), `organisation:employee-document` (PATCH `{visible_to_employee}`)
  - `DocumentOut`: `{id, label, visible_to_employee, attachment: {public_id, name, size, content_type}, added_by, added_at}`
  - Audit actions `document.added`, `document.visibility_changed` (recorded on the employee, so they appear in the record's history)
  - Test builder `make_document(w, *, employee=None, visible=True, label="Contrat") -> EmployeeDocument`

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_documents.py`

```python
import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import NotFound
from apps.files.tests.world import PDF_BYTES, upload
from apps.organisation import selectors, services
from apps.organisation.models import EmployeeDocument

pytestmark = pytest.mark.django_db


def _add(world, *, visible=True, label="Contrat", employee=None):
    return services.add_document(
        actor=world.hr_user,
        employee=employee or world.owner,
        upload=upload("contrat.pdf"),
        label=label,
        visible_to_employee=visible,
    )


def _documents_url(employee) -> str:
    return reverse("organisation:employee-documents", kwargs={"public_id": employee.public_id})


def test_hr_adds_a_document(world):
    document = _add(world, label=" Contrat de travail ")

    assert document.label == "Contrat de travail"
    assert document.attachment.kind == "employee_document"
    assert document.attachment.is_encrypted is False
    assert document.added_by == world.hr_user
    event = AuditEvent.objects.get(action="document.added")
    assert event.object_type == "employee"
    assert event.object_id == str(world.owner.public_id)
    assert event.changes["document"] == {"before": None, "after": "Contrat de travail"}


def test_sharing_can_be_changed_and_is_audited_once(world):
    document = _add(world, visible=False)

    services.set_document_visibility(actor=world.hr_user, document=document, visible_to_employee=True)
    services.set_document_visibility(actor=world.hr_user, document=document, visible_to_employee=True)

    document.refresh_from_db()
    assert document.visible_to_employee is True
    event = AuditEvent.objects.get(action="document.visibility_changed")
    assert event.changes["visible_to_employee"] == {"before": False, "after": True}


def test_who_lists_the_documents_of_an_employee(world):
    shared = _add(world, visible=True, label="Contrat")
    hidden = _add(world, visible=False, label="Note interne")

    assert set(selectors.documents_for(world.hr_user, world.owner)) == {shared, hidden}
    assert set(selectors.documents_for(world.exec_user, world.owner)) == {shared, hidden}
    assert list(selectors.documents_for(world.owner_user, world.owner)) == [shared]
    for user in (world.manager_user, world.peer_user, world.sysadmin_user):
        with pytest.raises(NotFound):
            selectors.documents_for(user, world.owner)


@pytest.mark.parametrize(
    ("viewer", "visible", "allowed"),
    [
        ("owner_user", True, True),
        ("owner_user", False, False),
        ("hr_user", False, True),
        ("exec_user", False, True),
        ("manager_user", True, False),
        ("peer_user", True, False),
        ("sysadmin_user", True, False),
    ],
)
def test_who_downloads_a_document(world, client_for, viewer, visible, allowed):
    document = _add(world, visible=visible)
    url = reverse("files:download", kwargs={"public_id": document.attachment.public_id})

    response = client_for(getattr(world, viewer)).get(url)

    assert response.status_code == (200 if allowed else 404)
    assert AuditEvent.objects.filter(action="attachment.downloaded").count() == (1 if allowed else 0)
    if allowed:
        assert response.content == PDF_BYTES


def test_documents_endpoints(world, client_for):
    client = client_for(world.hr_user)
    url = _documents_url(world.owner)

    created = client.post(
        url, {"file": upload("contrat.pdf"), "label": "Contrat", "visible_to_employee": "true"}, format="multipart"
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["label"], body["visible_to_employee"]) == ("Contrat", True)
    assert body["attachment"] == {
        "public_id": body["attachment"]["public_id"],
        "name": "contrat.pdf",
        "size": len(PDF_BYTES),
        "content_type": "application/pdf",
    }
    assert body["added_by"] == "Senna RH"
    assert [row["id"] for row in client.get(url).json()] == [body["id"]]
    assert [row["label"] for row in client_for(world.owner_user).get(url).json()] == ["Contrat"]

    patch_url = reverse(
        "organisation:employee-document", kwargs={"public_id": world.owner.public_id, "id": body["id"]}
    )
    patched = client.patch(patch_url, {"visible_to_employee": False}, format="json")
    assert (patched.status_code, patched.json()["visible_to_employee"]) == (200, False)
    assert client_for(world.owner_user).get(url).json() == []


def test_a_bad_file_is_refused_next_to_the_file_input(world, client_for):
    response = client_for(world.hr_user).post(
        _documents_url(world.owner),
        {"file": upload("facture.pdf", b"MZ\x90\x00" + b"\x00" * 64), "label": "Contrat"},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "files.content_mismatch"
    assert response.json()["errors"][0]["field"] == "file"
    assert EmployeeDocument.objects.count() == 0


def test_documents_are_closed_to_managers_and_colleagues(world, client_for):
    _add(world)

    for user in (world.manager_user, world.peer_user):
        assert client_for(user).get(_documents_url(world.owner)).status_code == 404
    assert client_for(world.exec_user).post(_documents_url(world.owner), {}, format="multipart").status_code == 403


def test_a_document_of_another_employee_is_not_found(world, client_for):
    document = _add(world, employee=world.peer)
    url = reverse("organisation:employee-document", kwargs={"public_id": world.owner.public_id, "id": document.id})

    assert client_for(world.hr_user).patch(url, {"visible_to_employee": True}, format="json").status_code == 404
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_documents.py -v`
Expected: collection error, `ImportError: cannot import name 'EmployeeDocument' from 'apps.organisation.models'`

- [ ] **Step 3: Add the model**

Append to `backend/apps/organisation/models.py`:

```python
class EmployeeDocument(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="documents")
    attachment = models.OneToOneField("files.Attachment", on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=120)
    visible_to_employee = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-added_at", "-id"]

    def __str__(self) -> str:
        return f"{self.employee_id}: {self.label}"
```

Run: `docker compose run --rm app python manage.py makemigrations organisation -n employeedocument`
Expected: `apps/organisation/migrations/0003_employeedocument.py - Create model EmployeeDocument`

- [ ] **Step 4: Write the service, the selectors and the registration**

`backend/apps/organisation/services/documents.py`

```python
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
def add_document(*, actor, employee: Employee, upload, label: str, visible_to_employee: bool) -> EmployeeDocument:
    attachment = files_services.store_upload(actor=actor, upload=upload, kind=AttachmentKind.EMPLOYEE_DOCUMENT)
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
def set_document_visibility(*, actor, document: EmployeeDocument, visible_to_employee: bool) -> EmployeeDocument:
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
```

In `backend/apps/organisation/selectors.py`, change the models import line to:

```python
from .models import Delegation, Department, Employee, EmployeeDocument, EmployeeStatus, Position
```

and append at the end of the file:

```python
# --- Documents -----------------------------------------------------------------------------


def documents_for(user, employee: Employee) -> QuerySet[EmployeeDocument]:
    """Every document for HR and executives; the shared ones for the employee; nothing for anyone else."""
    queryset = EmployeeDocument.objects.filter(employee=employee).select_related("attachment", "added_by")
    if has_role(user, Role.HR, Role.EXEC):
        return queryset
    own = reach.employee_of(user)
    if own is None or own.id != employee.id:
        raise NotFound()
    return queryset.filter(visible_to_employee=True)


def get_document(employee: Employee, document_id: int) -> EmployeeDocument:
    try:
        return EmployeeDocument.objects.select_related("attachment", "added_by", "employee").get(
            pk=document_id, employee=employee
        )
    except EmployeeDocument.DoesNotExist:
        raise NotFound() from None
```

Replace `backend/apps/organisation/services/__init__.py` with:

```python
from .archive import (
    ArchiveItem,
    ArchivePreview,
    ArchiveSection,
    archive_employee,
    archive_preview,
    register_archive_contributor,
)
from .delegations import announce_delegation_transitions, create_delegation, end_delegation
from .documents import add_document, set_document_visibility
from .employees import create_employee, update_employee
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "ArchiveItem",
    "ArchivePreview",
    "ArchiveSection",
    "add_document",
    "announce_delegation_transitions",
    "archive_employee",
    "archive_preview",
    "create_delegation",
    "create_department",
    "create_employee",
    "create_position",
    "end_delegation",
    "register_archive_contributor",
    "set_department_active",
    "set_document_visibility",
    "set_position_active",
    "update_department",
    "update_employee",
    "update_position",
]
```

Replace `backend/apps/organisation/apps.py` with:

```python
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
        notifications.register_event("delegation.started", link="/team/delegations")
        notifications.register_event("delegation.ended", link="/team/delegations")
```

- [ ] **Step 5: Write the serializers, the views and the routes**

In `backend/apps/organisation/api/serializers.py`, add this import just before the `apps.accounts.roles` import:

```python
from apps.accounts import services as accounts_services
```

and append at the end of the file:

```python
# --- Documents -----------------------------------------------------------------------------


class DocumentFileOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField(source="original_name")
    size = serializers.IntegerField()
    content_type = serializers.CharField()


class DocumentOut(serializers.Serializer):
    id = serializers.IntegerField()
    label = serializers.CharField()
    visible_to_employee = serializers.BooleanField()
    attachment = DocumentFileOut()
    added_by = serializers.SerializerMethodField()
    added_at = serializers.DateTimeField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_added_by(self, obj):
        return accounts_services.display_name(obj.added_by) if obj.added_by_id else None


class DocumentIn(serializers.Serializer):
    # An empty file is let through here so that the files service refuses it with its own message.
    file = serializers.FileField(allow_empty_file=True)
    label = serializers.CharField(max_length=120)
    visible_to_employee = serializers.BooleanField(required=False, default=False)


class DocumentPatchIn(serializers.Serializer):
    visible_to_employee = serializers.BooleanField()
```

In `backend/apps/organisation/api/views.py`, add this import after `from rest_framework import status`:

```python
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
```

and append at the end of the file:

```python
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

    @extend_schema(operation_id="employee_documents_update", request=s.DocumentPatchIn, responses=s.DocumentOut)
    def patch(self, request, public_id, id):  # noqa: A002
        employee = selectors.get_employee_for(request.user, public_id)
        document = selectors.get_document(employee, id)
        data = s.DocumentPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        document = services.set_document_visibility(actor=request.user, document=document, **data.validated_data)
        return Response(s.DocumentOut(document).data)
```

In `backend/apps/organisation/api/urls.py`, add these two routes after the `employee-archive` route:

```python
    path(
        "employees/<uuid:public_id>/documents",
        views.EmployeeDocumentsView.as_view(),
        name="employee-documents",
    ),
    path(
        "employees/<uuid:public_id>/documents/<int:id>",
        views.EmployeeDocumentView.as_view(),
        name="employee-document",
    ),
```

- [ ] **Step 6: Add the builder and the matrix cases**

Append to `backend/apps/organisation/tests/world.py` (and add `EmployeeDocument` to its models import):

```python
def make_document(w, *, employee: Employee | None = None, visible: bool = True,
                  label: str = "Contrat") -> EmployeeDocument:
    from apps.files.tests.world import upload
    from apps.organisation import services

    return services.add_document(
        actor=w.hr_user, employee=employee or w.owner, upload=upload("contrat.pdf"),
        label=label, visible_to_employee=visible,
    )
```

In `backend/apps/organisation/tests/matrix.py`, extend the world import to `from apps.organisation.tests.world import make_delegation, make_document` and append these cases inside `CASES`:

```python
    # Documents. Managers pass the role gate as employees, then find nothing: 404, not 403.
    Case(route="organisation:employee-documents", method="GET", label="the owner's documents",
         expect=only(P.OWNER, P.HR, P.EXEC, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER)),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
    Case(route="organisation:employee-documents", method="POST", expect=only(P.HR),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
    Case(route="organisation:employee-document", method="PATCH", expect=only(P.HR),
         kwargs=lambda w: {"public_id": w.owner.public_id, "id": make_document(w).id}),
    Case(route="files:download", method="GET", label="a document shared with its owner",
         expect=only(P.OWNER, P.HR, P.EXEC,
                     hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
         kwargs=lambda w: {"public_id": make_document(w, visible=True).attachment.public_id}),
    Case(route="files:download", method="GET", label="a document HR keeps to itself",
         expect=only(P.HR, P.EXEC,
                     hide=(P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
         kwargs=lambda w: {"public_id": make_document(w, visible=False).attachment.public_id}),
```

- [ ] **Step 7: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains `/api/v1/employees/{public_id}/documents` (with a `multipart/form-data` request body) and `/api/v1/employees/{public_id}/documents/{id}`

Run: `docker compose run --rm app pytest apps/organisation apps/files tests -v`
Expected: all pass (14 in `test_documents.py`)

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 8: Commit**

```bash
git add backend/apps/organisation backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): employee documents with sharing and audited downloads"
```

### Task 9: Profile-change proposals

An employee proposes changes to personal fields; HR accepts or refuses; the record changes only on acceptance.

**Files:**
- Create: `backend/apps/organisation/services/profile_changes.py`
- Create: `backend/apps/organisation/migrations/0004_profilechange.py` (generated)
- Modify: `backend/apps/organisation/models.py` (append)
- Modify: `backend/apps/organisation/services/__init__.py`, `backend/apps/organisation/apps.py` (replace the whole files)
- Modify: `backend/apps/organisation/selectors.py`, `backend/apps/organisation/api/serializers.py`, `backend/apps/organisation/api/views.py`, `backend/apps/organisation/api/urls.py`, `backend/apps/organisation/tests/world.py`, `backend/apps/organisation/tests/matrix.py` (append)
- Test: `backend/apps/organisation/tests/test_profile_changes.py`

**Interfaces:**
- Consumes: `reach.employee_of`, `reach.lock_employee`, `services.update_employee`, `users_with_role(Role.HR)`, `notifications.notify`, `audit.record`.
- Produces:
  - Model `ProfileChange(public_id, employee, changes, note, status, decided_by, decided_at, comment, created_at)`; `changes` is `{"<field>": {"old": …, "new": …}}` with dates as ISO strings; `ProfileChangeStatus` (`PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`). At most one pending proposal per employee, enforced by a partial unique constraint.
  - `services.PROPOSABLE_FIELDS` (the nine fields of master 7.7), `services.ensure_proposable(fields: Iterable[str]) -> None`
  - `services.propose_profile_change(*, user: User, changes: Mapping[str, Any], note: str = "") -> ProfileChange`
  - `services.decide_profile_change(*, actor: User, change: ProfileChange, accept: bool, comment: str = "") -> ProfileChange`
  - `services.withdraw_profile_change(*, user: User, change: ProfileChange) -> ProfileChange`
  - `selectors.profile_changes_for(user, *, scope=None, status=None, employee_public_id=None) -> QuerySet[ProfileChange]` (`scope`: `mine`, or `all` for HR, which leaves out the HR holder's own proposals; `status`: `pending`, `decided`, `accepted`, `rejected`, `withdrawn`; `employee_public_id` narrows the `all` scope to one employee), `selectors.get_profile_change_for(user, public_id, *, own_only=False) -> ProfileChange`
  - Routes `organisation:profile-change-list` (GET with `scope`, `status`, `employee`; POST `{changes: {…}, note?}`), `organisation:profile-change-detail`, `organisation:profile-change-decide` (POST `{accept, comment?}`), `organisation:profile-change-withdraw`
  - `ProfileChangeOut`: `{public_id, employee: {public_id, name}, changes: [{field, old, new}], note, status, decided_by, decided_at, comment, created_at}`
  - Problems: `organisation.field_not_proposable` (field `changes.<name>`, param `name`), `organisation.nothing_to_change`, `Conflict("organisation.change_already_open")`, `Conflict("organisation.change_already_decided")`
  - Notification events `profile_change.proposed` (to HR holders other than the proposer), `profile_change.accepted`, `profile_change.rejected` (to the employee)
  - Audit actions `profile_change.proposed`, `profile_change.accepted`, `profile_change.rejected`, `profile_change.withdrawn`, and `employee.updated` on acceptance
  - Test builder `make_profile_change(w, *, user=None, **changes) -> ProfileChange`

- [ ] **Step 1: Write the failing tests**

`backend/apps/organisation/tests/test_profile_changes.py`

```python
from datetime import date

import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.organisation import services
from apps.organisation.models import ProfileChange

pytestmark = pytest.mark.django_db

LIST = "organisation:profile-change-list"


def _propose(world, user=None, **changes):
    return services.propose_profile_change(
        user=user or world.owner_user, changes=changes or {"phone": "20 111 222"}
    )


def _url(name, change) -> str:
    return reverse(f"organisation:profile-change-{name}", kwargs={"public_id": change.public_id})


def test_an_employee_proposes_a_change(world):
    change = _propose(world, phone=" 20 111 222 ", address="12 rue de Carthage, Tunis", first_name="Amal")

    assert change.status == "pending"
    # The first name is unchanged, so it is not part of the proposal.
    assert change.changes == {
        "phone": {"old": "", "new": "20 111 222"},
        "address": {"old": "", "new": "12 rue de Carthage, Tunis"},
    }
    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert AuditEvent.objects.filter(action="profile_change.proposed", object_id=str(change.public_id)).exists()
    notified = Notification.objects.filter(event_code="profile_change.proposed")
    assert [notification.user for notification in notified] == [world.hr_user]
    assert notified.get().target_public_id == str(change.public_id)


def test_contractual_fields_cannot_be_proposed(world):
    with pytest.raises(DomainError) as error:
        _propose(world, phone="1", department=world.dept_b.id, hire_date="2019-01-01")

    assert [(problem.field, problem.code, dict(problem.params)) for problem in error.value.problems] == [
        ("changes.department", "organisation.field_not_proposable", {"name": "department"}),
        ("changes.hire_date", "organisation.field_not_proposable", {"name": "hire_date"}),
    ]
    assert ProfileChange.objects.count() == 0


def test_a_proposal_must_change_something(world):
    with pytest.raises(DomainError) as error:
        _propose(world, first_name="Amal", phone="")

    assert error.value.code == "organisation.nothing_to_change"


def test_one_open_proposal_at_a_time(world):
    _propose(world)

    with pytest.raises(Conflict) as error:
        _propose(world, phone="99")

    assert error.value.code == "organisation.change_already_open"


def test_someone_without_a_record_cannot_propose(world):
    with pytest.raises(NotAllowed):
        _propose(world, user=world.sysadmin_user)


def test_acceptance_updates_the_record_and_tells_the_employee(world):
    change = _propose(world, phone="20 111 222", date_of_birth=date(1990, 5, 17))

    decided = services.decide_profile_change(actor=world.hr_user, change=change, accept=True, comment=" Merci ")

    world.owner.refresh_from_db()
    assert (world.owner.phone, world.owner.date_of_birth) == ("20 111 222", date(1990, 5, 17))
    assert (decided.status, decided.decided_by, decided.comment) == ("accepted", world.hr_user, "Merci")
    assert decided.decided_at is not None
    assert AuditEvent.objects.get(action="employee.updated").changes == {
        "phone": {"before": "", "after": "20 111 222"},
        "date_of_birth": {"before": None, "after": "1990-05-17"},
    }
    assert AuditEvent.objects.filter(action="profile_change.accepted").count() == 1
    accepted = Notification.objects.filter(event_code="profile_change.accepted")
    assert [notification.user for notification in accepted] == [world.owner_user]


def test_refusal_changes_nothing_and_tells_the_employee(world):
    change = _propose(world)

    decided = services.decide_profile_change(
        actor=world.hr_user, change=change, accept=False, comment="Justificatif manquant"
    )

    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert (decided.status, decided.comment) == ("rejected", "Justificatif manquant")
    assert not AuditEvent.objects.filter(action="employee.updated").exists()
    assert Notification.objects.filter(event_code="profile_change.rejected", user=world.owner_user).count() == 1


def test_a_proposal_is_decided_once(world):
    change = _propose(world)
    services.decide_profile_change(actor=world.hr_user, change=change, accept=True)

    with pytest.raises(Conflict) as error:
        services.decide_profile_change(actor=world.hr_user, change=change, accept=False)

    assert error.value.code == "organisation.change_already_decided"
    world.owner.refresh_from_db()
    assert world.owner.phone == "20 111 222"
    told = Notification.objects.filter(event_code__startswith="profile_change.", user=world.owner_user)
    assert told.count() == 1


def test_a_withdrawn_proposal_cannot_be_decided(world):
    change = _propose(world)

    withdrawn = services.withdraw_profile_change(user=world.owner_user, change=change)

    assert withdrawn.status == "withdrawn"
    with pytest.raises(Conflict) as error:
        services.decide_profile_change(actor=world.hr_user, change=change, accept=True)
    assert error.value.code == "organisation.change_already_decided"
    world.owner.refresh_from_db()
    assert world.owner.phone == ""
    assert _propose(world, phone="55").status == "pending"


def test_acceptance_applies_the_proposed_values_over_later_edits(world):
    change = _propose(world, phone="20 111 222")
    services.update_employee(
        actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000", "address": "Sfax"}
    )

    services.decide_profile_change(actor=world.hr_user, change=change, accept=True)

    world.owner.refresh_from_db()
    assert (world.owner.phone, world.owner.address) == ("20 111 222", "Sfax")


def test_only_the_owner_withdraws_and_only_while_pending(world):
    change = _propose(world)

    with pytest.raises(NotAllowed):
        services.withdraw_profile_change(user=world.peer_user, change=change)
    services.decide_profile_change(actor=world.hr_user, change=change, accept=False)
    with pytest.raises(Conflict):
        services.withdraw_profile_change(user=world.owner_user, change=change)


def test_an_hr_holder_does_not_decide_their_own_proposal(world):
    change = _propose(world, user=world.hr_user)

    with pytest.raises(NotAllowed):
        services.decide_profile_change(actor=world.hr_user, change=change, accept=True)
    # The cast has one HR holder, so nobody is told; they change their own record through the employee form.
    assert Notification.objects.filter(event_code="profile_change.proposed").count() == 0


def test_propose_through_the_api(world, client_for):
    response = client_for(world.owner_user).post(
        reverse(LIST),
        {"changes": {"phone": "20 111 222", "date_of_birth": "1990-05-17"}, "note": "Nouveau numéro"},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["changes"] == [
        {"field": "date_of_birth", "old": None, "new": "1990-05-17"},
        {"field": "phone", "old": "", "new": "20 111 222"},
    ]
    assert body["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
    assert (body["note"], body["decided_by"], body["decided_at"]) == ("Nouveau numéro", None, None)


def test_the_api_refuses_contractual_fields_and_bad_values(world, client_for):
    client = client_for(world.owner_user)

    contractual = client.post(reverse(LIST), {"changes": {"hire_date": "2019-01-01"}}, format="json")
    assert contractual.status_code == 400
    assert contractual.json()["code"] == "organisation.field_not_proposable"
    assert contractual.json()["errors"][0]["field"] == "changes.hire_date"

    bad = client.post(reverse(LIST), {"changes": {"personal_email": "not-an-email"}}, format="json")
    assert bad.status_code == 400
    assert bad.json()["errors"][0]["field"].endswith("personal_email")
    assert ProfileChange.objects.count() == 0


def test_the_hr_queue_and_the_decision(world, client_for):
    change = _propose(world)
    own = _propose(world, user=world.hr_user, phone="1")
    hr = client_for(world.hr_user)

    queue = hr.get(reverse(LIST), {"status": "pending"}).json()
    mine = hr.get(reverse(LIST), {"scope": "mine"}).json()
    # An HR holder's own proposal is not in their queue.
    assert [row["public_id"] for row in queue["results"]] == [str(change.public_id)]
    assert [row["public_id"] for row in mine["results"]] == [str(own.public_id)]

    decided = hr.post(_url("decide", change), {"accept": True, "comment": "Merci"}, format="json")
    assert (decided.status_code, decided.json()["status"], decided.json()["decided_by"]) == (
        200, "accepted", "Senna RH"
    )
    again = hr.post(_url("decide", change), {"accept": False}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "organisation.change_already_decided")
    assert hr.get(reverse(LIST), {"status": "decided"}).json()["count"] == 1
    assert hr.get(reverse(LIST), {"employee": str(world.owner.public_id)}).json()["count"] == 1
    assert hr.get(reverse(LIST), {"employee": str(world.peer.public_id)}).json()["count"] == 0
    assert hr.post(_url("decide", own), {"accept": True}, format="json").status_code == 403


def test_an_employee_sees_and_withdraws_only_their_own(world, client_for):
    change = _propose(world)
    owner = client_for(world.owner_user)

    assert owner.get(reverse(LIST)).json()["count"] == 1
    assert client_for(world.peer_user).get(reverse(LIST)).json()["count"] == 0
    assert owner.get(reverse(LIST), {"scope": "all"}).status_code == 403
    assert owner.get(_url("detail", change)).status_code == 200
    assert client_for(world.hr_user).get(_url("detail", change)).status_code == 200
    for user in (world.peer_user, world.manager_user, world.exec_user):
        assert client_for(user).get(_url("detail", change)).status_code == 404
    assert client_for(world.hr_user).post(_url("withdraw", change), {}, format="json").status_code == 404

    done = owner.post(_url("withdraw", change), {}, format="json")
    assert (done.status_code, done.json()["status"]) == (200, "withdrawn")
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_profile_changes.py -v`
Expected: collection error, `ImportError: cannot import name 'ProfileChange' from 'apps.organisation.models'`

- [ ] **Step 3: Add the model**

Append to `backend/apps/organisation/models.py`:

```python
class ProfileChangeStatus(models.TextChoices):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class ProfileChange(PublicIdModel):
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="profile_changes")
    # {"phone": {"old": "…", "new": "…"}}; dates are ISO strings.
    changes = models.JSONField()
    note = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=ProfileChangeStatus.choices, default=ProfileChangeStatus.PENDING
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee"],
                condition=models.Q(status="pending"),
                name="one_open_profile_change_per_employee",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.employee_id}: {self.status}"
```

Run: `docker compose run --rm app python manage.py makemigrations organisation -n profilechange`
Expected: `apps/organisation/migrations/0004_profilechange.py - Create model ProfileChange`

- [ ] **Step 4: Write the service, the selectors and the registrations**

`backend/apps/organisation/services/profile_changes.py`

```python
from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, users_with_role
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed, Problem
from apps.notifications import services as notifications

from .. import reach
from ..models import ProfileChange, ProfileChangeStatus
from ..selectors import full_name, get_employee
from .employees import update_employee

PROPOSABLE_FIELDS = (
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "personal_email",
    "phone",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
)


def ensure_proposable(fields: Iterable[str]) -> None:
    """Contractual fields cannot be proposed (ORG-06). Names every refused field."""
    refused = sorted(set(fields) - set(PROPOSABLE_FIELDS))
    if refused:
        problems = [
            Problem("organisation.field_not_proposable", f"changes.{name}", {"name": name}) for name in refused
        ]
        raise DomainError(problems[0].code, problems=problems)


def _plain(value: Any) -> Any:
    """A value as it is stored in the proposal: text trimmed, dates as ISO strings."""
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _typed(name: str, value: Any) -> Any:
    if name == "date_of_birth":
        return date.fromisoformat(value) if value else None
    return value or ""


def _locked(change: ProfileChange) -> ProfileChange:
    return (
        ProfileChange.objects.select_for_update(of=("self",))
        .select_related("employee__user")
        .get(pk=change.pk)
    )


@transaction.atomic
def propose_profile_change(*, user, changes: Mapping[str, Any], note: str = "") -> ProfileChange:
    own = reach.employee_of(user)
    if own is None:
        raise NotAllowed()
    ensure_proposable(changes)
    employee = reach.lock_employee(own.id)
    if ProfileChange.objects.filter(employee=employee, status=ProfileChangeStatus.PENDING).exists():
        raise Conflict("organisation.change_already_open")

    different: dict[str, dict[str, Any]] = {}
    for name in PROPOSABLE_FIELDS:
        if name not in changes:
            continue
        old, new = _plain(getattr(employee, name)), _plain(changes[name])
        if (old or None) != (new or None):
            different[name] = {"old": old, "new": new}
    if not different:
        raise DomainError("organisation.nothing_to_change")

    change = ProfileChange.objects.create(employee=employee, changes=different, note=note.strip())
    audit.record(
        action="profile_change.proposed",
        obj=change,
        actor=user,
        object_label=full_name(employee),
        changes={name: {"before": values["old"], "after": values["new"]} for name, values in different.items()},
    )
    notifications.notify(
        users=[holder for holder in users_with_role(Role.HR) if holder.pk != user.pk],
        event="profile_change.proposed",
        params={"employee": full_name(employee)},
        target_type="profile_change",
        target_public_id=str(change.public_id),
    )
    return change


@transaction.atomic
def decide_profile_change(*, actor, change: ProfileChange, accept: bool, comment: str = "") -> ProfileChange:
    change = _locked(change)
    if change.status != ProfileChangeStatus.PENDING:
        raise Conflict("organisation.change_already_decided")
    own = reach.employee_of(actor)
    if own is not None and own.id == change.employee_id:
        raise NotAllowed()

    change.status = ProfileChangeStatus.ACCEPTED if accept else ProfileChangeStatus.REJECTED
    change.decided_by = actor
    change.decided_at = timezone.now()
    change.comment = comment.strip()
    change.save(update_fields=["status", "decided_by", "decided_at", "comment"])

    employee = get_employee(change.employee.public_id)
    if accept:
        update_employee(
            actor=actor,
            employee=employee,
            data={name: _typed(name, values["new"]) for name, values in change.changes.items()},
        )
    outcome = "accepted" if accept else "rejected"
    audit.record(
        action=f"profile_change.{outcome}", obj=change, actor=actor, object_label=full_name(employee)
    )
    if employee.user_id is not None and employee.user.is_active:
        notifications.notify(
            users=[employee.user],
            event=f"profile_change.{outcome}",
            target_type="profile_change",
            target_public_id=str(change.public_id),
        )
    return change


@transaction.atomic
def withdraw_profile_change(*, user, change: ProfileChange) -> ProfileChange:
    change = _locked(change)
    own = reach.employee_of(user)
    if own is None or own.id != change.employee_id:
        raise NotAllowed()
    if change.status != ProfileChangeStatus.PENDING:
        raise Conflict("organisation.change_already_decided")
    change.status = ProfileChangeStatus.WITHDRAWN
    change.save(update_fields=["status"])
    audit.record(
        action="profile_change.withdrawn", obj=change, actor=user, object_label=full_name(change.employee)
    )
    return change
```

In `backend/apps/organisation/selectors.py`, change the models import line to:

```python
from .models import (
    Delegation,
    Department,
    Employee,
    EmployeeDocument,
    EmployeeStatus,
    Position,
    ProfileChange,
    ProfileChangeStatus,
)
```

and append at the end of the file:

```python
# --- Profile-change proposals --------------------------------------------------------------


def profile_changes_for(user, *, scope: str | None = None, status: str | None = None,
                        employee_public_id=None) -> QuerySet[ProfileChange]:
    """`mine`: the user's own proposals. `all` (HR): everyone's except the HR holder's own."""
    queryset = ProfileChange.objects.select_related("employee", "decided_by")
    is_hr = has_role(user, Role.HR)
    scope = scope or ("all" if is_hr else "mine")
    own = reach.employee_of(user)
    if scope == "all":
        if not is_hr:
            raise NotAllowed()
        if own is not None:
            queryset = queryset.exclude(employee=own)
        if employee_public_id:
            queryset = queryset.filter(employee__public_id=employee_public_id)
    else:
        if own is None:
            return queryset.none()
        queryset = queryset.filter(employee=own)
    if status == "decided":
        queryset = queryset.exclude(status=ProfileChangeStatus.PENDING)
    elif status:
        queryset = queryset.filter(status=status)
    # The queue is worked oldest first; everything else reads newest first.
    ordering = ("created_at", "id") if status == ProfileChangeStatus.PENDING else ("-created_at", "-id")
    return queryset.order_by(*ordering)


def get_profile_change_for(user, public_id, *, own_only: bool = False) -> ProfileChange:
    try:
        change = ProfileChange.objects.select_related("employee", "decided_by").get(public_id=public_id)
    except (ProfileChange.DoesNotExist, ValidationError, ValueError):
        raise NotFound() from None
    own = reach.employee_of(user)
    if own is not None and own.id == change.employee_id:
        return change
    if not own_only and has_role(user, Role.HR):
        return change
    raise NotFound()
```

Replace `backend/apps/organisation/services/__init__.py` with:

```python
from .archive import (
    ArchiveItem,
    ArchivePreview,
    ArchiveSection,
    archive_employee,
    archive_preview,
    register_archive_contributor,
)
from .delegations import announce_delegation_transitions, create_delegation, end_delegation
from .documents import add_document, set_document_visibility
from .employees import create_employee, update_employee
from .profile_changes import (
    PROPOSABLE_FIELDS,
    decide_profile_change,
    ensure_proposable,
    propose_profile_change,
    withdraw_profile_change,
)
from .structure import (
    create_department,
    create_position,
    set_department_active,
    set_position_active,
    update_department,
    update_position,
)

__all__ = [
    "PROPOSABLE_FIELDS",
    "ArchiveItem",
    "ArchivePreview",
    "ArchiveSection",
    "add_document",
    "announce_delegation_transitions",
    "archive_employee",
    "archive_preview",
    "create_delegation",
    "create_department",
    "create_employee",
    "create_position",
    "decide_profile_change",
    "end_delegation",
    "ensure_proposable",
    "propose_profile_change",
    "register_archive_contributor",
    "set_department_active",
    "set_document_visibility",
    "set_position_active",
    "update_department",
    "update_employee",
    "update_position",
    "withdraw_profile_change",
]
```

Replace `backend/apps/organisation/apps.py` with (this is its final form):

```python
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
        notifications.register_event("delegation.started", link="/team/delegations")
        notifications.register_event("delegation.ended", link="/team/delegations")
        notifications.register_event("profile_change.proposed", link="/hr/profile-changes")
        notifications.register_event("profile_change.accepted", link="/me/profile")
        notifications.register_event("profile_change.rejected", link="/me/profile")
```

- [ ] **Step 5: Write the serializers, the views and the routes**

Append to `backend/apps/organisation/api/serializers.py`:

```python
# --- Profile-change proposals --------------------------------------------------------------

_PROPOSABLE_ORDER = (
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "personal_email",
    "phone",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
)


class ProfileChangeFieldOut(serializers.Serializer):
    field = serializers.CharField()
    old = serializers.CharField(allow_null=True, allow_blank=True)
    new = serializers.CharField(allow_null=True, allow_blank=True)


class ProfileChangeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    employee = EmployeeRefOut()
    changes = serializers.SerializerMethodField()
    note = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    decided_by = serializers.SerializerMethodField()
    decided_at = serializers.DateTimeField(allow_null=True)
    comment = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()

    @extend_schema_field(ProfileChangeFieldOut(many=True))
    def get_changes(self, obj):
        return [
            {"field": name, "old": obj.changes[name]["old"], "new": obj.changes[name]["new"]}
            for name in _PROPOSABLE_ORDER
            if name in obj.changes
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_decided_by(self, obj):
        return accounts_services.display_name(obj.decided_by) if obj.decided_by_id else None


class ProposableFieldsIn(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=Gender.choices, required=False, allow_blank=True)
    personal_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=40, required=False, allow_blank=True)


class ProfileChangeIn(serializers.Serializer):
    changes = ProposableFieldsIn()
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ProfileChangeDecisionIn(serializers.Serializer):
    accept = serializers.BooleanField()
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ProfileChangeListQuery(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["mine", "all"], required=False)
    status = serializers.ChoiceField(
        choices=["pending", "decided", "accepted", "rejected", "withdrawn"], required=False
    )
    employee = serializers.UUIDField(required=False)
```

Append to `backend/apps/organisation/api/views.py`:

```python
# --- Profile-change proposals --------------------------------------------------------------


class ProfileChangeListView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR}, "POST": {Role.EMPLOYEE}}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="profile_changes_list",
        parameters=[s.ProfileChangeListQuery, *PAGE_PARAMETERS],
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
        return paginate(request, self, queryset, s.ProfileChangeOut)

    @extend_schema(
        operation_id="profile_changes_create",
        request=s.ProfileChangeIn,
        responses={201: s.ProfileChangeOut},
    )
    def post(self, request):
        # The serializer would silently drop fields it does not know, so ask the rule first.
        proposed = request.data.get("changes")
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
```

In `backend/apps/organisation/api/urls.py`, add these routes before the `delegations` routes:

```python
    path("profile-changes", views.ProfileChangeListView.as_view(), name="profile-change-list"),
    path(
        "profile-changes/<uuid:public_id>",
        views.ProfileChangeDetailView.as_view(),
        name="profile-change-detail",
    ),
    path(
        "profile-changes/<uuid:public_id>/decide",
        views.ProfileChangeDecideView.as_view(),
        name="profile-change-decide",
    ),
    path(
        "profile-changes/<uuid:public_id>/withdraw",
        views.ProfileChangeWithdrawView.as_view(),
        name="profile-change-withdraw",
    ),
```

- [ ] **Step 6: Add the builder and the matrix cases**

Append to `backend/apps/organisation/tests/world.py` (and add `ProfileChange` to its models import):

```python
def make_profile_change(w, *, user=None, **changes) -> ProfileChange:
    from apps.organisation import services

    return services.propose_profile_change(user=user or w.owner_user, changes=changes or {"phone": "20 111 222"})
```

In `backend/apps/organisation/tests/matrix.py`, extend the world import to `from apps.organisation.tests.world import make_delegation, make_document, make_profile_change`, add after `_EMPLOYEES`:

```python
_NOT_THE_OWNER = (P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC)
```

and append these cases inside `CASES`:

```python
    # Profile-change proposals
    Case(route="organisation:profile-change-list", method="GET", expect=only(*_EMPLOYEES)),
    Case(route="organisation:profile-change-list", method="POST", expect=only(*_EMPLOYEES)),
    Case(route="organisation:profile-change-detail", method="GET", label="the owner's proposal",
         expect=only(P.OWNER, P.HR, hide=_NOT_THE_OWNER),
         kwargs=lambda w: {"public_id": make_profile_change(w).public_id}),
    Case(route="organisation:profile-change-decide", method="POST", expect=only(P.HR),
         kwargs=lambda w: {"public_id": make_profile_change(w).public_id}),
    Case(route="organisation:profile-change-withdraw", method="POST", label="the owner's proposal",
         expect=only(P.OWNER, hide=(*_NOT_THE_OWNER, P.HR)),
         kwargs=lambda w: {"public_id": make_profile_change(w).public_id}),
```

- [ ] **Step 7: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains the four `/api/v1/profile-changes…` paths

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass (16 in `test_profile_changes.py`)

Run: `docker compose run --rm app ruff check apps/organisation && docker compose run --rm app ruff format --check apps/organisation`
Expected: `All checks passed!`

- [ ] **Step 8: Commit**

```bash
git add backend/apps/organisation backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): profile-change proposals decided by HR"
```

### Task 10: The history of an employee record

**Files:**
- Modify: `backend/apps/organisation/api/views.py` (append; two imports added), `backend/apps/organisation/api/urls.py` (one route), `backend/apps/organisation/tests/matrix.py` (one case)
- Test: `backend/apps/organisation/tests/test_history.py`

**Interfaces:**
- Consumes: `apps.audit.selectors.events_for_object(object_type: str, object_id: str) -> QuerySet[AuditEvent]`, `apps.audit.api.serializers.AuditEventOut` (`{id, at, actor, category, action, object_type, object_id, object_label, changes, ip_address, request_id}`).
- Produces: route `organisation:employee-history` (GET, paginated `AuditEventOut`, newest first). It returns the events recorded on the employee: `employee.created`, `employee.updated`, `employee.archived`, `document.added`, `document.visibility_changed`.

- [ ] **Step 1: Write the failing test**

`backend/apps/organisation/tests/test_history.py`

```python
import pytest
from django.urls import reverse

from apps.organisation import services
from apps.organisation.tests.world import make_document

pytestmark = pytest.mark.django_db


def _url(employee) -> str:
    return reverse("organisation:employee-history", kwargs={"public_id": employee.public_id})


def test_the_history_tells_what_changed_from_what_to_what_by_whom(world, client_for):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000"})
    services.update_employee(actor=world.hr_user, employee=world.peer, data={"phone": "72 000 000"})
    make_document(world, label="Contrat")

    body = client_for(world.hr_user).get(_url(world.owner)).json()

    assert body["count"] == 2
    added, updated = body["results"]
    assert (added["action"], updated["action"]) == ("document.added", "employee.updated")
    assert updated["changes"] == {"phone": {"before": "", "after": "71 000 000"}}
    assert updated["actor"] == "Senna RH"
    assert updated["at"]
    assert added["changes"]["document"] == {"before": None, "after": "Contrat"}


def test_who_reads_the_history(world, client_for):
    assert client_for(world.exec_user).get(_url(world.owner)).status_code == 200
    assert client_for(world.manager_user).get(_url(world.owner)).status_code == 403
    assert client_for(world.owner_user).get(_url(world.owner)).status_code == 403
```

Run: `docker compose run --rm app pytest apps/organisation/tests/test_history.py -v`
Expected: 2 failures, `NoReverseMatch: Reverse for 'employee-history' not found`

- [ ] **Step 2: Write the view and its route**

In `backend/apps/organisation/api/views.py`, add these imports after the `apps.accounts.roles` import:

```python
from apps.audit import selectors as audit_selectors
from apps.audit.api.serializers import AuditEventOut
```

and append at the end of the file:

```python
# --- History -------------------------------------------------------------------------------


class EmployeeHistoryView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="employees_history",
        parameters=PAGE_PARAMETERS,
        responses=paginated(AuditEventOut),
    )
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        events = audit_selectors.events_for_object("employee", str(employee.public_id)).order_by("-at", "-id")
        return paginate(request, self, events, AuditEventOut)
```

In `backend/apps/organisation/api/urls.py`, add this route after the `employee-document` route:

```python
    path(
        "employees/<uuid:public_id>/history",
        views.EmployeeHistoryView.as_view(),
        name="employee-history",
    ),
```

Append inside `CASES` in `backend/apps/organisation/tests/matrix.py`:

```python
    # History
    Case(route="organisation:employee-history", method="GET", expect=only(P.HR, P.EXEC),
         kwargs=lambda w: {"public_id": w.owner.public_id}),
```

- [ ] **Step 3: Run the tests and see them pass**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` gains `/api/v1/employees/{public_id}/history`

Run: `docker compose run --rm app pytest apps/organisation tests -v`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add backend/apps/organisation backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(organisation): history of an employee record"
```

### Task 11: Demo data and the backend check

**Files:**
- Create: `backend/apps/organisation/seed.py`
- Modify: `backend/apps/core/management/commands/seed_demo.py` (one entry in `SEEDERS`), `backend/apps/core/tests/test_seed.py` (three assertions of plan 01a on the roles of demo accounts)
- Test: `backend/apps/organisation/tests/test_seed.py`

**Interfaces:**
- Consumes: the accounts seeded by plan 01a (`ceo@`, `hr@`, `manager.a@`, `employee.a1@`, `employee.a2@`, `manager.b@`, `employee.b1@impactrisks.com`), the `seed_demo` command and its `SEEDERS` list.
- Produces: `apps.organisation.seed.seed() -> None`, safe to run twice (plan 01a, contract note 5). Demo people, used by the browser tests of this and later plans; those with an account carry the name plan 01a gave the account:

| Number | Name | Signs in as | Department | Reports to |
|---|---|---|---|---|
| E001 | Karim Directeur | `ceo@` | DIR Direction générale | nobody |
| E002 | Senna RH | `hr@` | FIN Finance et administration | E001 |
| E003 | Mounir Manager | `manager.a@` | UW Souscription | E001 |
| E004 | Amal Employee | `employee.a1@` (the owner) | UW | E003 |
| E005 | Bilel Employee | `employee.a2@` (the peer) | UW | E003 |
| E006 | Nadia Manager | `manager.b@` | CLM Sinistres | E001 |
| E007 | Chokri Employee | `employee.b1@` (the outsider) | CLM | E006 |
| E008 | Leila Ayari | no account yet | CLM | E006 |

- [ ] **Step 1: Write the failing test**

`backend/apps/organisation/tests/test_seed.py`

```python
import pytest
from django.core.management import call_command

from apps.organisation.models import Department, Employee, Position

pytestmark = pytest.mark.django_db


def test_seed_demo_builds_the_demo_company_once(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"

    call_command("seed_demo")
    call_command("seed_demo")

    assert Department.objects.count() == 4
    assert Position.objects.count() == 4
    assert Employee.objects.count() == 8
    owner = Employee.objects.select_related("user", "manager", "department").get(employee_number="E004")
    assert owner.user.email == "employee.a1@impactrisks.com"
    assert owner.manager.employee_number == "E003"
    assert owner.department.code == "UW"
    assert (owner.first_name, owner.last_name) == ("Amal", "Employee")
    assert owner.user.full_name == "Amal Employee"
    assert Employee.objects.get(employee_number="E001").manager is None
    assert Employee.objects.get(employee_number="E008").user is None
```

Run: `docker compose run --rm app pytest apps/organisation/tests/test_seed.py -v`
Expected: FAIL, `assert 0 == 4`

- [ ] **Step 2: Write the seeder and register it**

`backend/apps/organisation/seed.py`

```python
"""The demo company for development and browser tests. Every name here is invented."""

from datetime import date

from django.contrib.auth import get_user_model

from .models import ContractType, Department, Employee, Position

_DEPARTMENTS = [
    ("DIR", "Direction générale", "Executive office"),
    ("UW", "Souscription", "Underwriting"),
    ("CLM", "Sinistres", "Claims"),
    ("FIN", "Finance et administration", "Finance and administration"),
]

_POSITIONS = [
    ("CEO", "Directeur général", "Chief executive officer", "A1"),
    ("HRR", "Responsable RH", "HR Responsible", "B1"),
    ("HEAD", "Chef de département", "Head of department", "B1"),
    ("OFF", "Chargé de clientèle", "Account officer", "C1"),
]

# number, first name, last name, professional email, department, position, manager, hire date
_PEOPLE = [
    ("E001", "Karim", "Directeur", "ceo@impactrisks.com", "DIR", "CEO", None, date(2015, 3, 2)),
    ("E002", "Senna", "RH", "hr@impactrisks.com", "FIN", "HRR", "E001", date(2018, 9, 3)),
    ("E003", "Mounir", "Manager", "manager.a@impactrisks.com", "UW", "HEAD", "E001", date(2017, 1, 9)),
    ("E004", "Amal", "Employee", "employee.a1@impactrisks.com", "UW", "OFF", "E003", date(2021, 6, 1)),
    ("E005", "Bilel", "Employee", "employee.a2@impactrisks.com", "UW", "OFF", "E003", date(2022, 2, 14)),
    ("E006", "Nadia", "Manager", "manager.b@impactrisks.com", "CLM", "HEAD", "E001", date(2016, 11, 21)),
    ("E007", "Chokri", "Employee", "employee.b1@impactrisks.com", "CLM", "OFF", "E006", date(2023, 4, 3)),
    ("E008", "Leila", "Ayari", "leila.ayari@impactrisks.com", "CLM", "OFF", "E006", date(2026, 9, 1)),
]


def seed() -> None:
    user_model = get_user_model()
    departments = {
        code: Department.objects.update_or_create(code=code, defaults={"name_fr": name_fr, "name_en": name_en})[0]
        for code, name_fr, name_en in _DEPARTMENTS
    }
    positions = {
        code: Position.objects.update_or_create(
            code=code, defaults={"title_fr": title_fr, "title_en": title_en, "grade": grade}
        )[0]
        for code, title_fr, title_en, grade in _POSITIONS
    }
    people: dict[str, Employee] = {}
    for number, first_name, last_name, email, department, position, manager, hired in _PEOPLE:
        people[number], _ = Employee.objects.update_or_create(
            employee_number=number,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "professional_email": email,
                "department": departments[department],
                "position": positions[position],
                "manager": people.get(manager),
                "hire_date": hired,
                "contract_type": ContractType.PERMANENT,
                "user": user_model.objects.filter(email=email).first(),
            },
        )
```

In `backend/apps/core/management/commands/seed_demo.py`, add `"apps.organisation.seed",` after `"apps.accounts.seed",` in `SEEDERS` (the accounts must exist before the employees are attached to them).

The demo accounts now have employee records, so three assertions of `backend/apps/core/tests/test_seed.py` (`test_seed_demo_creates_the_accounts_of_the_master_plan`) change:

```python
    assert roles_of(User.objects.get(email="ceo@impactrisks.com")) == {Role.EXEC, Role.EMPLOYEE, Role.MANAGER}
    assert roles_of(User.objects.get(email="hr@impactrisks.com")) == {Role.HR, Role.EMPLOYEE}
    assert roles_of(User.objects.get(email="employee.a1@impactrisks.com")) == {Role.EMPLOYEE}
```

(in place of `{Role.EXEC}`, `{Role.HR}` and `frozenset()`).

- [ ] **Step 3: Run the tests and see them pass**

Run: `docker compose run --rm app pytest apps/organisation/tests/test_seed.py apps/core/tests/test_seed.py -v`
Expected: all pass

- [ ] **Step 4: Run the whole backend and try the demo data**

Run: `docker compose run --rm app pytest -q`
Expected: every test of plans 01a and 02 passes

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: `All checks passed!`

Run: `docker compose run --rm app python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`

Run: `docker compose up -d` then `docker compose exec app python manage.py migrate` then `docker compose exec app python manage.py seed_demo`
Expected: migrations `files.0001`, `organisation.0001` to `organisation.0004` applied; the seed command ends without error

Run: `docker compose exec app python manage.py shell -c "from apps.organisation.models import Employee; print(Employee.objects.count())"`
Expected: `8`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/organisation backend/apps/core/management/commands/seed_demo.py backend/apps/core/tests/test_seed.py
git commit -m "feat(organisation): demo company for development and browser tests"
```

---

## Part B: Frontend

Every page below is built from the shared components of plan 01b and follows its conventions: types derived in `@/api/types`, hooks in `features/<feature>/api.ts`, `if (query.isPending) return <PageLoading />; if (query.error) throw query.error;` at the top of a page, texts in `locales/<lang>/<namespace>.json`, tests in French with every request answered by an MSW handler (an unanswered request fails the test).

Layout choices of this plan (master D23): a list page is a `PageHeader`, a `FilterBar` and a `DataTable`; the employee record opens on a card of facts and keeps the rest in `Disclosure` blocks; a long form (the employee form, propose a change) is a page of its own with sections on a two-column grid that collapses to one column on a phone; a focused task (name a delegate, add a document, record a departure, add or edit a department, decide a proposal) is a `TaskSheet`.

### Task 12: Types, hooks, the employee picker and the texts of the employee pages

**Files:**
- Modify: `frontend/src/api/types.ts` (append)
- Create: `frontend/src/features/employees/api.ts`, `frontend/src/features/employees/testing.ts`, `frontend/src/features/employees/ui.tsx`, `frontend/src/features/employees/EmployeePicker.tsx`
- Create: `frontend/src/i18n/locales/fr/employees.json`, `frontend/src/i18n/locales/en/employees.json`
- Test: `frontend/src/features/employees/api.test.ts`, `frontend/src/features/employees/EmployeePicker.test.tsx`

**Interfaces:**
- Consumes: the generated `frontend/src/api/schema.d.ts` (it already holds every path of Part A: each backend task regenerated it); `Ok`, `Rows`, `Body`, `Query` in `@/api/types`; `api`, `call`; `makePage`, `problemResponse`, `makeMe`, `renderApp`, `server`; `Field`, `describedBy`, `StatusBadge`, `NativeSelect`.
- Produces:
  - In `@/api/types`: `EmployeeQuery`, `EmployeePage`, `EmployeeRow`, `EmployeeDetail`, `Employee`, `TeamMember`, `EmployeeBrief`, `EmployeePayload`, `EmployeeChanges`, `Department`, `Position`, `DepartmentPayload`, `DepartmentChanges`, `PositionPayload`, `PositionChanges`, `EmployeeDocument`, `ArchivePreview`, `Departure`, `EmployeeHistoryPage`
  - `features/employees/api.ts` re-exports those types and exports: `EmployeeListParams` (= `EmployeeQuery`), `employeeKeys`, `isFullRecord(employee: EmployeeDetail): employee is Employee`, `useEmployees(params)`, `useEmployee(id: string | undefined)`, `useMyEmployee(enabled = true)`, `useEmployeeDirectory()`, `useDepartments()`, `usePositions()`, `useCreateEmployee()` (variables `EmployeePayload`), `useUpdateEmployee(id)` (variables `EmployeeChanges`), `useSaveDepartment()` and `useSavePosition()` (variables `{ id?: number; body }`), `useEmployeeDocuments(id)`, `documentFormData(input)`, `useAddDocument(id)` (variables `{ file: File; label: string; visible_to_employee: boolean }`), `useSetDocumentVisibility(id)` (variables `{ id: number; visible_to_employee: boolean }`), `useEmployeeHistory(id, page)`, `useArchivePreview(id)`, `useArchiveEmployee(id)` (variables `Departure`)
  - `features/employees/testing.ts`: `makeDepartment`, `makePosition`, `makeEmployeeRow`, `makeEmployee`, `makeTeamMember`, `makeDocument`, `pageOf` (plan 01b's `makePage`), `problem(status, code, errors)` (plan 01b's `problemResponse`, taking the list of field problems)
  - `features/employees/ui.tsx`: `EmployeeStatusBadge({ status })`
  - `EmployeePicker` (named export), props `{ label: string; value: string | null; onChange: (publicId: string | null) => void; exclude?: string[]; error?: string; hint?: string; allowNone?: boolean; noneLabel?: string }`. It lists the active employees of `employees/directory`, which managers, HR and executives may read. Plan 03b reuses it.
  - The `employees` translation namespace, complete for Tasks 12 to 21

- [ ] **Step 1: Derive the types**

Check that the generated types hold the paths of Part A:

Run: `docker compose run --rm web node -e "const s=require('fs').readFileSync('src/api/schema.d.ts','utf8');for(const p of ['/api/v1/employees/{public_id}/archive','/api/v1/profile-changes/{public_id}/decide','/api/v1/delegations/{public_id}/end','/api/v1/attachments/{public_id}/download'])console.log(p,s.includes(p))"`
Expected: four lines ending in `true`. If one says `false`, run `powershell -File scripts/dev.ps1 openapi` and commit the two generated files before going on.

Append to `frontend/src/api/types.ts`:

```ts
// --- Organisation (plan 02) ---------------------------------------------------------------

export type EmployeeQuery = Query<"/api/v1/employees", "get">;
export type EmployeePage = Ok<"/api/v1/employees", "get">;
export type EmployeeRow = Rows<EmployeePage>;
/** The whole record for its owner, HR and executives; the team view for a manager. */
export type EmployeeDetail = Ok<"/api/v1/employees/{public_id}", "get">;
export type Employee = Ok<"/api/v1/employees/me", "get">;
export type TeamMember = Exclude<EmployeeDetail, Employee>;
export type EmployeeBrief = Ok<"/api/v1/employees/directory", "get">[number];
export type EmployeePayload = Body<"/api/v1/employees", "post">;
export type EmployeeChanges = Body<"/api/v1/employees/{public_id}", "patch">;

export type Department = Ok<"/api/v1/departments", "get">[number];
export type Position = Ok<"/api/v1/positions", "get">[number];
export type DepartmentPayload = Body<"/api/v1/departments", "post">;
export type DepartmentChanges = Body<"/api/v1/departments/{id}", "patch">;
export type PositionPayload = Body<"/api/v1/positions", "post">;
export type PositionChanges = Body<"/api/v1/positions/{id}", "patch">;

export type EmployeeDocument = Ok<"/api/v1/employees/{public_id}/documents", "get">[number];
export type ArchivePreview = Ok<"/api/v1/employees/{public_id}/archive-preview", "get">;
export type Departure = Body<"/api/v1/employees/{public_id}/archive", "post">;
export type EmployeeHistoryPage = Ok<"/api/v1/employees/{public_id}/history", "get">;
```

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0. A type that resolves to `never` shows as an error in the files below, not here; if that happens, open `src/api/schema.d.ts` at the operation and fix the `@extend_schema` of its view in Part A.

- [ ] **Step 2: Write the texts**

`frontend/src/i18n/locales/fr/employees.json`

```json
{
  "directory": {
    "title": "Employés",
    "titleOverview": "Personnes",
    "new": "Nouvel employé",
    "search": "Rechercher",
    "department": "Département",
    "allDepartments": "Tous les départements",
    "status": "Statut",
    "statusCurrent": "Présents dans l'entreprise",
    "columns": {
      "name": "Nom",
      "number": "Matricule",
      "department": "Département",
      "position": "Poste",
      "manager": "Responsable",
      "status": "Statut"
    },
    "noManager": "Aucun",
    "empty": {
      "title": "Aucun employé ne correspond",
      "hint": "Modifiez la recherche ou les filtres."
    }
  },
  "status": {
    "active": "En poste",
    "suspended": "Suspendu",
    "archived": "A quitté l'entreprise"
  },
  "form": {
    "titleNew": "Nouvel employé",
    "titleEdit": "Modifier {{name}}",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "required": "Ce champ est obligatoire.",
    "saved": "Fiche enregistrée.",
    "choose": "Choisir…",
    "emailHint": "Adresse de l'entreprise : elle sert d'identifiant de connexion.",
    "noManager": "Aucun responsable",
    "sections": {
      "identity": "Identité",
      "contact": "Coordonnées",
      "contract": "Contrat",
      "organisation": "Rattachement",
      "emergency": "Personne à prévenir"
    }
  },
  "fields": {
    "employee_number": "Matricule",
    "first_name": "Prénom",
    "last_name": "Nom",
    "date_of_birth": "Date de naissance",
    "gender": "Genre",
    "professional_email": "E-mail professionnel",
    "personal_email": "E-mail personnel",
    "phone": "Téléphone",
    "address": "Adresse",
    "hire_date": "Date d'embauche",
    "contract_type": "Type de contrat",
    "contract_start_date": "Début du contrat",
    "contract_end_date": "Fin du contrat",
    "status": "Statut",
    "department": "Département",
    "position": "Poste",
    "manager": "Responsable",
    "emergency_contact_name": "Personne à prévenir",
    "emergency_contact_phone": "Téléphone de la personne à prévenir",
    "archived_at": "Date de départ",
    "archive_reason": "Motif du départ",
    "document": "Document",
    "visible_to_employee": "Partagé avec l'employé"
  },
  "gender": {
    "female": "Femme",
    "male": "Homme",
    "unspecified": "Non précisé"
  },
  "contract": {
    "permanent": "CDI",
    "fixed_term": "CDD",
    "temporary": "Intérim",
    "consultant": "Consultant"
  },
  "record": {
    "edit": "Modifier",
    "loading": "Chargement…"
  },
  "facts": {
    "number": "Matricule",
    "department": "Département",
    "position": "Poste",
    "manager": "Responsable",
    "contract": "Contrat",
    "status": "Statut",
    "account": "Compte",
    "departure": "Départ",
    "email": "E-mail",
    "phone": "Téléphone",
    "noManager": "Aucun responsable",
    "contractSince": "{{type}}, depuis le {{date}}",
    "contractUntil": "{{type}}, du {{start}} au {{end}}",
    "departureValue": "{{date}}. Motif : {{reason}}"
  },
  "account": {
    "exists": "Compte créé",
    "missing": "Pas encore de compte"
  },
  "blocks": {
    "personal": "Informations personnelles",
    "team": "Équipe",
    "documents": "Documents",
    "history": "Historique"
  },
  "personal": {
    "none": "Non renseigné"
  },
  "team": {
    "reports": "Personnes rattachées",
    "noReports": "Personne ne lui est rattaché.",
    "delegation": "Délégation",
    "delegationLine": "{{name}}, du {{start}} au {{end}}",
    "noDelegation": "Aucune délégation en cours ou à venir.",
    "changeManager": "Changer de responsable",
    "nameDelegate": "Nommer un délégué"
  },
  "documents": {
    "empty": "Aucun document.",
    "add": "Ajouter un document",
    "addedBy": "ajouté par {{name}} le {{date}}",
    "download": "Télécharger {{name}}",
    "share": "Partager {{label}} avec l'employé",
    "shareShort": "Partagé",
    "shared": "Partagé avec l'employé",
    "notShared": "Réservé aux RH",
    "sheet": {
      "title": "Ajouter un document",
      "file": "Fichier",
      "fileHint": "Formats acceptés : PDF, JPG, PNG.",
      "label": "Intitulé",
      "shared": "Partager avec l'employé",
      "submit": "Ajouter",
      "done": "Document ajouté."
    }
  },
  "history": {
    "empty": "Aucun changement enregistré.",
    "by": "{{actor}}, le {{date}}",
    "system": "Système",
    "change": "{{field}} : {{before}} → {{after}}",
    "blank": "(vide)",
    "yes": "Oui",
    "no": "Non",
    "actions": {
      "employee": {
        "created": "Fiche créée",
        "updated": "Fiche modifiée",
        "archived": "Départ enregistré"
      },
      "document": {
        "added": "Document ajouté",
        "visibility_changed": "Partage d'un document modifié"
      }
    }
  },
  "departure": {
    "action": "Enregistrer un départ",
    "title": "Enregistrer le départ de {{name}}",
    "date": "Date de départ",
    "reason": "Motif",
    "consequences": "Ce qui se passera",
    "account": "Son compte sera désactivé immédiatement : cette personne ne pourra plus se connecter.",
    "credit": "Plus aucun crédit mensuel de congés ne sera ajouté après la date de départ.",
    "kept": "La fiche est conservée et reste consultable par les RH.",
    "reports": "Ces personnes lui sont rattachées et auront besoin d'un nouveau responsable :",
    "sections": {
      "delegations": "Ces délégations seront terminées :",
      "open_requests": "Ces demandes resteront ouvertes :",
      "open_steps": "Ces décisions attendent cette personne :"
    },
    "confirm": "Enregistrer le départ",
    "done": "Départ enregistré."
  },
  "settingsIndex": {
    "title": "Configuration",
    "departments": {
      "title": "Départements et postes",
      "description": "Les unités de l'entreprise et les intitulés de poste proposés dans les fiches."
    }
  },
  "structure": {
    "title": "Départements et postes",
    "tabs": {
      "departments": "Départements",
      "positions": "Postes"
    },
    "addDepartment": "Ajouter un département",
    "addPosition": "Ajouter un poste",
    "columns": {
      "code": "Code",
      "name": "Nom",
      "title": "Intitulé",
      "grade": "Grade",
      "employees": "Employés",
      "state": "État",
      "action": "Action"
    },
    "edit": "Modifier",
    "editItem": "Modifier {{code}}",
    "active": "Actif",
    "inactive": "Inactif",
    "inUse": "Un élément utilisé peut être désactivé, pas supprimé. Il reste sur les fiches existantes et n'est plus proposé pour les nouvelles.",
    "saved": "Enregistré.",
    "sheet": {
      "newDepartment": "Nouveau département",
      "editDepartment": "Modifier le département {{code}}",
      "newPosition": "Nouveau poste",
      "editPosition": "Modifier le poste {{code}}"
    },
    "fields": {
      "code": "Code",
      "name_fr": "Nom en français",
      "name_en": "Nom en anglais",
      "title_fr": "Intitulé en français",
      "title_en": "Intitulé en anglais",
      "grade": "Grade",
      "is_active": "Actif"
    },
    "empty": {
      "departments": "Aucun département. Ajoutez le premier.",
      "positions": "Aucun poste. Ajoutez le premier."
    }
  },
  "picker": {
    "choose": "Choisir une personne…",
    "none": "Personne"
  },
  "people": {
    "title": "Personnes",
    "columns": {
      "name": "Nom",
      "position": "Poste"
    },
    "empty": {
      "title": "Personne ne vous est rattaché",
      "hint": "Les personnes dont vous êtes responsable, ou qui vous sont confiées par délégation, apparaissent ici."
    }
  },
  "accountFor": {
    "employee": "Employé",
    "none": "Aucun : compte sans fiche d'employé",
    "hint": "Le compte utilisera le nom de la fiche et l'adresse {{email}}."
  }
}
```

`frontend/src/i18n/locales/en/employees.json`

```json
{
  "directory": {
    "title": "Employees",
    "titleOverview": "People",
    "new": "New employee",
    "search": "Search",
    "department": "Department",
    "allDepartments": "All departments",
    "status": "Status",
    "statusCurrent": "Currently employed",
    "columns": {
      "name": "Name",
      "number": "Number",
      "department": "Department",
      "position": "Position",
      "manager": "Manager",
      "status": "Status"
    },
    "noManager": "None",
    "empty": {
      "title": "No employee matches",
      "hint": "Change the search or the filters."
    }
  },
  "status": {
    "active": "Employed",
    "suspended": "Suspended",
    "archived": "Left the company"
  },
  "form": {
    "titleNew": "New employee",
    "titleEdit": "Edit {{name}}",
    "save": "Save",
    "cancel": "Cancel",
    "required": "This field is required.",
    "saved": "Record saved.",
    "choose": "Choose…",
    "emailHint": "A company address: it is the sign-in identifier.",
    "noManager": "No manager",
    "sections": {
      "identity": "Identity",
      "contact": "Contact details",
      "contract": "Contract",
      "organisation": "Organisation",
      "emergency": "Emergency contact"
    }
  },
  "fields": {
    "employee_number": "Employee number",
    "first_name": "First name",
    "last_name": "Last name",
    "date_of_birth": "Date of birth",
    "gender": "Gender",
    "professional_email": "Professional email",
    "personal_email": "Personal email",
    "phone": "Phone",
    "address": "Address",
    "hire_date": "Hire date",
    "contract_type": "Contract type",
    "contract_start_date": "Contract start",
    "contract_end_date": "Contract end",
    "status": "Status",
    "department": "Department",
    "position": "Position",
    "manager": "Manager",
    "emergency_contact_name": "Emergency contact",
    "emergency_contact_phone": "Emergency contact's phone",
    "archived_at": "Leaving date",
    "archive_reason": "Reason for leaving",
    "document": "Document",
    "visible_to_employee": "Shared with the employee"
  },
  "gender": {
    "female": "Female",
    "male": "Male",
    "unspecified": "Not specified"
  },
  "contract": {
    "permanent": "Permanent",
    "fixed_term": "Fixed term",
    "temporary": "Temporary",
    "consultant": "Consultant"
  },
  "record": {
    "edit": "Edit",
    "loading": "Loading…"
  },
  "facts": {
    "number": "Number",
    "department": "Department",
    "position": "Position",
    "manager": "Manager",
    "contract": "Contract",
    "status": "Status",
    "account": "Account",
    "departure": "Departure",
    "email": "Email",
    "phone": "Phone",
    "noManager": "No manager",
    "contractSince": "{{type}}, since {{date}}",
    "contractUntil": "{{type}}, from {{start}} to {{end}}",
    "departureValue": "{{date}}. Reason: {{reason}}"
  },
  "account": {
    "exists": "Account exists",
    "missing": "No account yet"
  },
  "blocks": {
    "personal": "Personal details",
    "team": "Team",
    "documents": "Documents",
    "history": "History"
  },
  "personal": {
    "none": "Not provided"
  },
  "team": {
    "reports": "Direct reports",
    "noReports": "Nobody reports to this person.",
    "delegation": "Delegation",
    "delegationLine": "{{name}}, from {{start}} to {{end}}",
    "noDelegation": "No current or upcoming delegation.",
    "changeManager": "Change manager",
    "nameDelegate": "Name a delegate"
  },
  "documents": {
    "empty": "No document.",
    "add": "Add a document",
    "addedBy": "added by {{name}} on {{date}}",
    "download": "Download {{name}}",
    "share": "Share {{label}} with the employee",
    "shareShort": "Shared",
    "shared": "Shared with the employee",
    "notShared": "HR only",
    "sheet": {
      "title": "Add a document",
      "file": "File",
      "fileHint": "Accepted formats: PDF, JPG, PNG.",
      "label": "Label",
      "shared": "Share with the employee",
      "submit": "Add",
      "done": "Document added."
    }
  },
  "history": {
    "empty": "No change recorded.",
    "by": "{{actor}}, on {{date}}",
    "system": "System",
    "change": "{{field}}: {{before}} → {{after}}",
    "blank": "(empty)",
    "yes": "Yes",
    "no": "No",
    "actions": {
      "employee": {
        "created": "Record created",
        "updated": "Record changed",
        "archived": "Departure recorded"
      },
      "document": {
        "added": "Document added",
        "visibility_changed": "Document sharing changed"
      }
    }
  },
  "departure": {
    "action": "Record a departure",
    "title": "Record the departure of {{name}}",
    "date": "Leaving date",
    "reason": "Reason",
    "consequences": "What will happen",
    "account": "The account is disabled at once: this person can no longer sign in.",
    "credit": "No monthly leave credit is added after the leaving date.",
    "kept": "The record is kept and HR can still find it.",
    "reports": "These people report to this employee and will need a new manager:",
    "sections": {
      "delegations": "These delegations will end:",
      "open_requests": "These requests stay open:",
      "open_steps": "These decisions are waiting for this person:"
    },
    "confirm": "Record the departure",
    "done": "Departure recorded."
  },
  "settingsIndex": {
    "title": "Settings",
    "departments": {
      "title": "Departments and positions",
      "description": "The company's units and the job titles offered on employee records."
    }
  },
  "structure": {
    "title": "Departments and positions",
    "tabs": {
      "departments": "Departments",
      "positions": "Positions"
    },
    "addDepartment": "Add a department",
    "addPosition": "Add a position",
    "columns": {
      "code": "Code",
      "name": "Name",
      "title": "Title",
      "grade": "Grade",
      "employees": "Employees",
      "state": "State",
      "action": "Action"
    },
    "edit": "Edit",
    "editItem": "Edit {{code}}",
    "active": "Active",
    "inactive": "Inactive",
    "inUse": "An item in use can be deactivated, not removed. It stays on existing records and is no longer offered for new ones.",
    "saved": "Saved.",
    "sheet": {
      "newDepartment": "New department",
      "editDepartment": "Edit department {{code}}",
      "newPosition": "New position",
      "editPosition": "Edit position {{code}}"
    },
    "fields": {
      "code": "Code",
      "name_fr": "Name in French",
      "name_en": "Name in English",
      "title_fr": "Title in French",
      "title_en": "Title in English",
      "grade": "Grade",
      "is_active": "Active"
    },
    "empty": {
      "departments": "No department. Add the first one.",
      "positions": "No position. Add the first one."
    }
  },
  "picker": {
    "choose": "Choose a person…",
    "none": "Nobody"
  },
  "people": {
    "title": "People",
    "columns": {
      "name": "Name",
      "position": "Position"
    },
    "empty": {
      "title": "Nobody reports to you",
      "hint": "The people you manage, or who are entrusted to you by delegation, appear here."
    }
  },
  "accountFor": {
    "employee": "Employee",
    "none": "None: an account without an employee record",
    "hint": "The account will use the name on the record and the address {{email}}."
  }
}
```

Run: `docker compose run --rm web npx vitest run src/i18n`
Expected: PASS; the parity test now compares the two `employees.json` files

- [ ] **Step 3: Write the failing tests**

`frontend/src/features/employees/api.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { documentFormData, isFullRecord } from "./api";
import { makeEmployee, makeTeamMember } from "./testing";

describe("isFullRecord", () => {
  it("tells the whole record from the team view", () => {
    expect(isFullRecord(makeEmployee())).toBe(true);
    expect(isFullRecord(makeTeamMember())).toBe(false);
  });
});

describe("documentFormData", () => {
  it("names the three parts the API reads", () => {
    const file = new File(["%PDF-1.4"], "contrat.pdf", { type: "application/pdf" });

    const form = documentFormData({ file, label: "Contrat", visible_to_employee: false });

    expect([...form.keys()].sort()).toEqual(["file", "label", "visible_to_employee"]);
    expect(form.get("visible_to_employee")).toBe("false");
  });
});
```

`frontend/src/features/employees/EmployeePicker.test.tsx`

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { EmployeePicker } from "./EmployeePicker";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

describe("EmployeePicker", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([
          { public_id: "emp-4", name: "Amal Employee", department: "Souscription" },
          { public_id: "emp-6", name: "Nadia Manager", department: "Sinistres" },
        ]),
      ),
    );
  });

  it("lists active people with their department and reports the choice", async () => {
    const onChange = vi.fn();

    renderApp(<EmployeePicker label="Délégué" value={null} onChange={onChange} exclude={["emp-6"]} />, { me: manager });

    await screen.findByRole("option", { name: "Amal Employee · Souscription" });
    expect(screen.queryByRole("option", { name: /Nadia Manager/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Choisir une personne…" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-4");
    expect(onChange).toHaveBeenCalledWith("emp-4");
  });

  it("can offer nobody, and shows its error next to the choice", async () => {
    const onChange = vi.fn();

    renderApp(
      <EmployeePicker
        label="Responsable"
        value="emp-4"
        onChange={onChange}
        allowNone
        noneLabel="Aucun responsable"
        error="Choisissez une autre personne."
      />,
      { me: manager },
    );

    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    const select = screen.getByLabelText("Responsable");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choisissez une autre personne.")).toBeInTheDocument();
    await userEvent.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/employees`
Expected: FAIL, `Failed to resolve import "./api"` and `"./EmployeePicker"`

- [ ] **Step 4: Write the hooks**

`frontend/src/features/employees/api.ts`

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type {
  ArchivePreview,
  Department,
  DepartmentChanges,
  DepartmentPayload,
  Departure,
  Employee,
  EmployeeBrief,
  EmployeeChanges,
  EmployeeDetail,
  EmployeeDocument,
  EmployeePayload,
  EmployeeQuery,
  EmployeeRow,
  Position,
  PositionChanges,
  PositionPayload,
  TeamMember,
} from "@/api/types";

export type {
  ArchivePreview,
  Department,
  Employee,
  EmployeeBrief,
  EmployeeChanges,
  EmployeeDetail,
  EmployeeDocument,
  EmployeePayload,
  EmployeeRow,
  Position,
  TeamMember,
};
export type EmployeeListParams = EmployeeQuery;

export const employeeKeys = {
  all: ["employees"] as const,
  list: (params: EmployeeListParams) => ["employees", "list", params] as const,
  detail: (id: string) => ["employees", "detail", id] as const,
  me: ["employees", "me"] as const,
  directory: ["employees", "directory"] as const,
  documents: (id: string) => ["employees", "documents", id] as const,
  history: (id: string, page: number) => ["employees", "history", id, page] as const,
  archivePreview: (id: string) => ["employees", "archive-preview", id] as const,
};

export const structureKeys = {
  all: ["structure"] as const,
  departments: ["structure", "departments"] as const,
  positions: ["structure", "positions"] as const,
};

/** The whole record has an employee number; the team view a manager receives does not. */
export function isFullRecord(employee: EmployeeDetail): employee is Employee {
  return "employee_number" in employee;
}

// --- Reading ----------------------------------------------------------------------------------

export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/employees", { params: { query: params } })),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: employeeKeys.detail(id ?? ""),
    queryFn: () => call(api.GET("/api/v1/employees/{public_id}", { params: { path: { public_id: id ?? "" } } })),
    enabled: Boolean(id),
  });
}

export function useMyEmployee(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.me,
    queryFn: () => call(api.GET("/api/v1/employees/me")),
    enabled,
  });
}

export function useEmployeeDirectory() {
  return useQuery({
    queryKey: employeeKeys.directory,
    queryFn: () => call(api.GET("/api/v1/employees/directory")),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: structureKeys.departments,
    queryFn: () => call(api.GET("/api/v1/departments")),
  });
}

export function usePositions() {
  return useQuery({
    queryKey: structureKeys.positions,
    queryFn: () => call(api.GET("/api/v1/positions")),
  });
}

export function useEmployeeDocuments(id: string) {
  return useQuery({
    queryKey: employeeKeys.documents(id),
    queryFn: () =>
      call(api.GET("/api/v1/employees/{public_id}/documents", { params: { path: { public_id: id } } })),
  });
}

export function useEmployeeHistory(id: string, page: number) {
  return useQuery({
    queryKey: employeeKeys.history(id, page),
    queryFn: () =>
      call(
        api.GET("/api/v1/employees/{public_id}/history", {
          params: { path: { public_id: id }, query: { page } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useArchivePreview(id: string) {
  return useQuery({
    queryKey: employeeKeys.archivePreview(id),
    queryFn: () =>
      call(api.GET("/api/v1/employees/{public_id}/archive-preview", { params: { path: { public_id: id } } })),
  });
}

// --- Writing ----------------------------------------------------------------------------------

/** Every write on an employee changes lists, records and histories: refresh them all. */
function useRefreshEmployees() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: employeeKeys.all });
}

export function useCreateEmployee() {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (body: EmployeePayload) => call(api.POST("/api/v1/employees", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateEmployee(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (body: EmployeeChanges) =>
      call(api.PATCH("/api/v1/employees/{public_id}", { params: { path: { public_id: id } }, body })),
    onSuccess: refresh,
  });
}

export function useArchiveEmployee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Departure) =>
      call(api.POST("/api/v1/employees/{public_id}/archive", { params: { path: { public_id: id } }, body })),
    // A departure also ends delegations. On a refusal (someone else recorded it) the record is read again too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["delegations"] }),
      ]),
  });
}

function useRefreshStructure() {
  const queryClient = useQueryClient();
  // Department and position names appear on employee lists and records.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: structureKeys.all }),
      queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
    ]);
}

export function useSaveDepartment() {
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: DepartmentPayload | DepartmentChanges }): Promise<Department> =>
      id === undefined
        ? call(api.POST("/api/v1/departments", { body: body as DepartmentPayload }))
        : call(api.PATCH("/api/v1/departments/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  });
}

export function useSavePosition() {
  const refresh = useRefreshStructure();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: PositionPayload | PositionChanges }): Promise<Position> =>
      id === undefined
        ? call(api.POST("/api/v1/positions", { body: body as PositionPayload }))
        : call(api.PATCH("/api/v1/positions/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  });
}

export interface NewDocument {
  file: File;
  label: string;
  visible_to_employee: boolean;
}

/** The multipart body of `POST employees/{id}/documents`. */
export function documentFormData(input: NewDocument): FormData {
  const form = new FormData();
  form.append("file", input.file);
  form.append("label", input.label);
  form.append("visible_to_employee", String(input.visible_to_employee));
  return form;
}

export function useAddDocument(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (input: NewDocument) =>
      call(
        api.POST("/api/v1/employees/{public_id}/documents", {
          params: { path: { public_id: id } },
          // The generated type describes the file part as a string; the browser sends the File itself,
          // and openapi-fetch leaves the Content-Type to the browser when the body is a FormData.
          body: { file: "", label: input.label, visible_to_employee: input.visible_to_employee },
          bodySerializer: () => documentFormData(input),
        }),
      ),
    onSuccess: refresh,
  });
}

export function useSetDocumentVisibility(id: string) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (change: { id: number; visible_to_employee: boolean }) =>
      call(
        api.PATCH("/api/v1/employees/{public_id}/documents/{id}", {
          params: { path: { public_id: id, id: change.id } },
          body: { visible_to_employee: change.visible_to_employee },
        }),
      ),
    onSuccess: refresh,
  });
}
```

Run: `docker compose run --rm web npm run typecheck`
Expected: exit code 0. If `useAddDocument` does not compile because the generated multipart body has other property names, open the operation `employee_documents_add` in `src/api/schema.d.ts` and write the placeholder `body` with exactly its properties; the bytes sent are those of `documentFormData`.

- [ ] **Step 5: Write the fixtures, the status badge and the picker**

`frontend/src/features/employees/testing.ts`

```ts
import type { FieldProblem } from "@/api/problem";
import type { Department, Employee, EmployeeDocument, EmployeeRow, Position, TeamMember } from "@/api/types";
import { makePage, problemResponse } from "@/test/fixtures";

export const pageOf = makePage;

/** A problem answer from the list of its field problems; the first one gives the general message. */
export function problem(status: number, code: string, errors: Partial<FieldProblem>[] = []) {
  return problemResponse(status, code, errors[0]?.detail ?? "", errors);
}

export function makeDepartment(overrides: Partial<Department> = {}): Department {
  return {
    id: 1,
    code: "UW",
    name_fr: "Souscription",
    name_en: "Underwriting",
    name: "Souscription",
    is_active: true,
    employee_count: 3,
    ...overrides,
  };
}

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 4,
    code: "OFF",
    title_fr: "Chargé de clientèle",
    title_en: "Account officer",
    title: "Chargé de clientèle",
    grade: "C1",
    is_active: true,
    employee_count: 4,
    ...overrides,
  };
}

const department = { id: 1, code: "UW", name: "Souscription" };
const position = { id: 4, code: "OFF", title: "Chargé de clientèle" };

export function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    public_id: "emp-1",
    first_name: "Amal",
    last_name: "Employee",
    name: "Amal Employee",
    department,
    position,
    professional_email: "employee.a1@impactrisks.com",
    phone: "20 123 456",
    ...overrides,
  };
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    ...makeTeamMember(),
    employee_number: "E004",
    date_of_birth: "1992-04-11",
    gender: "female",
    personal_email: "",
    address: "",
    hire_date: "2021-06-01",
    contract_start_date: null,
    contract_end_date: null,
    contract_type: "permanent",
    status: "active",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    emergency_contact_name: "",
    emergency_contact_phone: "",
    archived_at: null,
    archive_reason: "",
    has_account: true,
    created_at: "2026-10-01T09:00:00+01:00",
    updated_at: "2026-10-01T09:00:00+01:00",
    ...overrides,
  };
}

export function makeEmployeeRow(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    public_id: "emp-1",
    name: "Amal Employee",
    department,
    position,
    professional_email: "employee.a1@impactrisks.com",
    phone: "20 123 456",
    employee_number: "E004",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    status: "active",
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<EmployeeDocument> = {}): EmployeeDocument {
  return {
    id: 11,
    label: "Contrat",
    visible_to_employee: false,
    attachment: { public_id: "att-1", name: "contrat.pdf", size: 52, content_type: "application/pdf" },
    added_by: "Senna RH",
    added_at: "2026-10-02T10:00:00+01:00",
    ...overrides,
  };
}
```

`frontend/src/features/employees/ui.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { active: "approved", suspended: "waiting", archived: "neutral" } as const;

/** Where an employee stands, as a sentence with a coloured dot. */
export function EmployeeStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("employees");
  const tone = TONES[status as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`status.${status}`)}</StatusBadge>;
}
```

`frontend/src/features/employees/EmployeePicker.tsx`

```tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { describedBy, Field } from "@/components";
import { NativeSelect } from "@/components/ui/native-select";

import { useEmployeeDirectory } from "./api";

interface EmployeePickerProps {
  label: string;
  /** The `public_id` of the chosen employee, or null. */
  value: string | null;
  onChange: (publicId: string | null) => void;
  /** People who must not be offered (the manager when choosing their delegate, the employee when choosing their manager). */
  exclude?: string[];
  error?: string;
  hint?: string;
  /** Offer "nobody" as a real choice, worded by `noneLabel`. */
  allowNone?: boolean;
  noneLabel?: string;
}

/** One active employee, chosen from the directory. The browser's own select: it works everywhere and searches as you type. */
export function EmployeePicker({
  label,
  value,
  onChange,
  exclude = [],
  error,
  hint,
  allowNone = false,
  noneLabel,
}: EmployeePickerProps) {
  const { t } = useTranslation("employees");
  const id = useId();
  const directory = useEmployeeDirectory();
  const people = (directory.data ?? []).filter((person) => !exclude.includes(person.public_id));
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <NativeSelect
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
      >
        <option value="">{allowNone ? (noneLabel ?? t("picker.none")) : t("picker.choose")}</option>
        {people.map((person) => (
          <option key={person.public_id} value={person.public_id}>
            {person.name} · {person.department}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `docker compose run --rm web npx vitest run src/features/employees src/i18n`
Expected: PASS (2 tests in `api.test.ts`, 2 in `EmployeePicker.test.tsx`, the parity test)

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: both exit with code 0. If a fixture of `testing.ts` does not match a generated type, the serializer of Part A and the fixture disagree on a field: correct the fixture, it must be what the API returns.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/features/employees frontend/src/i18n/locales
git commit -m "feat(employees): types, hooks, employee picker and texts"
```

### Task 13: HR desk: the employee directory and the employee form

**Files:**
- Create: `frontend/src/features/employees/EmployeesPage.tsx`, `frontend/src/features/employees/EmployeeFormPage.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx` (two imports, three routes appended)
- Test: `frontend/src/features/employees/EmployeesPage.test.tsx`, `frontend/src/features/employees/EmployeeFormPage.test.tsx`

**Interfaces:**
- Consumes: from Task 12 `useEmployees`, `useEmployee`, `useDepartments`, `usePositions`, `useCreateEmployee`, `useUpdateEmployee`, `isFullRecord`, `EmployeePicker`, `EmployeeStatusBadge`, the fixtures of `testing.ts`; from plan 01b `PageHeader`, `PageLoading`, `DataTable` (`Column<T>`), `Pager` (`{ page, pageSize, total, onPage }`), `FilterBar`, `FilterText`, `FilterSelect`, `useListParams`, `EmptyState`, `TextField`, `TextAreaField`, `DateField`, `SelectField` (`options`, `placeholder`), `FormSummary`, `useProblemForm`, `ProblemBoundary`, `toast(message)`, `Button` (`variant="primary"` for the page's one primary action; the default variant is the secondary one), `renderApp(ui, { route, path, me })`.
- Produces:
  - `EmployeesPage` (default export), props `{ mode: "hr" | "overview" }`. In `overview` mode it renders no action and links to `/overview/people/:id`.
  - `EmployeeFormPage` (default export), no props; creates on `/hr/employees/new`, edits on `/hr/employees/:id/edit`, then opens `/hr/employees/:id`.
  - Routes `/hr/employees`, `/hr/employees/new`, `/hr/employees/:id/edit`. The "Employees" entry of the HR desk navigation appears.

- [ ] **Step 1: Write the failing directory tests**

`frontend/src/features/employees/EmployeesPage.test.tsx`

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeesPage from "./EmployeesPage";
import { makeDepartment, makeEmployeeRow, pageOf } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const executive = makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] });

describe("EmployeesPage", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/departments", () => HttpResponse.json([makeDepartment()])));
  });

  it("lists each employee with six attributes and links to the record", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([makeEmployeeRow()]))));

    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    const name = await screen.findByRole("link", { name: "Amal Employee" });
    expect(name).toHaveAttribute("href", "/hr/employees/emp-1");
    // The filters offer "Souscription" and "En poste" too, so look inside the table.
    const table = within(screen.getByRole("table", { name: "Employés" }));
    expect(table.getAllByRole("columnheader")).toHaveLength(6);
    for (const text of ["E004", "Souscription", "Chargé de clientèle", "Mounir Manager", "En poste"]) {
      expect(table.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Nouvel employé" })).toHaveAttribute("href", "/hr/employees/new");
  });

  it("sends the search and asks for people who left only on request", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("/api/v1/employees", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json(pageOf([]));
      }),
    );
    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.at(-1)?.get("scope")).toBe("all");
    expect(seen.at(-1)?.get("status")).toBeNull();

    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher" }), "amal");
    await waitFor(() => expect(seen.at(-1)?.get("search")).toBe("amal"));

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Statut" }), "archived");
    await waitFor(() => expect(seen.at(-1)?.get("status")).toBe("archived"));

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Département" }), "1");
    await waitFor(() => expect(seen.at(-1)?.get("department")).toBe("1"));
  });

  it("says why the list is empty", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([]))));

    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: hr });

    expect(await screen.findByText("Aucun employé ne correspond")).toBeInTheDocument();
    expect(screen.getByText("Modifiez la recherche ou les filtres.")).toBeInTheDocument();
  });

  it("shows no action to an executive", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([makeEmployeeRow()]))));

    renderApp(<EmployeesPage mode="overview" />, { route: "/overview/people", me: executive });

    const name = await screen.findByRole("link", { name: "Amal Employee" });
    expect(name).toHaveAttribute("href", "/overview/people/emp-1");
    expect(screen.getByRole("heading", { level: 1, name: "Personnes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nouvel employé" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeesPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./EmployeesPage"`

- [ ] **Step 2: Write the directory page**

`frontend/src/features/employees/EmployeesPage.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  type Column,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterText,
  PageHeader,
  Pager,
  useListParams,
} from "@/components";
import { Button } from "@/components/ui/button";

import { type EmployeeListParams, type EmployeeRow, useDepartments, useEmployees } from "./api";
import { EmployeeStatusBadge } from "./ui";

const PAGE_SIZE = 25;

export default function EmployeesPage({ mode }: { mode: "hr" | "overview" }) {
  const { t } = useTranslation("employees");
  const { filters, page, setFilter, setPage } = useListParams({ search: "", department: "", status: "" });
  const departments = useDepartments();
  const list = useEmployees({
    scope: "all",
    search: filters.search || undefined,
    department: filters.department ? Number(filters.department) : undefined,
    status: (filters.status || undefined) as EmployeeListParams["status"],
    page,
  });
  const recordBase = mode === "hr" ? "/hr/employees" : "/overview/people";
  // The page carries the name its workspace gives it in the navigation.
  const title = t(mode === "hr" ? "directory.title" : "directory.titleOverview");

  if (list.error) {
    throw list.error;
  }

  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: t("directory.columns.name"),
      cell: (row: EmployeeRow) => (
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to={`${recordBase}/${row.public_id}`}
        >
          {row.name}
        </Link>
      ),
    },
    { key: "number", header: t("directory.columns.number"), cell: (row: EmployeeRow) => row.employee_number },
    { key: "department", header: t("directory.columns.department"), cell: (row: EmployeeRow) => row.department.name },
    { key: "position", header: t("directory.columns.position"), cell: (row: EmployeeRow) => row.position.title },
    {
      key: "manager",
      header: t("directory.columns.manager"),
      cell: (row: EmployeeRow) => row.manager?.name ?? t("directory.noManager"),
    },
    {
      key: "status",
      header: t("directory.columns.status"),
      cell: (row: EmployeeRow) => (row.status ? <EmployeeStatusBadge status={row.status} /> : null),
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        primary={
          mode === "hr" ? (
            <Button variant="primary" asChild>
              <Link to="/hr/employees/new">{t("directory.new")}</Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar>
        <FilterText
          label={t("directory.search")}
          value={filters.search}
          onChange={(value) => setFilter("search", value)}
        />
        <FilterSelect
          label={t("directory.department")}
          value={filters.department}
          onChange={(value) => setFilter("department", value)}
          options={[
            { value: "", label: t("directory.allDepartments") },
            ...(departments.data ?? []).map((department) => ({
              value: String(department.id),
              label: department.name,
            })),
          ]}
        />
        <FilterSelect
          label={t("directory.status")}
          value={filters.status}
          onChange={(value) => setFilter("status", value)}
          options={[
            { value: "", label: t("directory.statusCurrent") },
            { value: "active", label: t("status.active") },
            { value: "suspended", label: t("status.suspended") },
            { value: "archived", label: t("status.archived") },
          ]}
        />
      </FilterBar>
      <DataTable
        label={title}
        columns={columns}
        rows={list.data?.results ?? []}
        rowKey={(row: EmployeeRow) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t("directory.empty.title")} hint={t("directory.empty.hint")} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeesPage.test.tsx`
Expected: 4 passed

- [ ] **Step 3: Write the failing form tests**

`frontend/src/features/employees/EmployeeFormPage.test.tsx`

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeeFormPage from "./EmployeeFormPage";
import { makeDepartment, makeEmployee, makePosition, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

/** `renderApp` shows `data-testid="elsewhere"` with the address once the page navigates away. */
function mount(route: string) {
  const path = route.endsWith("/new") ? "/hr/employees/new" : "/hr/employees/:id/edit";
  return renderApp(
    <ProblemBoundary>
      <EmployeeFormPage />
    </ProblemBoundary>,
    { route, path, me: hr },
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("EmployeeFormPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/departments", () => HttpResponse.json([makeDepartment()])),
      http.get("/api/v1/positions", () => HttpResponse.json([makePosition()])),
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([{ public_id: "emp-3", name: "Mounir Manager", department: "Souscription" }]),
      ),
    );
  });

  it("names the mandatory fields before calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/employees", () => {
        posted = true;
        return HttpResponse.json(makeEmployee(), { status: 201 });
      }),
    );
    mount("/hr/employees/new");

    await userEvent.click(await screen.findByRole("button", { name: "Enregistrer" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(8);
    expect(posted).toBe(false);
  });

  it("creates an employee and opens the record", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post("/api/v1/employees", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeEmployee({ public_id: "new-1" }), { status: 201 });
      }),
    );
    mount("/hr/employees/new");
    await screen.findByRole("option", { name: "Souscription" });
    await screen.findByRole("option", { name: "Chargé de clientèle" });
    await screen.findByRole("option", { name: "Mounir Manager · Souscription" });

    fill("Matricule", "E100");
    fill("Prénom", "Nour");
    fill("Nom", "Nouvelle");
    fill("E-mail professionnel", "nour.nouvelle@impactrisks.com");
    fill("Date d'embauche", "2026-11-02");
    fill("Type de contrat", "permanent");
    fill("Département", "1");
    fill("Poste", "4");
    fill("Responsable", "emp-3");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/hr/employees/new-1");
    expect(body).toMatchObject({
      employee_number: "E100",
      first_name: "Nour",
      last_name: "Nouvelle",
      professional_email: "nour.nouvelle@impactrisks.com",
      hire_date: "2026-11-02",
      contract_type: "permanent",
      department: 1,
      position: 4,
      manager: "emp-3",
      date_of_birth: null,
      contract_end_date: null,
    });
    expect(body).not.toHaveProperty("status");
  });

  it("shows server problems next to their fields and keeps what was typed", async () => {
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.patch("/api/v1/employees/emp-1", () =>
        problem(400, "organisation.number_taken", [
          {
            field: "employee_number",
            code: "organisation.number_taken",
            detail: "Ce matricule est déjà utilisé. Saisissez un autre matricule.",
          },
          {
            field: "manager",
            code: "organisation.manager_loop",
            detail: "Cette personne dépend, directement ou non, de l'employé.",
          },
        ]),
      ),
    );
    mount("/hr/employees/emp-1/edit");
    await waitFor(() => expect(screen.getByLabelText("Matricule")).toHaveValue("E004"));

    fill("Téléphone", "71 000 000");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Ce matricule est déjà utilisé. Saisissez un autre matricule.")).toBeInTheDocument();
    expect(screen.getByText("Cette personne dépend, directement ou non, de l'employé.")).toBeInTheDocument();
    expect(screen.getByLabelText("Téléphone")).toHaveValue("71 000 000");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("sends the status only when editing", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.patch("/api/v1/employees/emp-1", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeEmployee({ status: "suspended" }));
      }),
    );
    mount("/hr/employees/emp-1/edit");
    await waitFor(() => expect(screen.getByLabelText("Matricule")).toHaveValue("E004"));

    fill("Statut", "suspended");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/hr/employees/emp-1");
    expect(body).toMatchObject({ status: "suspended", employee_number: "E004", manager: "emp-3" });
  });

  it("says not available when the record cannot be read", async () => {
    server.use(http.get("/api/v1/employees/nobody", () => problem(404, "core.not_found", [])));

    mount("/hr/employees/nobody/edit");

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
```

The page throws what the API answered and the shell's `ProblemBoundary` draws "Non disponible" (`errors:notAvailable.title`), so the test wraps the page in the same boundary.

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeeFormPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./EmployeeFormPage"`

- [ ] **Step 4: Write the form page**

`frontend/src/features/employees/EmployeeFormPage.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";

import {
  DateField,
  FormSummary,
  PageHeader,
  PageLoading,
  SelectField,
  TextAreaField,
  TextField,
  toast,
  useProblemForm,
} from "@/components";
import { Button } from "@/components/ui/button";

import {
  type Employee,
  type EmployeePayload,
  isFullRecord,
  useCreateEmployee,
  useDepartments,
  useEmployee,
  usePositions,
  useUpdateEmployee,
} from "./api";
import { EmployeePicker } from "./EmployeePicker";

function buildSchema(required: string) {
  const text = z.string().trim();
  const mandatory = text.min(1, required);
  return z.object({
    employee_number: mandatory,
    first_name: mandatory,
    last_name: mandatory,
    date_of_birth: z.string(),
    gender: z.string(),
    professional_email: mandatory,
    personal_email: text,
    phone: text,
    address: text,
    hire_date: z.string().min(1, required),
    contract_type: z.string().min(1, required),
    contract_start_date: z.string(),
    contract_end_date: z.string(),
    status: z.string(),
    department: z.string().min(1, required),
    position: z.string().min(1, required),
    manager: z.string(),
    emergency_contact_name: text,
    emergency_contact_phone: text,
  });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: Values = {
  employee_number: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  professional_email: "",
  personal_email: "",
  phone: "",
  address: "",
  hire_date: "",
  contract_type: "",
  contract_start_date: "",
  contract_end_date: "",
  status: "active",
  department: "",
  position: "",
  manager: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

function fromEmployee(employee: Employee): Values {
  return {
    employee_number: employee.employee_number,
    first_name: employee.first_name,
    last_name: employee.last_name,
    date_of_birth: employee.date_of_birth ?? "",
    gender: employee.gender,
    professional_email: employee.professional_email,
    personal_email: employee.personal_email,
    phone: employee.phone,
    address: employee.address,
    hire_date: employee.hire_date,
    contract_type: employee.contract_type,
    contract_start_date: employee.contract_start_date ?? "",
    contract_end_date: employee.contract_end_date ?? "",
    status: employee.status === "suspended" ? "suspended" : "active",
    department: String(employee.department.id),
    position: String(employee.position.id),
    manager: employee.manager?.public_id ?? "",
    emergency_contact_name: employee.emergency_contact_name,
    emergency_contact_phone: employee.emergency_contact_phone,
  };
}

function toPayload(values: Values, editing: boolean): EmployeePayload {
  const { status, ...rest } = values;
  return {
    ...rest,
    date_of_birth: values.date_of_birth || null,
    contract_start_date: values.contract_start_date || null,
    contract_end_date: values.contract_end_date || null,
    department: Number(values.department),
    position: Number(values.position),
    manager: values.manager || null,
    ...(editing ? { status } : {}),
  } as EmployeePayload;
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t } = useTranslation("employees");
  const navigate = useNavigate();
  const existing = useEmployee(id);
  const departments = useDepartments();
  const positions = usePositions();
  const create = useCreateEmployee();
  const update = useUpdateEmployee(id ?? "");

  const record = existing.data && isFullRecord(existing.data) ? existing.data : undefined;
  const loaded = useMemo(() => (record ? fromEmployee(record) : undefined), [record]);
  const form = useForm<Values>({
    resolver: zodResolver(buildSchema(t("form.required"))),
    defaultValues: EMPTY,
    values: loaded,
  });
  const { onError, summary } = useProblemForm(form);

  if (editing && existing.isPending) {
    return <PageLoading />;
  }
  if (editing && existing.error) {
    throw existing.error;
  }

  const back = record ? `/hr/employees/${record.public_id}` : "/hr/employees";
  const submit = form.handleSubmit((values) => {
    const options = {
      onSuccess: (saved: Employee) => {
        toast(t("form.saved"));
        navigate(`/hr/employees/${saved.public_id}`);
      },
      // A problem on a field this form does not have lands in the summary above the form.
      onError,
    };
    if (editing) {
      update.mutate(toPayload(values, true), options);
    } else {
      create.mutate(toPayload(values, false), options);
    }
  });

  // A deactivated department or position is offered only to the record that already uses it.
  const departmentOptions = (departments.data ?? [])
    .filter((item) => item.is_active || String(item.id) === loaded?.department)
    .map((item) => ({ value: String(item.id), label: item.name }));
  const positionOptions = (positions.data ?? [])
    .filter((item) => item.is_active || String(item.id) === loaded?.position)
    .map((item) => ({ value: String(item.id), label: item.title }));
  const sectionClass = "grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-2";
  const legendClass = "text-section font-semibold md:col-span-2";

  return (
    <>
      <PageHeader
        title={record ? t("form.titleEdit", { name: record.name }) : t("form.titleNew")}
        back={back}
      />
      <form onSubmit={submit} noValidate className="grid max-w-4xl gap-6">
        <FormSummary problems={summary} />

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.identity")}</h2>
          <TextField control={form.control} name="employee_number" label={t("fields.employee_number")} />
          <span className="max-md:hidden" />
          <TextField control={form.control} name="first_name" label={t("fields.first_name")} />
          <TextField control={form.control} name="last_name" label={t("fields.last_name")} />
          <DateField control={form.control} name="date_of_birth" label={t("fields.date_of_birth")} />
          <SelectField
            control={form.control}
            name="gender"
            label={t("fields.gender")}
            options={[
              { value: "", label: t("gender.unspecified") },
              { value: "female", label: t("gender.female") },
              { value: "male", label: t("gender.male") },
            ]}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.contact")}</h2>
          <TextField
            control={form.control}
            name="professional_email"
            type="email"
            label={t("fields.professional_email")}
            hint={t("form.emailHint")}
          />
          <TextField control={form.control} name="personal_email" type="email" label={t("fields.personal_email")} />
          <TextField control={form.control} name="phone" label={t("fields.phone")} />
          <TextAreaField control={form.control} name="address" label={t("fields.address")} />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.contract")}</h2>
          <DateField control={form.control} name="hire_date" label={t("fields.hire_date")} />
          <SelectField
            control={form.control}
            name="contract_type"
            label={t("fields.contract_type")}
            placeholder={t("form.choose")}
            options={[
              { value: "permanent", label: t("contract.permanent") },
              { value: "fixed_term", label: t("contract.fixed_term") },
              { value: "temporary", label: t("contract.temporary") },
              { value: "consultant", label: t("contract.consultant") },
            ]}
          />
          <DateField control={form.control} name="contract_start_date" label={t("fields.contract_start_date")} />
          <DateField control={form.control} name="contract_end_date" label={t("fields.contract_end_date")} />
          {editing ? (
            <SelectField
              control={form.control}
              name="status"
              label={t("fields.status")}
              options={[
                { value: "active", label: t("status.active") },
                { value: "suspended", label: t("status.suspended") },
              ]}
            />
          ) : null}
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.organisation")}</h2>
          <SelectField
            control={form.control}
            name="department"
            label={t("fields.department")}
            placeholder={t("form.choose")}
            options={departmentOptions}
          />
          <SelectField
            control={form.control}
            name="position"
            label={t("fields.position")}
            placeholder={t("form.choose")}
            options={positionOptions}
          />
          <Controller
            control={form.control}
            name="manager"
            render={({ field, fieldState }) => (
              <EmployeePicker
                label={t("fields.manager")}
                value={field.value || null}
                onChange={(value) => field.onChange(value ?? "")}
                exclude={id ? [id] : []}
                allowNone
                noneLabel={t("form.noManager")}
                error={fieldState.error?.message}
              />
            )}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("form.sections.emergency")}</h2>
          <TextField
            control={form.control}
            name="emergency_contact_name"
            label={t("fields.emergency_contact_name")}
          />
          <TextField
            control={form.control}
            name="emergency_contact_phone"
            label={t("fields.emergency_contact_phone")}
          />
        </section>

        <div className="flex gap-3">
          <Button variant="primary" type="submit">{t("form.save")}</Button>
          <Button variant="ghost" asChild>
            <Link to={back}>{t("form.cancel")}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeeFormPage.test.tsx`
Expected: 5 passed

The bound inputs of plan 01b are native controls reachable by their label (`<input>`, `<input type="date">`, `<select>`), which is why `fireEvent.change` on `getByLabelText` drives every one of them.

- [ ] **Step 5: Register the routes**

In `frontend/src/workspaces/hr/routes.tsx` (plan 01b left the array empty), add below the existing import (with `import { lazy } from "react";`, which the file does not have yet):

```tsx
const EmployeesPage = lazy(() => import("@/features/employees/EmployeesPage"));
const EmployeeFormPage = lazy(() => import("@/features/employees/EmployeeFormPage"));
```

and append these elements to the `hrRoutes` array:

```tsx
  { path: "employees", element: <EmployeesPage mode="hr" /> },
  { path: "employees/new", element: <EmployeeFormPage /> },
  { path: "employees/:id/edit", element: <EmployeeFormPage /> },
```

- [ ] **Step 6: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features/employees src/i18n`
Expected: no lint or type error; all tests pass, including the French and English key parity test

Open `http://localhost:5173`, sign in as `hr@impactrisks.com` (`Correct-Horse-42!`). Expected: the HR desk shows "Employés" in its navigation and opens on it (the desk itself arrives with plan 03b); the list shows the eight demo people; "Nouvel employé" opens the form; at phone width the list becomes cards and the form a single column.

```bash
git add frontend/src/features/employees frontend/src/workspaces/hr/routes.tsx
git commit -m "feat(employees): HR directory and employee form"
```

### Task 14: My team: delegations

**Files:**
- Create: `frontend/src/features/delegations/api.ts`, `frontend/src/features/delegations/testing.ts`, `frontend/src/features/delegations/DelegationStateBadge.tsx`, `frontend/src/features/delegations/DelegationSheet.tsx`, `frontend/src/features/delegations/EndDelegationButton.tsx`, `frontend/src/features/delegations/DelegationsPage.tsx`
- Create: `frontend/src/i18n/locales/fr/delegations.json`, `frontend/src/i18n/locales/en/delegations.json`
- Modify: `frontend/src/api/types.ts` (three lines appended), `frontend/src/workspaces/team/routes.tsx` (two imports, one route appended)
- Test: `frontend/src/features/delegations/DelegationsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/delegations` (`scope`, `manager`), `POST /api/v1/delegations`, `POST /api/v1/delegations/{public_id}/end`; `EmployeePicker`, `useMyEmployee` from Task 12; `PageHeader`, `DataTable`, `EmptyState`, `TaskSheet`, `ConfirmDialog` (controlled with `open` and `onOpenChange`), `DateField`, `FormSummary`, `useProblemForm`, `StatusBadge`, `toast(message)`, `formatDate(value, lang)` and `useLang()` from plan 01b. A server problem on a field the form does not have (`manager`) is shown by `FormSummary`.
- Produces:
  - `features/delegations/api.ts`: `type Delegation`, `delegationKeys`, `useDelegations(params?: { scope?: "mine" | "all"; manager?: string })`, `useCreateDelegation()` (variables `{ manager?: string; delegate: string; start_date: string; end_date: string }`), `useEndDelegation()` (variable: the delegation's `public_id`)
  - `DelegationSheet` (named export), props `{ open: boolean; onOpenChange: (open: boolean) => void; manager?: { public_id: string; name: string }; defaultStart?: string; defaultEnd?: string }`. Without `manager` the signed-in manager delegates for themselves. Plan 03b reuses it.
  - `DelegationStateBadge` (named export), props `{ state: string }`
  - `EndDelegationButton` (named export), props `{ delegation: Delegation }`; renders nothing when `delegation.can_end` is false
  - `DelegationsPage` (default export) at `/team/delegations`. It opens the sheet filled in when the address carries `?from=YYYY-MM-DD&to=YYYY-MM-DD` (the link of the prompt plan 03a sends when a manager's leave is approved).
  - `makeDelegation(overrides)` test fixture
  - The `delegations` translation namespace

- [ ] **Step 1: Write the translations**

`frontend/src/i18n/locales/fr/delegations.json`

```json
{
  "title": "Délégations",
  "name": "Nommer un délégué",
  "given": {
    "title": "Délégations données",
    "empty": {
      "title": "Vous n'avez nommé aucun délégué",
      "hint": "Nommez-en un avant une absence, pour que les demandes de votre équipe ne restent pas en attente."
    }
  },
  "received": {
    "title": "Délégations reçues",
    "empty": "Personne ne vous a délégué ses décisions."
  },
  "columns": {
    "delegate": "Délégué",
    "manager": "Responsable",
    "from": "Du",
    "to": "Au",
    "state": "État",
    "action": "Action"
  },
  "state": {
    "upcoming": "À venir",
    "active": "En cours",
    "ended": "Terminée",
    "cancelled": "Annulée"
  },
  "end": {
    "active": "Terminer maintenant",
    "upcoming": "Annuler la délégation",
    "title": {
      "active": "Terminer cette délégation ?",
      "upcoming": "Annuler cette délégation ?"
    },
    "consequence": {
      "active": "{{name}} ne pourra plus décider à la place du responsable ni voir son équipe, dès maintenant.",
      "upcoming": "La délégation à {{name}} n'aura pas lieu."
    },
    "confirm": {
      "active": "Oui, terminer",
      "upcoming": "Oui, annuler"
    },
    "done": "Délégation terminée.",
    "failed": "La délégation n'a pas pu être terminée. Rechargez la page et réessayez."
  },
  "sheet": {
    "title": "Nommer un délégué",
    "titleFor": "Nommer un délégué pour {{name}}",
    "delegate": "Délégué",
    "start": "Premier jour",
    "end": "Dernier jour",
    "consequence": "Pendant cette période, le délégué voit l'équipe et peut décider des demandes à la place du responsable. Le responsable garde ses droits.",
    "submit": "Nommer le délégué",
    "cancel": "Annuler",
    "required": "Ce champ est obligatoire.",
    "endBeforeStart": "Le dernier jour ne peut pas précéder le premier.",
    "done": "Délégué nommé."
  }
}
```

`frontend/src/i18n/locales/en/delegations.json`

```json
{
  "title": "Delegations",
  "name": "Name a delegate",
  "given": {
    "title": "Delegations given",
    "empty": {
      "title": "You have not named a delegate",
      "hint": "Name one before an absence, so that your team's requests do not wait."
    }
  },
  "received": {
    "title": "Delegations received",
    "empty": "Nobody has delegated their decisions to you."
  },
  "columns": {
    "delegate": "Delegate",
    "manager": "Manager",
    "from": "From",
    "to": "To",
    "state": "State",
    "action": "Action"
  },
  "state": {
    "upcoming": "Upcoming",
    "active": "Active",
    "ended": "Ended",
    "cancelled": "Cancelled"
  },
  "end": {
    "active": "End now",
    "upcoming": "Cancel the delegation",
    "title": {
      "active": "End this delegation?",
      "upcoming": "Cancel this delegation?"
    },
    "consequence": {
      "active": "{{name}} will no longer decide in the manager's place or see their team, starting now.",
      "upcoming": "The delegation to {{name}} will not take place."
    },
    "confirm": {
      "active": "Yes, end it",
      "upcoming": "Yes, cancel it"
    },
    "done": "Delegation ended.",
    "failed": "The delegation could not be ended. Reload the page and try again."
  },
  "sheet": {
    "title": "Name a delegate",
    "titleFor": "Name a delegate for {{name}}",
    "delegate": "Delegate",
    "start": "First day",
    "end": "Last day",
    "consequence": "During this period the delegate sees the team and can decide requests in the manager's place. The manager keeps their rights.",
    "submit": "Name the delegate",
    "cancel": "Cancel",
    "required": "This field is required.",
    "endBeforeStart": "The last day cannot come before the first.",
    "done": "Delegate named."
  }
}
```

Plan 01b's `i18n/index.ts` picks up every `locales/<lang>/<namespace>.json` by itself; nothing else is registered.

- [ ] **Step 2: Write the hooks, the fixture and the state badge**

Append to `frontend/src/api/types.ts` (types are derived there from the generated schema, never written by hand):

```ts
export type DelegationPage = Ok<"/api/v1/delegations", "get">;
export type Delegation = Rows<DelegationPage>;
export type NewDelegation = Body<"/api/v1/delegations", "post">;
```

`frontend/src/features/delegations/api.ts`

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { Delegation, NewDelegation } from "@/api/types";

export type { Delegation, NewDelegation };

export interface DelegationListParams {
  scope?: "mine" | "all";
  manager?: string;
}

export const delegationKeys = {
  all: ["delegations"] as const,
  list: (params: DelegationListParams) => ["delegations", "list", params] as const,
};

export function useDelegations(params: DelegationListParams = {}, enabled = true) {
  return useQuery({
    queryKey: delegationKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/delegations", { params: { query: params } })),
    enabled,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  // A delegation changes who sees which team, so employee lists are refreshed too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: delegationKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["employees"] }),
    ]);
}

export function useCreateDelegation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: NewDelegation) => call(api.POST("/api/v1/delegations", { body })),
    onSuccess: refresh,
  });
}

export function useEndDelegation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (publicId: string) =>
      call(api.POST("/api/v1/delegations/{public_id}/end", { params: { path: { public_id: publicId } } })),
    onSuccess: refresh,
  });
}
```

`frontend/src/features/delegations/testing.ts`

```ts
import type { Delegation } from "./api";

export function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  return {
    public_id: "del-1",
    manager: { public_id: "emp-3", name: "Mounir Manager" },
    delegate: { public_id: "emp-6", name: "Nadia Manager" },
    start_date: "2026-11-02",
    end_date: "2026-11-06",
    state: "active",
    direction: "given",
    can_end: true,
    created_at: "2026-10-30T10:00:00+01:00",
    ...overrides,
  };
}
```

`frontend/src/features/delegations/DelegationStateBadge.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { upcoming: "info", active: "approved", ended: "neutral", cancelled: "neutral" } as const;

export function DelegationStateBadge({ state }: { state: string }) {
  const { t } = useTranslation("delegations");
  const tone = TONES[state as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`state.${state}`)}</StatusBadge>;
}
```

- [ ] **Step 3: Write the failing page tests**

`frontend/src/features/delegations/DelegationsPage.test.tsx`

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeEmployee, pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import DelegationsPage from "./DelegationsPage";
import { makeDelegation } from "./testing";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

function mount(route = "/team/delegations") {
  return renderApp(<DelegationsPage />, { route, me: manager });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("DelegationsPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/me", () =>
        HttpResponse.json(makeEmployee({ public_id: "emp-3", name: "Mounir Manager" })),
      ),
      http.get("/api/v1/employees/directory", () =>
        HttpResponse.json([
          { public_id: "emp-3", name: "Mounir Manager", department: "Souscription" },
          { public_id: "emp-6", name: "Nadia Manager", department: "Sinistres" },
        ]),
      ),
      http.get("/api/v1/delegations", () => HttpResponse.json(pageOf([]))),
    );
  });

  it("lists what was given and what was received, with an end action only where it applies", async () => {
    server.use(
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(
          pageOf([
            makeDelegation(),
            makeDelegation({ public_id: "del-2", state: "ended", can_end: false, start_date: "2026-09-01" }),
            makeDelegation({
              public_id: "del-3",
              direction: "received",
              state: "upcoming",
              can_end: false,
              manager: { public_id: "emp-1", name: "Karim Directeur" },
              delegate: { public_id: "emp-3", name: "Mounir Manager" },
            }),
          ]),
        ),
      ),
    );

    mount();

    expect(await screen.findAllByText("Nadia Manager")).toHaveLength(2);
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Terminer maintenant" })).toHaveLength(1);
    expect(screen.getByText("Karim Directeur")).toBeInTheDocument();
    expect(screen.getByText("À venir")).toBeInTheDocument();
  });

  it("explains an empty page and offers the action that fills it", async () => {
    mount();

    expect(await screen.findByText("Vous n'avez nommé aucun délégué")).toBeInTheDocument();
    expect(screen.getByText("Personne ne vous a délégué ses décisions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nommer un délégué" })).toBeInTheDocument();
  });

  it("names a delegate", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/delegations", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDelegation({ state: "upcoming" }), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Nommer un délégué" }));
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    // A manager cannot pick themselves.
    await waitFor(() => expect(screen.queryByRole("option", { name: /Mounir Manager/ })).not.toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    fill("Premier jour", "2026-11-09");
    fill("Dernier jour", "2026-11-13");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    await waitFor(() =>
      expect(body).toEqual({ delegate: "emp-6", start_date: "2026-11-09", end_date: "2026-11-13" }),
    );
    await waitFor(() => expect(screen.queryByLabelText("Délégué")).not.toBeInTheDocument());
  });

  it("checks the order of the dates before calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/delegations", () => {
        posted = true;
        return HttpResponse.json(makeDelegation(), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Nommer un délégué" }));
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    fill("Premier jour", "2026-11-13");
    fill("Dernier jour", "2026-11-09");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    expect(await screen.findByText("Le dernier jour ne peut pas précéder le premier.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("shows a refusal of the server next to the dates and keeps them", async () => {
    server.use(
      http.post("/api/v1/delegations", () =>
        problem(400, "organisation.delegation_overlap", [
          {
            field: "start_date",
            code: "organisation.delegation_overlap",
            detail: "Une autre délégation couvre déjà une partie de ces dates.",
          },
        ]),
      ),
    );
    mount("/team/delegations?from=2026-11-09&to=2026-11-13");

    // The address opened the sheet already filled in.
    expect(await screen.findByLabelText("Premier jour")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Dernier jour")).toHaveValue("2026-11-13");
    await screen.findByRole("option", { name: "Nadia Manager · Sinistres" });
    await userEvent.selectOptions(screen.getByLabelText("Délégué"), "emp-6");
    await userEvent.click(screen.getByRole("button", { name: "Nommer le délégué" }));

    expect(await screen.findByText("Une autre délégation couvre déjà une partie de ces dates.")).toBeInTheDocument();
    expect(screen.getByLabelText("Premier jour")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Délégué")).toHaveValue("emp-6");
  });

  it("ends a running delegation only after stating the consequence", async () => {
    let ended = false;
    server.use(
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(pageOf([ended ? makeDelegation({ state: "ended", can_end: false }) : makeDelegation()])),
      ),
      http.post("/api/v1/delegations/del-1/end", () => {
        ended = true;
        return HttpResponse.json(makeDelegation({ state: "ended", can_end: false }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Terminer maintenant" }));

    expect(
      await screen.findByText(
        "Nadia Manager ne pourra plus décider à la place du responsable ni voir son équipe, dès maintenant.",
      ),
    ).toBeInTheDocument();
    expect(ended).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    await waitFor(() => expect(ended).toBe(true));
    // Said even though the refreshed list no longer has a row that can be ended.
    expect(await screen.findByText("Délégation terminée.")).toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/delegations`
Expected: FAIL, `Failed to resolve import "./DelegationsPage"`

- [ ] **Step 4: Write the sheet and the page**

`frontend/src/features/delegations/DelegationSheet.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { DateField, FormSummary, TaskSheet, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";
import { useMyEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";

import { useCreateDelegation } from "./api";

export interface DelegationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The manager to delegate for. Left out, the signed-in manager delegates for themselves. */
  manager?: { public_id: string; name: string };
  defaultStart?: string;
  defaultEnd?: string;
}

interface Values {
  delegate: string;
  start_date: string;
  end_date: string;
}

export function DelegationSheet(props: DelegationSheetProps) {
  const { t } = useTranslation("delegations");
  const formId = useId();
  const title = props.manager ? t("sheet.titleFor", { name: props.manager.name }) : t("sheet.title");
  return (
    <TaskSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("sheet.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("sheet.cancel")}
          </Button>
        </>
      }
    >
      {props.open ? <DelegationForm formId={formId} {...props} /> : null}
    </TaskSheet>
  );
}

function DelegationForm({
  formId,
  manager,
  defaultStart = "",
  defaultEnd = "",
  onOpenChange,
}: DelegationSheetProps & { formId: string }) {
  const { t } = useTranslation("delegations");
  const me = useMyEmployee(!manager);
  const create = useCreateDelegation();
  const schema = z
    .object({
      delegate: z.string().min(1, t("sheet.required")),
      start_date: z.string().min(1, t("sheet.required")),
      end_date: z.string().min(1, t("sheet.required")),
    })
    .refine((values) => !values.start_date || !values.end_date || values.end_date >= values.start_date, {
      path: ["end_date"],
      message: t("sheet.endBeforeStart"),
    });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { delegate: "", start_date: defaultStart, end_date: defaultEnd },
  });
  const { onError, summary } = useProblemForm(form);
  const managerId = manager?.public_id ?? me.data?.public_id;

  const submit = form.handleSubmit((values) => {
    create.mutate(
      { ...(manager ? { manager: manager.public_id } : {}), ...values },
      {
        onSuccess: () => {
          toast(t("sheet.done"));
          onOpenChange(false);
        },
        onError,
      },
    );
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <Controller
        control={form.control}
        name="delegate"
        render={({ field, fieldState }) => (
          <EmployeePicker
            label={t("sheet.delegate")}
            value={field.value || null}
            onChange={(value) => field.onChange(value ?? "")}
            exclude={managerId ? [managerId] : []}
            error={fieldState.error?.message}
          />
        )}
      />
      <DateField control={form.control} name="start_date" label={t("sheet.start")} />
      <DateField control={form.control} name="end_date" label={t("sheet.end")} />
      <p className="text-body text-muted-foreground">{t("sheet.consequence")}</p>
    </form>
  );
}
```

`frontend/src/features/delegations/EndDelegationButton.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { ConfirmDialog, toast } from "@/components";
import { Button } from "@/components/ui/button";

import { type Delegation, useEndDelegation } from "./api";

/** Ends a running delegation or cancels an upcoming one, after stating the consequence. Renders nothing when the viewer may not end it. */
export function EndDelegationButton({ delegation }: { delegation: Delegation }) {
  const { t } = useTranslation("delegations");
  const [confirming, setConfirming] = useState(false);
  const end = useEndDelegation();
  if (!delegation.can_end) {
    return null;
  }
  const kind = delegation.state === "active" ? "active" : "upcoming";

  // The promise, not the callbacks of `mutate`: the refreshed list can remove this button before the
  // answer is handled, and callbacks given to `mutate` are dropped once their component is gone.
  const confirm = async () => {
    try {
      await end.mutateAsync(delegation.public_id);
      toast(t("end.done"));
    } catch (error) {
      toast(error instanceof ProblemError ? error.detail : t("end.failed"));
    }
    setConfirming(false);
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setConfirming(true)}>
        {t(`end.${kind}`)}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(`end.title.${kind}`)}
        consequence={t(`end.consequence.${kind}`, { name: delegation.delegate.name })}
        confirmLabel={t(`end.confirm.${kind}`)}
        onConfirm={() => void confirm()}
        destructive
      />
    </>
  );
}
```

`frontend/src/features/delegations/DelegationsPage.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { type Column, DataTable, EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type Delegation, useDelegations } from "./api";
import { DelegationSheet } from "./DelegationSheet";
import { DelegationStateBadge } from "./DelegationStateBadge";
import { EndDelegationButton } from "./EndDelegationButton";

export default function DelegationsPage() {
  const { t } = useTranslation("delegations");
  const lang = useLang();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const [sheetOpen, setSheetOpen] = useState(Boolean(from && to));
  const list = useDelegations({ scope: "mine" });

  if (list.error) {
    throw list.error;
  }
  const rows = list.data?.results ?? [];
  const given = rows.filter((row) => row.direction === "given");
  const received = rows.filter((row) => row.direction === "received");

  const period: Column<Delegation>[] = [
    {
      key: "from",
      header: t("columns.from"),
      cell: (row: Delegation) => formatDate(row.start_date, lang),
    },
    { key: "to", header: t("columns.to"), cell: (row: Delegation) => formatDate(row.end_date, lang) },
    {
      key: "state",
      header: t("columns.state"),
      cell: (row: Delegation) => <DelegationStateBadge state={row.state} />,
    },
  ];
  const givenColumns: Column<Delegation>[] = [
    { key: "delegate", header: t("columns.delegate"), cell: (row: Delegation) => row.delegate.name },
    ...period,
    // The column exists only when at least one delegation can still be ended.
    ...(given.some((row) => row.can_end)
      ? [
          {
            key: "action",
            header: t("columns.action"),
            cell: (row: Delegation) => <EndDelegationButton delegation={row} />,
          },
        ]
      : []),
  ];
  const receivedColumns: Column<Delegation>[] = [
    { key: "manager", header: t("columns.manager"), cell: (row: Delegation) => row.manager.name },
    ...period,
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          <Button variant="primary" type="button" onClick={() => setSheetOpen(true)}>
            {t("name")}
          </Button>
        }
      />

      <section aria-labelledby="delegations-given" className="grid gap-3">
        <h2 id="delegations-given" className="text-section font-semibold">
          {t("given.title")}
        </h2>
        <DataTable
          columns={givenColumns}
          rows={given}
          rowKey={(row: Delegation) => row.public_id}
          isLoading={list.isPending}
          empty={<EmptyState title={t("given.empty.title")} hint={t("given.empty.hint")} />}
        />
      </section>

      <section aria-labelledby="delegations-received" className="mt-8 grid gap-3">
        <h2 id="delegations-received" className="text-section font-semibold">
          {t("received.title")}
        </h2>
        {received.length > 0 ? (
          <DataTable
            columns={receivedColumns}
            rows={received}
            rowKey={(row: Delegation) => row.public_id}
            isLoading={false}
            empty={null}
          />
        ) : (
          <p className="text-body text-muted-foreground">{t("received.empty")}</p>
        )}
      </section>

      <DelegationSheet open={sheetOpen} onOpenChange={setSheetOpen} defaultStart={from} defaultEnd={to} />
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/delegations`
Expected: 6 passed

- [ ] **Step 5: Register the route**

In `frontend/src/workspaces/team/routes.tsx` (plan 01b left the array empty), add below the existing import (with `import { lazy } from "react";`, which the file does not have yet):

```tsx
const DelegationsPage = lazy(() => import("@/features/delegations/DelegationsPage"));
```

and append to the `teamRoutes` array:

```tsx
  { path: "delegations", element: <DelegationsPage /> },
```

- [ ] **Step 6: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features/delegations src/i18n`
Expected: no lint or type error; all tests pass

Open `http://localhost:5173`, sign in as `manager.a@impactrisks.com`. Expected: the switcher offers "Mon équipe"; its navigation shows "Délégations"; naming Nadia Manager for next week adds a line "À venir"; signed in as `manager.b@impactrisks.com` the same delegation appears under "Délégations reçues".

```bash
git add frontend/src/features/delegations frontend/src/api/types.ts frontend/src/i18n/locales frontend/src/workspaces/team/routes.tsx
git commit -m "feat(delegations): name, list and end delegations in My team"
```

### Task 15: The employee record and its blocks

One page serves three workspaces: the HR desk (everything, with actions), Overview (everything, no action) and My team (name, department, position and contact). It opens on a short list of facts; the rest sits in blocks that later plans extend.

**Files:**
- Create: `frontend/src/features/employees/recordTypes.ts`, `frontend/src/features/employees/recordBlocks.tsx`, `frontend/src/features/employees/EmployeeRecordPage.tsx`, `frontend/src/features/employees/RecordActions.tsx`, `frontend/src/features/employees/DocumentList.tsx`
- Create: `frontend/src/features/employees/blocks/PersonalBlock.tsx`, `frontend/src/features/employees/blocks/TeamBlock.tsx`, `frontend/src/features/employees/blocks/DocumentsBlock.tsx`, `frontend/src/features/employees/blocks/HistoryBlock.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx`, `frontend/src/workspaces/overview/routes.tsx`, `frontend/src/workspaces/team/routes.tsx` (one import and one route each)
- Test: `frontend/src/features/employees/EmployeeRecordPage.test.tsx`

**Interfaces:**
- Consumes: from Task 12 `useEmployee`, `useEmployees`, `useEmployeeDocuments`, `useAddDocument`, `useSetDocumentVisibility`, `useEmployeeHistory`, `documentFormData`, `isFullRecord`, `EmployeeStatusBadge`; from Task 14 `useDelegations`, `DelegationSheet`, `DelegationStateBadge`, `EndDelegationButton`; from plan 01b `PageHeader`, `PageLoading`, `Disclosure` (its children are mounted only while it is open), `Pager`, `StatusBadge`, `TaskSheet`, `FileField` (its value is the `File` or null), `TextField`, `SwitchField`, `FormSummary`, `useProblemForm`, `ProblemBoundary`, `backToList`, `toast(message)`, `formatDate`, `formatDateTime`, `useLang`.
- Produces (the extension point of master 9.3):

```ts
// features/employees/recordTypes.ts, re-exported by recordBlocks.tsx
export type RecordMode = "hr" | "team" | "overview";
export interface RecordBlock {
  id: string;
  titleKey: string;            // a fully qualified translation key: "namespace:key"
  order: number;               // blocks are shown in ascending order
  modes: RecordMode[];
  render: (employee: EmployeeDetail, mode: RecordMode) => ReactNode;
}
export interface RecordFact {
  id: string;
  labelKey: string;            // "namespace:key"
  order: number;
  modes: RecordMode[];
  render: (employee: EmployeeDetail) => ReactNode;   // returning null hides the fact
}
// features/employees/recordBlocks.tsx
export const RECORD_BLOCKS: RecordBlock[];   // personal 10, team 20, documents 30, history 90
export const RECORD_FACTS: RecordFact[];     // number 10 … account 70, departure 75, email 80, phone 90
```

  Later plans append with `RECORD_BLOCKS.push({...})` at the end of `recordBlocks.tsx`: Task 18 of this plan adds `proposals` (order 60); plan 03b adds its Requests block (order 40); plan 04 adds its Balance block (order 50) and a balance fact (order 65).

- Produces also: `EmployeeRecordPage` (default export, props `{ mode: RecordMode }`), `RecordActions` (named export, props `{ employee: EmployeeDetail; mode: RecordMode }`, replaced whole in Task 16), `DocumentList` (named export, props `{ employeeId: string; sharing: "manage" | "show" | "hide" }`, reused by My space in Task 19), routes `/hr/employees/:id`, `/overview/people/:id`, `/team/people/:id`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/employees/EmployeeRecordPage.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeDelegation } from "@/features/delegations/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import EmployeeRecordPage from "./EmployeeRecordPage";
import type { RecordMode } from "./recordBlocks";
import { makeDocument, makeEmployee, makeEmployeeRow, makeTeamMember, pageOf, problem } from "./testing";

const viewers = {
  hr: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
  overview: makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] }),
  team: makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] }),
};
const paths = { hr: "/hr/employees", overview: "/overview/people", team: "/team/people" };

function mount(mode: RecordMode, id = "emp-1") {
  return renderApp(
    <ProblemBoundary>
      <EmployeeRecordPage mode={mode} />
    </ProblemBoundary>,
    { route: `${paths[mode]}/${id}`, path: `${paths[mode]}/:id`, me: viewers[mode] },
  );
}

async function open(block: string) {
  await userEvent.click(await screen.findByRole("button", { name: block }));
}

describe("EmployeeRecordPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeEmployee())),
      http.get("/api/v1/employees", () =>
        HttpResponse.json(pageOf([makeEmployeeRow({ public_id: "emp-5", name: "Bilel Employee" })])),
      ),
      http.get("/api/v1/employees/me", () => HttpResponse.json(makeEmployee({ public_id: "emp-2" }))),
      http.get("/api/v1/employees/directory", () => HttpResponse.json([])),
      http.get("/api/v1/delegations", () =>
        HttpResponse.json(pageOf([makeDelegation({ manager: { public_id: "emp-1", name: "Amal Employee" } })])),
      ),
      http.get("/api/v1/employees/emp-1/documents", () => HttpResponse.json([makeDocument()])),
      http.get("/api/v1/employees/emp-1/history", () =>
        HttpResponse.json(
          pageOf([
            {
              id: 7,
              at: "2026-10-12T10:15:00+01:00",
              actor: "Senna RH",
              category: "business",
              action: "employee.updated",
              object_type: "employee",
              object_id: "emp-1",
              object_label: "Amal Employee",
              changes: { phone: { before: "", after: "71 000 000" }, status: { before: "active", after: "suspended" } },
              ip_address: "10.0.0.5",
              request_id: "r-1",
            },
          ]),
        ),
      ),
    );
  });

  it("opens on the facts and keeps the rest one step away", async () => {
    mount("hr");

    expect(await screen.findByRole("heading", { name: "Amal Employee" })).toBeInTheDocument();
    for (const text of ["E004", "Souscription", "Chargé de clientèle", "Mounir Manager", "En poste", "Compte créé"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/^CDI, depuis le /)).toBeInTheDocument();
    for (const block of ["Informations personnelles", "Équipe", "Documents", "Historique"]) {
      expect(screen.getByRole("button", { name: block })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/employees/emp-1/edit");
  });

  it("shows a manager the name, department, position and contact only", async () => {
    server.use(http.get("/api/v1/employees/emp-1", () => HttpResponse.json(makeTeamMember())));

    mount("team");

    expect(await screen.findByRole("heading", { name: "Amal Employee" })).toBeInTheDocument();
    for (const text of ["Souscription", "Chargé de clientèle", "employee.a1@impactrisks.com", "20 123 456"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Matricule")).not.toBeInTheDocument();
    for (const block of ["Informations personnelles", "Documents", "Historique", "Équipe"]) {
      expect(screen.queryByRole("button", { name: block })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
  });

  it("lets an executive read everything and change nothing", async () => {
    mount("overview");

    await open("Documents");
    expect(await screen.findByRole("link", { name: "Télécharger Contrat" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.getByText("Réservé aux RH")).toBeInTheDocument();
    await open("Équipe");
    expect(await screen.findByRole("link", { name: "Bilel Employee" })).toHaveAttribute(
      "href",
      "/overview/people/emp-5",
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    for (const action of ["Ajouter un document", "Nommer un délégué", "Changer de responsable"]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: action })).not.toBeInTheDocument();
    }
  });

  it("says not available for a record outside reach", async () => {
    server.use(http.get("/api/v1/employees/nobody", () => problem(404, "core.not_found", [])));

    mount("hr", "nobody");

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });

  it("lets HR share a document and add one", async () => {
    let shared: unknown;
    let uploaded = false;
    server.use(
      http.patch("/api/v1/employees/emp-1/documents/11", async ({ request }) => {
        shared = await request.json();
        return HttpResponse.json(makeDocument({ visible_to_employee: true }));
      }),
      http.post("/api/v1/employees/emp-1/documents", () => {
        uploaded = true;
        return HttpResponse.json(makeDocument({ id: 12, label: "Avenant" }), { status: 201 });
      }),
    );
    mount("hr");
    await open("Documents");

    await userEvent.click(await screen.findByRole("checkbox", { name: "Partager Contrat avec l'employé" }));
    await waitFor(() => expect(shared).toEqual({ visible_to_employee: true }));

    await userEvent.click(screen.getByRole("button", { name: "Ajouter un document" }));
    const file = new File(["%PDF-1.4"], "avenant.pdf", { type: "application/pdf" });
    await userEvent.upload(await screen.findByLabelText("Fichier"), file);
    await userEvent.type(screen.getByLabelText("Intitulé"), "Avenant");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(uploaded).toBe(true));
  });

  it("shows a refused file next to the file input", async () => {
    server.use(
      http.post("/api/v1/employees/emp-1/documents", () =>
        problem(400, "files.content_mismatch", [
          {
            field: "file",
            code: "files.content_mismatch",
            detail: "Le contenu de ce fichier ne correspond pas à son nom.",
          },
        ]),
      ),
    );
    mount("hr");
    await open("Documents");
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un document" }));

    await userEvent.upload(await screen.findByLabelText("Fichier"), new File(["MZ"], "facture.pdf"));
    await userEvent.type(screen.getByLabelText("Intitulé"), "Facture");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le contenu de ce fichier ne correspond pas à son nom.")).toBeInTheDocument();
    expect(screen.getByLabelText("Intitulé")).toHaveValue("Facture");
  });

  it("tells in the history what changed, from what to what, by whom", async () => {
    mount("hr");
    await open("Historique");

    expect(await screen.findByText("Fiche modifiée")).toBeInTheDocument();
    expect(screen.getByText(/^Senna RH, le /)).toBeInTheDocument();
    expect(screen.getByText("Téléphone : (vide) → 71 000 000")).toBeInTheDocument();
    expect(screen.getByText("Statut : En poste → Suspendu")).toBeInTheDocument();
  });

  it("lists the team and the delegation, and lets HR name a delegate", async () => {
    mount("hr");
    await open("Équipe");

    expect(await screen.findByRole("link", { name: "Bilel Employee" })).toHaveAttribute(
      "href",
      "/hr/employees/emp-5",
    );
    expect(screen.getByText(/^Nadia Manager, du /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer maintenant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Changer de responsable" })).toHaveAttribute(
      "href",
      "/hr/employees/emp-1/edit",
    );

    await userEvent.click(screen.getByRole("button", { name: "Nommer un délégué" }));
    expect(await screen.findByText("Nommer un délégué pour Amal Employee")).toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeeRecordPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./EmployeeRecordPage"`

- [ ] **Step 2: Write the types and the blocks**

`frontend/src/features/employees/recordTypes.ts`

```ts
import type { ReactNode } from "react";

import type { EmployeeDetail } from "./api";

export type RecordMode = "hr" | "team" | "overview";

export interface RecordBlock {
  id: string;
  /** A fully qualified translation key, "namespace:key". */
  titleKey: string;
  order: number;
  modes: RecordMode[];
  render: (employee: EmployeeDetail, mode: RecordMode) => ReactNode;
}

export interface RecordFact {
  id: string;
  /** A fully qualified translation key, "namespace:key". */
  labelKey: string;
  order: number;
  modes: RecordMode[];
  /** Returning null hides the fact. */
  render: (employee: EmployeeDetail) => ReactNode;
}
```

`frontend/src/features/employees/blocks/PersonalBlock.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, isFullRecord } from "../api";

export function PersonalBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee)) {
    return null;
  }
  const blank = t("personal.none");
  const rows: [string, string][] = [
    [
      t("fields.date_of_birth"),
      employee.date_of_birth ? formatDate(employee.date_of_birth, lang) : blank,
    ],
    [t("fields.gender"), employee.gender ? t(`gender.${employee.gender}`) : blank],
    [t("fields.professional_email"), employee.professional_email],
    [t("fields.personal_email"), employee.personal_email || blank],
    [t("fields.phone"), employee.phone || blank],
    [t("fields.address"), employee.address || blank],
    [t("fields.emergency_contact_name"), employee.emergency_contact_name || blank],
    [t("fields.emergency_contact_phone"), employee.emergency_contact_phone || blank],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption text-muted-foreground">{label}</dt>
          <dd className="text-body">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

`frontend/src/features/employees/blocks/TeamBlock.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { useDelegations } from "@/features/delegations/api";
import { DelegationSheet } from "@/features/delegations/DelegationSheet";
import { DelegationStateBadge } from "@/features/delegations/DelegationStateBadge";
import { EndDelegationButton } from "@/features/delegations/EndDelegationButton";
import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, useEmployees } from "../api";
import type { RecordMode } from "../recordTypes";

export function TeamBlock({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const [sheetOpen, setSheetOpen] = useState(false);
  const base = mode === "hr" ? "/hr/employees" : "/overview/people";
  const reports = useEmployees({ scope: "all", manager: employee.public_id });
  // Only HR may list the delegations of someone else.
  const delegations = useDelegations({ scope: "all", manager: employee.public_id }, mode === "hr");
  const people = reports.data?.results ?? [];
  const current = (delegations.data?.results ?? []).filter(
    (row) => row.state === "active" || row.state === "upcoming",
  );
  const linkClass = "text-primary underline-offset-4 hover:underline";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="text-body font-semibold">{t("team.reports")}</h3>
        {people.length === 0 ? (
          <p className="text-body text-muted-foreground">{t("team.noReports")}</p>
        ) : (
          <ul className="grid gap-1">
            {people.map((person) => (
              <li key={person.public_id} className="text-body">
                <Link className={linkClass} to={`${base}/${person.public_id}`}>
                  {person.name}
                </Link>
                <span className="text-muted-foreground"> · {person.position.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "hr" ? (
        <div className="grid gap-2">
          <h3 className="text-body font-semibold">{t("team.delegation")}</h3>
          {current.length === 0 ? (
            <p className="text-body text-muted-foreground">{t("team.noDelegation")}</p>
          ) : (
            <ul className="grid gap-2">
              {current.map((row) => (
                <li key={row.public_id} className="flex flex-wrap items-center gap-3 text-body">
                  <span>
                    {t("team.delegationLine", {
                      name: row.delegate.name,
                      start: formatDate(row.start_date, lang),
                      end: formatDate(row.end_date, lang),
                    })}
                  </span>
                  <DelegationStateBadge state={row.state} />
                  <EndDelegationButton delegation={row} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("team.changeManager")}</Link>
            </Button>
            {people.length > 0 ? (
              <Button type="button" size="sm" onClick={() => setSheetOpen(true)}>
                {t("team.nameDelegate")}
              </Button>
            ) : null}
          </div>
          <DelegationSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            manager={{ public_id: employee.public_id, name: employee.name }}
          />
        </div>
      ) : null}
    </div>
  );
}
```

`frontend/src/features/employees/DocumentList.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useEmployeeDocuments, useSetDocumentVisibility } from "./api";

interface Props {
  employeeId: string;
  /** "manage": a checkbox per document (HR). "show": the sharing state as text. "hide": nothing (the employee). */
  sharing: "manage" | "show" | "hide";
}

export function DocumentList({ employeeId, sharing }: Props) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const documents = useEmployeeDocuments(employeeId);
  const share = useSetDocumentVisibility(employeeId);
  const rows = documents.data ?? [];

  if (documents.isPending) {
    return <p role="status">{t("record.loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("documents.empty")}</p>;
  }
  return (
    <ul className="divide-y divide-divider">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <a
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={`/api/v1/attachments/${row.attachment.public_id}/download`}
              aria-label={t("documents.download", { name: row.label })}
            >
              {row.label}
            </a>
            <p className="text-caption text-muted-foreground">
              {row.attachment.name}
              {row.added_by
                ? ` · ${t("documents.addedBy", {
                    name: row.added_by,
                    date: formatDateTime(row.added_at, lang),
                  })}`
                : ""}
            </p>
          </div>
          {sharing === "manage" ? (
            <label className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={row.visible_to_employee}
                aria-label={t("documents.share", { label: row.label })}
                onChange={(event) => share.mutate({ id: row.id, visible_to_employee: event.target.checked })}
              />
              <span aria-hidden="true">{t("documents.shareShort")}</span>
            </label>
          ) : null}
          {sharing === "show" ? (
            <StatusBadge tone={row.visible_to_employee ? "info" : "neutral"}>
              {t(row.visible_to_employee ? "documents.shared" : "documents.notShared")}
            </StatusBadge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

`frontend/src/features/employees/blocks/DocumentsBlock.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FileField, FormSummary, SwitchField, TaskSheet, TextField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";

import { type EmployeeDetail, useAddDocument } from "../api";
import { DocumentList } from "../DocumentList";
import type { RecordMode } from "../recordTypes";

export function DocumentsBlock({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid gap-3">
      <DocumentList employeeId={employee.public_id} sharing={mode === "hr" ? "manage" : "show"} />
      {mode === "hr" ? (
        <>
          <div>
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              {t("documents.add")}
            </Button>
          </div>
          <AddDocumentSheet employeeId={employee.public_id} open={adding} onOpenChange={setAdding} />
        </>
      ) : null}
    </div>
  );
}

interface SheetProps {
  employeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddDocumentSheet({ employeeId, open, onOpenChange }: SheetProps) {
  const { t } = useTranslation("employees");
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("documents.sheet.title")}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("documents.sheet.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      {open ? <AddDocumentForm formId={formId} employeeId={employeeId} onDone={() => onOpenChange(false)} /> : null}
    </TaskSheet>
  );
}

interface Values {
  file: File | null;
  label: string;
  visible_to_employee: boolean;
}

function AddDocumentForm({ formId, employeeId, onDone }: { formId: string; employeeId: string; onDone: () => void }) {
  const { t } = useTranslation("employees");
  const add = useAddDocument(employeeId);
  const schema = z.object({
    file: z.custom<File | null>((value) => value instanceof File, t("form.required")),
    label: z.string().trim().min(1, t("form.required")),
    visible_to_employee: z.boolean(),
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { file: null, label: "", visible_to_employee: false },
  });
  const { onError, summary } = useProblemForm(form);

  const submit = form.handleSubmit((values) => {
    if (!values.file) {
      return;
    }
    add.mutate(
      { file: values.file, label: values.label, visible_to_employee: values.visible_to_employee },
      {
        onSuccess: () => {
          toast(t("documents.sheet.done"));
          onDone();
        },
        onError,
      },
    );
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <FileField
        control={form.control}
        name="file"
        label={t("documents.sheet.file")}
        hint={t("documents.sheet.fileHint")}
      />
      <TextField control={form.control} name="label" label={t("documents.sheet.label")} />
      <SwitchField control={form.control} name="visible_to_employee" label={t("documents.sheet.shared")} />
    </form>
  );
}
```

`frontend/src/features/employees/blocks/HistoryBlock.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Pager } from "@/components";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type EmployeeDetail, useEmployeeHistory } from "../api";

const PAGE_SIZE = 25;
// Fields whose stored value is a code with a translated label.
const CODED = { status: "status", contract_type: "contract", gender: "gender" } as const;

interface Change {
  before?: unknown;
  after?: unknown;
}

export function HistoryBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const history = useEmployeeHistory(employee.public_id, page);
  const events = history.data?.results ?? [];

  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") {
      return t("history.blank");
    }
    if (typeof value === "boolean") {
      return t(value ? "history.yes" : "history.no");
    }
    const group = CODED[field as keyof typeof CODED];
    return group ? t(`${group}.${String(value)}`, { defaultValue: String(value) }) : String(value);
  };

  if (history.isPending) {
    return <p role="status">{t("record.loading")}</p>;
  }
  if (events.length === 0) {
    return <p className="text-body text-muted-foreground">{t("history.empty")}</p>;
  }
  return (
    <>
      <ol className="grid gap-4">
        {events.map((event) => (
          <li key={event.id}>
            <p className="text-body font-medium">
              {t(`history.actions.${event.action}`, { defaultValue: event.action })}
            </p>
            <p className="text-caption text-muted-foreground">
              {t("history.by", {
                actor: event.actor ?? t("history.system"),
                date: formatDateTime(event.at, lang),
              })}
            </p>
            <ul className="mt-1 grid gap-0.5">
              {Object.entries((event.changes ?? {}) as Record<string, Change>).map(([field, change]) => (
                <li key={field} className="text-body">
                  {t("history.change", {
                    field: t(`fields.${field}`, { defaultValue: field }),
                    before: show(field, change.before),
                    after: show(field, change.after),
                  })}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <Pager page={page} pageSize={PAGE_SIZE} total={history.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
```

- [ ] **Step 3: Write the registries, the actions and the page**

`frontend/src/features/employees/recordBlocks.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

import { type EmployeeDetail, isFullRecord } from "./api";
import { DocumentsBlock } from "./blocks/DocumentsBlock";
import { HistoryBlock } from "./blocks/HistoryBlock";
import { PersonalBlock } from "./blocks/PersonalBlock";
import { TeamBlock } from "./blocks/TeamBlock";
import type { RecordBlock, RecordFact } from "./recordTypes";
import { EmployeeStatusBadge } from "./ui";

export type { RecordBlock, RecordFact, RecordMode } from "./recordTypes";

function ManagerFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  return isFullRecord(employee) ? <>{employee.manager?.name ?? t("facts.noManager")}</> : null;
}

function ContractFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee)) {
    return null;
  }
  const type = t(`contract.${employee.contract_type}`);
  const start = formatDate(employee.contract_start_date ?? employee.hire_date, lang);
  if (employee.contract_end_date) {
    return <>{t("facts.contractUntil", { type, start, end: formatDate(employee.contract_end_date, lang) })}</>;
  }
  return <>{t("facts.contractSince", { type, date: start })}</>;
}

function AccountFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  return isFullRecord(employee) ? <>{t(employee.has_account ? "account.exists" : "account.missing")}</> : null;
}

function DepartureFact({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("employees");
  const lang = useLang();
  if (!isFullRecord(employee) || !employee.archived_at) {
    return null;
  }
  return (
    <>
      {t("facts.departureValue", {
        date: formatDate(employee.archived_at, lang),
        reason: employee.archive_reason,
      })}
    </>
  );
}

const full = (employee: EmployeeDetail) => (isFullRecord(employee) ? employee : null);

export const RECORD_FACTS: RecordFact[] = [
  {
    id: "number",
    labelKey: "employees:facts.number",
    order: 10,
    modes: ["hr", "overview"],
    render: (employee) => full(employee)?.employee_number ?? null,
  },
  {
    id: "department",
    labelKey: "employees:facts.department",
    order: 20,
    modes: ["hr", "overview", "team"],
    render: (employee) => employee.department.name,
  },
  {
    id: "position",
    labelKey: "employees:facts.position",
    order: 30,
    modes: ["hr", "overview", "team"],
    render: (employee) => employee.position.title,
  },
  {
    id: "manager",
    labelKey: "employees:facts.manager",
    order: 40,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <ManagerFact employee={employee} /> : null),
  },
  {
    id: "contract",
    labelKey: "employees:facts.contract",
    order: 50,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <ContractFact employee={employee} /> : null),
  },
  {
    id: "status",
    labelKey: "employees:facts.status",
    order: 60,
    modes: ["hr", "overview"],
    render: (employee) => {
      const record = full(employee);
      return record ? <EmployeeStatusBadge status={record.status} /> : null;
    },
  },
  {
    id: "account",
    labelKey: "employees:facts.account",
    order: 70,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee) ? <AccountFact employee={employee} /> : null),
  },
  {
    id: "departure",
    labelKey: "employees:facts.departure",
    order: 75,
    modes: ["hr", "overview"],
    render: (employee) => (full(employee)?.archived_at ? <DepartureFact employee={employee} /> : null),
  },
  {
    id: "email",
    labelKey: "employees:facts.email",
    order: 80,
    modes: ["team"],
    render: (employee) => employee.professional_email,
  },
  {
    id: "phone",
    labelKey: "employees:facts.phone",
    order: 90,
    modes: ["team"],
    render: (employee) => employee.phone || null,
  },
];

export const RECORD_BLOCKS: RecordBlock[] = [
  {
    id: "personal",
    titleKey: "employees:blocks.personal",
    order: 10,
    modes: ["hr", "overview"],
    render: (employee) => <PersonalBlock employee={employee} />,
  },
  {
    id: "team",
    titleKey: "employees:blocks.team",
    order: 20,
    modes: ["hr", "overview"],
    render: (employee, mode) => <TeamBlock employee={employee} mode={mode} />,
  },
  {
    id: "documents",
    titleKey: "employees:blocks.documents",
    order: 30,
    modes: ["hr", "overview"],
    render: (employee, mode) => <DocumentsBlock employee={employee} mode={mode} />,
  },
  {
    id: "history",
    titleKey: "employees:blocks.history",
    order: 90,
    modes: ["hr", "overview"],
    render: (employee) => <HistoryBlock employee={employee} />,
  },
];
```

`frontend/src/features/employees/RecordActions.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import type { EmployeeDetail } from "./api";
import type { RecordMode } from "./recordTypes";

/** The actions of the record page. Only the HR desk has any. */
export function RecordActions({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  if (mode !== "hr") {
    return null;
  }
  return (
    <Button variant="primary" asChild>
      <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("record.edit")}</Link>
    </Button>
  );
}
```

`frontend/src/features/employees/EmployeeRecordPage.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { backToList, Disclosure, PageHeader, PageLoading } from "@/components";

import { useEmployee } from "./api";
import { RECORD_BLOCKS, RECORD_FACTS, type RecordMode } from "./recordBlocks";
import { RecordActions } from "./RecordActions";

const LISTS: Record<RecordMode, string> = {
  hr: "/hr/employees",
  overview: "/overview/people",
  team: "/team/people",
};

export default function EmployeeRecordPage({ mode }: { mode: RecordMode }) {
  const { id } = useParams();
  const { t } = useTranslation("employees");
  const employee = useEmployee(id);

  if (employee.isPending) {
    return <PageLoading />;
  }
  if (employee.isError) {
    // The shell's ProblemBoundary shows "not available" for a record that is missing or outside reach.
    throw employee.error;
  }
  const record = employee.data;
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  const facts = RECORD_FACTS.filter((fact) => fact.modes.includes(mode)).sort(byOrder);
  const blocks = RECORD_BLOCKS.filter((block) => block.modes.includes(mode)).sort(byOrder);

  return (
    <>
      <PageHeader
        title={record.name}
        back={backToList(LISTS[mode])}
        primary={mode === "hr" ? <RecordActions employee={record} mode={mode} /> : undefined}
      />
      <dl className="grid gap-x-8 gap-y-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => {
          const value = fact.render(record);
          return value === null ? null : (
            <div key={fact.id}>
              <dt className="text-caption text-muted-foreground">{t(fact.labelKey)}</dt>
              <dd className="text-body font-medium">{value}</dd>
            </div>
          );
        })}
      </dl>
      <div className="mt-6 grid gap-3">
        {blocks.map((block) => (
          <Disclosure key={block.id} title={t(block.titleKey)}>
            {block.render(record, mode)}
          </Disclosure>
        ))}
      </div>
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/employees/EmployeeRecordPage.test.tsx`
Expected: 8 passed

The two upload tests check that the request leaves and what the page shows after the answer; their handlers do not read the body. In the test environment the `FormData` of jsdom is not the one Node's `fetch` encodes, so the body that reaches a handler there is not a real multipart body. The parts of the form are covered by the `documentFormData` test of Task 12, the API by the tests of Task 8, and a real upload by the look below and by the browser journeys of Task 22.

- [ ] **Step 4: Register the routes**

In `frontend/src/workspaces/hr/routes.tsx`, add the import and append the route:

```tsx
const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
```

```tsx
  { path: "employees/:id", element: <EmployeeRecordPage mode="hr" /> },
```

In `frontend/src/workspaces/overview/routes.tsx` (still empty), add below the existing import (with `import { lazy } from "react";`) and append to `overviewRoutes`:

```tsx
const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
```

```tsx
  { path: "people/:id", element: <EmployeeRecordPage mode="overview" /> },
```

In `frontend/src/workspaces/team/routes.tsx`, add and append to `teamRoutes`:

```tsx
const EmployeeRecordPage = lazy(() => import("@/features/employees/EmployeeRecordPage"));
```

```tsx
  { path: "people/:id", element: <EmployeeRecordPage mode="team" /> },
```

- [ ] **Step 5: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features/employees src/features/delegations src/i18n`
Expected: no lint or type error; all tests pass

Open `http://localhost:5173` as `hr@impactrisks.com`, open Amal Employee from the list. Expected: the facts first; four closed blocks; a PDF added under Documents downloads when its label is clicked and never opens inside the page.

```bash
git add frontend/src/features/employees frontend/src/workspaces
git commit -m "feat(employees): the employee record with its facts and blocks"
```

### Task 16: HR desk: recording a departure

**Files:**
- Create: `frontend/src/features/employees/DepartureSheet.tsx`
- Modify: `frontend/src/features/employees/RecordActions.tsx` (replace the whole file)
- Test: `frontend/src/features/employees/DepartureSheet.test.tsx`, `frontend/src/features/employees/RecordActions.test.tsx`

**Interfaces:**
- Consumes: from Task 12 `useArchivePreview(employeeId)`, `useArchiveEmployee(employeeId)` (variables `{ leaving_date: string; reason: string }`), `type Employee`, `isFullRecord`; from plan 01b `TaskSheet`, `DateField`, `TextAreaField`, `FormSummary`, `useProblemForm`, `toast(message)`, `Button` (`variant="destructive"` for the confirmation).
- Produces: `DepartureSheet` (named export, props `{ employee: Employee; open: boolean; onOpenChange: (open: boolean) => void }`); `RecordActions` now offers "Record a departure" next to "Edit" for an employee who has not left. Consequence sections are titled from `employees:departure.sections.<key>`; this plan ships titles for `delegations`, `open_requests` and `open_steps`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/employees/DepartureSheet.test.tsx`

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { DepartureSheet } from "./DepartureSheet";
import { makeEmployee, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const leaver = makeEmployee({ public_id: "emp-3", name: "Mounir Manager" });
const PREVIEW = "/api/v1/employees/emp-3/archive-preview";
const ARCHIVE = "/api/v1/employees/emp-3/archive";

function mount(onOpenChange = vi.fn()) {
  renderApp(<DepartureSheet employee={leaver} open onOpenChange={onOpenChange} />, { route: "/hr/employees/emp-3", me: hr });
  return onOpenChange;
}

describe("DepartureSheet", () => {
  beforeEach(() => {
    server.use(http.get(PREVIEW, () => HttpResponse.json({ has_account: false, reports: [], sections: [] })));
  });

  it("lists the consequences before anything is confirmed", async () => {
    server.use(
      http.get(PREVIEW, () =>
        HttpResponse.json({
          has_account: true,
          reports: [{ label: "Amal Employee", link: "/hr/employees/emp-4" }],
          sections: [
            { key: "delegations", items: [{ label: "Mounir Manager → Nadia Manager, 02/11/2026 – 06/11/2026", link: "" }] },
            { key: "open_requests", items: [{ label: "Congé annuel, 03/11/2026", link: "/requests/req-1" }] },
          ],
        }),
      ),
    );

    mount();

    expect(await screen.findByText("Enregistrer le départ de Mounir Manager")).toBeInTheDocument();
    expect(await screen.findByText(/Son compte sera désactivé immédiatement/)).toBeInTheDocument();
    expect(screen.getByText(/Plus aucun crédit mensuel de congés/)).toBeInTheDocument();
    expect(screen.getByText(/auront besoin d'un nouveau responsable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amal Employee" })).toHaveAttribute("href", "/hr/employees/emp-4");
    expect(screen.getByText("Ces délégations seront terminées :")).toBeInTheDocument();
    expect(screen.getByText("Mounir Manager → Nadia Manager, 02/11/2026 – 06/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Ces demandes resteront ouvertes :")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Congé annuel, 03/11/2026" })).toHaveAttribute("href", "/requests/req-1");
  });

  it("does not mention an account or a team that do not exist", async () => {
    mount();

    expect(await screen.findByText(/Plus aucun crédit mensuel de congés/)).toBeInTheDocument();
    expect(screen.queryByText(/Son compte sera désactivé/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auront besoin d'un nouveau responsable/)).not.toBeInTheDocument();
  });

  it("needs a date and a reason", async () => {
    let posted = false;
    server.use(
      http.post(ARCHIVE, () => {
        posted = true;
        return HttpResponse.json(makeEmployee({ status: "archived" }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Enregistrer le départ" }));

    expect(await screen.findAllByText("Ce champ est obligatoire.")).toHaveLength(2);
    expect(posted).toBe(false);
  });

  it("records the departure and closes", async () => {
    let body: unknown;
    server.use(
      http.post(ARCHIVE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeEmployee({ status: "archived", archived_at: "2026-11-30" }));
      }),
    );
    const onOpenChange = mount();

    fireEvent.change(await screen.findByLabelText("Date de départ"), { target: { value: "2026-11-30" } });
    await userEvent.type(screen.getByLabelText("Motif"), "Démission");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le départ" }));

    await waitFor(() => expect(body).toEqual({ leaving_date: "2026-11-30", reason: "Démission" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await screen.findByText("Départ enregistré.")).toBeInTheDocument();
  });

  it("closes when someone else already recorded it", async () => {
    server.use(
      http.post(ARCHIVE, () =>
        problem(409, "organisation.already_archived", [
          { field: null, code: "organisation.already_archived", detail: "Ce départ a déjà été enregistré." },
        ]),
      ),
    );
    const onOpenChange = mount();

    fireEvent.change(await screen.findByLabelText("Date de départ"), { target: { value: "2026-11-30" } });
    await userEvent.type(screen.getByLabelText("Motif"), "Démission");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le départ" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
```

`frontend/src/features/employees/RecordActions.test.tsx`

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { RecordActions } from "./RecordActions";
import { makeEmployee, makeTeamMember } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

describe("RecordActions", () => {
  it("offers edit and departure to HR for someone still employed", () => {
    renderApp(<RecordActions employee={makeEmployee()} mode="hr" />, { route: "/hr/employees/emp-1", me });

    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/employees/emp-1/edit");
    expect(screen.getByRole("button", { name: "Enregistrer un départ" })).toBeInTheDocument();
  });

  it("no longer offers a departure for someone who left", () => {
    const left = makeEmployee({ status: "archived", archived_at: "2026-11-30" });

    renderApp(<RecordActions employee={left} mode="hr" />, { route: "/hr/employees/emp-1", me });

    expect(screen.getByRole("link", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer un départ" })).not.toBeInTheDocument();
  });

  it.each(["team", "overview"] as const)("offers nothing in the %s workspace", (mode) => {
    const employee = mode === "team" ? makeTeamMember() : makeEmployee();

    renderApp(<RecordActions employee={employee} mode={mode} />, { route: "/", me });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/employees/DepartureSheet.test.tsx src/features/employees/RecordActions.test.tsx`
Expected: FAIL, `Failed to resolve import "./DepartureSheet"`; in `RecordActions.test.tsx` the departure button is not found

- [ ] **Step 2: Write the sheet and replace the actions**

`frontend/src/features/employees/DepartureSheet.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";

import { ProblemError } from "@/api/problem";
import { DateField, FormSummary, TaskSheet, TextAreaField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";

import { type Employee, useArchiveEmployee, useArchivePreview } from "./api";

interface Props {
  employee: Employee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Values {
  leaving_date: string;
  reason: string;
}

export function DepartureSheet({ employee, open, onOpenChange }: Props) {
  const { t } = useTranslation("employees");
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("departure.title", { name: employee.name })}
      footer={
        <>
          <Button type="submit" form={formId} variant="destructive">
            {t("departure.confirm")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      {open ? <DepartureForm formId={formId} employee={employee} onDone={() => onOpenChange(false)} /> : null}
    </TaskSheet>
  );
}

function Items({ items }: { items: { label: string; link: string }[] }) {
  return (
    <ul className="mt-1 grid gap-0.5 pl-4">
      {items.map((item) => (
        <li key={`${item.label}|${item.link}`}>
          {item.link ? (
            <Link className="text-primary underline-offset-4 hover:underline" to={item.link}>
              {item.label}
            </Link>
          ) : (
            item.label
          )}
        </li>
      ))}
    </ul>
  );
}

function DepartureForm({ formId, employee, onDone }: { formId: string; employee: Employee; onDone: () => void }) {
  const { t } = useTranslation("employees");
  const preview = useArchivePreview(employee.public_id);
  const archive = useArchiveEmployee(employee.public_id);
  const schema = z.object({
    leaving_date: z.string().min(1, t("form.required")),
    reason: z.string().trim().min(1, t("form.required")),
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { leaving_date: "", reason: "" } });
  const { onError, summary } = useProblemForm(form);

  // The promise, not the callbacks of `mutate`: once the record is read again as "left", the page
  // removes this sheet, and callbacks given to `mutate` are dropped once their component is gone.
  const submit = form.handleSubmit(async (values) => {
    try {
      await archive.mutateAsync(values);
      toast(t("departure.done"));
      onDone();
    } catch (error) {
      if (error instanceof ProblemError && error.status === 409) {
        // Someone else recorded it first: say so and show the current state.
        toast(error.detail);
        onDone();
        return;
      }
      onError(error);
    }
  });

  const headingId = `${formId}-consequences`;
  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
      <FormSummary problems={summary} />
      <DateField control={form.control} name="leaving_date" label={t("departure.date")} />
      <TextAreaField control={form.control} name="reason" label={t("departure.reason")} />
      <section aria-labelledby={headingId} className="grid gap-3 rounded-xl border border-border bg-muted p-4">
        <h3 id={headingId} className="text-body font-semibold">
          {t("departure.consequences")}
        </h3>
        {preview.isPending ? (
          <p role="status">{t("record.loading")}</p>
        ) : (
          <ul className="grid list-disc gap-2 pl-5 text-body">
            {preview.data?.has_account ? <li>{t("departure.account")}</li> : null}
            <li>{t("departure.credit")}</li>
            <li>{t("departure.kept")}</li>
            {preview.data && preview.data.reports.length > 0 ? (
              <li>
                {t("departure.reports")}
                <Items items={preview.data.reports} />
              </li>
            ) : null}
            {(preview.data?.sections ?? []).map((section) => (
              <li key={section.key}>
                {t(`departure.sections.${section.key}`, { defaultValue: section.key })}
                <Items items={section.items} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
```

Replace `frontend/src/features/employees/RecordActions.tsx` with:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { type EmployeeDetail, isFullRecord } from "./api";
import { DepartureSheet } from "./DepartureSheet";
import type { RecordMode } from "./recordTypes";

/** The actions of the record page. Only the HR desk has any: Edit (primary) and Record a departure. */
export function RecordActions({ employee, mode }: { employee: EmployeeDetail; mode: RecordMode }) {
  const { t } = useTranslation("employees");
  const [leaving, setLeaving] = useState(false);
  if (mode !== "hr" || !isFullRecord(employee)) {
    return null;
  }
  const employed = employee.status !== "archived";
  return (
    <div className="flex flex-wrap gap-2">
      {employed ? (
        <Button type="button" onClick={() => setLeaving(true)}>
          {t("departure.action")}
        </Button>
      ) : null}
      <Button variant="primary" asChild>
        <Link to={`/hr/employees/${employee.public_id}/edit`}>{t("record.edit")}</Link>
      </Button>
      {employed ? <DepartureSheet employee={employee} open={leaving} onOpenChange={setLeaving} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: Run the tests and see them pass**

Run: `docker compose run --rm web npx vitest run src/features/employees`
Expected: all pass (5 in `DepartureSheet.test.tsx`, 4 in `RecordActions.test.tsx`, and the record page tests of Task 15 unchanged)

- [ ] **Step 4: Look and commit**

Open `http://localhost:5173` as `hr@impactrisks.com`, open Mounir Manager, choose "Enregistrer un départ". Expected: the sheet lists the disabled account, the end of monthly credits and the two people who report to him; after confirming, he disappears from the list, is found again with the status filter "A quitté l'entreprise", and `manager.a@impactrisks.com` can no longer sign in. Run `docker compose exec app python manage.py e2e_reset` afterwards to restore the demo data.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error

```bash
git add frontend/src/features/employees
git commit -m "feat(employees): record a departure with its consequences"
```

### Task 17: HR desk: the settings index, departments and positions

**Files:**
- Create: `frontend/src/features/settings/hrSubjects.ts`, `frontend/src/features/settings/HrSettingsIndexPage.tsx`, `frontend/src/features/employees/DepartmentsPositionsPage.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx` (two imports, two routes appended)
- Test: `frontend/src/features/settings/HrSettingsIndexPage.test.tsx`, `frontend/src/features/employees/DepartmentsPositionsPage.test.tsx`

**Interfaces:**
- Consumes: from Task 12 `useDepartments`, `usePositions`, `useSaveDepartment`, `useSavePosition` (variables `{ id?: number; body }`), `type Department`, `type Position`; from plan 01b `PageHeader`, `DataTable`, `EmptyState`, `TaskSheet`, `TextField`, `SwitchField`, `FormSummary`, `useProblemForm(form, { mapField })`, `useListParams`, `StatusBadge`, `toast(message)`.
- Produces:
  - `features/settings/hrSubjects.ts`: `interface HrSettingsSubject { id: string; path: string; titleKey: string; descriptionKey: string; order: number }` and `HR_SETTINGS_SUBJECTS: HrSettingsSubject[]` (this plan registers `departments`, order 60). Plan 03b appends its subjects (request types 10, steps 20, events 30, public holidays 40, parameters 50) with `HR_SETTINGS_SUBJECTS.push(...)` at the end of the file; keys are fully qualified (`namespace:key`).
  - `HrSettingsIndexPage` (default export) at `/hr/settings`
  - `DepartmentsPositionsPage` (default export, props `{ readOnly?: boolean }`) at `/hr/settings/departments`; with `readOnly` it renders no action (plan 06 mounts it under Overview, Oversight)

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/settings/HrSettingsIndexPage.test.tsx`

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import HrSettingsIndexPage from "./HrSettingsIndexPage";

describe("HrSettingsIndexPage", () => {
  it("lists one entry per subject, with what it is for", () => {
    renderApp(<HrSettingsIndexPage />, {
      route: "/hr/settings",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    const entry = screen.getByRole("link", { name: /Départements et postes/ });
    expect(entry).toHaveAttribute("href", "/hr/settings/departments");
    expect(screen.getByText(/Les unités de l'entreprise et les intitulés de poste/)).toBeInTheDocument();
  });
});
```

`frontend/src/features/employees/DepartmentsPositionsPage.test.tsx`

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import DepartmentsPositionsPage from "./DepartmentsPositionsPage";
import { makeDepartment, makePosition, problem } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function mount(readOnly = false) {
  return renderApp(<DepartmentsPositionsPage readOnly={readOnly} />, { route: "/hr/settings/departments", me: hr });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("DepartmentsPositionsPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/departments", () =>
        HttpResponse.json([
          makeDepartment(),
          makeDepartment({ id: 2, code: "OLD", name: "Ancien service", is_active: false, employee_count: 0 }),
        ]),
      ),
      http.get("/api/v1/positions", () => HttpResponse.json([makePosition()])),
    );
  });

  it("lists departments with their head count and state, then positions", async () => {
    mount();

    await screen.findAllByText("Souscription");
    for (const text of ["UW", "3", "Actif", "Ancien service", "Inactif"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/peut être désactivé, pas supprimé/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Postes" }));
    await screen.findAllByText("Chargé de clientèle");
    expect(screen.getAllByText("C1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ajouter un poste" })).toBeInTheDocument();
  });

  it("adds a department", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/departments", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDepartment({ id: 9, code: "OPS", name: "Opérations" }), { status: 201 });
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un département" }));
    fill("Code", "OPS");
    fill("Nom en français", "Opérations");
    fill("Nom en anglais", "Operations");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(body).toEqual({ code: "OPS", name_fr: "Opérations", name_en: "Operations" }));
    await waitFor(() => expect(screen.queryByLabelText("Nom en français")).not.toBeInTheDocument());
  });

  it("shows a refused code next to the field and keeps what was typed", async () => {
    server.use(
      http.post("/api/v1/departments", () =>
        problem(400, "unique", [{ field: "code", code: "unique", detail: "Ce champ doit être unique." }]),
      ),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Ajouter un département" }));
    fill("Code", "UW");
    fill("Nom en français", "Doublon");
    fill("Nom en anglais", "Duplicate");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Ce champ doit être unique.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom en français")).toHaveValue("Doublon");
  });

  it("edits and deactivates a department that is in use", async () => {
    let body: unknown;
    server.use(
      http.patch("/api/v1/departments/1", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeDepartment({ is_active: false }));
      }),
    );
    mount();

    await userEvent.click(await screen.findByRole("button", { name: "Modifier UW" }));
    expect(screen.getByLabelText("Nom en français")).toHaveValue("Souscription");
    await userEvent.click(screen.getByLabelText("Actif"));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(body).toEqual({ code: "UW", name_fr: "Souscription", name_en: "Underwriting", is_active: false }),
    );
  });

  it("renders no action when read-only", async () => {
    mount(true);

    await screen.findAllByText("Souscription");
    expect(screen.queryByRole("button", { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier/ })).not.toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/settings/HrSettingsIndexPage.test.tsx src/features/employees/DepartmentsPositionsPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./HrSettingsIndexPage"` and `"./DepartmentsPositionsPage"`

- [ ] **Step 2: Write the subject registry and the index page**

`frontend/src/features/settings/hrSubjects.ts`

```ts
export interface HrSettingsSubject {
  id: string;
  /** The absolute address of the subject's page. */
  path: string;
  /** Fully qualified translation keys, "namespace:key". */
  titleKey: string;
  descriptionKey: string;
  /** Subjects are listed in ascending order. */
  order: number;
}

/** One entry per subject of the HR settings (UI 7.12). A plan that adds a subject pushes it here. */
export const HR_SETTINGS_SUBJECTS: HrSettingsSubject[] = [
  {
    id: "departments",
    path: "/hr/settings/departments",
    titleKey: "employees:settingsIndex.departments.title",
    descriptionKey: "employees:settingsIndex.departments.description",
    order: 60,
  },
];
```

`frontend/src/features/settings/HrSettingsIndexPage.tsx`

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeader } from "@/components";

import { HR_SETTINGS_SUBJECTS } from "./hrSubjects";

export default function HrSettingsIndexPage() {
  const { t } = useTranslation("employees");
  const subjects = [...HR_SETTINGS_SUBJECTS].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader title={t("settingsIndex.title")} />
      <ul className="grid max-w-3xl gap-3">
        {subjects.map((subject) => (
          <li key={subject.id}>
            <Link
              to={subject.path}
              className="block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted"
            >
              <span className="block text-section font-semibold text-foreground">{t(subject.titleKey)}</span>
              <span className="block text-body text-muted-foreground">{t(subject.descriptionKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 3: Write the departments and positions page**

`frontend/src/features/employees/DepartmentsPositionsPage.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  type Column,
  DataTable,
  EmptyState,
  FormSummary,
  PageHeader,
  StatusBadge,
  SwitchField,
  TaskSheet,
  TextField,
  toast,
  useListParams,
  useProblemForm,
} from "@/components";
import { Button } from "@/components/ui/button";

import {
  type Department,
  type Position,
  useDepartments,
  usePositions,
  useSaveDepartment,
  useSavePosition,
} from "./api";

type Kind = "departments" | "positions";
type Item = Department | Position;
interface Editing {
  kind: Kind;
  item: Item | null;
}

const KINDS: Kind[] = ["departments", "positions"];

export default function DepartmentsPositionsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation("employees");
  const { filters, setFilter } = useListParams({ view: "departments" });
  const kind: Kind = filters.view === "positions" ? "positions" : "departments";
  const departments = useDepartments();
  const positions = usePositions();
  const [editing, setEditing] = useState<Editing | null>(null);

  if (departments.error) {
    throw departments.error;
  }
  if (positions.error) {
    throw positions.error;
  }

  const state = (item: Item) => (
    <StatusBadge tone={item.is_active ? "approved" : "neutral"}>
      {t(item.is_active ? "structure.active" : "structure.inactive")}
    </StatusBadge>
  );
  const action = readOnly
    ? []
    : [
        {
          key: "action",
          header: t("structure.columns.action"),
          cell: (item: Item) => (
            <Button
              type="button"
              size="sm"
              aria-label={t("structure.editItem", { code: item.code })}
              onClick={() => setEditing({ kind, item })}
            >
              {t("structure.edit")}
            </Button>
          ),
        },
      ];
  const departmentColumns: Column<Department>[] = [
    { key: "code", header: t("structure.columns.code"), cell: (item: Department) => item.code },
    { key: "name", header: t("structure.columns.name"), cell: (item: Department) => item.name },
    { key: "employees", header: t("structure.columns.employees"), cell: (item: Department) => item.employee_count },
    { key: "state", header: t("structure.columns.state"), cell: state },
    ...action,
  ];
  const positionColumns: Column<Position>[] = [
    { key: "code", header: t("structure.columns.code"), cell: (item: Position) => item.code },
    { key: "title", header: t("structure.columns.title"), cell: (item: Position) => item.title },
    { key: "grade", header: t("structure.columns.grade"), cell: (item: Position) => item.grade },
    { key: "employees", header: t("structure.columns.employees"), cell: (item: Position) => item.employee_count },
    { key: "state", header: t("structure.columns.state"), cell: state },
    ...action,
  ];

  return (
    <>
      <PageHeader
        title={t("structure.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" type="button" onClick={() => setEditing({ kind, item: null })}>
              {t(kind === "departments" ? "structure.addDepartment" : "structure.addPosition")}
            </Button>
          )
        }
      />
      <div role="tablist" aria-label={t("structure.title")} className="mb-4 inline-flex rounded-md bg-accent p-1">
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setFilter("view", value)}
            className={`min-h-10 rounded px-4 text-body font-medium max-md:min-h-11 ${
              kind === value ? "bg-card text-foreground" : "text-muted-foreground"
            }`}
          >
            {t(`structure.tabs.${value}`)}
          </button>
        ))}
      </div>

      {kind === "departments" ? (
        <DataTable
          columns={departmentColumns}
          rows={departments.data ?? []}
          rowKey={(item: Department) => String(item.id)}
          isLoading={departments.isPending}
          empty={<EmptyState title={t("structure.empty.departments")} />}
        />
      ) : (
        <DataTable
          columns={positionColumns}
          rows={positions.data ?? []}
          rowKey={(item: Position) => String(item.id)}
          isLoading={positions.isPending}
          empty={<EmptyState title={t("structure.empty.positions")} />}
        />
      )}
      <p className="mt-4 max-w-3xl text-caption text-muted-foreground">{t("structure.inUse")}</p>

      {editing ? <StructureSheet editing={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

interface Values {
  code: string;
  label_fr: string;
  label_en: string;
  grade: string;
  is_active: boolean;
}

function valuesOf({ kind, item }: Editing): Values {
  if (!item) {
    return { code: "", label_fr: "", label_en: "", grade: "", is_active: true };
  }
  if (kind === "departments") {
    const department = item as Department;
    return {
      code: department.code,
      label_fr: department.name_fr,
      label_en: department.name_en,
      grade: "",
      is_active: department.is_active,
    };
  }
  const position = item as Position;
  return {
    code: position.code,
    label_fr: position.title_fr,
    label_en: position.title_en,
    grade: position.grade,
    is_active: position.is_active,
  };
}

// The API names the two labels name_* for a department and title_* for a position;
// the form has one pair of inputs for both.
function toFormField(field: string): string {
  return field.replace(/^(name|title)_/, "label_");
}

function StructureSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { t } = useTranslation("employees");
  const formId = useId();
  const { kind, item } = editing;
  const isDepartment = kind === "departments";
  const saveDepartment = useSaveDepartment();
  const savePosition = useSavePosition();
  const required = t("form.required");
  const schema = z.object({
    code: z.string().trim().min(1, required),
    label_fr: z.string().trim().min(1, required),
    label_en: z.string().trim().min(1, required),
    grade: z.string().trim(),
    is_active: z.boolean(),
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesOf(editing) });
  const { onError, summary } = useProblemForm(form, { mapField: toFormField });
  const options = {
    onSuccess: () => {
      toast(t("structure.saved"));
      onClose();
    },
    onError,
  };
  const submit = form.handleSubmit((values) => {
    const state = item ? { is_active: values.is_active } : {};
    if (isDepartment) {
      const body = { code: values.code, name_fr: values.label_fr, name_en: values.label_en, ...state };
      saveDepartment.mutate({ id: item?.id, body }, options);
    } else {
      const body = {
        code: values.code,
        title_fr: values.label_fr,
        title_en: values.label_en,
        grade: values.grade,
        ...state,
      };
      savePosition.mutate({ id: item?.id, body }, options);
    }
  });

  const title = item
    ? t(isDepartment ? "structure.sheet.editDepartment" : "structure.sheet.editPosition", { code: item.code })
    : t(isDepartment ? "structure.sheet.newDepartment" : "structure.sheet.newPosition");

  return (
    <TaskSheet
      open
      onOpenChange={(open: boolean) => {
        if (!open) {
          onClose();
        }
      }}
      title={title}
      footer={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {t("form.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4">
        <FormSummary problems={summary} />
        <TextField control={form.control} name="code" label={t("structure.fields.code")} />
        <TextField
          control={form.control}
          name="label_fr"
          label={t(isDepartment ? "structure.fields.name_fr" : "structure.fields.title_fr")}
        />
        <TextField
          control={form.control}
          name="label_en"
          label={t(isDepartment ? "structure.fields.name_en" : "structure.fields.title_en")}
        />
        {isDepartment ? null : (
          <TextField control={form.control} name="grade" label={t("structure.fields.grade")} />
        )}
        {item ? (
          <SwitchField control={form.control} name="is_active" label={t("structure.fields.is_active")} />
        ) : null}
      </form>
    </TaskSheet>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/settings/HrSettingsIndexPage.test.tsx src/features/employees/DepartmentsPositionsPage.test.tsx`
Expected: 6 passed

- [ ] **Step 4: Register the routes**

In `frontend/src/workspaces/hr/routes.tsx`, add the imports and append the routes:

```tsx
const HrSettingsIndexPage = lazy(() => import("@/features/settings/HrSettingsIndexPage"));
const DepartmentsPositionsPage = lazy(() => import("@/features/employees/DepartmentsPositionsPage"));
```

```tsx
  { path: "settings", element: <HrSettingsIndexPage /> },
  { path: "settings/departments", element: <DepartmentsPositionsPage /> },
```

- [ ] **Step 5: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features src/i18n`
Expected: no lint or type error; all tests pass

Open `http://localhost:5173` as `hr@impactrisks.com`. Expected: "Configuration" appears in the HR desk navigation; its page lists "Départements et postes"; a department can be added, renamed and deactivated; the deactivated one no longer appears in the department list of the employee form's select, but stays on the records that use it.

```bash
git add frontend/src/features/settings frontend/src/features/employees frontend/src/workspaces/hr/routes.tsx
git commit -m "feat(settings): HR settings index, departments and positions"
```

### Task 18: HR desk: profile changes

**Files:**
- Create: `frontend/src/features/profile/api.ts`, `frontend/src/features/profile/testing.ts`, `frontend/src/features/profile/changeText.ts`, `frontend/src/features/profile/OutcomeBadge.tsx`, `frontend/src/features/profile/ProposalSheet.tsx`, `frontend/src/features/profile/ProfileChangesPage.tsx`, `frontend/src/features/profile/ProposalsBlock.tsx`
- Create: `frontend/src/i18n/locales/fr/profile.json`, `frontend/src/i18n/locales/en/profile.json`
- Modify: `frontend/src/api/types.ts` (three lines appended), `frontend/src/features/employees/recordBlocks.tsx` (one import, one `push` at the end), `frontend/src/workspaces/hr/routes.tsx` (one import, one route)
- Test: `frontend/src/features/profile/ProfileChangesPage.test.tsx`, `frontend/src/features/profile/ProposalsBlock.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/profile-changes` (`scope`, `status`, `employee`, `page`), `POST /api/v1/profile-changes`, `POST /api/v1/profile-changes/{public_id}/decide`, `POST /api/v1/profile-changes/{public_id}/withdraw`; the `employees` namespace for field labels (`employees:fields.<name>`, `employees:gender.<code>`); `RECORD_BLOCKS`; `PageHeader`, `DataTable`, `Pager`, `EmptyState`, `TaskSheet`, `StatusBadge`, `useListParams`, `toast`, `formatDate`, `formatDateTime`, `ProblemError`.
- Produces:
  - `features/profile/api.ts`: `type ProfileChange`, `profileChangeKeys`, `useProfileChanges(params, enabled?)`, `useProposeProfileChange()` (variables `NewProfileChange`: `{ changes: {…proposable fields…}; note?: string }`), `useDecideProfileChange()` (variables `{ id: string; accept: boolean; comment: string }`), `useWithdrawProfileChange()` (variable: the proposal's `public_id`)
  - `features/profile/changeText.ts`: `useChangeText()` returning `{ label(field): string; value(field, raw): string }`
  - `ProposalSheet` (named export), props `{ change: ProfileChange | null; onClose: () => void }`; it offers Accept and Refuse only for a pending proposal
  - `ProfileChangesPage` (default export) at `/hr/profile-changes`, with the views "to decide" and "decided"
  - A record block `proposals` (order 60, HR desk only)
  - `makeProfileChange(overrides)` test fixture; the `profile` translation namespace (complete, including the keys Task 19 uses)

- [ ] **Step 1: Write the translations**

`frontend/src/i18n/locales/fr/profile.json`

```json
{
  "title": "Mon profil",
  "loading": "Chargement…",
  "propose": "Proposer une modification",
  "blank": "(vide)",
  "changeLine": "{{field}} : {{old}} → {{new}}",
  "sections": {
    "identity": "Identité",
    "contact": "Coordonnées",
    "emergency": "Personne à prévenir",
    "work": "Rattachement"
  },
  "pending": {
    "title": "Votre modification attend la décision des RH",
    "sent": "Envoyée le {{date}}",
    "withdraw": "Retirer la proposition",
    "withdrawn": "Proposition retirée.",
    "failed": "La proposition n'a pas pu être retirée. Rechargez la page et réessayez."
  },
  "blocks": {
    "documents": "Documents partagés par les RH",
    "proposals": "Mes propositions passées",
    "signin": "Connexion précédente"
  },
  "signin": {
    "previous": "Votre connexion précédente date du {{date}}.",
    "first": "C'est votre première connexion."
  },
  "proposals": {
    "empty": "Aucune proposition passée.",
    "sent": "Envoyée le {{date}}",
    "comment": "Commentaire des RH : {{comment}}"
  },
  "outcome": {
    "pending": "En attente des RH",
    "accepted": "Acceptée",
    "rejected": "Refusée",
    "withdrawn": "Retirée"
  },
  "change": {
    "title": "Proposer une modification",
    "rule": "La modification s'applique une fois acceptée par les RH.",
    "note": "Message pour les RH (facultatif)",
    "submit": "Envoyer aux RH",
    "cancel": "Annuler",
    "sent": "Proposition envoyée aux RH.",
    "nothing": "Rien n'a changé. Modifiez au moins un champ.",
    "required": "Ce champ est obligatoire."
  },
  "queue": {
    "title": "Modifications de profil",
    "tabs": {
      "pending": "À traiter",
      "decided": "Traitées"
    },
    "columns": {
      "who": "Employé",
      "fields": "Champs",
      "when": "Reçue le",
      "outcome": "Décision",
      "decidedBy": "Par",
      "action": "Action"
    },
    "open": "Ouvrir",
    "openFor": "Ouvrir la proposition de {{name}}",
    "empty": {
      "pending": "Aucune modification à traiter.",
      "decided": "Aucune modification traitée."
    }
  },
  "sheet": {
    "title": "Proposition de {{name}}",
    "columns": {
      "field": "Champ",
      "current": "Actuel",
      "proposed": "Proposé"
    },
    "note": "Message de l'employé : {{note}}",
    "comment": "Commentaire (facultatif)",
    "accept": "Accepter",
    "refuse": "Refuser",
    "close": "Fermer",
    "accepted": "Modification acceptée. La fiche est à jour.",
    "refused": "Modification refusée.",
    "failed": "La décision n'a pas pu être enregistrée. Réessayez.",
    "decidedBy": "{{outcome}} par {{name}} le {{date}}",
    "hrComment": "Commentaire : {{comment}}"
  },
  "record": {
    "title": "Propositions de modification",
    "empty": "Aucune proposition."
  }
}
```

`frontend/src/i18n/locales/en/profile.json`

```json
{
  "title": "My profile",
  "loading": "Loading…",
  "propose": "Propose a change",
  "blank": "(empty)",
  "changeLine": "{{field}}: {{old}} → {{new}}",
  "sections": {
    "identity": "Identity",
    "contact": "Contact details",
    "emergency": "Emergency contact",
    "work": "Organisation"
  },
  "pending": {
    "title": "Your change is waiting for HR",
    "sent": "Sent on {{date}}",
    "withdraw": "Withdraw the proposal",
    "withdrawn": "Proposal withdrawn.",
    "failed": "The proposal could not be withdrawn. Reload the page and try again."
  },
  "blocks": {
    "documents": "Documents shared by HR",
    "proposals": "My past proposals",
    "signin": "Previous sign-in"
  },
  "signin": {
    "previous": "Your previous sign-in was on {{date}}.",
    "first": "This is your first sign-in."
  },
  "proposals": {
    "empty": "No past proposal.",
    "sent": "Sent on {{date}}",
    "comment": "HR comment: {{comment}}"
  },
  "outcome": {
    "pending": "Waiting for HR",
    "accepted": "Accepted",
    "rejected": "Refused",
    "withdrawn": "Withdrawn"
  },
  "change": {
    "title": "Propose a change",
    "rule": "The change applies once HR accepts it.",
    "note": "Note to HR (optional)",
    "submit": "Send to HR",
    "cancel": "Cancel",
    "sent": "Proposal sent to HR.",
    "nothing": "Nothing has changed. Change at least one field.",
    "required": "This field is required."
  },
  "queue": {
    "title": "Profile changes",
    "tabs": {
      "pending": "To decide",
      "decided": "Decided"
    },
    "columns": {
      "who": "Employee",
      "fields": "Fields",
      "when": "Received",
      "outcome": "Decision",
      "decidedBy": "By",
      "action": "Action"
    },
    "open": "Open",
    "openFor": "Open the proposal from {{name}}",
    "empty": {
      "pending": "No change to decide.",
      "decided": "No decided change."
    }
  },
  "sheet": {
    "title": "Proposal from {{name}}",
    "columns": {
      "field": "Field",
      "current": "Current",
      "proposed": "Proposed"
    },
    "note": "Note from the employee: {{note}}",
    "comment": "Comment (optional)",
    "accept": "Accept",
    "refuse": "Refuse",
    "close": "Close",
    "accepted": "Change accepted. The record is up to date.",
    "refused": "Change refused.",
    "failed": "The decision could not be recorded. Try again.",
    "decidedBy": "{{outcome}} by {{name}} on {{date}}",
    "hrComment": "Comment: {{comment}}"
  },
  "record": {
    "title": "Change proposals",
    "empty": "No proposal."
  }
}
```

- [ ] **Step 2: Write the hooks, the fixture and the text helper**

Append to `frontend/src/api/types.ts`:

```ts
export type ProfileChangePage = Ok<"/api/v1/profile-changes", "get">;
export type ProfileChange = Rows<ProfileChangePage>;
export type NewProfileChange = Body<"/api/v1/profile-changes", "post">;
```

`frontend/src/features/profile/api.ts`

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { NewProfileChange, ProfileChange } from "@/api/types";

export type { NewProfileChange, ProfileChange };

export interface ProfileChangeListParams {
  scope?: "mine" | "all";
  status?: "pending" | "decided" | "accepted" | "rejected" | "withdrawn";
  employee?: string;
  page?: number;
}

export const profileChangeKeys = {
  all: ["profile-changes"] as const,
  list: (params: ProfileChangeListParams) => ["profile-changes", "list", params] as const,
};

export function useProfileChanges(params: ProfileChangeListParams, enabled = true) {
  return useQuery({
    queryKey: profileChangeKeys.list(params),
    queryFn: () => call(api.GET("/api/v1/profile-changes", { params: { query: params } })),
    enabled,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  // An accepted proposal changes the employee record too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: profileChangeKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["employees"] }),
    ]);
}

export function useProposeProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: NewProfileChange) => call(api.POST("/api/v1/profile-changes", { body })),
    onSuccess: refresh,
  });
}

export function useDecideProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, accept, comment }: { id: string; accept: boolean; comment: string }) =>
      call(
        api.POST("/api/v1/profile-changes/{public_id}/decide", {
          params: { path: { public_id: id } },
          body: { accept, comment },
        }),
      ),
    // Refresh on failure too: a 409 means someone else decided, and the list must show it.
    onSettled: refresh,
  });
}

export function useWithdrawProfileChange() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST("/api/v1/profile-changes/{public_id}/withdraw", { params: { path: { public_id: id } } })),
    onSettled: refresh,
  });
}
```

`frontend/src/features/profile/testing.ts`

```ts
import type { ProfileChange } from "./api";

export function makeProfileChange(overrides: Partial<ProfileChange> = {}): ProfileChange {
  return {
    public_id: "chg-1",
    employee: { public_id: "emp-1", name: "Amal Employee" },
    changes: [
      { field: "gender", old: "", new: "female" },
      { field: "phone", old: "", new: "20 111 222" },
    ],
    note: "Nouveau numéro",
    status: "pending",
    decided_by: null,
    decided_at: null,
    comment: "",
    created_at: "2026-10-20T09:30:00+01:00",
    ...overrides,
  };
}
```

`frontend/src/features/profile/changeText.ts`

```ts
import { useTranslation } from "react-i18next";

import { useLang } from "@/i18n";
import { formatDate } from "@/lib/format";

/** How a proposed field and its values read to a person: translated label, translated codes, dates, "(empty)". */
export function useChangeText() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  return {
    label: (field: string): string => t(`employees:fields.${field}`, { defaultValue: field }),
    value: (field: string, raw: string | null | undefined): string => {
      if (raw === null || raw === undefined || raw === "") {
        return t("blank");
      }
      if (field === "gender") {
        return t(`employees:gender.${raw}`, { defaultValue: raw });
      }
      if (field === "date_of_birth") {
        return formatDate(raw, lang);
      }
      return raw;
    },
  };
}
```

- [ ] **Step 3: Write the failing tests**

`frontend/src/features/profile/ProfileChangesPage.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import ProfileChangesPage from "./ProfileChangesPage";
import { makeProfileChange } from "./testing";

const hr = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const DECIDE = "/api/v1/profile-changes/chg-1/decide";

function mount(route = "/hr/profile-changes") {
  return renderApp(<ProfileChangesPage />, { route, me: hr });
}

function listReturns(pending: unknown[], decided: unknown[] = []) {
  const seen: string[] = [];
  server.use(
    http.get("/api/v1/profile-changes", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push(`${params.get("scope")}:${params.get("status")}`);
      return HttpResponse.json(pageOf(params.get("status") === "decided" ? decided : pending));
    }),
  );
  return seen;
}

async function openProposal() {
  await userEvent.click(await screen.findByRole("button", { name: "Ouvrir la proposition de Amal Employee" }));
}

describe("ProfileChangesPage", () => {
  it("lists what waits for HR and shows current against proposed values", async () => {
    const seen = listReturns([makeProfileChange()]);

    mount();
    await openProposal();

    expect(seen[0]).toBe("all:pending");
    expect(await screen.findByText("Proposition de Amal Employee")).toBeInTheDocument();
    expect(screen.getAllByText("Genre, Téléphone").length).toBeGreaterThan(0);
    expect(screen.getByRole("row", { name: "Genre (vide) Femme" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Téléphone (vide) 20 111 222" })).toBeInTheDocument();
    expect(screen.getByText("Message de l'employé : Nouveau numéro")).toBeInTheDocument();
  });

  it("accepts with a comment", async () => {
    listReturns([makeProfileChange()]);
    let body: unknown;
    server.use(
      http.post(DECIDE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange({ status: "accepted" }));
      }),
    );
    mount();
    await openProposal();

    await userEvent.type(await screen.findByLabelText("Commentaire (facultatif)"), "Merci");
    await userEvent.click(screen.getByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(body).toEqual({ accept: true, comment: "Merci" }));
    await waitFor(() => expect(screen.queryByText("Proposition de Amal Employee")).not.toBeInTheDocument());
  });

  it("refuses", async () => {
    listReturns([makeProfileChange()]);
    let body: unknown;
    server.use(
      http.post(DECIDE, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange({ status: "rejected" }));
      }),
    );
    mount();
    await openProposal();

    await userEvent.click(await screen.findByRole("button", { name: "Refuser" }));

    await waitFor(() => expect(body).toEqual({ accept: false, comment: "" }));
  });

  it("closes and refreshes when someone else decided first", async () => {
    const seen = listReturns([makeProfileChange()]);
    server.use(
      http.post(DECIDE, () =>
        problem(409, "organisation.change_already_decided", [
          {
            field: null,
            code: "organisation.change_already_decided",
            detail: "Cette proposition a déjà été traitée ou retirée.",
          },
        ]),
      ),
    );
    mount();
    await openProposal();
    const before = seen.length;

    await userEvent.click(await screen.findByRole("button", { name: "Accepter" }));

    await waitFor(() => expect(screen.queryByText("Proposition de Amal Employee")).not.toBeInTheDocument());
    await waitFor(() => expect(seen.length).toBeGreaterThan(before));
  });

  it("shows decided proposals with their outcome and no decision to make", async () => {
    const decided = makeProfileChange({
      status: "rejected",
      decided_by: "Senna RH",
      decided_at: "2026-10-21T11:00:00+01:00",
      comment: "Justificatif manquant",
    });
    listReturns([], [decided]);

    mount("/hr/profile-changes?view=decided");
    await openProposal();

    expect(screen.getAllByText("Refusée").length).toBeGreaterThan(0);
    expect(await screen.findByText(/^Refusée par Senna RH le /)).toBeInTheDocument();
    expect(screen.getByText("Commentaire : Justificatif manquant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refuser" })).not.toBeInTheDocument();
  });

  it("says when nothing waits", async () => {
    listReturns([]);

    mount();

    expect(await screen.findByText("Aucune modification à traiter.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Traitées" }));
    expect(await screen.findByText("Aucune modification traitée.")).toBeInTheDocument();
  });
});
```

`frontend/src/features/profile/ProposalsBlock.test.tsx`

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { RECORD_BLOCKS } from "@/features/employees/recordBlocks";
import { makeEmployee, pageOf } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { ProposalsBlock } from "./ProposalsBlock";
import { makeProfileChange } from "./testing";

describe("ProposalsBlock", () => {
  it("is registered on the record for the HR desk only", () => {
    const block = RECORD_BLOCKS.find((item) => item.id === "proposals");

    expect(block?.modes).toEqual(["hr"]);
    expect(block?.titleKey).toBe("profile:record.title");
  });

  it("lists the proposals of one employee and opens them", async () => {
    let asked = "";
    server.use(
      http.get("/api/v1/profile-changes", ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json(pageOf([makeProfileChange()]));
      }),
    );

    renderApp(<ProposalsBlock employee={makeEmployee()} />, {
      route: "/hr/employees/emp-1",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(asked).toContain("employee=emp-1");
    expect(asked).toContain("scope=all");
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir la proposition de Amal Employee" }));
    expect(await screen.findByRole("button", { name: "Accepter" })).toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/profile`
Expected: FAIL, `Failed to resolve import "./ProfileChangesPage"` and `"./ProposalsBlock"`

- [ ] **Step 4: Write the sheet, the page and the record block**

`frontend/src/features/profile/ProposalSheet.tsx`

```tsx
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { TaskSheet, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useDecideProfileChange } from "./api";
import { useChangeText } from "./changeText";

interface Props {
  change: ProfileChange | null;
  onClose: () => void;
}

export function ProposalSheet({ change, onClose }: Props) {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const commentId = useId();
  const [comment, setComment] = useState("");
  const decide = useDecideProfileChange();

  const close = () => {
    setComment("");
    onClose();
  };
  const send = (accept: boolean) => {
    if (!change) {
      return;
    }
    decide.mutate(
      { id: change.public_id, accept, comment: comment.trim() },
      {
        onSuccess: () => {
          toast(t(accept ? "sheet.accepted" : "sheet.refused"));
          close();
        },
        onError: (error: unknown) => {
          toast(error instanceof ProblemError ? error.detail : t("sheet.failed"));
          if (error instanceof ProblemError && error.status === 409) {
            close();
          }
        },
      },
    );
  };

  const pending = change?.status === "pending";
  const cell = "border-b border-divider px-3 py-2 text-left text-body align-top";
  return (
    <TaskSheet
      open={change !== null}
      onOpenChange={(open: boolean) => {
        if (!open) {
          close();
        }
      }}
      title={change ? t("sheet.title", { name: change.employee.name }) : ""}
      footer={
        pending ? (
          <>
            <Button variant="primary" type="button" onClick={() => send(true)}>
              {t("sheet.accept")}
            </Button>
            <Button type="button" onClick={() => send(false)}>
              {t("sheet.refuse")}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={close}>
            {t("sheet.close")}
          </Button>
        )
      }
    >
      {change ? (
        <div className="grid gap-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.field")}
                </th>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.current")}
                </th>
                <th scope="col" className={`${cell} text-caption text-muted-foreground`}>
                  {t("sheet.columns.proposed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {change.changes.map((item) => (
                <tr key={item.field}>
                  <th scope="row" className={`${cell} font-medium`}>
                    {text.label(item.field)}
                  </th>
                  <td className={cell}>{text.value(item.field, item.old)}</td>
                  <td className={`${cell} font-medium`}>{text.value(item.field, item.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {change.note ? <p className="text-body">{t("sheet.note", { note: change.note })}</p> : null}
          {pending ? (
            <div className="grid gap-1.5">
              <label htmlFor={commentId} className="text-body font-medium">
                {t("sheet.comment")}
              </label>
              <textarea
                id={commentId}
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-body"
              />
            </div>
          ) : (
            <div className="grid gap-1 text-body">
              {change.decided_by && change.decided_at ? (
                <p>
                  {t("sheet.decidedBy", {
                    outcome: t(`outcome.${change.status}`),
                    name: change.decided_by,
                    date: formatDateTime(change.decided_at, lang),
                  })}
                </p>
              ) : (
                <p>{t(`outcome.${change.status}`)}</p>
              )}
              {change.comment ? <p>{t("sheet.hrComment", { comment: change.comment })}</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </TaskSheet>
  );
}
```

`frontend/src/features/profile/OutcomeBadge.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components";

const TONES = { pending: "waiting", accepted: "approved", rejected: "refused", withdrawn: "neutral" } as const;

/** Where a proposal stands, as a sentence with a coloured dot. */
export function OutcomeBadge({ status }: { status: string }) {
  const { t } = useTranslation("profile");
  const tone = TONES[status as keyof typeof TONES] ?? "neutral";
  return <StatusBadge tone={tone}>{t(`outcome.${status}`)}</StatusBadge>;
}
```

`frontend/src/features/profile/ProfileChangesPage.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type Column, DataTable, EmptyState, PageHeader, Pager, useListParams } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useProfileChanges } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";
import { ProposalSheet } from "./ProposalSheet";

const PAGE_SIZE = 25;
const VIEWS = ["pending", "decided"] as const;

export default function ProfileChangesPage() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const { filters, page, setFilter, setPage } = useListParams({ view: "pending" });
  const view = filters.view === "decided" ? "decided" : "pending";
  const list = useProfileChanges({ scope: "all", status: view, page });
  const [openId, setOpenId] = useState<string | null>(null);

  if (list.error) {
    throw list.error;
  }
  const rows = list.data?.results ?? [];
  // Read the open proposal from the list, so the sheet follows a refresh.
  const open = rows.find((row) => row.public_id === openId) ?? null;

  const who: Column<ProfileChange> = {
    key: "who",
    header: t("queue.columns.who"),
    cell: (row: ProfileChange) => row.employee.name,
  };
  const fields: Column<ProfileChange> = {
    key: "fields",
    header: t("queue.columns.fields"),
    cell: (row: ProfileChange) => row.changes.map((item) => text.label(item.field)).join(", "),
  };
  const action: Column<ProfileChange> = {
    key: "action",
    header: t("queue.columns.action"),
    cell: (row: ProfileChange) => (
      <Button
        type="button"
        size="sm"
        aria-label={t("queue.openFor", { name: row.employee.name })}
        onClick={() => setOpenId(row.public_id)}
      >
        {t("queue.open")}
      </Button>
    ),
  };
  const columns: Column<ProfileChange>[] =
    view === "pending"
      ? [
          who,
          fields,
          {
            key: "when",
            header: t("queue.columns.when"),
            cell: (row: ProfileChange) => formatDateTime(row.created_at, lang),
          },
          action,
        ]
      : [
          who,
          fields,
          {
            key: "outcome",
            header: t("queue.columns.outcome"),
            cell: (row: ProfileChange) => <OutcomeBadge status={row.status} />,
          },
          {
            key: "decidedBy",
            header: t("queue.columns.decidedBy"),
            cell: (row: ProfileChange) => row.decided_by ?? "",
          },
          action,
        ];

  return (
    <>
      <PageHeader title={t("queue.title")} />
      <div role="tablist" aria-label={t("queue.title")} className="mb-4 inline-flex rounded-md bg-accent p-1">
        {VIEWS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setFilter("view", value)}
            className={`min-h-10 rounded px-4 text-body font-medium max-md:min-h-11 ${
              view === value ? "bg-card text-foreground" : "text-muted-foreground"
            }`}
          >
            {t(`queue.tabs.${value}`)}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row: ProfileChange) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t(`queue.empty.${view}`)} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
      <ProposalSheet change={open} onClose={() => setOpenId(null)} />
    </>
  );
}
```

`frontend/src/features/profile/ProposalsBlock.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { EmployeeDetail } from "@/features/employees/api";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useProfileChanges } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";
import { ProposalSheet } from "./ProposalSheet";

/** The change proposals of one employee, on the HR record. */
export function ProposalsBlock({ employee }: { employee: EmployeeDetail }) {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const text = useChangeText();
  const list = useProfileChanges({ scope: "all", employee: employee.public_id });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = list.data?.results ?? [];
  const open = rows.find((row) => row.public_id === openId) ?? null;

  if (list.isPending) {
    return <p role="status">{t("loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("record.empty")}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-divider">
        {rows.map((row) => (
          <li key={row.public_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-body">{row.changes.map((item) => text.label(item.field)).join(", ")}</p>
              <p className="text-caption text-muted-foreground">
                {t("proposals.sent", { date: formatDateTime(row.created_at, lang) })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <OutcomeBadge status={row.status} />
              <Button
                type="button"
                size="sm"
                aria-label={t("queue.openFor", { name: row.employee.name })}
                onClick={() => setOpenId(row.public_id)}
              >
                {t("queue.open")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ProposalSheet change={open} onClose={() => setOpenId(null)} />
    </>
  );
}
```

At the end of `frontend/src/features/employees/recordBlocks.tsx`, add the import with the other imports and the registration as the last statement of the file:

```tsx
import { ProposalsBlock } from "@/features/profile/ProposalsBlock";
```

```tsx
RECORD_BLOCKS.push({
  id: "proposals",
  titleKey: "profile:record.title",
  order: 60,
  modes: ["hr"],
  render: (employee) => <ProposalsBlock employee={employee} />,
});
```

Run: `docker compose run --rm web npx vitest run src/features/profile src/features/employees`
Expected: all pass (6 in `ProfileChangesPage.test.tsx`, 2 in `ProposalsBlock.test.tsx`); in `EmployeeRecordPage.test.tsx` the HR record now also shows the closed block "Propositions de modification"

- [ ] **Step 5: Register the route**

In `frontend/src/workspaces/hr/routes.tsx`, add the import and append the route:

```tsx
const ProfileChangesPage = lazy(() => import("@/features/profile/ProfileChangesPage"));
```

```tsx
  { path: "profile-changes", element: <ProfileChangesPage /> },
```

- [ ] **Step 6: Check and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features src/i18n`
Expected: no lint or type error; all tests pass

```bash
git add frontend/src/features/profile frontend/src/features/employees/recordBlocks.tsx frontend/src/api/types.ts frontend/src/i18n/locales frontend/src/workspaces/hr/routes.tsx
git commit -m "feat(profile): HR decides profile-change proposals"
```

### Task 19: My space: the profile and proposing a change

**Files:**
- Create: `frontend/src/features/profile/MyProfilePage.tsx`, `frontend/src/features/profile/ProposeChangePage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (three imports, two routes appended)
- Test: `frontend/src/features/profile/MyProfilePage.test.tsx`, `frontend/src/features/profile/ProposeChangePage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/employees/me`, `GET /api/v1/profile-changes?scope=mine&status=pending|decided`, `POST /api/v1/profile-changes`, `POST /api/v1/profile-changes/{public_id}/withdraw`, `GET /api/v1/employees/{public_id}/documents` (the API returns only the shared ones to their owner); from Task 12 `useMyEmployee`, `type Employee`; from Task 15 `DocumentList` with `sharing="hide"`; from Task 18 `useProfileChanges`, `useProposeProfileChange`, `useWithdrawProfileChange`, `useChangeText`, `OutcomeBadge`, `makeProfileChange`, the `profile` texts; from plan 01b `useCurrentUser()` (`previous_login_at`), `Block`, `Disclosure`, `PageHeader`, `PageLoading`, `Pager`, `StatusBadge`, `FormSummary`, `useProblemForm(form, { mapField })`, the bound inputs, `toast(message)`.
- Produces:
  - `MyProfilePage` (default export) at `/me/profile`. The "Profil" entry of My space appears, and with it the workspace itself.
  - `ProposeChangePage` (default export) at `/me/profile/change`. It sends only the fields that differ from the record, as `{ changes, note }`.
- Layout (master D23): the profile opens on four titled blocks of read-only details, two per row from a laptop up; a waiting proposal sits above them and replaces the primary action; documents, past proposals and the previous sign-in are closed disclosures. The proposal form is a page of its own with the same sections as the employee form of Task 13.

- [ ] **Step 1: Write the failing profile tests**

`frontend/src/features/profile/MyProfilePage.test.tsx`

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeDocument, makeEmployee, pageOf, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import MyProfilePage from "./MyProfilePage";
import { makeProfileChange } from "./testing";

const employee = makeMe({
  roles: ["employee"],
  name: "Amal Employee",
  email: "employee.a1@impactrisks.com",
  employee: { public_id: "emp-1", name: "Amal Employee" },
});

function mount(me = employee) {
  return renderApp(
    <ProblemBoundary>
      <MyProfilePage />
    </ProblemBoundary>,
    { route: "/me/profile", path: "/me/profile", me },
  );
}

/** Answers the list of proposals by the status that is asked for. */
function proposals(byStatus: { pending?: unknown[]; decided?: unknown[] }) {
  return http.get("/api/v1/profile-changes", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") as "pending" | "decided";
    return HttpResponse.json(pageOf(byStatus[status] ?? []));
  });
}

describe("MyProfilePage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/employees/me", () =>
        HttpResponse.json(
          makeEmployee({ address: "5 rue de Marseille, Tunis", emergency_contact_name: "Sami Employee" }),
        ),
      ),
      proposals({}),
    );
  });

  it("shows my own details and offers to propose a change", async () => {
    mount();

    expect(await screen.findByRole("heading", { level: 1, name: "Mon profil" })).toBeInTheDocument();
    for (const section of ["Identité", "Coordonnées", "Personne à prévenir", "Rattachement"]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    }
    for (const text of [
      "Amal",
      "Femme",
      "employee.a1@impactrisks.com",
      "5 rue de Marseille, Tunis",
      "Sami Employee",
      "Souscription",
      "Chargé de clientèle",
      "Mounir Manager",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Proposer une modification" })).toHaveAttribute(
      "href",
      "/me/profile/change",
    );
    expect(screen.queryByText("Votre modification attend la décision des RH")).not.toBeInTheDocument();
    // Nothing on this page changes the record directly.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the waiting proposal in place of the action and lets me withdraw it", async () => {
    let withdrawn = false;
    server.use(
      http.get("/api/v1/profile-changes", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(pageOf(status === "pending" && !withdrawn ? [makeProfileChange()] : []));
      }),
      http.post("/api/v1/profile-changes/chg-1/withdraw", () => {
        withdrawn = true;
        return HttpResponse.json(makeProfileChange({ status: "withdrawn" }));
      }),
    );
    mount();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Votre modification attend la décision des RH" }),
    ).toBeInTheDocument();
    expect(screen.getByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Genre : (vide) → Femme")).toBeInTheDocument();
    expect(screen.getByText("Téléphone : (vide) → 20 111 222")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Proposer une modification" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retirer la proposition" }));

    expect(await screen.findByText("Proposition retirée.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Proposer une modification" })).toBeInTheDocument();
    expect(screen.queryByText("Votre modification attend la décision des RH")).not.toBeInTheDocument();
  });

  it("keeps the shared documents, the past proposals and the previous sign-in one step away", async () => {
    server.use(
      proposals({
        decided: [
          makeProfileChange({
            public_id: "chg-0",
            status: "rejected",
            changes: [{ field: "address", old: "", new: "3 rue d'Alger" }],
            decided_by: "Senna RH",
            decided_at: "2026-09-12T11:00:00+01:00",
            comment: "Merci de joindre un justificatif.",
          }),
        ],
      }),
      http.get("/api/v1/employees/emp-1/documents", () =>
        HttpResponse.json([makeDocument({ visible_to_employee: true })]),
      ),
    );
    mount();
    await screen.findByRole("heading", { level: 1, name: "Mon profil" });
    expect(screen.queryByText("Refusée")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Documents partagés par les RH" }));
    expect(await screen.findByRole("link", { name: "Télécharger Contrat" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Partagé avec l'employé")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mes propositions passées" }));
    expect(await screen.findByText("Refusée")).toBeInTheDocument();
    expect(screen.getByText("Adresse : (vide) → 3 rue d'Alger")).toBeInTheDocument();
    expect(screen.getByText("Commentaire des RH : Merci de joindre un justificatif.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Connexion précédente" }));
    expect(screen.getByText(/^Votre connexion précédente date du /)).toBeInTheDocument();
  });

  it("says so when this is the first sign-in", async () => {
    mount(makeMe({ ...employee, previous_login_at: null }));

    await userEvent.click(await screen.findByRole("button", { name: "Connexion précédente" }));

    expect(screen.getByText("C'est votre première connexion.")).toBeInTheDocument();
  });

  it("says not available to an account without an employee record", async () => {
    server.use(http.get("/api/v1/employees/me", () => problem(404, "core.not_found", [])));

    mount();

    expect(await screen.findByRole("heading", { name: "Non disponible" })).toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/profile/MyProfilePage.test.tsx`
Expected: FAIL, `Failed to resolve import "./MyProfilePage"`

- [ ] **Step 2: Write the profile page**

`frontend/src/features/profile/MyProfilePage.tsx`

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ProblemError } from "@/api/problem";
import { Block, Disclosure, PageHeader, PageLoading, Pager, StatusBadge, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/api";
import { useMyEmployee } from "@/features/employees/api";
import { DocumentList } from "@/features/employees/DocumentList";
import { useLang } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { type ProfileChange, useProfileChanges, useWithdrawProfileChange } from "./api";
import { useChangeText } from "./changeText";
import { OutcomeBadge } from "./OutcomeBadge";

const PAGE_SIZE = 25;

type PersonalField =
  | "first_name"
  | "last_name"
  | "date_of_birth"
  | "gender"
  | "personal_email"
  | "phone"
  | "address"
  | "emergency_contact_name"
  | "emergency_contact_phone";

/** One section of the profile: labels and values, two per row from a tablet up. */
function Details({ title, rows }: { title: string; rows: [label: string, value: string][] }) {
  return (
    <Block title={title}>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="m-0 break-words text-body font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

/** What a proposal asks for: one line per field, from the old value to the new one. */
function ChangeLines({ change }: { change: ProfileChange }) {
  const { t } = useTranslation("profile");
  const text = useChangeText();
  return (
    <ul className="grid gap-1 text-body">
      {change.changes.map((item) => (
        <li key={item.field}>
          {t("changeLine", {
            field: text.label(item.field),
            old: text.value(item.field, item.old),
            new: text.value(item.field, item.new),
          })}
        </li>
      ))}
    </ul>
  );
}

/** The proposals that are no longer waiting, the most recent first, with the answer of HR. */
function PastProposals() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const list = useProfileChanges({ scope: "mine", status: "decided", page });
  const rows = list.data?.results ?? [];

  if (list.isPending) {
    return <p role="status">{t("loading")}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">{t("proposals.empty")}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-divider">
        {rows.map((row) => (
          <li key={row.public_id} className="grid gap-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">
                {t("proposals.sent", { date: formatDateTime(row.created_at, lang) })}
              </p>
              <OutcomeBadge status={row.status} />
            </div>
            <ChangeLines change={row} />
            {row.comment ? <p className="text-body">{t("proposals.comment", { comment: row.comment })}</p> : null}
          </li>
        ))}
      </ul>
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}

/** My space, Profile: my own record, read-only. Changes go through a proposal that HR decides (UI 5.8). */
export default function MyProfilePage() {
  const { t } = useTranslation("profile");
  const lang = useLang();
  const me = useCurrentUser();
  const text = useChangeText();
  const employee = useMyEmployee();
  const waiting = useProfileChanges({ scope: "mine", status: "pending" });
  // Kept by the page, not by the block it serves: the block leaves the page once the proposal is
  // withdrawn, and callbacks given to `mutate` are dropped once their component is gone.
  const withdraw = useWithdrawProfileChange();

  if (employee.isPending || waiting.isPending) {
    return <PageLoading />;
  }
  if (employee.isError) {
    // An account without an employee record has no profile: the shell shows "not available".
    throw employee.error;
  }
  if (waiting.isError) {
    throw waiting.error;
  }

  const record = employee.data;
  const pending = waiting.data.results[0] ?? null;
  const personal = (field: PersonalField): [string, string] => [text.label(field), text.value(field, record[field])];

  const sendWithdrawal = () => {
    if (!pending || withdraw.isPending) {
      return;
    }
    withdraw.mutate(pending.public_id, {
      onSuccess: () => toast(t("pending.withdrawn")),
      onError: (error: unknown) => toast(error instanceof ProblemError ? error.detail : t("pending.failed")),
    });
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          pending ? undefined : (
            <Button variant="primary" asChild>
              <Link to="/me/profile/change">{t("propose")}</Link>
            </Button>
          )
        }
      />

      {pending ? (
        <div className="mb-4">
          <Block
            title={t("pending.title")}
            action={<StatusBadge tone="waiting">{t("outcome.pending")}</StatusBadge>}
          >
            <p className="mb-2 text-caption text-muted-foreground">
              {t("pending.sent", { date: formatDateTime(pending.created_at, lang) })}
            </p>
            <ChangeLines change={pending} />
            <div className="mt-4">
              <Button type="button" onClick={sendWithdrawal} aria-busy={withdraw.isPending}>
                {t("pending.withdraw")}
              </Button>
            </div>
          </Block>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Details
          title={t("sections.identity")}
          rows={[personal("first_name"), personal("last_name"), personal("date_of_birth"), personal("gender")]}
        />
        <Details
          title={t("sections.contact")}
          rows={[
            [text.label("professional_email"), record.professional_email],
            personal("personal_email"),
            personal("phone"),
            personal("address"),
          ]}
        />
        <Details
          title={t("sections.emergency")}
          rows={[personal("emergency_contact_name"), personal("emergency_contact_phone")]}
        />
        <Details
          title={t("sections.work")}
          rows={[
            [text.label("department"), record.department.name],
            [text.label("position"), record.position.title],
            [text.label("manager"), record.manager?.name ?? t("employees:facts.noManager")],
          ]}
        />
      </div>

      <div className="mt-6 grid gap-3">
        <Disclosure title={t("blocks.documents")}>
          <DocumentList employeeId={record.public_id} sharing="hide" />
        </Disclosure>
        <Disclosure title={t("blocks.proposals")}>
          <PastProposals />
        </Disclosure>
        <Disclosure title={t("blocks.signin")}>
          <p className="text-body">
            {me.previous_login_at
              ? t("signin.previous", { date: formatDateTime(me.previous_login_at, lang) })
              : t("signin.first")}
          </p>
        </Disclosure>
      </div>
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/profile/MyProfilePage.test.tsx`
Expected: 5 passed

- [ ] **Step 3: Write the failing tests of the proposal form**

`frontend/src/features/profile/ProposeChangePage.test.tsx`

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { ProblemBoundary } from "@/components";
import { makeEmployee, problem } from "@/features/employees/testing";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import ProposeChangePage from "./ProposeChangePage";
import { makeProfileChange } from "./testing";

const employee = makeMe({ roles: ["employee"], name: "Amal Employee" });

function mount() {
  return renderApp(
    <ProblemBoundary>
      <ProposeChangePage />
    </ProblemBoundary>,
    { route: "/me/profile/change", path: "/me/profile/change", me: employee },
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** The form is filled from the record once it has been read. */
async function loaded() {
  await waitFor(() => expect(screen.getByLabelText("Prénom")).toHaveValue("Amal"));
}

async function send() {
  await userEvent.click(screen.getByRole("button", { name: "Envoyer aux RH" }));
}

describe("ProposeChangePage", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/employees/me", () => HttpResponse.json(makeEmployee())));
  });

  it("starts from my current values, offers personal fields only and states the rule", async () => {
    mount();
    await loaded();

    expect(screen.getByRole("heading", { level: 1, name: "Proposer une modification" })).toBeInTheDocument();
    expect(screen.getByText("La modification s'applique une fois acceptée par les RH.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Employee");
    expect(screen.getByLabelText("Date de naissance")).toHaveValue("1992-04-11");
    expect(screen.getByLabelText("Genre")).toHaveValue("female");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("20 123 456");
    for (const contractual of ["Matricule", "E-mail professionnel", "Département", "Poste", "Type de contrat"]) {
      expect(screen.queryByLabelText(contractual)).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/me/profile");
  });

  it("sends only what changed, then returns to the profile", async () => {
    let body: unknown;
    server.use(
      http.post("/api/v1/profile-changes", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeProfileChange(), { status: 201 });
      }),
    );
    mount();
    await loaded();

    fill("Adresse", "12 rue de Carthage, Tunis");
    fill("Date de naissance", "");
    fill("Message pour les RH (facultatif)", "Nouveau logement");
    await send();

    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/me/profile");
    expect(body).toEqual({
      changes: { date_of_birth: null, address: "12 rue de Carthage, Tunis" },
      note: "Nouveau logement",
    });
    expect(await screen.findByText("Proposition envoyée aux RH.")).toBeInTheDocument();
  });

  it("says so when nothing changed, without calling the server", async () => {
    let posted = false;
    server.use(
      http.post("/api/v1/profile-changes", () => {
        posted = true;
        return HttpResponse.json(makeProfileChange(), { status: 201 });
      }),
    );
    mount();
    await loaded();

    await send();

    expect(await screen.findByText("Rien n'a changé. Modifiez au moins un champ.")).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("asks for a first and a last name", async () => {
    mount();
    await loaded();

    fill("Nom", "   ");
    await send();

    expect(await screen.findByText("Ce champ est obligatoire.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a refused value next to its field and keeps what was typed", async () => {
    server.use(
      http.post("/api/v1/profile-changes", () =>
        problem(400, "core.validation", [
          {
            field: "changes.personal_email",
            code: "validation.invalid",
            detail: "Saisissez une adresse e-mail valide.",
          },
        ]),
      ),
    );
    mount();
    await loaded();

    fill("E-mail personnel", "amal@");
    fill("Téléphone", "22 333 444");
    await send();

    expect(await screen.findByText("Saisissez une adresse e-mail valide.")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail personnel")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("E-mail personnel")).toHaveValue("amal@");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("22 333 444");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("tells about a proposal that is already waiting and keeps what was typed", async () => {
    const detail = "Une proposition attend déjà la décision des RH. Retirez-la pour en envoyer une autre.";
    server.use(
      http.post("/api/v1/profile-changes", () =>
        problem(409, "organisation.change_already_open", [
          { field: null, code: "organisation.change_already_open", detail },
        ]),
      ),
    );
    mount();
    await loaded();

    fill("Téléphone", "22 333 444");
    await send();

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Téléphone")).toHaveValue("22 333 444");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/profile/ProposeChangePage.test.tsx`
Expected: FAIL, `Failed to resolve import "./ProposeChangePage"`

- [ ] **Step 4: Write the proposal form**

`frontend/src/features/profile/ProposeChangePage.tsx`

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { z } from "zod";

import {
  DateField,
  FormSummary,
  PageHeader,
  PageLoading,
  SelectField,
  TextAreaField,
  TextField,
  toast,
  useProblemForm,
} from "@/components";
import { Button } from "@/components/ui/button";
import { type Employee, useMyEmployee } from "@/features/employees/api";

import { type NewProfileChange, useProposeProfileChange } from "./api";

const PROFILE = "/me/profile";

/** The fields an employee may propose (master 7.7); the API refuses any other. */
const FIELDS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "gender",
  "personal_email",
  "phone",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

function buildSchema(required: string) {
  const text = z.string().trim();
  return z.object({
    first_name: text.min(1, required),
    last_name: text.min(1, required),
    date_of_birth: z.string(),
    gender: z.string(),
    personal_email: text,
    phone: text,
    address: text,
    emergency_contact_name: text,
    emergency_contact_phone: text,
    note: text,
  });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: Values = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  personal_email: "",
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  note: "",
};

function fromEmployee(employee: Employee): Values {
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    date_of_birth: employee.date_of_birth ?? "",
    gender: employee.gender,
    personal_email: employee.personal_email,
    phone: employee.phone,
    address: employee.address,
    emergency_contact_name: employee.emergency_contact_name,
    emergency_contact_phone: employee.emergency_contact_phone,
    note: "",
  };
}

/** Only what differs from the record is proposed. An emptied date is sent as null. */
function changedFields(before: Values, after: Values): NewProfileChange["changes"] {
  const changes: Record<string, string | null> = {};
  for (const name of FIELDS) {
    if (after[name] !== before[name]) {
      changes[name] = name === "date_of_birth" && after[name] === "" ? null : after[name];
    }
  }
  return changes as NewProfileChange["changes"];
}

/** The API names a refused value "changes.<field>"; the input is called "<field>". */
function toFormField(field: string): string {
  return field.startsWith("changes.") ? field.slice("changes.".length) : field;
}

/** My space, Propose a change: the personal fields with their current values (UI 5.9). */
export default function ProposeChangePage() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const employee = useMyEmployee();
  const propose = useProposeProfileChange();
  const [nothing, setNothing] = useState(false);

  const loaded = useMemo(() => (employee.data ? fromEmployee(employee.data) : undefined), [employee.data]);
  const form = useForm<Values>({
    resolver: zodResolver(buildSchema(t("change.required"))),
    defaultValues: EMPTY,
    values: loaded,
  });
  const { onError, summary, clear } = useProblemForm(form, { mapField: toFormField });

  if (employee.isPending) {
    return <PageLoading />;
  }
  if (employee.isError) {
    throw employee.error;
  }

  const submit = form.handleSubmit((values) => {
    if (!loaded) {
      return;
    }
    const changes = changedFields(loaded, values);
    clear();
    if (Object.keys(changes).length === 0) {
      setNothing(true);
      return;
    }
    setNothing(false);
    propose.mutate(
      { changes, note: values.note },
      {
        onSuccess: () => {
          toast(t("change.sent"));
          navigate(PROFILE);
        },
        // A refused value appears next to its input; anything else (a proposal already waiting,
        // an outage) appears above the form. What was typed stays.
        onError,
      },
    );
  });

  const sectionClass = "grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-2";
  const legendClass = "text-section font-semibold md:col-span-2";

  return (
    <>
      <PageHeader title={t("change.title")} back={PROFILE}>
        {t("change.rule")}
      </PageHeader>
      <form onSubmit={submit} noValidate className="grid max-w-4xl gap-6">
        <FormSummary problems={nothing ? [t("change.nothing")] : summary} />

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.identity")}</h2>
          <TextField control={form.control} name="first_name" label={t("employees:fields.first_name")} />
          <TextField control={form.control} name="last_name" label={t("employees:fields.last_name")} />
          <DateField control={form.control} name="date_of_birth" label={t("employees:fields.date_of_birth")} />
          <SelectField
            control={form.control}
            name="gender"
            label={t("employees:fields.gender")}
            options={[
              { value: "", label: t("employees:gender.unspecified") },
              { value: "female", label: t("employees:gender.female") },
              { value: "male", label: t("employees:gender.male") },
            ]}
          />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.contact")}</h2>
          <TextField
            control={form.control}
            name="personal_email"
            type="email"
            label={t("employees:fields.personal_email")}
          />
          <TextField control={form.control} name="phone" label={t("employees:fields.phone")} />
          <TextAreaField control={form.control} name="address" label={t("employees:fields.address")} />
        </section>

        <section className={sectionClass}>
          <h2 className={legendClass}>{t("sections.emergency")}</h2>
          <TextField
            control={form.control}
            name="emergency_contact_name"
            label={t("employees:fields.emergency_contact_name")}
          />
          <TextField
            control={form.control}
            name="emergency_contact_phone"
            label={t("employees:fields.emergency_contact_phone")}
          />
        </section>

        <TextAreaField control={form.control} name="note" label={t("change.note")} />

        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            {t("change.submit")}
          </Button>
          <Button variant="ghost" asChild>
            <Link to={PROFILE}>{t("change.cancel")}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/profile`
Expected: all pass (5 in `MyProfilePage.test.tsx`, 6 in `ProposeChangePage.test.tsx`, and the tests of Task 18)

- [ ] **Step 5: Register the routes**

In `frontend/src/workspaces/me/routes.tsx` (plan 01b left the array empty), add below the existing import (with `import { lazy } from "react";`, which the file does not have yet):

```tsx
const MyProfilePage = lazy(() => import("@/features/profile/MyProfilePage"));
const ProposeChangePage = lazy(() => import("@/features/profile/ProposeChangePage"));
```

and append to the `meRoutes` array:

```tsx
  { path: "profile", element: <MyProfilePage /> },
  { path: "profile/change", element: <ProposeChangePage /> },
```

- [ ] **Step 6: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features/profile src/i18n`
Expected: no lint or type error; all tests pass

Open `http://localhost:5173`, sign in as `employee.a1@impactrisks.com`. Expected: My space exists and shows "Profil"; the page shows the four blocks; "Proposer une modification" opens the form filled in; after changing the phone number and sending, the profile shows "Votre modification attend la décision des RH" in place of the button; signed in as `hr@impactrisks.com`, the notification leads to `/hr/profile-changes`, where the proposal can be accepted; back as the employee, the phone number is the new one and the proposal is under "Mes propositions passées" as "Acceptée".

```bash
git add frontend/src/features/profile frontend/src/workspaces/me/routes.tsx
git commit -m "feat(profile): my profile and proposing a change"
```

### Task 20: My team and Overview: the people lists

**Files:**
- Create: `frontend/src/features/employees/peopleColumns.tsx`, `frontend/src/features/employees/TeamPeoplePage.tsx`
- Modify: `frontend/src/workspaces/team/routes.tsx` (one import, one route), `frontend/src/workspaces/overview/routes.tsx` (one import, one route)
- Test: `frontend/src/features/employees/TeamPeoplePage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/employees?scope=team` (the people the manager is responsible for, directly or through a running delegation; rows carry no number, manager or status for a manager); `useEmployees`, `type EmployeeRow`, `makeEmployeeRow`, `pageOf`; `EmployeesPage` (Task 13) and `EmployeeRecordPage` (Task 15, routes `people/:id` already registered); `DataTable`, `Pager`, `EmptyState`, `PageHeader`, `useListParams`.
- Produces:
  - `TeamPeoplePage` (default export) at `/team/people`; the "Personnes" entry of My team appears.
  - `/overview/people`: `EmployeesPage` in `overview` mode; the "Personnes" entry of Overview appears, and with it the workspace.
  - **Extension point** `features/employees/peopleColumns.tsx`:

```ts
export interface PeopleColumn {
  id: string;
  headerKey: string;                       // a fully qualified translation key: "namespace:key"
  order: number;                           // columns are shown in ascending order
  cell: (row: EmployeeRow) => ReactNode;
}
export const PEOPLE_COLUMNS: PeopleColumn[];   // name 10, position 20
```

  UI 6.3 shows five attributes per person: name, position, today, annual balance, requests waiting. This plan ships the first two. The plans that own the other three append them with `PEOPLE_COLUMNS.push({...})` at the end of the file, as `recordBlocks.tsx` is extended: requests waiting (plan 03b, order 50), annual balance (plan 04, order 40), today (plan 05, order 30). `DataTable` refuses a seventh column.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/employees/TeamPeoplePage.test.tsx`

```tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { PEOPLE_COLUMNS } from "./peopleColumns";
import TeamPeoplePage from "./TeamPeoplePage";
import { makeEmployeeRow, pageOf } from "./testing";

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
// What the API gives a manager: no number, no manager, no status.
const member = makeEmployeeRow({ employee_number: null, manager: null, status: null });

function mount() {
  return renderApp(<TeamPeoplePage />, { route: "/team/people", path: "/team/people", me: manager });
}

describe("TeamPeoplePage", () => {
  it("lists my team with a name and a position, and links to the person", async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("/api/v1/employees", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json(pageOf([member]));
      }),
    );

    mount();

    expect(await screen.findByRole("link", { name: "Amal Employee" })).toHaveAttribute(
      "href",
      "/team/people/emp-1",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Personnes" })).toBeInTheDocument();
    const table = within(screen.getByRole("table", { name: "Personnes" }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Nom", "Poste"]);
    expect(table.getByText("Chargé de clientèle")).toBeInTheDocument();
    expect(seen.at(-1)?.get("scope")).toBe("team");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains an empty team", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([]))));

    mount();

    expect(await screen.findByText("Personne ne vous est rattaché")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Les personnes dont vous êtes responsable, ou qui vous sont confiées par délégation, apparaissent ici.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the columns other features register, in their order", async () => {
    server.use(http.get("/api/v1/employees", () => HttpResponse.json(pageOf([member]))));
    PEOPLE_COLUMNS.push({ id: "probe", headerKey: "employees:fields.phone", order: 15, cell: (row) => row.phone });
    try {
      mount();

      const table = within(await screen.findByRole("table", { name: "Personnes" }));
      expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "Nom",
        "Téléphone",
        "Poste",
      ]);
      expect(table.getByText("20 123 456")).toBeInTheDocument();
    } finally {
      PEOPLE_COLUMNS.pop();
    }
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/employees/TeamPeoplePage.test.tsx`
Expected: FAIL, `Failed to resolve import "./peopleColumns"`

- [ ] **Step 2: Write the columns and the page**

`frontend/src/features/employees/peopleColumns.tsx`

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";

import type { EmployeeRow } from "./api";

/** One attribute of a person in the list of My team. */
export interface PeopleColumn {
  id: string;
  /** A fully qualified translation key: "namespace:key". */
  headerKey: string;
  /** Columns are shown in ascending order. The name stays first: it is the link to the person. */
  order: number;
  cell: (row: EmployeeRow) => ReactNode;
}

/**
 * What My team, People shows per person (UI 6.3). Other features append their column at the end of
 * this file with `PEOPLE_COLUMNS.push({...})`. A list shows at most six attributes; `DataTable` enforces it.
 */
export const PEOPLE_COLUMNS: PeopleColumn[] = [
  {
    id: "name",
    headerKey: "employees:people.columns.name",
    order: 10,
    cell: (row) => (
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        to={`/team/people/${row.public_id}`}
      >
        {row.name}
      </Link>
    ),
  },
  {
    id: "position",
    headerKey: "employees:people.columns.position",
    order: 20,
    cell: (row) => row.position.title,
  },
];
```

`frontend/src/features/employees/TeamPeoplePage.tsx`

```tsx
import { useTranslation } from "react-i18next";

import { type Column, DataTable, EmptyState, PageHeader, Pager, useListParams } from "@/components";

import { type EmployeeRow, useEmployees } from "./api";
import { PEOPLE_COLUMNS } from "./peopleColumns";

const PAGE_SIZE = 25;

/** My team, People: the people the manager is responsible for, directly or through a delegation. */
export default function TeamPeoplePage() {
  const { t } = useTranslation("employees");
  const { page, setPage } = useListParams({});
  const list = useEmployees({ scope: "team", page });

  if (list.error) {
    throw list.error;
  }

  const columns: Column<EmployeeRow>[] = [...PEOPLE_COLUMNS]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({ key: column.id, header: t(column.headerKey), cell: column.cell }));

  return (
    <>
      <PageHeader title={t("people.title")} />
      <DataTable
        label={t("people.title")}
        columns={columns}
        rows={list.data?.results ?? []}
        rowKey={(row: EmployeeRow) => row.public_id}
        isLoading={list.isPending}
        empty={<EmptyState title={t("people.empty.title")} hint={t("people.empty.hint")} />}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={list.data?.count ?? 0} onPage={setPage} />
    </>
  );
}
```

Run: `docker compose run --rm web npx vitest run src/features/employees/TeamPeoplePage.test.tsx`
Expected: 3 passed

- [ ] **Step 3: Register the two routes**

In `frontend/src/workspaces/team/routes.tsx`, add the import and append the route:

```tsx
const TeamPeoplePage = lazy(() => import("@/features/employees/TeamPeoplePage"));
```

```tsx
  { path: "people", element: <TeamPeoplePage /> },
```

In `frontend/src/workspaces/overview/routes.tsx`, add the import and append the route:

```tsx
const EmployeesPage = lazy(() => import("@/features/employees/EmployeesPage"));
```

```tsx
  { path: "people", element: <EmployeesPage mode="overview" /> },
```

The directory in `overview` mode is covered by the test "shows no action to an executive" of Task 13, the record in `overview` and `team` modes by the tests of Task 15.

- [ ] **Step 4: Check, look and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run src/features/employees src/app src/i18n`
Expected: no lint or type error; all tests pass

Open `http://localhost:5173` as `manager.a@impactrisks.com`. Expected: My team shows "Personnes" before "Délégations"; the list holds Amal Employee and Bilel Employee and nobody of the other department; opening one shows name, department, position, e-mail and phone, and nothing else. As `ceo@impactrisks.com`: Overview shows "Personnes" with the eight demo people, the record of each with its blocks, and not one button or edit link on either page.

```bash
git add frontend/src/features/employees frontend/src/workspaces/team/routes.tsx frontend/src/workspaces/overview/routes.tsx
git commit -m "feat(employees): people lists of My team and Overview"
```

### Task 21: Administration: create an account for an employee

Plan 01b left the extension point `features/accounts/SubjectFields.tsx`: it asks for a name and an email. From this task on it first offers the employees who have no account; choosing one replaces the two inputs, and the form then sends the employee alone (`toAccountBody` of plan 01b already does that).

**Files:**
- Create: `frontend/src/features/accounts/candidates.ts`
- Modify: `frontend/src/features/accounts/SubjectFields.tsx` (replace the whole file), `frontend/src/test/handlers.ts` (one default answer appended)
- Test: `frontend/src/features/accounts/SubjectFields.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/accounts/candidates` (plan 01a: the System Administrator only; each entry is `{ public_id, full_name, email }`, served by the `OrganisationDirectory` of Task 5); `CreateAccountValues`, `CreateAccountPage`, `accountKeys` of plan 01b; the texts `accounts:create.fullName`, `accounts:create.email` (plan 01b) and `employees:accountFor.*` (Task 12); `Field`, `describedBy`, `TextField`, `NativeSelect`.
- Produces:
  - `useAccountCandidates()` in `@/features/accounts/candidates` (its entries are typed by the generated schema).
  - `SubjectFields({ control }: { control: Control<CreateAccountValues> })`, same contract as before: it draws the inputs and shows the errors of `employee`, `full_name` and `email`.
  - A default answer for `accounts/candidates` (an empty list) among the handlers every test starts with, so the tests of plan 01b that render the form stay as they are.
- Behaviour: the choice "Employé" is drawn only when at least one employee has no account. Its first entry, selected at the start, is "Aucun : compte sans fiche d'employé", under which the name and email inputs are shown exactly as in plan 01b (its tests and its browser journeys fill them right away). Choosing an employee hides the two inputs, keeps what was typed in them, and says which address the account will use.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/accounts/SubjectFields.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import CreateAccountPage from "./CreateAccountPage";

const LEILA = { public_id: "emp-8", full_name: "Leila Ayari", email: "leila.ayari@impactrisks.com" };

const created = {
  account: {
    public_id: "a9",
    email: LEILA.email,
    name: LEILA.full_name,
    state: "awaiting_first_sign_in",
    roles: [],
    last_login_at: null,
    has_employee: true,
  },
  temporary_password: "Xk7-temp-Pass-2209",
  expires_at: "2026-10-06T10:00:00+01:00",
};

const open = () => renderApp(<CreateAccountPage />, { route: "/admin/accounts/new" });

describe("SubjectFields", () => {
  beforeEach(() => {
    server.use(http.get("/api/v1/accounts/candidates", () => HttpResponse.json([LEILA])));
  });

  it("offers the employees without an account and still asks for a name and an email by default", async () => {
    open();

    expect(await screen.findByRole("option", { name: "Leila Ayari" })).toBeInTheDocument();
    expect(screen.getByLabelText("Employé")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Aucun : compte sans fiche d'employé" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail professionnelle")).toBeInTheDocument();
  });

  it("creates the account of an employee from the record alone", async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post("/api/v1/accounts", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });

    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    expect(screen.queryByLabelText("Nom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse e-mail professionnelle")).not.toBeInTheDocument();
    expect(
      screen.getByText("Le compte utilisera le nom de la fiche et l'adresse leila.ayari@impactrisks.com."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Compte créé pour Leila Ayari" })).toBeInTheDocument();
    expect(body).toEqual({ employee: "emp-8", roles: [] });
  });

  it("keeps what was typed when the administrator goes back to a name and an email", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });

    await user.type(screen.getByLabelText("Nom"), "Karim Admin");
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");
    await user.selectOptions(screen.getByLabelText("Employé"), "");

    expect(screen.getByLabelText("Nom")).toHaveValue("Karim Admin");
  });

  it("shows a refusal about the employee next to the choice and keeps the choice", async () => {
    const user = userEvent.setup();
    const detail = "Cette personne a déjà un compte.";
    server.use(
      http.post("/api/v1/accounts", () =>
        problemResponse(409, "accounts.employee_has_account", detail, [{ field: "employee" }]),
      ),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByLabelText("Employé")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Employé")).toHaveAccessibleDescription(expect.stringContaining(detail));
    expect(screen.getByLabelText("Employé")).toHaveValue("emp-8");
  });

  it("shows a refusal about the address of the record although its input is hidden", async () => {
    const user = userEvent.setup();
    const detail = "Cette adresse est déjà utilisée par un compte.";
    server.use(
      http.post("/api/v1/accounts", () => problemResponse(400, "accounts.email_taken", detail, [{ field: "email" }])),
    );
    open();
    await screen.findByRole("option", { name: "Leila Ayari" });
    await user.selectOptions(screen.getByLabelText("Employé"), "emp-8");

    await user.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(await screen.findByText(detail)).toBeInTheDocument();
  });

  it("does not offer the choice when every employee has an account", async () => {
    let asked = false;
    server.use(
      http.get("/api/v1/accounts/candidates", () => {
        asked = true;
        return HttpResponse.json([]);
      }),
    );
    open();

    await waitFor(() => expect(asked).toBe(true));
    expect(screen.getByLabelText("Nom")).toBeInTheDocument();
    expect(screen.queryByLabelText("Employé")).not.toBeInTheDocument();
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/accounts/SubjectFields.test.tsx`
Expected: FAIL: the option "Leila Ayari" is never found (the form of plan 01b does not read the candidates)

- [ ] **Step 2: Add the hook and the default answer**

`frontend/src/features/accounts/candidates.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";

import { accountKeys } from "./api";

/** The employees who have no account yet. Read again after an account is created (it shares the accounts key). */
export function useAccountCandidates() {
  return useQuery({
    queryKey: [...accountKeys.all, "candidates"] as const,
    queryFn: () => call(api.GET("/api/v1/accounts/candidates")),
  });
}
```

In `frontend/src/test/handlers.ts`, append this element to the `handlers` array:

```ts
  http.get("/api/v1/accounts/candidates", () => HttpResponse.json([])),
```

- [ ] **Step 3: Replace the subject fields**

Replace `frontend/src/features/accounts/SubjectFields.tsx` with:

```tsx
import { useId } from "react";
import { type Control, useController, useFormState } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { describedBy, Field, TextField } from "@/components";
import { NativeSelect } from "@/components/ui/native-select";

import { useAccountCandidates } from "./candidates";
import type { CreateAccountValues } from "./createAccountForm";

/**
 * Who the account is for. It draws the inputs, and shows the errors, of `employee`, `full_name` and `email`.
 * An employee without an account is chosen from the list: the name and the address then come from the
 * record. "None" keeps the name and email inputs, for an account that has no employee record.
 */
export function SubjectFields({ control }: { control: Control<CreateAccountValues> }) {
  const { t } = useTranslation();
  const id = useId();
  const candidates = useAccountCandidates();
  const { field, fieldState } = useController({ control, name: "employee" });
  const { errors } = useFormState({ control, name: ["full_name", "email"] });

  const people = candidates.data ?? [];
  const chosen = people.find((person) => person.public_id === field.value) ?? null;
  const offered = people.length > 0 || field.value !== null;
  const error = fieldState.error?.message;
  const hint = chosen ? t("employees:accountFor.hint", { email: chosen.email }) : undefined;
  // With an employee chosen the name and email inputs are not drawn: their errors are shown here.
  const hidden = field.value ? [errors.full_name?.message, errors.email?.message].filter(Boolean) : [];

  return (
    <>
      {offered ? (
        <Field label={t("employees:accountFor.employee")} htmlFor={id} error={error} hint={hint}>
          <NativeSelect
            id={id}
            name={field.name}
            ref={field.ref}
            value={field.value ?? ""}
            onChange={(event) => field.onChange(event.target.value || null)}
            onBlur={field.onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
          >
            <option value="">{t("employees:accountFor.none")}</option>
            {people.map((person) => (
              <option key={person.public_id} value={person.public_id}>
                {person.full_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}

      {field.value ? null : (
        <>
          <TextField control={control} name="full_name" label={t("accounts:create.fullName")} autoComplete="off" />
          <TextField
            control={control}
            name="email"
            label={t("accounts:create.email")}
            type="email"
            inputMode="email"
            autoComplete="off"
          />
        </>
      )}

      {!offered && error ? (
        <p role="alert" className="text-caption font-medium text-refused">
          {error}
        </p>
      ) : null}
      {hidden.map((message) => (
        <p key={message} role="alert" className="text-caption font-medium text-refused">
          {message}
        </p>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `docker compose run --rm web npx vitest run src/features/accounts`
Expected: all pass: 6 in `SubjectFields.test.tsx`, and the tests of plan 01b unchanged (8 in `CreateAccountPage.test.tsx`: they render the form with no candidate, where it is the form of plan 01b)

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error

- [ ] **Step 5: Look and commit**

Open `http://localhost:5173` as `sysadmin@impactrisks.com`. Expected: the status page names Leila Ayari under the employees without an account; "Créer un compte" offers her under "Employé"; choosing her replaces the two inputs by the sentence naming her address; the account is created with her name, and she disappears from the status page and from the choice.

```bash
git add frontend/src/features/accounts frontend/src/test/handlers.ts
git commit -m "feat(accounts): create an account for an employee without one"
```

### Task 22: The journeys in a browser, and the check of the whole step

Three journeys of UI section 12 belong to this plan: "Correct an address", "Welcome a new employee" and "Record a departure". A fourth, "Name a delegate", exercises UI 6.6 from both sides. They run against the development stack in the two projects of plan 01b (`desktop`, `phone`), which share one database and run one after the other: whatever a journey creates carries a mark of its own, and the one journey that changes a seeded person (the address of Amal Employee) can be played twice.

**Files:**
- Create: `frontend/e2e/people.ts`
- Test: `frontend/e2e/correct-an-address.spec.ts`, `frontend/e2e/welcome-an-employee.spec.ts`, `frontend/e2e/record-a-departure.spec.ts`, `frontend/e2e/name-a-delegate.spec.ts`

**Interfaces:**
- Consumes: `signIn`, `signOut`, `PASSWORD`, `SYSADMIN`, `uniqueEmail` of `e2e/helpers.ts`; the demo people of Task 11 (`hr@` is Senna RH, `manager.a@` Mounir Manager, `manager.b@` Nadia Manager, `employee.a1@` Amal Employee; departments "Souscription" and "Sinistres"; position "Chargé de clientèle"); every page of Tasks 13 to 21.
- Produces: `e2e/people.ts` with `HR`, `MANAGER`, `OTHER_MANAGER`, `EMPLOYEE` (`{ email, name }`), `stamp(testInfo)`, `landed(page)`, `newPerson(testInfo, firstName)`, `fullName(person)`, `createEmployee(page, person)`. Later plans reuse them.
- As in plan 01b, these specs are written after the pages they exercise and are expected to pass at once. Step 3 shows that one can fail.

- [ ] **Step 1: Write the helpers**

`frontend/e2e/people.ts`

```ts
import { expect, type Page, type TestInfo } from "@playwright/test";

import { uniqueEmail } from "./helpers";

/** The demo people of `apps/organisation/seed.py`. Each signs in with `PASSWORD`. */
export const HR = { email: "hr@impactrisks.com", name: "Senna RH" };
export const MANAGER = { email: "manager.a@impactrisks.com", name: "Mounir Manager" };
export const OTHER_MANAGER = { email: "manager.b@impactrisks.com", name: "Nadia Manager" };
export const EMPLOYEE = { email: "employee.a1@impactrisks.com", name: "Amal Employee" };

/** A short text no other run has used: the two projects share one database. */
export function stamp(testInfo: TestInfo): string {
  return `${testInfo.project.name}-${Date.now().toString(36)}`;
}

/** Waits until the sign-in has led somewhere, so that the next `goto` does not interrupt it. */
export async function landed(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
}

export interface NewPerson {
  number: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** An employee nobody has entered yet. */
export function newPerson(testInfo: TestInfo, firstName: string): NewPerson {
  return {
    number: `T${Date.now().toString(36).toUpperCase()}`,
    firstName,
    lastName: `Essai ${stamp(testInfo)}`,
    email: uniqueEmail(testInfo, firstName.toLowerCase()),
  };
}

export function fullName(person: NewPerson): string {
  return `${person.firstName} ${person.lastName}`;
}

/** As HR, in French: enters an employee of "Souscription" who reports to Mounir Manager, and ends on the new record. */
export async function createEmployee(page: Page, person: NewPerson): Promise<void> {
  await page.goto("/hr/employees");
  await page.getByRole("link", { name: "Nouvel employé", exact: true }).click();
  await page.getByLabel("Matricule", { exact: true }).fill(person.number);
  await page.getByLabel("Prénom", { exact: true }).fill(person.firstName);
  await page.getByLabel("Nom", { exact: true }).fill(person.lastName);
  await page.getByLabel("E-mail professionnel", { exact: true }).fill(person.email);
  await page.getByLabel("Date d'embauche", { exact: true }).fill("2026-10-01");
  await page.getByLabel("Type de contrat", { exact: true }).selectOption({ label: "CDI" });
  await page.getByLabel("Département", { exact: true }).selectOption({ label: "Souscription" });
  await page.getByLabel("Poste", { exact: true }).selectOption({ label: "Chargé de clientèle" });
  await page.getByLabel("Responsable", { exact: true }).selectOption({ label: "Mounir Manager · Souscription" });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: fullName(person), exact: true })).toBeVisible();
}
```

- [ ] **Step 2: Write the four journeys**

`frontend/e2e/correct-an-address.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut } from "./helpers";
import { EMPLOYEE, HR, landed, stamp } from "./people";

test("an employee corrects an address and HR accepts it", async ({ page }, testInfo) => {
  const address = `12 rue de Carthage, Tunis (${stamp(testInfo)})`;

  await signIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/me/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Mon profil", exact: true })).toBeVisible();

  // A run that stopped half-way leaves a proposal waiting: withdraw it first.
  const propose = page.getByRole("link", { name: "Proposer une modification", exact: true });
  const withdraw = page.getByRole("button", { name: "Retirer la proposition", exact: true });
  await expect(propose.or(withdraw)).toBeVisible();
  if (await withdraw.isVisible()) {
    await withdraw.click();
  }

  await propose.click();
  await expect(page.getByText("La modification s'applique une fois acceptée par les RH.")).toBeVisible();
  await page.getByLabel("Adresse", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Envoyer aux RH", exact: true }).click();

  // Back on the profile: the proposal waits, and the action that would add a second one is gone.
  await expect(page).toHaveURL(/\/me\/profile$/);
  await expect(page.getByRole("heading", { name: "Votre modification attend la décision des RH" })).toBeVisible();
  await expect(page.getByText(address)).toBeVisible();
  await expect(propose).toHaveCount(0);
  await signOut(page, EMPLOYEE.name, "fr");

  // HR decides. Until plan 03b builds the desk, the notification is what leads to this page.
  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/hr/profile-changes");
  await page.getByRole("button", { name: `Ouvrir la proposition de ${EMPLOYEE.name}`, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(address);
  await sheet.getByRole("button", { name: "Accepter", exact: true }).click();
  await expect(page.getByText("Modification acceptée. La fiche est à jour.")).toBeVisible();
  await expect(page.getByText("Aucune modification à traiter.")).toBeVisible();

  // The record carries the new address.
  await page.goto("/hr/employees");
  await page.getByRole("link", { name: EMPLOYEE.name, exact: true }).click();
  await page.getByRole("button", { name: "Informations personnelles", exact: true }).click();
  await expect(page.getByText(address)).toBeVisible();
  await signOut(page, HR.name, "fr");

  // And the employee sees the answer.
  await signIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/me/profile");
  await expect(page.getByText(address)).toBeVisible();
  await expect(propose).toBeVisible();
  await page.getByRole("button", { name: "Mes propositions passées", exact: true }).click();
  await expect(page.getByText("Acceptée").first()).toBeVisible();
});
```

`frontend/e2e/welcome-an-employee.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";
import { createEmployee, fullName, HR, landed, newPerson } from "./people";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

test("HR welcomes a new employee and the administrator creates the account", async ({ page }, testInfo) => {
  const person = newPerson(testInfo, "Nour");
  const name = fullName(person);

  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await createEmployee(page, person);
  await expect(page.getByText("Pas encore de compte")).toBeVisible();

  // The contract goes on the record, shared with the employee, and comes back as a download.
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un document", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Fichier", { exact: true }).setInputFiles({
    name: "contrat.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await sheet.getByLabel("Intitulé", { exact: true }).fill("Contrat");
  await sheet.getByLabel("Partager avec l'employé", { exact: true }).click();
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Document ajouté.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Télécharger Contrat", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("contrat.pdf");
  await signOut(page, HR.name, "fr");

  // The administrator is told who has no account, and creates it from the record alone.
  await signIn(page, SYSADMIN.email, PASSWORD, "fr");
  await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Créer un compte", exact: true }).click();
  await page.getByLabel("Employé", { exact: true }).selectOption({ label: name });
  await expect(page.getByLabel("Nom", { exact: true })).toHaveCount(0);
  await expect(page.getByText(person.email)).toBeVisible();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
  await expect(result).toBeVisible();
  const temporary = (await result.locator("p").first().innerText()).trim();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await signOut(page, SYSADMIN.name, "fr");

  // The account is the employee's: the address of the record and the temporary password open it.
  await signIn(page, person.email, temporary, "fr");
  await expect(
    page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true }),
  ).toBeVisible();
});
```

`frontend/e2e/record-a-departure.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";
import { createEmployee, fullName, HR, landed, newPerson } from "./people";

test("HR records a departure after reading its consequences", async ({ page }, testInfo) => {
  // Someone entered for this test: a departure cannot be undone, and the demo people serve other journeys.
  const person = newPerson(testInfo, "Sami");
  const name = fullName(person);

  await signIn(page, HR.email, PASSWORD, "fr");
  await landed(page);
  await createEmployee(page, person);

  await page.getByRole("button", { name: "Enregistrer un départ", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(`Enregistrer le départ de ${name}`);
  await expect(
    sheet.getByText("Plus aucun crédit mensuel de congés ne sera ajouté après la date de départ."),
  ).toBeVisible();
  await expect(sheet.getByText("La fiche est conservée et reste consultable par les RH.")).toBeVisible();

  // Nothing happens without a date and a reason.
  await sheet.getByRole("button", { name: "Enregistrer le départ", exact: true }).click();
  await expect(sheet.getByText("Ce champ est obligatoire.")).toHaveCount(2);

  await sheet.getByLabel("Date de départ", { exact: true }).fill("2026-10-31");
  await sheet.getByLabel("Motif", { exact: true }).fill("Démission");
  await sheet.getByRole("button", { name: "Enregistrer le départ", exact: true }).click();
  await expect(page.getByText("Départ enregistré.")).toBeVisible();
  await expect(page.getByText("A quitté l'entreprise")).toBeVisible();
  await expect(page.getByText("Motif : Démission")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer un départ", exact: true })).toHaveCount(0);

  // The person has left the normal list and is found again on request.
  await page.goto("/hr/employees");
  await page.getByRole("searchbox", { name: "Rechercher" }).fill(person.lastName);
  await expect(page.getByText("Aucun employé ne correspond")).toBeVisible();
  await page.getByRole("combobox", { name: "Statut" }).selectOption("archived");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
```

`frontend/e2e/name-a-delegate.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { PASSWORD, signIn, signOut } from "./helpers";
import { landed, MANAGER, OTHER_MANAGER } from "./people";

/** A day counted from today, as the date inputs take it. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

test("a manager names a delegate, the delegate sees it, the manager cancels it", async ({ page }, testInfo) => {
  // Each project takes its own week, so that a delegation left by one cannot overlap the other's.
  const first = testInfo.project.name === "phone" ? 40 : 30;
  const cancel = page.getByRole("button", { name: "Annuler la délégation", exact: true });

  await signIn(page, MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  await page.getByRole("button", { name: "Nommer un délégué", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Délégué", { exact: true }).selectOption({ label: `${OTHER_MANAGER.name} · Sinistres` });
  await sheet.getByLabel("Premier jour", { exact: true }).fill(day(first));
  await sheet.getByLabel("Dernier jour", { exact: true }).fill(day(first + 4));
  await sheet.getByRole("button", { name: "Nommer le délégué", exact: true }).click();
  await expect(page.getByText("Délégué nommé.")).toBeVisible();
  await expect(cancel).toBeVisible();
  await signOut(page, MANAGER.name, "fr");

  // The delegate finds it among the delegations received.
  await signIn(page, OTHER_MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  const received = page.getByRole("region", { name: "Délégations reçues" });
  await expect(received.getByText(MANAGER.name).first()).toBeVisible();
  await expect(received.getByText("À venir").first()).toBeVisible();
  await expect(cancel).toHaveCount(0);
  await signOut(page, OTHER_MANAGER.name, "fr");

  // The manager cancels it, after the consequence is stated.
  await signIn(page, MANAGER.email, PASSWORD, "fr");
  await landed(page);
  await page.goto("/team/delegations");
  await cancel.click();
  await expect(page.getByText(`La délégation à ${OTHER_MANAGER.name} n'aura pas lieu.`)).toBeVisible();
  await page.getByRole("button", { name: "Oui, annuler", exact: true }).click();
  await expect(page.getByText("Délégation terminée.")).toBeVisible();
  await expect(cancel).toHaveCount(0);
  await expect(page.getByText("Annulée").first()).toBeVisible();
});
```

- [ ] **Step 3: Run the journeys, and show that one can fail**

The stack must be running (`docker compose up -d`). **The run empties the development database** and loads the demo data again.

Run (from `frontend/`): `npx playwright test e2e/correct-an-address.spec.ts e2e/welcome-an-employee.spec.ts e2e/record-a-departure.spec.ts e2e/name-a-delegate.spec.ts`
Expected: `8 passed` (four journeys in two projects)

In `frontend/e2e/record-a-departure.spec.ts`, change `"A quitté l'entreprise"` to `"En poste"` and run `npx playwright test e2e/record-a-departure.spec.ts --project=desktop`.
Expected: `1 failed`, the report naming the text that never appeared. Put the line back and run the command again: `1 passed`.

- [ ] **Step 4: Check the whole step**

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check . && docker compose run --rm app pytest -q`
Expected: no finding; every test passes, among them the permission matrix (every route of `files` and `organisation` has its cases) and the OpenAPI test (the committed description is the generated one)

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm web npx vitest run`
Expected: no lint or type error; every test passes, among them the key parity of the `employees`, `delegations` and `profile` texts in French and English

Run (from `frontend/`): `npx playwright test`
Expected: every journey passes in both projects: the four of plan 01b and the four of this plan

Then walk through the result once at phone width (360 px wide) as `hr@impactrisks.com`: the employee list is a column of cards, the employee form a single column, each sheet covers the screen, and no page scrolls sideways.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e
git commit -m "test(e2e): correct an address, welcome an employee, record a departure, name a delegate"
```

---

## Spec coverage

| Requirement | Tasks |
|---|---|
| ORG-01 Departments and positions; one in use is deactivated, never removed | 2 (no delete route exists), 17 |
| ORG-02 Employee records with the fields of PRD 8.2; unique number and professional email | 2, 3, 4, 13 |
| ORG-03 One line manager; loops refused | 3, 13 |
| ORG-04 Never deleted; archived with a date and a reason; out of normal lists, found by HR | 7, 4 (list filter), 13 (status filter), 16 |
| ORG-05 Documents on a record, shared with the employee or not | 1, 8, 15, 19 |
| ORG-06 Own record; proposals on personal fields only | 4 (`employees/me`), 9, 19 |
| ORG-07 HR accepts or refuses with an optional comment; record updated; employee notified | 9, 18 |
| ORG-08 Manual entry, no import | 13 (the form is the only way in); the seed of Task 11 serves development and browser tests only |
| ACC-10 Archiving disables the linked account | 7 |
| PRD 5.1 An account is created for an employee (the `EmployeeDirectory` port of master 7.2) | 5, 21 |
| REQ-11 Delegation: manager and delegate both act and see; HR creates and ends for any manager | 6 (rules, reach, job), 14, 15 (HR, on the record) |
| PRD 3 Users and roles: Employee and Manager come from the organisation chart | 4 (derived-role provider) |
| PRD 7 Permission matrix: employee record, documents, profile changes, delegations | 2, 4, 6, 7, 8, 9, 10 (matrix cases and reach tests in each) |
| PRD 8.2 Data model: Department, Position, Employee, Delegation, EmployeeDocument, ProfileChange | 2, 6, 8, 9 |
| PRD 9.6 Files; PRD 10 uploads | 1 |
| PRD 5.10 Audit: who changed what, from what to what | 2, 3, 6, 7, 8, 9 (each write is audited), 10 (history of a record) |
| PRD 5.6 Notifications raised by this step: proposal received, accepted or refused; delegation started or ended | 9, 6 |
| PRD 12.8 Browser tests of the journeys | 22 |
| UI 5.8 Profile | 19 |
| UI 5.9 Propose a change | 19 |
| UI 6.3 People (My team) | 20 (name, position; the other three columns through `PEOPLE_COLUMNS`), 15 (the person) |
| UI 6.6 Delegations | 14 (the prompt of plan 03a opens it filled in through `?from=&to=`) |
| UI 7.5 Profile changes | 18 |
| UI 7.9 Employees: directory, record, new and edit, record a departure | 13, 15, 16 |
| UI 7.12 Settings: index, departments and positions | 17 |
| UI 8.2 People (Overview), read-only | 13 (`overview` mode), 15, 20 |
| UI 9.3 Create account: the employee, or a name and an email | 21 |
| UI 12 Journeys: correct an address, welcome a new employee, record a departure | 22 |
| Master 6.8 Reach | 4, 6 |
| Master 6.9 Job `organisation.delegation_transitions` | 6 |
| Master 6.11 Cast and matrix | 2, 6, 8, 9 (builders), every backend task (cases) |
| Master 7.6 `files` | 1 |
| Master 7.7 `organisation` | 2 to 10 |
| Master 9.3 Extension points | 12 (`EmployeePicker`), 14 (`DelegationSheet`), 15 (`recordBlocks.tsx`), 17 (`readOnly`), 21 (`SubjectFields.tsx`) |
| Master 9.4 Pages | 13 to 20 |
| Master 10, item 7 Hostile or sloppy uploads | 1 |

## Contract notes

Choices made where the master is silent, and the few places where this plan departs from it. Later plans can rely on them.

**Backend**

1. `Employee.archived_at` is a date (the leaving date HR enters), not a timestamp. Added column `ProfileChange.note` (the employee's optional message to HR).
2. There is no delete route for departments or positions, so `organisation.in_use` is never raised. Added error code `organisation.delegation_delegate_inactive` (the delegate is suspended or has left).
3. Query parameters: `GET employees` takes `scope` (`team`, `all`), `search`, `department`, `manager`, `status`, `ordering`; people who left are returned only with `status=archived`. `GET delegations` takes `scope` (`mine`, `all`) and `manager`. `GET profile-changes` takes `scope`, `status` (`pending`, `decided`, `accepted`, `rejected`, `withdrawn`; `decided` means no longer pending) and `employee`.
4. `GET employees` returns one row shape, `EmployeeListOut`; `employee_number`, `manager` and `status` are null for a viewer who is neither HR nor an executive. `GET employees/{public_id}` is described as `EmployeeOut | EmployeeTeamOut`; the frontend tells them apart with `isFullRecord`. The status of an employee (`active`, `suspended`) is changed through `PATCH employees/{public_id}`; `archived` only through `archive`.
5. Reach: a delegation is not transitive (a delegate does not pass on what was delegated to them); `team_ids` leaves out the user and people who left. `apps.organisation.services.delegations.close_delegation` ends a delegation without the rights check, for use inside the package.
6. An HR holder cannot decide their own proposal, and it is left out of their queue. Archiving can be refused by plan 01a's `disable_account` (`accounts.cannot_change_self`, `accounts.last_sysadmin`); nothing is archived then.
7. `OrganisationDirectory.candidate()` raises `Conflict("accounts.employee_has_account", field="employee")` for an employee who already has an account (plan 01a, contract note 26).
8. Archive sections: this plan contributes `delegations`. The frontend already has titles for `open_requests` and `open_steps`; plan 03a's contributor should use these two keys.
9. Tests: the cast employees carry the names of the cast accounts ("Amal Employee", "Senna RH", …). Builders `make_department`, `make_position`, `make_employee`, `make_delegation`, `make_document`, `make_profile_change` live in `apps/organisation/tests/world.py`. `backend/conftest.py` gains one import line (`from apps.files.testing import files_root`): every test writes files to a temporary folder.
10. Assertions of plan 01a that listed the complete roles or the employee link of a cast account are brought up to date in Tasks 4, 5 and 11 (every cast account but the administrator now holds `employee`).
11. Demo data: E001 to E007 are the seven demo accounts under their account names; E008 Leila Ayari has no account. Departments DIR, UW, CLM, FIN; positions CEO, HRR, HEAD, OFF.

**Frontend**

12. Components call `useTranslation("<namespace>")`; plan 01b's call `useTranslation()` and write `namespace:key`. Both forms resolve the same keys.
13. Types of this plan are appended to `@/api/types` and re-exported by `features/employees/api.ts`, `features/delegations/api.ts` and `features/profile/api.ts`.
14. New extension points: `features/employees/peopleColumns.tsx` (`PEOPLE_COLUMNS`: name 10, position 20; expected later: today 30 from plan 05, annual balance 40 from plan 04, requests waiting 50 from plan 03b) and `features/settings/hrSubjects.ts` (`HR_SETTINGS_SUBJECTS`, the entries of the HR settings index; plan 03b appends its own).
15. `RECORD_BLOCKS` orders: personal 10, team 20, documents 30, proposals 60 (HR desk only), history 90. Left free: requests 40 (plan 03b), balance 50 and the balance fact 65 (plan 04). Overview has no proposals block because the API gives proposals to their author and to HR only.
16. `EmployeesPage` takes `mode: "hr" | "overview"`; `EmployeeRecordPage` takes `mode: RecordMode` and is mounted at `/hr/employees/:id`, `/overview/people/:id` and `/team/people/:id`. `DepartmentsPositionsPage` takes `readOnly`.
17. `/hr/profile-changes` has no navigation entry: the desk of plan 03b links to it. Until then HR reaches it from the notification and decides from the employee record as well.
18. `SubjectFields` reads `GET accounts/candidates` through `features/accounts/candidates.ts`; its texts are in `employees.json` under `accountFor`. `frontend/src/test/handlers.ts` gains a default empty answer for that route.
19. A component that can leave the page when its own mutation refreshes the lists awaits `mutateAsync` instead of passing callbacks to `mutate` (`EndDelegationButton`, `DepartureSheet`), or leaves the mutation to its page (`MyProfilePage`).
20. `e2e/people.ts` holds the demo people and `createEmployee` for later journeys. A journey never records the departure of a seeded person.
