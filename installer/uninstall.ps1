param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$recordPath = Join-Path $installRoot 'installed-files.json'
$record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($record.appId -ne 'shipping-workbench' -or $record.root -ne $installRoot) { throw 'Installation ownership record does not match.' }
if (-not $Quiet) {
    Add-Type -AssemblyName System.Windows.Forms
    $answer = [System.Windows.Forms.MessageBox]::Show('要解除安裝蝦皮印單喵嗎？已下載的 PDF 與其他個人檔案會保留。', '蝦皮印單喵', 'YesNo', 'Question')
    if ($answer -ne 'Yes') { exit 0 }
}
$targets = foreach ($file in $record.files) {
    if ([IO.Path]::IsPathRooted($file.path) -or $file.path.Contains(':')) { throw 'Invalid installed file path.' }
    $resolved = [IO.Path]::GetFullPath((Join-Path $installRoot $file.path))
    if (-not $resolved.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'File escaped installation directory.' }
    $parent = $resolved
    while ($parent -and $parent.StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase)) {
        if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Cannot uninstall through links or junctions.' }
        $parent = [IO.Path]::GetDirectoryName($parent)
    }
    @{ path=$resolved; sha256=$file.sha256 }
}
& (Join-Path $installRoot 'scripts\stop.ps1')
if (-not $?) { throw 'Could not verify that the app server stopped. Files were kept.' }
$shell = New-Object -ComObject WScript.Shell
foreach ($item in $record.shortcuts) {
    if (Test-Path -LiteralPath $item.path) {
        $shortcut = $shell.CreateShortcut($item.path)
        if ($shortcut.Arguments -eq $item.arguments -and $shortcut.Arguments.Contains($installRoot + '\')) {
            Remove-Item -LiteralPath $item.path -Force
        }
    }
}
if ((Test-Path -LiteralPath $record.menuRoot) -and -not (Get-ChildItem -LiteralPath $record.menuRoot -Force | Select-Object -First 1)) {
    Remove-Item -LiteralPath $record.menuRoot -Force
}
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ShippingWorkbench'
if ($record.registry -and (Test-Path -LiteralPath $registryPath) -and (Get-ItemProperty -LiteralPath $registryPath).InstallLocation -eq $installRoot) {
    Remove-Item -LiteralPath $registryPath -Force
}
$preserved = @()
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target.path) {
        if ((Get-FileHash -LiteralPath $target.path -Algorithm SHA256).Hash -eq $target.sha256) {
            Remove-Item -LiteralPath $target.path -Force
        } else { $preserved += $target.path }
    }
}
# Only exact app runtime files are disposable. Never recursively remove the installation folder.
foreach ($name in @('server.json', 'port.json', 'server.log', 'server-error.log')) {
    $runtimeFile = Join-Path $installRoot ('.runtime\' + $name)
    if (Test-Path -LiteralPath $runtimeFile) { Remove-Item -LiteralPath $runtimeFile -Force }
}
Remove-Item -LiteralPath $recordPath -Force
$directories = @($targets | ForEach-Object { [IO.Path]::GetDirectoryName($_.path) }) + (Join-Path $installRoot '.runtime')
$allDirectories = @()
foreach ($directory in $directories) {
    while ($directory -and $directory.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        $allDirectories += $directory
        $directory = [IO.Path]::GetDirectoryName($directory)
    }
}
foreach ($directory in ($allDirectories | Sort-Object -Unique | Sort-Object { $_.Length } -Descending)) {
    if ((Test-Path -LiteralPath $directory) -and -not (Get-ChildItem -LiteralPath $directory -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $directory -Force
    }
}
if (-not (Get-ChildItem -LiteralPath $installRoot -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $installRoot -Force }
Write-Output "Uninstalled. Modified app files preserved: $($preserved.Count). Other user files were not removed."
if (-not $Quiet) {
    [System.Windows.Forms.MessageBox]::Show('解除安裝完成。已下載或自行加入的檔案會保留。', '蝦皮印單喵', 'OK', 'Information') | Out-Null
}
