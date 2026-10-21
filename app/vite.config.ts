/** Formal dual-entry application, with a separately gated verification page that never enters ordinary builds. */
import {defineConfig} from 'vite';import {resolve} from 'node:path';import {readFileSync} from 'node:fs';import {resourcePlugin} from './tools/resources.ts';
import {rulePlugin} from './tools/rule-data.ts';
/** Formal public source root contains no historical experiment or development documentation. */
const root=resolve(import.meta.dirname,'web');
/** English HTML fallback comes from the same editable locale as runtime UI. */
const english=JSON.parse(readFileSync(resolve(root,'src/i18n/en.json'),'utf8'));
/** Editable proper names are shared by the pre-JavaScript titles and runtime localization. */
const birthday=JSON.parse(readFileSync(resolve(root,'src/birthday.json'),'utf8'));
export default defineConfig(({mode})=>({root,publicDir:false,appType:'mpa',cacheDir:resolve(import.meta.dirname,'node_modules/.vite-'+mode),plugins:[resourcePlugin(),rulePlugin(),{name:'localized-html-and-verification-boundary',
  /** Reject the isolated test page in ordinary development.
   * @param {import('vite').ViteDevServer} server Formal server.
   */
  configureServer(server){server.middlewares.use((req,res,next)=>{if(mode!=='verification'&&(req.url??'').startsWith('/__verify__')){res.statusCode=404;res.end();return;}next();});},
  /** Resolve static accessibility fallback from externalized English text.
   * @param {string} html Entry template.
   * @return {string} Localized HTML.
   */
  transformIndexHtml:{order:'pre',handler(html){const localized=html.replace(/__EN_([a-zA-Z0-9_.-]+)__/g,(_,key:string)=>{if(typeof english[key]!=='string')throw new Error('missing-english-key:'+key);return english[key].replace(/\{([a-zA-Z0-9_]+)\}/g,(_:string,name:string)=>{if(typeof birthday[name]!=='string')throw new Error('missing-birthday-parameter');return birthday[name];}).replaceAll('&','&amp;').replaceAll('<','&lt;');});if(mode!=='verification')return localized;return localized.replace('__VERIFY_ICONS__','/@fs/'+resolve(import.meta.dirname,'tests/icon-gallery.ts').replaceAll('\\','/')).replace('__VERIFY_BROWSER__','/@fs/'+resolve(import.meta.dirname,'tests/browser-fixture.ts').replaceAll('\\','/')).replace('__VERIFY_LONG__','/@fs/'+resolve(import.meta.dirname,'tests/long-text.ts').replaceAll('\\','/'));}}}],
 server:{host:'127.0.0.1',port:4183,strictPort:true,fs:{strict:true,allow:[root,resolve(import.meta.dirname,'node_modules'),...(mode==='verification'?[resolve(import.meta.dirname,'tests')]:[])]}},
 preview:{host:'127.0.0.1',port:4185,strictPort:true},
 build:{outDir:'../dist',emptyOutDir:true,sourcemap:false,manifest:true,target:'es2022',license:{fileName:'THIRD_PARTY_LICENSES.md'},rolldownOptions:{input:{home:resolve(root,'index.html'),game:resolve(root,'game/index.html')}}}
}));
