param([string]$AppRoot = (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($AppRoot)
$serverScript = [IO.Path]::GetFullPath((Join-Path $projectRoot 'scripts\serve.mjs'))
$marker = Join-Path $projectRoot '.runtime\server.json'
if (-not (Test-Path -LiteralPath $marker)) { Write-Output 'This app has no recorded running server.'; return }
$record = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
if ($record.appId -ne 'shipping-workbench' -or [IO.Path]::GetFullPath($record.root).TrimEnd('\') -ne $projectRoot.TrimEnd('\')) { throw 'Ownership record does not match this app.' }
$serverProcessId = [int]$record.pid
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
if ($process) {
    if (-not $process.CommandLine -or -not $process.CommandLine.Contains($serverScript) -or $process.ExecutablePath -ne $record.executable) {
        $health = $null
        if ([int]$record.port -ge 1024 -and [int]$record.port -le 65535) {
            try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($record.port)/__health" -TimeoutSec 2 } catch {}
        }
        if ($health -and $health.appId -eq 'shipping-workbench' -and [IO.Path]::GetFullPath($health.root).TrimEnd('\') -eq $projectRoot.TrimEnd('\')) {
            throw 'The app is running but its PID ownership is inconsistent. No process was stopped.'
        }
        Remove-Item -LiteralPath $marker -Force
        Write-Output 'Removed a stale app ownership record. No unrelated process was stopped.'
        return
    }
    $ownedProcess = Get-Process -Id $serverProcessId -ErrorAction Stop
    Stop-Process -InputObject $ownedProcess -Force
    if (-not $ownedProcess.WaitForExit(10000)) { throw 'The app server did not exit within 10 seconds.' }
    # Windows PowerShell can briefly enumerate a terminated process. Wait for
    # handle cleanup instead of treating that stale entry as a running server.
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        $remaining = Get-Process -Id $serverProcessId -ErrorAction SilentlyContinue
        if (-not $remaining -or $remaining.HasExited) { break }
        Start-Sleep -Milliseconds 100
    }
    if ($remaining -and -not $remaining.HasExited) { throw 'The app server is still running.' }
    $ownedProcess.Dispose()
}
Remove-Item -LiteralPath $marker -Force
Write-Output 'Shopee Meow Print server stopped. Source files and downloaded PDFs were kept.'
