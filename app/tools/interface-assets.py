"""Extract the bounded Java 26.3 native menu and HUD bytes; no client is executed."""
from pathlib import Path
import argparse,hashlib,json,zipfile
args=argparse.ArgumentParser();args.add_argument('--client',required=True);a=args.parse_args()
root=Path(__file__).resolve().parents[2]/'resources/minecraft/26.3'
body=Path(a.client).read_bytes();sha=hashlib.sha1(body).hexdigest()
assert sha=='e877b6a07acd633fb3bb475002175cec036e7b87'
z=zipfile.ZipFile(a.client);entries=[]
known={e['entry'] for p in root.glob('*manifest.json') if p.name!='interface-manifest.json' for e in json.loads(p.read_text())['entries']}
for name in ['header_separator','footer_separator','inworld_header_separator','inworld_footer_separator','menu_background','inworld_menu_background','menu_list_background','inworld_menu_list_background','sprites/hud/crosshair']:
    for suffix in ['.png','.png.mcmeta']:
        path='assets/minecraft/textures/gui/'+name+suffix
        if path not in z.namelist() or path in known:continue
        data=z.read(path);dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
        entries.append(dict(entry=path,size=len(data),sha256=hashlib.sha256(data).hexdigest()))
manifest=dict(version='26.3',clientSha1=sha,source='Official Java 26.3 client.jar; bounded native UI dependencies',entries=entries)
(root/'interface-manifest.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
