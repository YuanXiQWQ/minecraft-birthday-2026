/** Formal dual-entry application, with a separately gated verification page that never enters ordinary builds. */
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {resourcePlugin} from './tools/resources.ts';
import {execFileSync} from 'node:child_process';
import {rulePlugin} from './tools/rule-data.ts';

/** Formal public source root contains no historical experiment or development documentation. */
const root = resolve(import.meta.dirname, 'web');
/** English HTML fallback comes from the same editable locale as runtime UI. */
const english = JSON.parse(readFileSync(resolve(root, 'src/i18n/en.json'), 'utf8'));
/** Editable proper names are shared by the pre-JavaScript titles and runtime localization. */
const birthday = JSON.parse(readFileSync(resolve(root, 'src/birthday.json'), 'utf8'));
export default defineConfig(({mode}) => ({
    root,
    define: {'import.meta.env.BUILD_ID': JSON.stringify(execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {encoding: 'utf8'}).trim())},
    publicDir: false,
    appType: 'mpa',
    cacheDir: resolve(import.meta.dirname, 'node_modules/.vite-' + mode),
    plugins: [resourcePlugin(), rulePlugin(), {
        name: 'isolated-p7-performance-baseline', enforce: 'pre',
        /** Read an immutable production baseline only in explicitly requested verification servers.
         * @param {string} code Current source.
         * @param {string} id Vite module identity.
         * @return {string|undefined} Archived baseline source or the ordinary module pipeline.
         */
        transform(code, id) {
            if (mode !== 'verification' || process.env.P7_PERF_BASELINE !== '1') return;
            const name = id.replaceAll('\\', '/').split('/web/src/')[1]?.split('?')[0];
            if (!name || !['domain/state.ts', 'domain/furnace.ts', 'rules/matcher.ts', 'ui/pixels.ts', 'persistence/processing-clock.ts'].includes(name)) return;
            void code;
            return execFileSync('git', ['show', 'b39faec72b4eb5bce9cdda375105aa8e277b116f:app/web/src/' + name], {
                cwd: resolve(import.meta.dirname, '..'),
                encoding: 'utf8'
            });
        }
    }, {
        name: 'localized-html-and-verification-boundary',
        /** Reject the isolated test page in ordinary development.
         * @param {import('vite').ViteDevServer} server Formal server.
         */
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (mode !== 'verification' && (req.url ?? '').startsWith('/__verify__')) {
                    res.statusCode = 404;
                    res.end();
                    return;
                }
                next();
            });
        },
        /** Resolve static accessibility fallback from externalized English text.
         * @param {string} html Entry template.
         * @return {string} Localized HTML.
         */
        transformIndexHtml: {
            order: 'pre', handler(html) {
                const localized = html.replace(/__EN_([a-zA-Z0-9_.-]+)__/g, (_, key: string) => {
                    if (typeof english[key] !== 'string') throw new Error('missing-english-key:' + key);
                    return english[key].replace(/\{([a-zA-Z0-9_]+)}/g, (_: string, name: string) => {
                        if (typeof birthday[name] !== 'string') throw new Error('missing-birthday-parameter');
                        return birthday[name];
                    }).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
                });
                if (mode !== 'verification') return localized;
                const instrumented = localized.replace('</head>', '<script type="module" src="/@fs/' + resolve(import.meta.dirname, 'tests/ordinary-observer.ts').replaceAll('\\', '/') + '"></script></head>');
                return instrumented.replace('__VERIFY_HELD__', '/@fs/' + resolve(import.meta.dirname, 'tests/held-browser.ts').replaceAll('\\', '/')).replace('__VERIFY_STARTUP__', '/@fs/' + resolve(import.meta.dirname, 'tests/startup-browser.ts').replaceAll('\\', '/') + '').replace('__VERIFY_ENVIRONMENT__', '/@fs/' + resolve(import.meta.dirname, 'tests/environment-browser.ts').replaceAll('\\', '/') + '').replace('__VERIFY_NATIVE_UI__', '/@fs/' + resolve(import.meta.dirname, 'tests/native-ui-browser.ts').replaceAll('\\', '/')).replace('__VERIFY_ICONS__', '/@fs/' + resolve(import.meta.dirname, 'tests/icon-gallery.ts').replaceAll('\\', '/')).replace('__VERIFY_BROWSER__', '/@fs/' + resolve(import.meta.dirname, 'tests/browser-fixture.ts').replaceAll('\\', '/')).replace('__VERIFY_LONG__', '/@fs/' + resolve(import.meta.dirname, 'tests/long-text.ts').replaceAll('\\', '/')).replace('__VERIFY_PERFORMANCE__', '/@fs/' + resolve(import.meta.dirname, 'tests/world-performance.ts').replaceAll('\\', '/')).replace('__VERIFY_WORLD__', '/@fs/' + resolve(import.meta.dirname, 'tests/world-browser.ts').replaceAll('\\', '/')).replace('__VERIFY_INPUT__', '/@fs/' + resolve(import.meta.dirname, 'tests/input-browser.ts').replaceAll('\\', '/'));
            }
        }
    }],
    server: {
        host: '127.0.0.1',
        port: 4183,
        strictPort: true,
        fs: {
            strict: true,
            allow: [root, resolve(import.meta.dirname, 'node_modules'), ...(mode === 'verification' ? [resolve(import.meta.dirname, 'tests')] : [])]
        }
    },
    preview: {host: '127.0.0.1', port: 4185, strictPort: true},
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: false,
        manifest: true,
        target: 'es2022',
        license: {fileName: 'THIRD_PARTY_LICENSES.md'},
        rolldownOptions: {input: {home: resolve(root, 'index.html'), game: resolve(root, 'game/index.html')}}
    }
}));
