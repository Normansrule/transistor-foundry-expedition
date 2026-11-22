// Print every web manual to PDF in dist/manuals/<id>.pdf, plus all of them in manual order as one book,
// dist/manuals/process-manuals-book.pdf (for a GitHub release; not part of the site or zip).
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
// The book: one page that holds every manual's <main>, in the order of data/manuals.json, each starting a new sheet.
const MAN = JSON.parse(await readFile(fileURLToPath(new URL('../../data/manuals.json', import.meta.url)), 'utf-8'));
const ids = MAN.manuals.map(m => m.id);
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/manuals/${ids[0]}.html`, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
const parts = await page.evaluate(async (ids) => {
  const out = [];
  for (const id of ids) {
    const doc = new DOMParser().parseFromString(await (await fetch(`${id}.html`)).text(), 'text/html');
    const main = doc.querySelector('main');
    main.querySelectorAll('[id]').forEach(e => { e.id = `${id}--${e.id}`; });
    main.querySelectorAll('a[href^="#"]').forEach(a => { a.setAttribute('href', `#${id}--${a.getAttribute('href').slice(1)}`); });
    out.push({ id, title: doc.querySelector('h1')?.textContent.trim() || id, html: main.innerHTML });
  }
  return out;
}, ids);
await page.evaluate(({ parts, codes }) => {
  const main = document.querySelector('main');
  const toc = parts.map((p, i) => `<li><a href="#book-${p.id}">${codes[i]} · ${p.title}</a></li>`).join('');
  main.innerHTML = `<section style="break-after:page;padding-top:30vh"><p class="mn-sub">Transistor Foundry Expedition</p>`
    + `<h1 style="font-size:40pt;margin:.2em 0">Process manuals</h1><p class="mn-lead">All ${parts.length} manuals in route order, from the wafer to the history of the planar process. `
    + `Every number is cited in the web version; institution-only steps stay conceptual here too.</p><ol style="display:block;columns:2;list-style:none;padding:0;font-size:11pt;line-height:1.7;margin-top:2em">${toc}</ol></section>`
    + parts.map(p => `<div id="book-${p.id}" style="break-before:page">${p.html}</div>`).join('');
  document.querySelectorAll('.mn-spec').forEach(e => { e.open = true; });
  document.title = 'Process manuals (book)';
}, { parts, codes: MAN.manuals.map(m => m.code) });
await page.pdf({ path: join(OUT, 'process-manuals-book.pdf'), printBackground: true, preferCSSPageSize: true });
console.log('wrote', join(OUT, 'process-manuals-book.pdf'), `(${parts.length} manuals)`);
await browser.close();
server.close();
