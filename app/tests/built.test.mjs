/** Real HTTP root and Pages-subpath checks run against normal static outputs, not the verification server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {preview} from 'vite';
import {resources, RESOURCE_PREFIX} from '../tools/resources.ts';
import {ruleData, RULE_PREFIX} from '../tools/rule-data.ts';

for (const [folder, base] of [['dist', '/'], ['dist-pages', '/minecraft-birthday-2026/']]) test('formal HTTP ' + base + ' has both entries, original bytes and no internal/test routes', async () => {
  const root = resolve(import.meta.dirname, '..'), server = await preview({
    configFile: resolve(root, 'vite.config.ts'),
    base,
    build: {outDir: resolve(root, folder)},
    preview: {host: '127.0.0.1', port: base === '/' ? 4191 : 4192, strictPort: false},
    logLevel: 'silent'
  }), origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  try {
    const buildId = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    let identified = false;
    for (const name of readdirSync(resolve(root, folder, 'assets'))) {
      const r = await fetch(origin + base + 'assets/' + name), body = Buffer.from(await r.arrayBuffer());
      assert.equal(r.status, 200, name);
      assert.deepEqual(body, readFileSync(resolve(root, folder, 'assets', name)), name);
      assert.match(r.headers.get('content-type') ?? '', name.endsWith('.css') ? /text\/css/ : /(?:java|ecma)script/, name);
      if (name.endsWith('.js') && body.toString().includes(buildId)) identified = true;
    }
    assert.ok(identified, 'the served application chunks identify this exact source commit');
    for (const entry of ['', 'game/', 'game/index.html']) {
      const r = await fetch(origin + base + entry);
      assert.equal(r.status, 200);
      const html = await r.text();
      assert.ok(!html.includes('__EN_'));
      assert.match(r.headers.get('content-type') ?? '', /text\/html/);
      const favicon = html.match(/rel="icon"[^>]+href="([^"]+)"/);
      assert.ok(favicon, 'each entry includes the original favicon');
      const icon = await fetch(new URL(favicon[1], origin + base + entry));
      assert.equal(icon.status, 200);
      assert.match(icon.headers.get('content-type') ?? '', /image\/png/);
      for (const ref of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
        const url = new URL(ref[1], origin + base + entry);
        assert.ok(url.pathname.startsWith(base));
        assert.equal((await fetch(url)).status, 200);
      }
    }
    for (const [name, body] of resources()) {
      const r = await fetch(origin + base + RESOURCE_PREFIX + name);
      assert.equal(r.status, 200, name);
      if (name.endsWith('.png')) assert.match(r.headers.get('content-type') ?? '', /image\/png/, name);
      if (name.endsWith('.ogg')) assert.match(r.headers.get('content-type') ?? '', /audio\/ogg/, name);
      if (name.endsWith('.json')) assert.match(r.headers.get('content-type') ?? '', /application\/json/, name);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), Buffer.from(body));
    }
    for (const [name, body] of ruleData()) {
      const r = await fetch(origin + base + RULE_PREFIX + name);
      assert.equal(r.status, 200, name);
      assert.match(r.headers.get('content-type') ?? '', /application\/json/, name);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), body);
    }
    for (const path of ['AGENTS.md', 'docs/project-proposal.md', 'experiments/scene3d/web/index.html', 'tests/browser-fixture.ts', '__verify__/index.html', '__verify__/icons.html', '__verify__/input.html', '__verify__/world.html', '__verify__/performance.html', 'tests/world-performance.ts', 'tests/ordinary-observer.ts', 'tests/capacity-browser.ts', 'tests/spatial-access.ts', 'tests/input-browser.ts', 'client.jar', 'package.json', 'data/minecraft/26.3/catalog.json', 'rules/minecraft/26.3/catalog.json', 'rules/minecraft/26.3/coverage.json']) assert.equal((await fetch(origin + base + path)).status, 404, path);
  } finally {
    server.httpServer.closeAllConnections();
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
