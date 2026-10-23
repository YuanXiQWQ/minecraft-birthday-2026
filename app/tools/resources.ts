/** Serve and emit audited shared original resources without importing experiment code or private caches. */
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';
import type {Plugin} from 'vite';

/** Shared versioned source is independent of either application's served root. */
export const RESOURCE_ROOT = resolve(import.meta.dirname, '../../resources/minecraft/26.3');
/** Runtime namespace is always relative to the configured Vite base. */
export const RESOURCE_PREFIX = 'minecraft/26.3/';

/** Verify the bounded resource profiles, including dependencies already supplied by the original P2 cohort.
 * @return {Map<string,Uint8Array>} Exact runtime manifests and resource bytes.
 */
export function resources(): Map<string, Uint8Array> {
    const root = realpathSync(RESOURCE_ROOT), files = new Map<string, Uint8Array>();
    for (const manifestName of ['manifest.json', 'presentation-manifest.json', 'catalogue-manifest.json', 'player-manifest.json', 'book-manifest.json', 'experience-manifest.json', 'world-manifest.json', 'interaction-manifest.json', 'interface-manifest.json', 'environment-manifest.json']) {
        const raw = readFileSync(resolve(root, manifestName)), m = JSON.parse(raw.toString());
        if (m.version !== '26.3' || m.clientSha1 !== 'e877b6a07acd633fb3bb475002175cec036e7b87') throw new Error('wrong-resource-version');
        if (manifestName === 'catalogue-manifest.json' && createHash('sha256').update(readFileSync(resolve(import.meta.dirname, '../web/src/i18n/items.en.json'))).digest('hex') !== m.namesSha256) throw new Error('item-name-integrity');
        if (manifestName === 'interaction-manifest.json' && createHash('sha256').update(readFileSync(resolve(import.meta.dirname, '../web/src/i18n/items.zh_cn.json'))).digest('hex') !== m.language.aliasesSha256) throw Error('item-alias-integrity');
        files.set(manifestName, raw);
        for (const e of m.entries) {
            if (!/^(?:assets|data)\/minecraft\/[a-z0-9_/.\/-]+$/.test(e.entry) || e.entry.includes('..') || files.has(e.entry)) throw new Error('invalid-resource-entry');
            const target = realpathSync(resolve(root, e.entry));
            if (!target.toLowerCase().startsWith((root + sep).toLowerCase())) throw new Error('resource-path-escape');
            const body = readFileSync(target);
            if (body.length !== e.size || createHash('sha256').update(body).digest('hex') !== e.sha256) throw new Error('resource-integrity');
            files.set(e.entry, body);
        }
    }
    return files;
}

/** Use one verified file set for ordinary development, root builds and Pages subpath builds.
 * @return {Plugin} Exact resource integration.
 */
export function resourcePlugin(): Plugin {
    const files = resources();
    return {
        name: 'java-26.3-resources',
        /** Serve audited assets under the current deployment base.
         * @param {import('vite').ViteDevServer} server Development server.
         */
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const prefix = server.config.base + RESOURCE_PREFIX,
                    p = new URL(req.url ?? '/', 'http://vite.invalid').pathname;
                if (!p.startsWith(prefix)) {
                    next();
                    return;
                }
                const name = p.slice(prefix.length), body = files.get(name);
                if (!body || req.method !== 'GET') {
                    res.statusCode = 404;
                    res.end();
                    return;
                }
                res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : name.endsWith('.ogg') ? 'audio/ogg' : 'application/json');
                res.end(body);
            });
        },
        /** Emit exact source bytes and no repository documentation or full client artifacts. */
        generateBundle() {
            for (const [name, source] of files) this.emitFile({
                type: 'asset',
                fileName: RESOURCE_PREFIX + name,
                source
            });
        }
    };
}
