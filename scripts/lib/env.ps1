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
