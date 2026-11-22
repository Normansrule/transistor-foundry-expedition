#!/usr/bin/env node
// Render the app icons for the PWA manifest from the same drawing as site/assets/favicon.svg.
//   node scripts/qa/render_icons.mjs   writes site/assets/icons/{icon-180,icon-192,icon-512,maskable-512}.png
// "any" icons keep the rounded tile; the maskable icon fills the square and keeps the device
// inside the central 80 % safe zone, so a launcher can crop it to any shape.
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'site', 'assets', 'icons');
const GLYPH = '<rect x="2" y="15" width="20" height="6" rx="1.5" fill="#4b596d"/><rect x="3" y="13" width="6" height="3" fill="#3f7fe0"/><rect x="15" y="13" width="6" height="3" fill="#3f7fe0"/><rect x="9" y="12.2" width="6" height="1.2" fill="#9a80dc"/><rect x="9" y="5" width="6" height="7.2" rx="1" fill="#f2b84b"/>';
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0a0d11"/>${GLYPH}</svg>`;
const mask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#0a0d11"/><g transform="translate(4.2 4.2) scale(.65)">${GLYPH}</g></svg>`;
const JOBS = [['icon-180.png', 180, tile], ['icon-192.png', 192, tile], ['icon-512.png', 512, tile], ['maskable-512.png', 512, mask]];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
for (const [name, size, svg] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(OUT, name), omitBackground: true });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
