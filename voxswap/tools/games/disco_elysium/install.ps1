# Installs (or removes) the voice-swapped Disco Elysium bundles.
#
#   install:  put basrol-disco-voices.zip in Downloads, then run this
#   remove:   run it again with  $restore = $true  (or answer R at the prompt)
#
# Every original bundle it replaces is copied to <game>\basrol-backup first,
# and "remove" copies them back, so the game is never left without its own files.
$ErrorActionPreference = 'Stop'
$steam = "${env:ProgramFiles(x86)}\Steam"
$libs = @($steam)
$vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
if (Test-Path $vdf) {
  $libs += Select-String -Path $vdf -Pattern '"path"\s+"(.+?)"' |
    ForEach-Object { $_.Matches[0].Groups[1].Value -replace '\\\\', '\' }
}
$cands = @($libs | ForEach-Object { Join-Path $_ 'steamapps\common\Disco Elysium' })
$cands += 'C:\GOG Games\Disco Elysium', "${env:ProgramFiles(x86)}\GOG Galaxy\Games\Disco Elysium",
          "$env:ProgramFiles\Epic Games\DiscoElysium"
$game = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $game) { $game = Read-Host 'Paste your Disco Elysium folder' }
$sa = Get-ChildItem $game -Recurse -Directory -Filter StandaloneWindows64 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sa) { throw "No StandaloneWindows64 folder under $game" }
$backup = Join-Path $game 'basrol-backup'

$choice = Read-Host 'I = install the new voices, R = restore the original voices'
if ($choice -match '^[Rr]') {
  if (-not (Test-Path $backup)) { Write-Host 'Nothing to restore - no backup folder.' -ForegroundColor Yellow; return }
  Get-ChildItem $backup -Filter *.bundle | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $sa.FullName $_.Name) -Force
    Write-Host ('restored  ' + $_.Name)
  }
  Write-Host 'Original voices are back.' -ForegroundColor Green
  return
}

$zip = Get-ChildItem (Join-Path $env:USERPROFILE 'Downloads') -Filter 'basrol-disco-voices*.zip' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { throw 'basrol-disco-voices.zip is not in your Downloads folder.' }
$tmp = Join-Path $env:TEMP 'basrol-disco-voices'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $zip.FullName $tmp
New-Item -ItemType Directory -Force $backup | Out-Null
Get-ChildItem $tmp -Recurse -Filter *.bundle | ForEach-Object {
  $target = Join-Path $sa.FullName $_.Name
  if (-not (Test-Path $target)) { Write-Host ('skipped   ' + $_.Name + ' (not in this game version)') -ForegroundColor Yellow; return }
  $saved = Join-Path $backup $_.Name
  if (-not (Test-Path $saved)) { Copy-Item $target $saved }     # never overwrite the first backup
  Copy-Item $_.FullName $target -Force
  Write-Host ('installed ' + $_.Name)
}
Write-Host 'Done. Start the game; to undo, run this again and answer R.' -ForegroundColor Green
