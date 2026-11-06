param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'ShippingWorkbench'),
    [string]$ShortcutDirectory,
    [switch]$NoRegistry,
    [switch]$NoStart,
    [switch]$NonInteractive
)
$ErrorActionPreference = 'Stop'
$appId = 'shipping-workbench'
$installRoot = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
$payloadRoot = Join-Path $PSScriptRoot 'payload'
$manifestPath = Join-Path $PSScriptRoot 'package-manifest.json'
$package = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($package.appId -ne $appId -or -not $package.files) { throw 'Invalid installation manifest.' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows 10/11 64-bit is required.' }
if ($installRoot -eq [IO.Path]::GetPathRoot($installRoot).TrimEnd('\')) { throw 'Cannot install at a drive root.' }
if ($installRoot -eq $PSScriptRoot.TrimEnd('\') -or $installRoot -eq $payloadRoot.TrimEnd('\')) { throw 'Choose a separate installation directory.' }

function Resolve-AppFile([string]$Base, [string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':')) { throw 'Invalid relative path.' }
    $resolved = [IO.Path]::GetFullPath((Join-Path $Base $Relative))
    if (-not $resolved.StartsWith($Base.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'File escaped installation directory.' }
    $parent = $resolved
    while ($parent -and $parent.StartsWith($Base.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
        if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation paths cannot be links or junctions.' }
        $parent = [IO.Path]::GetDirectoryName($parent)
    }
    return $resolved
}

$recordPath = Join-Path $installRoot 'installed-files.json'
$previous = $null
if (Test-Path -LiteralPath $installRoot) {
    if (Test-Path -LiteralPath $recordPath) {
        $previous = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($previous.appId -ne $appId -or $previous.root -ne $installRoot) { throw 'This directory is not owned by this application.' }
    } elseif (Get-ChildItem -LiteralPath $installRoot -Force | Select-Object -First 1) {
        throw 'The selected directory contains other files. No files were changed.'
    }
}

# Validate every source and destination before stopping the app or copying anything.
foreach ($file in $package.files) {
    $source = Resolve-AppFile $payloadRoot $file.path
    $destination = Resolve-AppFile $installRoot $file.path
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $file.sha256) { throw "Damaged package file: $($file.path)" }
    if (Test-Path -LiteralPath $destination) {
        $oldFile = @($previous.files | Where-Object { $_.path -eq $file.path })
        if ($oldFile.Count -ne 1 -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $oldFile[0].sha256) {
            throw "An existing file was modified or is not owned by this app: $($file.path). Back it up before updating."
        }
    }
}
$iconRelative = 'app-' + $package.version + '.ico'
if (@($package.files | Where-Object { $_.path -eq $iconRelative }).Count -ne 1) { throw 'Versioned app icon is missing.' }
$iconPath = Resolve-AppFile $installRoot $iconRelative
$shell = New-Object -ComObject WScript.Shell
$desktopRoot = if ($ShortcutDirectory) { [IO.Path]::GetFullPath($ShortcutDirectory) } else { [Environment]::GetFolderPath('Desktop') }
$menuRoot = if ($ShortcutDirectory) { Join-Path $desktopRoot 'Start Menu' } else { Join-Path ([Environment]::GetFolderPath('Programs')) '蝦皮印單喵' }
$powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcutSpecs = @(
    @{ Folder=$desktopRoot; Name='蝦皮印單喵'; Script='scripts\start.ps1'; Extra=' -Ui' },
    @{ Folder=$menuRoot; Name='開啟蝦皮印單喵'; Script='scripts\start.ps1'; Extra=' -Ui' },
    @{ Folder=$menuRoot; Name='停止蝦皮印單喵'; Script='scripts\stop.ps1'; Extra='' },
    @{ Folder=$menuRoot; Name='解除安裝'; Script='uninstall.ps1'; Extra='' }
)
$shortcuts = foreach ($entry in $shortcutSpecs) {
    $shortcutPath = Join-Path $entry.Folder ($entry.Name + '.lnk')
    if (Test-Path -LiteralPath $shortcutPath) {
        $existing = $shell.CreateShortcut($shortcutPath)
        if (-not $existing.Arguments.Contains($installRoot + '\')) { throw 'A shortcut with the same name belongs to another application.' }
    }
    @{
        path=$shortcutPath
        arguments=('-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $installRoot $entry.Script) + '"' + $entry.Extra)
    }
}
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShippingWorkbench'
if (-not $NoRegistry -and (Test-Path -LiteralPath $registryPath)) {
    $existingInstall = (Get-ItemProperty -LiteralPath $registryPath).InstallLocation
    if ($existingInstall -and $existingInstall -ne $installRoot) { throw 'Another installation is registered. Uninstall it first.' }
}
if ($previous) {
    & (Join-Path $payloadRoot 'scripts\stop.ps1') -AppRoot $installRoot
    if (-not $?) { throw 'Could not stop the previously installed app safely.' }
}
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
$installationRecord = @{
    appId=$appId; version=$package.version; root=$installRoot; files=$package.files;
    shortcuts=$shortcuts; menuRoot=$menuRoot; registry=(!$NoRegistry); state='installing'
}
$installationRecord | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $recordPath -Encoding UTF8
foreach ($file in $package.files) {
    $destination = Resolve-AppFile $installRoot $file.path
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
    Copy-Item -LiteralPath (Resolve-AppFile $payloadRoot $file.path) -Destination $destination -Force
}
# Retired app files are removed only if their content still matches the old manifest.
if ($previous) {
    foreach ($oldFile in $previous.files) {
        if ($package.files.path -notcontains $oldFile.path) {
            $retired = Resolve-AppFile $installRoot $oldFile.path
            if ((Test-Path -LiteralPath $retired) -and (Get-FileHash -LiteralPath $retired).Hash -eq $oldFile.sha256) {
                Remove-Item -LiteralPath $retired -Force
            }
        }
    }
}

New-Item -ItemType Directory -Path $desktopRoot, $menuRoot -Force | Out-Null
foreach ($entry in $shortcuts) {
    $shortcut = $shell.CreateShortcut($entry.path)
    $shortcut.TargetPath = $powerShellPath
    $shortcut.Arguments = $entry.arguments
    $shortcut.WorkingDirectory = $installRoot
    $shortcut.IconLocation = $iconPath + ',0'
    $shortcut.Save()
}
# Remove retired shortcuts only when their recorded target still belongs to this installation.
if ($previous) {
    foreach ($oldShortcut in $previous.shortcuts) {
        if ($shortcuts.path -notcontains $oldShortcut.path -and (Test-Path -LiteralPath $oldShortcut.path)) {
            $existing = $shell.CreateShortcut($oldShortcut.path)
            if ($existing.Arguments -eq $oldShortcut.arguments -and $existing.Arguments.Contains($installRoot + '\')) {
                Remove-Item -LiteralPath $oldShortcut.path -Force
            }
        }
    }
    if ($previous.menuRoot -ne $menuRoot -and (Test-Path -LiteralPath $previous.menuRoot) -and -not (Get-ChildItem -LiteralPath $previous.menuRoot -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $previous.menuRoot -Force
    }
}
if (-not $NoRegistry) {
    New-Item -Path $registryPath -Force | Out-Null
    $uninstallCommand = '"' + $powerShellPath + '" -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $installRoot 'uninstall.ps1') + '"'
    foreach ($setting in @{
        DisplayName='蝦皮印單喵'; DisplayVersion=$package.version; Publisher='';
        InstallLocation=$installRoot; DisplayIcon=$iconPath; UninstallString=$uninstallCommand;
        QuietUninstallString=($uninstallCommand + ' -Quiet')
    }.GetEnumerator()) { New-ItemProperty -LiteralPath $registryPath -Name $setting.Key -Value $setting.Value -PropertyType String -Force | Out-Null }
    New-ItemProperty -LiteralPath $registryPath -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -LiteralPath $registryPath -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
}
$installationRecord.state = 'complete'
$installationRecord | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $recordPath -Encoding UTF8
Write-Output "Installed Shopee Meow Print $($package.version) at $installRoot"
if (-not $NonInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("安裝完成。之後雙擊桌面的「蝦皮印單喵」即可使用。`n`n列印設定：100 × 150 mm，實際大小 100%。", '蝦皮印單喵', 'OK', 'Information') | Out-Null
}
if (-not $NoStart) {
    # Launch separately: a launch failure must not report a completed install as failed.
    & $powerShellPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'scripts\start.ps1') -Ui
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Installation is complete. Launch did not finish; please use the desktop shortcut to try again.' }
}
exit 0
