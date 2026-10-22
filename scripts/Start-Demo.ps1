param([ValidateRange(1024, 65535)][int]$DemoPort = 8080)

$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoEnv = Join-Path $demoRoot '.env'

function New-DemoPassword {
    $demoBytes = New-Object byte[] 24
    $demoRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $demoRandom.GetBytes($demoBytes) }
    finally { $demoRandom.Dispose() }
    return [Convert]::ToBase64String($demoBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$demoEngine = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $demoEngine -ne 'linux') {
    throw 'Start Docker Desktop, select Linux containers, and run this script again.'
}

if (!(Test-Path -LiteralPath $demoEnv)) {
    $demoSettings = @(
        "SPACESENSE_PORT=$DemoPort"
        "SPACESENSE_DB_PASSWORD=$(New-DemoPassword)"
        'SPACESENSE_ADMIN_EMAIL=admin@spacesense.local'
        "SPACESENSE_ADMIN_PASSWORD=$(New-DemoPassword)"
        'SPACESENSE_DEMO_STUDENT_EMAIL=student@spacesense.local'
        "SPACESENSE_DEMO_STUDENT_PASSWORD=$(New-DemoPassword)"
    )
    [System.IO.File]::WriteAllLines($demoEnv, $demoSettings, (New-Object System.Text.UTF8Encoding $false))
    Write-Host 'Created private demo credentials in .env.'
}

& docker compose --project-directory $demoRoot up --build --detach --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Demo startup failed. Run docker compose logs --tail 80 to inspect it.' }

$demoPortLine = Get-Content -LiteralPath $demoEnv | Where-Object { $_ -match '^SPACESENSE_PORT=' } | Select-Object -First 1
if ($demoPortLine) { $DemoPort = [int]($demoPortLine -replace '^SPACESENSE_PORT=', '') }
Write-Host "Demo ready: http://localhost:$DemoPort"
Write-Host 'Admin and student sign-in details are in .env. Stop with: docker compose down'
