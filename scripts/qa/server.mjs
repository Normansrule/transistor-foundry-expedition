// Tiny static file server for the QA scripts: no dependencies, serves site/ on a free port.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

export async function startServer(root) {
  const base = resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((ok) => server.close(ok)) };
}

// Playwright is installed globally on CI and on most dev machines; resolve it without a package.json.
export async function loadPlaywright() {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const tries = ['playwright', 'playwright-core', '@playwright/test'];
  for (const name of tries) {
    try { return require(name); } catch { /* next */ }
    for (const dir of (process.env.NODE_PATH || '').split(':').filter(Boolean)) {
      try { return require(join(dir, name)); } catch { /* next */ }
    }
  }
  throw new Error('Playwright not found. Install it with:  npm i -g playwright && npx playwright install chromium');
}
