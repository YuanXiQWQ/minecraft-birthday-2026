/** Dependency-free loopback-only host with an explicit experiment asset allowlist. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Only experiment client modules are served, never repository files or reports. */
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'ui.mjs', 'labels.mjs', 'core/definitions.mjs',
  'core/containers.mjs', 'core/placement.mjs', 'core/flow.mjs', 'core/model.mjs', 'core/persistence.mjs']);

/** Resource root fixed to this experiment, independently of the process working directory. */
const ROOT = new URL('./', import.meta.url);

/** Create a testable local server without starting it as a module import side effect.
 * @return {import('node:http').Server} Unbound HTTP server.
 */
export function createExperimentServer() { return createServer(serve); }

/** Serve an allowlisted static file and reject paths outside the experiment.
 * @param {import('node:http').IncomingMessage} req Request.
 * @param {import('node:http').ServerResponse} res Response.
 */
async function serve(req, res) {
  let name;
  try { name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400).end('Bad path'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  if (!PUBLIC_FILES.has(name)) { res.writeHead(404).end('Experiment file not found'); return; }
  try {
    const body = await readFile(new URL(name, ROOT));
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500).end('Experiment resource unavailable'); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PLACEMENT_PORT ?? 4177);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLACEMENT_PORT');
  const server = createExperimentServer();
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Placement experiment: http://127.0.0.1:${port}/\n`));
}
