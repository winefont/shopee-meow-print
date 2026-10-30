param([switch]$NoBrowser, [switch]$Ui, [ValidateRange(1024,65535)][int]$Port = 53178)
$ErrorActionPreference = 'Stop'
$mutex = $null
$locked = $false
$helperProcess = $null
try {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
    $serverScript = Join-Path $PSScriptRoot 'serve.mjs'
    $runtimePath = Join-Path $projectRoot '.runtime'
    $appId = 'shipping-workbench'
    $explicitPort = $PSBoundParameters.ContainsKey('Port')
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))).Replace('-', '').Substring(0,24) }
    finally { $hasher.Dispose() }
    $mutex = New-Object Threading.Mutex($false, "Local\ShopeeMeowPrint-$key")
    try { $locked = $mutex.WaitOne(15000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still in progress. Please try the desktop shortcut again shortly.' }

    function Get-AppHealth([int]$Candidate) {
        try {
            $result = Invoke-RestMethod -Uri "http://127.0.0.1:$Candidate/__health" -TimeoutSec 1
            if ($result.appId -eq $appId -and $result.root -and
                [IO.Path]::GetFullPath($result.root).TrimEnd('\') -eq $projectRoot -and
                [int]$result.port -eq $Candidate) { return $result }
        } catch {}
        return $null
    }
    function Test-PortBusy([int]$Candidate) {
        $client = New-Object Net.Sockets.TcpClient
        try {
            $connection = $client.BeginConnect('127.0.0.1', $Candidate, $null, $null)
            try {
                if (-not $connection.AsyncWaitHandle.WaitOne(250)) { return $false }
                $client.EndConnect($connection)
                return $true
            } finally { $connection.AsyncWaitHandle.Close() }
        } catch { return $false } finally { $client.Close() }
    }
    function Test-PortBindable([int]$Candidate) {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Candidate)
        try {
            $listener.ExclusiveAddressUse = $true
            $listener.Start()
            return $true
        } catch { return $false } finally { $listener.Stop() }
    }
    function Get-SystemAvailablePort {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
        try {
            $listener.ExclusiveAddressUse = $true
            $listener.Start()
            return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
        } finally { $listener.Stop() }
    }

    $candidates = @()
    if (-not $explicitPort) {
        # Reuse this installation's active server or last successful port.
        foreach ($name in @('server.json', 'port.json')) {
            $recordFile = Join-Path $runtimePath $name
            if (Test-Path -LiteralPath $recordFile) {
                try {
                    $record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ($record.appId -eq $appId -and $record.root -and
                        [IO.Path]::GetFullPath($record.root).TrimEnd('\') -eq $projectRoot -and
                        [int]$record.port -ge 1024 -and [int]$record.port -le 65535) {
                        $candidates += [int]$record.port
                    }
                } catch {}
            }
        }
        $candidates += 53178..53187
        # Docker/WSL/Windows can reserve the entire default range without a
        # listener. Ask the OS for fallback ports instead of changing its rules.
        for ($portAttempt = 0; $portAttempt -lt 3; $portAttempt++) {
            $candidates += Get-SystemAvailablePort
        }
    } else { $candidates = @($Port) }
    $candidates = @($candidates | Select-Object -Unique)
    $health = $null
    foreach ($candidate in $candidates) {
        if (Test-PortBusy $candidate) {
            $health = Get-AppHealth $candidate
            if ($health) { break }
            continue
        }
        if (-not (Test-PortBindable $candidate)) { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Built files are missing. Please reinstall the complete Windows package.' }
        $nodePath = Join-Path $projectRoot 'runtime\node.exe'
        if (-not (Test-Path -LiteralPath $nodePath)) {
            $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
            if (-not $nodeCommand) { throw 'Node.js is required. Please use the complete Windows installation package.' }
            $nodePath = $nodeCommand.Source
        }
        New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
        $errorLog = Join-Path $runtimePath 'server-error.log'
        $helperProcess = Start-Process -FilePath $nodePath -ArgumentList @("`"$serverScript`"", '--port', "$candidate") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'server.log') -RedirectStandardError $errorLog
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 200
            if ($helperProcess.HasExited) { break }
            if (Test-PortBusy $candidate) { $health = Get-AppHealth $candidate }
            if ($health) { break }
        }
        if ($health -and $health.pid -eq $helperProcess.Id) { break }
        $addressWasTaken = $helperProcess.HasExited -and (Test-Path -LiteralPath $errorLog) -and
            ((Get-Content -LiteralPath $errorLog -Raw) -match 'EADDRINUSE|EACCES')
        if (-not $helperProcess.HasExited) { Stop-Process -InputObject $helperProcess -Force }
        $helperProcess.Dispose()
        $helperProcess = $null
        $health = $null
        if (-not $addressWasTaken) { throw 'The local server did not start. See .runtime\server-error.log or reinstall the app.' }
    }
    if (-not $health) { throw "No available app port was found ($($candidates -join ', ')). No other application was stopped." }
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    @{ appId=$appId; root=$projectRoot; port=[int]$health.port } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimePath 'port.json') -Encoding UTF8
    $address = "http://127.0.0.1:$($health.port)/"
    if (-not $NoBrowser) { Start-Process $address }
    Write-Output "Shopee Meow Print: $address"
    Write-Output "PID: $($health.pid). Use the Start menu stop shortcut to stop this app only."
} catch {
    if ($Ui) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Shopee Meow Print', 'OK', 'Error') | Out-Null
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
    if ($helperProcess) { $helperProcess.Dispose() }
}
