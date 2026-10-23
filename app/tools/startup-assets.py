"""Reproduce the native 26.3 panorama from the locked official asset index, rather than client placeholders."""
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Extraction is a development operation; ordinary runtime uses only checked-in verified bytes.
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'resources/minecraft/26.3'


def fetch(url, digest):
    """Read an official immutable object and reject a mismatched SHA-1."""
    body = urllib.request.urlopen(url, timeout=90).read()
    if hashlib.sha1(body).hexdigest() != digest:
        raise ValueError('official-hash-mismatch')
    return body


def main():
    """Extract six panorama faces and their overlay while retaining audited shared GUI/font inputs."""
    lock = json.loads((ROOT / 'docs/p1/evidence-lock.json').read_text(encoding='utf-8'))['officialSources']['assetIndex']
    index = json.loads(fetch(lock['url'], lock['sha1']))['objects']
    names = [f'minecraft/textures/gui/title/background/panorama_{i}.png' for i in range(6)] + ['minecraft/textures/gui/title/background/panorama_overlay.png']

    def take(name):
        """Persist only the exact image identified by the original resource index."""
        entry = index[name]
        body = fetch('https://resources.download.minecraft.net/' + entry['hash'][:2] + '/' + entry['hash'], entry['hash'])
        path = OUT / ('assets/' + name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        return {'entry': 'assets/' + name, 'size': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'assetSha1': entry['hash']}

    with ThreadPoolExecutor(max_workers=6) as pool:
        entries = list(pool.map(take, names))
    inputs = {}
    for name in ['assets/minecraft/font/include/default.json', 'assets/minecraft/font/include/space.json', 'assets/minecraft/textures/font/ascii.png', 'assets/minecraft/textures/gui/menu_background.png']:
        body = (OUT / name).read_bytes()
        inputs[name] = {'size': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
    manifest = {'version': '26.3', 'clientSha1': 'e877b6a07acd633fb3bb475002175cec036e7b87', 'source': 'Official Java 26.3 asset index; original CubeMapTexture panorama for LevelLoadingScreen', 'assetIndex': lock, 'entries': entries, 'inputs': inputs}
    (OUT / 'startup-manifest.json').write_bytes((json.dumps(manifest, indent=2) + '\n').encode('utf-8'))
    print({'images': len(entries), 'bytes': sum(e['size'] for e in entries)})


if __name__ == '__main__':
    main()
