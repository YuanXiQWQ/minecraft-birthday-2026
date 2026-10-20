# Read-only official JAR sampling into an explicitly external analysis directory; no website assets are produced.
param([Parameter(Mandatory = $true)][string]$Jar, [Parameter(Mandatory = $true)][string]$Output)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($Output)) { throw 'Output must be absolute' }
$analysisRoot = [IO.Path]::GetFullPath($Output)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if ($analysisRoot.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or $analysisRoot.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Original model samples must remain outside the repository' }
$clientSha1 = (Get-FileHash -LiteralPath $Jar -Algorithm SHA1).Hash.ToLowerInvariant()
if ($clientSha1 -ne 'e877b6a07acd633fb3bb475002175cec036e7b87') { throw 'JAR is not the P1-verified Java 26.3 client' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($Jar)
$queue = [Collections.Generic.Queue[string]]::new()
foreach ($sample in @('stone','furnace','hopper')) { $queue.Enqueue('assets/minecraft/blockstates/' + $sample + '.json') }
$seen = [Collections.Generic.HashSet[string]]::new()
$entries = [Collections.Generic.List[object]]::new()
$textures = [Collections.Generic.HashSet[string]]::new()
try {
  while ($queue.Count -gt 0) {
    $name = $queue.Dequeue()
    if (-not $seen.Add($name)) { continue }
    $entry = $archive.GetEntry($name)
    if (-not $entry) { throw ('Missing entry: ' + $name) }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $destination = Join-Path $analysisRoot $name
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::WriteAllBytes($destination, $bytes)
    $entries.Add(@{ entry = $name; size = $bytes.Length; sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() })
    $data = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -AsHashtable
    if ($name.Contains('/blockstates/')) {
      foreach ($variantKey in $data.variants.Keys) { foreach ($variant in @($data.variants[$variantKey])) { $queue.Enqueue('assets/minecraft/models/' + ($variant.model -replace '^minecraft:', '') + '.json') } }
    } else {
      if ($data.parent) { $queue.Enqueue('assets/minecraft/models/' + ($data.parent -replace '^minecraft:', '') + '.json') }
      if ($data.textures) { foreach ($value in $data.textures.Values) { if (-not $value.StartsWith('#')) { $textures.Add(($value -replace '^minecraft:', '')) | Out-Null } } }
    }
  }
  $textureEvidence = foreach ($texture in $textures) {
    $entry = $archive.GetEntry('assets/minecraft/textures/' + $texture + '.png')
    if (-not $entry) { throw ('Missing texture: ' + $texture) }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    @{ id = 'minecraft:' + $texture; size = $bytes.Length; sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() }
  }
  @{ version = '26.3'; clientSha1 = $clientSha1; entries = $entries.ToArray(); textures = @($textureEvidence); textureBytesExported = $false } | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $analysisRoot 'manifest.json') -Encoding utf8
  Write-Output ('External sample JSON files: ' + $entries.Count + '; texture dependencies checked without export: ' + $textures.Count)
} finally { $archive.Dispose() }
