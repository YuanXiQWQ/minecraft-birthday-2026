# Bounded GUI/font/item extraction for external loopback verification; no publishing permission is implied.
param([Parameter(Mandatory = $true)][string]$Jar, [Parameter(Mandatory = $true)][string]$Output)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'extract-model-samples.ps1') -Jar $Jar -Output $Output -IncludeTextures
$manifestPath = Join-Path $Output 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
$guiArchive = [IO.Compression.ZipFile]::OpenRead($Jar)
$guiPaths = [Collections.Generic.HashSet[string]]::new()
foreach ($name in @('inventory','crafting_table','furnace','blast_furnace','hopper')) { $guiPaths.Add('assets/minecraft/textures/gui/container/' + $name + '.png') | Out-Null }
foreach ($name in @('tooltip/background','tooltip/frame','widget/button','widget/button_disabled','widget/button_highlighted','container/slot','container/slot_highlight_back','container/slot_highlight_front','container/furnace/burn_progress','container/furnace/lit_progress','container/blast_furnace/burn_progress','container/blast_furnace/lit_progress')) {
  $path = 'assets/minecraft/textures/gui/sprites/' + $name + '.png'
  $guiPaths.Add($path) | Out-Null
  if ($guiArchive.GetEntry($path + '.mcmeta')) { $guiPaths.Add($path + '.mcmeta') | Out-Null }
}
foreach ($name in @('font/default.json','font/include/default.json','font/include/space.json','textures/font/ascii.png','items/egg.json','items/furnace.json','models/item/egg.json','models/item/generated.json','textures/item/egg.png')) { $guiPaths.Add('assets/minecraft/' + $name) | Out-Null }
try {
  foreach ($name in $guiPaths) {
    $entry = $guiArchive.GetEntry($name)
    if (-not $entry) { throw ('Missing GUI dependency: ' + $name) }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $destination = Join-Path $Output $name
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::WriteAllBytes($destination, $bytes)
    $manifest.entries += @{ entry = $name; size = $bytes.Length; sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() }
  }
  $manifest.gui = @{ entries = @($guiPaths | Sort-Object); items = @('egg','furnace'); font = 'ASCII bitmap subset only; other providers intentionally not loaded'; rights = 'Local verification only; distribution unresolved' }
  $manifest | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Output ('External GUI entries: ' + $guiPaths.Count)
} finally { $guiArchive.Dispose() }
