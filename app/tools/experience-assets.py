"""Extract bounded Java 26.3 experience assets and audit exact sources; never runs a client."""
from pathlib import Path
import argparse,hashlib,json,zipfile,urllib.request
args=argparse.ArgumentParser();args.add_argument('--client',required=True);args.add_argument('--font',required=True);args.add_argument('--icon',required=True);a=args.parse_args()
root=Path(__file__).resolve().parents[2];out=root/'resources/minecraft/26.3'
b=Path(a.client).read_bytes();assert hashlib.sha1(b).hexdigest()=='e877b6a07acd633fb3bb475002175cec036e7b87'
z=zipfile.ZipFile(a.client);entries=[];inputs={}
known={e['entry'] for name in ['manifest','presentation-manifest','catalogue-manifest','player-manifest','book-manifest','world-manifest','interaction-manifest'] for e in json.loads((out/(name+'.json')).read_text())['entries']}
def take(path,body):
    """Preserve source bytes or explicitly indexed derived font data with SHA-256 integrity."""
    target=out/path
    if target.exists():
        assert target.read_bytes()==body
    if path in known:return
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
    sha=hashlib.sha256(body).hexdigest();entries.append(dict(entry=path,size=len(body),sha256=sha));inputs[path]=sha
for p in z.namelist():
    if p.startswith('assets/minecraft/textures/gui/') and any(s in p for s in ['slot_highlight_', 'widget/slider', 'widget/text_field', 'inworld_menu_background', 'menu_background', 'creative_inventory/tab_item_search.png']):take(p,z.read(p))
    if p=='assets/minecraft/shaders/include/light.glsl':take(p,z.read(p))
    if p in ['assets/minecraft/textures/font/nonlatin_european.png','assets/minecraft/textures/font/accented.png']:take(p,z.read(p))
# Both native references are official asset-index objects; archive paths are extraction inputs only.
font=Path(a.font).read_bytes();icon=Path(a.icon).read_bytes()
assert hashlib.sha1(font).hexdigest()=='ccd5ac4767ce0a9c71d1dd62f2dc25449789b5dd'
assert hashlib.sha1(icon).hexdigest()=='af96f55a90eaf11b327f1b5f8834a051027dc506'
f=zipfile.ZipFile(a.font);name=next(n for n in f.namelist() if n.endswith('.hex'))
rows=dict(line.split(':',1) for line in f.read(name).decode().splitlines())
take('assets/minecraft/font/project_unifont.json',json.dumps(rows,separators=(',',':')).encode())
definition_sha1='402ded0eebd448033ef415e861a17513075f80e7'
definition=urllib.request.urlopen('https://resources.download.minecraft.net/40/'+definition_sha1,timeout=90).read()
assert hashlib.sha1(definition).hexdigest()==definition_sha1
take('assets/minecraft/font/include/unifont.json',definition)
take('assets/minecraft/font/unifont_license.txt',f.read('LICENSE.txt'))
take('assets/minecraft/textures/gui/project_favicon.png',icon)
manifest=dict(version='26.3',clientSha1=hashlib.sha1(b).hexdigest(),entries=entries,inputs=inputs,derivedFont={'asset':'minecraft/font/unifont.zip','sha1':hashlib.sha1(font).hexdigest(),'member':name,'conversion':'hex rows to JSON, unchanged bitmaps','definition':{'asset':'minecraft/font/include/unifont.json','sha1':definition_sha1}},favicon={'asset':'icons/icon_32x32.png','sha1':hashlib.sha1(icon).hexdigest()},exporterSha256=hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest())
(out/'experience-manifest.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
