$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $appRoot 'server.mjs'
$url = 'http://127.0.0.1:8791/'
$healthUrl = 'http://127.0.0.1:8791/api/health'

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if (-not $health.ok) { throw 'Existing listener is not the dashboard' }
} catch {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Node.js is required to launch this dashboard.' }
    Start-Process -FilePath $node.Source -ArgumentList @('"' + $serverPath + '"') -WorkingDirectory $appRoot -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            if ($health.ok) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw 'Dashboard server did not start. Check that local port 8791 is available.' }
}
Start-Process $url
