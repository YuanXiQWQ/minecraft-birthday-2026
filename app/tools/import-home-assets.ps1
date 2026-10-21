# Extract the bounded home-presentation dependency profile from the verified official client.
param([Parameter(Mandatory=$true)][string]$Jar)
$ErrorActionPreference='Stop'
$clientHash=(Get-FileHash -LiteralPath $Jar -Algorithm SHA1).Hash.ToLowerInvariant()
if($clientHash -ne 'e877b6a07acd633fb3bb475002175cec036e7b87'){throw 'Incorrect Java 26.3 client'}
$resourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../resources/minecraft/26.3'))
$base=Get-Content -LiteralPath (Join-Path $resourceRoot 'manifest.json') -Raw | ConvertFrom-Json -AsHashtable
$existing=[Collections.Generic.HashSet[string]]::new()
foreach($entry in $base.entries){[void]$existing.Add($entry.entry)}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($Jar)
$queue=[Collections.Generic.Queue[string]]::new()
foreach($name in @('blockstates/cake','models/block/oak_slab','models/block/oak_fence_post','models/block/oak_planks')){$queue.Enqueue('assets/minecraft/'+$name+'.json')}
$seen=[Collections.Generic.HashSet[string]]::new()
$entries=[Collections.Generic.List[object]]::new()
try{
 while($queue.Count){
  $name=$queue.Dequeue();if(-not $seen.Add($name) -or $existing.Contains($name)){continue}
  $entry=$zip.GetEntry($name);if(-not $entry){throw "Missing dependency $name"}
  $stream=$entry.Open();$memory=[IO.MemoryStream]::new()
  try{$stream.CopyTo($memory);$bytes=$memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()}
  $target=Join-Path $resourceRoot $name;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target));[IO.File]::WriteAllBytes($target,$bytes)
  $entries.Add(@{entry=$name;size=$bytes.Length;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()})
  if($name.EndsWith('.json')){
   $data=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json -AsHashtable
   if($data.variants){foreach($raw in $data.variants.Values){foreach($v in @($raw)){$queue.Enqueue('assets/minecraft/models/'+($v.model -replace '^minecraft:','')+'.json')}}}
   if($data.parent){$queue.Enqueue('assets/minecraft/models/'+($data.parent -replace '^minecraft:','')+'.json')}
   if($data.textures){foreach($value in $data.textures.Values){if(-not $value.StartsWith('#')){$queue.Enqueue('assets/minecraft/textures/'+($value -replace '^minecraft:','')+'.png')}}}
  }elseif($name.EndsWith('.png') -and $zip.GetEntry($name+'.mcmeta')){$queue.Enqueue($name+'.mcmeta')}
 }
 $profile=@{version='26.3';clientSha1=$clientHash;profile='home-presentation-v1';source='Official Java 26.3 client; exact original bytes';entries=@($entries);models=@{tabletop='minecraft:block/oak_slab';leg='minecraft:block/oak_fence_post';cake='minecraft:block/cake';floor='minecraft:block/oak_planks'};limits=@('Only bites=0 is displayed; no cake-eating interaction','Table is an authored assembly of original slab/post geometry, not a vanilla table block')}
 [IO.File]::WriteAllText((Join-Path $resourceRoot 'presentation-manifest.json'),($profile|ConvertTo-Json -Depth 40)+"`n",[Text.UTF8Encoding]::new($false))
 Write-Output "Home profile: $($entries.Count) new exact resources"
}finally{$zip.Dispose()}
