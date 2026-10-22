param([string]$SetupExe)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $SetupExe) { $SetupExe = Join-Path $projectRoot "output\share\$version\ShopeeMeowPrint-Setup-$version-Windows-x64.exe" }
$testRoot = Join-Path $projectRoot ('.runtime\public-installer-qa-' + [Guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $testRoot '使用者 測試 (公開版)'
$shortcutRoot = Join-Path $testRoot '桌面 捷徑'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShippingWorkbench'
if (Test-Path -LiteralPath $registryPath) { throw 'A public installation already exists. Test aborted without changing it.' }
$checks = [ordered]@{}
$logs = @()
$retained = foreach ($port in @(5178, 53178)) {
    try { Invoke-RestMethod "http://127.0.0.1:$port/__health" -TimeoutSec 2 } catch {}
}
$busy = @(Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort)
$expectedPort = @(53178..53187 | Where-Object {$_ -notin $busy}) | Select-Object -First 1
if (-not $expectedPort) { throw 'No free test port; no application was changed.' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
@{owner='public-sharing-installer-test';root=$testRoot;disposable=$true;purpose='Public identity, install, launch, update, removal; synthetic files only'} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'owner.json') -Encoding UTF8
Write-Output "Disposable public installer test: $testRoot"

function Check([string]$Name, [bool]$Pass) {
    if (-not $Pass) { throw "Check failed: $Name" }
    $checks[$Name] = $true
    Write-Output "PASS $Name"
}
function Run-Setup([string]$Label, [switch]$NoLaunch) {
    $log = Join-Path $testRoot ($Label + '.log')
    $arguments = @('--silent', '--no-browser', '--install-dir', "`"$installRoot`"", '--shortcut-dir', "`"$shortcutRoot`"", '--log', "`"$log`"")
    if ($NoLaunch) { $arguments += '--no-launch' }
    $process = Start-Process -FilePath $SetupExe -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(90000)) { throw 'Installer did not finish.' }
    $script:logs += $log
    $code = $process.ExitCode
    $process.Dispose()
    if ($code -ne 0) { Get-Content -LiteralPath $log -Raw; throw "Setup failed with code $code" }
    Check "$Label completed and temp files removed" ((Get-Content -LiteralPath $log -Raw) -match 'Temporary package removed')
}

try {
    $info = (Get-Item -LiteralPath $SetupExe).VersionInfo
    Check 'neutral executable product and publisher metadata' ($info.ProductName -eq 'Shopee Meow Print' -and [string]::IsNullOrWhiteSpace($info.CompanyName))
    Run-Setup 'fresh-public-install'
    $record = Get-Content -LiteralPath (Join-Path $installRoot 'installed-files.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $marker = Get-Content -LiteralPath (Join-Path $installRoot '.runtime\server.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Check 'public application identity and version' ($record.appId -eq 'shipping-workbench' -and $record.version -eq $version -and $record.state -eq 'complete')
    Check 'existing service port automatically avoided' ($marker.port -eq $expectedPort)
    $health = Invoke-RestMethod "http://127.0.0.1:$($marker.port)/__health" -TimeoutSec 2
    Check 'public server uses bundled runtime' ($health.appId -eq 'shipping-workbench' -and $health.executable -eq (Join-Path $installRoot 'runtime\node.exe'))
    $badFiles = @($record.files | Where-Object {(Get-FileHash -LiteralPath (Join-Path $installRoot $_.path)).Hash -ne $_.sha256})
    Check 'all installed files match package hashes' ($badFiles.Count -eq 0)
    Check 'four neutral shortcuts exist' (@($record.shortcuts | Where-Object {Test-Path -LiteralPath $_.path}).Count -eq 4 -and (Test-Path -LiteralPath (Join-Path $shortcutRoot '蝦皮印單喵.lnk')))
    $registered = Get-ItemProperty -LiteralPath $registryPath
    Check 'neutral Windows installed-app registration' ($registered.DisplayName -eq '蝦皮印單喵' -and [string]::IsNullOrWhiteSpace($registered.Publisher) -and $registered.InstallLocation -eq $installRoot)
    Check 'public HTML is served' ((Invoke-WebRequest "http://127.0.0.1:$($marker.port)/" -UseBasicParsing).StatusCode -eq 200)
    & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'scripts\start.ps1') -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'Repeated launch failed' }
    $again = Get-Content -LiteralPath (Join-Path $installRoot '.runtime\server.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Check 'repeated launch reuses only public server' ($again.pid -eq $marker.pid)
    Set-Content -LiteralPath (Join-Path $installRoot '保留測試.txt') -Value 'Synthetic file that must survive update and removal.' -Encoding UTF8
    Run-Setup 'public-update' -NoLaunch
    Check 'public update preserves added file' (Test-Path -LiteralPath (Join-Path $installRoot '保留測試.txt'))
    $remaining = Get-Process -Id $marker.pid -ErrorAction SilentlyContinue
    Check 'public update stops its own test server' (-not $remaining -or $remaining.HasExited)
    & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'uninstall.ps1') -Quiet
    Check 'public uninstall completes' ($LASTEXITCODE -eq 0)
    Check 'added file survives uninstall' (Test-Path -LiteralPath (Join-Path $installRoot '保留測試.txt'))
    Check 'public registry and shortcuts removed' (-not (Test-Path -LiteralPath $registryPath) -and -not (Test-Path -LiteralPath (Join-Path $shortcutRoot '蝦皮印單喵.lnk')))
    foreach ($service in $retained) {
        $current = Invoke-RestMethod "http://127.0.0.1:$($service.port)/__health" -TimeoutSec 2
        Check "pre-existing service $($service.port) unchanged" ($current.pid -eq $service.pid -and $current.startedAt -eq $service.startedAt)
    }
} finally {
    if (Test-Path -LiteralPath (Join-Path $installRoot '.runtime\server.json')) {
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'scripts\stop.ps1')
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Test service cleanup requires inspection.' }
    }
    if (Test-Path -LiteralPath (Join-Path $installRoot 'installed-files.json')) {
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'uninstall.ps1') -Quiet
    }
    @{version=$version;checks=$checks;testRoot=$testRoot;logs=$logs;finishedAt=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $projectRoot "output\installer\validation-public-$version.json") -Encoding UTF8
}
