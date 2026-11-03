#!/usr/bin/env node
// Screenshot the concept mockups in docs/concepts/: each frame at 1440 px, the theater also at 390 px.
//   node scripts/qa/shoot_concepts.mjs [concept-a-traveler ...]
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, loadPlaywright } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'concepts', 'shots');
await mkdir(OUT, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : (await readdir(join(ROOT, 'docs', 'concepts'))).filter((f) => /^concept-.*\.html$/.test(f)).map((f) => f.slice(0, -5));
const { chromium } = await loadPlaywright();
const server = await startServer(ROOT);
const browser = await chromium.launch();
for (const name of names) {
  for (const [w, h, frames] of [[1440, 900, ['hero', 'theater', 'vfab', 'map']], [390, 844, ['theater']]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}docs/concepts/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const f of frames) {
      await page.locator(`#${f}`).screenshot({ path: join(OUT, `${name.split('-').slice(0, 2).join('-')}-${f}-${w}.jpg`), type: 'jpeg', quality: 82 });
    }
    console.log(`${name} @${w}: overflow ${over}px`);
    await page.close();
  }
}
await browser.close();
await server.close();
