# Copies Disco Elysium's voice bundles for Kim, Garte and Klaasje (the
# Whirling-in-Rags scenes, the first hours of the game) to Desktop\disco-upload,
# so the owner of the game can upload them to their own PRIVATE repository for
# a personal voice swap. Read-only on the game: it copies, never changes or
# deletes anything.
$ErrorActionPreference = 'SilentlyContinue'
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
$sa = $null
foreach ($c in $cands) {
  if (Test-Path $c) {
    $sa = Get-ChildItem $c -Recurse -Directory -Filter StandaloneWindows64 | Select-Object -First 1
    if ($sa) { break }
  }
}
if (-not $sa) {
  $p = Read-Host 'Paste your Disco Elysium folder (Steam: right-click the game > Manage > Browse local files)'
  $sa = Get-ChildItem $p -Recurse -Directory -Filter StandaloneWindows64 | Select-Object -First 1
}
if (-not $sa) { Write-Host 'Could not find StandaloneWindows64 under that folder.' -ForegroundColor Red; return }
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'disco-upload'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $sa.FullName -Filter *.bundle | Select-Object Name, Length |
  Export-Csv (Join-Path $out 'all-bundles.csv') -NoTypeInformation
$pick = Get-ChildItem $sa.FullName -Filter 'whirling*.bundle' | Where-Object { $_.Name -match 'kim|garte|klaasje' }
$pick | ForEach-Object { Copy-Item $_.FullName $out; '{0,8:N1} MB  {1}' -f ($_.Length / 1MB), $_.Name }
Write-Host ('Game folder: ' + $sa.FullName)
Write-Host ('{0} file(s), {1:N0} MB -> {2}' -f $pick.Count, (($pick | Measure-Object Length -Sum).Sum / 1MB), $out) -ForegroundColor Green
if ($pick.Count -eq 0) { Write-Host 'No Kim/Garte/Klaasje bundles matched - upload all-bundles.csv instead and I will pick the names.' -ForegroundColor Yellow }
explorer $out
