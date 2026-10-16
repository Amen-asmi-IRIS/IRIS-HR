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
