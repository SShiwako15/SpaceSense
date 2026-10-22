param(
    [ValidateRange(1024, 65535)][int]$DemoTestPort = 8081,
    [switch]$BrowserOnHost
)

$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $demoRoot '.env'))) { throw 'Run scripts/Start-Demo.ps1 first to initialize demo settings.' }
$previousDemoPort = $env:SPACESENSE_PORT
$previousBrowserEnvironment = @{}
$env:SPACESENSE_PORT = "$DemoTestPort"
try {
    & docker compose --project-directory $demoRoot --project-name spacesense-check up --build --detach --wait --wait-timeout 180 app
    if ($LASTEXITCODE -ne 0) { throw 'The isolated test stack did not start.' }
    & docker compose --project-directory $demoRoot --project-name spacesense-check --profile test run --build --rm test
    if ($LASTEXITCODE -ne 0) { throw 'API or PostgreSQL tests failed.' }
    $browserCheckStarted = [DateTime]::UtcNow
    if ($BrowserOnHost) {
        $browserCli = Join-Path $demoRoot 'node_modules/@playwright/test/cli.js'
        if (!(Test-Path -LiteralPath $browserCli)) { throw 'Host browser checks require Node.js and npm ci in the repository root.' }
        $composeConfiguration = & docker compose --project-directory $demoRoot --project-name spacesense-check --profile test config --format json | Out-String
        if ($LASTEXITCODE -ne 0) { throw 'Could not read the isolated browser configuration.' }
        $browserEnvironment = ($composeConfiguration | ConvertFrom-Json).services.browser.environment
        foreach ($setting in $browserEnvironment.PSObject.Properties) {
            $previousBrowserEnvironment[$setting.Name] = [Environment]::GetEnvironmentVariable($setting.Name, 'Process')
            [Environment]::SetEnvironmentVariable($setting.Name, [string]$setting.Value, 'Process')
        }
        $previousBrowserEnvironment['PLAYWRIGHT_CHROMIUM_CHANNEL'] = $env:PLAYWRIGHT_CHROMIUM_CHANNEL
        $env:PLAYWRIGHT_BASE_URL = "http://localhost:$DemoTestPort"
        $env:PLAYWRIGHT_CHROMIUM_CHANNEL = 'msedge'
        Push-Location -LiteralPath $demoRoot
        try { & node $browserCli test } finally { Pop-Location }
    } else {
        & docker compose --project-directory $demoRoot --project-name spacesense-check --profile test run --build --rm browser
    }
    if ($LASTEXITCODE -ne 0) { throw 'Browser workflow tests failed. Inspect test-results for screenshots and traces.' }
    $browserReportPath = Join-Path $demoRoot 'test-results/browser-results.json'
    if (!(Test-Path -LiteralPath $browserReportPath)) { throw 'The browser runner did not produce a test report.' }
    $browserReportFile = Get-Item -LiteralPath $browserReportPath
    if ($browserReportFile.LastWriteTimeUtc -lt $browserCheckStarted.AddSeconds(-5)) { throw 'The browser test report is stale; the runner did not complete this verification.' }
    $browserReport = Get-Content -LiteralPath $browserReportPath -Raw | ConvertFrom-Json
    if ([int]$browserReport.stats.expected -lt 6 -or [int]$browserReport.stats.unexpected -gt 0 -or [int]$browserReport.stats.skipped -gt 0 -or [int]$browserReport.stats.flaky -gt 0 -or @($browserReport.errors).Count -gt 0) { throw 'The browser report does not confirm that all six workflows passed.' }
    Write-Host 'All API, database, and browser checks passed against the Docker application.'
} finally {
    & docker compose --project-directory $demoRoot --project-name spacesense-check down --volumes --remove-orphans
    $env:SPACESENSE_PORT = $previousDemoPort
    foreach ($setting in $previousBrowserEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($setting.Key, $setting.Value, 'Process')
    }
}
