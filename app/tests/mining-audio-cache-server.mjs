/** Test-only strong HTTP-cache upgrade fixture; serves ordinary builds without granting inventory or changing saves. */
import {createServer} from 'node:http';
import {readFile,appendFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,extname,sep} from 'node:path';

/** The prior released document lacks hit events; only this isolated server may retain it. */
const root=resolve(import.meta.dirname,'..'),old=execFileSync('git',['show','6f9ce8143e99f708e42273c511c9b463d272abc6:resources/minecraft/26.3/assets/minecraft/world-sounds.json'],{cwd:root}),
    log=resolve(root,'../.test-results/mining-audio/evidence/cache-requests.jsonl'),legacy=new Set(['/','/minecraft-birthday-2026/']);
await mkdir(resolve(root,'../.test-results/mining-audio/evidence'),{recursive:true});
/** Serve exact static output and prime the previous sound document with a fresh one-year HTTP cache. */
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost'),base=url.pathname.startsWith('/minecraft-birthday-2026/')?'/minecraft-birthday-2026/':'/';
 let path=url.pathname.slice(base.length);
 if(path==='cache-prime'){
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated old sound cache</title><p id="result">Priming</p><a href="'+base+'game/">Open ordinary game</a><script>fetch("'+base+'minecraft/26.3/assets/minecraft/world-sounds.json").then(r=>r.json()).then(d=>document.getElementById("result").textContent="Old hit present: "+!!d["block.wood.hit"])</script>');return;
 }
 if(path==='game/'||path==='game/index.html')legacy.delete(base);
 if(!path||path.endsWith('/'))path+='index.html';
 const dir=resolve(root,base==='/'?'dist':'dist-pages'),file=resolve(dir,path);if(!file.startsWith(dir+sep))throw Error('outside-build');
 const sound=path==='minecraft/26.3/assets/minecraft/world-sounds.json',bytes=sound&&legacy.has(base)?old:await readFile(file);
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg'})[extname(path)]??'application/octet-stream');
 res.setHeader('Cache-Control',path.startsWith('minecraft/')?'public,max-age=31536000':'no-cache');
 if(sound)await appendFile(log,JSON.stringify({url:req.url,old:legacy.has(base),cacheControl:req.headers['cache-control']??null,bytes:bytes.length})+'\n');res.end(bytes);
 }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(4298,'127.0.0.1',()=>console.log('Isolated cache fixture http://127.0.0.1:4298/cache-prime'));
