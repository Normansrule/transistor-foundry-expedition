// Print every web manual to PDF in dist/manuals/<id>.pdf (for a GitHub release; not part of the site or zip).
// Run: node scripts/qa/print_manuals.mjs
// Needs Playwright (see make qa). Serves site/ on a free port, prints with the page's own print CSS.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../../site/', import.meta.url));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(SITE)) throw new Error('outside');
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;
const OUT = fileURLToPath(new URL('../../dist/manuals/', import.meta.url));
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const f of (await readdir(join(SITE, 'manuals'))).filter(f => f.endsWith('.html'))) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/manuals/${f}`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.querySelectorAll('.mn-spec').forEach(e => { e.open = true; }));
  const out = join(OUT, f.replace(/\.html$/, '.pdf'));
  await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
  console.log('wrote', out);
}
await browser.close();
server.close();
