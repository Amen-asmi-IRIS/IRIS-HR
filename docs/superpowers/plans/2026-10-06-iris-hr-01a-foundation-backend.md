# IRIS HR 01a: Foundation Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** create the repository and the development stack, and build the backend foundation of the IRIS HR platform: an API that signs a user in, enforces roles, audits every action, stores settings and notifications, runs scheduled jobs, and proves its permissions with a matrix test.

**Architecture:** one Django project (`backend/config`) with five apps under `backend/apps`: `core` (errors, messages, request context, logging, pagination, Excel, jobs, health), `accounts` (users, roles, sign-in, account administration), `audit` (append-only events), `settings` (typed business and system settings), `notifications` (in-app notifications). Views are thin; rules live in service functions; every endpoint declares its allowed roles and has a row in the permission matrix. PostgreSQL is the only store; Procrastinate runs jobs from the same image.

**Tech Stack:** Python 3.13, Django 5.2 LTS, Django REST Framework, drf-spectacular, PostgreSQL 17 with psycopg 3, Procrastinate (Django integration), argon2-cffi, cryptography, openpyxl, croniter, Gunicorn, pytest, pytest-django, time-machine, Ruff, uv, Docker Compose, PowerShell 5.1.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (the binding contract: sections 2, 4, 5, 6, 7.1 to 7.5)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (sections 3, 5.1, 5.6, 5.9, 5.10, 8.1, 8.6 to 8.8, 9, 10, 12.1 to 12.3, 12.6)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (sections 4 and 9, for the messages and data the pages of plan 01b need)

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan; values are copied from the specs.

- ACC-01: "The login identifier is the employee's professional email. Only addresses ending in `@impactrisks.com` are accepted, compared case-insensitively."
- ACC-02: "Passwords have at least 12 characters, are rejected if found in a common-password list or if similar to the user's name or email, and are stored with Argon2. There is no forced periodic change."
- ACC-03: "After 5 consecutive failed sign-ins an account is locked for 15 minutes. Sign-in attempts are also rate-limited per network address. Both numbers are settings."
- ACC-04: "A session ends after 2 hours of inactivity (a setting) and when the browser closes. Disabling an account ends its sessions immediately."
- ACC-05: "The system generates a temporary password, shows it once to the administrator, and it expires after 24 hours. The user must choose a new password at first sign-in."
- ACC-06: "The administrator never chooses or sees a permanent password."
- PRD 3: "One account cannot hold both HR and System Administrator." "A System Administrator account may exist without an employee record."
- PRD 9.2: "Views, jobs and other apps call services; they do not query another app's tables. Business rules live in services, never in views or serializers."
- PRD 9.3: "Authentication: server-side session in a cookie marked HttpOnly, Secure and SameSite=Lax, with CSRF protection. No tokens in browser storage."
- PRD 9.3: "Errors use one problem-details format: type, title, status, translated detail, per-field errors, request identifier."
- PRD 9.5: "A failed job is retried with back-off and, if it still fails, raises an in-app notification to System Administrators and an error in the logs."
- PRD 9.7: "Infrastructure values and secrets come from environment variables, validated at start-up; the application refuses to start with a missing or malformed value."
- PRD 9.7: "Logs are structured JSON on standard output [...]. Each line carries the request identifier and user identifier, never passwords, comments or file contents."
- PRD 9.7: "Unexpected errors show the user a generic message with the request identifier, and notify System Administrators in-app."
- AUD-01: "The audit trail is append-only." (enforced by triggers, master D8)
- AUD-04: "Each event records the actor (or "system"), time, network address, the item, and a request identifier that also appears in the application logs."
- NOT-03: "A notification links to its item. Its text never contains a sick-leave comment or any detail of a medical document."
- NOT-04: "Notifications are rendered in the recipient's language."
- NOT-05: "Delivery goes through one interface so that an email channel can be added later without changing the modules that raise events."
- PRD 10: "An automated test calls every endpoint as every role and asserts the expected result. A new endpoint without an entry fails the build."
- PRD 12.3: "`.env.example` is committed and documents every variable with a safe example value." "Real `.env` files are git-ignored." "On the developer machine, `.env` is generated from the example on first run."
- PRD 12.3 variables: `ENVIRONMENT`, `APP_VERSION`, `SITE_HOSTNAME`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `FILE_ENCRYPTION_KEY`, `BACKUP_PASSPHRASE`, `ALLOWED_EMAIL_DOMAIN`, `TIME_ZONE`, `DEFAULT_LANGUAGE`, `LOG_LEVEL`; plus master D15: `COMPOSE_FILE`, `COMPOSE_PATH_SEPARATOR`, `HTTPS_PORT`, `HTTP_PORT`, `IMAGE_PREFIX`.
- PRD 12.6: "Django migrations, applied forwards only."
- Master D14: anonymous call 401; role not allowed 403; object outside reach 404.
- The repository is the project folder `C:\Users\aymen.mathlouthi\OneDrive - Impactrisks\Documents\Megara Projects\HR_Project` (master D1). Every path in this plan is relative to that folder. Every command runs from that folder unless a step says otherwise.
- Not in this plan: anything under `frontend/`, the `web` service, `proxy/`, `compose.server.yaml`, `.github/`, `scripts/server/`, `README.md`. Plan 01b owns them.

## Review Focus

The five inputs or conditions most likely to hurt a person using what this plan builds. Each has a pinning test in the task named.

1. **Sign-in with an imperfect address or at a bad moment** (master section 10 item 8). `  Employee.A1@ImpactRisks.COM ` must sign in; `employee.a1@impactrisks.com.evil.com`, `@impactrisk.com` and `@mail.impactrisks.com` must be refused with the domain reason; a locked account with the right password stays locked and says until when; an expired temporary password says to ask the administrator. Tests in Task 12 (`test_signin.py`).
2. **The lock-out boundary.** Four wrong passwords then the right one must sign in and reset the count; the fifth wrong one locks; the lock ends by itself after 15 minutes; both numbers follow the settings. Tests in Task 12.
3. **A session that should be dead.** Idle past the limit, account disabled while signed in, password reset by the administrator, password changed in another browser: the next call answers 401. A user who keeps working is never signed out. Tests in Task 12 (`test_inactivity.py`) and Task 13 (`test_session_api.py`).
4. **An administrator's slip.** HR added to a System Administrator (or the reverse), the last active administrator disabled or stripped of the role, an administrator changing their own roles or disabling themselves. Each is refused with a message that says what to do. Tests in Task 14 (`test_administration.py`).
5. **A setting given a wrong value.** A word where a number is expected, `true` for a number, a value outside the range, an unknown key, HR writing a system setting: the value is refused, the old value stays, and the next sign-in still works. Tests in Task 10 (`test_services.py`) and Task 17 (`test_api.py`).

---

### Task 1: Repository and root files

**Files:**
- Create: `.gitattributes`, `.gitignore`, `.env.example`
- Create: `scripts/lib/env.ps1`, `scripts/dev.ps1`
- Create: `docs/` (copied), `docs/brand/iris-logo.png`, `docs/brand/iris-logo-white.png`
- Test: `scripts/tests/env.tests.ps1`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `scripts/lib/env.ps1`: `New-EnvFromExample -ExamplePath <path> -EnvPath <path>` returns `$true` when it created the file and `$false` when the file already existed (it is then left untouched); `Get-MissingEnvKeys -EnvPath <path> -ExamplePath <path>` returns the variable names present in the example and absent from the `.env`.
  - `scripts/dev.ps1 <init|update|reset|seed|openapi>`: the developer commands of master section 5.
  - `.env.example` with the 19 variables listed in Global Constraints.

- [ ] **Step 1: Create the repository and copy the logos**

Run in PowerShell:

```powershell
Set-Location 'C:\Users\aymen.mathlouthi\OneDrive - Impactrisks\Documents\Megara Projects\HR_Project'
git init -b main
New-Item -ItemType Directory -Force docs\brand | Out-Null
Copy-Item 'docs\IRIS logo.png' docs\brand\iris-logo.png
Copy-Item 'docs\IRIS white logo.png' docs\brand\iris-logo-white.png
git status --short
```

Expected: `Initialized empty Git repository in .../HR_Project/.git/`, then one line `?? docs/`. `docs/superpowers` and `docs/design` are already in the folder. The other files of `docs/` are source material: list them in `.git/info/exclude` so that they are never committed.

- [ ] **Step 2: Write `.gitattributes`**

```gitattributes
* text=auto

*.sh         text eol=lf
*.py         text eol=lf
*.yaml       text eol=lf
*.yml        text eol=lf
*.toml       text eol=lf
*.lock       text eol=lf
*.md         text eol=lf
*.json       text eol=lf
*.css        text eol=lf
*.ts         text eol=lf
*.tsx        text eol=lf
*.html       text eol=lf
Dockerfile   text eol=lf
Caddyfile    text eol=lf
.env.example text eol=lf
*.ps1        text eol=crlf

*.png   binary
*.jpg   binary
*.pdf   binary
*.woff2 binary
*.xlsx  binary
```

- [ ] **Step 3: Write `.gitignore`**

```gitignore
# secrets and local configuration: never committed
.env
.env.*
!.env.example

# python
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/

# node
node_modules/
dist/
frontend/playwright-report/
frontend/test-results/

# local data
/backups/
*.dump
*.log

# editors and operating system
.idea/
.vscode/
Thumbs.db
desktop.ini
.DS_Store
```

- [ ] **Step 4: Write `.env.example`**

```dotenv
# IRIS HR: every variable the stack needs, with a safe example value.
# scripts/dev.ps1 init copies this file to .env and generates the four secrets.
# The real .env is never committed and is never written by an update.

# --- Docker Compose ---
# Lets plain "docker compose" load the right files. On the server: compose.yaml:compose.server.yaml
COMPOSE_PATH_SEPARATOR=:
COMPOSE_FILE=compose.yaml:compose.dev.yaml

# --- Stack identity ---
# development | test | production
ENVIRONMENT=development
# Image tag run on the server (vX.Y.Z). "dev" on a developer machine.
APP_VERSION=dev
# Registry path without the -backend / -proxy suffix. Used by compose.server.yaml only.
IMAGE_PREFIX=ghcr.io/your-github-owner/iris-hr
# The name people type in the browser.
SITE_HOSTNAME=localhost
# Ports the proxy publishes on the server. Test and production stacks on one server need different ports.
HTTPS_PORT=443
HTTP_PORT=80

# --- Django ---
# At least 50 random characters. Generated by init.
DJANGO_SECRET_KEY=change-me
# Comma-separated host names the API answers to.
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,app

# --- PostgreSQL ---
POSTGRES_DB=iris_hr
POSTGRES_USER=iris_hr
# At least 12 characters. Generated by init.
POSTGRES_PASSWORD=change-me

# --- Files and backups ---
# Fernet key (44 characters) that encrypts medical attachments. Generated by init.
# Back it up apart from the data: without it the files cannot be read.
FILE_ENCRYPTION_KEY=change-me
# At least 16 characters. Encrypts the nightly dump. Generated by init.
BACKUP_PASSPHRASE=change-me

# --- Behaviour ---
# Only addresses ending in @ALLOWED_EMAIL_DOMAIN can have an account.
ALLOWED_EMAIL_DOMAIN=impactrisks.com
TIME_ZONE=Africa/Tunis
# fr | en
DEFAULT_LANGUAGE=fr
# DEBUG | INFO | WARNING | ERROR | CRITICAL
LOG_LEVEL=INFO
```

- [ ] **Step 5: Write the failing test for the `.env` helpers**

Create `scripts/tests/env.tests.ps1`:

```powershell
# Plain PowerShell test for scripts/lib/env.ps1. Run: powershell -File scripts/tests/env.tests.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\lib\env.ps1')

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('iris-env-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $example = Join-Path $tmp '.env.example'
    $envFile = Join-Path $tmp '.env'
    $lines = @(
        '# a comment',
        'ENVIRONMENT=development',
        'DJANGO_SECRET_KEY=change-me',
        'POSTGRES_PASSWORD=change-me',
        'FILE_ENCRYPTION_KEY=change-me',
        'BACKUP_PASSPHRASE=change-me',
        'TIME_ZONE=Africa/Tunis'
    )
    [System.IO.File]::WriteAllText($example, ($lines -join "`n") + "`n")

    # 1. creates the file and replaces every placeholder
    $created = New-EnvFromExample -ExamplePath $example -EnvPath $envFile
    Assert-True ($created -eq $true) 'the first call creates .env'
    $text = [System.IO.File]::ReadAllText($envFile)
    Assert-True (-not $text.Contains('change-me')) 'no placeholder is left'
    Assert-True ($text.Contains('ENVIRONMENT=development')) 'other values are copied as they are'
    Assert-True ($text.Contains('# a comment')) 'comments are kept'

    # 2. writes LF line endings and no byte-order mark
    Assert-True (-not $text.Contains("`r")) 'line endings are LF'
    $bytes = [System.IO.File]::ReadAllBytes($envFile)
    Assert-True ($bytes[0] -ne 0xEF) 'there is no byte-order mark'

    # 3. generates secrets of the right shape
    $values = @{}
    foreach ($line in $text.Split("`n")) {
        if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
    }
    Assert-True ($values['DJANGO_SECRET_KEY'].Length -ge 50) 'the Django secret has at least 50 characters'
    Assert-True ($values['POSTGRES_PASSWORD'].Length -ge 12) 'the database password has at least 12 characters'
    Assert-True ($values['BACKUP_PASSPHRASE'].Length -ge 16) 'the backup passphrase has at least 16 characters'
    Assert-True ($values['FILE_ENCRYPTION_KEY'].Length -eq 44) 'the Fernet key has 44 characters'
    Assert-True ($values['FILE_ENCRYPTION_KEY'] -match '^[A-Za-z0-9_-]{43}=$') 'the Fernet key is URL-safe base64'
    Assert-True ([Convert]::FromBase64String($values['FILE_ENCRYPTION_KEY'].Replace('-', '+').Replace('_', '/')).Length -eq 32) 'the Fernet key decodes to 32 bytes'

    # 4. never overwrites an existing .env
    $again = New-EnvFromExample -ExamplePath $example -EnvPath $envFile
    Assert-True ($again -eq $false) 'the second call reports that nothing was created'
    Assert-True ([System.IO.File]::ReadAllText($envFile) -eq $text) 'the existing .env is unchanged'

    # 5. reports variables the example gained since
    [System.IO.File]::AppendAllText($example, "NEW_ONE=1`nNEW_TWO=2`n")
    $missing = Get-MissingEnvKeys -EnvPath $envFile -ExamplePath $example
    Assert-True ($missing.Count -eq 2) 'two variables are missing'
    Assert-True (($missing -join ',') -eq 'NEW_ONE,NEW_TWO') 'missing variables are named in order'

    # 6. reports nothing when the .env is complete
    [System.IO.File]::AppendAllText($envFile, "NEW_ONE=1`nNEW_TWO=2`n")
    $none = Get-MissingEnvKeys -EnvPath $envFile -ExamplePath $example
    Assert-True ($none.Count -eq 0) 'nothing is missing'
}
finally {
    Remove-Item -Recurse -Force $tmp
}
Write-Output 'env.tests.ps1: all passed'
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `powershell -File scripts/tests/env.tests.ps1`

Expected: FAIL. PowerShell prints an error that `scripts\lib\env.ps1` is not recognised as the name of a cmdlet, function, script file (the file does not exist yet), and `all passed` is not printed.

- [ ] **Step 7: Write `scripts/lib/env.ps1`**

```powershell
# Helpers for .env files. Dot-source this file; it defines functions and runs nothing.

function Resolve-FullPath {
    param([Parameter(Mandatory)][string]$Path)
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function New-RandomBytes {
    param([Parameter(Mandatory)][int]$Count)
    $bytes = New-Object byte[] $Count
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return , $bytes
}

function New-HexSecret {
    param([int]$Bytes = 24)
    $raw = New-RandomBytes -Count $Bytes
    return (($raw | ForEach-Object { $_.ToString('x2') }) -join '')
}

function New-FernetKey {
    # 32 random bytes as URL-safe base64 with padding: the format cryptography.fernet expects.
    $raw = New-RandomBytes -Count 32
    return [Convert]::ToBase64String($raw).Replace('+', '-').Replace('/', '_')
}

function Read-EnvKeys {
    param([Parameter(Mandatory)][string]$Path)
    $keys = @()
    foreach ($line in [System.IO.File]::ReadAllLines((Resolve-FullPath $Path))) {
        if ($line -match '^([A-Z][A-Z0-9_]*)=') { $keys += $Matches[1] }
    }
    return , $keys
}

function Get-MissingEnvKeys {
    param(
        [Parameter(Mandatory)][string]$EnvPath,
        [Parameter(Mandatory)][string]$ExamplePath
    )
    $present = Read-EnvKeys -Path $EnvPath
    $missing = @()
    foreach ($key in (Read-EnvKeys -Path $ExamplePath)) {
        if ($present -notcontains $key) { $missing += $key }
    }
    return , $missing
}

function New-EnvFromExample {
    # Creates .env from .env.example with freshly generated secrets.
    # Returns $false and changes nothing when the .env already exists.
    param(
        [Parameter(Mandatory)][string]$ExamplePath,
        [Parameter(Mandatory)][string]$EnvPath
    )
    $target = Resolve-FullPath $EnvPath
    if (Test-Path -LiteralPath $target) { return $false }

    $generated = @{
        'DJANGO_SECRET_KEY'   = (New-HexSecret -Bytes 32)
        'POSTGRES_PASSWORD'   = (New-HexSecret -Bytes 24)
        'FILE_ENCRYPTION_KEY' = (New-FernetKey)
        'BACKUP_PASSPHRASE'   = (New-HexSecret -Bytes 24)
    }
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($line in [System.IO.File]::ReadAllLines((Resolve-FullPath $ExamplePath))) {
        if (($line -match '^([A-Z][A-Z0-9_]*)=') -and $generated.ContainsKey($Matches[1])) {
            $out.Add($Matches[1] + '=' + $generated[$Matches[1]])
        }
        else {
            $out.Add($line)
        }
    }
    $text = ($out -join "`n") + "`n"
    [System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))
    return $true
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `powershell -File scripts/tests/env.tests.ps1`

Expected: one line, `env.tests.ps1: all passed`.

- [ ] **Step 9: Write `scripts/dev.ps1`**

```powershell
<#
.SYNOPSIS
    Developer commands for the IRIS HR stack on Windows with Docker Desktop.
.DESCRIPTION
    init     First run: creates .env (never overwrites one), builds the images, applies migrations.
    update   After "git pull": checks .env against .env.example, rebuilds, migrates, restarts.
    reset    Deletes the local database and files, then migrates and seeds. Needs -Yes.
    seed     Loads the demo accounts and data.
    openapi  Regenerates backend/openapi.yaml and, when the frontend exists, its TypeScript types.
.EXAMPLE
    powershell -File scripts/dev.ps1 init
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'update', 'reset', 'seed', 'openapi', 'help')]
    [string]$Command = 'help',
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib\env.ps1')

$envPath = Join-Path $root '.env'
$examplePath = Join-Path $root '.env.example'

function Invoke-Checked {
    param([Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Test-Frontend {
    return (Test-Path (Join-Path $root 'frontend\package.json'))
}

function Assert-EnvComplete {
    if (-not (Test-Path $envPath)) {
        throw '.env is missing. Run: powershell -File scripts/dev.ps1 init'
    }
    $missing = Get-MissingEnvKeys -EnvPath $envPath -ExamplePath $examplePath
    if ($missing.Count -gt 0) {
        Write-Host 'Your .env lacks variables that .env.example now defines.' -ForegroundColor Yellow
        Write-Host 'Add them to .env (see .env.example for their meaning), then run the command again:'
        foreach ($name in $missing) { Write-Host "  $name" }
        exit 1
    }
}

function Invoke-Migrate {
    Invoke-Checked 'docker' @('compose', 'run', '--rm', 'app', 'python', 'manage.py', 'migrate')
}

function Invoke-FrontendInstall {
    if (Test-Frontend) {
        Invoke-Checked 'docker' @('compose', 'run', '--rm', 'web', 'npm', 'ci')
    }
}

switch ($Command) {
    'init' {
        if (New-EnvFromExample -ExamplePath $examplePath -EnvPath $envPath) {
            Write-Host 'Created .env with generated secrets.'
        }
        else {
            Write-Host '.env already exists: left untouched.'
        }
        Assert-EnvComplete
        Invoke-Checked 'docker' @('compose', 'build')
        Invoke-Migrate
        Invoke-FrontendInstall
        Write-Host 'Ready. Start the stack with: docker compose up -d'
    }
    'update' {
        Invoke-Checked 'git' @('pull', '--ff-only')
        Assert-EnvComplete
        Invoke-Checked 'docker' @('compose', 'build')
        Invoke-Migrate
        Invoke-FrontendInstall
        Invoke-Checked 'docker' @('compose', 'up', '-d')
        Write-Host 'Updated and running.'
    }
    'reset' {
        if (-not $Yes) {
            Write-Host 'reset deletes the local database and uploaded files. Run it again with -Yes to confirm.'
            exit 1
        }
        Assert-EnvComplete
        Invoke-Checked 'docker' @('compose', 'down', '--volumes')
        Invoke-Migrate
        Invoke-Checked 'docker' @('compose', 'run', '--rm', 'app', 'python', 'manage.py', 'seed_demo')
        Write-Host 'Database recreated and seeded. Start the stack with: docker compose up -d'
    }
    'seed' {
        Assert-EnvComplete
        Invoke-Checked 'docker' @('compose', 'run', '--rm', 'app', 'python', 'manage.py', 'seed_demo')
    }
    'openapi' {
        Assert-EnvComplete
        Invoke-Checked 'docker' @('compose', 'run', '--rm', 'app', 'python', 'manage.py', 'spectacular', '--file', 'openapi.yaml', '--validate', '--fail-on-warn')
        if (Test-Frontend) {
            Invoke-Checked 'docker' @('compose', 'run', '--rm', 'web', 'npm', 'run', 'api:types')
        }
        Write-Host 'backend/openapi.yaml is up to date.'
    }
    default {
        Get-Help $PSCommandPath
    }
}
```

`dev.ps1` cannot run yet: the compose files arrive in Task 2. It is exercised there.

- [ ] **Step 10: Commit**

```bash
git add .gitattributes .gitignore .env.example scripts docs
git commit -m "chore: create repository with documents, env template and developer script"
```

Expected: a commit listing the three root files, `scripts/` and `docs/`. `git status --short` prints nothing.

---

### Task 2: Backend image, development stack and environment validation

**Files:**
- Create: `backend/pyproject.toml`, `backend/uv.lock` (generated), `backend/Dockerfile`, `backend/.dockerignore`
- Create: `compose.yaml`, `compose.dev.yaml`
- Create: `backend/manage.py`, `backend/config/__init__.py`, `backend/config/env.py`, `backend/config/settings.py`, `backend/config/urls.py`, `backend/config/api_urls.py`, `backend/config/wsgi.py`
- Create: `backend/apps/__init__.py`, `backend/tests/__init__.py`
- Test: `backend/tests/test_env.py`

**Interfaces:**
- Consumes: `.env.example`, `scripts/lib/env.ps1`, `scripts/dev.ps1` (Task 1).
- Produces:
  - `config.env.load(source: Mapping[str, str] | None = None) -> Env` and `config.env.EnvError(variable: str, problem: str)`. `Env` is a frozen dataclass with `environment`, `app_version`, `site_hostname`, `secret_key`, `allowed_hosts: tuple[str, ...]`, `postgres_db`, `postgres_user`, `postgres_password`, `file_encryption_key`, `backup_passphrase`, `allowed_email_domain`, `time_zone`, `default_language`, `log_level`.
  - Django settings names other tasks and plans read: `ENVIRONMENT`, `APP_VERSION`, `SITE_HOSTNAME`, `ALLOWED_EMAIL_DOMAIN`, `DEFAULT_LANGUAGE`, `FILE_ENCRYPTION_KEY`, `BACKUP_PASSPHRASE`, `FILES_ROOT` (`/data/files`), `BACKUP_ROOT` (`/data/backups`).
  - Compose services `db`, `app`, `worker`; volumes `db_data`, `files_data`, `backup_data`. `compose.yaml` gives `app` and `worker` neither `image` nor `build`: `compose.dev.yaml` adds `build`, and `compose.server.yaml` (plan 01b) adds `image`.
  - Image stages `dev` (with test tools) and `prod` (the default stage, Gunicorn).

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "iris-hr-backend"
version = "0.1.0"
description = "IRIS HR platform: API and worker"
requires-python = ">=3.13,<3.14"
dependencies = [
    "django>=5.2,<5.3",
    "djangorestframework>=3.16,<3.17",
    "drf-spectacular>=0.28,<0.30",
    "psycopg[binary,pool]>=3.2,<3.4",
    "procrastinate[django]>=3.0,<4",
    "argon2-cffi>=23.1",
    "cryptography>=44",
    "openpyxl>=3.1,<3.2",
    "croniter>=3.0",
    "gunicorn>=23.0",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-django>=4.9",
    "time-machine>=2.16",
    "ruff>=0.8",
]

[tool.uv]
package = false

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings"
pythonpath = ["."]
testpaths = ["apps", "tests"]
python_files = ["test_*.py"]
addopts = "--import-mode=importlib -ra --strict-markers"
cache_dir = "/tmp/pytest_cache"
markers = [
    "real_hasher: use the production password hasher instead of the fast test hasher",
]

[tool.ruff]
target-version = "py313"
line-length = 110
cache-dir = "/tmp/ruff_cache"
extend-exclude = ["*/migrations/*"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "T20"]
ignore = ["E501"]  # line length is the formatter's job; long message texts are left as they are

[tool.ruff.lint.isort]
known-first-party = ["apps", "config", "tests"]
```

- [ ] **Step 2: Generate the lock file**

Run: `uv lock --project backend`

Expected: `Resolved NN packages in ...` and a new `backend/uv.lock`. If uv reports that no Python 3.13 interpreter is available, run `uv python install 3.13` and repeat.

- [ ] **Step 3: Write `backend/Dockerfile` and `backend/.dockerignore`**

`backend/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

# PostgreSQL 17 client (pg_dump for the update command and the nightly backup) and gnupg (backup encryption).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv

RUN useradd --create-home --uid 10001 app \
 && install -d -o app -g app /app /opt/venv /data/files /data/backups

WORKDIR /app
USER app

# Production dependencies only.
FROM base AS deps
COPY --chown=app:app pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Development and test image: adds pytest, ruff and time-machine. The source is bind-mounted over /app.
FROM deps AS dev
RUN uv sync --frozen
COPY --chown=app:app . .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Production image. Keep this stage last: it is the default build target.
FROM deps AS prod
COPY --chown=app:app . .
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
```

`backend/.dockerignore`:

```gitignore
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 4: Write `compose.yaml` and `compose.dev.yaml`**

`compose.yaml`:

```yaml
# Shared by every stack. Development adds compose.dev.yaml (build, ports, live reload).
# The server adds compose.server.yaml (registry images, proxy, restart policies).

x-app-environment: &app-environment
  ENVIRONMENT: ${ENVIRONMENT:?set ENVIRONMENT in .env}
  APP_VERSION: ${APP_VERSION:?set APP_VERSION in .env}
  SITE_HOSTNAME: ${SITE_HOSTNAME:?set SITE_HOSTNAME in .env}
  DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY:?set DJANGO_SECRET_KEY in .env}
  DJANGO_ALLOWED_HOSTS: ${DJANGO_ALLOWED_HOSTS:?set DJANGO_ALLOWED_HOSTS in .env}
  POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
  POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
  FILE_ENCRYPTION_KEY: ${FILE_ENCRYPTION_KEY:?set FILE_ENCRYPTION_KEY in .env}
  BACKUP_PASSPHRASE: ${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in .env}
  ALLOWED_EMAIL_DOMAIN: ${ALLOWED_EMAIL_DOMAIN:?set ALLOWED_EMAIL_DOMAIN in .env}
  TIME_ZONE: ${TIME_ZONE:?set TIME_ZONE in .env}
  DEFAULT_LANGUAGE: ${DEFAULT_LANGUAGE:?set DEFAULT_LANGUAGE in .env}
  LOG_LEVEL: ${LOG_LEVEL:?set LOG_LEVEL in .env}

x-backend: &backend
  environment: *app-environment
  depends_on:
    db:
      condition: service_healthy
  volumes:
    - files_data:/data/files
    - backup_data:/data/backups

services:
  db:
    image: postgres:17.6-bookworm
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      TZ: ${TIME_ZONE:?set TIME_ZONE in .env}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 3s
      retries: 20

  app:
    <<: *backend
    command: ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]

  worker:
    <<: *backend
    command: ["python", "manage.py", "procrastinate", "worker"]

volumes:
  db_data:
  files_data:
  backup_data:
```

`compose.dev.yaml`:

```yaml
# Development overrides: images built locally with the test tools, source mounted, ports open.

services:
  db:
    ports:
      - "127.0.0.1:5432:5432"

  app:
    build:
      context: ./backend
      target: dev
    command: ["python", "manage.py", "runserver", "0.0.0.0:8000"]
    volumes:
      - ./backend:/app
    ports:
      - "127.0.0.1:8000:8000"

  worker:
    build:
      context: ./backend
      target: dev
    volumes:
      - ./backend:/app
    restart: unless-stopped
```

- [ ] **Step 5: Create the local `.env` and build the image**

Run:

```powershell
powershell -Command ". ./scripts/lib/env.ps1; New-EnvFromExample -ExamplePath .env.example -EnvPath .env"
docker compose build app
```

Expected: the first command prints `True`. The build ends with `Service app  Built` (several minutes the first time). `git status --short` does not list `.env`.

- [ ] **Step 6: Write the failing test for environment validation**

Create the empty files `backend/apps/__init__.py` and `backend/tests/__init__.py`, then `backend/tests/test_env.py`:

```python
import base64

import pytest

from config.env import EnvError, load

FERNET_KEY = base64.urlsafe_b64encode(b"0" * 32).decode()

VALID = {
    "ENVIRONMENT": "development",
    "APP_VERSION": "v1.2.3",
    "SITE_HOSTNAME": "hr.iris.local",
    "DJANGO_SECRET_KEY": "s" * 64,
    "DJANGO_ALLOWED_HOSTS": "hr.iris.local, localhost",
    "POSTGRES_DB": "iris_hr",
    "POSTGRES_USER": "iris_hr",
    "POSTGRES_PASSWORD": "p" * 24,
    "FILE_ENCRYPTION_KEY": FERNET_KEY,
    "BACKUP_PASSPHRASE": "b" * 24,
    "ALLOWED_EMAIL_DOMAIN": "ImpactRisks.com",
    "TIME_ZONE": "Africa/Tunis",
    "DEFAULT_LANGUAGE": "fr",
    "LOG_LEVEL": "info",
}


def env_with(**changes):
    values = dict(VALID)
    values.update(changes)
    return values


def test_a_valid_environment_loads():
    env = load(VALID)

    assert env.environment == "development"
    assert env.app_version == "v1.2.3"
    assert env.site_hostname == "hr.iris.local"
    assert env.allowed_hosts == ("hr.iris.local", "localhost")
    assert env.allowed_email_domain == "impactrisks.com"
    assert env.time_zone == "Africa/Tunis"
    assert env.default_language == "fr"
    assert env.log_level == "INFO"
    assert env.file_encryption_key == FERNET_KEY


@pytest.mark.parametrize("name", sorted(VALID))
def test_a_missing_variable_is_named(name):
    values = dict(VALID)
    del values[name]

    with pytest.raises(EnvError) as error:
        load(values)

    assert error.value.variable == name
    assert name in str(error.value)


@pytest.mark.parametrize("name", sorted(VALID))
def test_a_blank_variable_is_named(name):
    with pytest.raises(EnvError) as error:
        load(env_with(**{name: "   "}))

    assert error.value.variable == name


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("ENVIRONMENT", "staging"),
        ("DEFAULT_LANGUAGE", "de"),
        ("LOG_LEVEL", "LOUD"),
        ("TIME_ZONE", "Africa/Atlantis"),
        ("FILE_ENCRYPTION_KEY", "not-a-fernet-key"),
        ("FILE_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"0" * 16).decode()),
        ("ALLOWED_EMAIL_DOMAIN", "@impactrisks.com"),
        ("ALLOWED_EMAIL_DOMAIN", "impactrisks"),
        ("DJANGO_SECRET_KEY", "too-short"),
        ("DJANGO_SECRET_KEY", "change-me" + "x" * 60),
        ("POSTGRES_PASSWORD", "change-me"),
        ("POSTGRES_PASSWORD", "short"),
        ("BACKUP_PASSPHRASE", "change-me-please-now"),
        ("BACKUP_PASSPHRASE", "tooshort"),
        ("DJANGO_ALLOWED_HOSTS", " , "),
        ("DJANGO_ALLOWED_HOSTS", "good.host, bad host"),
        ("SITE_HOSTNAME", "https://hr.iris.local"),
    ],
)
def test_a_malformed_variable_is_named(name, value):
    with pytest.raises(EnvError) as error:
        load(env_with(**{name: value}))

    assert error.value.variable == name


def test_the_process_environment_is_the_default_source(monkeypatch):
    for name, value in VALID.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("APP_VERSION", "from-os-environ")

    assert load().app_version == "from-os-environ"
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `docker compose run --rm app pytest tests/test_env.py -p no:django -q`

(`-p no:django` is needed only in this step: the Django settings module does not exist yet.)

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'config'`.

- [ ] **Step 8: Write `backend/config/__init__.py` (empty) and `backend/config/env.py`**

```python
"""Reads and validates every environment variable once. Nothing else reads os.environ."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.fernet import Fernet

ENVIRONMENTS = ("development", "test", "production")
LANGUAGES = ("fr", "en")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
PLACEHOLDER = "change-me"

_DOMAIN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_HOST = re.compile(r"^[A-Za-z0-9.\-_*\[\]:]+$")


class EnvError(Exception):
    """A missing or malformed environment variable. `variable` names it."""

    def __init__(self, variable: str, problem: str) -> None:
        super().__init__(f"{variable} {problem}")
        self.variable = variable
        self.problem = problem


@dataclass(frozen=True)
class Env:
    environment: str
    app_version: str
    site_hostname: str
    secret_key: str
    allowed_hosts: tuple[str, ...]
    postgres_db: str
    postgres_user: str
    postgres_password: str
    file_encryption_key: str
    backup_passphrase: str
    allowed_email_domain: str
    time_zone: str
    default_language: str
    log_level: str


def _required(source: Mapping[str, str], name: str) -> str:
    value = (source.get(name) or "").strip()
    if not value:
        raise EnvError(name, "is missing or empty")
    return value


def _choice(source: Mapping[str, str], name: str, choices: tuple[str, ...], *, upper: bool = False) -> str:
    value = _required(source, name)
    value = value.upper() if upper else value.lower()
    if value not in choices:
        raise EnvError(name, f"must be one of: {', '.join(choices)}")
    return value


def _secret(source: Mapping[str, str], name: str, *, min_length: int) -> str:
    value = _required(source, name)
    if value.startswith(PLACEHOLDER):
        raise EnvError(name, "still holds the placeholder from .env.example")
    if len(value) < min_length:
        raise EnvError(name, f"must have at least {min_length} characters")
    return value


def _hostname(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    if not _HOST.match(value) or "//" in value:
        raise EnvError(name, "must be a host name without scheme or path")
    return value


def _hosts(source: Mapping[str, str], name: str) -> tuple[str, ...]:
    hosts = tuple(part.strip() for part in _required(source, name).split(",") if part.strip())
    if not hosts:
        raise EnvError(name, "must list at least one host name")
    for host in hosts:
        if not _HOST.match(host):
            raise EnvError(name, f"contains an invalid host name: {host!r}")
    return hosts


def _fernet_key(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    try:
        Fernet(value.encode())
    except (ValueError, TypeError) as exc:
        raise EnvError(name, "must be a Fernet key: 32 random bytes in URL-safe base64 (44 characters)") from exc
    return value


def _domain(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name).lower()
    if not _DOMAIN.match(value):
        raise EnvError(name, "must be a bare domain such as impactrisks.com")
    return value


def _time_zone(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise EnvError(name, "must be an IANA time zone such as Africa/Tunis") from exc
    return value


def load(source: Mapping[str, str] | None = None) -> Env:
    """Returns the validated environment, or raises EnvError naming the first bad variable."""
    src = os.environ if source is None else source
    return Env(
        environment=_choice(src, "ENVIRONMENT", ENVIRONMENTS),
        app_version=_required(src, "APP_VERSION"),
        site_hostname=_hostname(src, "SITE_HOSTNAME"),
        secret_key=_secret(src, "DJANGO_SECRET_KEY", min_length=50),
        allowed_hosts=_hosts(src, "DJANGO_ALLOWED_HOSTS"),
        postgres_db=_required(src, "POSTGRES_DB"),
        postgres_user=_required(src, "POSTGRES_USER"),
        postgres_password=_secret(src, "POSTGRES_PASSWORD", min_length=12),
        file_encryption_key=_fernet_key(src, "FILE_ENCRYPTION_KEY"),
        backup_passphrase=_secret(src, "BACKUP_PASSPHRASE", min_length=16),
        allowed_email_domain=_domain(src, "ALLOWED_EMAIL_DOMAIN"),
        time_zone=_time_zone(src, "TIME_ZONE"),
        default_language=_choice(src, "DEFAULT_LANGUAGE", LANGUAGES),
        log_level=_choice(src, "LOG_LEVEL", LOG_LEVELS, upper=True),
    )
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `docker compose run --rm app pytest tests/test_env.py -p no:django -q`

Expected: PASS, `47 passed` (1 + 14 + 14 + 17 + 1). A `PytestConfigWarning: Unknown config option: DJANGO_SETTINGS_MODULE` is normal with `-p no:django`.

- [ ] **Step 10: Write the Django project skeleton**

`backend/manage.py`:

```python
#!/usr/bin/env python
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

`backend/config/settings.py`:

```python
"""Django settings. Every infrastructure value comes from config.env; business settings live in the database."""

import sys
from pathlib import Path

from config.env import EnvError, load

try:
    ENV = load()
except EnvError as exc:  # the process must not start with a broken configuration (PRD 9.7)
    sys.exit(f"Configuration error: {exc}")

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Values other modules read ---
ENVIRONMENT = ENV.environment
APP_VERSION = ENV.app_version
SITE_HOSTNAME = ENV.site_hostname
ALLOWED_EMAIL_DOMAIN = ENV.allowed_email_domain
DEFAULT_LANGUAGE = ENV.default_language
FILE_ENCRYPTION_KEY = ENV.file_encryption_key
BACKUP_PASSPHRASE = ENV.backup_passphrase
FILES_ROOT = Path("/data/files")
BACKUP_ROOT = Path("/data/backups")

# --- Core ---
SECRET_KEY = ENV.secret_key
DEBUG = False  # identical behaviour on every stack; errors are returned as problem details
ALLOWED_HOSTS = list(ENV.allowed_hosts)
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": ENV.postgres_db,
        "USER": ENV.postgres_user,
        "PASSWORD": ENV.postgres_password,
        "HOST": "db",
        "PORT": "5432",
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }
}

# --- Language and time ---
LANGUAGE_CODE = DEFAULT_LANGUAGE
LANGUAGES = [("fr", "Français"), ("en", "English")]
USE_I18N = True
TIME_ZONE = ENV.time_zone
USE_TZ = True

# --- Transport and browser security (PRD section 10) ---
_SECURE_COOKIES = ENVIRONMENT != "development"  # development is served over plain HTTP on localhost
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_HSTS_SECONDS = 31536000 if _SECURE_COOKIES else 0
X_FRAME_OPTIONS = "DENY"

SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = _SECURE_COOKIES
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # the cookie has no expiry: it ends with the browser (ACC-04)
SESSION_COOKIE_AGE = 60 * 60 * 24  # server-side ceiling; the inactivity limit is a database setting

CSRF_COOKIE_HTTPONLY = False  # the single-page app reads it to send X-CSRFToken
CSRF_COOKIE_SECURE = _SECURE_COOKIES
CSRF_COOKIE_SAMESITE = "Lax"
```

`backend/config/urls.py`:

```python
from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("config.api_urls")),
]
```

`backend/config/api_urls.py`:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import URLPattern, URLResolver

urlpatterns: list[URLPattern | URLResolver] = []
```

`backend/config/wsgi.py`:

```python
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
```

- [ ] **Step 11: Verify the project starts and refuses a broken configuration**

Run:

```powershell
docker compose run --rm app python manage.py check
docker compose run --rm app pytest tests/test_env.py -q
docker compose run --rm -e LOG_LEVEL=LOUD app python manage.py check
```

Expected: the first prints `System check identified no issues (0 silenced).` The second prints `47 passed` (this time with the Django plugin loaded). The third prints `Configuration error: LOG_LEVEL must be one of: DEBUG, INFO, WARNING, ERROR, CRITICAL` and exits with code 1.

- [ ] **Step 12: Verify the stack serves HTTP**

Run:

```powershell
powershell -File scripts/dev.ps1 init
docker compose up -d db app
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8000/api/v1/nothing
docker compose down
```

Expected: `init` prints `.env already exists: left untouched.`, builds, runs `migrate` (it applies the `contenttypes` and `sessions` migrations) and ends with `Ready.` The curl line prints `404`. The `worker` service is not started in this step: its command arrives in Task 18.

- [ ] **Step 13: Commit**

```bash
git add backend compose.yaml compose.dev.yaml
git commit -m "feat: backend image, development stack and validated environment"
```

---

### Task 3: Request context, request identifier and JSON logging

**Files:**
- Create: `backend/apps/core/__init__.py` (empty), `backend/apps/core/apps.py`, `backend/apps/core/context.py`, `backend/apps/core/net.py`, `backend/apps/core/middleware.py`, `backend/apps/core/logging.py`, `backend/config/logging.py`
- Create: `backend/apps/core/tests/__init__.py` (empty)
- Modify: `backend/config/settings.py`
- Test: `backend/apps/core/tests/test_context.py`, `backend/apps/core/tests/test_logging.py`

**Interfaces:**
- Consumes: `config.settings` (Task 2).
- Produces:
  - `apps.core.context`: `current_request_id() -> str` (empty outside a request), `current_actor() -> User | None`, `current_ip() -> str | None`, `overriding(*, actor=..., ip=..., request_id=...)` (a context manager for jobs, commands and services that know better than the request), `bind_request(request, request_id)`, `unbind(tokens)`, `logged_user_id() -> str | None`.
  - `apps.core.net.client_ip(request) -> str`.
  - `apps.core.middleware.RequestContextMiddleware`: sets `request.id`, the context, the `X-Request-ID` response header, and logs one line per request.
  - `apps.core.logging.JsonFormatter`, `apps.core.logging.redact(value)`. Convention for every later task: log with a constant message and put values in `extra={"data": {...}}`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_context.py`:

```python
import pytest
from django.http import HttpResponse

from apps.core import context
from apps.core.middleware import RequestContextMiddleware
from apps.core.net import client_ip


class FakeUser:
    is_authenticated = True
    public_id = "0f0e0d0c-0000-4000-8000-000000000001"


class FakeAnonymous:
    is_authenticated = False


def run(request):
    seen = {}

    def view(inner):
        seen["request_id"] = context.current_request_id()
        seen["ip"] = context.current_ip()
        seen["actor"] = context.current_actor()
        return HttpResponse("ok")

    response = RequestContextMiddleware(view)(request)
    return response, seen


def test_each_request_gets_an_id_that_the_response_carries(rf):
    request = rf.get("/x")

    response, seen = run(request)

    assert len(seen["request_id"]) == 32
    assert response["X-Request-ID"] == seen["request_id"]
    assert request.id == seen["request_id"]


def test_a_client_supplied_request_id_is_ignored(rf):
    response, seen = run(rf.get("/x", HTTP_X_REQUEST_ID="chosen-by-the-client"))

    assert seen["request_id"] != "chosen-by-the-client"
    assert response["X-Request-ID"] == seen["request_id"]


def test_two_requests_get_different_ids(rf):
    _, first = run(rf.get("/x"))
    _, second = run(rf.get("/x"))

    assert first["request_id"] != second["request_id"]


def test_the_network_address_comes_from_the_proxy_header_first(rf):
    request = rf.get("/x", HTTP_X_FORWARDED_FOR="192.168.1.20, 10.0.0.1", REMOTE_ADDR="172.18.0.5")

    _, seen = run(request)

    assert seen["ip"] == "192.168.1.20"
    assert client_ip(request) == "192.168.1.20"


def test_the_network_address_falls_back_to_the_socket(rf):
    _, seen = run(rf.get("/x", REMOTE_ADDR="10.0.0.7"))

    assert seen["ip"] == "10.0.0.7"


def test_the_actor_is_the_signed_in_user(rf):
    request = rf.get("/x")
    request.user = FakeUser()

    _, seen = run(request)

    assert seen["actor"] is request.user


@pytest.mark.parametrize("user", [None, FakeAnonymous()])
def test_there_is_no_actor_without_a_signed_in_user(rf, user):
    request = rf.get("/x")
    if user is not None:
        request.user = user

    _, seen = run(request)

    assert seen["actor"] is None


def test_the_context_is_empty_outside_a_request():
    assert context.current_request_id() == ""
    assert context.current_actor() is None
    assert context.current_ip() is None
    assert context.logged_user_id() is None


def test_the_context_is_cleared_even_when_the_view_raises(rf):
    def broken(request):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        RequestContextMiddleware(broken)(rf.get("/x"))

    assert context.current_request_id() == ""
    assert context.current_ip() is None


def test_overriding_sets_values_and_restores_them():
    user = FakeUser()

    with context.overriding(actor=user, ip="10.1.2.3", request_id="job-42"):
        assert context.current_actor() is user
        assert context.current_ip() == "10.1.2.3"
        assert context.current_request_id() == "job-42"

    assert context.current_actor() is None
    assert context.current_ip() is None
    assert context.current_request_id() == ""


def test_overriding_can_state_that_there_is_no_actor_and_no_address(rf):
    request = rf.get("/x", REMOTE_ADDR="10.0.0.7")
    request.user = FakeUser()
    tokens = context.bind_request(request, "rid")
    try:
        with context.overriding(actor=None, ip=None):
            assert context.current_actor() is None
            assert context.current_ip() is None
        assert context.current_actor() is request.user
        assert context.current_ip() == "10.0.0.7"
    finally:
        context.unbind(tokens)
```

`backend/apps/core/tests/test_logging.py`:

```python
import json
import logging
import sys

from django.http import HttpResponse

from apps.core import context
from apps.core.logging import REDACTED, JsonFormatter, redact
from apps.core.middleware import RequestContextMiddleware
from config.logging import build_logging


class FakeUser:
    is_authenticated = True
    public_id = "0f0e0d0c-0000-4000-8000-000000000001"


def make_record(message="hello", **extra):
    record = logging.LogRecord("iris.test", logging.INFO, __file__, 1, message, None, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_a_line_is_json_with_the_standard_fields():
    with context.overriding(request_id="abc123"):
        payload = json.loads(JsonFormatter().format(make_record()))

    assert payload["message"] == "hello"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "iris.test"
    assert payload["request_id"] == "abc123"
    assert payload["user_id"] is None
    assert payload["time"].endswith("+00:00")


def test_the_user_id_appears_once_the_request_has_loaded_the_user(rf):
    request = rf.get("/x")
    request._cached_user = FakeUser()
    tokens = context.bind_request(request, "rid")
    try:
        payload = json.loads(JsonFormatter().format(make_record()))
    finally:
        context.unbind(tokens)

    assert payload["user_id"] == FakeUser.public_id
    assert payload["request_id"] == "rid"


def test_redact_replaces_sensitive_keys_at_any_depth():
    data = {
        "email": "a@impactrisks.com",
        "password": "hunter2hunter2",
        "nested": {"comment": "I have the flu", "days": 2},
        "items": [{"new_password": "x"}, {"content": b"%PDF"}],
    }

    assert redact(data) == {
        "email": "a@impactrisks.com",
        "password": REDACTED,
        "nested": {"comment": REDACTED, "days": 2},
        "items": [{"new_password": REDACTED}, {"content": REDACTED}],
    }


def test_sensitive_values_never_reach_the_line():
    record = make_record(data={"password": "hunter2hunter2", "nested": {"comment": "I have the flu"}})

    line = JsonFormatter().format(record)

    assert "hunter2hunter2" not in line
    assert "I have the flu" not in line
    assert json.loads(line)["data"]["password"] == REDACTED


def test_an_exception_is_included():
    record = make_record()
    try:
        raise ValueError("broken thing")
    except ValueError:
        record.exc_info = sys.exc_info()

    payload = json.loads(JsonFormatter().format(record))

    assert "ValueError: broken thing" in payload["exception"]


def test_each_request_is_logged_without_its_query_string(rf, caplog):
    middleware = RequestContextMiddleware(lambda request: HttpResponse(status=204))

    with caplog.at_level(logging.INFO, logger="iris.request"):
        middleware(rf.get("/api/v1/thing?search=secret-term"))

    record = next(r for r in caplog.records if r.name == "iris.request")
    assert record.data["method"] == "GET"
    assert record.data["path"] == "/api/v1/thing"
    assert record.data["status"] == 204
    assert isinstance(record.data["duration_ms"], int)
    assert "secret-term" not in json.dumps(record.data)


def test_the_logging_configuration_writes_json_to_standard_output():
    config = build_logging("WARNING")

    assert config["root"]["level"] == "WARNING"
    assert config["root"]["handlers"] == ["stdout"]
    assert config["handlers"]["stdout"]["stream"] == "ext://sys.stdout"
    assert config["formatters"]["json"]["()"] == "apps.core.logging.JsonFormatter"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.core'`.

- [ ] **Step 3: Write the core app, the context and the address helper**

`backend/apps/core/apps.py`:

```python
from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
```

`backend/apps/core/net.py`:

```python
"""Network facts about a request."""


def client_ip(request) -> str:
    """The caller's address. The reverse proxy sets X-Forwarded-For; without it, the socket address."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""
```

`backend/apps/core/context.py`:

```python
"""Who and what the current unit of work belongs to: a request, a job, or nothing."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any

from apps.core.net import client_ip

_UNSET: Any = object()

_request: ContextVar[Any] = ContextVar("iris_request", default=None)
_request_id: ContextVar[str] = ContextVar("iris_request_id", default="")
_actor: ContextVar[Any] = ContextVar("iris_actor", default=_UNSET)
_ip: ContextVar[Any] = ContextVar("iris_ip", default=_UNSET)

Tokens = list[tuple[ContextVar, Token]]


def bind_request(request: Any, request_id: str) -> Tokens:
    """Called by RequestContextMiddleware at the start of a request."""
    return [(_request, _request.set(request)), (_request_id, _request_id.set(request_id))]


def unbind(tokens: Tokens) -> None:
    for variable, token in reversed(tokens):
        variable.reset(token)


@contextmanager
def overriding(*, actor: Any = _UNSET, ip: Any = _UNSET, request_id: Any = _UNSET) -> Iterator[None]:
    """For code that knows the actor, address or reference better than the request does (jobs, commands, sign-in)."""
    tokens: Tokens = []
    if actor is not _UNSET:
        tokens.append((_actor, _actor.set(actor)))
    if ip is not _UNSET:
        tokens.append((_ip, _ip.set(ip)))
    if request_id is not _UNSET:
        tokens.append((_request_id, _request_id.set(request_id)))
    try:
        yield
    finally:
        unbind(tokens)


def current_request_id() -> str:
    return _request_id.get()


def current_actor() -> Any | None:
    """The signed-in user of the current request, or None for the system and for anonymous callers."""
    override = _actor.get()
    if override is not _UNSET:
        return override
    user = getattr(_request.get(), "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "_wrapped", user)  # unwrap Django's lazy user object


def current_ip() -> str | None:
    override = _ip.get()
    if override is not _UNSET:
        return override or None
    request = _request.get()
    if request is None:
        return None
    return client_ip(request) or None


def logged_user_id() -> str | None:
    """The signed-in user's public id, only if the request has already loaded the user. Never queries."""
    user = getattr(_request.get(), "_cached_user", None)
    public_id = getattr(user, "public_id", None)
    return str(public_id) if public_id else None
```

- [ ] **Step 4: Write the middleware and the logging modules**

`backend/apps/core/middleware.py`:

```python
import logging
import time
import uuid

from apps.core import context

request_logger = logging.getLogger("iris.request")


class RequestContextMiddleware:
    """Gives every request an identifier, exposes it to the rest of the code, and logs one line per request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = uuid.uuid4().hex
        request.id = request_id
        started = time.perf_counter()
        tokens = context.bind_request(request, request_id)
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            request_logger.info(
                "request",
                extra={
                    "data": {
                        "method": request.method,
                        "path": request.path,  # never the query string: it can carry search terms
                        "status": response.status_code,
                        "duration_ms": round((time.perf_counter() - started) * 1000),
                    }
                },
            )
            return response
        finally:
            context.unbind(tokens)
```

`backend/apps/core/logging.py`:

```python
"""Structured JSON log lines. Values go in `extra={"data": {...}}`; sensitive keys are redacted."""

import json
import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from apps.core import context

REDACTED = "[redacted]"
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "current_password",
        "new_password",
        "temporary_password",
        "comment",
        "content",
        "secret",
        "token",
        "csrf_token",
        "authorization",
        "cookie",
    }
)


def redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: REDACTED if str(key).lower() in SENSITIVE_KEYS else redact(item) for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, tz=UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": context.current_request_id() or None,
            "user_id": context.logged_user_id(),
        }
        data = getattr(record, "data", None)
        if isinstance(data, Mapping):
            payload["data"] = redact(data)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)
```

`backend/config/logging.py`:

```python
"""Logging configuration: one JSON line per event on standard output, collected by Docker."""

from typing import Any


def build_logging(level: str) -> dict[str, Any]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": "apps.core.logging.JsonFormatter"}},
        "handlers": {
            "stdout": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "json"},
        },
        "root": {"handlers": ["stdout"], "level": level},
        "loggers": {
            "django.server": {"level": "WARNING"},  # the request line is logged by RequestContextMiddleware
            "django.request": {"level": "ERROR"},
        },
    }
```

- [ ] **Step 5: Register the app, the middleware and the logging configuration**

In `backend/config/settings.py`:

Replace the import block at the top with:

```python
import logging.config
import sys
from pathlib import Path

from config.env import EnvError, load
from config.logging import build_logging
```

Replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "apps.core",
]
```

Replace `MIDDLEWARE` with:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

Append at the end of the file:

```python
# --- Logging: structured JSON on standard output (PRD 9.7) ---
LOGGING_CONFIG = None
logging.config.dictConfig(build_logging(ENV.log_level))
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests -q`

Expected: PASS, `19 passed`.

- [ ] **Step 7: Verify a real request is logged as JSON**

Run:

```powershell
docker compose up -d db app
curl.exe -s -o NUL -D - http://localhost:8000/api/v1/nothing
docker compose logs app --tail 3
docker compose down
```

Expected: the response headers include `X-Request-ID:` followed by 32 hexadecimal characters. The last log line is JSON such as `{"time": "...", "level": "INFO", "logger": "iris.request", "message": "request", "request_id": "<the same 32 characters>", "user_id": null, "data": {"method": "GET", "path": "/api/v1/nothing", "status": 404, "duration_ms": 3}}`.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core backend/config
git commit -m "feat(core): request context, request identifier and JSON logging"
```

---

### Task 4: Domain errors, message catalogue and language selection

**Files:**
- Create: `backend/apps/core/errors.py`, `backend/apps/core/i18n.py`, `backend/apps/core/messages.py`
- Modify: `backend/apps/core/apps.py`, `backend/apps/core/middleware.py`, `backend/config/settings.py`
- Test: `backend/apps/core/tests/test_errors.py`, `backend/apps/core/tests/test_i18n.py`, `backend/tests/test_messages.py`

**Interfaces:**
- Consumes: `apps.core.context` (Task 3).
- Produces (master 6.2 and 6.3):
  - `apps.core.errors`: `Problem(code: str, field: str | None = None, params: Mapping[str, Any] = {})`; `DomainError(code: str | None = None, *, field: str | None = None, problems: Sequence[Problem] | None = None, **params)` with `.status` (400), `.code`, `.params`, `.problems`, `.field`; `NotAllowed` (403, `core.not_allowed`), `NotFound` (404, `core.not_found`), `Conflict` (409, `core.conflict`), `RateLimited` (429, `core.rate_limited`).
  - `apps.core.i18n`: `register_messages(messages)`, `translate(code, lang=None, /, **params) -> str`, `all_messages()`, `active_language() -> str`, `LANGUAGES = ("fr", "en")`. Parameters that are dates, datetimes or decimals are formatted for the reader (`06/10/2026`, `06/10/2026 10:30` in Africa/Tunis time, `2,5` in French).
  - `apps.core.middleware.LanguageMiddleware`.
  - The convention every app follows: `messages.py` holds `MESSAGES`, registered in `AppConfig.ready()`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_errors.py`:

```python
import dataclasses

import pytest

from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound, Problem, RateLimited


def test_a_domain_error_carries_one_problem_by_default():
    error = DomainError("request.overlap", field="start_date", other="12/03")

    assert error.status == 400
    assert error.code == "request.overlap"
    assert error.params == {"other": "12/03"}
    assert error.field == "start_date"
    assert error.problems == [Problem("request.overlap", "start_date", {"other": "12/03"})]
    assert str(error) == "request.overlap"


def test_several_problems_can_be_reported_at_once():
    problems = [Problem("request.end_before_start", "end_date"), Problem("request.no_working_day")]

    error = DomainError("core.validation", problems=problems)

    assert error.code == "core.validation"
    assert error.problems == problems
    assert error.field == "end_date"


@pytest.mark.parametrize(
    ("cls", "status", "code"),
    [
        (DomainError, 400, "core.invalid"),
        (NotAllowed, 403, "core.not_allowed"),
        (NotFound, 404, "core.not_found"),
        (Conflict, 409, "core.conflict"),
        (RateLimited, 429, "core.rate_limited"),
    ],
)
def test_each_class_has_a_status_and_a_default_code(cls, status, code):
    error = cls()

    assert error.status == status
    assert error.code == code
    assert error.problems == [Problem(code)]


def test_a_subclass_accepts_a_specific_code():
    error = Conflict("request.already_processed")

    assert error.status == 409
    assert error.code == "request.already_processed"


def test_a_problem_has_no_field_and_no_params_by_default():
    problem = Problem("core.invalid")

    assert problem.field is None
    assert problem.params == {}


def test_a_problem_cannot_be_changed():
    problem = Problem("core.invalid")

    with pytest.raises(dataclasses.FrozenInstanceError):
        problem.code = "other"
```

`backend/apps/core/tests/test_i18n.py`:

```python
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from django.http import HttpResponse
from django.utils import translation

from apps.core import i18n
from apps.core.i18n import register_messages, translate
from apps.core.middleware import LanguageMiddleware

register_messages(
    {
        "test.greeting": {"en": "Hello {name}", "fr": "Bonjour {name}"},
        "test.values": {"en": "{amount} days until {day}, at {moment}", "fr": "{amount} jours avant le {day}, à {moment}"},
    }
)


class FakeUser:
    is_authenticated = True

    def __init__(self, language):
        self.language = language


def test_translate_uses_the_active_language():
    with translation.override("fr"):
        assert translate("test.greeting", name="Sami") == "Bonjour Sami"
    with translation.override("en"):
        assert translate("test.greeting", name="Sami") == "Hello Sami"


def test_an_explicit_language_wins():
    with translation.override("fr"):
        assert translate("test.greeting", "en", name="Sami") == "Hello Sami"


def test_a_regional_variant_maps_to_its_language():
    with translation.override("en-gb"):
        assert i18n.active_language() == "en"


def test_an_unsupported_language_falls_back_to_the_default(settings):
    settings.DEFAULT_LANGUAGE = "en"

    with translation.override("de"):
        assert translate("test.greeting", name="Sami") == "Hello Sami"


def test_an_unknown_code_is_returned_as_it_is():
    assert translate("test.does_not_exist") == "test.does_not_exist"


def test_a_missing_parameter_does_not_crash():
    assert translate("test.greeting", "en") == "Hello {name}"


def test_dates_times_and_decimals_are_written_for_the_reader():
    params = {
        "amount": Decimal("2.50"),
        "day": date(2026, 10, 6),
        "moment": datetime(2026, 10, 6, 9, 30, tzinfo=UTC),  # 10:30 in Africa/Tunis
    }

    assert translate("test.values", "fr", **params) == "2,5 jours avant le 06/10/2026, à 06/10/2026 10:30"
    assert translate("test.values", "en", **params) == "2.5 days until 06/10/2026, at 06/10/2026 10:30"


def test_registering_a_code_twice_with_other_texts_is_refused():
    register_messages({"test.greeting": {"en": "Hello {name}", "fr": "Bonjour {name}"}})  # same texts: accepted

    with pytest.raises(ValueError, match="test.greeting"):
        register_messages({"test.greeting": {"en": "Hi", "fr": "Salut"}})


def run_language_middleware(request):
    seen = {}

    def view(inner):
        seen["language"] = translation.get_language()
        return HttpResponse("ok")

    response = LanguageMiddleware(view)(request)
    return response, seen


def test_the_signed_in_users_language_wins(rf):
    request = rf.get("/x", HTTP_ACCEPT_LANGUAGE="fr")
    request.user = FakeUser("en")

    response, seen = run_language_middleware(request)

    assert seen["language"] == "en"
    assert response["Content-Language"] == "en"
    assert request.LANGUAGE_CODE == "en"


@pytest.mark.parametrize(
    ("header", "expected"),
    [("en-GB,en;q=0.9", "en"), ("fr-FR", "fr"), ("de, en;q=0.5", "en"), ("EN", "en")],
)
def test_an_anonymous_request_uses_the_accept_language_header(rf, header, expected):
    _, seen = run_language_middleware(rf.get("/x", HTTP_ACCEPT_LANGUAGE=header))

    assert seen["language"] == expected


@pytest.mark.parametrize("header", ["", "de", "*"])
def test_without_a_usable_header_the_default_language_applies(rf, settings, header):
    settings.DEFAULT_LANGUAGE = "en"

    _, seen = run_language_middleware(rf.get("/x", HTTP_ACCEPT_LANGUAGE=header))

    assert seen["language"] == "en"


def test_the_language_does_not_leak_into_the_next_request(rf, settings):
    settings.DEFAULT_LANGUAGE = "fr"
    request = rf.get("/x")
    request.user = FakeUser("en")
    run_language_middleware(request)

    _, seen = run_language_middleware(rf.get("/x"))

    assert seen["language"] == "fr"
```

`backend/tests/test_messages.py`:

```python
"""The catalogue must be complete in French and English (NFR-06, UI rule U9)."""

import re
import string

from apps.core.i18n import all_messages

CODE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")


def placeholders(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_the_catalogue_is_not_empty():
    assert "core.not_found" in all_messages()


def test_every_message_exists_in_both_languages():
    missing = [
        f"{code}: no {lang} text"
        for code, texts in all_messages().items()
        for lang in ("en", "fr")
        if not (texts.get(lang) or "").strip()
    ]

    assert missing == []


def test_both_languages_use_the_same_placeholders():
    different = [
        f"{code}: en {sorted(placeholders(texts['en']))} / fr {sorted(placeholders(texts['fr']))}"
        for code, texts in all_messages().items()
        if placeholders(texts.get("en", "")) != placeholders(texts.get("fr", ""))
    ]

    assert different == []


def test_codes_follow_the_naming_rule():
    assert [code for code in all_messages() if not CODE.match(code)] == []


def test_no_message_has_extra_languages():
    assert [code for code, texts in all_messages().items() if set(texts) != {"en", "fr"}] == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_errors.py apps/core/tests/test_i18n.py tests/test_messages.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.core.errors'` (and the same for `apps.core.i18n`).

- [ ] **Step 3: Write `backend/apps/core/errors.py`**

```python
"""Errors that services raise. The API turns them into problem details (apps.core.api.problems)."""

import dataclasses
from collections.abc import Mapping, Sequence
from typing import Any


@dataclasses.dataclass(frozen=True)
class Problem:
    """One thing that is wrong: a message code, the input it belongs to, and the values of its message."""

    code: str
    field: str | None = None
    params: Mapping[str, Any] = dataclasses.field(default_factory=dict)


class DomainError(Exception):
    """A rule was broken. `status` is the HTTP status the API answers with."""

    status = 400
    default_code = "core.invalid"

    def __init__(
        self,
        code: str | None = None,
        *,
        field: str | None = None,
        problems: Sequence[Problem] | None = None,
        **params: Any,
    ) -> None:
        self.code = code or self.default_code
        self.params = dict(params)
        self.problems = list(problems) if problems else [Problem(self.code, field, self.params)]
        super().__init__(self.code)

    @property
    def field(self) -> str | None:
        return self.problems[0].field


class NotAllowed(DomainError):
    status = 403
    default_code = "core.not_allowed"


class NotFound(DomainError):
    status = 404
    default_code = "core.not_found"


class Conflict(DomainError):
    status = 409
    default_code = "core.conflict"


class RateLimited(DomainError):
    status = 429
    default_code = "core.rate_limited"
```

- [ ] **Step 4: Write `backend/apps/core/i18n.py` and `backend/apps/core/messages.py`**

`backend/apps/core/i18n.py`:

```python
"""The server's message catalogue: one text per code and language, registered by each app (master D9)."""

import logging
from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone, translation

LANGUAGES = ("fr", "en")

logger = logging.getLogger("iris.i18n")
_MESSAGES: dict[str, dict[str, str]] = {}


def register_messages(messages: Mapping[str, Mapping[str, str]]) -> None:
    """Adds `{"code": {"en": "...", "fr": "..."}}` entries. Called from each app's AppConfig.ready()."""
    for code, texts in messages.items():
        new = dict(texts)
        if code in _MESSAGES and _MESSAGES[code] != new:
            raise ValueError(f"Message code registered twice with different texts: {code}")
        _MESSAGES[code] = new


def all_messages() -> Mapping[str, Mapping[str, str]]:
    return _MESSAGES


def active_language() -> str:
    """The language of the current request ("fr" or "en"), or the default outside a request."""
    lang = (translation.get_language() or "").split("-")[0]
    return lang if lang in LANGUAGES else settings.DEFAULT_LANGUAGE


def humanise(value: Any, lang: str) -> Any:
    """Writes dates, times and decimals the way a reader expects them. Times are shown in the local zone."""
    if isinstance(value, datetime):
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        return local.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, Decimal):
        text = format(value.normalize(), "f")
        return text.replace(".", ",") if lang == "fr" else text
    return value


def translate(code: str, lang: str | None = None, /, **params: Any) -> str:
    """The text of `code` in `lang` (default: the active language), with `params` filled in."""
    language = lang if lang in LANGUAGES else active_language()
    texts = _MESSAGES.get(code)
    if texts is None:
        logger.warning("unknown message code", extra={"data": {"code": code}})
        return code
    template = texts.get(language) or texts.get("en") or code
    try:
        return template.format(**{name: humanise(value, language) for name, value in params.items()})
    except (KeyError, IndexError, ValueError):
        return template
```

`backend/apps/core/messages.py`:

```python
"""Texts of the errors every app can raise. Each says what happened and what to do next (NFR-05)."""

MESSAGES = {
    "core.invalid": {
        "en": "This request is not valid. Check what you entered and try again.",
        "fr": "Cette demande n'est pas valide. Vérifiez votre saisie et réessayez.",
    },
    "core.validation": {
        "en": "Some fields need your attention.",
        "fr": "Certains champs sont à corriger.",
    },
    "core.not_authenticated": {
        "en": "Sign in to continue.",
        "fr": "Connectez-vous pour continuer.",
    },
    "core.not_allowed": {
        "en": "You are not allowed to do this.",
        "fr": "Vous n'êtes pas autorisé à effectuer cette action.",
    },
    "core.not_found": {
        "en": "This page or item is not available.",
        "fr": "Cette page ou cet élément n'est pas disponible.",
    },
    "core.conflict": {
        "en": "Someone else changed this in the meantime. Reload to see the current state.",
        "fr": "Quelqu'un d'autre a modifié cet élément entre-temps. Rechargez pour voir l'état actuel.",
    },
    "core.rate_limited": {
        "en": "Too many attempts. Wait a few minutes and try again.",
        "fr": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
    },
    "core.method_not_allowed": {
        "en": "This action is not available here.",
        "fr": "Cette action n'est pas disponible ici.",
    },
    "core.malformed": {
        "en": "The request could not be read. Reload the page and try again.",
        "fr": "La demande n'a pas pu être lue. Rechargez la page et réessayez.",
    },
    "core.unsupported_media_type": {
        "en": "This kind of content is not accepted here.",
        "fr": "Ce type de contenu n'est pas accepté ici.",
    },
    "core.not_acceptable": {
        "en": "The requested format is not available.",
        "fr": "Le format demandé n'est pas disponible.",
    },
    "core.unexpected": {
        "en": "Something went wrong. Quote the reference {reference} to the administrator.",
        "fr": "Une erreur est survenue. Communiquez la référence {reference} à l'administrateur.",
    },
}
```

- [ ] **Step 5: Register the messages and add the language middleware**

Replace `backend/apps/core/apps.py` with:

```python
from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.core.messages import MESSAGES

        register_messages(MESSAGES)
```

Replace `backend/apps/core/middleware.py` with:

```python
import logging
import time
import uuid

from django.conf import settings
from django.utils import translation

from apps.core import context
from apps.core.i18n import LANGUAGES

request_logger = logging.getLogger("iris.request")


class RequestContextMiddleware:
    """Gives every request an identifier, exposes it to the rest of the code, and logs one line per request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = uuid.uuid4().hex
        request.id = request_id
        started = time.perf_counter()
        tokens = context.bind_request(request, request_id)
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            request_logger.info(
                "request",
                extra={
                    "data": {
                        "method": request.method,
                        "path": request.path,  # never the query string: it can carry search terms
                        "status": response.status_code,
                        "duration_ms": round((time.perf_counter() - started) * 1000),
                    }
                },
            )
            return response
        finally:
            context.unbind(tokens)


class LanguageMiddleware:
    """Activates the signed-in user's language, else the Accept-Language header, else the default (master 6.3)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = self._pick(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        response.headers.setdefault("Content-Language", language)
        return response

    @staticmethod
    def _pick(request) -> str:
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and getattr(user, "language", None) in LANGUAGES:
            return user.language
        for part in request.META.get("HTTP_ACCEPT_LANGUAGE", "").split(","):
            tag = part.split(";")[0].strip().lower().split("-")[0]
            if tag in LANGUAGES:
                return tag
        return settings.DEFAULT_LANGUAGE
```

In `backend/config/settings.py`, replace `MIDDLEWARE` with:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "apps.core.middleware.LanguageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests tests/test_messages.py -q`

Expected: PASS, `51 passed` (19 from Task 3, 10 in `test_errors.py`, 17 in `test_i18n.py`, 5 in `test_messages.py`).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core backend/config/settings.py backend/tests/test_messages.py
git commit -m "feat(core): domain errors, bilingual message catalogue and language selection"
```

---

### Task 5: Base models, pagination and the Excel helper

**Files:**
- Create: `backend/apps/core/models.py`, `backend/apps/core/pagination.py`, `backend/apps/core/xlsx.py`
- Test: `backend/apps/core/tests/test_models.py`, `backend/apps/core/tests/test_pagination.py`, `backend/apps/core/tests/test_xlsx.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (master 7.1):
  - `apps.core.models.TimeStampedModel` (`created_at`, `updated_at`), `apps.core.models.PublicIdModel` (`public_id`: UUID, unique, not editable). Both abstract.
  - `apps.core.pagination.DefaultPagination` (25 per page, `page_size` up to 100, body `{count, next, previous, results}`).
  - `apps.core.pagination.paginate(request, view, queryset, serializer_class, *, context=None) -> Response`, the one way a view returns a list.
  - `apps.core.pagination.paginated(serializer_class) -> type[Serializer]` and `PAGE_PARAMETERS`, for `@extend_schema`.
  - `apps.core.xlsx.Column(key: str, header: str, kind: str = "text")` with kind in `text`, `number`, `date`, `datetime`; `apps.core.xlsx.build_workbook(*, title: str, columns: Sequence[Column], rows: Iterable[Mapping[str, Any]]) -> bytes`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_models.py`:

```python
from apps.core.models import PublicIdModel, TimeStampedModel


def test_both_bases_are_abstract():
    assert PublicIdModel._meta.abstract is True
    assert TimeStampedModel._meta.abstract is True


def test_the_public_id_is_random_unique_and_not_editable():
    field = PublicIdModel._meta.get_field("public_id")

    assert field.unique is True
    assert field.editable is False
    assert field.default() != field.default()


def test_timestamps_are_set_by_the_database_layer():
    assert TimeStampedModel._meta.get_field("created_at").auto_now_add is True
    assert TimeStampedModel._meta.get_field("updated_at").auto_now is True
```

`backend/apps/core/tests/test_pagination.py`:

```python
import pytest
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.core.pagination import DefaultPagination, paginate, paginated


class NumberOut(serializers.Serializer):
    value = serializers.IntegerField()


ITEMS = [{"value": n} for n in range(1, 151)]


def drf_request(**query):
    return Request(APIRequestFactory().get("/things", query))


def test_the_first_page_holds_25_items():
    response = paginate(drf_request(), None, ITEMS, NumberOut)

    assert response.data["count"] == 150
    assert len(response.data["results"]) == 25
    assert response.data["results"][0] == {"value": 1}
    assert response.data["previous"] is None
    assert "page=2" in response.data["next"]


def test_the_last_page_has_no_next_link():
    response = paginate(drf_request(page=6), None, ITEMS, NumberOut)

    assert [row["value"] for row in response.data["results"]] == list(range(126, 151))
    assert response.data["next"] is None
    assert response.data["previous"] is not None


def test_the_caller_can_ask_for_a_page_size():
    response = paginate(drf_request(page_size=10, page=2), None, ITEMS, NumberOut)

    assert [row["value"] for row in response.data["results"]] == list(range(11, 21))


def test_the_page_size_is_capped_at_100():
    response = paginate(drf_request(page_size=5000), None, ITEMS, NumberOut)

    assert len(response.data["results"]) == 100


def test_a_page_beyond_the_end_is_not_found():
    with pytest.raises(NotFound):
        paginate(drf_request(page=99), None, ITEMS, NumberOut)


def test_the_schema_helper_describes_the_envelope():
    schema = paginated(NumberOut)

    assert schema.__name__ == "PaginatedNumberOut"
    assert list(schema().fields) == ["count", "next", "previous", "results"]
    assert paginated(NumberOut) is schema


def test_the_defaults_match_the_contract():
    assert DefaultPagination.page_size == 25
    assert DefaultPagination.max_page_size == 100
    assert DefaultPagination.page_size_query_param == "page_size"
```

`backend/apps/core/tests/test_xlsx.py`:

```python
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import load_workbook

from apps.core.xlsx import Column, build_workbook

COLUMNS = [
    Column("name", "Nom"),
    Column("days", "Jours", "number"),
    Column("start", "Début", "date"),
    Column("seen", "Vu le", "datetime"),
]


def sheet_of(data: bytes):
    return load_workbook(BytesIO(data)).active


def test_a_workbook_has_a_header_and_typed_rows():
    row = {
        "name": "Sami Ben Ali",
        "days": Decimal("2.5"),
        "start": date(2026, 11, 3),
        "seen": datetime(2026, 10, 6, 9, 30, tzinfo=UTC),  # 10:30 in Africa/Tunis
    }

    sheet = sheet_of(build_workbook(title="Absences", columns=COLUMNS, rows=[row]))

    assert sheet.title == "Absences"
    assert [cell.value for cell in sheet[1]] == ["Nom", "Jours", "Début", "Vu le"]
    assert sheet["A2"].value == "Sami Ben Ali"
    assert sheet["B2"].value == 2.5
    assert sheet["C2"].value == datetime(2026, 11, 3)
    assert sheet["D2"].value == datetime(2026, 10, 6, 10, 30)
    assert sheet.max_row == 2


def test_the_header_is_bold_and_stays_visible():
    sheet = sheet_of(build_workbook(title="Absences", columns=COLUMNS, rows=[]))

    assert sheet["A1"].font.bold is True
    assert sheet.freeze_panes == "A2"


def test_missing_and_empty_values_leave_the_cell_empty():
    sheet = sheet_of(build_workbook(title="T", columns=COLUMNS, rows=[{"name": None, "days": ""}]))

    assert [cell.value for cell in sheet[2]] == [None, None, None, None]


@pytest.mark.parametrize("text", ["=1+1", "+SUM(A1:A9)", "-2+3", "@cmd"])
def test_text_can_never_become_a_formula(text):
    sheet = sheet_of(build_workbook(title="T", columns=[Column("name", "Nom")], rows=[{"name": text}]))

    assert sheet["A2"].value == text
    assert sheet["A2"].data_type == "s"


def test_a_number_given_as_text_is_stored_as_a_number():
    sheet = sheet_of(build_workbook(title="T", columns=[Column("days", "Jours", "number")], rows=[{"days": "3.00"}]))

    assert sheet["A2"].value == 3
    assert sheet["A2"].data_type == "n"


def test_a_value_of_the_wrong_kind_is_written_as_text():
    columns = [Column("days", "Jours", "number"), Column("start", "Début", "date")]

    sheet = sheet_of(build_workbook(title="T", columns=columns, rows=[{"days": "many", "start": "soon"}]))

    assert sheet["A2"].value == "many"
    assert sheet["B2"].value == "soon"


def test_the_sheet_title_is_made_valid():
    title = "Demandes: en/attente [2026] et un titre beaucoup trop long pour Excel"

    sheet = sheet_of(build_workbook(title=title, columns=COLUMNS, rows=[]))

    assert len(sheet.title) <= 31
    assert not set(sheet.title) & set("[]:*?/\\")


def test_an_unknown_column_kind_is_refused():
    with pytest.raises(ValueError, match="colour"):
        Column("x", "X", "colour")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_models.py apps/core/tests/test_pagination.py apps/core/tests/test_xlsx.py -q`

Expected: FAIL during collection with `ModuleNotFoundError` for `apps.core.models`, `apps.core.pagination` and `apps.core.xlsx`.

- [ ] **Step 3: Write `backend/apps/core/models.py`**

```python
"""Abstract bases shared by every app's models."""

import uuid

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PublicIdModel(models.Model):
    """Adds a random identifier used in links, so record numbers cannot be guessed (PRD section 8)."""

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        abstract = True
```

- [ ] **Step 4: Write `backend/apps/core/pagination.py`**

```python
"""Lists are always paginated the same way: {count, next, previous, results}."""

from drf_spectacular.utils import OpenApiParameter
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class DefaultPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


PAGE_PARAMETERS = [
    OpenApiParameter("page", int, description="Page number, starting at 1."),
    OpenApiParameter("page_size", int, description="Items per page: 25 by default, 100 at most."),
]

_paginated_classes: dict[type, type] = {}


def paginated(serializer_class: type[serializers.Serializer]) -> type[serializers.Serializer]:
    """The schema of a paginated list of `serializer_class`, for @extend_schema(responses=...)."""
    if serializer_class not in _paginated_classes:
        _paginated_classes[serializer_class] = type(
            f"Paginated{serializer_class.__name__}",
            (serializers.Serializer,),
            {
                "count": serializers.IntegerField(),
                "next": serializers.URLField(allow_null=True),
                "previous": serializers.URLField(allow_null=True),
                "results": serializer_class(many=True),
            },
        )
    return _paginated_classes[serializer_class]


def paginate(request, view, queryset, serializer_class, *, context=None) -> Response:
    """Returns one page of `queryset` (a queryset or a list) serialised with `serializer_class`."""
    paginator = DefaultPagination()
    page = paginator.paginate_queryset(queryset, request, view=view)
    serializer = serializer_class(page, many=True, context={"request": request, **(context or {})})
    return paginator.get_paginated_response(serializer.data)
```

- [ ] **Step 5: Write `backend/apps/core/xlsx.py`**

```python
"""Excel workbooks for exports: one sheet, a bold header row, typed cells."""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

KINDS = ("text", "number", "date", "datetime")
_FORBIDDEN_IN_TITLE = re.compile(r"[\[\]:*?/\\]")


@dataclass(frozen=True)
class Column:
    key: str
    header: str
    kind: str = "text"

    def __post_init__(self) -> None:
        if self.kind not in KINDS:
            raise ValueError(f"Unknown column kind: {self.kind}")


def _sheet_title(title: str) -> str:
    return (_FORBIDDEN_IN_TITLE.sub(" ", title).strip() or "Sheet")[:31]


def _as_number(value: Any) -> int | float | Decimal | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return value
    if isinstance(value, str):
        try:
            return Decimal(value.strip())
        except InvalidOperation:
            return None
    return None


def _write(cell, value: Any, kind: str) -> None:
    if value is None or value == "":
        return
    if kind == "number":
        number = _as_number(value)
        if number is not None:
            cell.value = number
            return
    elif kind == "date" and isinstance(value, date):
        if isinstance(value, datetime):
            value = (timezone.localtime(value) if timezone.is_aware(value) else value).date()
        cell.value = value
        cell.number_format = "DD/MM/YYYY"
        return
    elif kind == "datetime" and isinstance(value, datetime):
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        cell.value = local.replace(tzinfo=None)  # Excel has no time zones: write local time
        cell.number_format = "DD/MM/YYYY HH:MM"
        return
    # Everything else is written as an explicit string, so "=..." can never become a formula.
    cell.set_explicit_value(str(value), "s")


def build_workbook(*, title: str, columns: Sequence[Column], rows: Iterable[Mapping[str, Any]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = _sheet_title(title)

    widths = []
    for index, column in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=index)
        cell.set_explicit_value(column.header, "s")
        cell.font = Font(bold=True)
        widths.append(len(column.header))
    sheet.freeze_panes = "A2"

    for row_index, row in enumerate(rows, start=2):
        for index, column in enumerate(columns, start=1):
            value = row.get(column.key)
            _write(sheet.cell(row=row_index, column=index), value, column.kind)
            if value is not None:
                widths[index - 1] = max(widths[index - 1], min(len(str(value)), 60))

    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width + 2

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests/test_models.py apps/core/tests/test_pagination.py apps/core/tests/test_xlsx.py -q`

Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core
git commit -m "feat(core): base models, pagination and Excel helper"
```

---

### Task 6: Accounts: user model, email rule, password policy and employee-directory port

**Files:**
- Create: `backend/apps/accounts/__init__.py` (empty), `backend/apps/accounts/apps.py`, `backend/apps/accounts/models.py`, `backend/apps/accounts/emails.py`, `backend/apps/accounts/passwords.py`, `backend/apps/accounts/ports.py`, `backend/apps/accounts/messages.py`
- Create: `backend/apps/accounts/services/__init__.py`, `backend/apps/accounts/services/naming.py`
- Create: `backend/apps/accounts/migrations/0001_initial.py` (generated)
- Create: `backend/apps/accounts/tests/__init__.py` (empty), `backend/apps/accounts/tests/world.py`, `backend/conftest.py`
- Modify: `backend/config/settings.py`
- Test: `backend/apps/accounts/tests/test_models.py`, `test_emails.py`, `test_passwords.py`, `test_naming.py`

**Interfaces:**
- Consumes: `apps.core.models.PublicIdModel` (Task 5), `apps.core.errors.DomainError`, `apps.core.i18n` (Task 4).
- Produces (master 7.2):
  - `apps.accounts.models.User` with the columns of master 7.2 (`USERNAME_FIELD = "email"`; Django's `last_login` column is removed) and `User.objects.create_user(email, password=None, **extra)`.
  - `apps.accounts.models.RoleAssignment(user, role, assigned_by, assigned_at)`, unique on `(user, role)`, related name `user.role_assignments`.
  - `apps.accounts.emails`: `normalise_email(value) -> str`, `has_allowed_domain(value) -> bool`, `ensure_allowed_email(value, *, field="email") -> str`.
  - `apps.accounts.passwords`: `validate_new_password(password, user=None, *, field="new_password") -> None` (raises `auth.weak_password`), `generate_temporary_password() -> str`.
  - `apps.accounts.ports`: `EmployeeRef(public_id, full_name, email)`, `EmployeeDirectory` (protocol), `set_employee_directory(directory)`, `employee_directory()`.
  - `apps.accounts.services.display_name(user) -> str`.
  - `apps.accounts.tests.world`: `PASSWORD = "Correct-Horse-42!"`, `make_user(email=None, *, password=PASSWORD, full_name=None, roles=(), **extra) -> User`.
  - The complete accounts message catalogue (`auth.*`, `accounts.*`, `notification.account.password_reset.*`), used by Tasks 9 to 16.

- [ ] **Step 1: Write the failing tests**

`backend/apps/accounts/tests/world.py`:

```python
"""Builders for accounts. Used by this app's tests and by the standard cast (backend/tests/world.py)."""

import itertools

from apps.accounts.models import RoleAssignment, User

PASSWORD = "Correct-Horse-42!"

_sequence = itertools.count(1)


def _name_from(email: str) -> str:
    return email.split("@")[0].replace(".", " ").title()


def make_user(email=None, *, password=PASSWORD, full_name=None, roles=(), **extra) -> User:
    address = email or f"person{next(_sequence)}@impactrisks.com"
    name = _name_from(address) if full_name is None else full_name
    user = User.objects.create_user(address, password, full_name=name, **extra)
    for role in roles:
        RoleAssignment.objects.create(user=user, role=str(role))
    return user
```

`backend/apps/accounts/tests/test_models.py`:

```python
import pytest
from django.conf import settings
from django.db import IntegrityError, transaction

from apps.accounts.models import RoleAssignment, User
from apps.accounts.tests.world import PASSWORD, make_user

pytestmark = pytest.mark.django_db


def test_create_user_normalises_the_email():
    user = User.objects.create_user("  Sami.BenAli@ImpactRisks.COM ", PASSWORD)

    assert user.email == "sami.benali@impactrisks.com"
    assert User.objects.get_by_natural_key(" SAMI.BenAli@impactrisks.com") == user


def test_two_accounts_cannot_share_an_email_whatever_the_case():
    make_user("sami@impactrisks.com")

    with pytest.raises(IntegrityError), transaction.atomic():
        make_user("SAMI@impactrisks.com")


def test_the_database_refuses_an_email_that_is_not_lower_case():
    with pytest.raises(IntegrityError), transaction.atomic():
        User(email="Sami@impactrisks.com", password="x").save()


def test_a_new_account_has_safe_defaults():
    user = make_user()

    assert user.is_active is True
    assert user.must_change_password is False
    assert user.temp_password_expires_at is None
    assert user.failed_attempts == 0
    assert user.locked_until is None
    assert user.last_login_at is None
    assert user.previous_login_at is None
    assert user.password_reset_by is None
    assert user.password_reset_at is None
    assert user.language == settings.DEFAULT_LANGUAGE
    assert user.last_workspace == ""
    assert user.created_at is not None
    assert user.created_by is None
    assert str(user) == user.email


def test_every_account_has_its_own_public_id():
    assert make_user().public_id != make_user().public_id


def test_djangos_own_last_login_column_is_not_used():
    assert "last_login" not in {field.name for field in User._meta.get_fields()}


def test_the_password_is_never_stored_in_clear():
    user = make_user()

    assert PASSWORD not in user.password
    assert user.check_password(PASSWORD) is True
    assert user.check_password("something else") is False


@pytest.mark.real_hasher
def test_passwords_are_hashed_with_argon2():
    assert make_user().password.startswith("argon2")


def test_an_account_created_without_a_password_cannot_sign_in():
    user = User.objects.create_user("nopass@impactrisks.com")

    assert user.has_usable_password() is False


def test_make_user_assigns_roles():
    user = make_user(roles=["hr", "exec"])

    assert set(user.role_assignments.values_list("role", flat=True)) == {"hr", "exec"}


def test_a_role_is_held_once_per_account():
    user = make_user(roles=["hr"])

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(user=user, role="hr")
```

`backend/apps/accounts/tests/test_emails.py`:

```python
import pytest

from apps.accounts.emails import ensure_allowed_email, has_allowed_domain, normalise_email
from apps.core.errors import DomainError


@pytest.fixture(autouse=True)
def company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("  Sami@ImpactRisks.com ", "sami@impactrisks.com"), ("sami@impactrisks.com", "sami@impactrisks.com"), ("", ""), (None, "")],
)
def test_normalise_trims_and_lowers(raw, expected):
    assert normalise_email(raw) == expected


@pytest.mark.parametrize(
    "address",
    ["sami@impactrisks.com", " SAMI@IMPACTRISKS.COM ", "Employee.A1@ImpactRisks.Com"],
)
def test_addresses_on_the_company_domain_are_allowed(address):
    assert has_allowed_domain(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "sami@impactrisks.com.evil.com",
        "sami@impactrisk.com",
        "sami@mail.impactrisks.com",
        "sami@evil-impactrisks.com",
        "sami@impactrisks.co",
        "sami@impactrisкs.com",  # a Cyrillic letter that looks like "k"
        "impactrisks.com",
        "sami",
        "",
    ],
)
def test_every_other_address_is_refused(address):
    assert has_allowed_domain(address) is False


def test_ensure_allowed_email_returns_the_normalised_address():
    assert ensure_allowed_email("  Sami@ImpactRisks.com ") == "sami@impactrisks.com"


def test_a_foreign_domain_is_refused_with_the_reason():
    with pytest.raises(DomainError) as error:
        ensure_allowed_email("sami@gmail.com")

    assert error.value.code == "auth.domain_not_allowed"
    assert error.value.field == "email"
    assert error.value.params == {"domain": "impactrisks.com"}


@pytest.mark.parametrize("address", ["@impactrisks.com", "sa mi@impactrisks.com", "sami@evil.com@impactrisks.com"])
def test_a_malformed_address_on_the_right_domain_is_invalid(address):
    with pytest.raises(DomainError) as error:
        ensure_allowed_email(address, field="professional_email")

    assert error.value.code == "accounts.email_invalid"
    assert error.value.field == "professional_email"
```

`backend/apps/accounts/tests/test_passwords.py`:

```python
import re

import pytest
from django.contrib.auth.password_validation import CommonPasswordValidator
from django.utils import translation

from apps.accounts.models import User
from apps.accounts.passwords import generate_temporary_password, validate_new_password
from apps.core.errors import DomainError

TEMPORARY = re.compile(r"^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$")


def sami() -> User:
    return User(email="sami.benali@impactrisks.com", full_name="Sami Ben Ali")


def test_a_good_password_is_accepted():
    validate_new_password("Correct-Horse-42!", sami())


def test_a_password_under_12_characters_is_refused():
    with pytest.raises(DomainError) as error:
        validate_new_password("Short-pass1", sami())

    assert error.value.code == "auth.weak_password"
    assert error.value.field == "new_password"
    assert error.value.params["reasons"]


def test_a_common_password_is_refused():
    common = next(p for p in sorted(CommonPasswordValidator().passwords) if len(p) >= 12)

    with pytest.raises(DomainError) as error:
        validate_new_password(common, sami())

    assert error.value.code == "auth.weak_password"


@pytest.mark.parametrize("password", ["Impactrisks2026", "sami.benali@impactrisks.com", "Sami Ben Ali 1"])
def test_a_password_close_to_the_email_or_the_name_is_refused(password):
    with pytest.raises(DomainError) as error:
        validate_new_password(password, sami())

    assert error.value.code == "auth.weak_password"


def test_the_reasons_are_written_in_the_readers_language():
    with translation.override("fr"), pytest.raises(DomainError) as french:
        validate_new_password("court", sami())
    with translation.override("en"), pytest.raises(DomainError) as english:
        validate_new_password("short", sami())

    assert "12 caract" in french.value.params["reasons"]
    assert "12 characters" in english.value.params["reasons"]


def test_the_field_name_can_be_chosen():
    with pytest.raises(DomainError) as error:
        validate_new_password("short", sami(), field="password")

    assert error.value.field == "password"


def test_temporary_passwords_are_readable_unique_and_strong():
    generated = {generate_temporary_password() for _ in range(200)}

    assert len(generated) == 200
    for password in generated:
        assert TEMPORARY.match(password), password
        validate_new_password(password, sami())
```

`backend/apps/accounts/tests/test_naming.py`:

```python
import pytest

from apps.accounts.ports import EmployeeRef, employee_directory, set_employee_directory
from apps.accounts.services import display_name
from apps.accounts.tests.world import make_user


class StubDirectory:
    def __init__(self, refs):
        self.refs = refs

    def candidate(self, public_id):
        return None

    def candidates(self):
        return []

    def link(self, *, user_id, public_id):
        raise AssertionError("not used here")

    def ref_for_user(self, user_id):
        return self.refs.get(user_id)


@pytest.fixture
def install_directory():
    previous = employee_directory()
    yield set_employee_directory
    set_employee_directory(previous)


def test_until_plan_02_the_directory_knows_nobody():
    directory = employee_directory()

    assert directory.candidate("0f0e0d0c-0000-4000-8000-000000000001") is None
    assert directory.candidates() == []
    assert directory.ref_for_user(1) is None


def test_until_plan_02_nobody_can_be_linked():
    with pytest.raises(RuntimeError):
        employee_directory().link(user_id=1, public_id="0f0e0d0c-0000-4000-8000-000000000001")


@pytest.mark.django_db
def test_the_name_comes_from_the_employee_record_when_there_is_one(install_directory):
    user = make_user("sami@impactrisks.com", full_name="S. Ben Ali")
    install_directory(StubDirectory({user.pk: EmployeeRef("abc", "Sami Ben Ali", "sami@impactrisks.com")}))

    assert display_name(user) == "Sami Ben Ali"


@pytest.mark.django_db
def test_otherwise_the_name_is_the_one_stored_on_the_account():
    assert display_name(make_user("admin@impactrisks.com", full_name="Leila Admin")) == "Leila Admin"


@pytest.mark.django_db
def test_and_as_a_last_resort_the_email():
    assert display_name(make_user("admin@impactrisks.com", full_name="")) == "admin@impactrisks.com"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.accounts.models'` (and the other missing modules).

- [ ] **Step 3: Write the message catalogue of the accounts app**

`backend/apps/accounts/messages.py`:

```python
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
```

- [ ] **Step 4: Write the email rule, the password policy and the port**

`backend/apps/accounts/emails.py`:

```python
"""The login identifier is the professional email, on the company domain only (ACC-01)."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from apps.core.errors import DomainError


def normalise_email(value: str | None) -> str:
    return (value or "").strip().lower()


def has_allowed_domain(value: str | None) -> bool:
    """True when the text after the last @ is exactly the company domain."""
    _local, separator, domain = normalise_email(value).rpartition("@")
    return bool(separator) and domain == settings.ALLOWED_EMAIL_DOMAIN


def ensure_allowed_email(value: str | None, *, field: str = "email") -> str:
    """Returns the normalised address, or raises with the reason."""
    email = normalise_email(value)
    if not has_allowed_domain(email):
        raise DomainError("auth.domain_not_allowed", field=field, domain=settings.ALLOWED_EMAIL_DOMAIN)
    try:
        validate_email(email)
    except ValidationError as exc:
        raise DomainError("accounts.email_invalid", field=field) from exc
    return email
```

`backend/apps/accounts/passwords.py`:

```python
"""Password policy (ACC-02) and administrator-issued temporary passwords (ACC-05)."""

import secrets

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError

from apps.core.errors import DomainError

# No 0/O, 1/l/I: a temporary password is read aloud or copied by hand.
TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnpqrstuvwxyz" + "23456789"


def validate_new_password(password: str, user=None, *, field: str = "new_password") -> None:
    """Applies AUTH_PASSWORD_VALIDATORS. The reasons are in the active language."""
    try:
        password_validation.validate_password(password, user=user)
    except ValidationError as exc:
        raise DomainError("auth.weak_password", field=field, reasons=" ".join(exc.messages)) from exc


def generate_temporary_password() -> str:
    """Sixteen random characters in four groups, for example `Xk7p-M2qd-Hn4w-TbR9`."""
    groups = ["".join(secrets.choice(TEMP_ALPHABET) for _ in range(4)) for _ in range(4)]
    return "-".join(groups)
```

`backend/apps/accounts/ports.py`:

```python
"""What accounts needs to know about employees. Implemented by the organisation app in plan 02 (master D6)."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmployeeRef:
    public_id: str
    full_name: str
    email: str


class EmployeeDirectory(Protocol):
    def candidate(self, public_id: str) -> EmployeeRef | None:
        """An active employee without an account, or None."""

    def candidates(self) -> list[EmployeeRef]:
        """Every active employee without an account."""

    def link(self, *, user_id: int, public_id: str) -> None:
        """Attach the account to the employee record."""

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        """The employee record linked to this account, or None."""


class NullEmployeeDirectory:
    """Used until the organisation app registers the real directory."""

    def candidate(self, public_id: str) -> EmployeeRef | None:
        return None

    def candidates(self) -> list[EmployeeRef]:
        return []

    def link(self, *, user_id: int, public_id: str) -> None:
        raise RuntimeError("No employee directory is installed")

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        return None


_directory: EmployeeDirectory = NullEmployeeDirectory()


def set_employee_directory(directory: EmployeeDirectory) -> None:
    global _directory
    _directory = directory


def employee_directory() -> EmployeeDirectory:
    return _directory
```

- [ ] **Step 5: Write the models, the app configuration and the first service**

`backend/apps/accounts/models.py`:

```python
from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.accounts.emails import normalise_email
from apps.core.models import PublicIdModel

LANGUAGE_CHOICES = [("fr", "Français"), ("en", "English")]
ASSIGNABLE_ROLE_CHOICES = [("hr", "HR"), ("exec", "Executive Management"), ("sysadmin", "System Administrator")]


def default_language() -> str:
    return settings.DEFAULT_LANGUAGE


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        user = self.model(email=normalise_email(email), **extra)
        if password is None:
            user.set_unusable_password()
        else:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, email):
        return self.get(email=normalise_email(email))


class User(PublicIdModel, AbstractBaseUser):
    """A local account. The link to an employee record is `Employee.user`, added by plan 02 (master D6)."""

    last_login = None  # replaced by last_login_at and previous_login_at (ACC-07)

    email = models.EmailField(unique=True, max_length=254)
    full_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=False)
    temp_password_expires_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    previous_login_at = models.DateTimeField(null=True, blank=True)
    password_reset_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    password_reset_at = models.DateTimeField(null=True, blank=True)
    language = models.CharField(max_length=2, choices=LANGUAGE_CHOICES, default=default_language)
    last_workspace = models.CharField(max_length=10, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["email"]
        constraints = [
            models.CheckConstraint(condition=Q(email=Lower("email")), name="accounts_user_email_lower"),
        ]

    def __str__(self) -> str:
        return self.email


class RoleAssignment(models.Model):
    """One assignable role held by one account. EMPLOYEE and MANAGER are derived, never stored (PRD 3)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.CharField(max_length=10, choices=ASSIGNABLE_ROLE_CHOICES)
    assigned_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    assigned_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["role"]
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="accounts_roleassignment_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.user.email}: {self.role}"
```

`backend/apps/accounts/apps.py`:

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self) -> None:
        from apps.accounts.messages import MESSAGES
        from apps.core.i18n import register_messages

        register_messages(MESSAGES)
```

`backend/apps/accounts/services/naming.py`:

```python
from apps.accounts.ports import employee_directory


def display_name(user) -> str:
    """The name shown for an account: the employee's name if linked, else the stored name, else the email."""
    ref = employee_directory().ref_for_user(user.pk)
    if ref is not None:
        return ref.full_name
    return user.full_name or user.email
```

`backend/apps/accounts/services/__init__.py`:

```python
"""Writes of the accounts app. Import names from here: `from apps.accounts import services`."""

from apps.accounts.services.naming import display_name

__all__ = ["display_name"]
```

- [ ] **Step 6: Add the pytest fixture for fast password hashing**

`backend/conftest.py`:

```python
import pytest


@pytest.fixture(autouse=True)
def _fast_password_hashing(request, settings):
    """Argon2 is slow on purpose. Tests use a fast hasher unless marked `real_hasher`."""
    if request.node.get_closest_marker("real_hasher") is None:
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
```

- [ ] **Step 7: Register the app, the user model and the password policy**

In `backend/config/settings.py`:

Replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "apps.core",
    "apps.accounts",
]
```

Replace `MIDDLEWARE` with:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.core.middleware.LanguageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

Insert after the `DATABASES` block:

```python
# --- Accounts (PRD 5.1) ---
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
PASSWORD_HASHERS = ["django.contrib.auth.hashers.Argon2PasswordHasher"]
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "full_name")},
    },
]
```

- [ ] **Step 8: Generate the migration**

Run: `docker compose run --rm app python manage.py makemigrations accounts`

Expected: `Migrations for 'accounts':` followed by `apps/accounts/migrations/0001_initial.py` listing `Create model User` and `Create model RoleAssignment`. The command also creates `apps/accounts/migrations/__init__.py`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts tests/test_messages.py -q`

Expected: PASS, no failures.

- [ ] **Step 10: Apply the migration to the development database**

Run: `docker compose run --rm app python manage.py migrate`

Expected: `Applying accounts.0001_initial... OK` and `Applying auth.0001_initial... OK` among the applied migrations.

- [ ] **Step 11: Commit**

```bash
git add backend/apps/accounts backend/conftest.py backend/config/settings.py
git commit -m "feat(accounts): user model, company-domain rule, password policy and employee-directory port"
```

---

### Task 7: Problem-details error responses

**Files:**
- Create: `backend/apps/core/api/__init__.py`, `backend/apps/core/api/problems.py`
- Create: `backend/apps/core/tests/urls_problems.py`
- Modify: `backend/config/settings.py`, `backend/config/urls.py`
- Test: `backend/apps/core/tests/test_problems.py`, `backend/apps/core/tests/test_unknown_url.py`

**Interfaces:**
- Consumes: `apps.core.errors`, `apps.core.i18n.translate` (Task 4), `apps.core.context.current_request_id` (Task 3).
- Produces (master 6.2):
  - `apps.core.api.exception_handler(exc, context) -> Response`, the DRF `EXCEPTION_HANDLER`. Every error leaves the API as `application/problem+json` with `type`, `title`, `status`, `code`, `detail`, `errors` (at least one `{field, code, detail, params}`) and `request_id`.
  - DRF validation errors become code `core.validation`, with one entry per message; an entry's code is `validation.<DRF code>` (`validation.required`, `validation.max_length`, ...) and its `field` is the dotted path of the input (`lines.0.days`), or null for an error that belongs to no field.
  - Any other exception becomes status 500, code `core.unexpected`, with the request id as the reference and no internal detail.
  - `apps.core.api.problems.problem_body(*, status, code, errors, detail=None) -> dict` and `problem_entry(code, *, field=None, detail=None, params=None) -> dict`, for the few responses built outside DRF.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/urls_problems.py`:

```python
"""A URL configuration used only by test_problems.py: one view that fails in every way."""

from datetime import UTC, datetime

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.urls import path
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import Conflict, DomainError, NotFound, Problem, RateLimited


class Line(serializers.Serializer):
    label = serializers.CharField()
    days = serializers.IntegerField(min_value=1)


class Sample(serializers.Serializer):
    name = serializers.CharField(max_length=5)
    lines = Line(many=True, required=False)

    def validate(self, attrs):
        if attrs["name"] == "clash":
            raise serializers.ValidationError("These two do not go together.")
        return attrs


class ProbeView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        kind = request.query_params.get("kind", "")
        if kind == "domain":
            raise DomainError("test.locked", field="email", until=datetime(2026, 10, 6, 9, 30, tzinfo=UTC))
        if kind == "several":
            raise DomainError(
                "core.validation",
                problems=[Problem("test.first", "start_date"), Problem("test.second")],
            )
        if kind == "not_found":
            raise NotFound()
        if kind == "conflict":
            raise Conflict()
        if kind == "rate":
            raise RateLimited()
        if kind == "http404":
            raise Http404("no such thing")
        if kind == "denied":
            raise PermissionDenied("nope")
        if kind == "crash":
            raise RuntimeError("secret internal detail")
        return Response({"ok": True})

    def post(self, request):
        serializer = Sample(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"ok": True})


urlpatterns = [path("probe", ProbeView.as_view())]
```

`backend/apps/core/tests/test_problems.py`:

```python
import logging

import pytest
from rest_framework.test import APIClient

from apps.core.i18n import register_messages

register_messages(
    {
        "test.locked": {"en": "Locked until {until}.", "fr": "Verrouillé jusqu'au {until}."},
        "test.first": {"en": "First problem.", "fr": "Premier problème."},
        "test.second": {"en": "Second problem.", "fr": "Second problème."},
    }
)

pytestmark = pytest.mark.urls("apps.core.tests.urls_problems")


@pytest.fixture
def api():
    return APIClient()


def probe(api, kind, lang="en"):
    return api.get("/probe", {"kind": kind}, HTTP_ACCEPT_LANGUAGE=lang)


def test_a_domain_error_becomes_a_problem_document(api):
    response = probe(api, "domain")

    assert response.status_code == 400
    assert response["Content-Type"] == "application/problem+json"
    assert response.json() == {
        "type": "urn:iris-hr:problem:test.locked",
        "title": "Bad Request",
        "status": 400,
        "code": "test.locked",
        "detail": "Locked until 06/10/2026 10:30.",
        "errors": [
            {
                "field": "email",
                "code": "test.locked",
                "detail": "Locked until 06/10/2026 10:30.",
                "params": {"until": "2026-10-06T09:30:00Z"},
            }
        ],
        "request_id": response["X-Request-ID"],
    }


def test_the_detail_is_in_the_callers_language(api):
    body = probe(api, "domain", lang="fr").json()

    assert body["detail"] == "Verrouillé jusqu'au 06/10/2026 10:30."
    assert body["errors"][0]["detail"] == "Verrouillé jusqu'au 06/10/2026 10:30."


def test_several_problems_are_listed_under_one_summary(api):
    body = probe(api, "several").json()

    assert body["code"] == "core.validation"
    assert body["detail"] == "Some fields need your attention."
    assert [(e["field"], e["code"], e["detail"]) for e in body["errors"]] == [
        ("start_date", "test.first", "First problem."),
        (None, "test.second", "Second problem."),
    ]


@pytest.mark.parametrize(
    ("kind", "status", "title", "code"),
    [
        ("not_found", 404, "Not Found", "core.not_found"),
        ("conflict", 409, "Conflict", "core.conflict"),
        ("rate", 429, "Too Many Requests", "core.rate_limited"),
        ("http404", 404, "Not Found", "core.not_found"),
        ("denied", 403, "Forbidden", "core.not_allowed"),
    ],
)
def test_each_kind_of_error_has_its_status_and_code(api, kind, status, title, code):
    response = probe(api, kind)
    body = response.json()

    assert response.status_code == status
    assert (body["status"], body["title"], body["code"]) == (status, title, code)
    assert body["type"] == f"urn:iris-hr:problem:{code}"
    assert len(body["errors"]) == 1
    assert body["errors"][0]["field"] is None
    assert body["detail"]


def test_a_missing_field_is_reported_next_to_its_input(api):
    english = api.post("/probe", {}, HTTP_ACCEPT_LANGUAGE="en").json()
    french = api.post("/probe", {}, HTTP_ACCEPT_LANGUAGE="fr").json()

    assert english["status"] == 400
    assert english["code"] == "core.validation"
    assert english["detail"] == "Some fields need your attention."
    assert english["errors"] == [
        {"field": "name", "code": "validation.required", "detail": "This field is required.", "params": {}}
    ]
    assert french["detail"] == "Certains champs sont à corriger."
    assert french["errors"][0]["detail"] != english["errors"][0]["detail"]


def test_nested_inputs_get_a_dotted_path(api):
    payload = {"name": "toolong", "lines": [{"label": "a", "days": 0}, {"days": 2}]}

    body = api.post("/probe", payload).json()

    assert [(e["field"], e["code"]) for e in body["errors"]] == [
        ("name", "validation.max_length"),
        ("lines.0.days", "validation.min_value"),
        ("lines.1.label", "validation.required"),
    ]


def test_an_error_that_belongs_to_no_field_has_a_null_field(api):
    body = api.post("/probe", {"name": "clash"}).json()

    assert body["errors"] == [
        {"field": None, "code": "validation.invalid", "detail": "These two do not go together.", "params": {}}
    ]


def test_an_unexpected_error_hides_the_cause_and_gives_a_reference(api, caplog):
    with caplog.at_level(logging.ERROR, logger="iris.errors"):
        response = probe(api, "crash")
    body = response.json()

    assert response.status_code == 500
    assert body["code"] == "core.unexpected"
    assert body["request_id"] == response["X-Request-ID"]
    assert response["X-Request-ID"] in body["detail"]
    assert "secret internal detail" not in response.content.decode()
    logged = next(r for r in caplog.records if r.name == "iris.errors")
    assert logged.exc_info is not None
    assert "secret internal detail" in str(logged.exc_info[1])


def test_a_method_the_view_does_not_have_is_refused(api):
    response = api.delete("/probe")

    assert response.status_code == 405
    assert response.json()["code"] == "core.method_not_allowed"


def test_unreadable_json_is_refused(api):
    response = api.post("/probe", data="{", content_type="application/json")

    assert response.status_code == 400
    assert response.json()["code"] == "core.malformed"


def test_an_unsupported_content_type_is_refused(api):
    response = api.post("/probe", data="name=x", content_type="text/plain")

    assert response.status_code == 415
    assert response.json()["code"] == "core.unsupported_media_type"
```

`backend/apps/core/tests/test_unknown_url.py`:

```python
from rest_framework.test import APIClient


def test_an_unknown_address_answers_with_a_problem_document():
    response = APIClient().get("/api/v1/does-not-exist", HTTP_ACCEPT_LANGUAGE="en")
    body = response.json()

    assert response.status_code == 404
    assert response["Content-Type"] == "application/problem+json"
    assert body["code"] == "core.not_found"
    assert body["detail"] == "This page or item is not available."
    assert body["request_id"] == response["X-Request-ID"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_problems.py apps/core/tests/test_unknown_url.py -q`

Expected: FAIL. In `test_problems.py` the domain errors and the crash escape as exceptions (`apps.core.errors.DomainError`, `RuntimeError`) and DRF's own errors have no `code` key (`KeyError: 'code'`); `test_unknown_url.py` fails with `ValueError: Content-Type header is "text/html; charset=utf-8", not "application/json"`.

- [ ] **Step 3: Write `backend/apps/core/api/problems.py` and `backend/apps/core/api/__init__.py`**

`backend/apps/core/api/problems.py`:

```python
"""One error format for the whole API: problem details (master 6.2)."""

import logging
from http import HTTPStatus
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404, JsonResponse
from rest_framework import exceptions as drf
from rest_framework.response import Response

from apps.core import context
from apps.core.errors import DomainError
from apps.core.i18n import translate

logger = logging.getLogger("iris.errors")

CONTENT_TYPE = "application/problem+json"
NON_FIELD_KEY = "non_field_errors"

_DRF_CODES: tuple[tuple[type[drf.APIException], str], ...] = (
    (drf.NotAuthenticated, "core.not_authenticated"),
    (drf.AuthenticationFailed, "core.not_authenticated"),
    (drf.PermissionDenied, "core.not_allowed"),
    (drf.NotFound, "core.not_found"),
    (drf.MethodNotAllowed, "core.method_not_allowed"),
    (drf.ParseError, "core.malformed"),
    (drf.UnsupportedMediaType, "core.unsupported_media_type"),
    (drf.NotAcceptable, "core.not_acceptable"),
    (drf.Throttled, "core.rate_limited"),
)


def problem_entry(
    code: str, *, field: str | None = None, detail: str | None = None, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    values = dict(params or {})
    return {
        "field": field,
        "code": code,
        "detail": translate(code, **values) if detail is None else detail,
        "params": values,
    }


def problem_body(
    *, status: int, code: str, errors: list[dict[str, Any]], detail: str | None = None
) -> dict[str, Any]:
    return {
        "type": f"urn:iris-hr:problem:{code}",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code,
        "detail": errors[0]["detail"] if detail is None else detail,
        "errors": errors,
        "request_id": context.current_request_id(),
    }


def _respond(
    status: int,
    code: str,
    errors: list[dict[str, Any]],
    *,
    detail: str | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    body = problem_body(status=status, code=code, errors=errors, detail=detail)
    return Response(body, status=status, headers=headers, content_type=CONTENT_TYPE)


def _is_leaf(node: Any) -> bool:
    return isinstance(node, dict) and set(node) == {"message", "code"} and isinstance(node["message"], str)


def _flatten(node: Any, path: str = "") -> list[dict[str, Any]]:
    """Turns DRF's nested validation details into a flat list with dotted field paths."""
    if _is_leaf(node):
        return [problem_entry(f"validation.{node['code']}", field=path or None, detail=str(node["message"]))]
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        for key, child in node.items():
            child_path = path if key == NON_FIELD_KEY else (f"{path}.{key}" if path else str(key))
            found.extend(_flatten(child, child_path))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            child_path = path if _is_leaf(child) else (f"{path}.{index}" if path else str(index))
            found.extend(_flatten(child, child_path))
    return found


def _unexpected_errors() -> list[dict[str, Any]]:
    return [problem_entry("core.unexpected", params={"reference": context.current_request_id()})]


def exception_handler(exc: Exception, handler_context: dict[str, Any]) -> Response:
    if isinstance(exc, DomainError):
        errors = [problem_entry(p.code, field=p.field, params=dict(p.params)) for p in exc.problems]
        summary = translate(exc.code, **exc.params) if len(errors) > 1 else None
        return _respond(exc.status, exc.code, errors, detail=summary)

    if isinstance(exc, Http404):
        exc = drf.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf.PermissionDenied()

    if isinstance(exc, drf.ValidationError):
        errors = _flatten(exc.get_full_details()) or [problem_entry("core.validation")]
        return _respond(400, "core.validation", errors, detail=translate("core.validation"))

    if isinstance(exc, drf.APIException) and exc.status_code < 500:
        code = next((known for cls, known in _DRF_CODES if isinstance(exc, cls)), "core.invalid")
        headers: dict[str, str] = {}
        if getattr(exc, "auth_header", None):
            headers["WWW-Authenticate"] = exc.auth_header
        if getattr(exc, "wait", None):
            headers["Retry-After"] = str(int(exc.wait))
        return _respond(exc.status_code, code, [problem_entry(code)], headers=headers)

    logger.error("unexpected error", exc_info=exc)
    return _respond(500, "core.unexpected", _unexpected_errors())


def not_found_view(request, exception=None) -> JsonResponse:
    """Django's handler404: an address that matches no route."""
    body = problem_body(status=404, code="core.not_found", errors=[problem_entry("core.not_found")])
    return JsonResponse(body, status=404, content_type=CONTENT_TYPE)


def server_error_view(request) -> JsonResponse:
    """Django's handler500: an error raised outside a DRF view. Django has already logged it."""
    body = problem_body(status=500, code="core.unexpected", errors=_unexpected_errors())
    return JsonResponse(body, status=500, content_type=CONTENT_TYPE)
```

`backend/apps/core/api/__init__.py`:

```python
from apps.core.api.problems import exception_handler

__all__ = ["exception_handler"]
```

- [ ] **Step 4: Configure DRF and Django to use it**

In `backend/config/settings.py`, insert after the `AUTH_PASSWORD_VALIDATORS` block:

```python
# --- API (PRD 9.3) ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}
```

Replace `backend/config/urls.py` with:

```python
from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("config.api_urls")),
]

handler404 = "apps.core.api.problems.not_found_view"
handler500 = "apps.core.api.problems.server_error_view"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests/test_problems.py apps/core/tests/test_unknown_url.py -q`

Expected: PASS, no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core backend/config
git commit -m "feat(core): problem-details responses for every API error"
```

---

### Task 8: Audit trail

**Files:**
- Create: `backend/apps/audit/__init__.py` (empty), `backend/apps/audit/apps.py`, `backend/apps/audit/models.py`, `backend/apps/audit/services.py`, `backend/apps/audit/selectors.py`
- Create: `backend/apps/audit/migrations/0001_initial.py` (generated), `backend/apps/audit/migrations/0002_append_only.py`
- Create: `backend/apps/audit/tests/__init__.py` (empty), `backend/tests/db.py`
- Modify: `backend/conftest.py`, `backend/config/settings.py`
- Test: `backend/apps/audit/tests/test_services.py`, `backend/apps/audit/tests/test_selectors.py`, `backend/apps/audit/tests/test_append_only.py`

**Interfaces:**
- Consumes: `apps.accounts.models.User`, `apps.accounts.tests.world.make_user` (Task 6); `apps.core.context` (Task 3).
- Produces (master 6.5 and 7.3):
  - `apps.audit.models.AuditEvent` with `at`, `actor`, `category`, `action`, `object_type`, `object_id`, `object_label`, `changes`, `ip_address`, `request_id`. The table rejects UPDATE, DELETE and TRUNCATE.
  - `apps.audit.services` (import as `from apps.audit import services as audit`): `BUSINESS`, `SECURITY`, `UNSET`, `record(*, action, category=BUSINESS, obj=None, object_type="", object_id="", object_label="", changes=None, actor=UNSET) -> AuditEvent`, `snapshot(instance, fields) -> dict`, `diff(before, after, *, redact=()) -> dict`.
  - `apps.audit.selectors`: `events_for_object(object_type: str, object_id: str) -> QuerySet[AuditEvent]`, `count_recent(*, action: str, ip_address: str, since: datetime) -> int`, `list_events(*, category: str, actor_public_id=None, action="", object_type="", object_id="", date_from: date | None = None, date_to: date | None = None) -> QuerySet[AuditEvent]`.
  - `tests.db.disable_truncate_guards()`: the test database lets transactional tests empty append-only tables; UPDATE and DELETE stay blocked there too.
- Rule for every service in every plan: pass `actor=actor` to `audit.record`. The default (the request's user) is right only inside a request; service tests and jobs run outside one.

- [ ] **Step 1: Write the failing tests**

`backend/apps/audit/tests/test_services.py`:

```python
import uuid
from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.models import RoleAssignment
from apps.accounts.tests.world import make_user
from apps.audit import services as audit
from apps.audit.models import AuditEvent
from apps.core import context

pytestmark = pytest.mark.django_db


def test_record_stores_who_did_what_to_what():
    actor = make_user("hr@impactrisks.com")
    target = make_user("sami@impactrisks.com")

    event = audit.record(
        action="account.disabled",
        category=audit.SECURITY,
        obj=target,
        actor=actor,
        changes={"is_active": {"before": True, "after": False}},
    )

    event.refresh_from_db()
    assert event.actor == actor
    assert event.category == "security"
    assert event.action == "account.disabled"
    assert event.object_type == "user"
    assert event.object_id == str(target.public_id)
    assert event.object_label == "sami@impactrisks.com"
    assert event.changes == {"is_active": {"before": True, "after": False}}
    assert event.at is not None


def test_an_event_is_a_business_event_unless_stated():
    assert audit.record(action="thing.done", actor=None).category == audit.BUSINESS == "business"


def test_an_object_without_a_public_id_is_identified_by_its_key():
    assignment = RoleAssignment.objects.create(user=make_user(), role="hr")

    event = audit.record(action="role.assigned", obj=assignment, actor=None)

    assert event.object_type == "roleassignment"
    assert event.object_id == str(assignment.pk)


def test_the_item_can_be_described_without_a_model_instance():
    event = audit.record(
        action="setting.changed", object_type="setting", object_id="lockout_minutes", object_label="lockout_minutes", actor=None
    )

    assert (event.object_type, event.object_id, event.object_label) == ("setting", "lockout_minutes", "lockout_minutes")


def test_explicit_item_fields_win_over_those_derived_from_the_instance():
    target = make_user("sami@impactrisks.com")

    event = audit.record(action="thing.done", obj=target, object_label="Sami Ben Ali", actor=None)

    assert event.object_label == "Sami Ben Ali"
    assert event.object_id == str(target.public_id)


def test_actor_address_and_reference_default_to_the_current_context():
    user = make_user()

    with context.overriding(actor=user, ip="10.0.0.9", request_id="rid-1"):
        event = audit.record(action="thing.done")

    assert event.actor == user
    assert event.ip_address == "10.0.0.9"
    assert event.request_id == "rid-1"


def test_none_means_the_system_even_inside_a_users_request():
    with context.overriding(actor=make_user()):
        event = audit.record(action="credit.posted", actor=None)

    assert event.actor is None


def test_outside_a_request_there_is_no_actor_and_no_address():
    event = audit.record(action="thing.done")

    assert event.actor is None
    assert event.ip_address is None
    assert event.request_id == ""


def test_an_address_that_is_not_an_ip_is_dropped():
    with context.overriding(ip="not-an-address"):
        assert audit.record(action="thing.done").ip_address is None


def test_a_long_label_is_cut_to_200_characters():
    event = audit.record(action="thing.done", object_type="x", object_id="1", object_label="n" * 500, actor=None)

    assert len(event.object_label) == 200


def test_changes_may_hold_dates_decimals_and_identifiers():
    identifier = uuid.uuid4()

    event = audit.record(
        action="thing.done", actor=None, changes={"day": date(2026, 10, 6), "amount": Decimal("2.5"), "id": identifier}
    )

    event.refresh_from_db()
    assert event.changes == {"day": "2026-10-06", "amount": "2.5", "id": str(identifier)}


def test_snapshot_reads_values_and_gives_keys_for_relations():
    creator = make_user()
    user = make_user("sami@impactrisks.com", created_by=creator)

    assert audit.snapshot(user, ["email", "is_active", "created_by"]) == {
        "email": "sami@impactrisks.com",
        "is_active": True,
        "created_by": creator.pk,
    }


def test_diff_keeps_only_what_changed():
    before = {"phone": "111", "address": "Tunis", "status": "active"}
    after = {"phone": "222", "address": "Tunis", "status": "archived"}

    assert audit.diff(before, after) == {
        "phone": {"before": "111", "after": "222"},
        "status": {"before": "active", "after": "archived"},
    }


def test_diff_never_copies_a_redacted_value():
    before = {"comment": "I have the flu", "days": 2, "note": "same"}
    after = {"comment": "I broke my arm", "days": 3, "note": "same"}

    result = audit.diff(before, after, redact=["comment", "note"])

    assert result == {"comment": {"changed": True}, "days": {"before": 2, "after": 3}}
    assert "flu" not in str(result)


def test_diff_sees_keys_present_on_one_side_only():
    assert audit.diff({"a": 1}, {"b": 2}) == {"a": {"before": 1, "after": None}, "b": {"before": None, "after": 2}}


def test_events_are_read_newest_first():
    first = audit.record(action="first", actor=None)
    second = audit.record(action="second", actor=None)

    assert list(AuditEvent.objects.all()) == [second, first]
```

`backend/apps/audit/tests/test_selectors.py`:

```python
from datetime import UTC, date, datetime, timedelta

import pytest
import time_machine

from apps.accounts.tests.world import make_user
from apps.audit import selectors
from apps.audit import services as audit
from apps.core import context

pytestmark = pytest.mark.django_db


def test_events_for_object_returns_the_history_of_one_item():
    sami = make_user("sami@impactrisks.com")
    other = make_user("other@impactrisks.com")
    kept = audit.record(action="account.created", obj=sami, actor=None)
    audit.record(action="account.created", obj=other, actor=None)

    assert list(selectors.events_for_object("user", str(sami.public_id))) == [kept]


def test_count_recent_counts_one_action_from_one_address_in_a_window():
    now = datetime(2026, 10, 6, 9, 0, tzinfo=UTC)
    with time_machine.travel(now - timedelta(minutes=30), tick=False), context.overriding(ip="10.0.0.9"):
        audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)  # too old
    with time_machine.travel(now - timedelta(minutes=5), tick=False):
        with context.overriding(ip="10.0.0.9"):
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)
            audit.record(action="auth.login", category=audit.SECURITY, actor=None)  # other action
        with context.overriding(ip="10.0.0.10"):
            audit.record(action="auth.login_failed", category=audit.SECURITY, actor=None)  # other address

    count = selectors.count_recent(
        action="auth.login_failed", ip_address="10.0.0.9", since=now - timedelta(minutes=15)
    )

    assert count == 2


def test_list_events_filters_by_category_actor_action_item_and_period():
    hr = make_user("hr@impactrisks.com")
    admin = make_user("admin@impactrisks.com")
    sami = make_user("sami@impactrisks.com")
    with time_machine.travel(datetime(2026, 10, 1, 22, 30, tzinfo=UTC), tick=False):  # 23:30 on 1 October in Tunis
        late = audit.record(action="employee.updated", obj=sami, actor=hr)
    with time_machine.travel(datetime(2026, 10, 1, 23, 30, tzinfo=UTC), tick=False):  # 00:30 on 2 October in Tunis
        after_midnight = audit.record(action="employee.archived", obj=sami, actor=hr)
    with time_machine.travel(datetime(2026, 10, 5, 9, 0, tzinfo=UTC), tick=False):
        security = audit.record(action="role.assigned", category=audit.SECURITY, obj=sami, actor=admin)

    business = selectors.list_events(category=audit.BUSINESS)
    assert list(business) == [after_midnight, late]
    assert list(selectors.list_events(category=audit.SECURITY)) == [security]
    assert list(selectors.list_events(category=audit.BUSINESS, action="employee.archived")) == [after_midnight]
    assert list(selectors.list_events(category=audit.BUSINESS, actor_public_id=admin.public_id)) == []
    assert list(selectors.list_events(category=audit.BUSINESS, actor_public_id=hr.public_id)) == [after_midnight, late]
    assert list(
        selectors.list_events(category=audit.BUSINESS, object_type="user", object_id=str(sami.public_id))
    ) == [after_midnight, late]
    assert list(selectors.list_events(category=audit.BUSINESS, object_type="request")) == []
    # days are days in Africa/Tunis
    assert list(selectors.list_events(category=audit.BUSINESS, date_to=date(2026, 10, 1))) == [late]
    assert list(selectors.list_events(category=audit.BUSINESS, date_from=date(2026, 10, 2))) == [after_midnight]
    assert list(
        selectors.list_events(category=audit.BUSINESS, date_from=date(2026, 10, 1), date_to=date(2026, 10, 2))
    ) == [after_midnight, late]
```

`backend/apps/audit/tests/test_append_only.py`:

```python
import pytest
from django.db import DatabaseError, connection, transaction

from apps.audit import services as audit
from apps.audit.models import AuditEvent
from tests.db import truncate_guards

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    return audit.record(action="thing.done", actor=None)


def test_an_event_cannot_be_updated(event):
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.filter(pk=event.pk).update(action="rewritten")

    event.refresh_from_db()
    assert event.action == "thing.done"


def test_saving_an_existing_event_again_is_refused(event):
    event.action = "rewritten"

    with pytest.raises(DatabaseError), transaction.atomic():
        event.save()


def test_an_event_cannot_be_deleted(event):
    with pytest.raises(DatabaseError), transaction.atomic():
        event.delete()
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.all().delete()

    assert AuditEvent.objects.filter(pk=event.pk).exists()


@pytest.mark.parametrize(
    "statement",
    ["UPDATE audit_auditevent SET action = 'rewritten'", "DELETE FROM audit_auditevent"],
)
def test_plain_sql_is_refused_too(event, statement):
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(statement)

    assert AuditEvent.objects.get(pk=event.pk).action == "thing.done"


def test_the_table_cannot_be_emptied(event):
    # The guard is switched off in the test database (see conftest.py); switch it on for this test.
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE audit_auditevent ENABLE TRIGGER audit_auditevent_no_truncate")

    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("TRUNCATE audit_auditevent")

    assert AuditEvent.objects.filter(pk=event.pk).exists()


def test_the_truncate_guard_exists():
    assert ("audit_auditevent", "audit_auditevent_no_truncate") in truncate_guards()


def test_events_can_still_be_added_and_read(event):
    audit.record(action="another.thing", actor=None)

    assert AuditEvent.objects.count() == 2
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/audit -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.audit.services'` (the package has no modules yet).

- [ ] **Step 3: Write the model and the app configuration**

`backend/apps/audit/apps.py`:

```python
from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "apps.audit"
    label = "audit"
```

`backend/apps/audit/models.py`:

```python
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    """One thing that happened. Rows are only ever added (AUD-01); database triggers enforce it."""

    class Category(models.TextChoices):
        BUSINESS = "business", "Business"
        SECURITY = "security", "Security"

    at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    category = models.CharField(max_length=10, choices=Category.choices)
    action = models.CharField(max_length=60)
    object_type = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_label = models.CharField(max_length=200, blank=True)
    changes = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=32, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        indexes = [
            models.Index(fields=["category", "-at"], name="audit_category_at"),
            models.Index(fields=["object_type", "object_id"], name="audit_object"),
            models.Index(fields=["action", "-at"], name="audit_action_at"),
        ]

    def __str__(self) -> str:
        return f"{self.at:%Y-%m-%d %H:%M} {self.action}"
```

- [ ] **Step 4: Write the services and the selectors**

`backend/apps/audit/services.py`:

```python
"""Writing the audit trail. Import as: `from apps.audit import services as audit` (master 6.5)."""

import enum
import ipaddress
from collections.abc import Iterable, Mapping
from typing import Any

from django.db import models

from apps.audit.models import AuditEvent
from apps.core import context

BUSINESS = AuditEvent.Category.BUSINESS.value
SECURITY = AuditEvent.Category.SECURITY.value


class Unset(enum.Enum):
    TOKEN = "unset"


UNSET = Unset.TOKEN


def _valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def record(
    *,
    action: str,
    category: str = BUSINESS,
    obj: models.Model | None = None,
    object_type: str = "",
    object_id: str = "",
    object_label: str = "",
    changes: Mapping[str, Any] | None = None,
    actor: Any = UNSET,
) -> AuditEvent:
    """Adds one event. `actor=None` means the system; left out, it is the current request's user."""
    if actor is UNSET:
        actor = context.current_actor()
    if obj is not None:
        object_type = object_type or obj._meta.model_name
        object_id = object_id or str(getattr(obj, "public_id", None) or obj.pk)
        object_label = object_label or str(obj)
    return AuditEvent.objects.create(
        actor=actor,
        category=category,
        action=action,
        object_type=object_type,
        object_id=object_id,
        object_label=object_label[:200],
        changes=dict(changes or {}),
        ip_address=_valid_ip(context.current_ip()),
        request_id=context.current_request_id()[:32],
    )


def snapshot(instance: models.Model, fields: Iterable[str]) -> dict[str, Any]:
    """The current values of `fields`; a relation is given by its key."""
    return {name: instance.serializable_value(name) for name in fields}


def diff(before: Mapping[str, Any], after: Mapping[str, Any], *, redact: Iterable[str] = ()) -> dict[str, dict]:
    """What changed between two snapshots. A redacted field is reported as changed, without its values."""
    hidden = set(redact)
    result: dict[str, dict] = {}
    for name in list(before) + [key for key in after if key not in before]:
        old, new = before.get(name), after.get(name)
        if old == new:
            continue
        result[name] = {"changed": True} if name in hidden else {"before": old, "after": new}
    return result
```

`backend/apps/audit/selectors.py`:

```python
"""Reading the audit trail."""

from datetime import date, datetime, time, timedelta

from django.db.models import QuerySet
from django.utils import timezone

from apps.audit.models import AuditEvent


def events_for_object(object_type: str, object_id: str) -> QuerySet[AuditEvent]:
    """The history of one item, newest first. Other apps use it for their history blocks."""
    return AuditEvent.objects.filter(object_type=object_type, object_id=object_id).select_related("actor")


def count_recent(*, action: str, ip_address: str, since: datetime) -> int:
    return AuditEvent.objects.filter(action=action, ip_address=ip_address, at__gte=since).count()


def _start_of(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min))


def list_events(
    *,
    category: str,
    actor_public_id=None,
    action: str = "",
    object_type: str = "",
    object_id: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
) -> QuerySet[AuditEvent]:
    """Events of one category, newest first. `date_from` and `date_to` are local days, both included."""
    events = AuditEvent.objects.filter(category=category).select_related("actor")
    if actor_public_id:
        events = events.filter(actor__public_id=actor_public_id)
    if action:
        events = events.filter(action=action)
    if object_type:
        events = events.filter(object_type=object_type)
    if object_id:
        events = events.filter(object_id=object_id)
    if date_from:
        events = events.filter(at__gte=_start_of(date_from))
    if date_to:
        events = events.filter(at__lt=_start_of(date_to + timedelta(days=1)))
    return events
```

- [ ] **Step 5: Register the app and generate the table migration**

In `backend/config/settings.py`, replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "apps.core",
    "apps.accounts",
    "apps.audit",
]
```

Run: `docker compose run --rm app python manage.py makemigrations audit`

Expected: `Migrations for 'audit':` with `apps/audit/migrations/0001_initial.py` listing `Create model AuditEvent`.

- [ ] **Step 6: Write the append-only migration**

`backend/apps/audit/migrations/0002_append_only.py`:

```python
"""The audit table accepts INSERT and SELECT only (AUD-01, master D8)."""

from django.db import migrations

CREATE_FUNCTION = """
CREATE FUNCTION audit_auditevent_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION USING
        MESSAGE = 'audit_auditevent is append-only: ' || TG_OP || ' is not allowed',
        ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql
"""

CREATE_ROW_TRIGGER = """
CREATE TRIGGER audit_auditevent_no_change
    BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION audit_auditevent_append_only()
"""

CREATE_TRUNCATE_TRIGGER = """
CREATE TRIGGER audit_auditevent_no_truncate
    BEFORE TRUNCATE ON audit_auditevent
    FOR EACH STATEMENT EXECUTE FUNCTION audit_auditevent_append_only()
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [
        migrations.RunSQL(
            sql=[CREATE_FUNCTION, CREATE_ROW_TRIGGER, CREATE_TRUNCATE_TRIGGER],
            reverse_sql=[
                "DROP TRIGGER audit_auditevent_no_truncate ON audit_auditevent",
                "DROP TRIGGER audit_auditevent_no_change ON audit_auditevent",
                "DROP FUNCTION audit_auditevent_append_only()",
            ],
        ),
    ]
```

- [ ] **Step 7: Let transactional tests flush the test database**

`backend/tests/db.py`:

```python
"""Database helpers for the test suite."""

from django.db import connection

_TRUNCATE_BIT = 32  # pg_trigger.tgtype flag of a TRUNCATE trigger


def truncate_guards() -> list[tuple[str, str]]:
    """Every (table, trigger) that blocks TRUNCATE: the audit trail now, the leave ledger from plan 04."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
            "WHERE NOT t.tgisinternal AND (t.tgtype & %s) <> 0 ORDER BY 1, 2",
            [_TRUNCATE_BIT],
        )
        return [(table, trigger) for table, trigger in cursor.fetchall()]


def disable_truncate_guards() -> None:
    """Django empties tables with TRUNCATE after a transactional test. Allow it in the test database only."""
    guards = truncate_guards()
    with connection.cursor() as cursor:
        for table, trigger in guards:
            cursor.execute(f'ALTER TABLE "{table}" DISABLE TRIGGER "{trigger}"')
```

Replace `backend/conftest.py` with:

```python
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Append-only tables stay protected against UPDATE and DELETE, but may be emptied between tests."""
    from tests.db import disable_truncate_guards

    with django_db_blocker.unblock():
        disable_truncate_guards()


@pytest.fixture(autouse=True)
def _fast_password_hashing(request, settings):
    """Argon2 is slow on purpose. Tests use a fast hasher unless marked `real_hasher`."""
    if request.node.get_closest_marker("real_hasher") is None:
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/audit -q`

Expected: PASS, no failures.

- [ ] **Step 9: Apply the migrations and check the guard by hand**

Run:

```powershell
docker compose run --rm app python manage.py migrate
docker compose run --rm app python manage.py shell -c "from apps.audit import services as a; from apps.audit.models import AuditEvent as E; a.record(action='manual.check', actor=None); print(E.objects.filter(action='manual.check').update(action='x'))"
```

Expected: `Applying audit.0001_initial... OK` and `Applying audit.0002_append_only... OK`. The second command ends with a traceback whose last line contains `audit_auditevent is append-only: UPDATE is not allowed`.

- [ ] **Step 10: Commit**

```bash
git add backend/apps/audit backend/tests/db.py backend/conftest.py backend/config/settings.py
git commit -m "feat(audit): append-only audit trail with record, snapshot and diff"
```

---

### Task 9: Roles, session authentication, the permission class and the standard cast

**Files:**
- Create: `backend/apps/accounts/roles.py`, `backend/apps/accounts/permissions.py`, `backend/apps/accounts/authentication.py`
- Create: `backend/apps/accounts/tests/urls_permissions.py`, `backend/tests/world.py`
- Modify: `backend/apps/accounts/tests/world.py`, `backend/conftest.py`, `backend/config/settings.py`
- Test: `backend/apps/accounts/tests/test_roles.py`, `backend/apps/accounts/tests/test_permissions.py`, `backend/tests/test_world.py`

**Interfaces:**
- Consumes: `User`, `RoleAssignment`, `make_user` (Task 6); `NotAllowed` (Task 4); the problem handler (Task 7).
- Produces (master 6.4, 6.8, 6.11):
  - `apps.accounts.roles`: `Role` (`EMPLOYEE`, `MANAGER`, `HR`, `EXEC`, `SYSADMIN`), `ASSIGNABLE`, `roles_of(user) -> frozenset[Role]`, `has_role(user, *roles) -> bool`, `register_derived_role_provider(fn)`, `unregister_derived_role_provider(fn)`, `clear_role_cache(user)`, `users_with_role(role) -> QuerySet[User]`, `workspaces_of(user) -> list[str]`, and the choice lists `ROLE_CHOICES`, `ASSIGNABLE_CHOICES`, `WORKSPACE_CHOICES`.
  - `apps.accounts.permissions`: `AUTHENTICATED`, `PUBLIC`, `RolePermission`, `GATE_EXEMPT_ROUTES`.
  - `apps.accounts.authentication.SessionAuth`: session cookie; CSRF enforced on every unsafe method, signed in or not; 401 with `WWW-Authenticate: Session` for an anonymous caller; `request.user` is the plain `User` instance.
  - The view convention: `access = {"GET": {Role.HR}, "POST": AUTHENTICATED}` and `http_method_names = ["get", "post"]` on every view class.
  - `backend/tests/world.py`: `World`, `build_world()`, `World.user_for(persona)`. Fixtures in `backend/conftest.py`: `world`, `client_for`, `anon_client`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/accounts/tests/urls_permissions.py`:

```python
"""A URL configuration used only by permission tests: one view per kind of access."""

from django.middleware.csrf import get_token
from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from apps.accounts.roles import Role


class OpenView(APIView):
    access = {"GET": PUBLIC, "POST": PUBLIC}
    http_method_names = ["get", "post"]

    def get(self, request):
        return Response({"csrf_token": get_token(request._request)})

    def post(self, request):
        return Response({"ok": True})


class SignedInView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    def get(self, request):
        return Response({"email": request.user.email, "user_class": type(request.user).__name__})


class HrView(APIView):
    access = {"GET": {Role.HR}, "POST": {Role.HR, Role.EXEC}}
    http_method_names = ["get", "post", "put"]

    def get(self, request):
        return Response({"ok": True})

    def post(self, request):
        return Response({"ok": True})

    def put(self, request):  # implemented, but not declared in `access`
        return Response({"ok": True})


class UndeclaredView(APIView):
    http_method_names = ["get"]

    def get(self, request):
        return Response({"ok": True})


urlpatterns = [
    path("open", OpenView.as_view(), name="open"),
    path("signed-in", SignedInView.as_view(), name="signed-in"),
    path("hr", HrView.as_view(), name="hr"),
    path("undeclared", UndeclaredView.as_view(), name="undeclared"),
]
```

`backend/apps/accounts/tests/test_roles.py`:

```python
import pytest
from django.contrib.auth.models import AnonymousUser

from apps.accounts import roles
from apps.accounts.models import ASSIGNABLE_ROLE_CHOICES, RoleAssignment
from apps.accounts.roles import ASSIGNABLE, Role, roles_of
from apps.accounts.tests.world import make_user

pytestmark = pytest.mark.django_db


@pytest.fixture
def derived_roles():
    """Registers a provider like the one plan 02 adds: everybody is an employee, `boss.*` are managers."""

    def provider(user):
        return [Role.EMPLOYEE, "manager"] if user.email.startswith("boss") else [Role.EMPLOYEE]

    roles.register_derived_role_provider(provider)
    yield
    roles.unregister_derived_role_provider(provider)


def test_a_role_is_a_plain_string():
    assert Role.HR == "hr"
    assert str(Role.SYSADMIN) == "sysadmin"
    assert sorted(Role) == ["employee", "exec", "hr", "manager", "sysadmin"]


def test_the_stored_choices_are_the_assignable_roles():
    assert {value for value, _ in ASSIGNABLE_ROLE_CHOICES} == {role.value for role in ASSIGNABLE}
    assert ASSIGNABLE == {Role.HR, Role.EXEC, Role.SYSADMIN}


def test_an_account_without_assignment_has_no_role():
    assert roles_of(make_user()) == frozenset()


def test_assigned_roles_are_returned():
    assert roles_of(make_user(roles=["hr", "exec"])) == {Role.HR, Role.EXEC}


def test_nobody_and_anonymous_have_no_role():
    assert roles_of(None) == frozenset()
    assert roles_of(AnonymousUser()) == frozenset()


def test_a_provider_adds_derived_roles(derived_roles):
    assert roles_of(make_user("sami@impactrisks.com")) == {Role.EMPLOYEE}
    assert roles_of(make_user("boss@impactrisks.com", roles=["exec"])) == {Role.EMPLOYEE, Role.MANAGER, Role.EXEC}


def test_registering_the_same_provider_twice_changes_nothing():
    def provider(user):
        return [Role.EMPLOYEE]

    roles.register_derived_role_provider(provider)
    roles.register_derived_role_provider(provider)
    try:
        assert roles._providers.count(provider) == 1
    finally:
        roles.unregister_derived_role_provider(provider)


def test_roles_are_read_once_per_user_object(django_assert_num_queries):
    user = make_user(roles=["hr"])

    with django_assert_num_queries(1):
        roles_of(user)
        roles_of(user)


def test_clearing_the_cache_forces_a_fresh_read():
    user = make_user()
    assert roles_of(user) == frozenset()
    RoleAssignment.objects.create(user=user, role="hr")

    assert roles_of(user) == frozenset()  # still the cached answer
    roles.clear_role_cache(user)
    assert roles_of(user) == {Role.HR}


def test_has_role_accepts_any_of_several():
    hr = make_user(roles=["hr"])

    assert roles.has_role(hr, Role.HR) is True
    assert roles.has_role(hr, Role.EXEC, Role.HR) is True
    assert roles.has_role(hr, Role.SYSADMIN) is False
    assert roles.has_role(None, Role.HR) is False


def test_users_with_role_lists_active_holders_only():
    first = make_user("a.admin@impactrisks.com", roles=["sysadmin"])
    make_user("b.disabled@impactrisks.com", roles=["sysadmin"], is_active=False)
    make_user("c.hr@impactrisks.com", roles=["hr"])

    assert list(roles.users_with_role(Role.SYSADMIN)) == [first]
    assert list(roles.users_with_role("hr").values_list("email", flat=True)) == ["c.hr@impactrisks.com"]


@pytest.mark.parametrize("role", [Role.EMPLOYEE, Role.MANAGER])
def test_users_with_role_refuses_a_derived_role(role):
    with pytest.raises(ValueError, match="derived"):
        roles.users_with_role(role)


def test_workspaces_follow_roles(derived_roles):
    assert roles.workspaces_of(make_user("sami@impactrisks.com")) == ["me"]
    assert roles.workspaces_of(make_user("boss@impactrisks.com")) == ["me", "team"]
    assert roles.workspaces_of(make_user("rh@impactrisks.com", roles=["hr", "exec"])) == ["me", "hr", "overview"]


def test_an_administrator_without_employee_record_has_only_administration():
    assert roles.workspaces_of(make_user(roles=["sysadmin"])) == ["admin"]
    assert roles.workspaces_of(make_user()) == []
```

`backend/apps/accounts/tests/test_permissions.py`:

```python
import logging

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.world import make_user

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.accounts.tests.urls_permissions")]


def signed_in(user, *, enforce_csrf=False) -> APIClient:
    client = APIClient(enforce_csrf_checks=enforce_csrf)
    client.force_login(user)
    return client


def test_a_public_endpoint_needs_no_session():
    assert APIClient().get("/open").status_code == 200


def test_an_anonymous_caller_is_asked_to_sign_in():
    response = APIClient().get("/signed-in")

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"
    assert response.json()["code"] == "core.not_authenticated"


def test_any_signed_in_account_passes_an_authenticated_endpoint():
    response = signed_in(make_user("sami@impactrisks.com")).get("/signed-in")

    assert response.status_code == 200
    assert response.json() == {"email": "sami@impactrisks.com", "user_class": "User"}


def test_a_role_endpoint_refuses_an_account_without_the_role():
    response = signed_in(make_user()).get("/hr")

    assert response.status_code == 403
    assert response.json()["code"] == "core.not_allowed"


def test_a_role_endpoint_accepts_a_holder():
    assert signed_in(make_user(roles=["hr"])).get("/hr").status_code == 200


def test_access_is_declared_per_method():
    executive = signed_in(make_user(roles=["exec"]))

    assert executive.get("/hr").status_code == 403
    assert executive.post("/hr", {}).status_code == 200


def test_a_method_that_is_not_declared_is_refused_even_if_the_view_has_it():
    assert signed_in(make_user(roles=["hr"])).put("/hr", {}).status_code == 403


def test_a_view_without_declaration_is_closed_and_reported(caplog):
    with caplog.at_level(logging.ERROR, logger="iris.permissions"):
        signed = signed_in(make_user(roles=["hr", "exec"])).get("/undeclared")
        anonymous = APIClient().get("/undeclared")

    assert signed.status_code == 403
    assert anonymous.status_code == 401
    assert any(getattr(record, "data", None) == {"view": "UndeclaredView"} for record in caplog.records)


def test_a_disabled_account_loses_its_session_at_once():
    user = make_user()
    client = signed_in(user)
    assert client.get("/signed-in").status_code == 200

    user.is_active = False
    user.save(update_fields=["is_active"])

    assert client.get("/signed-in").status_code == 401


def test_until_the_password_is_changed_everything_but_public_pages_is_closed():
    client = signed_in(make_user(must_change_password=True, roles=["hr"]))

    blocked = client.get("/signed-in")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "auth.password_change_required"
    assert client.get("/hr").json()["code"] == "auth.password_change_required"
    assert client.get("/open").status_code == 200


def test_an_unsafe_call_needs_the_csrf_token_even_without_a_session():
    client = APIClient(enforce_csrf_checks=True)

    refused = client.post("/open", {})
    assert refused.status_code == 403
    assert refused.json()["code"] == "auth.csrf_failed"

    token = client.get("/open").json()["csrf_token"]
    assert client.post("/open", {}, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_an_unsafe_call_needs_the_csrf_token_with_a_session_too():
    client = signed_in(make_user(roles=["hr"]), enforce_csrf=True)

    assert client.post("/hr", {}).json()["code"] == "auth.csrf_failed"

    token = client.get("/open").json()["csrf_token"]
    assert client.post("/hr", {}, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_a_wrong_csrf_token_is_refused():
    client = APIClient(enforce_csrf_checks=True)
    client.get("/open")

    assert client.post("/open", {}, HTTP_X_CSRFTOKEN="x" * 64).status_code == 403


def test_safe_calls_need_no_token():
    client = signed_in(make_user(), enforce_csrf=True)

    assert client.get("/signed-in").status_code == 200
```

`backend/tests/test_world.py`:

```python
import pytest

from apps.accounts.roles import Role, roles_of
from apps.accounts.tests.world import PASSWORD


def test_the_cast_holds_the_accounts_of_the_master_plan(world):
    assert roles_of(world.sysadmin_user) == {Role.SYSADMIN}
    assert roles_of(world.exec_user) >= {Role.EXEC}
    assert roles_of(world.hr_user) >= {Role.HR}
    emails = {
        "sysadmin_user": "sysadmin@impactrisks.com",
        "exec_user": "ceo@impactrisks.com",
        "hr_user": "hr@impactrisks.com",
        "manager_user": "manager.a@impactrisks.com",
        "owner_user": "employee.a1@impactrisks.com",
        "peer_user": "employee.a2@impactrisks.com",
        "other_manager_user": "manager.b@impactrisks.com",
        "outsider_user": "employee.b1@impactrisks.com",
    }
    for attribute, email in emails.items():
        user = getattr(world, attribute)
        assert user.email == email
        assert user.check_password(PASSWORD)
        assert user.must_change_password is False


@pytest.mark.parametrize(
    "persona",
    ["owner", "peer", "manager", "other_manager", "outsider", "hr", "exec", "sysadmin"],
)
def test_user_for_returns_the_account_of_a_persona(world, persona):
    assert world.user_for(persona) is getattr(world, f"{persona}_user")


def test_the_anonymous_persona_has_no_account(world):
    assert world.user_for("anon") is None


@pytest.mark.urls("apps.accounts.tests.urls_permissions")
def test_the_client_fixtures_sign_in_or_stay_anonymous(world, client_for, anon_client):
    assert client_for(world.hr_user).get("/signed-in").json()["email"] == "hr@impactrisks.com"
    assert anon_client.get("/signed-in").status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts/tests/test_roles.py apps/accounts/tests/test_permissions.py tests/test_world.py -q`

Expected: FAIL. The two accounts files fail during collection with `ModuleNotFoundError: No module named 'apps.accounts.roles'` (and `apps.accounts.permissions`); `tests/test_world.py` fails with `fixture 'world' not found`.

- [ ] **Step 3: Write `backend/apps/accounts/roles.py`**

```python
"""The five roles (PRD section 3). HR, EXEC and SYSADMIN are assigned; EMPLOYEE and MANAGER are derived."""

from collections.abc import Callable, Iterable
from enum import StrEnum

from django.contrib.auth import get_user_model
from django.db.models import QuerySet


class Role(StrEnum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    EXEC = "exec"
    SYSADMIN = "sysadmin"


ASSIGNABLE = frozenset({Role.HR, Role.EXEC, Role.SYSADMIN})

# A workspace is offered to the holders of one role (UI section 3.1). The order is the display order.
WORKSPACES = (
    ("me", Role.EMPLOYEE),
    ("team", Role.MANAGER),
    ("hr", Role.HR),
    ("overview", Role.EXEC),
    ("admin", Role.SYSADMIN),
)

# Choice lists for serializers and for the OpenAPI enum names.
ROLE_CHOICES = [(role.value, role.value) for role in Role]
ASSIGNABLE_CHOICES = [(role.value, role.value) for role in (Role.HR, Role.EXEC, Role.SYSADMIN)]
WORKSPACE_CHOICES = [(workspace, workspace) for workspace, _ in WORKSPACES]

_CACHE_ATTRIBUTE = "_iris_roles"
_providers: list[Callable[[object], Iterable[Role | str]]] = []


def register_derived_role_provider(fn: Callable[[object], Iterable[Role | str]]) -> None:
    """`fn(user)` returns the roles it derives for that user. The organisation app registers one in plan 02."""
    if fn not in _providers:
        _providers.append(fn)


def unregister_derived_role_provider(fn: Callable[[object], Iterable[Role | str]]) -> None:
    if fn in _providers:
        _providers.remove(fn)


def roles_of(user) -> frozenset[Role]:
    """Assigned roles plus derived ones. Computed once per user object, that is once per request."""
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    cached = getattr(user, _CACHE_ATTRIBUTE, None)
    if cached is not None:
        return cached
    held = {Role(value) for value in user.role_assignments.values_list("role", flat=True)}
    for provider in _providers:
        held.update(Role(value) for value in provider(user))
    result = frozenset(held)
    setattr(user, _CACHE_ATTRIBUTE, result)
    return result


def clear_role_cache(user) -> None:
    """Call after changing a user's assignments when the same user object is used again."""
    if getattr(user, _CACHE_ATTRIBUTE, None) is not None:
        delattr(user, _CACHE_ATTRIBUTE)


def has_role(user, *wanted: Role) -> bool:
    return bool(roles_of(user) & set(wanted))


def users_with_role(role: Role | str) -> QuerySet:
    """Active accounts holding an assignable role, ordered by email."""
    role = Role(role)
    if role not in ASSIGNABLE:
        raise ValueError(f"{role.value} is a derived role: it is not assigned to accounts")
    return get_user_model().objects.filter(is_active=True, role_assignments__role=role.value).distinct()


def workspaces_of(user) -> list[str]:
    held = roles_of(user)
    return [workspace for workspace, role in WORKSPACES if role in held]
```

- [ ] **Step 4: Write `backend/apps/accounts/authentication.py` and `backend/apps/accounts/permissions.py`**

`backend/apps/accounts/authentication.py`:

```python
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

from apps.core.errors import NotAllowed


class SessionAuth(SessionAuthentication):
    """Server-side session in a cookie (PRD 9.3). No token is ever handed to the browser's storage."""

    def authenticate(self, request):
        # CSRF is checked on every unsafe call, signed in or not, so that sign-in itself is protected.
        if request.method not in SAFE_METHODS:
            self.enforce_csrf(request)
        user = getattr(request._request, "user", None)
        if user is None or not user.is_authenticated or not user.is_active:
            return None
        return (getattr(user, "_wrapped", user), None)  # hand views the plain User, not Django's lazy wrapper

    def enforce_csrf(self, request):
        try:
            super().enforce_csrf(request)
        except PermissionDenied as exc:
            raise NotAllowed("auth.csrf_failed") from exc

    def authenticate_header(self, request):
        # With this header DRF answers 401, not 403, to a caller without a session (master D14).
        return "Session"
```

`backend/apps/accounts/permissions.py`:

```python
"""Every endpoint declares who may call it (master 6.4). An undeclared view or method is closed."""

import logging

from rest_framework.permissions import BasePermission

from apps.accounts.roles import roles_of
from apps.core.errors import NotAllowed

logger = logging.getLogger("iris.permissions")

AUTHENTICATED = "authenticated"
PUBLIC = "public"

# Reachable while the user still has to choose a password (ACC-05).
GATE_EXEMPT_ROUTES = frozenset({"accounts:me", "accounts:password", "accounts:logout", "accounts:csrf"})


def _route_name(request) -> str:
    match = getattr(request, "resolver_match", None)
    return match.view_name if match is not None else ""


class RolePermission(BasePermission):
    """Reads `view.access`: {"GET": {Role.HR, Role.EXEC}, "POST": AUTHENTICATED, ...}."""

    def has_permission(self, request, view) -> bool:
        access = getattr(view, "access", None)
        if access is None:
            logger.error("view declares no access", extra={"data": {"view": type(view).__name__}})
            return False
        allowed = access.get(request.method)
        if allowed is None:
            return False
        if allowed == PUBLIC:
            return True
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        if user.must_change_password and _route_name(request) not in GATE_EXEMPT_ROUTES:
            raise NotAllowed("auth.password_change_required")
        if allowed == AUTHENTICATED:
            return True
        return bool(roles_of(user) & frozenset(allowed))
```

- [ ] **Step 5: Make them the defaults**

In `backend/config/settings.py`, replace the `REST_FRAMEWORK` block with:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.SessionAuth"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.accounts.permissions.RolePermission"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}
```

- [ ] **Step 6: Build the standard cast and its fixtures**

Replace `backend/apps/accounts/tests/world.py` with:

```python
"""Builders for accounts. Used by this app's tests and by the standard cast (backend/tests/world.py)."""

import itertools

from apps.accounts.models import RoleAssignment, User

PASSWORD = "Correct-Horse-42!"

_sequence = itertools.count(1)


def _name_from(email: str) -> str:
    return email.split("@")[0].replace(".", " ").title()


def make_user(email=None, *, password=PASSWORD, full_name=None, roles=(), **extra) -> User:
    address = email or f"person{next(_sequence)}@impactrisks.com"
    name = _name_from(address) if full_name is None else full_name
    user = User.objects.create_user(address, password, full_name=name, **extra)
    for role in roles:
        RoleAssignment.objects.create(user=user, role=str(role))
    return user


def build(world) -> None:
    """The accounts of the standard cast (master 6.11). Later plans attach employee records to them."""
    world.sysadmin_user = make_user("sysadmin@impactrisks.com", full_name="Sonia Admin", roles=["sysadmin"])
    world.exec_user = make_user("ceo@impactrisks.com", full_name="Karim Directeur", roles=["exec"])
    world.hr_user = make_user("hr@impactrisks.com", full_name="Senna RH", roles=["hr"])
    world.manager_user = make_user("manager.a@impactrisks.com", full_name="Mounir Manager")
    world.owner_user = make_user("employee.a1@impactrisks.com", full_name="Amal Employee")
    world.peer_user = make_user("employee.a2@impactrisks.com", full_name="Bilel Employee")
    world.other_manager_user = make_user("manager.b@impactrisks.com", full_name="Nadia Manager")
    world.outsider_user = make_user("employee.b1@impactrisks.com", full_name="Chokri Employee")
```

`backend/tests/world.py`:

```python
"""The standard cast used by tests across apps (master 6.11). Each plan adds one line to build_world()."""

from types import SimpleNamespace

from apps.accounts.tests import world as accounts_world


class World(SimpleNamespace):
    def user_for(self, persona):
        """The account of a persona of the permission matrix ("owner", "hr", ...); None for "anon"."""
        key = str(getattr(persona, "value", persona))
        if key == "anon":
            return None
        return getattr(self, f"{key}_user")


def build_world() -> World:
    world = World()
    accounts_world.build(world)
    return world
```

Replace `backend/conftest.py` with:

```python
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Append-only tables stay protected against UPDATE and DELETE, but may be emptied between tests."""
    from tests.db import disable_truncate_guards

    with django_db_blocker.unblock():
        disable_truncate_guards()


@pytest.fixture(autouse=True)
def _fast_password_hashing(request, settings):
    """Argon2 is slow on purpose. Tests use a fast hasher unless marked `real_hasher`."""
    if request.node.get_closest_marker("real_hasher") is None:
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def world(db):
    """The standard cast (master 6.11)."""
    from tests.world import build_world

    return build_world()


@pytest.fixture
def anon_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def client_for():
    """`client_for(user)` returns an API client signed in as that user."""
    from rest_framework.test import APIClient

    def build(user):
        client = APIClient()
        client.force_login(user)
        return client

    return build
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts tests/test_world.py apps/core -q`

Expected: PASS, no failures. (`apps/core` is included because the DRF defaults changed; its probe view sets its own classes and must be unaffected.)

- [ ] **Step 8: Commit**

```bash
git add backend/apps/accounts backend/tests/world.py backend/tests/test_world.py backend/conftest.py backend/config/settings.py
git commit -m "feat(accounts): roles, session authentication, role permission and the standard test cast"
```

---

### Task 10: Settings: registry, typed values, cache and services

**Files:**
- Create: `backend/apps/settings/__init__.py` (empty), `backend/apps/settings/apps.py`, `backend/apps/settings/models.py`, `backend/apps/settings/registry.py`, `backend/apps/settings/defaults.py`, `backend/apps/settings/services.py`, `backend/apps/settings/messages.py`
- Create: `backend/apps/settings/migrations/0001_initial.py` (generated)
- Create: `backend/apps/settings/tests/__init__.py` (empty), `backend/apps/settings/tests/world.py`
- Modify: `backend/conftest.py`, `backend/config/settings.py`
- Test: `backend/apps/settings/tests/test_registry.py`, `backend/apps/settings/tests/test_services.py`

**Interfaces:**
- Consumes: `Role`, `has_role` (Task 9); `audit.record` (Task 8); `display_name` (Task 6); `DomainError`, `NotAllowed`, `NotFound` (Task 4); the `world` fixture (Task 9).
- Produces (master 6.7):
  - `apps.settings.registry`: `SettingDef(key, group, kind, default, minimum=None, maximum=None, choices=None)`, `register(defn)`, `get_def(key)`, `defs_for(group)`, `GROUPS = ("hr", "system")`. Kinds: `int`, `decimal`, `bool`, `weekdays`, `str_list`, `int_or_null`, `date_or_null`. `minimum` and `maximum` are given together or not at all. `choices` (for `str_list` only) limits the allowed strings.
  - `apps.settings.services` (import as `from apps.settings import services as settings_service`): `get(key) -> Any` (typed: `Decimal` for `decimal`, `date | None` for `date_or_null`), `set_value(*, actor, key, value) -> Setting`, `list_group(group) -> list[SettingRow]`, `row_for(key) -> SettingRow`, `clear_cache()`.
  - The seven system settings of master 6.7, registered at start-up.
  - Error codes `settings.unknown_key` (404), `settings.invalid_value`, `settings.out_of_range` (params `minimum`, `maximum`), all on field `value` except the first (field `key`).
  - Test-only HR settings (`apps.settings.tests.world.TEST_HR_FLAG` and four others), because no HR setting exists before plan 03a.

- [ ] **Step 1: Write the failing tests**

`backend/apps/settings/tests/world.py`:

```python
"""Settings that exist only in the test suite: no HR setting is registered before plan 03a."""

from decimal import Decimal

from apps.settings.registry import SettingDef, register

TEST_HR_FLAG = "test_hr_flag"

TEST_DEFS = [
    SettingDef(TEST_HR_FLAG, "hr", "bool", False),
    SettingDef("test_hr_rate", "hr", "decimal", Decimal("2.5"), Decimal("0"), Decimal("10")),
    SettingDef("test_hr_days", "hr", "weekdays", [1, 2, 3, 4, 5]),
    SettingDef("test_hr_start", "hr", "date_or_null", None),
    SettingDef("test_hr_cutoff", "hr", "int_or_null", None, 1, 28),
]

for _definition in TEST_DEFS:
    register(_definition)
```

`backend/apps/settings/tests/test_registry.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from apps.core.errors import DomainError, NotFound
from apps.settings import registry
from apps.settings.registry import SettingDef

TYPES = ("pdf", "jpg", "png")


def definition(kind, default, minimum=None, maximum=None, choices=None) -> SettingDef:
    return SettingDef("sample", "hr", kind, default, minimum, maximum, choices)


INT = definition("int", 5, 1, 10)
BOOL = definition("bool", False)
RATE = definition("decimal", Decimal("2.5"), 0, 10)
DAYS = definition("weekdays", [1, 2, 3, 4, 5])
KINDS = definition("str_list", ["pdf"], choices=TYPES)
WORDS = definition("str_list", [])
CUTOFF = definition("int_or_null", None, 1, 28)
START = definition("date_or_null", None)


@pytest.mark.parametrize(
    ("defn", "raw", "stored"),
    [
        (INT, 7, 7),
        (BOOL, True, True),
        (RATE, "3.50", "3.5"),
        (RATE, 2, "2"),
        (RATE, "2,5", "2.5"),
        (RATE, Decimal("10"), "10"),
        (DAYS, [5, 1, 3], [1, 3, 5]),
        (KINDS, ["PDF", " jpg "], ["pdf", "jpg"]),
        (WORDS, [], []),
        (CUTOFF, None, None),
        (CUTOFF, 25, 25),
        (START, None, None),
        (START, "2026-11-01", "2026-11-01"),
        (START, date(2026, 11, 1), "2026-11-01"),
    ],
)
def test_a_valid_value_is_normalised_for_storage(defn, raw, stored):
    assert registry.to_storage(defn, raw) == stored


@pytest.mark.parametrize(
    ("defn", "raw"),
    [
        (INT, "7"),
        (INT, True),
        (INT, 7.5),
        (INT, None),
        (BOOL, 1),
        (BOOL, "true"),
        (RATE, "abc"),
        (RATE, True),
        (RATE, None),
        (RATE, "NaN"),
        (DAYS, []),
        (DAYS, [0]),
        (DAYS, [8]),
        (DAYS, [1, 1]),
        (DAYS, "12345"),
        (DAYS, [1, "2"]),
        (KINDS, ["exe"]),
        (KINDS, []),
        (KINDS, "pdf"),
        (KINDS, ["pdf", "PDF"]),
        (WORDS, [""]),
        (WORDS, [3]),
        (CUTOFF, "3"),
        (CUTOFF, False),
        (START, "01/11/2026"),
        (START, 20261101),
        (START, "2026-13-01"),
    ],
)
def test_a_value_of_the_wrong_shape_is_refused(defn, raw):
    with pytest.raises(DomainError) as error:
        registry.to_storage(defn, raw)

    assert error.value.code == "settings.invalid_value"
    assert error.value.field == "value"


@pytest.mark.parametrize(
    ("defn", "raw"),
    [(INT, 0), (INT, 11), (RATE, "10.5"), (RATE, -1), (CUTOFF, 0), (CUTOFF, 29)],
)
def test_a_value_outside_the_range_is_refused(defn, raw):
    with pytest.raises(DomainError) as error:
        registry.to_storage(defn, raw)

    assert error.value.code == "settings.out_of_range"
    assert error.value.field == "value"
    assert error.value.params == {"minimum": defn.minimum, "maximum": defn.maximum}


def test_stored_values_come_back_typed():
    assert registry.to_python(RATE, "3.5") == Decimal("3.5")
    assert registry.to_python(START, "2026-11-01") == date(2026, 11, 1)
    assert registry.to_python(START, None) is None
    assert registry.to_python(INT, 7) == 7
    assert registry.to_python(DAYS, [1, 3]) == [1, 3]


@pytest.mark.parametrize(
    "bad",
    [
        SettingDef("x", "finance", "int", 1),
        SettingDef("x", "hr", "colour", 1),
        SettingDef("x", "hr", "int", "five"),
        SettingDef("x", "hr", "int", 50, 1, 10),
        SettingDef("x", "hr", "int", 5, 1),
        SettingDef("x", "hr", "int", 5, None, 10),
        SettingDef("x", "hr", "int", 5, choices=("a",)),
    ],
)
def test_a_wrong_definition_is_refused_at_start_up(bad):
    with pytest.raises(ValueError):
        registry.register(bad)


def test_registering_the_same_definition_again_is_accepted_but_not_a_different_one():
    registry.register(SettingDef("lockout_threshold", "system", "int", 5, 3, 20))

    with pytest.raises(ValueError, match="lockout_threshold"):
        registry.register(SettingDef("lockout_threshold", "system", "int", 6, 3, 20))


def test_an_unknown_key_is_not_found():
    with pytest.raises(NotFound) as error:
        registry.get_def("no_such_setting")

    assert error.value.code == "settings.unknown_key"
    assert error.value.field == "key"


def test_the_system_settings_of_the_master_plan_are_registered():
    system = registry.defs_for("system")

    assert [(d.key, d.kind, d.default) for d in system] == [
        ("session_timeout_minutes", "int", 120),
        ("lockout_threshold", "int", 5),
        ("lockout_minutes", "int", 15),
        ("login_ip_max_attempts", "int", 20),
        ("temp_password_hours", "int", 24),
        ("upload_max_mb", "int", 10),
        ("upload_allowed_types", "str_list", ["pdf", "jpg", "png"]),
    ]
    assert all(d.group == "system" for d in system)
```

`backend/apps/settings/tests/test_services.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotAllowed
from apps.settings import services as settings_service
from apps.settings.models import Setting
from apps.settings.tests.world import TEST_HR_FLAG

pytestmark = pytest.mark.django_db


def test_a_setting_has_its_default_until_someone_changes_it():
    assert settings_service.get("session_timeout_minutes") == 120
    assert settings_service.get("lockout_threshold") == 5
    assert settings_service.get("upload_allowed_types") == ["pdf", "jpg", "png"]
    assert settings_service.get("test_hr_rate") == Decimal("2.5")
    assert settings_service.get("test_hr_start") is None
    assert settings_service.get(TEST_HR_FLAG) is False


def test_a_changed_value_is_returned_with_its_type(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=3)
    settings_service.set_value(actor=world.hr_user, key="test_hr_rate", value="3.50")
    settings_service.set_value(actor=world.hr_user, key="test_hr_start", value="2026-11-01")
    settings_service.set_value(actor=world.hr_user, key="test_hr_days", value=[7, 1, 2])

    assert settings_service.get("lockout_threshold") == 3
    assert settings_service.get("test_hr_rate") == Decimal("3.5")
    assert settings_service.get("test_hr_start") == date(2026, 11, 1)
    assert settings_service.get("test_hr_days") == [1, 2, 7]


def test_an_optional_value_can_be_emptied_again(world):
    settings_service.set_value(actor=world.hr_user, key="test_hr_cutoff", value=25)
    assert settings_service.get("test_hr_cutoff") == 25

    settings_service.set_value(actor=world.hr_user, key="test_hr_cutoff", value=None)
    assert settings_service.get("test_hr_cutoff") is None


def test_every_change_is_audited_with_the_previous_and_the_new_value(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=30)
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=45)
    settings_service.set_value(actor=world.hr_user, key=TEST_HR_FLAG, value=True)

    second, first = AuditEvent.objects.filter(object_id="lockout_minutes")
    assert (first.action, first.category, first.object_type) == ("setting.changed", "security", "setting")
    assert first.actor == world.sysadmin_user
    assert first.changes == {"value": {"before": 15, "after": 30}}
    assert second.changes == {"value": {"before": 30, "after": 45}}
    hr_event = AuditEvent.objects.get(object_id=TEST_HR_FLAG)
    assert hr_event.category == "business"
    assert hr_event.actor == world.hr_user
    assert hr_event.changes == {"value": {"before": False, "after": True}}


def test_the_row_records_who_changed_it_and_when(world):
    row = settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=20)

    assert row.updated_by == world.sysadmin_user
    assert row.updated_at is not None
    assert Setting.objects.get(key="upload_max_mb").value == {"v": 20}


@pytest.mark.parametrize(
    ("persona", "key", "value"),
    [
        ("hr", "lockout_threshold", 6),
        ("exec", "lockout_threshold", 6),
        ("owner", "lockout_threshold", 6),
        ("sysadmin", TEST_HR_FLAG, True),
        ("exec", TEST_HR_FLAG, True),
        ("owner", TEST_HR_FLAG, True),
    ],
)
def test_only_the_role_that_owns_a_group_can_change_it(world, persona, key, value):
    with pytest.raises(NotAllowed):
        settings_service.set_value(actor=world.user_for(persona), key=key, value=value)

    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


@pytest.mark.parametrize(
    ("key", "value", "code"),
    [
        ("lockout_threshold", "many", "settings.invalid_value"),
        ("lockout_threshold", True, "settings.invalid_value"),
        ("lockout_threshold", 2, "settings.out_of_range"),
        ("lockout_threshold", 500, "settings.out_of_range"),
        ("upload_allowed_types", ["exe"], "settings.invalid_value"),
        ("no_such_setting", 1, "settings.unknown_key"),
    ],
)
def test_a_wrong_value_is_refused_and_the_old_value_stays(world, key, value, code):
    with pytest.raises(DomainError) as error:
        settings_service.set_value(actor=world.sysadmin_user, key=key, value=value)

    assert error.value.code == code
    assert settings_service.get("lockout_threshold") == 5
    assert settings_service.get("upload_allowed_types") == ["pdf", "jpg", "png"]
    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


def test_values_are_cached_for_thirty_seconds(monkeypatch):
    clock = {"now": 1000.0}
    monkeypatch.setattr(settings_service, "_clock", lambda: clock["now"])
    assert settings_service.get("lockout_minutes") == 15
    Setting.objects.create(key="lockout_minutes", value={"v": 45})  # as if another process had changed it

    clock["now"] += 29
    assert settings_service.get("lockout_minutes") == 15
    clock["now"] += 2
    assert settings_service.get("lockout_minutes") == 45


def test_clear_cache_forces_a_fresh_read():
    assert settings_service.get("lockout_minutes") == 15
    Setting.objects.create(key="lockout_minutes", value={"v": 45})

    settings_service.clear_cache()

    assert settings_service.get("lockout_minutes") == 45


def test_a_corrupt_stored_value_falls_back_to_the_default():
    Setting.objects.create(key="lockout_threshold", value={"v": "many"})

    assert settings_service.get("lockout_threshold") == 5


def test_list_group_describes_every_setting_of_the_group(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=6)

    rows = settings_service.list_group("system")

    assert [row.key for row in rows] == [
        "session_timeout_minutes",
        "lockout_threshold",
        "lockout_minutes",
        "login_ip_max_attempts",
        "temp_password_hours",
        "upload_max_mb",
        "upload_allowed_types",
    ]
    untouched, changed = rows[0], rows[1]
    assert (untouched.kind, untouched.value, untouched.default) == ("int", 120, 120)
    assert (untouched.minimum, untouched.maximum) == (5, 1440)
    assert untouched.updated_by_name is None
    assert untouched.updated_at is None
    assert (changed.value, changed.default) == (6, 5)
    assert changed.updated_by_name == "Sonia Admin"
    assert changed.updated_at is not None
    assert rows[6].choices == ["pdf", "jpg", "png"]
    assert rows[0].choices is None


def test_decimals_and_dates_are_listed_in_their_stored_form(world):
    rows = {row.key: row for row in settings_service.list_group("hr")}

    rate = rows["test_hr_rate"]
    assert (rate.kind, rate.value, rate.default, rate.minimum, rate.maximum) == ("decimal", "2.5", "2.5", "0", "10")
    assert rows["test_hr_start"].value is None
    assert rows["test_hr_days"].value == [1, 2, 3, 4, 5]


def test_row_for_returns_one_described_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=20)

    row = settings_service.row_for("upload_max_mb")

    assert (row.key, row.value, row.default) == ("upload_max_mb", 20, 10)


def test_an_unknown_group_is_a_programming_error():
    with pytest.raises(ValueError):
        settings_service.list_group("finance")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/settings -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.settings.registry'`.

- [ ] **Step 3: Write the registry**

`backend/apps/settings/registry.py`:

```python
"""Which settings exist, of which kind, and what values they accept (master 6.7)."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.core.errors import DomainError, NotFound

GROUPS = ("hr", "system")
KINDS = ("int", "decimal", "bool", "weekdays", "str_list", "int_or_null", "date_or_null")


@dataclass(frozen=True)
class SettingDef:
    key: str
    group: str  # "hr" (changed by HR) or "system" (changed by the System Administrator)
    kind: str
    default: Any
    minimum: Any = None
    maximum: Any = None
    choices: tuple[str, ...] | None = None  # str_list only: the strings that are accepted


_defs: dict[str, SettingDef] = {}


def _invalid() -> DomainError:
    return DomainError("settings.invalid_value", field="value")


def _check_range(defn: SettingDef, value: Any) -> None:
    if defn.minimum is None:
        return
    if value < defn.minimum or value > defn.maximum:
        raise DomainError("settings.out_of_range", field="value", minimum=defn.minimum, maximum=defn.maximum)


def _whole_number(defn: SettingDef, raw: Any) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise _invalid()
    _check_range(defn, raw)
    return raw


def to_storage(defn: SettingDef, raw: Any) -> Any:
    """Validates `raw` and returns the JSON form that is stored. Raises DomainError on a bad value."""
    kind = defn.kind
    if kind == "bool":
        if not isinstance(raw, bool):
            raise _invalid()
        return raw
    if kind == "int":
        return _whole_number(defn, raw)
    if kind == "int_or_null":
        return None if raw is None else _whole_number(defn, raw)
    if kind == "decimal":
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str, Decimal)):
            raise _invalid()
        try:
            value = Decimal(str(raw).strip().replace(",", "."))
        except InvalidOperation:
            raise _invalid() from None
        if not value.is_finite():
            raise _invalid()
        _check_range(defn, value)
        return format(value.normalize(), "f")
    if kind == "weekdays":
        if not isinstance(raw, list) or not raw:
            raise _invalid()
        if any(isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7 for day in raw):
            raise _invalid()
        if len(set(raw)) != len(raw):
            raise _invalid()
        return sorted(raw)
    if kind == "str_list":
        if not isinstance(raw, list) or any(not isinstance(item, str) or not item.strip() for item in raw):
            raise _invalid()
        values = [item.strip().lower() for item in raw]
        if len(set(values)) != len(values):
            raise _invalid()
        if defn.choices is not None and (not values or any(value not in defn.choices for value in values)):
            raise _invalid()
        return values
    if kind == "date_or_null":
        if raw is None:
            return None
        if isinstance(raw, date) and not isinstance(raw, datetime):
            return raw.isoformat()
        if isinstance(raw, str):
            try:
                return date.fromisoformat(raw.strip()).isoformat()
            except ValueError:
                raise _invalid() from None
        raise _invalid()
    raise ValueError(f"Unknown setting kind: {kind}")


def to_python(defn: SettingDef, stored: Any) -> Any:
    """The typed value services work with: Decimal for decimals, date for dates."""
    if stored is None:
        return None
    if defn.kind == "decimal":
        return Decimal(stored)
    if defn.kind == "date_or_null":
        return date.fromisoformat(stored)
    if isinstance(stored, list):
        return list(stored)
    return stored


def register(defn: SettingDef) -> None:
    """Called from an app's AppConfig.ready(). A wrong definition stops the process at start-up."""
    if defn.group not in GROUPS:
        raise ValueError(f"{defn.key}: unknown group {defn.group!r}")
    if defn.kind not in KINDS:
        raise ValueError(f"{defn.key}: unknown kind {defn.kind!r}")
    if (defn.minimum is None) != (defn.maximum is None):
        raise ValueError(f"{defn.key}: give both a minimum and a maximum, or neither")
    if defn.choices is not None and defn.kind != "str_list":
        raise ValueError(f"{defn.key}: choices apply to str_list settings only")
    existing = _defs.get(defn.key)
    if existing is not None and existing != defn:
        raise ValueError(f"Setting registered twice with different definitions: {defn.key}")
    try:
        to_storage(defn, defn.default)
    except DomainError as exc:
        raise ValueError(f"{defn.key}: the default value is not valid ({exc.code})") from exc
    _defs[defn.key] = defn


def get_def(key: str) -> SettingDef:
    try:
        return _defs[key]
    except KeyError:
        raise NotFound("settings.unknown_key", field="key", key=key) from None


def defs_for(group: str) -> list[SettingDef]:
    """The definitions of one group, in registration order."""
    return [defn for defn in _defs.values() if defn.group == group]
```

- [ ] **Step 4: Write the model, the defaults, the messages and the app configuration**

`backend/apps/settings/models.py`:

```python
from django.conf import settings
from django.db import models
from django.utils import timezone


class Setting(models.Model):
    """One changed setting. A key without a row has its registered default."""

    key = models.CharField(max_length=60, unique=True)
    value = models.JSONField(default=dict)  # always {"v": <value>}, so that an empty value is stored too
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key
```

`backend/apps/settings/defaults.py`:

```python
"""The system settings (ADM-06). HR settings are registered by the apps that use them, from plan 03a on."""

from apps.settings.registry import SettingDef, register

SYSTEM_SETTINGS = [
    SettingDef("session_timeout_minutes", "system", "int", 120, 5, 1440),
    SettingDef("lockout_threshold", "system", "int", 5, 3, 20),
    SettingDef("lockout_minutes", "system", "int", 15, 1, 1440),
    SettingDef("login_ip_max_attempts", "system", "int", 20, 5, 1000),
    SettingDef("temp_password_hours", "system", "int", 24, 1, 168),
    SettingDef("upload_max_mb", "system", "int", 10, 1, 50),
    SettingDef("upload_allowed_types", "system", "str_list", ["pdf", "jpg", "png"], choices=("pdf", "jpg", "png")),
]


def register_system_settings() -> None:
    for definition in SYSTEM_SETTINGS:
        register(definition)
```

`backend/apps/settings/messages.py`:

```python
MESSAGES = {
    "settings.unknown_key": {
        "en": "This setting does not exist.",
        "fr": "Ce paramètre n'existe pas.",
    },
    "settings.invalid_value": {
        "en": "This value is not accepted for this setting. Check its format and try again.",
        "fr": "Cette valeur n'est pas acceptée pour ce paramètre. Vérifiez son format et réessayez.",
    },
    "settings.out_of_range": {
        "en": "The value must be between {minimum} and {maximum}.",
        "fr": "La valeur doit être comprise entre {minimum} et {maximum}.",
    },
}
```

`backend/apps/settings/apps.py`:

```python
from django.apps import AppConfig


class SettingsConfig(AppConfig):
    name = "apps.settings"
    label = "settings"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.settings.defaults import register_system_settings
        from apps.settings.messages import MESSAGES

        register_messages(MESSAGES)
        register_system_settings()
```

- [ ] **Step 5: Write the services**

`backend/apps/settings/services.py`:

```python
"""Typed settings stored in the database. Import as: `from apps.settings import services as settings_service`."""

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import DomainError, NotAllowed
from apps.settings import registry
from apps.settings.models import Setting

CACHE_SECONDS = 30
GROUP_ROLE = {"hr": Role.HR, "system": Role.SYSADMIN}
GROUP_AUDIT_CATEGORY = {"hr": audit.BUSINESS, "system": audit.SECURITY}

logger = logging.getLogger("iris.settings")

_clock = time.monotonic
_cache: dict[str, Any] | None = None
_cache_loaded_at = 0.0


@dataclass(frozen=True)
class SettingRow:
    key: str
    kind: str
    value: Any
    default: Any
    minimum: Any
    maximum: Any
    choices: list[str] | None
    updated_by_name: str | None
    updated_at: datetime | None


def clear_cache() -> None:
    global _cache
    _cache = None


def _stored_values() -> dict[str, Any]:
    """Every changed value, read once per process every CACHE_SECONDS."""
    global _cache, _cache_loaded_at
    now = _clock()
    if _cache is None or now - _cache_loaded_at > CACHE_SECONDS:
        _cache = {key: wrapped.get("v") for key, wrapped in Setting.objects.values_list("key", "value")}
        _cache_loaded_at = now
    return _cache


def _default(defn: registry.SettingDef) -> Any:
    return registry.to_storage(defn, defn.default)


def get(key: str) -> Any:
    """The current value of a setting, typed. Other processes see a change within CACHE_SECONDS."""
    defn = registry.get_def(key)
    stored = _stored_values()
    if key in stored:
        try:
            return registry.to_python(defn, registry.to_storage(defn, stored[key]))
        except DomainError:
            logger.error("stored setting is not valid; using the default", extra={"data": {"key": key}})
    return registry.to_python(defn, _default(defn))


@transaction.atomic
def set_value(*, actor, key: str, value: Any) -> Setting:
    defn = registry.get_def(key)
    if not has_role(actor, GROUP_ROLE[defn.group]):
        raise NotAllowed()
    new = registry.to_storage(defn, value)

    row = Setting.objects.select_for_update().filter(key=key).first()
    before = _default(defn) if row is None else row.value.get("v")
    if row is None:
        row = Setting(key=key)
    row.value = {"v": new}
    row.updated_by = actor
    row.updated_at = timezone.now()
    row.save()

    audit.record(
        action="setting.changed",
        category=GROUP_AUDIT_CATEGORY[defn.group],
        object_type="setting",
        object_id=key,
        object_label=key,
        changes={"value": {"before": before, "after": new}},
        actor=actor,
    )
    clear_cache()
    transaction.on_commit(clear_cache)
    return row


def _plain(value: Any) -> Any:
    return format(value.normalize(), "f") if isinstance(value, Decimal) else value


def list_group(group: str) -> list[SettingRow]:
    """Every setting of a group with its current value, for the settings pages."""
    from apps.accounts.services import display_name  # imported here: accounts services read settings

    if group not in registry.GROUPS:
        raise ValueError(f"Unknown settings group: {group}")
    definitions = registry.defs_for(group)
    keys = [defn.key for defn in definitions]
    rows = {row.key: row for row in Setting.objects.filter(key__in=keys).select_related("updated_by")}
    described = []
    for defn in definitions:
        row = rows.get(defn.key)
        default = _default(defn)
        described.append(
            SettingRow(
                key=defn.key,
                kind=defn.kind,
                value=default if row is None else row.value.get("v"),
                default=default,
                minimum=_plain(defn.minimum),
                maximum=_plain(defn.maximum),
                choices=list(defn.choices) if defn.choices is not None else None,
                updated_by_name=display_name(row.updated_by) if row is not None and row.updated_by else None,
                updated_at=None if row is None else row.updated_at,
            )
        )
    return described


def row_for(key: str) -> SettingRow:
    defn = registry.get_def(key)
    return next(row for row in list_group(defn.group) if row.key == key)
```

- [ ] **Step 6: Register the app, generate the migration, extend the fixtures**

In `backend/config/settings.py`, replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.settings",
]
```

Run: `docker compose run --rm app python manage.py makemigrations settings`

Expected: `Migrations for 'settings':` with `apps/settings/migrations/0001_initial.py` listing `Create model Setting`.

Replace `backend/conftest.py` with:

```python
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Append-only tables stay protected against UPDATE and DELETE, but may be emptied between tests."""
    from tests.db import disable_truncate_guards

    with django_db_blocker.unblock():
        disable_truncate_guards()


@pytest.fixture(scope="session", autouse=True)
def _test_only_settings():
    """No HR setting exists before plan 03a; the suite registers a few of its own."""
    import apps.settings.tests.world  # noqa: F401


@pytest.fixture(autouse=True)
def _fast_password_hashing(request, settings):
    """Argon2 is slow on purpose. Tests use a fast hasher unless marked `real_hasher`."""
    if request.node.get_closest_marker("real_hasher") is None:
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def _fresh_settings_cache():
    """Settings are cached per process; no test may see another test's values."""
    from apps.settings import services as settings_service

    settings_service.clear_cache()
    yield
    settings_service.clear_cache()


@pytest.fixture
def world(db):
    """The standard cast (master 6.11)."""
    from tests.world import build_world

    return build_world()


@pytest.fixture
def anon_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def client_for():
    """`client_for(user)` returns an API client signed in as that user."""
    from rest_framework.test import APIClient

    def build(user):
        client = APIClient()
        client.force_login(user)
        return client

    return build
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/settings tests/test_messages.py -q`

Expected: PASS, no failures.

- [ ] **Step 8: Apply the migration and commit**

Run: `docker compose run --rm app python manage.py migrate`

Expected: `Applying settings.0001_initial... OK`.

```bash
git add backend/apps/settings backend/conftest.py backend/config/settings.py
git commit -m "feat(settings): typed settings with registry, validation, cache and audit"
```

---

### Task 11: Notification core and its API

**Files:**
- Create: `backend/apps/notifications/__init__.py` (empty), `backend/apps/notifications/apps.py`, `backend/apps/notifications/models.py`, `backend/apps/notifications/channels.py`, `backend/apps/notifications/services.py`, `backend/apps/notifications/messages.py`
- Create: `backend/apps/notifications/api/__init__.py` (empty), `backend/apps/notifications/api/serializers.py`, `backend/apps/notifications/api/views.py`, `backend/apps/notifications/api/urls.py`
- Create: `backend/apps/notifications/migrations/0001_initial.py` (generated)
- Create: `backend/apps/notifications/tests/__init__.py` (empty), `backend/apps/notifications/tests/world.py`
- Modify: `backend/apps/accounts/apps.py`, `backend/config/api_urls.py`, `backend/config/settings.py`, `backend/tests/world.py`
- Test: `backend/apps/notifications/tests/test_services.py`, `backend/apps/notifications/tests/test_api.py`

**Interfaces:**
- Consumes: `translate` (Task 4); `paginate`, `paginated`, `PAGE_PARAMETERS` (Task 5); `AUTHENTICATED`, `SessionAuth`, `RolePermission` (Task 9); `NotFound` (Task 4); the `world`, `client_for`, `anon_client` fixtures (Task 9).
- Produces (master 6.6 and 7.5):
  - `apps.notifications.services`: `register_event(code, *, link)`, `notify(*, users, event, params=None, target_type="", target_public_id="", dedupe_key=None) -> list[Notification]` (returns only the rows it created), `render(notification, lang=None) -> dict` (`title`, `body`, `link`), `for_user(user, *, unread_only=False) -> QuerySet`, `unread_count(user) -> int`, `mark_read(*, user, notification_id) -> None`, `mark_all_read(*, user) -> int`, `registered_events()`.
  - `apps.notifications.channels`: `Channel` (protocol with `deliver(notifications)`) and `CHANNELS`, the single place where an email channel is added later (NOT-05).
  - Texts of an event are the catalogue entries `notification.<event>.title` and `notification.<event>.body`. A link template may use `{target}` (the target's public id) and any parameter.
  - Routes `notifications:list`, `notifications:unread-count`, `notifications:read`, `notifications:read-all`.
  - Events `account.password_reset` (link `/password`), `job.failed` and `error.unexpected` (link `/admin`).
  - `world.owner_notification`: one unread notification that belongs to the owner.

- [ ] **Step 1: Write the failing tests**

`backend/apps/notifications/tests/world.py`:

```python
from apps.notifications import services


def make_notification(user, *, by="Sonia Admin", dedupe_key=None):
    """One "your password was reset" notification for `user`."""
    created = services.notify(
        users=[user], event="account.password_reset", params={"by": by}, target_type="account", dedupe_key=dedupe_key
    )
    return created[0]


def build(world) -> None:
    world.owner_notification = make_notification(world.owner_user)
```

`backend/apps/notifications/tests/test_services.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.utils import translation

from apps.core.errors import NotFound
from apps.core.i18n import register_messages
from apps.notifications import channels, services
from apps.notifications.models import Notification
from apps.notifications.tests.world import make_notification

register_messages(
    {
        "notification.test.pinged.title": {"en": "Ping from {who}", "fr": "Ping de {who}"},
        "notification.test.pinged.body": {
            "en": "{who} pinged you about {subject}.",
            "fr": "{who} vous a écrit au sujet de {subject}.",
        },
    }
)
services.register_event("test.pinged", link="/requests/{target}")

pytestmark = pytest.mark.django_db


def ping(users, **options):
    return services.notify(
        users=users,
        event="test.pinged",
        params={"who": "Sami", "subject": "leave"},
        target_type="request",
        target_public_id="abc-123",
        **options,
    )


def test_notify_stores_one_row_per_user(world):
    created = ping([world.manager_user, world.peer_user])

    assert [n.user for n in created] == [world.manager_user, world.peer_user]
    row = Notification.objects.get(user=world.manager_user)
    assert row.event_code == "test.pinged"
    assert row.parameters == {"who": "Sami", "subject": "leave"}
    assert (row.target_type, row.target_public_id) == ("request", "abc-123")
    assert row.dedupe_key is None
    assert row.read_at is None
    assert row.created_at is not None


def test_a_user_listed_twice_is_notified_once(world):
    assert len(ping([world.manager_user, world.manager_user])) == 1


def test_disabled_accounts_and_missing_users_are_skipped(world):
    world.peer_user.is_active = False
    world.peer_user.save(update_fields=["is_active"])

    created = ping([world.peer_user, None, world.manager_user])

    assert [n.user for n in created] == [world.manager_user]


def test_an_unknown_event_is_a_programming_error(world):
    with pytest.raises(ValueError, match="no.such.event"):
        services.notify(users=[world.manager_user], event="no.such.event")


def test_a_dedupe_key_stores_a_notification_once_per_user(world):
    first = ping([world.manager_user], dedupe_key="reminder:42")
    again = ping([world.manager_user], dedupe_key="reminder:42")
    wider = ping([world.manager_user, world.peer_user], dedupe_key="reminder:42")
    other = ping([world.manager_user], dedupe_key="reminder:43")

    assert len(first) == 1
    assert again == []
    assert [n.user for n in wider] == [world.peer_user]
    assert len(other) == 1
    assert Notification.objects.filter(user=world.manager_user).count() == 2


def test_without_a_dedupe_key_every_call_notifies(world):
    ping([world.manager_user])
    ping([world.manager_user])

    assert Notification.objects.filter(user=world.manager_user).count() == 2


def test_the_text_is_rendered_in_the_language_asked_for(world):
    notification = ping([world.manager_user])[0]

    assert services.render(notification, "fr") == {
        "title": "Ping de Sami",
        "body": "Sami vous a écrit au sujet de leave.",
        "link": "/requests/abc-123",
    }
    assert services.render(notification, "en")["title"] == "Ping from Sami"


def test_render_defaults_to_the_active_language(world):
    notification = ping([world.manager_user])[0]

    with translation.override("en"):
        assert services.render(notification)["body"] == "Sami pinged you about leave."
    with translation.override("fr"):
        assert services.render(notification)["body"] == "Sami vous a écrit au sujet de leave."


def test_for_user_returns_the_users_own_notifications_newest_first(world):
    with time_machine.travel(datetime(2026, 10, 6, 9, 0, tzinfo=UTC), tick=False) as clock:
        old = ping([world.manager_user])[0]
        clock.shift(timedelta(minutes=5))
        new = ping([world.manager_user])[0]
        ping([world.peer_user])

    assert list(services.for_user(world.manager_user)) == [new, old]


def test_reading_one_notification(world):
    first, second = ping([world.manager_user])[0], ping([world.manager_user])[0]
    assert services.unread_count(world.manager_user) == 2

    services.mark_read(user=world.manager_user, notification_id=first.pk)

    assert services.unread_count(world.manager_user) == 1
    assert list(services.for_user(world.manager_user, unread_only=True)) == [second]
    first.refresh_from_db()
    assert first.read_at is not None


def test_reading_twice_keeps_the_first_time(world):
    notification = ping([world.manager_user])[0]
    with time_machine.travel(datetime(2026, 10, 6, 9, 0, tzinfo=UTC), tick=False) as clock:
        services.mark_read(user=world.manager_user, notification_id=notification.pk)
        clock.shift(timedelta(hours=1))
        services.mark_read(user=world.manager_user, notification_id=notification.pk)

    notification.refresh_from_db()
    assert notification.read_at == datetime(2026, 10, 6, 9, 0, tzinfo=UTC)


def test_nobody_can_read_someone_elses_notification(world):
    notification = ping([world.manager_user])[0]

    with pytest.raises(NotFound):
        services.mark_read(user=world.peer_user, notification_id=notification.pk)

    notification.refresh_from_db()
    assert notification.read_at is None


def test_reading_all_touches_only_the_users_own(world):
    ping([world.manager_user])
    ping([world.manager_user])
    ping([world.peer_user])

    assert services.mark_all_read(user=world.manager_user) == 2
    assert services.unread_count(world.manager_user) == 0
    assert services.unread_count(world.peer_user) == 1


def test_every_channel_receives_what_was_created(world, monkeypatch):
    delivered = []

    class Spy:
        def deliver(self, notifications):
            delivered.append(list(notifications))

    monkeypatch.setattr(channels, "CHANNELS", [channels.InAppChannel(), Spy()])

    created = ping([world.manager_user, world.peer_user])

    assert delivered == [created]


def test_an_event_cannot_be_registered_twice_with_another_link():
    services.register_event("test.pinged", link="/requests/{target}")  # the same again: accepted

    with pytest.raises(ValueError, match="test.pinged"):
        services.register_event("test.pinged", link="/elsewhere")


def test_the_events_of_this_plan_are_registered():
    events = services.registered_events()

    assert events["account.password_reset"].link == "/password"
    assert events["job.failed"].link == "/admin"
    assert events["error.unexpected"].link == "/admin"


def test_the_cast_has_one_notification_for_the_owner(world):
    assert world.owner_notification.user == world.owner_user
    assert make_notification(world.peer_user).event_code == "account.password_reset"
```

`backend/apps/notifications/tests/test_api.py`:

```python
import pytest

from apps.notifications import services
from apps.notifications.tests.world import make_notification

pytestmark = pytest.mark.django_db

LIST = "/api/v1/notifications"
COUNT = "/api/v1/notifications/unread-count"
READ_ALL = "/api/v1/notifications/read-all"


def read_url(notification) -> str:
    return f"/api/v1/notifications/{notification.pk}/read"


@pytest.fixture
def reader(world):
    """The manager, with three notifications; the peer has one."""
    world.first = make_notification(world.manager_user, by="First")
    world.second = make_notification(world.manager_user, by="Second")
    world.third = make_notification(world.manager_user, by="Third")
    world.foreign = make_notification(world.peer_user)
    return world.manager_user


def test_notifications_need_a_session(anon_client):
    assert anon_client.get(LIST).status_code == 401
    assert anon_client.get(COUNT).status_code == 401
    assert anon_client.post(READ_ALL).status_code == 401


def test_the_list_shows_the_readers_notifications_newest_first(world, reader, client_for):
    body = client_for(reader).get(LIST).json()

    assert set(body) == {"count", "next", "previous", "results"}
    assert body["count"] == 3
    assert [item["id"] for item in body["results"]] == [world.third.pk, world.second.pk, world.first.pk]
    assert set(body["results"][0]) == {"id", "event", "title", "body", "link", "created_at", "read_at"}
    assert body["results"][0]["event"] == "account.password_reset"
    assert body["results"][0]["link"] == "/password"
    assert body["results"][0]["read_at"] is None


def test_the_text_follows_the_readers_language(reader, client_for):
    reader.language = "en"
    reader.save(update_fields=["language"])
    english = client_for(reader).get(LIST).json()["results"][0]
    reader.language = "fr"
    reader.save(update_fields=["language"])
    french = client_for(reader).get(LIST).json()["results"][0]

    assert english["title"] == "Your password was reset"
    assert english["body"].startswith("Third reset your password.")
    assert french["title"] == "Votre mot de passe a été réinitialisé"
    assert french["body"].startswith("Third a réinitialisé votre mot de passe.")


def test_the_list_can_be_limited_to_unread(world, reader, client_for):
    services.mark_read(user=reader, notification_id=world.second.pk)

    body = client_for(reader).get(LIST, {"unread": "1"}).json()

    assert [item["id"] for item in body["results"]] == [world.third.pk, world.first.pk]


def test_the_unread_count(world, reader, client_for):
    assert client_for(reader).get(COUNT).json() == {"count": 3}
    assert client_for(world.outsider_user).get(COUNT).json() == {"count": 0}


def test_marking_one_as_read(world, reader, client_for):
    client = client_for(reader)

    response = client.post(read_url(world.first))

    assert response.status_code == 204
    assert client.get(COUNT).json() == {"count": 2}
    read = next(item for item in client.get(LIST).json()["results"] if item["id"] == world.first.pk)
    assert read["read_at"] is not None


def test_someone_elses_notification_is_not_available(world, reader, client_for):
    response = client_for(reader).post(read_url(world.foreign))

    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"
    assert client_for(world.peer_user).get(COUNT).json() == {"count": 1}


def test_a_notification_that_does_not_exist_is_not_available(reader, client_for):
    assert client_for(reader).post("/api/v1/notifications/999999/read").status_code == 404


def test_marking_all_as_read(world, reader, client_for):
    client = client_for(reader)

    assert client.post(READ_ALL).status_code == 204
    assert client.get(COUNT).json() == {"count": 0}
    assert client_for(world.peer_user).get(COUNT).json() == {"count": 1}


def test_the_list_is_paginated(reader, client_for):
    for _ in range(30):
        make_notification(reader)

    body = client_for(reader).get(LIST).json()

    assert body["count"] == 33
    assert len(body["results"]) == 25
    assert "page=2" in body["next"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/notifications -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.notifications.services'`.

- [ ] **Step 3: Write the model, the channels, the messages and the app configuration**

`backend/apps/notifications/models.py`:

```python
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Notification(models.Model):
    """One event told to one user. The text is not stored: it is rendered in the reader's language (NOT-04)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    event_code = models.CharField(max_length=60)
    parameters = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    target_type = models.CharField(max_length=40, blank=True)
    target_public_id = models.CharField(max_length=64, blank=True)
    dedupe_key = models.CharField(max_length=120, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "dedupe_key"],
                condition=Q(dedupe_key__isnull=False),
                name="notifications_dedupe_once",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "read_at"], name="notifications_user_read"),
            models.Index(fields=["user", "-created_at"], name="notifications_user_created"),
        ]

    def __str__(self) -> str:
        return f"{self.event_code} for {self.user_id}"
```

`backend/apps/notifications/channels.py`:

```python
"""Delivery channels (NOT-05). Today there is one; an email channel is added to CHANNELS, and nothing else changes."""

from collections.abc import Sequence
from typing import Protocol


class Channel(Protocol):
    def deliver(self, notifications: Sequence) -> None:
        """Called once per notify() with the notifications that were just stored."""


class InAppChannel:
    """The stored row is the in-app delivery: the list and the unread count read it."""

    def deliver(self, notifications: Sequence) -> None:
        return None


CHANNELS: list[Channel] = [InAppChannel()]
```

`backend/apps/notifications/messages.py`:

```python
"""Texts of the notifications the platform itself raises. Each app adds its own events in its messages.py."""

MESSAGES = {
    "notification.job.failed.title": {
        "en": "A scheduled job failed",
        "fr": "Une tâche planifiée a échoué",
    },
    "notification.job.failed.body": {
        "en": "The job {job} failed. Open Status to see what happened.",
        "fr": "La tâche {job} a échoué. Ouvrez l'état du système pour voir ce qui s'est passé.",
    },
    "notification.error.unexpected.title": {
        "en": "An unexpected error occurred",
        "fr": "Une erreur inattendue s'est produite",
    },
    "notification.error.unexpected.body": {
        "en": "A user met an error. Search the logs for the reference {reference}.",
        "fr": "Un utilisateur a rencontré une erreur. Cherchez la référence {reference} dans les journaux.",
    },
}
```

`backend/apps/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    label = "notifications"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.notifications import services
        from apps.notifications.messages import MESSAGES

        register_messages(MESSAGES)
        services.register_event("job.failed", link="/admin")
        services.register_event("error.unexpected", link="/admin")
```

- [ ] **Step 4: Write the services**

`backend/apps/notifications/services.py`:

```python
"""In-app notifications (PRD 5.6). Apps call register_event() at start-up and notify() inside their services."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.core.errors import NotFound
from apps.core.i18n import translate
from apps.notifications import channels
from apps.notifications.models import Notification


@dataclass(frozen=True)
class EventDef:
    code: str
    link: str  # a path of the web app; may use {target} and any parameter of the event


_events: dict[str, EventDef] = {}


def register_event(code: str, *, link: str) -> None:
    """Declares an event. Its texts are the messages notification.<code>.title and notification.<code>.body."""
    existing = _events.get(code)
    if existing is not None and existing.link != link:
        raise ValueError(f"Notification event registered twice with different links: {code}")
    _events[code] = EventDef(code, link)


def registered_events() -> Mapping[str, EventDef]:
    return _events


@transaction.atomic
def notify(
    *,
    users: Iterable,
    event: str,
    params: Mapping[str, Any] | None = None,
    target_type: str = "",
    target_public_id: str = "",
    dedupe_key: str | None = None,
) -> list[Notification]:
    """Stores one notification per active user and returns those it created.

    With a `dedupe_key`, a user who already has a notification with that key gets nothing more.
    `params` must never carry a comment or a file name of a sensitive request (NOT-03).
    """
    if event not in _events:
        raise ValueError(f"Unknown notification event: {event}")
    fields = {
        "event_code": event,
        "parameters": dict(params or {}),
        "target_type": target_type,
        "target_public_id": str(target_public_id or ""),
    }
    created: list[Notification] = []
    seen: set[int] = set()
    for user in users:
        if user is None or user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        if dedupe_key is None:
            created.append(Notification.objects.create(user=user, **fields))
            continue
        notification, was_created = Notification.objects.get_or_create(
            user=user, dedupe_key=dedupe_key, defaults=fields
        )
        if was_created:
            created.append(notification)
    for channel in channels.CHANNELS:
        channel.deliver(created)
    return created


def render(notification: Notification, lang: str | None = None) -> dict[str, str]:
    """The title, body and link of a notification in `lang` (default: the active language)."""
    params = dict(notification.parameters or {})
    code = notification.event_code
    definition = _events.get(code)
    link = ""
    if definition is not None:
        try:
            link = definition.link.format(**{**params, "target": notification.target_public_id})
        except (KeyError, IndexError):
            link = definition.link
    return {
        "title": translate(f"notification.{code}.title", lang, **params),
        "body": translate(f"notification.{code}.body", lang, **params),
        "link": link,
    }


def for_user(user, *, unread_only: bool = False) -> QuerySet[Notification]:
    notifications = Notification.objects.filter(user=user)
    if unread_only:
        notifications = notifications.filter(read_at__isnull=True)
    return notifications


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def mark_read(*, user, notification_id: int) -> None:
    """Marks one of the user's own notifications as read. Reading it again changes nothing."""
    if not Notification.objects.filter(user=user, pk=notification_id).exists():
        raise NotFound()
    Notification.objects.filter(user=user, pk=notification_id, read_at__isnull=True).update(read_at=timezone.now())


def mark_all_read(*, user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).update(read_at=timezone.now())
```

- [ ] **Step 5: Write the API**

`backend/apps/notifications/api/serializers.py`:

```python
from rest_framework import serializers

from apps.notifications import services


class NotificationOut(serializers.Serializer):
    id = serializers.IntegerField()
    event = serializers.CharField(source="event_code")
    title = serializers.CharField(source="rendered.title")
    body = serializers.CharField(source="rendered.body")
    link = serializers.CharField(source="rendered.link", allow_blank=True)
    created_at = serializers.DateTimeField()
    read_at = serializers.DateTimeField(allow_null=True)

    def to_representation(self, instance):
        instance.rendered = services.render(instance)  # in the reader's language, set by LanguageMiddleware
        return super().to_representation(instance)


class UnreadCountOut(serializers.Serializer):
    count = serializers.IntegerField()
```

`backend/apps/notifications/api/views.py`:

```python
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated
from apps.notifications import services
from apps.notifications.api.serializers import NotificationOut, UnreadCountOut


class NotificationListView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="notifications_list",
        parameters=[
            OpenApiParameter("unread", bool, description="Send 1 to list unread notifications only."),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(NotificationOut),
    )
    def get(self, request):
        unread_only = request.query_params.get("unread", "").lower() in ("1", "true")
        notifications = services.for_user(request.user, unread_only=unread_only)
        return paginate(request, self, notifications, NotificationOut)


class UnreadCountView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(operation_id="notifications_unread_count", responses=UnreadCountOut)
    def get(self, request):
        return Response(UnreadCountOut({"count": services.unread_count(request.user)}).data)


class NotificationReadView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="notifications_read", request=None, responses={204: None})
    def post(self, request, pk: int):
        services.mark_read(user=request.user, notification_id=pk)
        return Response(status=204)


class NotificationReadAllView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="notifications_read_all", request=None, responses={204: None})
    def post(self, request):
        services.mark_all_read(user=request.user)
        return Response(status=204)
```

`backend/apps/notifications/api/urls.py`:

```python
from django.urls import path

from apps.notifications.api import views

app_name = "notifications"

urlpatterns = [
    path("notifications", views.NotificationListView.as_view(), name="list"),
    path("notifications/unread-count", views.UnreadCountView.as_view(), name="unread-count"),
    path("notifications/read-all", views.NotificationReadAllView.as_view(), name="read-all"),
    path("notifications/<int:pk>/read", views.NotificationReadView.as_view(), name="read"),
]
```

- [ ] **Step 6: Wire the app in**

In `backend/config/settings.py`, replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.settings",
    "apps.notifications",
]
```

Replace `backend/config/api_urls.py` with:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.notifications.api.urls")),
]
```

Replace `backend/apps/accounts/apps.py` with:

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self) -> None:
        from apps.accounts.messages import MESSAGES
        from apps.core.i18n import register_messages
        from apps.notifications import services as notifications

        register_messages(MESSAGES)
        notifications.register_event("account.password_reset", link="/password")
```

Replace `backend/tests/world.py` with:

```python
"""The standard cast used by tests across apps (master 6.11). Each plan adds one line to build_world()."""

from types import SimpleNamespace

from apps.accounts.tests import world as accounts_world
from apps.notifications.tests import world as notifications_world


class World(SimpleNamespace):
    def user_for(self, persona):
        """The account of a persona of the permission matrix ("owner", "hr", ...); None for "anon"."""
        key = str(getattr(persona, "value", persona))
        if key == "anon":
            return None
        return getattr(self, f"{key}_user")


def build_world() -> World:
    world = World()
    accounts_world.build(world)
    notifications_world.build(world)
    return world
```

Run: `docker compose run --rm app python manage.py makemigrations notifications`

Expected: `Migrations for 'notifications':` with `apps/notifications/migrations/0001_initial.py` listing `Create model Notification`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/notifications tests/test_messages.py tests/test_world.py -q`

Expected: PASS, no failures.

- [ ] **Step 8: Apply the migration and commit**

Run: `docker compose run --rm app python manage.py migrate`

Expected: `Applying notifications.0001_initial... OK`.

```bash
git add backend/apps/notifications backend/apps/accounts/apps.py backend/config backend/tests/world.py
git commit -m "feat(notifications): in-app notifications with events, de-duplication and API"
```

---

### Task 12: Sign-in rules, sessions and the inactivity limit

**Files:**
- Create: `backend/apps/accounts/services/signin.py`, `backend/apps/accounts/middleware.py`
- Modify: `backend/apps/accounts/services/__init__.py`, `backend/config/settings.py`
- Test: `backend/apps/accounts/tests/test_signin.py`, `backend/apps/accounts/tests/test_inactivity.py`

**Interfaces:**
- Consumes: `User` (Task 6); `has_allowed_domain`, `normalise_email`, `validate_new_password` (Task 6); `audit.record`, `audit_selectors.count_recent` (Task 8); `settings_service.get` (Task 10); `context.overriding` (Task 3); `DomainError`, `RateLimited` (Task 4); `translate` (Task 4).
- Produces (master 7.2):
  - `apps.accounts.services.authenticate(*, email: str, password: str, ip: str) -> User`. Raises, in this order of checks: `auth.rate_limited` (429, param `minutes`), `auth.domain_not_allowed` (field `email`, param `domain`), `auth.invalid_credentials`, `auth.locked` (param `until`), `auth.temp_password_expired`, `auth.invalid_credentials` (wrong password), `auth.disabled`. All are status 400 except the first.
  - `apps.accounts.services.start_session(request, user) -> None`, `end_session(request) -> None`, `change_password(*, user, current_password, new_password) -> None`.
  - `apps.accounts.middleware.InactivityMiddleware` and the session key `LAST_ACTIVITY_KEY = "last_activity"`.
  - Security audit actions: `auth.login`, `auth.login_failed` (with `changes.reason`), `auth.locked`, `auth.logout`, `auth.session_expired`, `auth.password_changed`.

- [ ] **Step 1: Write the failing tests for signing in**

`backend/apps/accounts/tests/test_signin.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.auth import SESSION_KEY
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware

from apps.accounts import services
from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.accounts.tests.world import PASSWORD
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, RateLimited
from apps.core.i18n import translate
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)
IP = "192.168.1.20"
OWNER = "employee.a1@impactrisks.com"


def signin(email=OWNER, password=PASSWORD, ip=IP):
    return services.authenticate(email=email, password=password, ip=ip)


def failure(**arguments) -> DomainError:
    with pytest.raises(DomainError) as error:
        signin(**arguments)
    return error.value


# --- Review Focus 1: an imperfect address, or a bad moment ---


@pytest.mark.parametrize(
    "typed",
    ["employee.a1@impactrisks.com", "  Employee.A1@ImpactRisks.COM ", "EMPLOYEE.A1@IMPACTRISKS.COM"],
)
def test_the_address_may_be_typed_in_any_case_and_with_spaces(world, typed):
    assert signin(email=typed) == world.owner_user


@pytest.mark.parametrize(
    "typed",
    [
        "employee.a1@impactrisks.com.evil.com",
        "employee.a1@impactrisk.com",
        "employee.a1@mail.impactrisks.com",
        "employee.a1",
        "",
    ],
)
def test_an_address_outside_the_company_domain_is_refused_with_the_reason(world, typed):
    error = failure(email=typed)

    assert error.code == "auth.domain_not_allowed"
    assert error.field == "email"
    assert error.params == {"domain": "impactrisks.com"}
    assert error.status == 400


def test_a_wrong_password_and_an_unknown_address_get_the_same_answer(world):
    wrong = failure(password="not-the-password")
    unknown = failure(email="nobody@impactrisks.com")

    assert wrong.code == unknown.code == "auth.invalid_credentials"
    assert wrong.params == unknown.params == {}
    assert wrong.field is None and unknown.field is None


def test_a_failed_sign_in_is_audited_with_the_address_and_the_reason(world):
    failure(password="not-the-password")
    failure(email="Nobody@impactrisks.com")
    failure(email="someone@gmail.com")

    by_label = {event.object_label: event for event in AuditEvent.objects.filter(action="auth.login_failed")}
    known = by_label[OWNER]
    assert known.category == "security"
    assert known.actor is None
    assert known.object_id == str(world.owner_user.public_id)
    assert known.ip_address == IP
    assert known.changes == {"reason": "wrong_password"}
    assert by_label["nobody@impactrisks.com"].changes == {"reason": "unknown"}
    assert by_label["nobody@impactrisks.com"].object_id == ""
    assert by_label["someone@gmail.com"].changes == {"reason": "domain"}


def test_the_typed_password_is_never_written_to_the_audit_trail(world):
    failure(password="S3cret-typed-wrong")

    assert "S3cret" not in str(list(AuditEvent.objects.values()))


# --- Review Focus 2: the lock-out boundary ---


def test_four_wrong_passwords_then_the_right_one_sign_in_and_reset_the_count(world):
    for _ in range(4):
        assert failure(password="wrong").code == "auth.invalid_credentials"
    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 4

    assert signin() == world.owner_user

    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 0
    assert world.owner_user.locked_until is None


def test_the_fifth_wrong_password_locks_the_account_for_fifteen_minutes(world):
    with time_machine.travel(START, tick=False):
        for _ in range(4):
            assert failure(password="wrong").code == "auth.invalid_credentials"
        locked = failure(password="wrong")

    assert locked.code == "auth.locked"
    assert locked.params == {"until": START + timedelta(minutes=15)}
    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until == START + timedelta(minutes=15)
    event = AuditEvent.objects.get(action="auth.locked")
    assert event.object_id == str(world.owner_user.public_id)
    assert event.category == "security"


def test_a_locked_account_stays_locked_even_with_the_right_password(world):
    with time_machine.travel(START, tick=False) as clock:
        for _ in range(5):
            failure(password="wrong")
        clock.shift(timedelta(minutes=14, seconds=59))
        still_locked = failure()

    assert still_locked.code == "auth.locked"
    assert still_locked.params == {"until": START + timedelta(minutes=15)}


def test_the_lock_ends_by_itself(world):
    with time_machine.travel(START, tick=False) as clock:
        for _ in range(5):
            failure(password="wrong")
        clock.shift(timedelta(minutes=15, seconds=1))

        assert signin() == world.owner_user

    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until is None
    assert world.owner_user.failed_attempts == 0


def test_the_lock_out_numbers_follow_the_settings(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=3)
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=60)

    with time_machine.travel(START, tick=False):
        failure(password="wrong")
        failure(password="wrong")
        locked = failure(password="wrong")

    assert locked.code == "auth.locked"
    assert locked.params == {"until": START + timedelta(minutes=60)}


def test_wrong_attempts_on_one_account_do_not_lock_another(world):
    for _ in range(5):
        failure(password="wrong")

    assert signin(email="employee.a2@impactrisks.com") == world.peer_user


# --- disabled accounts and temporary passwords ---


def test_a_disabled_account_is_told_so_only_with_the_right_password(world):
    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert failure(password="wrong").code == "auth.invalid_credentials"
    assert failure().code == "auth.disabled"


def test_an_expired_temporary_password_says_to_ask_the_administrator(world):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = START - timedelta(minutes=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    with time_machine.travel(START, tick=False):
        with_right_password = failure()
        with_wrong_password = failure(password="wrong")

    assert with_right_password.code == "auth.temp_password_expired"
    assert with_wrong_password.code == "auth.temp_password_expired"
    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 0


def test_a_temporary_password_still_valid_signs_in(world):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = START + timedelta(hours=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    with time_machine.travel(START, tick=False):
        assert signin() == world.owner_user


def test_an_account_whose_password_was_never_set_cannot_sign_in(world):
    world.owner_user.set_unusable_password()
    world.owner_user.save(update_fields=["password"])

    assert failure().code == "auth.invalid_credentials"


# --- the limit per network address ---


def test_too_many_failures_from_one_address_block_that_address_for_a_while(world):
    with time_machine.travel(START, tick=False) as clock:
        for number in range(20):
            failure(email=f"ghost{number}@impactrisks.com")

        with pytest.raises(RateLimited) as blocked:
            signin()  # even the right password is refused from this address now
        assert blocked.value.code == "auth.rate_limited"
        assert blocked.value.status == 429
        assert blocked.value.params == {"minutes": 15}

        assert signin(ip="192.168.1.21") == world.owner_user

        clock.shift(timedelta(minutes=16))
        assert signin() == world.owner_user


def test_the_address_limit_follows_the_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="login_ip_max_attempts", value=5)

    for number in range(5):
        failure(email=f"ghost{number}@impactrisks.com")

    with pytest.raises(RateLimited):
        signin()


def test_without_a_known_address_there_is_no_address_limit(world):
    for number in range(25):
        failure(email=f"ghost{number}@impactrisks.com", ip="")

    assert signin(ip="") == world.owner_user


# --- sessions ---


@pytest.fixture
def http_request(rf):
    request = rf.post("/api/v1/auth/login", REMOTE_ADDR=IP)
    SessionMiddleware(lambda inner: None).process_request(request)
    request.user = AnonymousUser()
    return request


def test_start_session_signs_in_and_remembers_the_previous_sign_in(world, http_request, rf):
    user = world.owner_user
    with time_machine.travel(START, tick=False) as clock:
        services.start_session(http_request, user)
        user.refresh_from_db()
        assert user.last_login_at == START
        assert user.previous_login_at is None

        clock.shift(timedelta(days=1))
        second = rf.post("/api/v1/auth/login")
        SessionMiddleware(lambda inner: None).process_request(second)
        services.start_session(second, user)

    user.refresh_from_db()
    assert user.previous_login_at == START
    assert user.last_login_at == START + timedelta(days=1)
    assert http_request.session[SESSION_KEY] == str(user.pk)
    assert http_request.session[LAST_ACTIVITY_KEY] == START.timestamp()
    assert http_request.user == user
    events = AuditEvent.objects.filter(action="auth.login")
    assert events.count() == 2
    assert all(event.actor == user and event.category == "security" for event in events)


def test_end_session_signs_out_and_is_audited(world, http_request):
    services.start_session(http_request, world.owner_user)

    services.end_session(http_request)

    assert SESSION_KEY not in http_request.session
    assert http_request.user.is_authenticated is False
    event = AuditEvent.objects.get(action="auth.logout")
    assert event.actor == world.owner_user
    assert event.object_id == str(world.owner_user.public_id)


def test_end_session_without_a_signed_in_user_records_nothing(http_request):
    services.end_session(http_request)

    assert not AuditEvent.objects.filter(action="auth.logout").exists()


# --- changing one's own password ---


def test_changing_the_password_needs_the_current_one(world):
    with pytest.raises(DomainError) as error:
        services.change_password(user=world.owner_user, current_password="wrong", new_password="Another-Horse-43!")

    assert error.value.code == "auth.wrong_current_password"
    assert error.value.field == "current_password"
    assert world.owner_user.check_password(PASSWORD)


def test_the_new_password_must_respect_the_policy(world):
    with pytest.raises(DomainError) as error:
        services.change_password(user=world.owner_user, current_password=PASSWORD, new_password="short")

    assert error.value.code == "auth.weak_password"
    assert error.value.field == "new_password"


def test_the_new_password_must_differ_from_the_current_one(world):
    with pytest.raises(DomainError) as error:
        services.change_password(user=world.owner_user, current_password=PASSWORD, new_password=PASSWORD)

    assert error.value.code == "auth.weak_password"
    assert error.value.params == {"reasons": translate("auth.same_password")}


def test_changing_the_password_ends_the_temporary_state_and_is_audited(world):
    user = world.owner_user
    user.must_change_password = True
    user.temp_password_expires_at = START
    user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    services.change_password(user=user, current_password=PASSWORD, new_password="Another-Horse-43!")

    user.refresh_from_db()
    assert user.check_password("Another-Horse-43!")
    assert user.must_change_password is False
    assert user.temp_password_expires_at is None
    event = AuditEvent.objects.get(action="auth.password_changed")
    assert event.actor == user
    assert event.category == "security"
    assert "Another-Horse" not in str(event.changes)
```

- [ ] **Step 2: Write the failing tests for the inactivity limit**

`backend/apps/accounts/tests/test_inactivity.py`:

```python
"""Review Focus 3: a session that should be dead is dead, and a user who keeps working is never signed out."""

from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from rest_framework.test import APIClient

from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.audit.models import AuditEvent
from apps.settings import services as settings_service

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.accounts.tests.urls_permissions")]

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def test_a_session_idle_for_more_than_two_hours_ends(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get("/signed-in").status_code == 200

        clock.shift(timedelta(minutes=121))
        expired = client.get("/signed-in")
        clock.shift(timedelta(seconds=5))
        after = client.get("/signed-in")

    assert expired.status_code == 401
    assert after.status_code == 401
    events = AuditEvent.objects.filter(action="auth.session_expired")
    assert events.count() == 1
    assert events[0].object_id == str(world.owner_user.public_id)
    assert events[0].category == "security"


def test_a_session_idle_for_exactly_the_limit_is_still_alive(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get("/signed-in")
        clock.shift(timedelta(minutes=120))

        assert client.get("/signed-in").status_code == 200


def test_a_user_who_keeps_working_is_never_signed_out(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        for _ in range(10):  # 10 x 100 minutes: far beyond two hours in total
            assert client.get("/signed-in").status_code == 200
            clock.shift(timedelta(minutes=100))

        assert client.get("/signed-in").status_code == 200


def test_the_limit_follows_the_setting(world, client_for):
    settings_service.set_value(actor=world.sysadmin_user, key="session_timeout_minutes", value=5)

    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get("/signed-in").status_code == 200
        clock.shift(timedelta(minutes=6))

        assert client.get("/signed-in").status_code == 401


def test_activity_is_stored_at_most_once_a_minute(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()

        clock.shift(timedelta(seconds=30))
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()

        clock.shift(timedelta(seconds=31))
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == (START + timedelta(seconds=61)).timestamp()


def test_requests_without_a_session_pass_untouched():
    assert APIClient().get("/open").status_code == 200
    assert not AuditEvent.objects.filter(action="auth.session_expired").exists()
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts/tests/test_signin.py apps/accounts/tests/test_inactivity.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.accounts.services.signin'`.

- [ ] **Step 4: Write `backend/apps/accounts/services/signin.py`**

```python
"""Signing in and out, and changing one's own password (PRD 5.1)."""

from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone

from apps.accounts.emails import has_allowed_domain, normalise_email
from apps.accounts.models import User
from apps.accounts.passwords import validate_new_password
from apps.audit import selectors as audit_selectors
from apps.audit import services as audit
from apps.core import context
from apps.core.errors import DomainError, RateLimited
from apps.core.i18n import translate
from apps.settings import services as settings_service

LAST_ACTIVITY_KEY = "last_activity"
AUTH_BACKEND = "django.contrib.auth.backends.ModelBackend"


def _record_failure(user: User | None, address: str, reason: str) -> None:
    audit.record(
        action="auth.login_failed",
        category=audit.SECURITY,
        actor=None,
        obj=user,
        object_type="user",
        object_label=address,
        changes={"reason": reason},
    )


def _check_known_user(user_id: int, password: str, address: str, now: datetime, window: timedelta) -> tuple[str, User]:
    """Applies the rules to an existing account under a row lock. Returns the outcome and the fresh user."""
    threshold = settings_service.get("lockout_threshold")
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user_id)
        if user.locked_until and user.locked_until > now:
            _record_failure(user, address, "locked")
            return "locked", user
        expires = user.temp_password_expires_at
        if user.must_change_password and expires is not None and expires <= now:
            # An expired temporary password is no longer a secret worth hiding: say so whatever was typed.
            _record_failure(user, address, "temp_password_expired")
            return "temp_expired", user
        if not user.check_password(password):
            user.failed_attempts += 1
            locking = user.failed_attempts >= threshold
            if locking:
                user.failed_attempts = 0
                user.locked_until = now + window
            user.save(update_fields=["failed_attempts", "locked_until"])
            _record_failure(user, address, "wrong_password")
            if locking:
                audit.record(
                    action="auth.locked",
                    category=audit.SECURITY,
                    actor=None,
                    obj=user,
                    changes={"until": user.locked_until},
                )
                return "locked", user
            return "wrong", user
        if not user.is_active:
            _record_failure(user, address, "disabled")
            return "disabled", user
        if user.failed_attempts or user.locked_until:
            user.failed_attempts = 0
            user.locked_until = None
            user.save(update_fields=["failed_attempts", "locked_until"])
        return "ok", user


def authenticate(*, email: str, password: str, ip: str) -> User:
    """Returns the account for these credentials, or raises a DomainError that says why not (UI 4.1)."""
    now = timezone.now()
    address = normalise_email(email)
    minutes = settings_service.get("lockout_minutes")
    window = timedelta(minutes=minutes)

    with context.overriding(ip=ip or None):
        if ip:
            failures = audit_selectors.count_recent(action="auth.login_failed", ip_address=ip, since=now - window)
            if failures >= settings_service.get("login_ip_max_attempts"):
                raise RateLimited("auth.rate_limited", minutes=minutes)

        if not has_allowed_domain(address):
            _record_failure(None, address, "domain")
            raise DomainError("auth.domain_not_allowed", field="email", domain=settings.ALLOWED_EMAIL_DOMAIN)

        known = User.objects.filter(email=address).first()
        if known is None:
            make_password(password)  # the same work as a real check, so timing does not reveal who has an account
            _record_failure(None, address, "unknown")
            raise DomainError("auth.invalid_credentials")

        outcome, user = _check_known_user(known.pk, password, address, now, window)

    if outcome == "locked":
        raise DomainError("auth.locked", until=user.locked_until)
    if outcome == "temp_expired":
        raise DomainError("auth.temp_password_expired")
    if outcome == "wrong":
        raise DomainError("auth.invalid_credentials")
    if outcome == "disabled":
        raise DomainError("auth.disabled")
    return user


def start_session(request, user: User) -> None:
    """Opens the server-side session and records the sign-in (ACC-07)."""
    http_request = getattr(request, "_request", request)
    django_login(http_request, user, backend=AUTH_BACKEND)
    now = timezone.now()
    user.previous_login_at = user.last_login_at
    user.last_login_at = now
    user.save(update_fields=["previous_login_at", "last_login_at"])
    http_request.session[LAST_ACTIVITY_KEY] = now.timestamp()
    audit.record(action="auth.login", category=audit.SECURITY, actor=user, obj=user)


def end_session(request) -> None:
    http_request = getattr(request, "_request", request)
    user = getattr(http_request, "user", None)
    if user is not None and user.is_authenticated:
        actor = getattr(user, "_wrapped", user)
        audit.record(action="auth.logout", category=audit.SECURITY, actor=actor, obj=actor)
    django_logout(http_request)


@transaction.atomic
def change_password(*, user: User, current_password: str, new_password: str) -> None:
    """The user's own change (ACC-08). Also the way out of a temporary password (ACC-05)."""
    if not user.check_password(current_password):
        raise DomainError("auth.wrong_current_password", field="current_password")
    if new_password == current_password:
        raise DomainError("auth.weak_password", field="new_password", reasons=translate("auth.same_password"))
    validate_new_password(new_password, user)
    user.set_password(new_password)
    user.must_change_password = False
    user.temp_password_expires_at = None
    user.save(update_fields=["password", "must_change_password", "temp_password_expires_at"])
    audit.record(action="auth.password_changed", category=audit.SECURITY, actor=user, obj=user)
```

- [ ] **Step 5: Export the services and write the middleware**

Replace `backend/apps/accounts/services/__init__.py` with:

```python
"""Writes of the accounts app. Import names from here: `from apps.accounts import services`."""

from apps.accounts.services.naming import display_name
from apps.accounts.services.signin import authenticate, change_password, end_session, start_session

__all__ = [
    "authenticate",
    "change_password",
    "display_name",
    "end_session",
    "start_session",
]
```

`backend/apps/accounts/middleware.py`:

```python
from django.contrib.auth import logout as django_logout
from django.utils import timezone

from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.audit import services as audit
from apps.settings import services as settings_service

REFRESH_SECONDS = 60  # the session row is rewritten at most once a minute


class InactivityMiddleware:
    """Ends a session that stayed idle longer than the `session_timeout_minutes` setting (ACC-04)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            now = timezone.now().timestamp()
            last = request.session.get(LAST_ACTIVITY_KEY)
            limit = settings_service.get("session_timeout_minutes") * 60
            if last is not None and now - last > limit:
                actor = getattr(user, "_wrapped", user)
                audit.record(action="auth.session_expired", category=audit.SECURITY, actor=actor, obj=actor)
                django_logout(request)
            elif last is None or now - last >= REFRESH_SECONDS:
                request.session[LAST_ACTIVITY_KEY] = now
        return self.get_response(request)
```

In `backend/config/settings.py`, replace `MIDDLEWARE` with:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.InactivityMiddleware",
    "apps.core.middleware.LanguageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts -q`

Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts backend/config/settings.py
git commit -m "feat(accounts): sign-in rules, lock-out, address limit, sessions and inactivity limit"
```

---

### Task 13: Session API: csrf, login, logout, me, password

**Files:**
- Create: `backend/apps/accounts/me.py`, `backend/apps/accounts/services/preferences.py`
- Create: `backend/apps/accounts/api/__init__.py` (empty), `backend/apps/accounts/api/session_serializers.py`, `backend/apps/accounts/api/session_views.py`, `backend/apps/accounts/api/urls.py`
- Modify: `backend/apps/accounts/services/__init__.py`, `backend/config/api_urls.py`
- Test: `backend/apps/accounts/tests/test_session_api.py`

**Interfaces:**
- Consumes: `authenticate`, `start_session`, `end_session`, `change_password` (Task 12); `roles_of`, `workspaces_of`, `WORKSPACE_CHOICES`, `PUBLIC`, `AUTHENTICATED` (Task 9); `employee_directory`, `display_name` (Task 6); `client_ip` (Task 3).
- Produces (master 7.2):
  - Routes `accounts:csrf` (GET, public, returns `{csrf_token}` and sets the `csrftoken` cookie), `accounts:login` (POST, public), `accounts:logout` (POST), `accounts:me` (GET, PATCH), `accounts:password` (POST).
  - `apps.accounts.me.me_payload(user) -> dict`, the `Me` shape: `public_id`, `email`, `name`, `language`, `roles`, `workspaces`, `last_workspace`, `must_change_password`, `previous_login_at`, `password_reset` (`{by, at}` or null), `employee` (`{public_id, name}` or null), `environment`, `version`.
  - `apps.accounts.services.update_preferences(*, user, language=None, last_workspace=None) -> User`.
  - Sign-in failures answer 400 with their code; `auth.rate_limited` answers 429.

- [ ] **Step 1: Write the failing tests**

`backend/apps/accounts/tests/test_session_api.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.tests.world import PASSWORD
from apps.audit.models import AuditEvent
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

CSRF = "/api/v1/auth/csrf"
LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
CHANGE_PASSWORD = "/api/v1/auth/password"
NOTIFICATIONS = "/api/v1/notifications"

OWNER = "employee.a1@impactrisks.com"
NEW_PASSWORD = "Another-Horse-43!"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)

ME_KEYS = {
    "public_id",
    "email",
    "name",
    "language",
    "roles",
    "workspaces",
    "last_workspace",
    "must_change_password",
    "previous_login_at",
    "password_reset",
    "employee",
    "environment",
    "version",
}


def login(client, email=OWNER, password=PASSWORD, **extra):
    return client.post(LOGIN, {"email": email, "password": password}, **extra)


# --- csrf and sign-in ---


def test_the_csrf_endpoint_hands_out_a_token_and_its_cookie(anon_client):
    response = anon_client.get(CSRF)

    assert response.status_code == 200
    assert len(response.json()["csrf_token"]) == 64
    assert "csrftoken" in response.cookies


def test_signing_in_needs_the_csrf_token(world):
    client = APIClient(enforce_csrf_checks=True)

    refused = login(client)
    assert refused.status_code == 403
    assert refused.json()["code"] == "auth.csrf_failed"

    token = client.get(CSRF).json()["csrf_token"]
    assert login(client, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_signing_in_returns_the_user_and_opens_a_browser_session(world, anon_client, settings):
    response = login(anon_client)
    body = response.json()

    assert response.status_code == 200
    assert set(body) == ME_KEYS
    assert body["public_id"] == str(world.owner_user.public_id)
    assert body["email"] == OWNER
    assert body["name"] == "Amal Employee"
    assert body["language"] == settings.DEFAULT_LANGUAGE
    assert body["roles"] == []
    assert body["workspaces"] == []
    assert body["last_workspace"] == ""
    assert body["must_change_password"] is False
    assert body["previous_login_at"] is None
    assert body["password_reset"] is None
    assert body["employee"] is None
    assert body["environment"] == settings.ENVIRONMENT
    assert body["version"] == settings.APP_VERSION

    cookie = response.cookies["sessionid"]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["max-age"] == ""  # no lifetime: the cookie ends with the browser (ACC-04)
    assert cookie["expires"] == ""
    assert bool(cookie["secure"]) is settings.SESSION_COOKIE_SECURE
    assert anon_client.get(ME).status_code == 200


def test_cookies_are_secure_on_every_stack_but_development(settings):
    expected = settings.ENVIRONMENT != "development"

    assert settings.SESSION_COOKIE_SECURE is expected
    assert settings.CSRF_COOKIE_SECURE is expected
    assert settings.SESSION_COOKIE_HTTPONLY is True
    assert settings.SESSION_COOKIE_SAMESITE == "Lax"
    assert settings.SESSION_EXPIRE_AT_BROWSER_CLOSE is True


def test_an_administrator_gets_the_administration_workspace(world, anon_client):
    body = login(anon_client, email="sysadmin@impactrisks.com").json()

    assert body["roles"] == ["sysadmin"]
    assert body["workspaces"] == ["admin"]
    assert body["name"] == "Sonia Admin"


def test_the_second_sign_in_shows_the_time_of_the_first(world):
    with time_machine.travel(START, tick=False) as clock:
        first = login(APIClient()).json()
        clock.shift(timedelta(days=1))
        second = login(APIClient()).json()

    assert first["previous_login_at"] is None
    assert datetime.fromisoformat(second["previous_login_at"]) == START
    assert second["previous_login_at"].endswith("+01:00")  # shown in Africa/Tunis time


def test_a_successful_sign_in_is_audited_with_address_and_reference(world, anon_client):
    response = login(anon_client)

    event = AuditEvent.objects.get(action="auth.login")
    assert event.actor == world.owner_user
    assert event.ip_address == "127.0.0.1"
    assert event.request_id == response["X-Request-ID"]


# --- refusals (UI 4.1) ---


def test_a_wrong_password_and_an_unknown_address_read_the_same(world, anon_client):
    wrong = login(anon_client, password="not-the-password", HTTP_ACCEPT_LANGUAGE="en")
    unknown = login(anon_client, email="nobody@impactrisks.com", HTTP_ACCEPT_LANGUAGE="en")

    assert wrong.status_code == unknown.status_code == 400
    assert wrong.json()["code"] == unknown.json()["code"] == "auth.invalid_credentials"
    assert wrong.json()["detail"] == unknown.json()["detail"] == "Wrong email or password. Check both and try again."


def test_an_address_outside_the_company_is_refused_with_the_reason(world, anon_client):
    body = login(anon_client, email="someone@gmail.com", HTTP_ACCEPT_LANGUAGE="en").json()

    assert body["code"] == "auth.domain_not_allowed"
    assert body["errors"][0]["field"] == "email"
    assert "@impactrisks.com" in body["detail"]


def test_a_locked_account_is_told_until_when(world, anon_client):
    with time_machine.travel(START, tick=False):
        for _ in range(4):
            assert login(anon_client, password="wrong").json()["code"] == "auth.invalid_credentials"
        fifth = login(anon_client, password="wrong", HTTP_ACCEPT_LANGUAGE="en").json()
        with_right_password = login(anon_client).json()

    assert fifth["code"] == "auth.locked"
    assert datetime.fromisoformat(fifth["errors"][0]["params"]["until"]) == START + timedelta(minutes=15)
    assert "06/10/2026 09:15" in fifth["detail"]  # 08:15 UTC, shown in Africa/Tunis time
    assert with_right_password["code"] == "auth.locked"


def test_a_disabled_account_is_told_to_contact_the_administrator(world, anon_client):
    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert login(anon_client).json()["code"] == "auth.disabled"


def test_an_expired_temporary_password_is_told_to_ask_for_a_new_one(world, anon_client):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = timezone.now() - timedelta(minutes=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    assert login(anon_client).json()["code"] == "auth.temp_password_expired"


def test_too_many_attempts_from_one_address_answer_429(world, anon_client):
    settings_service.set_value(actor=world.sysadmin_user, key="login_ip_max_attempts", value=5)
    for number in range(5):
        login(anon_client, email=f"ghost{number}@impactrisks.com")

    response = login(anon_client)

    assert response.status_code == 429
    assert response.json()["code"] == "auth.rate_limited"


def test_missing_fields_are_reported_one_by_one(anon_client):
    response = anon_client.post(LOGIN, {})

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    assert {error["field"] for error in response.json()["errors"]} == {"email", "password"}


# --- me ---


def test_me_needs_a_session(anon_client):
    assert anon_client.get(ME).status_code == 401
    assert anon_client.patch(ME, {"language": "en"}).status_code == 401


def test_the_user_can_change_language_and_last_workspace(world, client_for):
    client = client_for(world.hr_user)

    english = client.patch(ME, {"language": "en"})
    workspace = client.patch(ME, {"last_workspace": "hr"})

    assert english.status_code == 200
    assert english.json()["language"] == "en"
    assert workspace.json()["last_workspace"] == "hr"
    world.hr_user.refresh_from_db()
    assert (world.hr_user.language, world.hr_user.last_workspace) == ("en", "hr")
    assert client.get(ME)["Content-Language"] == "en"


@pytest.mark.parametrize("payload", [{"language": "de"}, {"last_workspace": "finance"}])
def test_an_unknown_language_or_workspace_is_refused(world, client_for, payload):
    response = client_for(world.hr_user).patch(ME, payload)

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    world.hr_user.refresh_from_db()
    assert world.hr_user.last_workspace == ""


def test_the_user_learns_that_an_administrator_reset_the_password(world):
    world.owner_user.password_reset_by = world.sysadmin_user
    world.owner_user.password_reset_at = timezone.now()
    world.owner_user.save(update_fields=["password_reset_by", "password_reset_at"])

    first = login(APIClient()).json()
    second = login(APIClient()).json()

    assert first["password_reset"]["by"] == "Sonia Admin"
    assert first["password_reset"]["at"] is not None
    assert second["password_reset"] is None  # shown at the first sign-in after the reset only


# --- sign-out and dead sessions (Review Focus 3) ---


def test_signing_out_ends_the_session_and_is_audited(world, anon_client):
    login(anon_client)

    response = anon_client.post(LOGOUT)

    assert response.status_code == 204
    assert anon_client.get(ME).status_code == 401
    assert AuditEvent.objects.filter(action="auth.logout", actor=world.owner_user).count() == 1


def test_a_disabled_account_is_signed_out_at_once(world, anon_client):
    login(anon_client)
    assert anon_client.get(ME).status_code == 200

    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert anon_client.get(ME).status_code == 401


def test_changing_the_password_keeps_this_session_and_ends_the_others(world):
    here, there = APIClient(), APIClient()
    login(here)
    login(there)

    response = here.post(CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert response.status_code == 204
    assert here.get(ME).status_code == 200
    assert there.get(ME).status_code == 401
    assert login(APIClient(), password=NEW_PASSWORD).status_code == 200
    assert login(APIClient(), password=PASSWORD).json()["code"] == "auth.invalid_credentials"


def test_a_wrong_current_password_is_reported_on_its_field(world, client_for):
    response = client_for(world.owner_user).post(
        CHANGE_PASSWORD, {"current_password": "wrong", "new_password": NEW_PASSWORD}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "auth.wrong_current_password"
    assert response.json()["errors"][0]["field"] == "current_password"


def test_a_weak_new_password_is_reported_with_the_reasons(world, client_for):
    response = client_for(world.owner_user).post(
        CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "short"}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "auth.weak_password"
    assert response.json()["errors"][0]["field"] == "new_password"
    assert "12" in response.json()["detail"]


def test_until_the_temporary_password_is_replaced_only_the_account_pages_answer(world, anon_client):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = timezone.now() + timedelta(hours=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    assert login(anon_client).json()["must_change_password"] is True
    assert anon_client.get(ME).status_code == 200
    blocked = anon_client.get(NOTIFICATIONS)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "auth.password_change_required"

    changed = anon_client.post(CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert changed.status_code == 204
    assert anon_client.get(NOTIFICATIONS).status_code == 200
    assert anon_client.get(ME).json()["must_change_password"] is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts/tests/test_session_api.py -q`

Expected: FAIL. Every call to an `/api/v1/auth/...` address answers 404 (`core.not_found`), so the assertions on status 200, 204, 400 and 401 fail.

- [ ] **Step 3: Write the `Me` payload and the preferences service**

`backend/apps/accounts/me.py`:

```python
"""What the web app needs to know about the signed-in user (master 7.2, shape `Me`)."""

from django.conf import settings

from apps.accounts.ports import employee_directory
from apps.accounts.roles import roles_of, workspaces_of
from apps.accounts.services.naming import display_name


def _reset_notice(user) -> dict | None:
    """Set when an administrator reset the password since the user's previous sign-in (ACC-07)."""
    if user.password_reset_at is None:
        return None
    if user.previous_login_at is not None and user.password_reset_at <= user.previous_login_at:
        return None
    by = display_name(user.password_reset_by) if user.password_reset_by_id else None
    return {"by": by, "at": user.password_reset_at}


def me_payload(user) -> dict:
    ref = employee_directory().ref_for_user(user.pk)
    return {
        "public_id": user.public_id,
        "email": user.email,
        "name": ref.full_name if ref is not None else (user.full_name or user.email),
        "language": user.language,
        "roles": sorted(roles_of(user)),
        "workspaces": workspaces_of(user),
        "last_workspace": user.last_workspace,
        "must_change_password": user.must_change_password,
        "previous_login_at": user.previous_login_at,
        "password_reset": _reset_notice(user),
        "employee": {"public_id": ref.public_id, "name": ref.full_name} if ref is not None else None,
        "environment": settings.ENVIRONMENT,
        "version": settings.APP_VERSION,
    }
```

`backend/apps/accounts/services/preferences.py`:

```python
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
```

Replace `backend/apps/accounts/services/__init__.py` with:

```python
"""Writes of the accounts app. Import names from here: `from apps.accounts import services`."""

from apps.accounts.services.naming import display_name
from apps.accounts.services.preferences import update_preferences
from apps.accounts.services.signin import authenticate, change_password, end_session, start_session

__all__ = [
    "authenticate",
    "change_password",
    "display_name",
    "end_session",
    "start_session",
    "update_preferences",
]
```

- [ ] **Step 4: Write the serializers**

`backend/apps/accounts/api/session_serializers.py`:

```python
from rest_framework import serializers

from apps.accounts.models import LANGUAGE_CHOICES
from apps.accounts.roles import WORKSPACE_CHOICES


class CsrfOut(serializers.Serializer):
    csrf_token = serializers.CharField()


class LoginIn(serializers.Serializer):
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordResetNoticeOut(serializers.Serializer):
    by = serializers.CharField(allow_null=True)
    at = serializers.DateTimeField()


class EmployeeBriefOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class MeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.CharField()
    language = serializers.ChoiceField(choices=LANGUAGE_CHOICES)
    roles = serializers.ListField(child=serializers.CharField())
    workspaces = serializers.ListField(child=serializers.CharField())
    last_workspace = serializers.CharField(allow_blank=True)
    must_change_password = serializers.BooleanField()
    previous_login_at = serializers.DateTimeField(allow_null=True)
    password_reset = PasswordResetNoticeOut(allow_null=True)
    employee = EmployeeBriefOut(allow_null=True)
    environment = serializers.CharField()
    version = serializers.CharField()


class MePatchIn(serializers.Serializer):
    language = serializers.ChoiceField(choices=LANGUAGE_CHOICES, required=False)
    last_workspace = serializers.ChoiceField(choices=WORKSPACE_CHOICES, required=False)


class PasswordIn(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)
```

- [ ] **Step 5: Write the views and the routes**

`backend/apps/accounts/api/session_views.py`:

```python
from django.contrib.auth import update_session_auth_hash
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services
from apps.accounts.api.session_serializers import CsrfOut, LoginIn, MeOut, MePatchIn, PasswordIn
from apps.accounts.me import me_payload
from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from apps.core.net import client_ip


class CsrfView(APIView):
    """Called once when the web app starts: sets the csrftoken cookie that unsafe calls must echo."""

    access = {"GET": PUBLIC}
    http_method_names = ["get"]

    @extend_schema(operation_id="auth_csrf", responses=CsrfOut)
    def get(self, request):
        return Response(CsrfOut({"csrf_token": get_token(request._request)}).data)


class LoginView(APIView):
    access = {"POST": PUBLIC}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_login", request=LoginIn, responses=MeOut)
    def post(self, request):
        data = LoginIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.authenticate(
            email=data.validated_data["email"],
            password=data.validated_data["password"],
            ip=client_ip(request._request),
        )
        services.start_session(request, user)
        return Response(MeOut(me_payload(user)).data)


class LogoutView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_logout", request=None, responses={204: None})
    def post(self, request):
        services.end_session(request)
        return Response(status=204)


class MeView(APIView):
    access = {"GET": AUTHENTICATED, "PATCH": AUTHENTICATED}
    http_method_names = ["get", "patch"]

    @extend_schema(operation_id="auth_me", responses=MeOut)
    def get(self, request):
        return Response(MeOut(me_payload(request.user)).data)

    @extend_schema(operation_id="auth_me_update", request=MePatchIn, responses=MeOut)
    def patch(self, request):
        data = MePatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.update_preferences(user=request.user, **data.validated_data)
        return Response(MeOut(me_payload(user)).data)


class PasswordView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_password", request=PasswordIn, responses={204: None})
    def post(self, request):
        data = PasswordIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.change_password(user=request.user, **data.validated_data)
        # Changing the password invalidates every session of the user; keep the one that made the change.
        update_session_auth_hash(request._request, request.user)
        return Response(status=204)
```

`backend/apps/accounts/api/urls.py`:

```python
from django.urls import path

from apps.accounts.api import session_views

app_name = "accounts"

urlpatterns = [
    path("auth/csrf", session_views.CsrfView.as_view(), name="csrf"),
    path("auth/login", session_views.LoginView.as_view(), name="login"),
    path("auth/logout", session_views.LogoutView.as_view(), name="logout"),
    path("auth/me", session_views.MeView.as_view(), name="me"),
    path("auth/password", session_views.PasswordView.as_view(), name="password"),
]
```

Replace `backend/config/api_urls.py` with:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.accounts.api.urls")),
    path("", include("apps.notifications.api.urls")),
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts -q`

Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts backend/config/api_urls.py
git commit -m "feat(accounts): session API for csrf, sign-in, sign-out, me and password change"
```

---

### Task 14: Account administration services

**Files:**
- Create: `backend/apps/accounts/services/administration.py`, `backend/apps/accounts/selectors.py`
- Create: `backend/apps/accounts/tests/directory.py`, `backend/apps/accounts/tests/conftest.py`
- Modify: `backend/apps/accounts/services/__init__.py`
- Test: `backend/apps/accounts/tests/test_administration.py`, `backend/apps/accounts/tests/test_selectors.py`

**Interfaces:**
- Consumes: `User`, `RoleAssignment`, `ensure_allowed_email`, `generate_temporary_password`, `employee_directory`, `display_name` (Task 6); `Role`, `ASSIGNABLE`, `users_with_role`, `clear_role_cache` (Task 9); `audit.record` (Task 8); `settings_service.get` (Task 10); `notifications.notify` (Task 11); `authenticate` (Task 12).
- Produces (master 7.2):
  - `apps.accounts.services`: `create_account(*, actor, email="", full_name="", employee_public_id=None, roles=()) -> tuple[User, str]`, `reset_password(*, actor, user) -> str`, `assign_role(*, actor, user, role) -> RoleAssignment`, `remove_role(*, actor, user, role) -> None`, `disable_account(*, actor, user) -> None`, `enable_account(*, actor, user) -> None`, `unlock_account(*, actor, user) -> None`.
  - `apps.accounts.selectors`: `account_state(user, *, now=None) -> str` (`active`, `awaiting_first_sign_in`, `locked`, `disabled`), `accounts(*, search="", state="", role="", now=None) -> QuerySet[User]`, `get_account(public_id) -> User` (raises `NotFound`), `has_employee(user) -> bool`, `accounts_needing_attention(*, now=None) -> dict`, `ACCOUNT_STATE_CHOICES`.
  - Error codes: `accounts.subject_required`, `accounts.email_taken` (409), `accounts.employee_unknown`, `accounts.employee_has_account` (409), `accounts.roles_incompatible`, `accounts.last_sysadmin` (409), `accounts.cannot_change_self`, plus `auth.domain_not_allowed` and `accounts.email_invalid` from the email rule.
  - Security audit actions: `account.created`, `auth.password_reset`, `role.assigned`, `role.removed`, `account.disabled`, `account.enabled`, `account.unlocked`.
  - The `directory` test fixture (a stub `EmployeeDirectory`), for this app's tests.

- [ ] **Step 1: Write the test helpers**

`backend/apps/accounts/tests/directory.py`:

```python
"""A stand-in for the employee directory that the organisation app provides from plan 02."""

from apps.accounts.ports import EmployeeRef


class StubDirectory:
    def __init__(self) -> None:
        self.refs: dict[str, EmployeeRef] = {}  # employees without an account, by public id
        self.linked: dict[int, EmployeeRef] = {}  # user id -> employee

    def add(self, public_id: str, full_name: str, email: str) -> EmployeeRef:
        ref = EmployeeRef(public_id, full_name, email)
        self.refs[public_id] = ref
        return ref

    def candidate(self, public_id: str) -> EmployeeRef | None:
        return self.refs.get(public_id)

    def candidates(self) -> list[EmployeeRef]:
        return list(self.refs.values())

    def link(self, *, user_id: int, public_id: str) -> None:
        self.linked[user_id] = self.refs.pop(public_id)

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        return self.linked.get(user_id)
```

`backend/apps/accounts/tests/conftest.py`:

```python
import pytest

from apps.accounts.ports import employee_directory, set_employee_directory
from apps.accounts.tests.directory import StubDirectory


@pytest.fixture
def directory():
    """Installs a stub employee directory for one test."""
    previous = employee_directory()
    stub = StubDirectory()
    set_employee_directory(stub)
    yield stub
    set_employee_directory(previous)
```

- [ ] **Step 2: Write the failing tests for the services**

`backend/apps/accounts/tests/test_administration.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.accounts import selectors, services
from apps.accounts.models import RoleAssignment, User
from apps.accounts.roles import Role, roles_of
from apps.accounts.tests.world import PASSWORD, make_user
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotFound
from apps.notifications.models import Notification
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)
ME = "/api/v1/auth/me"


def refused(call, **arguments) -> DomainError:
    with pytest.raises(DomainError) as error:
        call(**arguments)
    return error.value


# --- creating an account (ACC-05) ---


def test_an_account_is_created_by_name_and_email_with_a_temporary_password(world):
    with time_machine.travel(START, tick=False):
        user, temporary = services.create_account(
            actor=world.sysadmin_user,
            email=" Leila.Admin@ImpactRisks.com ",
            full_name=" Leila Admin ",
            roles=[Role.EXEC],
        )

    assert user.email == "leila.admin@impactrisks.com"
    assert user.full_name == "Leila Admin"
    assert user.created_by == world.sysadmin_user
    assert user.must_change_password is True
    assert user.temp_password_expires_at == START + timedelta(hours=24)
    assert user.check_password(temporary)
    assert roles_of(user) == {Role.EXEC}
    assert RoleAssignment.objects.get(user=user).assigned_by == world.sysadmin_user
    assert selectors.account_state(user, now=START) == "awaiting_first_sign_in"
    event = AuditEvent.objects.get(action="account.created")
    assert event.category == "security"
    assert event.actor == world.sysadmin_user
    assert event.object_id == str(user.public_id)
    assert event.changes == {"roles": ["exec"], "employee": None}
    assert temporary not in str(list(AuditEvent.objects.values()))


def test_the_temporary_password_lifetime_follows_the_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="temp_password_hours", value=2)

    with time_machine.travel(START, tick=False):
        user, _ = services.create_account(
            actor=world.sysadmin_user, email="short.lived@impactrisks.com", full_name="Short Lived"
        )

    assert user.temp_password_expires_at == START + timedelta(hours=2)


def test_an_account_for_an_employee_takes_name_and_email_from_the_record(world, directory):
    directory.add("emp-1", "Yasmine Trabelsi", "Yasmine.Trabelsi@impactrisks.com")

    user, _ = services.create_account(actor=world.sysadmin_user, employee_public_id="emp-1", roles=[Role.HR])

    assert user.email == "yasmine.trabelsi@impactrisks.com"
    assert user.full_name == "Yasmine Trabelsi"
    assert directory.ref_for_user(user.pk).public_id == "emp-1"
    assert directory.candidate("emp-1") is None
    assert roles_of(user) == {Role.HR}
    assert AuditEvent.objects.get(action="account.created").changes == {"roles": ["hr"], "employee": "emp-1"}


def test_an_employee_who_cannot_receive_an_account_is_refused(world, directory):
    error = refused(services.create_account, actor=world.sysadmin_user, employee_public_id="nobody")

    assert error.code == "accounts.employee_unknown"
    assert error.field == "employee"


def test_an_employee_whose_address_already_has_an_account_is_refused(world, directory):
    directory.add("emp-2", "Amal Employee", "employee.a1@impactrisks.com")

    with pytest.raises(Conflict) as error:
        services.create_account(actor=world.sysadmin_user, employee_public_id="emp-2")

    assert error.value.code == "accounts.employee_has_account"
    assert error.value.field == "employee"
    assert directory.candidate("emp-2") is not None


@pytest.mark.parametrize(
    ("email", "full_name", "field"),
    [("", "Leila Admin", "email"), ("  ", "Leila Admin", "email"), ("leila@impactrisks.com", " ", "full_name")],
)
def test_without_an_employee_a_name_and_an_email_are_needed(world, email, full_name, field):
    error = refused(services.create_account, actor=world.sysadmin_user, email=email, full_name=full_name)

    assert error.code == "accounts.subject_required"
    assert error.field == field


def test_an_address_outside_the_company_is_refused(world):
    error = refused(services.create_account, actor=world.sysadmin_user, email="leila@gmail.com", full_name="Leila")

    assert error.code == "auth.domain_not_allowed"
    assert error.field == "email"


def test_an_address_already_used_is_refused(world):
    with pytest.raises(Conflict) as error:
        services.create_account(actor=world.sysadmin_user, email="Employee.A1@impactrisks.com", full_name="Twin")

    assert error.value.code == "accounts.email_taken"
    assert error.value.field == "email"
    assert error.value.status == 409


def test_hr_and_administrator_cannot_be_given_together(world):
    count = User.objects.count()

    error = refused(
        services.create_account,
        actor=world.sysadmin_user,
        email="both@impactrisks.com",
        full_name="Both Roles",
        roles=[Role.HR, Role.SYSADMIN],
    )

    assert error.code == "accounts.roles_incompatible"
    assert error.field == "roles"
    assert User.objects.count() == count


def test_a_derived_role_cannot_be_given(world):
    with pytest.raises(ValueError, match="derived"):
        services.create_account(
            actor=world.sysadmin_user, email="m@impactrisks.com", full_name="M", roles=[Role.MANAGER]
        )


def test_the_first_administrator_is_created_by_the_system():
    user, temporary = services.create_account(
        actor=None, email="first.admin@impactrisks.com", full_name="First Admin", roles=[Role.SYSADMIN]
    )

    assert user.created_by is None
    assert user.check_password(temporary)
    assert AuditEvent.objects.get(action="account.created").actor is None


# --- resetting a password (ACC-06) ---


def test_a_reset_issues_a_new_temporary_password_and_tells_the_user(world):
    owner = world.owner_user
    owner.failed_attempts = 3
    owner.locked_until = START + timedelta(minutes=10)
    owner.last_login_at = START - timedelta(days=1)
    owner.save()

    with time_machine.travel(START, tick=False):
        temporary = services.reset_password(actor=world.sysadmin_user, user=owner)

    owner.refresh_from_db()
    assert owner.check_password(temporary)
    assert not owner.check_password(PASSWORD)
    assert owner.must_change_password is True
    assert owner.temp_password_expires_at == START + timedelta(hours=24)
    assert owner.password_reset_by == world.sysadmin_user
    assert owner.password_reset_at == START
    assert (owner.failed_attempts, owner.locked_until) == (0, None)
    event = AuditEvent.objects.get(action="auth.password_reset")
    assert (event.actor, event.object_id, event.category) == (world.sysadmin_user, str(owner.public_id), "security")
    notification = Notification.objects.get(user=owner, event_code="account.password_reset")
    assert notification.parameters == {"by": "Sonia Admin"}
    assert temporary not in str(list(AuditEvent.objects.values())) + str(notification.parameters)


def test_the_user_signs_in_with_the_temporary_password_and_must_change_it(world):
    temporary = services.reset_password(actor=world.sysadmin_user, user=world.owner_user)

    user = services.authenticate(email=world.owner_user.email, password=temporary, ip="")

    assert user.must_change_password is True


def test_an_administrator_cannot_reset_their_own_password_here(world):
    error = refused(services.reset_password, actor=world.sysadmin_user, user=world.sysadmin_user)

    assert error.code == "accounts.cannot_change_self"
    assert world.sysadmin_user.check_password(PASSWORD)


def test_a_reset_ends_the_users_sessions(world, client_for):
    client = client_for(world.owner_user)
    assert client.get(ME).status_code == 200

    services.reset_password(actor=world.sysadmin_user, user=world.owner_user)

    assert client.get(ME).status_code == 401


# --- roles (ACC-09, Review Focus 4) ---


def test_assigning_and_removing_a_role_are_audited(world):
    owner = world.owner_user

    assignment = services.assign_role(actor=world.sysadmin_user, user=owner, role=Role.EXEC)
    assert assignment.assigned_by == world.sysadmin_user
    assert roles_of(owner) == {Role.EXEC}

    services.remove_role(actor=world.sysadmin_user, user=owner, role=Role.EXEC)
    assert roles_of(owner) == frozenset()

    removed, assigned = AuditEvent.objects.filter(object_id=str(owner.public_id))
    assert (assigned.action, assigned.changes, assigned.category) == ("role.assigned", {"role": "exec"}, "security")
    assert (removed.action, removed.changes, removed.actor) == ("role.removed", {"role": "exec"}, world.sysadmin_user)


def test_assigning_a_role_twice_changes_nothing(world):
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role=Role.EXEC)
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role="exec")

    assert RoleAssignment.objects.filter(user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="role.assigned").count() == 1


def test_hr_cannot_be_added_to_an_administrator_nor_the_reverse(world):
    other_admin = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    on_admin = refused(services.assign_role, actor=world.sysadmin_user, user=other_admin, role=Role.HR)
    on_hr = refused(services.assign_role, actor=world.sysadmin_user, user=world.hr_user, role=Role.SYSADMIN)

    assert on_admin.code == on_hr.code == "accounts.roles_incompatible"
    assert on_admin.field == "role"
    assert set(other_admin.role_assignments.values_list("role", flat=True)) == {"sysadmin"}
    assert set(world.hr_user.role_assignments.values_list("role", flat=True)) == {"hr"}


def test_executive_management_combines_with_either(world):
    other_admin = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    services.assign_role(actor=world.sysadmin_user, user=world.hr_user, role=Role.EXEC)
    services.assign_role(actor=world.sysadmin_user, user=other_admin, role=Role.EXEC)

    assert roles_of(world.hr_user) == {Role.HR, Role.EXEC}
    assert roles_of(other_admin) == {Role.SYSADMIN, Role.EXEC}


def test_an_administrator_cannot_change_their_own_roles(world):
    admin = world.sysadmin_user

    giving = refused(services.assign_role, actor=admin, user=admin, role=Role.EXEC)
    dropping = refused(services.remove_role, actor=admin, user=admin, role=Role.SYSADMIN)

    assert giving.code == dropping.code == "accounts.cannot_change_self"
    assert set(admin.role_assignments.values_list("role", flat=True)) == {"sysadmin"}


def test_the_last_active_administrator_keeps_the_role(world):
    with pytest.raises(Conflict) as error:
        services.remove_role(actor=world.exec_user, user=world.sysadmin_user, role=Role.SYSADMIN)

    assert error.value.code == "accounts.last_sysadmin"
    assert RoleAssignment.objects.filter(user=world.sysadmin_user, role="sysadmin").exists()


def test_a_disabled_administrator_does_not_count_as_another_one(world):
    make_user("gone.admin@impactrisks.com", roles=["sysadmin"], is_active=False)

    with pytest.raises(Conflict):
        services.remove_role(actor=world.exec_user, user=world.sysadmin_user, role=Role.SYSADMIN)


def test_with_a_second_active_administrator_the_role_can_be_removed(world):
    second = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    services.remove_role(actor=second, user=world.sysadmin_user, role=Role.SYSADMIN)

    assert not RoleAssignment.objects.filter(user=world.sysadmin_user).exists()


def test_removing_a_role_that_is_not_held_is_not_found(world):
    with pytest.raises(NotFound):
        services.remove_role(actor=world.sysadmin_user, user=world.owner_user, role=Role.HR)


# --- disabling, enabling, unlocking ---


def test_disabling_an_account_is_audited_and_ends_its_sessions(world, client_for):
    client = client_for(world.owner_user)
    assert client.get(ME).status_code == 200

    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    world.owner_user.refresh_from_db()
    assert world.owner_user.is_active is False
    assert client.get(ME).status_code == 401
    event = AuditEvent.objects.get(action="account.disabled")
    assert (event.actor, event.object_id) == (world.sysadmin_user, str(world.owner_user.public_id))


def test_disabling_twice_records_once(world):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert AuditEvent.objects.filter(action="account.disabled").count() == 1


def test_the_last_active_administrator_cannot_be_disabled(world):
    with pytest.raises(Conflict) as error:
        services.disable_account(actor=world.exec_user, user=world.sysadmin_user)

    assert error.value.code == "accounts.last_sysadmin"
    world.sysadmin_user.refresh_from_db()
    assert world.sysadmin_user.is_active is True


def test_an_administrator_cannot_disable_themselves(world):
    make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    error = refused(services.disable_account, actor=world.sysadmin_user, user=world.sysadmin_user)

    assert error.code == "accounts.cannot_change_self"


def test_the_system_can_disable_an_account(world):
    services.disable_account(actor=None, user=world.owner_user)

    assert AuditEvent.objects.get(action="account.disabled").actor is None


def test_enabling_an_account_lets_the_user_sign_in_again(world):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    services.enable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="") == world.owner_user
    assert AuditEvent.objects.filter(action="account.enabled", actor=world.sysadmin_user).count() == 1


def test_unlocking_an_account_lets_the_user_sign_in_at_once(world):
    for _ in range(5):
        with pytest.raises(DomainError):
            services.authenticate(email=world.owner_user.email, password="wrong", ip="")
    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until is not None

    services.unlock_account(actor=world.sysadmin_user, user=world.owner_user)

    assert services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="") == world.owner_user
    assert AuditEvent.objects.filter(action="account.unlocked", actor=world.sysadmin_user).count() == 1
```

`backend/apps/accounts/tests/test_selectors.py`:

```python
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from apps.accounts import selectors
from apps.accounts.tests.world import make_user
from apps.core.errors import NotFound

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


@pytest.fixture
def accounts():
    return {
        "active": make_user("a.active@impactrisks.com", full_name="Alia Active", last_login_at=NOW),
        "awaiting": make_user(
            "b.awaiting@impactrisks.com",
            full_name="Bechir Awaiting",
            must_change_password=True,
            temp_password_expires_at=NOW + timedelta(hours=5),
        ),
        "expired": make_user(
            "c.expired@impactrisks.com",
            full_name="Chiraz Expired",
            must_change_password=True,
            temp_password_expires_at=NOW - timedelta(hours=1),
        ),
        "locked": make_user(
            "d.locked@impactrisks.com", full_name="Dali Locked", locked_until=NOW + timedelta(minutes=5), roles=["hr"]
        ),
        "was_locked": make_user(
            "e.unlocked@impactrisks.com", full_name="Emna Unlocked", locked_until=NOW - timedelta(minutes=5)
        ),
        "disabled": make_user(
            "f.disabled@impactrisks.com",
            full_name="Fares Disabled",
            is_active=False,
            locked_until=NOW + timedelta(minutes=5),
            roles=["sysadmin"],
        ),
    }


def test_the_state_of_an_account(accounts):
    states = {name: selectors.account_state(user, now=NOW) for name, user in accounts.items()}

    assert states == {
        "active": "active",
        "awaiting": "awaiting_first_sign_in",
        "expired": "awaiting_first_sign_in",
        "locked": "locked",
        "was_locked": "active",
        "disabled": "disabled",
    }


@pytest.mark.parametrize(
    ("state", "names"),
    [
        ("active", {"active", "was_locked"}),
        ("awaiting_first_sign_in", {"awaiting", "expired"}),
        ("locked", {"locked"}),
        ("disabled", {"disabled"}),
    ],
)
def test_accounts_can_be_filtered_by_state(accounts, state, names):
    found = set(selectors.accounts(state=state, now=NOW))

    assert found == {accounts[name] for name in names}


def test_the_filter_and_the_state_agree_for_every_account(accounts):
    for user in accounts.values():
        state = selectors.account_state(user, now=NOW)
        assert user in selectors.accounts(state=state, now=NOW)


def test_accounts_can_be_searched_by_name_or_email_and_filtered_by_role(accounts):
    assert list(selectors.accounts(search="chiraz")) == [accounts["expired"]]
    assert list(selectors.accounts(search=" D.LOCKED@ ")) == [accounts["locked"]]
    assert list(selectors.accounts(role="hr")) == [accounts["locked"]]
    assert list(selectors.accounts(role="sysadmin", state="disabled", now=NOW)) == [accounts["disabled"]]
    assert list(selectors.accounts(search="nobody")) == []


def test_accounts_are_listed_by_email(accounts):
    emails = [user.email for user in selectors.accounts()]

    assert emails == sorted(emails)
    assert len(emails) == 6


def test_a_derived_role_is_not_a_filter(accounts):
    with pytest.raises(ValueError):
        selectors.accounts(role="manager")


def test_get_account_finds_by_public_id_or_raises_not_found(accounts):
    user = accounts["active"]

    assert selectors.get_account(user.public_id) == user
    assert selectors.get_account(str(user.public_id)) == user
    with pytest.raises(NotFound):
        selectors.get_account(uuid.uuid4())
    with pytest.raises(NotFound):
        selectors.get_account("not-a-uuid")


def test_accounts_needing_attention(accounts, directory):
    directory.add("emp-9", "Ines Sans Compte", "ines@impactrisks.com")

    report = selectors.accounts_needing_attention(now=NOW)

    assert [row["email"] for row in report["locked"]] == ["d.locked@impactrisks.com"]
    assert [row["email"] for row in report["awaiting_first_sign_in"]] == ["b.awaiting@impactrisks.com"]
    assert [row["email"] for row in report["temp_expired"]] == ["c.expired@impactrisks.com"]
    assert report["employees_without_account"] == [
        {"public_id": "emp-9", "name": "Ines Sans Compte", "email": "ines@impactrisks.com"}
    ]
    assert report["locked"][0] == {
        "public_id": str(accounts["locked"].public_id),
        "name": "Dali Locked",
        "email": "d.locked@impactrisks.com",
    }


def test_has_employee_asks_the_directory(accounts, directory):
    user = accounts["active"]
    assert selectors.has_employee(user) is False

    directory.add("emp-1", "Alia Active", user.email)
    directory.link(user_id=user.pk, public_id="emp-1")

    assert selectors.has_employee(user) is True
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts/tests/test_administration.py apps/accounts/tests/test_selectors.py -q`

Expected: FAIL. `test_selectors.py` fails during collection with `ImportError: cannot import name 'selectors' from 'apps.accounts'`; so does `test_administration.py`.

- [ ] **Step 4: Write `backend/apps/accounts/selectors.py`**

```python
"""Reads of the accounts app."""

from datetime import datetime

from django.core.exceptions import ValidationError
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role
from apps.accounts.services.naming import display_name
from apps.core.errors import NotFound

STATES = ("active", "awaiting_first_sign_in", "locked", "disabled")
ACCOUNT_STATE_CHOICES = [(state, state) for state in STATES]


def account_state(user: User, *, now: datetime | None = None) -> str:
    """One word for the Accounts page (UI 9.2). Disabled wins over locked, locked over awaiting."""
    now = now or timezone.now()
    if not user.is_active:
        return "disabled"
    if user.locked_until is not None and user.locked_until > now:
        return "locked"
    if user.must_change_password and user.last_login_at is None:
        return "awaiting_first_sign_in"
    return "active"


def _state_filter(state: str, now: datetime) -> Q:
    locked = Q(locked_until__gt=now)
    awaiting = Q(must_change_password=True, last_login_at__isnull=True)
    if state == "disabled":
        return Q(is_active=False)
    if state == "locked":
        return Q(is_active=True) & locked
    if state == "awaiting_first_sign_in":
        return Q(is_active=True) & ~locked & awaiting
    if state == "active":
        return Q(is_active=True) & ~locked & ~awaiting
    raise ValueError(f"Unknown account state: {state}")


def accounts(*, search: str = "", state: str = "", role: str = "", now: datetime | None = None) -> QuerySet[User]:
    """Accounts ordered by email, optionally narrowed by a search term, a state and an assignable role."""
    found = User.objects.all()
    term = (search or "").strip()
    if term:
        found = found.filter(Q(email__icontains=term) | Q(full_name__icontains=term))
    if state:
        found = found.filter(_state_filter(state, now or timezone.now()))
    if role:
        wanted = Role(role)
        if wanted not in ASSIGNABLE:
            raise ValueError(f"{wanted.value} is a derived role and cannot be filtered on")
        found = found.filter(role_assignments__role=wanted.value)
    return found.distinct()


def get_account(public_id) -> User:
    try:
        return User.objects.get(public_id=public_id)
    except (User.DoesNotExist, ValueError, ValidationError):
        raise NotFound() from None


def has_employee(user: User) -> bool:
    return employee_directory().ref_for_user(user.pk) is not None


def _brief(user: User) -> dict[str, str]:
    return {"public_id": str(user.public_id), "name": display_name(user), "email": user.email}


def accounts_needing_attention(*, now: datetime | None = None) -> dict[str, list[dict[str, str]]]:
    """Who cannot get in (UI 9.1): locked accounts, unused or expired temporary passwords, employees without account."""
    now = now or timezone.now()
    active = User.objects.filter(is_active=True)
    never_signed_in = active.filter(must_change_password=True, last_login_at__isnull=True)
    expired = active.filter(must_change_password=True, temp_password_expires_at__lte=now)
    return {
        "locked": [_brief(user) for user in active.filter(locked_until__gt=now)],
        "awaiting_first_sign_in": [
            _brief(user) for user in never_signed_in.exclude(temp_password_expires_at__lte=now)
        ],
        "temp_expired": [_brief(user) for user in expired],
        "employees_without_account": [
            {"public_id": ref.public_id, "name": ref.full_name, "email": ref.email}
            for ref in employee_directory().candidates()
        ],
    }
```

- [ ] **Step 5: Write `backend/apps/accounts/services/administration.py`**

```python
"""What the System Administrator does to accounts (ACC-05, ACC-06, ACC-09, ACC-10)."""

from collections.abc import Iterable
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.emails import ensure_allowed_email
from apps.accounts.models import RoleAssignment, User
from apps.accounts.passwords import generate_temporary_password
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role, clear_role_cache, users_with_role
from apps.accounts.services.naming import display_name
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotFound
from apps.notifications import services as notifications
from apps.settings import services as settings_service

# One account cannot hold both (PRD section 3).
INCOMPATIBLE = frozenset({Role.HR, Role.SYSADMIN})


def _assignable(role: Role | str) -> Role:
    role = Role(role)
    if role not in ASSIGNABLE:
        raise ValueError(f"{role.value} is a derived role and cannot be assigned")
    return role


def _not_self(actor: User | None, user: User) -> None:
    """An administrator never changes their own access: a second administrator has to."""
    if actor is not None and actor.pk == user.pk:
        raise DomainError("accounts.cannot_change_self")


def _held(user: User) -> set[Role]:
    return {Role(value) for value in RoleAssignment.objects.filter(user=user).values_list("role", flat=True)}


def _keep_an_administrator(user: User) -> None:
    """Refuses a change that would leave no active System Administrator."""
    if not user.is_active or Role.SYSADMIN not in _held(user):
        return
    if not users_with_role(Role.SYSADMIN).exclude(pk=user.pk).exists():
        raise Conflict("accounts.last_sysadmin")


def _issue_temporary_password(user: User) -> str:
    """Sets a temporary password on the (unsaved or loaded) user and returns it. The caller saves."""
    temporary = generate_temporary_password()
    user.set_password(temporary)
    user.must_change_password = True
    user.temp_password_expires_at = timezone.now() + timedelta(hours=settings_service.get("temp_password_hours"))
    return temporary


@transaction.atomic
def create_account(
    *,
    actor: User | None,
    email: str = "",
    full_name: str = "",
    employee_public_id: str | None = None,
    roles: Iterable[Role | str] = (),
) -> tuple[User, str]:
    """Creates an account for an employee record, or for a name and an email. Returns (user, temporary password).

    The temporary password is returned once and stored only as a hash; nobody can read it again (ACC-06).
    `actor=None` is the system creating the first administrator.
    """
    wanted = {_assignable(role) for role in roles}
    if INCOMPATIBLE <= wanted:
        raise DomainError("accounts.roles_incompatible", field="roles")

    if employee_public_id:
        ref = employee_directory().candidate(str(employee_public_id))
        if ref is None:
            raise DomainError("accounts.employee_unknown", field="employee")
        address = ensure_allowed_email(ref.email, field="employee")
        name = ref.full_name
        if User.objects.filter(email=address).exists():
            raise Conflict("accounts.employee_has_account", field="employee")
    else:
        if not (email or "").strip():
            raise DomainError("accounts.subject_required", field="email")
        if not (full_name or "").strip():
            raise DomainError("accounts.subject_required", field="full_name")
        address = ensure_allowed_email(email)
        name = full_name.strip()
        if User.objects.filter(email=address).exists():
            raise Conflict("accounts.email_taken", field="email")

    user = User(email=address, full_name=name, created_by=actor)
    temporary = _issue_temporary_password(user)
    user.save()
    if employee_public_id:
        employee_directory().link(user_id=user.pk, public_id=str(employee_public_id))
    for role in sorted(wanted):
        RoleAssignment.objects.create(user=user, role=role.value, assigned_by=actor)
    audit.record(
        action="account.created",
        category=audit.SECURITY,
        actor=actor,
        obj=user,
        changes={
            "roles": sorted(role.value for role in wanted),
            "employee": str(employee_public_id) if employee_public_id else None,
        },
    )
    return user, temporary


@transaction.atomic
def reset_password(*, actor: User, user: User) -> str:
    """Issues a new temporary password, unlocks the account and tells the user. Ends the user's sessions."""
    _not_self(actor, user)
    temporary = _issue_temporary_password(user)
    user.password_reset_by = actor
    user.password_reset_at = timezone.now()
    user.failed_attempts = 0
    user.locked_until = None
    user.save(
        update_fields=[
            "password",
            "must_change_password",
            "temp_password_expires_at",
            "password_reset_by",
            "password_reset_at",
            "failed_attempts",
            "locked_until",
        ]
    )
    audit.record(action="auth.password_reset", category=audit.SECURITY, actor=actor, obj=user)
    notifications.notify(
        users=[user],
        event="account.password_reset",
        params={"by": display_name(actor)},
        target_type="account",
        target_public_id=str(user.public_id),
    )
    return temporary


@transaction.atomic
def assign_role(*, actor: User | None, user: User, role: Role | str) -> RoleAssignment:
    role = _assignable(role)
    _not_self(actor, user)
    if role in INCOMPATIBLE and (INCOMPATIBLE - {role}) & _held(user):
        raise DomainError("accounts.roles_incompatible", field="role")
    assignment, created = RoleAssignment.objects.get_or_create(
        user=user, role=role.value, defaults={"assigned_by": actor}
    )
    if created:
        audit.record(
            action="role.assigned", category=audit.SECURITY, actor=actor, obj=user, changes={"role": role.value}
        )
    clear_role_cache(user)
    return assignment


@transaction.atomic
def remove_role(*, actor: User, user: User, role: Role | str) -> None:
    role = _assignable(role)
    _not_self(actor, user)
    assignment = RoleAssignment.objects.filter(user=user, role=role.value).first()
    if assignment is None:
        raise NotFound()
    if role == Role.SYSADMIN:
        _keep_an_administrator(user)
    assignment.delete()
    audit.record(action="role.removed", category=audit.SECURITY, actor=actor, obj=user, changes={"role": role.value})
    clear_role_cache(user)


@transaction.atomic
def disable_account(*, actor: User | None, user: User) -> None:
    """Stops the account from signing in. Its open sessions end at their next request (ACC-04)."""
    _not_self(actor, user)
    if not user.is_active:
        return
    _keep_an_administrator(user)
    user.is_active = False
    user.save(update_fields=["is_active"])
    audit.record(action="account.disabled", category=audit.SECURITY, actor=actor, obj=user)


@transaction.atomic
def enable_account(*, actor: User, user: User) -> None:
    if user.is_active:
        return
    user.is_active = True
    user.save(update_fields=["is_active"])
    audit.record(action="account.enabled", category=audit.SECURITY, actor=actor, obj=user)


@transaction.atomic
def unlock_account(*, actor: User, user: User) -> None:
    user.failed_attempts = 0
    user.locked_until = None
    user.save(update_fields=["failed_attempts", "locked_until"])
    audit.record(action="account.unlocked", category=audit.SECURITY, actor=actor, obj=user)
```

Replace `backend/apps/accounts/services/__init__.py` with:

```python
"""Writes of the accounts app. Import names from here: `from apps.accounts import services`."""

from apps.accounts.services.administration import (
    assign_role,
    create_account,
    disable_account,
    enable_account,
    remove_role,
    reset_password,
    unlock_account,
)
from apps.accounts.services.naming import display_name
from apps.accounts.services.preferences import update_preferences
from apps.accounts.services.signin import authenticate, change_password, end_session, start_session

__all__ = [
    "assign_role",
    "authenticate",
    "change_password",
    "create_account",
    "disable_account",
    "display_name",
    "enable_account",
    "end_session",
    "remove_role",
    "reset_password",
    "start_session",
    "unlock_account",
    "update_preferences",
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts -q`

Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts
git commit -m "feat(accounts): account administration with temporary passwords, roles and guards"
```

---

### Task 15: Audit API and Excel export

**Files:**
- Create: `backend/apps/audit/messages.py`, `backend/apps/audit/exports.py`
- Create: `backend/apps/audit/api/__init__.py` (empty), `backend/apps/audit/api/serializers.py`, `backend/apps/audit/api/views.py`, `backend/apps/audit/api/urls.py`
- Modify: `backend/apps/audit/apps.py`, `backend/config/api_urls.py`
- Test: `backend/apps/audit/tests/test_api.py`

**Interfaces:**
- Consumes: `selectors.list_events`, `audit.record` (Task 8); `display_name` (Task 6); `Role` (Task 9); `paginate`, `paginated`, `PAGE_PARAMETERS`, `Column`, `build_workbook` (Task 5); `translate` (Task 4).
- Produces (master 7.3):
  - Routes `audit:business` (GET: HR, EXEC), `audit:security` (GET: SYSADMIN, EXEC), `audit:business-export`, `audit:security-export` (same access; an Excel file).
  - Query filters on all four: `actor` (account public id), `action`, `object_type`, `object_id`, `from`, `to` (local days, both included).
  - `apps.audit.api.serializers.AuditEventOut`: `{id, at, actor, category, action, object_type, object_id, object_label, changes, ip_address, request_id}`; `actor` is a display name, or null for the system. Other apps reuse it for histories.
  - `apps.audit.exports.export_events(*, actor, category, events, filters) -> tuple[bytes, str]` (workbook, file name). Each export writes an `audit.exported` event in the category it exported.
  - Error code `audit.period_order` (field `to`).

- [ ] **Step 1: Write the failing tests**

`backend/apps/audit/tests/test_api.py`:

```python
import json
import uuid
from datetime import UTC, datetime
from io import BytesIO

import pytest
import time_machine
from openpyxl import load_workbook

from apps.audit import services as audit
from apps.audit.models import AuditEvent
from apps.core import context

pytestmark = pytest.mark.django_db

BUSINESS = "/api/v1/audit/business"
SECURITY = "/api/v1/audit/security"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
EVENT_KEYS = {
    "id",
    "at",
    "actor",
    "category",
    "action",
    "object_type",
    "object_id",
    "object_label",
    "changes",
    "ip_address",
    "request_id",
}


def at(day: int) -> datetime:
    return datetime(2026, 10, day, 10, 0, tzinfo=UTC)


@pytest.fixture
def events(world):
    """Three business events (one by the system) and one security event, on different days."""
    with time_machine.travel(at(1), tick=False):
        world.updated = audit.record(
            action="employee.updated",
            object_type="employee",
            object_id="emp-1",
            object_label="Amal Employee",
            changes={"phone": {"before": "111", "after": "222"}},
            actor=world.hr_user,
        )
    with time_machine.travel(at(3), tick=False):
        world.archived = audit.record(
            action="employee.archived",
            object_type="employee",
            object_id="emp-1",
            object_label="Amal Employee",
            actor=world.hr_user,
        )
    with time_machine.travel(at(4), tick=False):
        world.credited = audit.record(action="credit.posted", object_type="ledger", object_id="7", actor=None)
    with time_machine.travel(at(5), tick=False), context.overriding(ip="10.0.0.9", request_id="rid-9"):
        world.assigned = audit.record(
            action="role.assigned",
            category=audit.SECURITY,
            obj=world.owner_user,
            changes={"role": "exec"},
            actor=world.sysadmin_user,
        )
    return world


def test_hr_reads_business_events_newest_first(events, client_for):
    body = client_for(events.hr_user).get(BUSINESS).json()

    assert set(body) == {"count", "next", "previous", "results"}
    assert body["count"] == 3
    assert [event["action"] for event in body["results"]] == ["credit.posted", "employee.archived", "employee.updated"]
    oldest = body["results"][2]
    assert set(oldest) == EVENT_KEYS
    assert oldest["actor"] == "Senna RH"
    assert oldest["category"] == "business"
    assert (oldest["object_type"], oldest["object_id"], oldest["object_label"]) == ("employee", "emp-1", "Amal Employee")
    assert oldest["changes"] == {"phone": {"before": "111", "after": "222"}}
    assert datetime.fromisoformat(oldest["at"]) == at(1)
    assert body["results"][0]["actor"] is None  # the system


def test_the_security_log_holds_security_events_only(events, client_for):
    body = client_for(events.sysadmin_user).get(SECURITY).json()

    assert body["count"] == 1
    event = body["results"][0]
    assert event["action"] == "role.assigned"
    assert event["actor"] == "Sonia Admin"
    assert event["object_id"] == str(events.owner_user.public_id)
    assert event["ip_address"] == "10.0.0.9"
    assert event["request_id"] == "rid-9"


def test_each_log_is_closed_to_the_other_role(events, client_for):
    assert client_for(events.hr_user).get(SECURITY).status_code == 403
    assert client_for(events.sysadmin_user).get(BUSINESS).status_code == 403
    assert client_for(events.owner_user).get(BUSINESS).status_code == 403
    assert client_for(events.exec_user).get(BUSINESS).status_code == 200
    assert client_for(events.exec_user).get(SECURITY).status_code == 200


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ({"action": "employee.archived"}, ["employee.archived"]),
        ({"object_type": "employee", "object_id": "emp-1"}, ["employee.archived", "employee.updated"]),
        ({"object_type": "ledger"}, ["credit.posted"]),
        ({"from": "2026-10-02", "to": "2026-10-03"}, ["employee.archived"]),
        ({"from": "2026-10-04"}, ["credit.posted"]),
        ({"to": "2026-10-01"}, ["employee.updated"]),
        ({"action": "nothing.like.this"}, []),
    ],
)
def test_the_list_can_be_filtered(events, client_for, query, expected):
    body = client_for(events.hr_user).get(BUSINESS, query).json()

    assert [event["action"] for event in body["results"]] == expected


def test_the_list_can_be_filtered_by_actor(events, client_for):
    client = client_for(events.hr_user)

    by_hr = client.get(BUSINESS, {"actor": str(events.hr_user.public_id)}).json()
    by_nobody = client.get(BUSINESS, {"actor": str(uuid.uuid4())}).json()

    assert [event["action"] for event in by_hr["results"]] == ["employee.archived", "employee.updated"]
    assert by_nobody["count"] == 0


@pytest.mark.parametrize(
    ("query", "code", "field"),
    [
        ({"from": "2026-10-05", "to": "2026-10-01"}, "audit.period_order", "to"),
        ({"from": "yesterday"}, "core.validation", "from"),
        ({"actor": "not-a-uuid"}, "core.validation", "actor"),
    ],
)
def test_a_wrong_filter_is_explained(events, client_for, query, code, field):
    response = client_for(events.hr_user).get(BUSINESS, query)

    assert response.status_code == 400
    assert response.json()["code"] == code
    assert response.json()["errors"][0]["field"] == field


def test_the_filtered_list_can_be_exported_to_excel(events, client_for):
    events.hr_user.language = "en"
    events.hr_user.save(update_fields=["language"])

    response = client_for(events.hr_user).get(f"{BUSINESS}/export", {"object_type": "employee"})

    assert response.status_code == 200
    assert response["Content-Type"] == XLSX
    disposition = response["Content-Disposition"]
    assert disposition.startswith('attachment; filename="business-log-')
    assert disposition.endswith('.xlsx"')
    sheet = load_workbook(BytesIO(response.content)).active
    assert sheet.title == "Activity log"
    assert [cell.value for cell in sheet[1]] == [
        "When",
        "Who",
        "Action",
        "Kind of item",
        "Item",
        "Changes",
        "Network address",
        "Reference",
    ]
    assert sheet.max_row == 3
    assert (sheet["B2"].value, sheet["C2"].value, sheet["E2"].value) == ("Senna RH", "employee.archived", "Amal Employee")
    assert sheet["A3"].value == datetime(2026, 10, 1, 11, 0)  # 10:00 UTC, written in Africa/Tunis time
    assert json.loads(sheet["F3"].value) == {"phone": {"before": "111", "after": "222"}}


def test_an_export_is_itself_audited_with_its_filters(events, client_for):
    client_for(events.hr_user).get(f"{BUSINESS}/export", {"object_type": "employee", "from": "2026-10-01"})
    client_for(events.sysadmin_user).get(f"{SECURITY}/export")

    business = AuditEvent.objects.get(action="audit.exported", category="business")
    security = AuditEvent.objects.get(action="audit.exported", category="security")
    assert business.actor == events.hr_user
    assert business.changes == {"filters": {"object_type": "employee", "from": "2026-10-01"}, "rows": 2}
    assert security.actor == events.sysadmin_user
    assert security.changes == {"filters": {}, "rows": 1}


def test_the_export_is_written_in_the_readers_language_and_names_the_system(events, client_for):
    events.hr_user.language = "fr"
    events.hr_user.save(update_fields=["language"])

    response = client_for(events.hr_user).get(f"{BUSINESS}/export", {"object_type": "ledger"})

    sheet = load_workbook(BytesIO(response.content)).active
    assert sheet.title == "Journal d'activité"
    assert sheet["A1"].value == "Date et heure"
    assert sheet["B2"].value == "Système"


def test_exports_follow_the_same_access_as_the_lists(events, client_for, anon_client):
    assert client_for(events.hr_user).get(f"{SECURITY}/export").status_code == 403
    assert client_for(events.sysadmin_user).get(f"{BUSINESS}/export").status_code == 403
    assert anon_client.get(f"{BUSINESS}/export").status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/audit/tests/test_api.py -q`

Expected: FAIL. The addresses under `/api/v1/audit/` answer 404, so every assertion on status or body fails.

- [ ] **Step 3: Write the messages and register them**

`backend/apps/audit/messages.py`:

```python
MESSAGES = {
    "audit.period_order": {
        "en": "The end date is before the start date. Swap them or change one.",
        "fr": "La date de fin précède la date de début. Inversez-les ou modifiez l'une d'elles.",
    },
    "audit.system": {"en": "System", "fr": "Système"},
    "audit.sheet.business": {"en": "Activity log", "fr": "Journal d'activité"},
    "audit.sheet.security": {"en": "Security log", "fr": "Journal de sécurité"},
    "audit.column.at": {"en": "When", "fr": "Date et heure"},
    "audit.column.actor": {"en": "Who", "fr": "Auteur"},
    "audit.column.action": {"en": "Action", "fr": "Action"},
    "audit.column.object_type": {"en": "Kind of item", "fr": "Type d'élément"},
    "audit.column.object_label": {"en": "Item", "fr": "Élément"},
    "audit.column.changes": {"en": "Changes", "fr": "Modifications"},
    "audit.column.ip_address": {"en": "Network address", "fr": "Adresse réseau"},
    "audit.column.request_id": {"en": "Reference", "fr": "Référence"},
}
```

Replace `backend/apps/audit/apps.py` with:

```python
from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "apps.audit"
    label = "audit"

    def ready(self) -> None:
        from apps.audit.messages import MESSAGES
        from apps.core.i18n import register_messages

        register_messages(MESSAGES)
```

- [ ] **Step 4: Write the export**

`backend/apps/audit/exports.py`:

```python
"""Excel export of a filtered audit list (UI 7.11 and 9.6). The export itself is audited (AUD-02)."""

import json
from collections.abc import Mapping
from typing import Any

from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.services import display_name
from apps.audit import services as audit
from apps.audit.models import AuditEvent
from apps.core.i18n import translate
from apps.core.xlsx import Column, build_workbook

EXPORT_LIMIT = 10_000  # the newest events of the filtered list; narrow the period to get older ones

_COLUMNS = (
    ("at", "datetime"),
    ("actor", "text"),
    ("action", "text"),
    ("object_type", "text"),
    ("object_label", "text"),
    ("changes", "text"),
    ("ip_address", "text"),
    ("request_id", "text"),
)


def _row(event: AuditEvent) -> dict[str, Any]:
    return {
        "at": event.at,
        "actor": display_name(event.actor) if event.actor_id else translate("audit.system"),
        "action": event.action,
        "object_type": event.object_type,
        "object_label": event.object_label,
        "changes": json.dumps(event.changes, ensure_ascii=False, sort_keys=True) if event.changes else "",
        "ip_address": event.ip_address or "",
        "request_id": event.request_id,
    }


def export_events(
    *, actor, category: str, events: QuerySet[AuditEvent], filters: Mapping[str, Any]
) -> tuple[bytes, str]:
    """Returns (workbook, file name). Headers are in the active language."""
    rows = [_row(event) for event in events[:EXPORT_LIMIT]]
    columns = [Column(key, translate(f"audit.column.{key}"), kind) for key, kind in _COLUMNS]
    content = build_workbook(title=translate(f"audit.sheet.{category}"), columns=columns, rows=rows)
    audit.record(
        action="audit.exported",
        category=category,
        actor=actor,
        object_type="audit_log",
        object_id=category,
        object_label=category,
        changes={"filters": {name: str(value) for name, value in filters.items()}, "rows": len(rows)},
    )
    return content, f"{category}-log-{timezone.localdate().isoformat()}.xlsx"
```

- [ ] **Step 5: Write the serializers, the views and the routes**

`backend/apps/audit/api/serializers.py`:

```python
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.services import display_name
from apps.audit.models import AuditEvent


class AuditEventOut(serializers.Serializer):
    id = serializers.IntegerField()
    at = serializers.DateTimeField()
    actor = serializers.SerializerMethodField()
    category = serializers.ChoiceField(choices=AuditEvent.Category.choices)
    action = serializers.CharField()
    object_type = serializers.CharField(allow_blank=True)
    object_id = serializers.CharField(allow_blank=True)
    object_label = serializers.CharField(allow_blank=True)
    changes = serializers.JSONField()
    ip_address = serializers.CharField(allow_null=True)
    request_id = serializers.CharField(allow_blank=True)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_actor(self, event) -> str | None:
        """The actor's display name; null when the system acted."""
        return display_name(event.actor) if event.actor_id else None


class AuditFilterIn(serializers.Serializer):
    actor = serializers.UUIDField(required=False)
    action = serializers.CharField(required=False)
    object_type = serializers.CharField(required=False)
    object_id = serializers.CharField(required=False)
    to = serializers.DateField(required=False)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.DateField(required=False)  # "from" cannot be a class attribute in Python
        return fields
```

`backend/apps/audit/api/views.py`:

```python
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.audit import selectors
from apps.audit import services as audit
from apps.audit.api.serializers import AuditEventOut, AuditFilterIn
from apps.audit.exports import export_events
from apps.core.errors import DomainError
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
BUSINESS_READERS = {Role.HR, Role.EXEC}
SECURITY_READERS = {Role.SYSADMIN, Role.EXEC}


def _filtered(request, category: str):
    """Returns (the filters given, the matching events)."""
    serializer = AuditFilterIn(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    given = serializer.validated_data
    date_from, date_to = given.get("from"), given.get("to")
    if date_from and date_to and date_from > date_to:
        raise DomainError("audit.period_order", field="to")
    events = selectors.list_events(
        category=category,
        actor_public_id=given.get("actor"),
        action=given.get("action", ""),
        object_type=given.get("object_type", ""),
        object_id=given.get("object_id", ""),
        date_from=date_from,
        date_to=date_to,
    )
    return given, events


def _list(view, request, category: str):
    _, events = _filtered(request, category)
    return paginate(request, view, events, AuditEventOut)


def _export(request, category: str) -> HttpResponse:
    given, events = _filtered(request, category)
    content, filename = export_events(actor=request.user, category=category, events=events, filters=given)
    response = HttpResponse(content, content_type=XLSX)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class BusinessAuditView(APIView):
    access = {"GET": BUSINESS_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_business_list",
        parameters=[AuditFilterIn, *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request):
        return _list(self, request, audit.BUSINESS)


class SecurityAuditView(APIView):
    access = {"GET": SECURITY_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_security_list",
        parameters=[AuditFilterIn, *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request):
        return _list(self, request, audit.SECURITY)


class BusinessAuditExportView(APIView):
    access = {"GET": BUSINESS_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_business_export",
        parameters=[AuditFilterIn],
        responses={(200, XLSX): OpenApiTypes.BINARY},
    )
    def get(self, request):
        return _export(request, audit.BUSINESS)


class SecurityAuditExportView(APIView):
    access = {"GET": SECURITY_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_security_export",
        parameters=[AuditFilterIn],
        responses={(200, XLSX): OpenApiTypes.BINARY},
    )
    def get(self, request):
        return _export(request, audit.SECURITY)
```

`backend/apps/audit/api/urls.py`:

```python
from django.urls import path

from apps.audit.api import views

app_name = "audit"

urlpatterns = [
    path("audit/business", views.BusinessAuditView.as_view(), name="business"),
    path("audit/security", views.SecurityAuditView.as_view(), name="security"),
    path("audit/business/export", views.BusinessAuditExportView.as_view(), name="business-export"),
    path("audit/security/export", views.SecurityAuditExportView.as_view(), name="security-export"),
]
```

Replace `backend/config/api_urls.py` with:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.accounts.api.urls")),
    path("", include("apps.audit.api.urls")),
    path("", include("apps.notifications.api.urls")),
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/audit tests/test_messages.py -q`

Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/audit backend/config/api_urls.py
git commit -m "feat(audit): business and security logs with filters and audited Excel export"
```

---

### Task 16: Account administration API and the first-administrator command

**Files:**
- Create: `backend/apps/accounts/api/account_serializers.py`, `backend/apps/accounts/api/account_views.py`
- Create: `backend/apps/core/management/__init__.py` (empty), `backend/apps/core/management/commands/__init__.py` (empty), `backend/apps/core/management/commands/create_sysadmin.py`
- Modify: `backend/apps/accounts/api/urls.py`
- Test: `backend/apps/accounts/tests/test_accounts_api.py`, `backend/apps/core/tests/test_create_sysadmin.py`

**Interfaces:**
- Consumes: the services and selectors of Task 14; `AuditEventOut`, `audit_selectors.events_for_object` (Tasks 8 and 15); `employee_directory` (Task 6); `paginate`, `paginated`, `PAGE_PARAMETERS` (Task 5); `Role`, `ASSIGNABLE`, `ASSIGNABLE_CHOICES`, `roles_of` (Task 9); the `directory` fixture (Task 14).
- Produces (master 7.2):
  - Routes `accounts:account-list` (GET: SYSADMIN, EXEC; POST: SYSADMIN), `accounts:account-candidates` (GET: SYSADMIN), `accounts:account-detail` (GET: SYSADMIN, EXEC), `accounts:account-reset-password`, `accounts:account-roles` (POST), `accounts:account-role` (DELETE), `accounts:account-disable`, `accounts:account-enable`, `accounts:account-unlock` (all SYSADMIN).
  - `AccountOut`: `{public_id, email, name, state, roles, last_login_at, has_employee}`. `AccountDetailOut` adds `{role_assignments: [{role, assigned_by, assigned_at}], previous_login_at, failed_attempts, locked_until, created_at, created_by, recent_events: [AuditEventOut]}`.
  - `POST accounts` takes `{email?, full_name?, employee?, roles}` and answers 201 `{account, temporary_password, expires_at}`. `reset-password` answers `{temporary_password, expires_at}`. Role and state actions answer `AccountDetailOut`.
  - `python manage.py create_sysadmin --email <address> --name <name>` prints the temporary password once.

- [ ] **Step 1: Write the failing tests**

`backend/apps/accounts/tests/test_accounts_api.py`:

```python
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from rest_framework.test import APIClient

from apps.accounts import services
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db

ACCOUNTS = "/api/v1/accounts"
CANDIDATES = "/api/v1/accounts/candidates"
LOGIN = "/api/v1/auth/login"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)

ROW_KEYS = {"public_id", "email", "name", "state", "roles", "last_login_at", "has_employee"}
DETAIL_KEYS = ROW_KEYS | {
    "role_assignments",
    "previous_login_at",
    "failed_attempts",
    "locked_until",
    "created_at",
    "created_by",
    "recent_events",
}


def url(user, suffix: str = "") -> str:
    return f"{ACCOUNTS}/{user.public_id}{suffix}"


@pytest.fixture
def admin(world, client_for):
    return client_for(world.sysadmin_user)


# --- reading ---


def test_the_list_shows_every_account_with_its_state_and_roles(world, admin):
    body = admin.get(ACCOUNTS).json()

    assert body["count"] == 8
    emails = [row["email"] for row in body["results"]]
    assert emails == sorted(emails)
    row = next(row for row in body["results"] if row["email"] == "hr@impactrisks.com")
    assert row == {
        "public_id": str(world.hr_user.public_id),
        "email": "hr@impactrisks.com",
        "name": "Senna RH",
        "state": "active",
        "roles": ["hr"],
        "last_login_at": None,
        "has_employee": False,
    }


def test_the_list_can_be_searched_and_filtered(world, admin):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert admin.get(ACCOUNTS, {"search": "senna"}).json()["count"] == 1
    assert admin.get(ACCOUNTS, {"search": "EMPLOYEE.A"}).json()["count"] == 2
    assert admin.get(ACCOUNTS, {"role": "sysadmin"}).json()["count"] == 1
    disabled = admin.get(ACCOUNTS, {"state": "disabled"}).json()
    assert [row["email"] for row in disabled["results"]] == ["employee.a1@impactrisks.com"]
    assert admin.get(ACCOUNTS, {"state": "active"}).json()["count"] == 7


@pytest.mark.parametrize("query", [{"state": "sleeping"}, {"role": "manager"}])
def test_an_unknown_filter_value_is_refused(admin, query):
    response = admin.get(ACCOUNTS, query)

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"


def test_the_detail_shows_who_gave_each_role_and_the_recent_security_events(world, admin):
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role="exec")

    body = admin.get(url(world.owner_user)).json()

    assert set(body) == DETAIL_KEYS
    assert body["roles"] == ["exec"]
    assert len(body["role_assignments"]) == 1
    assignment = body["role_assignments"][0]
    assert set(assignment) == {"role", "assigned_by", "assigned_at"}
    assert (assignment["role"], assignment["assigned_by"]) == ("exec", "Sonia Admin")
    assert [event["action"] for event in body["recent_events"]] == ["role.assigned"]
    assert body["recent_events"][0]["actor"] == "Sonia Admin"
    assert body["failed_attempts"] == 0
    assert body["locked_until"] is None
    assert body["previous_login_at"] is None
    assert body["created_by"] is None
    assert body["created_at"] is not None


def test_an_unknown_account_is_not_available(admin):
    missing = uuid.uuid4()

    assert admin.get(f"{ACCOUNTS}/{missing}").status_code == 404
    assert admin.post(f"{ACCOUNTS}/{missing}/disable").json()["code"] == "core.not_found"


def test_an_executive_reads_accounts_but_changes_nothing(world, client_for):
    executive = client_for(world.exec_user)

    assert executive.get(ACCOUNTS).status_code == 200
    assert executive.get(url(world.owner_user)).status_code == 200
    assert executive.get(CANDIDATES).status_code == 403
    assert executive.post(ACCOUNTS, {"email": "x@impactrisks.com", "full_name": "X"}).status_code == 403
    assert executive.post(url(world.owner_user, "/disable")).status_code == 403
    assert executive.post(url(world.owner_user, "/reset-password")).status_code == 403


def test_other_roles_and_anonymous_callers_see_no_account(world, client_for, anon_client):
    assert client_for(world.hr_user).get(ACCOUNTS).status_code == 403
    assert client_for(world.owner_user).get(url(world.owner_user)).status_code == 403
    assert anon_client.get(ACCOUNTS).status_code == 401


# --- creating (UI 9.3) ---


def test_creating_an_account_shows_the_temporary_password_once(world, client_for):
    with time_machine.travel(START, tick=False):
        admin = client_for(world.sysadmin_user)
        response = admin.post(
            ACCOUNTS, {"email": "Leila.Admin@impactrisks.com", "full_name": "Leila Admin", "roles": ["exec"]}
        )
        body = response.json()
        signed_in = APIClient().post(LOGIN, {"email": "leila.admin@impactrisks.com", "password": body["temporary_password"]})
        detail = admin.get(f"{ACCOUNTS}/{body['account']['public_id']}").json()
        listing = admin.get(ACCOUNTS).json()

    assert response.status_code == 201
    assert set(body) == {"account", "temporary_password", "expires_at"}
    assert set(body["account"]) == ROW_KEYS
    assert body["account"]["email"] == "leila.admin@impactrisks.com"
    assert body["account"]["name"] == "Leila Admin"
    assert body["account"]["state"] == "awaiting_first_sign_in"
    assert body["account"]["roles"] == ["exec"]
    assert datetime.fromisoformat(body["expires_at"]) == START + timedelta(hours=24)
    assert signed_in.status_code == 200
    assert signed_in.json()["must_change_password"] is True
    assert body["temporary_password"] not in json.dumps(detail) + json.dumps(listing)
    assert detail["created_by"] == "Sonia Admin"


def test_creating_an_account_for_an_employee_record(world, admin, directory):
    employee_id = str(uuid.uuid4())
    directory.add(employee_id, "Yasmine Trabelsi", "yasmine.trabelsi@impactrisks.com")
    assert admin.get(CANDIDATES).json() == [
        {"public_id": employee_id, "full_name": "Yasmine Trabelsi", "email": "yasmine.trabelsi@impactrisks.com"}
    ]

    response = admin.post(ACCOUNTS, {"employee": employee_id, "roles": []})

    assert response.status_code == 201
    account = response.json()["account"]
    assert (account["email"], account["name"]) == ("yasmine.trabelsi@impactrisks.com", "Yasmine Trabelsi")
    assert account["has_employee"] is True
    assert admin.get(CANDIDATES).json() == []


@pytest.mark.parametrize(
    ("payload", "status", "code", "field"),
    [
        ({"email": "leila@gmail.com", "full_name": "Leila"}, 400, "auth.domain_not_allowed", "email"),
        ({"email": "employee.a1@impactrisks.com", "full_name": "Twin"}, 409, "accounts.email_taken", "email"),
        (
            {"email": "both@impactrisks.com", "full_name": "Both", "roles": ["hr", "sysadmin"]},
            400,
            "accounts.roles_incompatible",
            "roles",
        ),
        ({"full_name": "No Email"}, 400, "accounts.subject_required", "email"),
        ({"email": "noname@impactrisks.com"}, 400, "accounts.subject_required", "full_name"),
        ({"employee": "0f0e0d0c-0000-4000-8000-000000000009"}, 400, "accounts.employee_unknown", "employee"),
        ({"email": "m@impactrisks.com", "full_name": "M", "roles": ["manager"]}, 400, "core.validation", "roles.0"),
    ],
)
def test_each_reason_an_account_cannot_be_created_is_explained(world, admin, payload, status, code, field):
    response = admin.post(ACCOUNTS, payload)

    assert response.status_code == status
    assert response.json()["code"] == code
    assert response.json()["errors"][0]["field"] == field


def test_an_employee_who_already_has_an_account_is_explained(world, admin, directory):
    employee_id = str(uuid.uuid4())
    directory.add(employee_id, "Amal Employee", "employee.a1@impactrisks.com")

    response = admin.post(ACCOUNTS, {"employee": employee_id})

    assert response.status_code == 409
    assert response.json()["code"] == "accounts.employee_has_account"


# --- passwords, roles and state ---


def test_resetting_a_password_returns_a_new_temporary_one(world, admin):
    response = admin.post(url(world.owner_user, "/reset-password"))
    body = response.json()

    assert response.status_code == 200
    assert set(body) == {"temporary_password", "expires_at"}
    signed_in = APIClient().post(LOGIN, {"email": world.owner_user.email, "password": body["temporary_password"]})
    assert signed_in.json()["must_change_password"] is True
    assert signed_in.json()["password_reset"]["by"] == "Sonia Admin"
    event = AuditEvent.objects.get(action="auth.password_reset")
    assert event.actor == world.sysadmin_user


def test_roles_are_added_and_removed(world, admin):
    added = admin.post(url(world.owner_user, "/roles"), {"role": "exec"})
    assert added.status_code == 200
    assert set(added.json()) == DETAIL_KEYS
    assert added.json()["roles"] == ["exec"]

    removed = admin.delete(url(world.owner_user, "/roles/exec"))
    assert removed.status_code == 200
    assert removed.json()["roles"] == []
    assert removed.json()["role_assignments"] == []


@pytest.mark.parametrize("role", ["hr", "manager", "employee", "chief"])
def test_removing_a_role_that_is_not_held_or_cannot_be_held_is_not_found(world, admin, role):
    assert admin.delete(url(world.owner_user, f"/roles/{role}")).status_code == 404


def test_an_unknown_role_cannot_be_added(world, admin):
    response = admin.post(url(world.owner_user, "/roles"), {"role": "manager"})

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "role"


def test_the_administrators_slips_are_refused_with_a_reason(world, admin):
    me = world.sysadmin_user

    hr_and_admin = admin.post(url(world.hr_user, "/roles"), {"role": "sysadmin"})
    own_role = admin.post(url(me, "/roles"), {"role": "exec"})
    own_removal = admin.delete(url(me, "/roles/sysadmin"))
    own_disable = admin.post(url(me, "/disable"))
    own_reset = admin.post(url(me, "/reset-password"))

    assert hr_and_admin.json()["code"] == "accounts.roles_incompatible"
    assert hr_and_admin.json()["errors"][0]["field"] == "role"
    for response in (own_role, own_removal, own_disable, own_reset):
        assert response.status_code == 400
        assert response.json()["code"] == "accounts.cannot_change_self"
    assert admin.get(url(me)).json()["roles"] == ["sysadmin"]
    assert admin.get(url(me)).json()["state"] == "active"


def test_disabling_enabling_and_unlocking(world, admin):
    owner = world.owner_user

    assert admin.post(url(owner, "/disable")).json()["state"] == "disabled"
    assert admin.post(url(owner, "/enable")).json()["state"] == "active"

    owner.refresh_from_db()
    owner.failed_attempts = 0
    owner.locked_until = datetime.now(tz=UTC) + timedelta(minutes=10)
    owner.save(update_fields=["failed_attempts", "locked_until"])
    assert admin.get(url(owner)).json()["state"] == "locked"

    unlocked = admin.post(url(owner, "/unlock"))
    assert unlocked.status_code == 200
    assert unlocked.json()["state"] == "active"
    assert unlocked.json()["locked_until"] is None


def test_every_change_is_in_the_security_log_with_the_administrator_and_the_address(world, admin):
    created = admin.post(ACCOUNTS, {"email": "new.person@impactrisks.com", "full_name": "New Person"})
    admin.post(url(world.owner_user, "/disable"))

    events = {event.action: event for event in AuditEvent.objects.filter(category="security")}
    assert {"account.created", "account.disabled"} <= set(events)
    for action in ("account.created", "account.disabled"):
        assert events[action].actor == world.sysadmin_user
        assert events[action].ip_address == "127.0.0.1"
        assert len(events[action].request_id) == 32
    assert events["account.created"].request_id == created["X-Request-ID"]
```

`backend/apps/core/tests/test_create_sysadmin.py`:

```python
import re
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts import services
from apps.accounts.models import User
from apps.accounts.roles import Role, roles_of
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db


def run(**options) -> str:
    out = StringIO()
    call_command("create_sysadmin", stdout=out, **options)
    return out.getvalue()


def test_the_command_creates_the_first_administrator_and_prints_the_password_once():
    output = run(email="Admin@ImpactRisks.com", name="Sonia Admin")

    user = User.objects.get(email="admin@impactrisks.com")
    assert user.full_name == "Sonia Admin"
    assert roles_of(user) == {Role.SYSADMIN}
    assert user.must_change_password is True
    temporary = re.search(r"Temporary password: (\S+)", output).group(1)
    assert services.authenticate(email="admin@impactrisks.com", password=temporary, ip="") == user
    assert "Valid until" in output
    assert AuditEvent.objects.get(action="account.created").actor is None


def test_an_address_that_already_has_an_account_is_refused():
    run(email="admin@impactrisks.com", name="Sonia Admin")

    with pytest.raises(CommandError, match="already exists"):
        run(email="admin@impactrisks.com", name="Someone Else")

    assert User.objects.count() == 1


def test_an_address_outside_the_company_is_refused():
    with pytest.raises(CommandError, match="impactrisks.com"):
        run(email="admin@gmail.com", name="Sonia Admin")

    assert User.objects.count() == 0


def test_both_options_are_required():
    with pytest.raises(CommandError):
        call_command("create_sysadmin", email="admin@impactrisks.com")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/accounts/tests/test_accounts_api.py apps/core/tests/test_create_sysadmin.py -q`

Expected: FAIL. The account addresses answer 404, and the command tests fail with `CommandError: Unknown command: 'create_sysadmin'`.

- [ ] **Step 3: Write the serializers**

`backend/apps/accounts/api/account_serializers.py`:

```python
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts import selectors
from apps.accounts.roles import ASSIGNABLE_CHOICES, roles_of
from apps.accounts.selectors import ACCOUNT_STATE_CHOICES
from apps.accounts.services import display_name
from apps.audit import selectors as audit_selectors
from apps.audit.api.serializers import AuditEventOut

RECENT_EVENTS = 20


class AccountOut(serializers.Serializer):
    """One row of the Accounts page (UI 9.2). Takes a User instance."""

    public_id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    last_login_at = serializers.DateTimeField(allow_null=True)
    has_employee = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_name(self, user) -> str:
        return display_name(user)

    @extend_schema_field(serializers.ChoiceField(choices=ACCOUNT_STATE_CHOICES))
    def get_state(self, user) -> str:
        return selectors.account_state(user)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_roles(self, user) -> list[str]:
        return sorted(role.value for role in roles_of(user))

    @extend_schema_field(serializers.BooleanField())
    def get_has_employee(self, user) -> bool:
        return selectors.has_employee(user)


class RoleAssignmentOut(serializers.Serializer):
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES)
    assigned_by = serializers.SerializerMethodField()
    assigned_at = serializers.DateTimeField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_assigned_by(self, assignment) -> str | None:
        return display_name(assignment.assigned_by) if assignment.assigned_by_id else None


class AccountDetailOut(AccountOut):
    """The Account page (UI 9.4)."""

    role_assignments = RoleAssignmentOut(many=True)
    previous_login_at = serializers.DateTimeField(allow_null=True)
    failed_attempts = serializers.IntegerField()
    locked_until = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()
    created_by = serializers.SerializerMethodField()
    recent_events = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_created_by(self, user) -> str | None:
        return display_name(user.created_by) if user.created_by_id else None

    @extend_schema_field(AuditEventOut(many=True))
    def get_recent_events(self, user) -> list[dict]:
        events = audit_selectors.events_for_object("user", str(user.public_id)).filter(category="security")
        return AuditEventOut(events[:RECENT_EVENTS], many=True).data


class AccountFilterIn(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True)
    state = serializers.ChoiceField(choices=ACCOUNT_STATE_CHOICES, required=False)
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES, required=False)


class AccountCreateIn(serializers.Serializer):
    """Either `employee` (the public id of an employee without account), or `email` and `full_name`."""

    email = serializers.CharField(required=False, allow_blank=True, max_length=254)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    employee = serializers.UUIDField(required=False, allow_null=True)
    roles = serializers.ListField(child=serializers.ChoiceField(choices=ASSIGNABLE_CHOICES), required=False)


class AccountCreatedOut(serializers.Serializer):
    account = AccountOut()
    temporary_password = serializers.CharField()
    expires_at = serializers.DateTimeField()


class TemporaryPasswordOut(serializers.Serializer):
    temporary_password = serializers.CharField()
    expires_at = serializers.DateTimeField()


class RoleIn(serializers.Serializer):
    role = serializers.ChoiceField(choices=ASSIGNABLE_CHOICES)


class CandidateOut(serializers.Serializer):
    public_id = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.CharField()
```

- [ ] **Step 4: Write the views**

`backend/apps/accounts/api/account_views.py`:

```python
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import selectors, services
from apps.accounts.api.account_serializers import (
    AccountCreatedOut,
    AccountCreateIn,
    AccountDetailOut,
    AccountFilterIn,
    AccountOut,
    CandidateOut,
    RoleIn,
    TemporaryPasswordOut,
)
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role
from apps.core.errors import NotFound
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

READERS = {Role.SYSADMIN, Role.EXEC}
ADMINISTRATOR = {Role.SYSADMIN}


def _detail(user) -> Response:
    return Response(AccountDetailOut(user).data)


class AccountListView(APIView):
    access = {"GET": READERS, "POST": ADMINISTRATOR}
    http_method_names = ["get", "post"]

    @extend_schema(
        operation_id="accounts_list",
        parameters=[AccountFilterIn, *PAGE_PARAMETERS],
        responses=paginated(AccountOut),
    )
    def get(self, request):
        filters = AccountFilterIn(data=request.query_params)
        filters.is_valid(raise_exception=True)
        return paginate(request, self, selectors.accounts(**filters.validated_data), AccountOut)

    @extend_schema(operation_id="accounts_create", request=AccountCreateIn, responses={201: AccountCreatedOut})
    def post(self, request):
        data = AccountCreateIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        employee = values.get("employee")
        user, temporary = services.create_account(
            actor=request.user,
            email=values.get("email", ""),
            full_name=values.get("full_name", ""),
            employee_public_id=str(employee) if employee else None,
            roles=values.get("roles", []),
        )
        created = {"account": user, "temporary_password": temporary, "expires_at": user.temp_password_expires_at}
        return Response(AccountCreatedOut(created).data, status=201)


class AccountCandidatesView(APIView):
    """Employees who have no account yet (empty until plan 02 provides the employee directory)."""

    access = {"GET": ADMINISTRATOR}
    http_method_names = ["get"]

    @extend_schema(operation_id="accounts_candidates", responses=CandidateOut(many=True))
    def get(self, request):
        return Response(CandidateOut(employee_directory().candidates(), many=True).data)


class AccountDetailView(APIView):
    access = {"GET": READERS}
    http_method_names = ["get"]

    @extend_schema(operation_id="accounts_detail", responses=AccountDetailOut)
    def get(self, request, public_id):
        return _detail(selectors.get_account(public_id))


class AccountResetPasswordView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_reset_password", request=None, responses=TemporaryPasswordOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        temporary = services.reset_password(actor=request.user, user=user)
        issued = {"temporary_password": temporary, "expires_at": user.temp_password_expires_at}
        return Response(TemporaryPasswordOut(issued).data)


class AccountRolesView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_role_add", request=RoleIn, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        data = RoleIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.assign_role(actor=request.user, user=user, role=data.validated_data["role"])
        return _detail(user)


class AccountRoleView(APIView):
    access = {"DELETE": ADMINISTRATOR}
    http_method_names = ["delete"]

    @extend_schema(operation_id="accounts_role_remove", responses=AccountDetailOut)
    def delete(self, request, public_id, role: str):
        user = selectors.get_account(public_id)
        try:
            wanted = Role(role)
        except ValueError:
            raise NotFound() from None
        if wanted not in ASSIGNABLE:
            raise NotFound()
        services.remove_role(actor=request.user, user=user, role=wanted)
        return _detail(user)


class AccountDisableView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_disable", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.disable_account(actor=request.user, user=user)
        return _detail(user)


class AccountEnableView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_enable", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.enable_account(actor=request.user, user=user)
        return _detail(user)


class AccountUnlockView(APIView):
    access = {"POST": ADMINISTRATOR}
    http_method_names = ["post"]

    @extend_schema(operation_id="accounts_unlock", request=None, responses=AccountDetailOut)
    def post(self, request, public_id):
        user = selectors.get_account(public_id)
        services.unlock_account(actor=request.user, user=user)
        return _detail(user)
```

- [ ] **Step 5: Add the routes**

Replace `backend/apps/accounts/api/urls.py` with:

```python
from django.urls import path

from apps.accounts.api import account_views, session_views

app_name = "accounts"

urlpatterns = [
    path("auth/csrf", session_views.CsrfView.as_view(), name="csrf"),
    path("auth/login", session_views.LoginView.as_view(), name="login"),
    path("auth/logout", session_views.LogoutView.as_view(), name="logout"),
    path("auth/me", session_views.MeView.as_view(), name="me"),
    path("auth/password", session_views.PasswordView.as_view(), name="password"),
    path("accounts", account_views.AccountListView.as_view(), name="account-list"),
    path("accounts/candidates", account_views.AccountCandidatesView.as_view(), name="account-candidates"),
    path("accounts/<uuid:public_id>", account_views.AccountDetailView.as_view(), name="account-detail"),
    path(
        "accounts/<uuid:public_id>/reset-password",
        account_views.AccountResetPasswordView.as_view(),
        name="account-reset-password",
    ),
    path("accounts/<uuid:public_id>/roles", account_views.AccountRolesView.as_view(), name="account-roles"),
    path(
        "accounts/<uuid:public_id>/roles/<str:role>",
        account_views.AccountRoleView.as_view(),
        name="account-role",
    ),
    path("accounts/<uuid:public_id>/disable", account_views.AccountDisableView.as_view(), name="account-disable"),
    path("accounts/<uuid:public_id>/enable", account_views.AccountEnableView.as_view(), name="account-enable"),
    path("accounts/<uuid:public_id>/unlock", account_views.AccountUnlockView.as_view(), name="account-unlock"),
]
```

- [ ] **Step 6: Write the first-administrator command**

`backend/apps/core/management/commands/create_sysadmin.py`:

```python
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts import services
from apps.accounts.roles import Role
from apps.core.errors import DomainError
from apps.core.i18n import translate


class Command(BaseCommand):
    help = "Creates a System Administrator account and prints its temporary password once (go-live step 1)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email", required=True, help="Professional email of the administrator.")
        parser.add_argument("--name", required=True, help="Full name of the administrator.")

    def handle(self, *args, **options) -> None:
        try:
            user, temporary = services.create_account(
                actor=None, email=options["email"], full_name=options["name"], roles=[Role.SYSADMIN]
            )
        except DomainError as exc:
            raise CommandError(translate(exc.code, "en", **exc.params)) from exc
        expires = timezone.localtime(user.temp_password_expires_at)
        self.stdout.write(f"Account created: {user.email}")
        self.stdout.write(f"Temporary password: {temporary}")
        self.stdout.write(
            f"Valid until {expires:%d/%m/%Y %H:%M}. It is stored nowhere readable: hand it over now. "
            "The administrator chooses a new password at first sign-in."
        )
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/accounts apps/core/tests/test_create_sysadmin.py -q`

Expected: PASS, no failures.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/accounts backend/apps/core
git commit -m "feat(accounts): account administration API and create_sysadmin command"
```

---

### Task 17: Settings API

**Files:**
- Create: `backend/apps/settings/api/__init__.py` (empty), `backend/apps/settings/api/serializers.py`, `backend/apps/settings/api/views.py`, `backend/apps/settings/api/urls.py`
- Modify: `backend/config/api_urls.py`
- Test: `backend/apps/settings/tests/test_api.py`

**Interfaces:**
- Consumes: `settings_service.list_group`, `set_value`, `row_for`, `registry.get_def`, `registry.KINDS` (Task 10); `Role` (Task 9); `NotFound` (Task 4).
- Produces (master 7.4):
  - Routes `settings:hr` (GET: HR, EXEC), `settings:hr-item` (PUT: HR), `settings:system` (GET: SYSADMIN, EXEC), `settings:system-item` (PUT: SYSADMIN).
  - `SettingOut`: `{key, kind, value, default, minimum, maximum, choices, updated_by, updated_at}`. `value`, `default`, `minimum` and `maximum` are in their stored form: a decimal is a string (`"2.5"`), a date is `"YYYY-MM-DD"`. `choices` is null except for a list setting with a fixed set of values. `updated_by` is a display name.
  - `PUT` takes `{value}` and returns the `SettingOut` of that key. A key that does not exist, or that belongs to the other group, answers 404 `settings.unknown_key`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/settings/tests/test_api.py`:

```python
"""Review Focus 5: a setting given a wrong value is refused, the old value stays, and nothing else breaks."""

from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.settings import services as settings_service
from apps.settings.models import Setting
from apps.settings.tests.world import TEST_HR_FLAG

pytestmark = pytest.mark.django_db

HR = "/api/v1/settings/hr"
SYSTEM = "/api/v1/settings/system"
ROW_KEYS = {"key", "kind", "value", "default", "minimum", "maximum", "choices", "updated_by", "updated_at"}


def test_the_administrator_reads_the_system_settings(world, client_for):
    response = client_for(world.sysadmin_user).get(SYSTEM)
    rows = response.json()

    assert response.status_code == 200
    assert [row["key"] for row in rows] == [
        "session_timeout_minutes",
        "lockout_threshold",
        "lockout_minutes",
        "login_ip_max_attempts",
        "temp_password_hours",
        "upload_max_mb",
        "upload_allowed_types",
    ]
    assert rows[0] == {
        "key": "session_timeout_minutes",
        "kind": "int",
        "value": 120,
        "default": 120,
        "minimum": 5,
        "maximum": 1440,
        "choices": None,
        "updated_by": None,
        "updated_at": None,
    }
    assert rows[6]["value"] == ["pdf", "jpg", "png"]
    assert rows[6]["choices"] == ["pdf", "jpg", "png"]
    assert (rows[6]["minimum"], rows[6]["maximum"]) == (None, None)


def test_hr_reads_the_hr_settings(world, client_for):
    rows = {row["key"]: row for row in client_for(world.hr_user).get(HR).json()}

    assert set(rows[TEST_HR_FLAG]) == ROW_KEYS
    assert rows[TEST_HR_FLAG]["value"] is False
    assert (rows["test_hr_rate"]["kind"], rows["test_hr_rate"]["value"]) == ("decimal", "2.5")
    assert (rows["test_hr_rate"]["minimum"], rows["test_hr_rate"]["maximum"]) == ("0", "10")
    assert rows["test_hr_start"]["value"] is None
    assert "lockout_threshold" not in rows


def test_each_group_is_read_by_its_role_and_by_executives(world, client_for, anon_client):
    assert client_for(world.hr_user).get(SYSTEM).status_code == 403
    assert client_for(world.sysadmin_user).get(HR).status_code == 403
    assert client_for(world.owner_user).get(HR).status_code == 403
    assert client_for(world.exec_user).get(HR).status_code == 200
    assert client_for(world.exec_user).get(SYSTEM).status_code == 200
    assert anon_client.get(SYSTEM).status_code == 401


def test_executives_read_but_do_not_change(world, client_for):
    executive = client_for(world.exec_user)

    assert executive.put(f"{SYSTEM}/lockout_threshold", {"value": 6}).status_code == 403
    assert executive.put(f"{HR}/{TEST_HR_FLAG}", {"value": True}).status_code == 403
    assert not Setting.objects.exists()


def test_the_administrator_changes_a_system_setting(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": 6})
    row = response.json()

    assert response.status_code == 200
    assert set(row) == ROW_KEYS
    assert (row["key"], row["value"], row["default"]) == ("lockout_threshold", 6, 5)
    assert row["updated_by"] == "Sonia Admin"
    assert row["updated_at"] is not None
    assert settings_service.get("lockout_threshold") == 6
    event = AuditEvent.objects.get(action="setting.changed")
    assert (event.category, event.actor, event.object_id) == ("security", world.sysadmin_user, "lockout_threshold")
    assert event.changes == {"value": {"before": 5, "after": 6}}
    assert event.ip_address == "127.0.0.1"


def test_hr_changes_hr_settings_of_every_kind(world, client_for):
    client = client_for(world.hr_user)

    assert client.put(f"{HR}/test_hr_rate", {"value": "3.50"}).json()["value"] == "3.5"
    assert client.put(f"{HR}/{TEST_HR_FLAG}", {"value": True}).json()["value"] is True
    assert client.put(f"{HR}/test_hr_days", {"value": [7, 1]}).json()["value"] == [1, 7]
    assert client.put(f"{HR}/test_hr_start", {"value": "2026-11-01"}).json()["value"] == "2026-11-01"
    assert client.put(f"{HR}/test_hr_cutoff", {"value": 25}).json()["value"] == 25
    assert client.put(f"{HR}/test_hr_cutoff", {"value": None}).json()["value"] is None

    assert settings_service.get("test_hr_rate") == Decimal("3.5")
    assert settings_service.get("test_hr_cutoff") is None
    assert AuditEvent.objects.filter(action="setting.changed", category="business").count() == 6


@pytest.mark.parametrize(
    ("value", "code"),
    [
        ("many", "settings.invalid_value"),
        (True, "settings.invalid_value"),
        (5.5, "settings.invalid_value"),
        (None, "settings.invalid_value"),
        ([5], "settings.invalid_value"),
        (2, "settings.out_of_range"),
        (500, "settings.out_of_range"),
    ],
)
def test_a_wrong_value_is_refused_next_to_its_input_and_the_old_value_stays(world, client_for, value, code):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": value})

    assert response.status_code == 400
    assert response.json()["code"] == code
    assert response.json()["errors"][0]["field"] == "value"
    assert settings_service.get("lockout_threshold") == 5
    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


def test_the_range_is_named_in_the_message(world, client_for):
    world.sysadmin_user.language = "en"
    world.sysadmin_user.save(update_fields=["language"])

    body = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": 500}).json()

    assert body["detail"] == "The value must be between 3 and 20."
    assert body["errors"][0]["params"] == {"minimum": 3, "maximum": 20}


def test_a_request_without_value_is_refused(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {})

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    assert response.json()["errors"][0]["field"] == "value"


def test_an_unknown_key_is_not_found(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/no_such_setting", {"value": 1})

    assert response.status_code == 404
    assert response.json()["code"] == "settings.unknown_key"


def test_a_key_of_the_other_group_is_not_found_here(world, client_for):
    as_admin = client_for(world.sysadmin_user).put(f"{SYSTEM}/{TEST_HR_FLAG}", {"value": True})
    as_hr = client_for(world.hr_user).put(f"{HR}/lockout_threshold", {"value": 6})

    assert as_admin.status_code == 404
    assert as_hr.status_code == 404
    assert as_hr.json()["code"] == "settings.unknown_key"
    assert not Setting.objects.exists()


def test_after_a_refused_value_sign_in_still_follows_the_old_setting(world, client_for, anon_client):
    client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": "many"})

    codes = [
        anon_client.post("/api/v1/auth/login", {"email": world.owner_user.email, "password": "wrong"}).json()["code"]
        for _ in range(5)
    ]

    assert codes == ["auth.invalid_credentials"] * 4 + ["auth.locked"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/settings/tests/test_api.py -q`

Expected: FAIL. The addresses under `/api/v1/settings/` answer 404, so the assertions on status and body fail (the last test fails on the first refused call too).

- [ ] **Step 3: Write the serializers**

`backend/apps/settings/api/serializers.py`:

```python
from rest_framework import serializers

from apps.settings.registry import KINDS

KIND_CHOICES = [(kind, kind) for kind in KINDS]


class SettingOut(serializers.Serializer):
    """One setting with its current value. Takes a `SettingRow`."""

    key = serializers.CharField()
    kind = serializers.ChoiceField(choices=KIND_CHOICES)
    value = serializers.JSONField(allow_null=True)
    default = serializers.JSONField(allow_null=True)
    minimum = serializers.JSONField(allow_null=True)
    maximum = serializers.JSONField(allow_null=True)
    choices = serializers.ListField(child=serializers.CharField(), allow_null=True)
    updated_by = serializers.CharField(source="updated_by_name", allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class SettingValueIn(serializers.Serializer):
    value = serializers.JSONField(allow_null=True)
```

- [ ] **Step 4: Write the views and the routes**

`backend/apps/settings/api/views.py`:

```python
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.errors import NotFound
from apps.settings import registry
from apps.settings import services as settings_service
from apps.settings.api.serializers import SettingOut, SettingValueIn


def _list(group: str) -> Response:
    return Response(SettingOut(settings_service.list_group(group), many=True).data)


def _update(request, group: str, key: str) -> Response:
    if registry.get_def(key).group != group:  # a key of the other group does not exist at this address
        raise NotFound("settings.unknown_key", field="key", key=key)
    data = SettingValueIn(data=request.data)
    data.is_valid(raise_exception=True)
    settings_service.set_value(actor=request.user, key=key, value=data.validated_data["value"])
    return Response(SettingOut(settings_service.row_for(key)).data)


class HrSettingsView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="settings_hr_list", responses=SettingOut(many=True))
    def get(self, request):
        return _list("hr")


class HrSettingItemView(APIView):
    access = {"PUT": {Role.HR}}
    http_method_names = ["put"]

    @extend_schema(operation_id="settings_hr_update", request=SettingValueIn, responses=SettingOut)
    def put(self, request, key: str):
        return _update(request, "hr", key)


class SystemSettingsView(APIView):
    access = {"GET": {Role.SYSADMIN, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="settings_system_list", responses=SettingOut(many=True))
    def get(self, request):
        return _list("system")


class SystemSettingItemView(APIView):
    access = {"PUT": {Role.SYSADMIN}}
    http_method_names = ["put"]

    @extend_schema(operation_id="settings_system_update", request=SettingValueIn, responses=SettingOut)
    def put(self, request, key: str):
        return _update(request, "system", key)
```

`backend/apps/settings/api/urls.py`:

```python
from django.urls import path

from apps.settings.api import views

app_name = "settings"

urlpatterns = [
    path("settings/hr", views.HrSettingsView.as_view(), name="hr"),
    path("settings/hr/<str:key>", views.HrSettingItemView.as_view(), name="hr-item"),
    path("settings/system", views.SystemSettingsView.as_view(), name="system"),
    path("settings/system/<str:key>", views.SystemSettingItemView.as_view(), name="system-item"),
]
```

Replace `backend/config/api_urls.py` with:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.accounts.api.urls")),
    path("", include("apps.audit.api.urls")),
    path("", include("apps.settings.api.urls")),
    path("", include("apps.notifications.api.urls")),
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/settings -q`

Expected: PASS, no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/settings backend/config/api_urls.py
git commit -m "feat(settings): API to read and change HR and system settings"
```

---

### Task 18: Job runner, heartbeat, clean-up job, health check and system status

**Files:**
- Create: `backend/apps/core/jobs.py`, `backend/apps/core/tasks.py`, `backend/apps/core/selectors.py`
- Create: `backend/apps/core/api/serializers.py`, `backend/apps/core/api/views.py`, `backend/apps/core/api/urls.py`
- Create: `backend/apps/core/migrations/0001_initial.py` (generated)
- Create: `backend/apps/accounts/services/housekeeping.py`, `backend/apps/accounts/tasks.py`
- Modify: `backend/apps/core/models.py`, `backend/apps/accounts/services/__init__.py`, `backend/config/settings.py`, `backend/config/api_urls.py`
- Test: `backend/apps/core/tests/test_jobs.py`, `backend/apps/core/tests/test_health.py`, `backend/apps/core/tests/test_status.py`, `backend/apps/accounts/tests/test_housekeeping.py`

**Interfaces:**
- Consumes: `notifications.notify` and the `job.failed` event (Task 11); `users_with_role`, `Role`, `PUBLIC` (Task 9); `accounts.selectors.accounts_needing_attention` (Task 14); `User` (Task 6).
- Produces (master 6.9 and 7.1):
  - `apps.core.models.JobStatus(name unique, schedule, last_started_at, last_finished_at, last_ok, last_detail, consecutive_failures)`.
  - `apps.core.jobs`: `recorded(name: str)` (decorator), `RETRY`, `periodic_schedules() -> dict[str, str]`, `HEARTBEAT = "core.heartbeat"`, `NOTIFY_AFTER_FAILURES = 3`.
    - `recorded` stores each run in `JobStatus`. A dictionary returned by the job is stored as JSON in `last_detail`.
    - After the third consecutive failure of a job (that is, when the retries of `RETRY` are used up), System Administrators get a `job.failed` notification, at most once per job per day. The error is always raised again so that Procrastinate retries.
  - The task convention of master 6.9: `tasks.py` in each app, `@app.periodic(cron=...)` above `@app.task(name=..., retry=RETRY, queueing_lock=...)` above `@recorded(name)`; the task name and the recorded name are the same string. Cron expressions are in UTC.
  - Jobs `core.heartbeat` (every minute) and `accounts.cleanup` (01:30 UTC, 02:30 in Tunis); `apps.accounts.services.cleanup(*, now=None) -> dict[str, int]`.
  - Routes `core:health` (GET, public; 200 or 503) and `core:admin-status` (GET: SYSADMIN, EXEC) with the shapes of master 7.1.
  - For plan 07: `admin/status` reads `backup` from the `JobStatus` named `ops.backup`; the backup task must return `{"size_bytes": int, "storage_used_bytes": int}`.

- [ ] **Step 1: Confirm the Procrastinate API this task relies on**

Run:

```powershell
docker compose run --rm app python -c "import procrastinate, inspect; from procrastinate import App, RetryStrategy; print(procrastinate.__version__); print(inspect.signature(RetryStrategy)); print(hasattr(App, 'periodic'), hasattr(App, 'task'))"
```

Expected: a version starting with `3.`, a `RetryStrategy` signature that includes `max_attempts` and `exponential_wait`, then `True True`.

If the version is 4 or later, or a name is missing: open the Procrastinate documentation pages "Use Procrastinate in a Django application", "Launch a task periodically" and "Define a retry strategy on a task", and adapt only `apps/core/jobs.py` (`RETRY`, `periodic_schedules`) and the decorator lines of the two `tasks.py` files of this task. The tests of this task tell you when the adaptation is right.

- [ ] **Step 2: Write the failing tests for the job runner**

`backend/apps/core/tests/test_jobs.py`:

```python
import json
import logging
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.core import tasks
from apps.core.jobs import NOTIFY_AFTER_FAILURES, periodic_schedules, recorded
from apps.core.models import JobStatus
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def make_job(name="test.sample", *, result=None, fail=False):
    """A recorded job whose behaviour the test controls through the returned `state`."""
    state = {"result": result, "fail": fail, "calls": 0}

    @recorded(name)
    def job(timestamp):
        state["calls"] += 1
        if state["fail"]:
            raise RuntimeError("disk full")
        return state["result"]

    return job, state


def test_the_periodic_jobs_of_this_plan_are_registered_with_procrastinate():
    schedules = periodic_schedules()

    assert schedules["core.heartbeat"] == "* * * * *"
    assert schedules["accounts.cleanup"] == "30 1 * * *"


def test_a_recorded_job_stores_when_it_ran_and_what_it_returned():
    job, _ = make_job(result={"posted": 3, "skipped": 0})

    with time_machine.travel(START, tick=False):
        assert job(0) == {"posted": 3, "skipped": 0}

    status = JobStatus.objects.get(name="test.sample")
    assert status.last_started_at == START
    assert status.last_finished_at == START
    assert status.last_ok is True
    assert json.loads(status.last_detail) == {"posted": 3, "skipped": 0}
    assert status.consecutive_failures == 0


def test_a_job_that_returns_nothing_has_an_empty_detail():
    job, _ = make_job()

    job(0)

    assert JobStatus.objects.get(name="test.sample").last_detail == ""


def test_running_a_job_again_updates_the_same_row():
    job, state = make_job()

    job(0)
    job(0)

    assert state["calls"] == 2
    assert JobStatus.objects.filter(name="test.sample").count() == 1


def test_a_failing_job_is_recorded_logged_and_raised_again(caplog):
    job, _ = make_job("test.broken", fail=True)

    with caplog.at_level(logging.ERROR, logger="iris.jobs"), pytest.raises(RuntimeError, match="disk full"):
        job(0)

    status = JobStatus.objects.get(name="test.broken")
    assert status.last_ok is False
    assert status.last_detail == "RuntimeError: disk full"
    assert status.last_finished_at is not None
    assert status.consecutive_failures == 1
    logged = next(record for record in caplog.records if record.name == "iris.jobs")
    assert logged.data == {"job": "test.broken", "consecutive_failures": 1}
    assert logged.exc_info is not None


def test_administrators_are_told_when_the_retries_are_used_up_and_once_a_day(world):
    job, _ = make_job("test.broken", fail=True)

    with time_machine.travel(START, tick=False) as clock:
        for _ in range(NOTIFY_AFTER_FAILURES - 1):
            with pytest.raises(RuntimeError):
                job(0)
        assert not Notification.objects.filter(event_code="job.failed").exists()

        with pytest.raises(RuntimeError):
            job(0)
        with pytest.raises(RuntimeError):
            job(0)
        told = Notification.objects.filter(event_code="job.failed")
        assert [n.user for n in told] == [world.sysadmin_user]
        assert told[0].parameters == {"job": "test.broken"}

        clock.shift(timedelta(days=1))
        with pytest.raises(RuntimeError):
            job(0)

    assert Notification.objects.filter(event_code="job.failed").count() == 2


def test_a_success_resets_the_count_of_failures(world):
    job, state = make_job("test.flaky", fail=True)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            job(0)

    state["fail"] = False
    job(0)
    state["fail"] = True
    with pytest.raises(RuntimeError):
        job(0)

    assert JobStatus.objects.get(name="test.flaky").consecutive_failures == 1
    assert not Notification.objects.filter(event_code="job.failed").exists()


def test_the_heartbeat_task_records_itself_with_its_schedule():
    with time_machine.travel(START, tick=False):
        tasks.heartbeat(0)

    status = JobStatus.objects.get(name="core.heartbeat")
    assert status.last_ok is True
    assert status.last_finished_at == START
    assert status.schedule == "* * * * *"
```

- [ ] **Step 3: Write the failing tests for the health check and the status page**

`backend/apps/core/tests/test_health.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.core import selectors
from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

HEALTH = "/api/v1/health"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def beat(at: datetime, *, ok: bool = True) -> None:
    JobStatus.objects.update_or_create(
        name="core.heartbeat", defaults={"last_started_at": at, "last_finished_at": at, "last_ok": ok}
    )


def test_health_is_public_and_names_each_part(anon_client, settings):
    with time_machine.travel(START, tick=False):
        beat(START - timedelta(minutes=1))
        response = anon_client.get(HEALTH)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "ok",
        "database": "ok",
        "worker": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


def test_without_a_heartbeat_the_worker_is_reported_stale(anon_client):
    response = anon_client.get(HEALTH)

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["worker"] == "stale"
    assert response.json()["database"] == "ok"


@pytest.mark.parametrize(("age_minutes", "status"), [(3, 200), (4, 503)])
def test_the_heartbeat_may_be_three_minutes_old(anon_client, age_minutes, status):
    with time_machine.travel(START, tick=False):
        beat(START - timedelta(minutes=age_minutes))

        assert anon_client.get(HEALTH).status_code == status


def test_a_failed_heartbeat_does_not_count(anon_client):
    with time_machine.travel(START, tick=False):
        beat(START, ok=False)

        assert anon_client.get(HEALTH).json()["worker"] == "stale"


def test_a_database_failure_is_reported(anon_client, monkeypatch):
    monkeypatch.setattr(selectors, "_database_ok", lambda: False)

    response = anon_client.get(HEALTH)

    assert response.status_code == 503
    assert response.json()["database"] == "fail"
    assert response.json()["worker"] == "stale"
    assert response.json()["app"] == "ok"


def test_a_signed_in_user_gets_the_same_answer(world, client_for):
    assert client_for(world.owner_user).get(HEALTH).status_code == 503
```

`backend/apps/core/tests/test_status.py`:

```python
import json
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

STATUS = "/api/v1/admin/status"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def job(name: str, at: datetime, *, ok: bool, detail: str = "") -> None:
    JobStatus.objects.create(
        name=name, last_started_at=at, last_finished_at=at, last_ok=ok, last_detail=detail
    )


def test_the_status_page_gets_health_accounts_jobs_and_backup(world, client_for):
    with time_machine.travel(START, tick=False):
        job("core.heartbeat", START, ok=True)
        job("accounts.cleanup", START - timedelta(hours=6), ok=False, detail="RuntimeError: disk full")
        world.owner_user.locked_until = START + timedelta(minutes=5)
        world.owner_user.save(update_fields=["locked_until"])
        world.peer_user.must_change_password = True
        world.peer_user.temp_password_expires_at = START - timedelta(hours=1)
        world.peer_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

        response = client_for(world.sysadmin_user).get(STATUS)

    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"health", "accounts", "jobs", "backup"}
    assert body["health"]["status"] == "ok"
    assert set(body["accounts"]) == {"locked", "awaiting_first_sign_in", "temp_expired", "employees_without_account"}
    assert body["accounts"]["locked"] == [
        {
            "public_id": str(world.owner_user.public_id),
            "name": "Amal Employee",
            "email": "employee.a1@impactrisks.com",
        }
    ]
    assert [row["email"] for row in body["accounts"]["temp_expired"]] == ["employee.a2@impactrisks.com"]
    assert body["accounts"]["awaiting_first_sign_in"] == []
    assert body["accounts"]["employees_without_account"] == []
    assert body["backup"] is None

    jobs = {row["name"]: row for row in body["jobs"]}
    assert body["jobs"][0]["name"] == "accounts.cleanup"  # failures come first
    cleanup, heartbeat = jobs["accounts.cleanup"], jobs["core.heartbeat"]
    assert set(cleanup) == {
        "name",
        "schedule",
        "last_started_at",
        "last_finished_at",
        "last_ok",
        "last_detail",
        "next_run_at",
    }
    assert (cleanup["schedule"], cleanup["last_ok"], cleanup["last_detail"]) == (
        "30 1 * * *",
        False,
        "RuntimeError: disk full",
    )
    assert datetime.fromisoformat(cleanup["next_run_at"]) == datetime(2026, 10, 7, 1, 30, tzinfo=UTC)
    assert (heartbeat["schedule"], heartbeat["last_ok"]) == ("* * * * *", True)
    assert datetime.fromisoformat(heartbeat["next_run_at"]) == START + timedelta(minutes=1)


def test_a_job_that_never_ran_is_listed_from_its_schedule(world, client_for):
    body = client_for(world.sysadmin_user).get(STATUS).json()

    jobs = {row["name"]: row for row in body["jobs"]}
    assert jobs["core.heartbeat"]["last_ok"] is None
    assert jobs["core.heartbeat"]["last_started_at"] is None
    assert jobs["core.heartbeat"]["next_run_at"] is not None
    assert body["health"]["worker"] == "stale"


def test_the_backup_block_reads_the_backup_job(world, client_for):
    detail = json.dumps({"size_bytes": 52_428_800, "storage_used_bytes": 734_003_200})
    job("ops.backup", START, ok=True, detail=detail)

    body = client_for(world.sysadmin_user).get(STATUS).json()

    assert datetime.fromisoformat(body["backup"]["last_at"]) == START
    assert body["backup"]["size_bytes"] == 52_428_800
    assert body["backup"]["storage_used_bytes"] == 734_003_200


def test_a_failed_backup_shows_no_backup_and_a_failed_job(world, client_for):
    job("ops.backup", START, ok=False, detail="OSError: no space left on device")

    body = client_for(world.sysadmin_user).get(STATUS).json()

    assert body["backup"] is None
    assert body["jobs"][0]["name"] == "ops.backup"
    assert body["jobs"][0]["last_ok"] is False


def test_only_administrators_and_executives_read_the_status(world, client_for, anon_client):
    assert client_for(world.exec_user).get(STATUS).status_code == 200
    assert client_for(world.hr_user).get(STATUS).status_code == 403
    assert client_for(world.owner_user).get(STATUS).status_code == 403
    assert anon_client.get(STATUS).status_code == 401
```

- [ ] **Step 4: Write the failing tests for the clean-up job**

`backend/apps/accounts/tests/test_housekeeping.py`:

```python
import json
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.sessions.models import Session

from apps.accounts import services, tasks
from apps.accounts.tests.world import PASSWORD
from apps.core.errors import DomainError
from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 10, 6, 1, 30, tzinfo=UTC)


def expire_temporary_password(user, *, hours_ago: int) -> None:
    user.must_change_password = True
    user.temp_password_expires_at = NOW - timedelta(hours=hours_ago)
    user.save(update_fields=["must_change_password", "temp_password_expires_at"])


def test_cleanup_removes_expired_sessions_only():
    Session.objects.create(session_key="a" * 32, session_data="x", expire_date=NOW - timedelta(hours=1))
    Session.objects.create(session_key="b" * 32, session_data="x", expire_date=NOW + timedelta(hours=1))

    result = services.cleanup(now=NOW)

    assert result["expired_sessions"] == 1
    assert list(Session.objects.values_list("session_key", flat=True)) == ["b" * 32]


def test_cleanup_makes_expired_temporary_passwords_unusable(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    expire_temporary_password(world.peer_user, hours_ago=-2)  # still valid for two hours

    result = services.cleanup(now=NOW)

    assert result == {"expired_sessions": 0, "expired_temporary_passwords": 1}
    world.owner_user.refresh_from_db()
    world.peer_user.refresh_from_db()
    world.manager_user.refresh_from_db()
    assert world.owner_user.has_usable_password() is False
    assert world.owner_user.must_change_password is True
    assert world.peer_user.check_password(PASSWORD)
    assert world.manager_user.check_password(PASSWORD)


def test_after_cleanup_the_user_is_still_told_to_ask_for_a_new_password(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    services.cleanup(now=NOW)

    with time_machine.travel(NOW, tick=False), pytest.raises(DomainError) as error:
        services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="")

    assert error.value.code == "auth.temp_password_expired"


def test_running_cleanup_twice_changes_nothing_more(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    Session.objects.create(session_key="a" * 32, session_data="x", expire_date=NOW - timedelta(hours=1))

    first = services.cleanup(now=NOW)
    second = services.cleanup(now=NOW)

    assert first == {"expired_sessions": 1, "expired_temporary_passwords": 1}
    assert second == {"expired_sessions": 0, "expired_temporary_passwords": 0}


def test_the_cleanup_task_records_its_result(world):
    expire_temporary_password(world.owner_user, hours_ago=2)

    with time_machine.travel(NOW, tick=False):
        tasks.cleanup(0)

    status = JobStatus.objects.get(name="accounts.cleanup")
    assert status.last_ok is True
    assert json.loads(status.last_detail) == {"expired_sessions": 0, "expired_temporary_passwords": 1}
    assert status.schedule == "30 1 * * *"
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_jobs.py apps/core/tests/test_health.py apps/core/tests/test_status.py apps/accounts/tests/test_housekeeping.py -q`

Expected: FAIL during collection: `ImportError: cannot import name 'tasks' from 'apps.core'`, `cannot import name 'selectors' from 'apps.core'`, `cannot import name 'JobStatus' from 'apps.core.models'`, `cannot import name 'tasks' from 'apps.accounts'`.

- [ ] **Step 6: Add the `JobStatus` model and install Procrastinate**

Append to `backend/apps/core/models.py`:

```python


class JobStatus(models.Model):
    """The last run of each scheduled job: read by the health check and by the Status page (UI 9.1)."""

    name = models.CharField(max_length=80, unique=True)
    schedule = models.CharField(max_length=60, blank=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_finished_at = models.DateTimeField(null=True, blank=True)
    last_ok = models.BooleanField(null=True, blank=True)
    last_detail = models.TextField(blank=True)
    consecutive_failures = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
```

In `backend/config/settings.py`, replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "procrastinate.contrib.django",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.settings",
    "apps.notifications",
]
```

Run: `docker compose run --rm app python manage.py makemigrations core`

Expected: `Migrations for 'core':` with `apps/core/migrations/0001_initial.py` listing `Create model JobStatus`.

- [ ] **Step 7: Write the job helpers**

`backend/apps/core/jobs.py`:

```python
"""Scheduled jobs (PRD 9.5). A task is a thin Procrastinate wrapper around a service; `recorded` keeps its last run."""

import functools
import json
import logging
from collections.abc import Callable
from typing import Any

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import F
from django.utils import timezone
from procrastinate import RetryStrategy

from apps.core.models import JobStatus

logger = logging.getLogger("iris.jobs")

HEARTBEAT = "core.heartbeat"

# Three attempts in all, 5 seconds then 25 seconds apart ("retried with back-off", PRD 9.5).
RETRY = RetryStrategy(max_attempts=3, exponential_wait=5)
NOTIFY_AFTER_FAILURES = 3  # the retries are used up: tell the System Administrators


def periodic_schedules() -> dict[str, str]:
    """The cron expression (UTC) of every periodic task, by task name. Empty if the registry cannot be read."""
    try:
        from procrastinate.contrib.django import app

        return {entry.task.name: entry.cron for entry in app.periodic_registry.periodic_tasks.values()}
    except Exception:  # the registry layout is not part of Procrastinate's documented interface
        logger.warning("could not read the periodic task registry", exc_info=True)
        return {}


def _describe(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, dict):
        return json.dumps(result, cls=DjangoJSONEncoder, sort_keys=True)
    return str(result)[:2000]


def _succeeded(name: str, result: Any) -> None:
    JobStatus.objects.filter(name=name).update(
        last_finished_at=timezone.now(), last_ok=True, last_detail=_describe(result), consecutive_failures=0
    )


def _failed(name: str, exc: Exception) -> None:
    JobStatus.objects.filter(name=name).update(
        last_finished_at=timezone.now(),
        last_ok=False,
        last_detail=f"{type(exc).__name__}: {exc}"[:2000],
        consecutive_failures=F("consecutive_failures") + 1,
    )
    failures = JobStatus.objects.values_list("consecutive_failures", flat=True).get(name=name)
    logger.error("job failed", exc_info=exc, extra={"data": {"job": name, "consecutive_failures": failures}})
    if failures >= NOTIFY_AFTER_FAILURES:
        _notify_administrators(name)


def _notify_administrators(name: str) -> None:
    # Imported here: apps.core is loaded before the apps it would otherwise import.
    from apps.accounts.roles import Role, users_with_role
    from apps.notifications import services as notifications

    notifications.notify(
        users=users_with_role(Role.SYSADMIN),
        event="job.failed",
        params={"job": name},
        target_type="job",
        dedupe_key=f"job.failed:{name}:{timezone.localdate().isoformat()}",
    )


def recorded(name: str) -> Callable:
    """Decorator for a job function: stores each run in JobStatus, reports repeated failure, re-raises errors."""

    def decorator(function: Callable) -> Callable:
        @functools.wraps(function)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            JobStatus.objects.update_or_create(
                name=name,
                defaults={"last_started_at": timezone.now(), "schedule": periodic_schedules().get(name, "")},
            )
            try:
                result = function(*args, **kwargs)
            except Exception as exc:
                _failed(name, exc)
                raise
            _succeeded(name, result)
            return result

        return wrapper

    return decorator
```

- [ ] **Step 8: Write the heartbeat task and the clean-up job**

`backend/apps/core/tasks.py`:

```python
from procrastinate.contrib.django import app

from apps.core.jobs import HEARTBEAT, recorded


@app.periodic(cron="* * * * *")
@app.task(name=HEARTBEAT, queueing_lock=HEARTBEAT)
@recorded(HEARTBEAT)
def heartbeat(timestamp: int) -> None:
    """Proves that the worker is alive: the health check reads when this last ran."""
```

`backend/apps/accounts/services/housekeeping.py`:

```python
from datetime import datetime

from django.contrib.auth.hashers import UNUSABLE_PASSWORD_PREFIX
from django.contrib.sessions.models import Session
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User


@transaction.atomic
def cleanup(*, now: datetime | None = None) -> dict[str, int]:
    """Daily job body: deletes expired sessions and makes expired temporary passwords unusable. Safe to repeat."""
    now = now or timezone.now()

    expired_sessions = Session.objects.filter(expire_date__lt=now)
    sessions = expired_sessions.count()
    expired_sessions.delete()

    stale = User.objects.filter(must_change_password=True, temp_password_expires_at__lt=now).exclude(
        password__startswith=UNUSABLE_PASSWORD_PREFIX
    )
    passwords = 0
    for user in stale:
        user.set_unusable_password()
        user.save(update_fields=["password"])
        passwords += 1

    return {"expired_sessions": sessions, "expired_temporary_passwords": passwords}
```

`backend/apps/accounts/tasks.py`:

```python
from procrastinate.contrib.django import app

from apps.accounts import services
from apps.core.jobs import RETRY, recorded


@app.periodic(cron="30 1 * * *")  # 02:30 in Africa/Tunis: Procrastinate reads cron expressions in UTC
@app.task(name="accounts.cleanup", retry=RETRY, queueing_lock="accounts.cleanup")
@recorded("accounts.cleanup")
def cleanup(timestamp: int) -> dict[str, int]:
    return services.cleanup()
```

Replace `backend/apps/accounts/services/__init__.py` with:

```python
"""Writes of the accounts app. Import names from here: `from apps.accounts import services`."""

from apps.accounts.services.administration import (
    assign_role,
    create_account,
    disable_account,
    enable_account,
    remove_role,
    reset_password,
    unlock_account,
)
from apps.accounts.services.housekeeping import cleanup
from apps.accounts.services.naming import display_name
from apps.accounts.services.preferences import update_preferences
from apps.accounts.services.signin import authenticate, change_password, end_session, start_session

__all__ = [
    "assign_role",
    "authenticate",
    "change_password",
    "cleanup",
    "create_account",
    "disable_account",
    "display_name",
    "enable_account",
    "end_session",
    "remove_role",
    "reset_password",
    "start_session",
    "unlock_account",
    "update_preferences",
]
```

- [ ] **Step 9: Write the selectors of the health check and the Status page**

`backend/apps/core/selectors.py`:

```python
"""Reads for the health check and the Status page (UI 9.1)."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from croniter import croniter
from django.conf import settings
from django.db import DatabaseError, connection
from django.utils import timezone

from apps.core.jobs import HEARTBEAT, periodic_schedules
from apps.core.models import JobStatus

HEARTBEAT_MAX_AGE = timedelta(minutes=3)
BACKUP_JOB = "ops.backup"


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except DatabaseError:
        return False


def _worker_ok(now: datetime) -> bool:
    try:
        beat = (
            JobStatus.objects.filter(name=HEARTBEAT, last_ok=True).values_list("last_finished_at", flat=True).first()
        )
    except DatabaseError:
        return False
    return beat is not None and now - beat <= HEARTBEAT_MAX_AGE


def health_report(*, now: datetime | None = None) -> dict[str, str]:
    now = now or timezone.now()
    database = _database_ok()
    worker = database and _worker_ok(now)
    return {
        "status": "ok" if database and worker else "degraded",
        "app": "ok",
        "database": "ok" if database else "fail",
        "worker": "ok" if worker else "stale",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


def _next_run(schedule: str, now: datetime) -> datetime | None:
    if not schedule:
        return None
    try:
        return croniter(schedule, now.astimezone(UTC)).get_next(datetime)
    except (ValueError, KeyError):
        return None


def job_rows(*, now: datetime | None = None) -> list[dict[str, Any]]:
    """Every scheduled job with its last run and its next one. Failed jobs come first."""
    now = now or timezone.now()
    schedules = periodic_schedules()
    statuses = {status.name: status for status in JobStatus.objects.all()}
    rows = []
    for name in sorted(set(schedules) | set(statuses)):
        status = statuses.get(name)
        schedule = schedules.get(name) or (status.schedule if status else "")
        rows.append(
            {
                "name": name,
                "schedule": schedule,
                "last_started_at": status.last_started_at if status else None,
                "last_finished_at": status.last_finished_at if status else None,
                "last_ok": status.last_ok if status else None,
                "last_detail": status.last_detail if status else "",
                "next_run_at": _next_run(schedule, now),
            }
        )
    rows.sort(key=lambda row: (row["last_ok"] is not False, row["name"]))
    return rows


def backup_info() -> dict[str, Any] | None:
    """The last successful backup, as reported by the `ops.backup` job that plan 07 adds."""
    status = JobStatus.objects.filter(name=BACKUP_JOB, last_ok=True).first()
    if status is None or status.last_finished_at is None:
        return None
    try:
        detail = json.loads(status.last_detail or "{}")
    except ValueError:
        detail = {}
    return {
        "last_at": status.last_finished_at,
        "size_bytes": detail.get("size_bytes"),
        "storage_used_bytes": detail.get("storage_used_bytes"),
    }


def admin_status(*, now: datetime | None = None) -> dict[str, Any]:
    from apps.accounts import selectors as account_selectors  # apps.core is loaded before apps.accounts

    now = now or timezone.now()
    return {
        "health": health_report(now=now),
        "accounts": account_selectors.accounts_needing_attention(now=now),
        "jobs": job_rows(now=now),
        "backup": backup_info(),
    }
```

- [ ] **Step 10: Write the API**

`backend/apps/core/api/serializers.py`:

```python
from rest_framework import serializers


class HealthOut(serializers.Serializer):
    status = serializers.CharField()
    app = serializers.CharField()
    database = serializers.CharField()
    worker = serializers.CharField()
    version = serializers.CharField()
    environment = serializers.CharField()


class AccountBriefOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.CharField()


class AccountsAttentionOut(serializers.Serializer):
    locked = AccountBriefOut(many=True)
    awaiting_first_sign_in = AccountBriefOut(many=True)
    temp_expired = AccountBriefOut(many=True)
    employees_without_account = AccountBriefOut(many=True)


class JobOut(serializers.Serializer):
    name = serializers.CharField()
    schedule = serializers.CharField(allow_blank=True)
    last_started_at = serializers.DateTimeField(allow_null=True)
    last_finished_at = serializers.DateTimeField(allow_null=True)
    last_ok = serializers.BooleanField(allow_null=True)
    last_detail = serializers.CharField(allow_blank=True)
    next_run_at = serializers.DateTimeField(allow_null=True)


class BackupOut(serializers.Serializer):
    last_at = serializers.DateTimeField()
    size_bytes = serializers.IntegerField(allow_null=True)
    storage_used_bytes = serializers.IntegerField(allow_null=True)


class StatusOut(serializers.Serializer):
    health = HealthOut()
    accounts = AccountsAttentionOut()
    jobs = JobOut(many=True)
    backup = BackupOut(allow_null=True)
```

`backend/apps/core/api/views.py`:

```python
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import PUBLIC
from apps.accounts.roles import Role
from apps.core import selectors
from apps.core.api.serializers import HealthOut, StatusOut


class HealthView(APIView):
    """Called by the update command and by monitoring. 200 when everything works, 503 otherwise."""

    access = {"GET": PUBLIC}
    http_method_names = ["get"]
    authentication_classes: list = []  # must answer even when sessions cannot be read

    @extend_schema(operation_id="health", auth=[], responses={200: HealthOut, 503: HealthOut})
    def get(self, request):
        report = selectors.health_report()
        return Response(HealthOut(report).data, status=200 if report["status"] == "ok" else 503)


class StatusView(APIView):
    access = {"GET": {Role.SYSADMIN, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="admin_status", responses=StatusOut)
    def get(self, request):
        return Response(StatusOut(selectors.admin_status()).data)
```

`backend/apps/core/api/urls.py`:

```python
from django.urls import path

from apps.core.api import views

app_name = "core"

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
    path("admin/status", views.StatusView.as_view(), name="admin-status"),
]
```

Replace `backend/config/api_urls.py` with:

```python
"""Every API route. Each app contributes one include line."""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.core.api.urls")),
    path("", include("apps.accounts.api.urls")),
    path("", include("apps.audit.api.urls")),
    path("", include("apps.settings.api.urls")),
    path("", include("apps.notifications.api.urls")),
]
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core apps/accounts/tests/test_housekeeping.py -q`

Expected: PASS, no failures.

If `test_the_periodic_jobs_of_this_plan_are_registered_with_procrastinate` fails with a `KeyError`, the installed Procrastinate keeps its periodic tasks elsewhere. Run `docker compose run --rm app python manage.py shell -c "from procrastinate.contrib.django import app; print([n for n in dir(app) if 'period' in n])"`, read the attribute it prints, and adapt the single return line of `periodic_schedules()`.

- [ ] **Step 12: Start the whole stack and watch the worker**

Run:

```powershell
docker compose run --rm app python manage.py migrate
docker compose up -d
Start-Sleep -Seconds 90
curl.exe -s -w "`n%{http_code}`n" http://localhost:8000/api/v1/health
docker compose logs worker --tail 5
```

Expected: `migrate` applies `core.0001_initial` and the `procrastinate` migrations. After 90 seconds the health call prints `{"status":"ok","app":"ok","database":"ok","worker":"ok","version":"dev","environment":"development"}` and `200`. The worker log shows JSON lines from the `procrastinate` loggers about the task `core.heartbeat`.

- [ ] **Step 13: Commit**

```bash
git add backend/apps/core backend/apps/accounts backend/config
git commit -m "feat(core): job runner with heartbeat and clean-up, health check and system status"
```

---

### Task 19: Unexpected errors notify the System Administrators

**Files:**
- Modify: `backend/apps/core/api/problems.py`, `backend/apps/core/tests/test_problems.py`
- Test: `backend/apps/core/tests/test_unexpected.py`

**Interfaces:**
- Consumes: `exception_handler`, `server_error_view` (Task 7); `notifications.notify` and the `error.unexpected` event (Task 11); `users_with_role` (Task 9); `apps.core.tests.urls_problems` (Task 7).
- Produces: an unexpected error (status 500, code `core.unexpected`) now also stores an `error.unexpected` notification for every active System Administrator, at most one per administrator per clock hour, carrying the request id as `reference` (PRD 9.7). A failure to notify never changes the response.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_unexpected.py`:

```python
import logging
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.test import RequestFactory
from rest_framework.test import APIClient

from apps.accounts.tests.world import make_user
from apps.core.api import problems
from apps.notifications import services as notifications
from apps.notifications.models import Notification

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.core.tests.urls_problems")]

START = datetime(2026, 10, 6, 8, 10, tzinfo=UTC)


def crash():
    return APIClient().get("/probe", {"kind": "crash"})


def test_an_unexpected_error_tells_every_active_administrator(world):
    second = make_user("second.admin@impactrisks.com", roles=["sysadmin"])
    make_user("gone.admin@impactrisks.com", roles=["sysadmin"], is_active=False)

    response = crash()

    told = Notification.objects.filter(event_code="error.unexpected")
    assert response.status_code == 500
    assert {n.user for n in told} == {world.sysadmin_user, second}
    assert all(n.parameters == {"reference": response["X-Request-ID"]} for n in told)
    rendered = notifications.render(told[0], "en")
    assert response["X-Request-ID"] in rendered["body"]
    assert rendered["link"] == "/admin"


def test_administrators_are_told_once_per_hour(world):
    with time_machine.travel(START, tick=False) as clock:
        crash()
        clock.shift(timedelta(minutes=40))  # 08:50, the same clock hour
        crash()
        assert Notification.objects.filter(event_code="error.unexpected").count() == 1

        clock.shift(timedelta(minutes=20))  # 09:10, the next clock hour
        crash()

    assert Notification.objects.filter(event_code="error.unexpected").count() == 2


def test_expected_errors_tell_nobody(world):
    client = APIClient()
    client.get("/probe", {"kind": "not_found"})
    client.get("/probe", {"kind": "domain"})
    client.post("/probe", {})

    assert not Notification.objects.filter(event_code="error.unexpected").exists()


def test_without_an_administrator_the_error_is_still_answered():
    response = crash()

    assert response.status_code == 500
    assert response.json()["code"] == "core.unexpected"
    assert not Notification.objects.filter(event_code="error.unexpected").exists()


def test_a_failure_to_notify_does_not_change_the_answer(world, monkeypatch, caplog):
    def broken_notify(**arguments):
        raise RuntimeError("notification table is gone")

    monkeypatch.setattr(notifications, "notify", broken_notify)

    with caplog.at_level(logging.ERROR, logger="iris.errors"):
        response = crash()

    assert response.status_code == 500
    assert response.json()["code"] == "core.unexpected"
    assert "notification table is gone" not in response.content.decode()
    messages = [record.getMessage() for record in caplog.records]
    assert "unexpected error" in messages
    assert "could not notify the administrators of an unexpected error" in messages


def test_an_error_outside_a_view_notifies_too(world):
    response = problems.server_error_view(RequestFactory().get("/api/v1/anything"))

    assert response.status_code == 500
    assert Notification.objects.filter(event_code="error.unexpected", user=world.sysadmin_user).count() == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_unexpected.py -q`

Expected: FAIL. Four tests fail because no notification is stored (`assert set() == {...}`, `assert 0 == 1`, a missing log message); the two tests that expect no notification pass already.

- [ ] **Step 3: Notify from both places that answer 500**

In `backend/apps/core/api/problems.py`:

Replace the import block at the top with:

```python
import logging
from http import HTTPStatus
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import transaction
from django.http import Http404, JsonResponse
from django.utils import timezone
from rest_framework import exceptions as drf
from rest_framework.response import Response

from apps.core import context
from apps.core.errors import DomainError
from apps.core.i18n import translate
```

Insert this function after `_unexpected_errors`:

```python
def _notify_administrators() -> None:
    """Tells the System Administrators, at most once per clock hour, that someone met an error (PRD 9.7)."""
    try:
        # Imported here: apps.core is loaded before the apps it would otherwise import.
        from apps.accounts.roles import Role, users_with_role
        from apps.notifications import services as notifications

        with transaction.atomic():
            notifications.notify(
                users=users_with_role(Role.SYSADMIN),
                event="error.unexpected",
                params={"reference": context.current_request_id()},
                dedupe_key=f"error.unexpected:{timezone.now():%Y%m%d%H}",
            )
    except Exception:  # the user must get the 500 answer whatever happens here
        logger.exception("could not notify the administrators of an unexpected error")
```

In `exception_handler`, replace the last two lines:

```python
    logger.error("unexpected error", exc_info=exc)
    return _respond(500, "core.unexpected", _unexpected_errors())
```

with:

```python
    logger.error("unexpected error", exc_info=exc)
    _notify_administrators()
    return _respond(500, "core.unexpected", _unexpected_errors())
```

Replace `server_error_view` with:

```python
def server_error_view(request) -> JsonResponse:
    """Django's handler500: an error raised outside a DRF view. Django has already logged it."""
    _notify_administrators()
    body = problem_body(status=500, code="core.unexpected", errors=_unexpected_errors())
    return JsonResponse(body, status=500, content_type=CONTENT_TYPE)
```

The crash test of Task 7 now reaches the database (the handler looks for administrators). In `backend/apps/core/tests/test_problems.py`, replace the line `pytestmark = pytest.mark.urls("apps.core.tests.urls_problems")` with:

```python
pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.core.tests.urls_problems")]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core -q`

Expected: PASS, no failures.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core
git commit -m "feat(core): unexpected errors notify the System Administrators once per hour"
```

---

### Task 20: The permission matrix

**Files:**
- Create: `backend/tests/matrix.py`, `backend/tests/test_permission_matrix.py`
- Create: `backend/apps/core/tests/matrix.py`, `backend/apps/accounts/tests/matrix.py`, `backend/apps/audit/tests/matrix.py`, `backend/apps/settings/tests/matrix.py`, `backend/apps/notifications/tests/matrix.py`
- Test: `backend/tests/test_matrix_helpers.py` (the harness itself), `backend/tests/test_permission_matrix.py` (the matrix)

**Interfaces:**
- Consumes: every route of Tasks 11, 13, 15, 16, 17 and 18; the `world` fixture and `World.user_for` (Task 9); `world.owner_notification` (Task 11); `TEST_HR_FLAG` (Task 10).
- Produces (master 6.11, PRD section 10):
  - `tests.matrix`: `P` (personas `ANON`, `OWNER`, `PEER`, `MANAGER`, `OTHER_MANAGER`, `OUTSIDER`, `HR`, `EXEC`, `SYSADMIN`), `ALLOW`, `DENY` (403), `HIDE` (404), `LOGIN` (401), `EVERYONE`, `SIGNED_IN`, `Case(route, method, expect, kwargs, body, query, label, format)`, `only(*allowed, hide=())`, `verdict(case, persona, status) -> str | None`, `missing_cases(declared, cases)`, `unknown_cases(declared, cases)`.
  - `ALLOW` accepts any status except 401, 403, 404 and 500.
  - `backend/tests/test_permission_matrix.py` with `MATRIX_MODULES`. Each later plan appends its module path to that list and writes `CASES` in `apps/<app>/tests/matrix.py`.
  - Three build-breaking checks: a route without a name or a view without `access`; a declared `(route, method)` without a case; a case that expects the wrong status.

- [ ] **Step 1: Write the failing tests of the harness**

`backend/tests/test_matrix_helpers.py`:

```python
from tests.matrix import ALLOW, DENY, EVERYONE, HIDE, LOGIN, SIGNED_IN, Case, P, missing_cases, only, unknown_cases, verdict


def test_only_allows_the_named_personas_and_denies_the_rest():
    expect = only(P.HR, P.EXEC)

    assert expect[P.HR] == ALLOW and expect[P.EXEC] == ALLOW
    assert expect[P.ANON] == LOGIN
    assert expect[P.OWNER] == DENY and expect[P.SYSADMIN] == DENY
    assert set(expect) == set(P)


def test_only_can_hide_an_item_from_some_personas():
    expect = only(P.OWNER, hide=[P.PEER, P.HR])

    assert expect[P.OWNER] == ALLOW
    assert expect[P.PEER] == HIDE and expect[P.HR] == HIDE
    assert expect[P.MANAGER] == DENY
    assert expect[P.ANON] == LOGIN


def test_everyone_includes_anonymous_callers_and_signed_in_does_not():
    assert only(*EVERYONE)[P.ANON] == ALLOW
    assert only(*SIGNED_IN)[P.ANON] == LOGIN
    assert len(EVERYONE) == 9 and len(SIGNED_IN) == 8


def test_a_case_has_readable_identifiers():
    assert Case("accounts:me", "GET", only(*SIGNED_IN)).id == "GET accounts:me"
    assert Case("requests:detail", "GET", only(P.OWNER), label="draft").id == "GET requests:detail [draft]"


def test_a_case_defaults_to_no_arguments_and_json():
    case = Case("accounts:me", "GET", only(*SIGNED_IN))

    assert case.kwargs(None) == {}
    assert case.body(None) is None
    assert case.query(None) == {}
    assert case.format == "json"


def test_verdict_accepts_any_working_answer_for_an_allowed_persona():
    case = Case("x:y", "POST", only(P.HR))

    assert verdict(case, P.HR, 200) is None
    assert verdict(case, P.HR, 201) is None
    assert verdict(case, P.HR, 400) is None  # allowed in; the payload was simply not valid
    assert verdict(case, P.HR, 409) is None
    assert verdict(case, P.HR, 503) is None


def test_verdict_refuses_a_blocked_or_broken_answer_for_an_allowed_persona():
    case = Case("x:y", "POST", only(P.HR))

    for status in (401, 403, 404, 500):
        assert "HR" in verdict(case, P.HR, status).upper()


def test_verdict_wants_the_exact_refusal_for_the_others():
    case = Case("x:y", "GET", only(P.OWNER, hide=[P.PEER]))

    assert verdict(case, P.ANON, 401) is None
    assert verdict(case, P.MANAGER, 403) is None
    assert verdict(case, P.PEER, 404) is None
    assert verdict(case, P.MANAGER, 200) is not None  # a leak
    assert verdict(case, P.PEER, 403) is not None  # reveals that the item exists
    assert verdict(case, P.ANON, 403) is not None


def test_verdict_refuses_a_case_that_forgets_a_persona():
    case = Case("x:y", "GET", {P.HR: ALLOW})

    assert "does not say" in verdict(case, P.OWNER, 403)


def test_an_endpoint_without_a_case_is_found():
    declared = {("accounts:me", "GET"), ("accounts:me", "PATCH"), ("new:thing", "POST")}
    cases = [Case("accounts:me", "GET", only(*SIGNED_IN)), Case("accounts:me", "PATCH", only(*SIGNED_IN))]

    assert missing_cases(declared, cases) == [("new:thing", "POST")]
    assert missing_cases({("accounts:me", "GET")}, cases) == []


def test_a_case_for_something_that_does_not_exist_is_found():
    cases = [Case("accounts:me", "GET", only(*SIGNED_IN)), Case("accounts:gone", "GET", only(*SIGNED_IN))]

    assert unknown_cases({("accounts:me", "GET")}, cases) == [("accounts:gone", "GET")]
```

- [ ] **Step 2: Write the matrix test**

`backend/tests/test_permission_matrix.py`:

```python
"""Calls every endpoint as every persona (PRD section 10). A new endpoint without a case fails the build."""

from importlib import import_module
from urllib.parse import urlencode

import pytest
from django.urls import URLPattern, URLResolver, reverse
from rest_framework.test import APIClient

from tests.matrix import Case, P, missing_cases, unknown_cases, verdict

# One module per app. A plan that adds an app appends its line here.
MATRIX_MODULES = [
    "apps.core.tests.matrix",
    "apps.accounts.tests.matrix",
    "apps.audit.tests.matrix",
    "apps.settings.tests.matrix",
    "apps.notifications.tests.matrix",
]


def all_cases() -> list[Case]:
    cases: list[Case] = []
    for path in MATRIX_MODULES:
        cases.extend(import_module(path).CASES)
    return cases


def api_views() -> list[tuple[str | None, type | None]]:
    """(route name, view class) for every route under /api/v1/."""
    found: list[tuple[str | None, type | None]] = []

    def walk(patterns, prefix: str) -> None:
        for entry in patterns:
            if isinstance(entry, URLResolver):
                walk(entry.url_patterns, f"{prefix}{entry.namespace}:" if entry.namespace else prefix)
            elif isinstance(entry, URLPattern):
                view_class = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
                found.append((f"{prefix}{entry.name}" if entry.name else None, view_class))

    walk(import_module("config.api_urls").urlpatterns, "")
    return found


def declared_endpoints() -> set[tuple[str, str]]:
    return {
        (name, method)
        for name, view_class in api_views()
        if name is not None and view_class is not None
        for method in getattr(view_class, "access", {})
    }


CASES = all_cases()


def test_every_route_has_a_name_and_a_view_that_declares_its_access():
    problems = []
    for name, view_class in api_views():
        if name is None:
            problems.append(f"a route served by {view_class} has no name")
        elif view_class is None:
            problems.append(f"{name}: not a class-based API view")
        elif not isinstance(getattr(view_class, "access", None), dict):
            problems.append(f"{name}: {view_class.__name__} declares no access")
        else:
            served = {method.upper() for method in view_class.http_method_names}
            if served != set(view_class.access):
                problems.append(
                    f"{name}: http_method_names {sorted(served)} and access {sorted(view_class.access)} differ"
                )

    assert problems == []


def test_every_endpoint_has_a_case():
    missing = missing_cases(declared_endpoints(), CASES)

    assert missing == [], "Add a Case for each of these to the app's tests/matrix.py"


def test_every_case_names_an_existing_endpoint():
    assert unknown_cases(declared_endpoints(), CASES) == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("case", "persona"),
    [(case, persona) for case in CASES for persona in P],
    ids=[f"{case.id} as {persona.value}" for case in CASES for persona in P],
)
def test_matrix(case: Case, persona: P, world):
    client = APIClient()
    user = world.user_for(persona)
    if user is not None:
        client.force_login(user)

    url = reverse(case.route, kwargs=case.kwargs(world))
    query = case.query(world)
    if case.method == "GET":
        response = client.get(url, query)
    else:
        if query:
            url = f"{url}?{urlencode(query)}"
        response = getattr(client, case.method.lower())(url, data=case.body(world), format=case.format)

    problem = verdict(case, persona, response.status_code)
    assert problem is None, problem
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest tests/test_matrix_helpers.py tests/test_permission_matrix.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'tests.matrix'`.

- [ ] **Step 4: Write the harness**

`backend/tests/matrix.py`:

```python
"""The vocabulary of the permission matrix (master 6.11)."""

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class P(StrEnum):
    """Personas of the standard cast. `World.user_for(persona)` gives the account."""

    ANON = "anon"
    OWNER = "owner"
    PEER = "peer"
    MANAGER = "manager"
    OTHER_MANAGER = "other_manager"
    OUTSIDER = "outsider"
    HR = "hr"
    EXEC = "exec"
    SYSADMIN = "sysadmin"


ALLOW = "allow"  # any status except 401, 403, 404 and 500
DENY = 403  # signed in, but the role may not use this endpoint
HIDE = 404  # the item is outside this persona's reach, and must look as if it did not exist
LOGIN = 401  # no session

BLOCKED_OR_BROKEN = (401, 403, 404, 500)

EVERYONE = tuple(P)
SIGNED_IN = tuple(persona for persona in P if persona is not P.ANON)


@dataclass(frozen=True)
class Case:
    """One endpoint and what each persona must get from it."""

    route: str  # "accounts:account-detail"
    method: str  # "GET"
    expect: Mapping[P, object]
    kwargs: Callable[[Any], dict] = lambda world: {}  # URL arguments, built from the cast
    body: Callable[[Any], dict | None] = lambda world: None  # request body for unsafe methods
    query: Callable[[Any], dict] = lambda world: {}
    label: str = ""  # distinguishes several cases of one endpoint
    format: str = "json"  # "multipart" for uploads

    @property
    def id(self) -> str:
        return f"{self.method} {self.route}" + (f" [{self.label}]" if self.label else "")


def only(*allowed: P, hide: Iterable[P] = ()) -> dict[P, object]:
    """`allowed` get ALLOW, `hide` get 404, anonymous gets 401 (unless allowed), everyone else gets 403."""
    hidden = set(hide)
    expect: dict[P, object] = {}
    for persona in P:
        if persona in allowed:
            expect[persona] = ALLOW
        elif persona in hidden:
            expect[persona] = HIDE
        elif persona is P.ANON:
            expect[persona] = LOGIN
        else:
            expect[persona] = DENY
    return expect


def verdict(case: Case, persona: P, status: int) -> str | None:
    """None when `status` is what the case expects for `persona`, else a sentence saying what is wrong."""
    if persona not in case.expect:
        return f"{case.id}: the case does not say what {persona.value} must get"
    expected = case.expect[persona]
    if expected == ALLOW:
        if status in BLOCKED_OR_BROKEN:
            return f"{case.id}: {persona.value} must be let in, but got {status}"
        return None
    if status != expected:
        return f"{case.id}: {persona.value} must get {expected}, but got {status}"
    return None


def missing_cases(declared: set[tuple[str, str]], cases: Iterable[Case]) -> list[tuple[str, str]]:
    """Declared (route, method) pairs that no case covers."""
    covered = {(case.route, case.method) for case in cases}
    return sorted(declared - covered)


def unknown_cases(declared: set[tuple[str, str]], cases: Iterable[Case]) -> list[tuple[str, str]]:
    """Cases whose (route, method) is not declared by any view."""
    covered = {(case.route, case.method) for case in cases}
    return sorted(covered - declared)
```

- [ ] **Step 5: Write the cases of the five apps**

`backend/apps/core/tests/matrix.py`:

```python
from tests.matrix import EVERYONE, Case, P, only

CASES = [
    Case("core:health", "GET", only(*EVERYONE)),
    Case("core:admin-status", "GET", only(P.SYSADMIN, P.EXEC)),
]
```

`backend/apps/accounts/tests/matrix.py`:

```python
from tests.matrix import EVERYONE, SIGNED_IN, Case, P, only


def owner(world) -> dict:
    return {"public_id": world.owner_user.public_id}


ADMIN_ONLY = only(P.SYSADMIN)

CASES = [
    # session
    Case("accounts:csrf", "GET", only(*EVERYONE)),
    Case(
        "accounts:login",
        "POST",
        only(*EVERYONE),
        body=lambda world: {"email": "nobody@impactrisks.com", "password": "not-a-real-password"},
    ),
    Case("accounts:logout", "POST", only(*SIGNED_IN)),
    Case("accounts:me", "GET", only(*SIGNED_IN)),
    Case("accounts:me", "PATCH", only(*SIGNED_IN), body=lambda world: {"language": "en"}),
    Case(
        "accounts:password",
        "POST",
        only(*SIGNED_IN),
        body=lambda world: {"current_password": "not-the-password", "new_password": "Another-Horse-43!"},
    ),
    # account administration: the System Administrator acts, Executive Management reads (PRD section 7)
    Case("accounts:account-list", "GET", only(P.SYSADMIN, P.EXEC)),
    Case(
        "accounts:account-list",
        "POST",
        ADMIN_ONLY,
        body=lambda world: {"email": "new.person@impactrisks.com", "full_name": "New Person", "roles": []},
    ),
    Case("accounts:account-candidates", "GET", ADMIN_ONLY),
    Case("accounts:account-detail", "GET", only(P.SYSADMIN, P.EXEC), kwargs=owner),
    Case("accounts:account-reset-password", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-roles", "POST", ADMIN_ONLY, kwargs=owner, body=lambda world: {"role": "exec"}),
    Case(
        "accounts:account-role",
        "DELETE",
        ADMIN_ONLY,
        kwargs=lambda world: {"public_id": world.exec_user.public_id, "role": "exec"},
    ),
    Case("accounts:account-disable", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-enable", "POST", ADMIN_ONLY, kwargs=owner),
    Case("accounts:account-unlock", "POST", ADMIN_ONLY, kwargs=owner),
]
```

`backend/apps/audit/tests/matrix.py`:

```python
from tests.matrix import Case, P, only

BUSINESS_READERS = only(P.HR, P.EXEC)
SECURITY_READERS = only(P.SYSADMIN, P.EXEC)

CASES = [
    Case("audit:business", "GET", BUSINESS_READERS),
    Case("audit:business-export", "GET", BUSINESS_READERS),
    Case("audit:security", "GET", SECURITY_READERS),
    Case("audit:security-export", "GET", SECURITY_READERS),
]
```

`backend/apps/settings/tests/matrix.py`:

```python
from apps.settings.tests.world import TEST_HR_FLAG
from tests.matrix import Case, P, only

CASES = [
    Case("settings:hr", "GET", only(P.HR, P.EXEC)),
    Case(
        "settings:hr-item",
        "PUT",
        only(P.HR),
        kwargs=lambda world: {"key": TEST_HR_FLAG},
        body=lambda world: {"value": True},
    ),
    Case("settings:system", "GET", only(P.SYSADMIN, P.EXEC)),
    Case(
        "settings:system-item",
        "PUT",
        only(P.SYSADMIN),
        kwargs=lambda world: {"key": "lockout_threshold"},
        body=lambda world: {"value": 6},
    ),
]
```

`backend/apps/notifications/tests/matrix.py`:

```python
from tests.matrix import SIGNED_IN, Case, P, only

NOT_THE_OWNER = [persona for persona in SIGNED_IN if persona is not P.OWNER]

CASES = [
    Case("notifications:list", "GET", only(*SIGNED_IN)),
    Case("notifications:unread-count", "GET", only(*SIGNED_IN)),
    Case("notifications:read-all", "POST", only(*SIGNED_IN)),
    # A notification belongs to one user: to everyone else it does not exist.
    Case(
        "notifications:read",
        "POST",
        only(P.OWNER, hide=NOT_THE_OWNER),
        kwargs=lambda world: {"pk": world.owner_notification.pk},
    ),
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest tests/test_matrix_helpers.py tests/test_permission_matrix.py -q`

Expected: PASS, no failures. The matrix runs 30 cases as 9 personas: 270 checks, plus the 3 structure tests and the 11 helper tests.

- [ ] **Step 7: Prove that a missing case breaks the build**

In `backend/apps/core/tests/matrix.py`, delete the `core:admin-status` line, then run:

`docker compose run --rm app pytest tests/test_permission_matrix.py::test_every_endpoint_has_a_case -q`

Expected: FAIL with `assert [('core:admin-status', 'GET')] == []` and the hint `Add a Case for each of these to the app's tests/matrix.py`.

Restore the line (`git checkout backend/apps/core/tests/matrix.py` does not apply yet because the file is new: put the line back by hand), run the command again, and expect `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add backend/tests backend/apps
git commit -m "test: permission matrix covering every endpoint as every persona"
```

---

### Task 21: OpenAPI description

**Files:**
- Create: `backend/apps/accounts/schema.py`, `backend/openapi.yaml` (generated)
- Modify: `backend/apps/accounts/apps.py`, `backend/config/settings.py`
- Test: `backend/tests/test_openapi.py`

**Interfaces:**
- Consumes: every view of this plan (each method already carries `@extend_schema` with an `operation_id`); `scripts/dev.ps1 openapi` (Task 1).
- Produces (PRD 9.3: "An OpenAPI description is generated from the code and checked in the build"):
  - `backend/openapi.yaml`, committed. Plan 01b generates `frontend/src/api/schema.d.ts` from it.
  - `backend/tests/test_openapi.py`, which fails when the committed file differs from what the code generates, or when generation emits a warning.
  - Rules for every later view: each method has `@extend_schema` with a unique `operation_id`, a request serializer (or `None`) and its responses; each `SerializerMethodField` has `@extend_schema_field`; a choice set used under two field names gets an entry in `ENUM_NAME_OVERRIDES`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_openapi.py`:

```python
"""The committed OpenAPI description must be what the code generates (PRD 9.3, 12.4)."""

from pathlib import Path

import yaml
from django.conf import settings
from django.core.management import call_command

COMMITTED = Path(settings.BASE_DIR) / "openapi.yaml"

EXPECTED_OPERATIONS = {
    "health",
    "admin_status",
    "auth_csrf",
    "auth_login",
    "auth_logout",
    "auth_me",
    "auth_me_update",
    "auth_password",
    "accounts_list",
    "accounts_create",
    "accounts_candidates",
    "accounts_detail",
    "accounts_reset_password",
    "accounts_role_add",
    "accounts_role_remove",
    "accounts_disable",
    "accounts_enable",
    "accounts_unlock",
    "audit_business_list",
    "audit_business_export",
    "audit_security_list",
    "audit_security_export",
    "settings_hr_list",
    "settings_hr_update",
    "settings_system_list",
    "settings_system_update",
    "notifications_list",
    "notifications_unread_count",
    "notifications_read",
    "notifications_read_all",
}


def committed() -> dict:
    return yaml.safe_load(COMMITTED.read_text(encoding="utf-8"))


def operations(document: dict) -> dict[str, dict]:
    return {
        operation["operationId"]: operation
        for methods in document["paths"].values()
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete"}
    }


def test_the_committed_description_is_what_the_code_generates(tmp_path):
    generated = tmp_path / "openapi.yaml"

    call_command("spectacular", "--file", str(generated), "--validate", "--fail-on-warn")

    assert generated.read_text(encoding="utf-8") == COMMITTED.read_text(encoding="utf-8"), (
        "backend/openapi.yaml is stale. Run: powershell -File scripts/dev.ps1 openapi"
    )


def test_every_operation_of_this_plan_is_described_under_its_name():
    assert EXPECTED_OPERATIONS <= set(operations(committed()))


def test_every_path_is_under_the_versioned_prefix():
    assert all(path.startswith("/api/v1/") for path in committed()["paths"])


def test_the_session_cookie_is_the_only_security_scheme():
    schemes = committed()["components"]["securitySchemes"]

    assert schemes == {
        "sessionCookie": {"type": "apiKey", "in": "cookie", "name": "sessionid"},
    }


def test_the_me_shape_matches_the_master_plan():
    me = committed()["components"]["schemas"]["MeOut"]

    assert set(me["properties"]) == {
        "public_id",
        "email",
        "name",
        "language",
        "roles",
        "workspaces",
        "last_workspace",
        "must_change_password",
        "previous_login_at",
        "password_reset",
        "employee",
        "environment",
        "version",
    }


def test_lists_are_described_as_pages():
    page = committed()["components"]["schemas"]["PaginatedAccountOut"]

    assert set(page["properties"]) == {"count", "next", "previous", "results"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`

Expected: FAIL. The first test fails with `CommandError: Unknown command: 'spectacular'` and the others with `FileNotFoundError: ... openapi.yaml`.

- [ ] **Step 3: Describe the session scheme**

`backend/apps/accounts/schema.py`:

```python
"""Tells drf-spectacular how our session authentication appears in the OpenAPI description."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SessionAuthScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.SessionAuth"
    name = "sessionCookie"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": "sessionid"}
```

Replace `backend/apps/accounts/apps.py` with:

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self) -> None:
        from apps.accounts import schema  # noqa: F401  registers the OpenAPI session scheme
        from apps.accounts.messages import MESSAGES
        from apps.core.i18n import register_messages
        from apps.notifications import services as notifications

        register_messages(MESSAGES)
        notifications.register_event("account.password_reset", link="/password")
```

- [ ] **Step 4: Configure drf-spectacular**

In `backend/config/settings.py`:

Replace `INSTALLED_APPS` with:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "drf_spectacular",
    "procrastinate.contrib.django",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.settings",
    "apps.notifications",
]
```

Replace the `REST_FRAMEWORK` block with:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.SessionAuth"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.accounts.permissions.RolePermission"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "IRIS HR API",
    "DESCRIPTION": "Internal API of the IRIS HR platform. Errors are problem details (application/problem+json).",
    "VERSION": "1",  # the API version of the /api/v1 prefix, not the application version
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    # One name per choice set, so that the generated client has stable type names.
    "ENUM_NAME_OVERRIDES": {
        "LanguageEnum": "apps.accounts.models.LANGUAGE_CHOICES",
        "WorkspaceEnum": "apps.accounts.roles.WORKSPACE_CHOICES",
        "AssignableRoleEnum": "apps.accounts.roles.ASSIGNABLE_CHOICES",
        "AccountStateEnum": "apps.accounts.selectors.ACCOUNT_STATE_CHOICES",
        "AuditCategoryEnum": ["business", "security"],
        "SettingKindEnum": "apps.settings.registry.KINDS",
    },
}
```

- [ ] **Step 5: Generate the description**

Run: `powershell -File scripts/dev.ps1 openapi`

Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.` The file `backend/openapi.yaml` now exists.

If the command stops with warnings, fix the cause it names and run it again. The usual ones:

| Warning text contains | Cause | Fix |
|---|---|---|
| `unable to guess serializer` | A view method has no `@extend_schema` | Add `@extend_schema(operation_id=..., request=..., responses=...)` to that method |
| `operationId ... has collisions` | Two methods share an `operation_id`, or one has none | Give each its own `operation_id` |
| `unable to resolve type hint for function` | A `SerializerMethodField` method without schema | Add `@extend_schema_field(...)` above the `get_<field>` method |
| `enum naming encountered a non-optimally resolvable collision` or `multiple names for the same choice set` | One choice set under two field names, or one field name with two choice sets | Add `"<Name>Enum": "<dotted path to the choices>"` to `ENUM_NAME_OVERRIDES` |
| `could not resolve authenticator` | `apps/accounts/schema.py` is not imported | Check the import in `AccountsConfig.ready()` |

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`

Expected: PASS, `6 passed`.

- [ ] **Step 7: Commit**

```bash
git add backend/openapi.yaml backend/tests/test_openapi.py backend/apps/accounts backend/config/settings.py
git commit -m "feat(api): generated OpenAPI description with a drift test"
```

---

### Task 22: Demo data and the browser-test reset

**Files:**
- Create: `backend/apps/accounts/seed.py`
- Create: `backend/apps/core/management/commands/seed_demo.py`, `backend/apps/core/management/commands/e2e_reset.py`
- Test: `backend/apps/core/tests/test_seed.py`

**Interfaces:**
- Consumes: `User`, `RoleAssignment` (Task 6); the standard cast (Task 9); `scripts/dev.ps1 seed` (Task 1).
- Produces (master 6.11 and 7.1):
  - `python manage.py seed_demo`: runs `seed()` of every module named in `SEEDERS` (`apps/core/management/commands/seed_demo.py`), in order. Each later plan creates `apps/<app>/seed.py` with a `seed() -> None` that can run twice, and appends its module path to `SEEDERS`.
  - `apps.accounts.seed`: the eight demo accounts with the addresses of master 6.11 and the password `Correct-Horse-42!` (`DEMO_PASSWORD`), `ACCOUNTS` (email, name, roles).
  - `python manage.py e2e_reset`: drops every table, re-applies all migrations (so rows created by data migrations come back), then runs `seed_demo`. Plan 01b's Playwright set-up calls it.
  - Both commands refuse to run when `ENVIRONMENT=production`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/core/tests/test_seed.py`:

```python
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts import services
from apps.accounts.models import RoleAssignment, User
from apps.accounts.roles import Role, roles_of
from apps.accounts.seed import ACCOUNTS, DEMO_PASSWORD
from apps.core.management.commands import e2e_reset

pytestmark = pytest.mark.django_db

EMAILS = [
    "ceo@impactrisks.com",
    "employee.a1@impactrisks.com",
    "employee.a2@impactrisks.com",
    "employee.b1@impactrisks.com",
    "hr@impactrisks.com",
    "manager.a@impactrisks.com",
    "manager.b@impactrisks.com",
    "sysadmin@impactrisks.com",
]


def seed() -> str:
    out = StringIO()
    call_command("seed_demo", stdout=out)
    return out.getvalue()


def test_seed_demo_creates_the_accounts_of_the_master_plan():
    output = seed()

    assert sorted(User.objects.values_list("email", flat=True)) == EMAILS
    assert DEMO_PASSWORD == "Correct-Horse-42!"
    for user in User.objects.all():
        assert user.check_password(DEMO_PASSWORD)
        assert user.must_change_password is False
        assert user.full_name
    assert roles_of(User.objects.get(email="sysadmin@impactrisks.com")) == {Role.SYSADMIN}
    assert roles_of(User.objects.get(email="ceo@impactrisks.com")) == {Role.EXEC}
    assert roles_of(User.objects.get(email="hr@impactrisks.com")) == {Role.HR}
    assert roles_of(User.objects.get(email="employee.a1@impactrisks.com")) == frozenset()
    assert "seeded apps.accounts.seed" in output


def test_a_demo_account_can_sign_in():
    seed()

    user = services.authenticate(email="hr@impactrisks.com", password=DEMO_PASSWORD, ip="")

    assert user.email == "hr@impactrisks.com"


def test_seed_demo_can_run_again_without_duplicates_and_without_undoing_changes():
    seed()
    owner = User.objects.get(email="employee.a1@impactrisks.com")
    owner.set_password("Changed-By-Hand-44!")
    owner.save(update_fields=["password"])

    seed()

    assert User.objects.count() == 8
    assert RoleAssignment.objects.count() == 3
    owner.refresh_from_db()
    assert owner.check_password("Changed-By-Hand-44!")


def test_seed_demo_never_runs_in_production(settings):
    settings.ENVIRONMENT = "production"

    with pytest.raises(CommandError, match="production"):
        seed()

    assert User.objects.count() == 0


def test_the_demo_accounts_are_the_test_cast(world):
    cast = {user.email: user.full_name for user in User.objects.all()}

    assert cast == {email: full_name for email, full_name, _roles in ACCOUNTS}


def test_e2e_reset_never_runs_in_production(settings, monkeypatch):
    calls = []
    monkeypatch.setattr(e2e_reset, "rebuild_schema", lambda: calls.append("rebuild"))
    monkeypatch.setattr(e2e_reset, "call_command", lambda name, **options: calls.append(name))
    settings.ENVIRONMENT = "production"

    with pytest.raises(CommandError, match="production"):
        call_command("e2e_reset", stdout=StringIO())

    assert calls == []


def test_e2e_reset_rebuilds_migrates_then_seeds(monkeypatch):
    calls = []
    monkeypatch.setattr(e2e_reset, "rebuild_schema", lambda: calls.append("rebuild"))
    monkeypatch.setattr(e2e_reset, "call_command", lambda name, **options: calls.append(name))

    call_command("e2e_reset", stdout=StringIO())

    assert calls == ["rebuild", "migrate", "seed_demo"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_seed.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'apps.accounts.seed'`.

- [ ] **Step 3: Write the accounts seeder**

`backend/apps/accounts/seed.py`:

```python
"""Demo accounts for development and browser tests: the standard cast of master 6.11. Never used in production."""

from apps.accounts.models import RoleAssignment, User

DEMO_PASSWORD = "Correct-Horse-42!"

# (email, full name, assigned roles). Later plans attach employee records to these accounts.
ACCOUNTS = [
    ("sysadmin@impactrisks.com", "Sonia Admin", ("sysadmin",)),
    ("ceo@impactrisks.com", "Karim Directeur", ("exec",)),
    ("hr@impactrisks.com", "Senna RH", ("hr",)),
    ("manager.a@impactrisks.com", "Mounir Manager", ()),
    ("employee.a1@impactrisks.com", "Amal Employee", ()),
    ("employee.a2@impactrisks.com", "Bilel Employee", ()),
    ("manager.b@impactrisks.com", "Nadia Manager", ()),
    ("employee.b1@impactrisks.com", "Chokri Employee", ()),
]


def seed() -> None:
    """Creates what is missing. An account that exists is left as it is, password included."""
    for email, full_name, roles in ACCOUNTS:
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(email, DEMO_PASSWORD, full_name=full_name)
        for role in roles:
            RoleAssignment.objects.get_or_create(user=user, role=role)
```

- [ ] **Step 4: Write the two commands**

`backend/apps/core/management/commands/seed_demo.py`:

```python
from importlib import import_module

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# One module per app, in dependency order. Each exposes seed() and is safe to run twice.
# A plan that adds demo data appends its module here.
SEEDERS = [
    "apps.accounts.seed",
]


class Command(BaseCommand):
    help = "Loads demo accounts and data for development and browser tests. Never runs in production."

    def handle(self, *args, **options) -> None:
        if settings.ENVIRONMENT == "production":
            raise CommandError("seed_demo never runs in production.")
        for path in SEEDERS:
            import_module(path).seed()
            self.stdout.write(f"seeded {path}")
        self.stdout.write("Demo data ready. Every demo account uses the password Correct-Horse-42!")
```

`backend/apps/core/management/commands/e2e_reset.py`:

```python
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


def rebuild_schema() -> None:
    """Drops every table. Migrations then recreate them, including the rows that data migrations create."""
    with connection.cursor() as cursor:
        cursor.execute("DROP SCHEMA public CASCADE")
        cursor.execute("CREATE SCHEMA public")
    ContentType.objects.clear_cache()


class Command(BaseCommand):
    help = "Empties the database, re-applies the migrations and loads the demo data. For browser tests only."

    def handle(self, *args, **options) -> None:
        if settings.ENVIRONMENT == "production":
            raise CommandError("e2e_reset never runs in production.")
        rebuild_schema()
        call_command("migrate", interactive=False, verbosity=0)
        call_command("seed_demo", stdout=self.stdout)
        self.stdout.write("Database reset.")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests/test_seed.py -q`

Expected: PASS, `7 passed`.

- [ ] **Step 6: Try the reset on the development database**

Run:

```powershell
docker compose up -d
docker compose exec app python manage.py e2e_reset
docker compose exec app python manage.py shell -c "from apps.accounts.models import User; print(User.objects.count())"
docker compose ps --format "{{.Service}} {{.State}}"
```

Expected: `seeded apps.accounts.seed`, `Demo data ready. ...`, `Database reset.`, then `8`. The last command lists `app running`, `db running` and `worker running` (the worker restarts by itself if the reset interrupted it).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/seed.py backend/apps/core
git commit -m "feat(core): demo data and database reset for browser tests"
```

---

### Task 23: Whole-suite verification, lint and an end-to-end sign-in

**Files:**
- Modify: any backend file that `ruff` reformats or fixes (import order, wrapping)

**Interfaces:**
- Consumes: everything above.
- Produces: a backend whose full suite, lint and format checks pass; the state plan 01b starts from.

- [ ] **Step 1: Run the whole suite**

Run: `docker compose run --rm app pytest -q`

Expected: PASS, no failures and no errors. The summary line counts several hundred tests, of which 270 are matrix checks.

The suite assumes two values of `.env.example`: `TIME_ZONE=Africa/Tunis` and `ALLOWED_EMAIL_DOMAIN=impactrisks.com`. If your `.env` differs, restore them before investigating a failure.

- [ ] **Step 2: Fix and check lint and formatting**

Run:

```powershell
docker compose run --rm app ruff check . --fix
docker compose run --rm app ruff format .
docker compose run --rm app ruff check .
docker compose run --rm app ruff format --check .
```

Expected: the first two commands may rewrite import order and line wrapping. The third prints `All checks passed!` and the fourth `NN files already formatted`. If `ruff check .` still reports something, it is a rule that has no automatic fix: correct the line it names, keeping behaviour unchanged, and repeat the four commands.

- [ ] **Step 3: Confirm that formatting changed nothing that matters**

Run:

```powershell
docker compose run --rm app pytest -q
docker compose run --rm app python manage.py makemigrations --check --dry-run
```

Expected: the suite passes again (it includes the OpenAPI drift test), and the second command prints `No changes detected`.

- [ ] **Step 4: Sign in through the running stack**

Run in PowerShell:

```powershell
docker compose up -d
powershell -File scripts/dev.ps1 seed
$jar = Join-Path $env:TEMP 'iris-cookies.txt'
$body = Join-Path $env:TEMP 'iris-login.json'
Set-Content -Path $body -Encoding ascii -NoNewline -Value '{"email":"sysadmin@impactrisks.com","password":"Correct-Horse-42!"}'
$csrf = (curl.exe -s -c $jar http://localhost:8000/api/v1/auth/csrf | ConvertFrom-Json).csrf_token
curl.exe -s -b $jar -c $jar -H "X-CSRFToken: $csrf" -H "Content-Type: application/json" --data-binary "@$body" http://localhost:8000/api/v1/auth/login
curl.exe -s -b $jar http://localhost:8000/api/v1/admin/status
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:8000/api/v1/admin/status
Remove-Item $jar, $body
```

Expected: the login call prints the `Me` document, containing `"email":"sysadmin@impactrisks.com"`, `"roles":["sysadmin"]` and `"workspaces":["admin"]`. The first status call (with the cookie) prints a document whose `health` has `"status":"ok"` once the worker has run for a minute, and whose `jobs` lists `accounts.cleanup` and `core.heartbeat`. The last call (without the cookie) prints `401`.

- [ ] **Step 5: Confirm the audit trail saw it and the logs are JSON**

Run:

```powershell
docker compose exec app python manage.py shell -c "from apps.audit.models import AuditEvent as E; print(list(E.objects.filter(action='auth.login').values_list('actor__email', 'ip_address')[:1]))"
docker compose logs app --tail 3
docker compose down
```

Expected: one tuple with `sysadmin@impactrisks.com` and a network address. The log lines are JSON objects with `request_id` and, for the status call, a `user_id`.

- [ ] **Step 6: Confirm that no secret is tracked**

Run: `git ls-files .env; git status --short`

Expected: the first command prints nothing (`.env` is not tracked). The second lists only files changed by Step 2, if any.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "chore(backend): lint, format and verify the foundation"
```

If Step 2 changed nothing, there is nothing to commit: skip this step.

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| ACC-01 company-domain login, case-insensitive | 6, 12, 13 |
| ACC-02 password policy, Argon2 | 6, 12, 13 |
| ACC-03 lock-out and limit per network address, as settings | 10, 12, 13 |
| ACC-04 inactivity limit, browser-close cookie, disabled account loses its sessions | 2, 9, 12, 13 |
| ACC-05 account creation with a 24-hour temporary password, forced change | 9, 13, 14, 16, 18 |
| ACC-06 reset by the administrator, permanent password never seen | 14, 16 |
| ACC-07 previous sign-in and reset notice | 12, 13 |
| ACC-08 own password change | 12, 13 |
| ACC-09 role assignment, audited | 14, 16 |
| ACC-10 archiving disables the account | `disable_account` in 14; called by plan 02 |
| ACC-11 language per account | 4, 6, 13 |
| AUD-01 append-only | 8 |
| AUD-02 business events | settings changes in 10, exports in 15; data events arrive with each later plan |
| AUD-03 security events | 12, 14 |
| AUD-04 actor, time, address, item, request id | 3, 8 |
| AUD-05 redacted comment content | 8 (`diff(redact=...)`) |
| AUD-06 who reads which log, filters | 15, 20 |
| NOT-01 list, unread count, mark as read | 11 |
| NOT-02 events | `account.password_reset` in 14, `job.failed` in 18, `error.unexpected` in 19; the others in the plans that raise them |
| NOT-03 link to the item, no sensitive text | 11 |
| NOT-04 recipient's language | 11 |
| NOT-05 one delivery interface | 11 (`channels.py`) |
| ADM-06 system settings | 10, 17 |
| ADM-07 accounts and roles | 14, 16 |
| "Every settings change is audited with the previous and new value" | 10 |
| PRD 3 roles and their constraints | 9, 14 |
| PRD 7 permission matrix (rows for settings, accounts, audit) | 20 |
| PRD 8.1, 8.6, 8.7, 8.8 data model | 6, 11, 8, 10 |
| PRD 9.2 services, no cross-app table access | conventions used in every task |
| PRD 9.3 REST, sessions, pagination, problem details, OpenAPI | 5, 7, 9, 13, 21 |
| PRD 9.5 job runner, clean-up job, failure notification | 18 |
| PRD 9.7 environment validation, settings cache, JSON logs, health, unexpected errors | 2, 3, 10, 18, 19 |
| PRD 10 authorisation proof, accounts, cookies, CSRF, separation of duties | 2, 9, 12, 14, 20 |
| PRD 12.1 to 12.3 developer machine, containers, environment files | 1, 2 |
| PRD 12.6 forward-only migrations | every task that adds a model |
| Master 6.1 to 6.7, 6.9 to 6.11 conventions | 2, 4, 7, 8, 9, 10, 11, 18, 20 |
| Master 7.1 to 7.5 contract | 5, 18, 22 (core); 6, 12 to 14, 16 (accounts); 8, 15 (audit); 10, 17 (settings); 11 (notifications) |
| UI 4.1 sign-in messages | 6 (texts), 12, 13 |
| UI 9 data of the Administration pages | 15, 16, 17, 18 |

## Contract notes

Points where the master was silent or where this plan had to choose. None changes a name, route or shape the master fixes.

**Corrections to master snippets**

1. `Problem.params` is declared with `dataclasses.field(default_factory=dict)`. The master's snippet (`field(default_factory=dict)` after an attribute named `field`) does not run.
2. `DomainError.code` is optional; each class has a default: `core.invalid`, `core.not_allowed`, `core.not_found`, `core.conflict`, `core.rate_limited`.

**Conventions other plans should follow**

3. Services pass `actor=actor` to `audit.record`. The default (the request's user) is wrong in jobs and in service tests.
4. Every `@extend_schema` sets a unique `operation_id`; every `SerializerMethodField` has `@extend_schema_field`. Lists use `apps.core.pagination.paginate`, `paginated` and `PAGE_PARAMETERS`. The OpenAPI test fails on any warning.
5. Each `seed.py` exposes `seed() -> None`, safe to run twice, and is appended to `SEEDERS`. Demo accounts are found by their fixed addresses.
6. Tasks: the Procrastinate task name and the `recorded` name are the same string; cron expressions are in UTC (Tunis is UTC+1 all year, so master's "daily 06:00" is `0 5 * * *`).
7. `request.user` in a view is the plain `User` instance.
8. Log with a constant message and `extra={"data": {...}}`; keys named `password`, `comment`, `content` and similar are redacted.

**Behaviour chosen where the master did not say**

9. Sign-in refusals answer 400 with their code (`auth.rate_limited` answers 429). 401 means only "no session", so the frontend can redirect on it.
10. CSRF is enforced on every unsafe call, including sign-in. The web app must call `GET /api/v1/auth/csrf` once, then send the `csrftoken` cookie value as `X-CSRFToken`. It returns `{csrf_token}`.
11. An expired temporary password is reported (`auth.temp_password_expired`) before the password is checked, so the user gets the useful message even after the nightly clean-up has made the password unusable.
12. An administrator cannot reset, disable or change the roles of their own account (`accounts.cannot_change_self`), and the last active administrator cannot lose the role or be disabled.
13. Validation errors from DRF: top-level code `core.validation`; each entry has code `validation.<DRF code>` and a dotted `field` path (`roles.0`).
14. `job.failed` is sent after the third consecutive failure of a job (the retries of `RETRY` are used up), once per job per day. `JobStatus` has one extra column, `consecutive_failures`.
15. `ALLOW` in the matrix also refuses status 500. `Case` has one extra field, `format` (`"json"` by default, `"multipart"` for uploads).
16. `SettingDef` and `SettingOut` have one extra field, `choices` (for `upload_allowed_types`). `minimum` and `maximum` are given together or not at all.
17. `DEBUG` is `False` on every stack; errors are always problem documents.

**Additional names**

18. Error codes beyond the master's lists: `core.validation`, `core.not_authenticated`, `core.unexpected`, `core.method_not_allowed`, `core.malformed`, `core.unsupported_media_type`, `core.not_acceptable`, `auth.csrf_failed`, `accounts.email_invalid`, `accounts.subject_required`, `audit.period_order`.
19. Audit actions: `auth.login`, `auth.login_failed`, `auth.locked`, `auth.logout`, `auth.session_expired`, `auth.password_changed`, `auth.password_reset`, `account.created`, `account.disabled`, `account.enabled`, `account.unlocked`, `role.assigned`, `role.removed`, `setting.changed`, `audit.exported`.
20. Files outside the master's layout: `scripts/lib/env.ps1`, `scripts/tests/env.tests.ps1`, `docs/brand/iris-logo.png`, `docs/brand/iris-logo-white.png`, `backend/tests/db.py`. In `accounts`: a `services/` package, `me.py`, and `api/session_*.py` and `api/account_*.py` instead of single `serializers.py` and `views.py`.

**For plan 01b**

21. `compose.yaml` gives `app` and `worker` neither `image` nor `build`. `compose.dev.yaml` adds `build` (target `dev`). `compose.server.yaml` must add `image: ${IMAGE_PREFIX}-backend:${APP_VERSION}`. The last Dockerfile stage (`prod`) is the default build target.
22. The Vite proxy must keep the browser's `Host` header (`changeOrigin: false`), and Caddy must pass `Host` and set `X-Forwarded-For` and `X-Forwarded-Proto` without `trusted_proxies`. Django's origin check and the audit trail's network address depend on it.
23. `/api/v1/health` answers 503 until the worker's first heartbeat, up to about 90 seconds after a restart. The update command must wait before judging.
24. The suite assumes `TIME_ZONE=Africa/Tunis` and `ALLOWED_EMAIL_DOMAIN=impactrisks.com` in the `.env` the pipeline creates. `ENVIRONMENT` may be `development` or `test`.
25. `README.md` is not created by this plan.

**For plans 02, 03a, 04 and 07**

26. Plan 02: `EmployeeDirectory.candidate()` may itself raise `Conflict("accounts.employee_has_account")` for an employee who is already linked. `User.full_name` is copied from the employee record when the account is created (it feeds the password-similarity rule); `display_name` prefers the directory.
27. Plan 03a: after a transactional test, Django empties every table, including rows created by data migrations. Seed the five request types in the test cast builder as well as in the migration.
28. Plan 04: the test database switches off every TRUNCATE trigger for the session (`tests/db.py` finds them by type), so an append-only ledger needs no test change. UPDATE and DELETE triggers stay active.
29. Plan 07: the `ops.backup` task must return `{"size_bytes": int, "storage_used_bytes": int}`; `admin/status` reads it from `JobStatus.last_detail`. A failed last backup shows `backup: null` and the job among the failures.

**For the project owner**

30. The specification forbids HR and System Administrator on one account, but not Executive Management and System Administrator. An administrator cannot give the role to themselves (note 12), yet two administrators could give it to each other. Every role change is in the security log, which Executive Management reads.
