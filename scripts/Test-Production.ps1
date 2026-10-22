$ErrorActionPreference = 'Stop'
$productionRoot = Split-Path -Parent $PSScriptRoot
$reportDirectory = Join-Path $productionRoot 'test-results'
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$settingsPath = Join-Path $reportDirectory 'production-check.env'
function New-CheckPassword {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$settings = @(
    'SPACESENSE_DOMAIN=booking.production-check.example'
    'ACME_EMAIL=operations@production-check.example'
    "SPACESENSE_DB_ADMIN_PASSWORD=$(New-CheckPassword)"
    "SPACESENSE_DB_PASSWORD=$(New-CheckPassword)"
    'SPACESENSE_ADMIN_EMAIL=admin@production-check.example'
    "SPACESENSE_ADMIN_PASSWORD=$(New-CheckPassword)"
    'OPENAI_API_KEY='
)
[IO.File]::WriteAllLines($settingsPath, $settings, (New-Object Text.UTF8Encoding $false))
$composeArguments = @('compose', '--project-directory', $productionRoot, '--env-file', $settingsPath, '--project-name', 'spacesense-production-check', '-f', (Join-Path $productionRoot 'compose.production.yaml'))
try {
    & docker @composeArguments up --build --detach --wait --wait-timeout 180 app
    if ($LASTEXITCODE -ne 0) { throw 'The isolated production application failed to start.' }
    $role = & docker @composeArguments exec -T db psql -U spacesense_admin -d spacesense -Atc "SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='spacesense_app'"
    if ($LASTEXITCODE -ne 0 -or $role -ne 'f|f|f') { throw 'Production database privileges are incorrect.' }
    $accounts = & docker @composeArguments exec -T db psql -U spacesense_admin -d spacesense -Atc 'SELECT count(*) FROM accounts'
    if ($LASTEXITCODE -ne 0 -or $accounts -ne '1') { throw 'A fresh production database must contain only its administrator.' }
    Get-Content -LiteralPath (Join-Path $productionRoot 'tests/production-smoke.mjs') -Raw | & docker @composeArguments exec -T app node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw 'Production API workflow failed.' }
    & docker @composeArguments exec -T db pg_dump -U spacesense_admin -d spacesense --format=custom --file=/tmp/production-check.dump
    if ($LASTEXITCODE -ne 0) { throw 'Production backup failed.' }
    & docker @composeArguments exec -T db createdb -U spacesense_admin spacesense_restore_check
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated recovery database.' }
    & docker @composeArguments exec -T db psql -U spacesense_admin -d spacesense_restore_check -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION btree_gist; GRANT CONNECT ON DATABASE spacesense_restore_check TO spacesense_app; GRANT USAGE, CREATE ON SCHEMA public TO spacesense_app;'
    if ($LASTEXITCODE -ne 0) { throw 'Recovery database initialization failed.' }
    $restoreList = & docker @composeArguments exec -T db pg_restore --list /tmp/production-check.dump
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect backup contents.' }
    $restoreList | Where-Object { $_ -notmatch ' EXTENSION ' } | & docker @composeArguments exec -T db sh -c 'cat > /tmp/restore.list'
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare recovery contents.' }
    & docker @composeArguments exec -T db pg_restore --exit-on-error --no-owner --role=spacesense_app --username=spacesense_admin --dbname=spacesense_restore_check --use-list=/tmp/restore.list /tmp/production-check.dump
    if ($LASTEXITCODE -ne 0) { throw 'Production backup recovery failed.' }
    $restored = & docker @composeArguments exec -T db psql -U spacesense_admin -d spacesense_restore_check -Atc 'SELECT (SELECT count(*) FROM accounts), (SELECT count(*) FROM resources), (SELECT count(*) FROM reservations)'
    if ($LASTEXITCODE -ne 0 -or $restored -ne '2|1|1') { throw 'Restored account, resource, and reservation counts do not match the backup.' }
    & docker @composeArguments run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { throw 'Production proxy configuration is invalid.' }
    Write-Host 'Production checks passed: empty initial catalog, least-privilege database role, secure authentication, booking workflow, backup recovery, and proxy configuration.'
} finally {
    & docker @composeArguments down --volumes --remove-orphans
    Remove-Item -LiteralPath $settingsPath -Force
}
