#!/usr/bin/env node
// Render assets/banner.png (README, 2400x900) and site/assets/og.png (link previews, 1600x600)
// from scripts/banner.html with the site's own fonts.   node scripts/qa/render_banner.mjs
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, loadPlaywright } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await loadPlaywright();
const server = await startServer(ROOT);
const browser = await chromium.launch();
for (const [out, scale] of [['assets/banner.png', 1.5], ['site/assets/og.png', 1]]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 600 }, deviceScaleFactor: scale });
  await page.goto(server.url + 'scripts/banner.html');
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(ROOT, out) });
  await page.close();
  console.log(out);
}
await browser.close();
await server.close();
