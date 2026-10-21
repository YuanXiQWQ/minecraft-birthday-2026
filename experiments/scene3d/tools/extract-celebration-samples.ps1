# Extract the bounded Java 26.3 celebration cohort into a hash-audited external loopback cache.
param([Parameter(Mandatory=$true)][string]$Jar,[Parameter(Mandatory=$true)][string]$Output,[Parameter(Mandatory=$true)][string]$AssetIndex,[Parameter(Mandatory=$true)][string]$Sounds)
$ErrorActionPreference='Stop'
if((Get-FileHash $AssetIndex -Algorithm SHA1).Hash.ToLowerInvariant() -ne '0c8f43b28f837869c1e54a6aeb22c396a1548946'){throw 'Wrong asset index'}
$index=Get-Content -LiteralPath $AssetIndex -Raw | ConvertFrom-Json -AsHashtable
if((Get-FileHash $Sounds -Algorithm SHA1).Hash.ToLowerInvariant() -ne $index.objects['minecraft/sounds.json'].hash){throw 'Wrong sound definitions'}
& (Join-Path $PSScriptRoot 'extract-gui-samples.ps1') -Jar $Jar -Output $Output
$manifestPath=Join-Path $Output 'manifest.json'
$manifest=Get-Content $manifestPath -Raw | ConvertFrom-Json -AsHashtable
$archive=[IO.Compression.ZipFile]::OpenRead($Jar)
$names=@('assets/minecraft/particles/firework.json','assets/minecraft/particles/flash.json','assets/minecraft/textures/particle/flash.png')
0..7 | ForEach-Object {$names+='assets/minecraft/textures/particle/spark_'+$_+'.png'}
$cohort=[Collections.Generic.List[string]]::new()
try {
  foreach($name in $names){$entry=$archive.GetEntry($name);if(-not $entry){throw 'Missing particle resource'};$stream=$entry.Open();$m=[IO.MemoryStream]::new();try{$stream.CopyTo($m);$bytes=$m.ToArray()}finally{$stream.Dispose();$m.Dispose()};$target=Join-Path $Output $name;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null;[IO.File]::WriteAllBytes($target,$bytes);$cohort.Add($name);$manifest.entries+=@{entry=$name;size=$bytes.Length;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}}
}finally{$archive.Dispose()}
$soundDefinitions=Get-Content $Sounds -Raw | ConvertFrom-Json -AsHashtable
$events=@('entity.firework_rocket.launch','entity.firework_rocket.blast','entity.firework_rocket.blast_far','entity.firework_rocket.large_blast','entity.firework_rocket.large_blast_far','entity.firework_rocket.twinkle','entity.firework_rocket.twinkle_far','ui.toast.in','ui.toast.out','ui.toast.challenge_complete','entity.experience_orb.pickup','entity.player.levelup')
$selected=@{};$downloads=@{}
foreach($id in $events){$selected[$id]=$soundDefinitions[$id];foreach($raw in $selected[$id].sounds){$name=if($raw -is [string]){$raw}else{$raw.name};$downloads['minecraft/sounds/'+$name+'.ogg']=$index.objects['minecraft/sounds/'+$name+'.ogg']}}
$downloads['minecraft/sounds.json']=$index.objects['minecraft/sounds.json']
foreach($name in $downloads.Keys){$object=$downloads[$name];if(-not $object){throw 'Missing official sound object'};$hash=$object.hash;$target=Join-Path $Output ('assets/'+$name);[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null;if($name -eq 'minecraft/sounds.json'){Copy-Item -LiteralPath $Sounds -Destination $target}else{Invoke-WebRequest -Uri ('https://resources.download.minecraft.net/'+$hash.Substring(0,2)+'/'+$hash) -OutFile $target};if((Get-FileHash $target -Algorithm SHA1).Hash.ToLowerInvariant() -ne $hash){throw 'Sound hash mismatch'};$bytes=[IO.File]::ReadAllBytes($target);$entry='assets/'+$name;$cohort.Add($entry);$manifest.entries+=@{entry=$entry;size=$bytes.Length;sha256=(Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant();assetSha1=$hash;source='https://resources.download.minecraft.net/'+$hash.Substring(0,2)+'/'+$hash}}
$manifest.celebration=@{entries=$cohort.ToArray();events=$selected;assetIndexSha1='0c8f43b28f837869c1e54a6aeb22c396a1548946';usage='Explicit local P2 verification; user permits indexed temporary inclusion, no production endgame'}
$manifest | ConvertTo-Json -Depth 12 | Set-Content $manifestPath -Encoding utf8
Write-Output ('Celebration entries: '+$cohort.Count)
