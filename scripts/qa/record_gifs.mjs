#!/usr/bin/env node
// Record the README GIFs from each page's ?record=<id> mode and assemble them under a size budget.
//
//   node scripts/qa/record_gifs.mjs                    all GIFs in scripts/qa/gifs.json
//   node scripts/qa/record_gifs.mjs circuit_zoom pn    only these
//
// Each page in record mode shows an 800x450 #rec stage and exposes window.__frame(n), which
// draws the next frame deterministically. Frames are captured as PNG, then
// scripts/qa/gif_encode.py builds the GIF and steps quality down until it fits the budget.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, loadPlaywright } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = JSON.parse(await readFile(join(ROOT, 'scripts/qa/gifs.json'), 'utf8'));
const only = process.argv.slice(2);
const list = spec.gifs.filter((g) => !only.length || only.includes(g.out)).map((g) => ({ ...spec.defaults, ...g }));
const PY = process.env.PY || 'python3';

const { chromium } = await loadPlaywright();
const server = await startServer(join(ROOT, 'site'));
const browser = await chromium.launch();
let failed = 0;

for (const g of list) {
  const tmp = join(ROOT, 'qa-out', 'frames', g.out);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: g.scale });
  const page = await ctx.newPage();
  await page.route((url) => !url.href.startsWith(server.url), (r) => r.abort());
  await page.goto(`${server.url}${g.page}.html?record=${g.id}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const stage = page.locator('#rec');
  let saved = 0;
  for (let k = 0; k < g.frames; k++) {
    await page.evaluate((n) => window.__frame(n), g.frames);
    if (k % g.step) continue;
    await stage.screenshot({ path: join(tmp, `f${String(saved++).padStart(4, '0')}.png`), animations: 'allow' });
  }
  await ctx.close();
  const out = join(ROOT, 'figures', 'anim', `${g.out}.gif`);
  const r = spawnSync(PY, [join(ROOT, 'scripts/qa/gif_encode.py'), tmp, out, '--delay', String(g.delay), '--colors', String(g.colors), '--budget', String(g.budget)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
  if (process.env.KEEP_FRAMES !== '1') await rm(tmp, { recursive: true, force: true });
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
