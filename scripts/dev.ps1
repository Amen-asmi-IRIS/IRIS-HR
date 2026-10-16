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
        # 'down --volumes' also deleted the volume that holds the frontend packages.
        Invoke-FrontendInstall
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
