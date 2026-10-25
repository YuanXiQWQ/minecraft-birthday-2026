"""Extract the bounded original game-music and weather audio dependencies from the locked official asset index."""
import hashlib,json,urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Repository identity is used only during extraction.
ROOT=Path(__file__).resolve().parents[2]
# Ordinary runtime resources are kept inside the versioned repository directory.
OUT=ROOT/'resources/minecraft/26.3'
# Only actually implemented native music, weather and button events are extracted.
EVENTS=['weather.rain','weather.rain.above','entity.lightning_bolt.thunder','entity.lightning_bolt.impact','music.game','ui.button.click']

def fetch(url,sha1):
    """Read original bytes and reject an object that does not match the official digest."""
    body=urllib.request.urlopen(url,timeout=90).read()
    if hashlib.sha1(body).hexdigest()!=sha1:raise ValueError('official-hash-mismatch')
    return body

def main():
    """Reproduce only the registered event definitions and their actual weighted audio samples."""
    lock=json.loads((ROOT/'data/minecraft/26.3/source-lock.json').read_text(encoding='utf-8'))['officialSources']['assetIndex']
    index=json.loads(fetch(lock['url'],lock['sha1']))['objects']
    def asset(name):
        """Load one asset-index object by its immutable official identifier."""
        entry=index[name];return fetch('https://resources.download.minecraft.net/'+entry['hash'][:2]+'/'+entry['hash'],entry['hash'])
    raw=asset('minecraft/sounds.json');sounds=json.loads(raw);events={key:sounds[key] for key in EVENTS}
    paths=sorted(set('minecraft/sounds/'+(s if isinstance(s,str) else s['name'])+'.ogg' for event in events.values() for s in event['sounds']))
    def take(name):
        """Verify an existing checked-in sample or fetch its original bytes when absent."""
        path=OUT/('assets/'+name);body=path.read_bytes() if path.exists() else asset(name)
        if hashlib.sha1(body).hexdigest()!=index[name]['hash']:raise ValueError(name)
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
        return {'entry':'assets/'+name,'size':len(body),'sha256':hashlib.sha256(body).hexdigest(),'assetSha1':index[name]['hash']}
    with ThreadPoolExecutor(max_workers=6) as pool: entries=list(pool.map(take,paths))
    data=(json.dumps(events,indent=2)+'\n').encode();name='assets/minecraft/ambience-sounds.json';(OUT/name).write_bytes(data)
    entries.append({'entry':name,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    existing=set()
    for file in OUT.glob('*manifest.json'):
        if file.name!='ambience-manifest.json':existing.update(e['entry'] for e in json.loads(file.read_text(encoding='utf-8'))['entries'])
    entries=[e for e in entries if e['entry'] not in existing]
    manifest={'version':'26.3','clientSha1':'e877b6a07acd633fb3bb475002175cec036e7b87','source':'Official Java 26.3 asset index; bounded native ambience and game-music events','assetIndex':lock,'soundsDefinitionSha256':hashlib.sha256(raw).hexdigest(),'events':EVENTS,'entries':sorted(entries,key=lambda e:e['entry'])}
    (OUT/'ambience-manifest.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode('utf-8'));print({'samples':len(paths),'bytes':sum(e['size'] for e in entries)})

if __name__=='__main__':main()
