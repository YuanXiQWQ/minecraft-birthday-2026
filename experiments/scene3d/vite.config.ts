/** Isolated dual-entry prototype; the served root never includes repository development records. */
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { localResources } from './tools/local-resources.ts';

/** Explicit web-only root, with no public directory or repository-wide asset copying. */
const root = resolve(import.meta.dirname, 'web');

export default defineConfig({
  plugins:[localResources(process.env.MC_LOCAL_SAMPLES)],
  root, publicDir: false, appType: 'mpa',
  server: { host: '127.0.0.1', port: 4178, strictPort: true,
    fs: { strict: true, allow: [root, resolve(import.meta.dirname, 'node_modules')] } },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, manifest: true, license: { fileName: 'THIRD_PARTY_LICENSES.md' }, target: 'es2022',
    rolldownOptions: { input: { home: resolve(root, 'index.html'), game: resolve(root, 'game/index.html') } } },
});
