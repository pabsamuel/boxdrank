/**
 * Minimal static file server for trying the app locally.
 *
 * Exists because the demo cannot run from file:// — browsers block ES module
 * imports and fetch() on that scheme, so opening index.html directly shows an
 * empty page. Written against node:http rather than pulling in a server package
 * so `npm install` stays at two entries.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 8137);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);

  // Redirect rather than serve index.html at "/". Serving it here would make the
  // page's relative "./main.js" resolve to "/main.js" and 404.
  if (requested === '/') {
    response.writeHead(302, { location: '/src/app/index.html' }).end();
    return;
  }
  const path = requested;

  // Refuse anything that escapes the project directory. A dev server is still a
  // server, and path traversal is the one bug it must not have.
  const resolved = normalize(join(ROOT, path));
  if (!resolved.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(resolved);
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(resolved)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

// Bound to loopback on purpose. This serves the whole project directory, and a
// demo server has no reason to be reachable from the rest of the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Automation Watchdog demo: http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
