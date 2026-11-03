#!/usr/bin/env node
// Site QA: screenshots, horizontal overflow, navigation, click-through, canvas labels, console errors.
//
//   node scripts/qa/qa.mjs                 all pages at 1440 and 390 px
//   node scripts/qa/qa.mjs --pages devices,index --widths 390
//   QA_ONLINE=1 node scripts/qa/qa.mjs     allow network (Commons photos); default is offline
//
// Writes qa-out/screens/<page>-<width>.jpg and qa-out/report.{json,md}; exits 1 on any failure.
import { mkdir, readdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, loadPlaywright } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, 'qa-out');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const PAGE_ORDER = ['index', 'devices', 'physics', 'circuits', 'process', 'analog'];
const allPages = (await readdir(SITE)).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5))
  .sort((a, b) => (PAGE_ORDER.indexOf(a) + 99 * !PAGE_ORDER.includes(a)) - (PAGE_ORDER.indexOf(b) + 99 * !PAGE_ORDER.includes(b)));
const PAGES = arg('pages', allPages.join(',')).split(',');
const WIDTHS = arg('widths', '1440,390').split(',').map(Number);
const HEIGHT = { 1440: 900, 390: 844 };
const ONLINE = process.env.QA_ONLINE === '1';
const SHOTS = process.env.QA_SHOTS !== '0';
// Pages that every page's main navigation must reach.
const NAV_TARGETS = PAGE_ORDER.filter((p) => allPages.includes(p));

const { chromium } = await loadPlaywright();
const server = await startServer(SITE);
const browser = await chromium.launch();
await mkdir(join(OUT, 'screens'), { recursive: true });

const results = [];
const idsByPage = {};

async function openPage(ctx, name) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  if (!ONLINE) await page.route((url) => !url.href.startsWith(server.url), (r) => r.abort());
  await page.goto(server.url + name + '.html', { waitUntil: 'load' });
  // Scroll the whole page so lazy and scroll-triggered sections render, then return to the top.
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
  });
  return { page, errors };
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] || 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  for (const name of PAGES) {
    const t0 = Date.now();
    const { page, errors } = await openPage(ctx, name);
    const fails = [];
    const notes = [];

    // 1. Horizontal overflow: the page itself, then any visible element poking past the viewport
    //    that is not clipped by a scrolling or overflow-hidden ancestor.
    const ov = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const pageOverflow = document.documentElement.scrollWidth - vw;
      const clipped = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX !== 'visible' || s.overflow === 'hidden' || s.contain.includes('paint')) {
            const r = p.getBoundingClientRect();
            if (r.right <= vw + 1) return true;
          }
        }
        return false;
      };
      const offenders = [];
      for (const el of document.body.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 && !clipped(el)) {
          const id = el.id ? '#' + el.id : '';
          const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
          offenders.push(`${el.tagName.toLowerCase()}${id}${cls} (+${Math.round(r.right - vw)} px)`);
        }
      }
      return { pageOverflow, offenders: offenders.slice(0, 8), count: offenders.length };
    });
    if (ov.pageOverflow > 0) fails.push(`page scrolls sideways by ${ov.pageOverflow} px`);
    if (ov.count) fails.push(`${ov.count} element(s) overflow the viewport: ${ov.offenders.join(', ')}`);

    // 2. Navigation: every page reachable from the main nav, current page marked, nothing hidden
    //    behind a sideways-scrolling strip. At phone width a menu button may hold the links.
    const nav = await page.evaluate((targets) => {
      const navEl = document.querySelector('nav.nav, nav[aria-label="Main"]');
      if (!navEl) return { missing: targets, error: 'no main <nav>' };
      const visible = (a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
      const inView = (a) => { const r = a.getBoundingClientRect(); const strip = a.closest('.nav-links, .nav-pages'); if (!strip) return true; const sr = strip.getBoundingClientRect(); return r.left >= sr.left - 1 && r.right <= sr.right + 1; };
      const links = [...navEl.querySelectorAll('a[href]')];
      const menuBtn = navEl.querySelector('details > summary, button[aria-controls], button[aria-expanded]');
      const inMenu = (a) => !!a.closest('details, [id][hidden], [aria-labelledby]');
      const reach = (t) => links.some((a) => {
        const h = a.getAttribute('href').split('#')[0];
        const isT = h === `${t}.html` || (t === 'index' && (h === '' || h === './' || h === 'index.html') && !a.getAttribute('href').startsWith('#'))
          || (t === 'index' && a.classList.contains('brand'));
        return isT && (visible(a) && inView(a) || (inMenu(a) && menuBtn && visible(menuBtn)));
      });
      const here = location.pathname.split('/').pop().replace('.html', '') || 'index';
      const current = links.find((a) => a.getAttribute('aria-current') === 'page');
      const strip = navEl.querySelector('.nav-links, .nav-pages');
      const stripScroll = strip && getComputedStyle(strip).display !== 'none' ? strip.scrollWidth - strip.clientWidth : 0;
      return { missing: targets.filter((t) => !reach(t)), current: current ? current.getAttribute('href') : null, here, stripScroll, menu: !!menuBtn };
    }, NAV_TARGETS);
    if (nav.error) fails.push(nav.error);
    if (nav.missing?.length) fails.push(`nav cannot reach: ${nav.missing.join(', ')}`);
    if (nav.stripScroll > 2) fails.push(`nav links hidden in a sideways scroll (${nav.stripScroll} px)`);
    if (!nav.current) notes.push('no aria-current="page" link in the nav');

    // 3. Canvas labels and control names (WCAG 1.1.1, 4.1.2).
    const a11y = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('canvas').forEach((c, i) => {
        if (c.getAttribute('aria-hidden') === 'true' || c.closest('[aria-hidden="true"]')) return;
        if (!c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')) bad.push(`canvas#${c.id || i}`);
      });
      const unnamed = [];
      document.querySelectorAll('button, input, select, textarea, [role="slider"], [role="button"]').forEach((el) => {
        if (el.type === 'hidden' || el.closest('[aria-hidden="true"]')) return;
        const name = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title || (el.labels && el.labels.length) || el.textContent.trim() || el.getAttribute('placeholder') || el.value && el.tagName === 'INPUT' && el.type === 'button';
        if (!name) unnamed.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`);
      });
      return { bad, unnamed: unnamed.slice(0, 10), unnamedCount: unnamed.length };
    });
    if (a11y.bad.length) fails.push(`canvas without aria-label: ${a11y.bad.slice(0, 6).join(', ')}${a11y.bad.length > 6 ? ` (+${a11y.bad.length - 6})` : ''}`);
    if (a11y.unnamedCount) fails.push(`${a11y.unnamedCount} control(s) without an accessible name: ${a11y.unnamed.join(', ')}`);

    // 4. Collect ids (after scripts ran) and links for the click-through pass.
    const found = await page.evaluate(() => ({
      // ids, plus data-id values that the page's script routes to from the URL hash
      ids: [...document.querySelectorAll('[id]')].map((e) => e.id).concat([...document.querySelectorAll('[data-id]')].map((e) => e.dataset.id)),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
    }));
    idsByPage[name] = new Set(found.ids);

    if (SHOTS) {
      // Full-page captures, cut into tiles of at most 4000 px (JPEG tops out at 65,535 px, and
      // the pinned timeline makes the document very wide, so clip to the viewport width).
      const vw = await page.evaluate(() => document.documentElement.clientWidth);
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const TILE = 4000;
      for (let y = 0, i = 1; y < total; y += TILE, i++) {
        const path = join(OUT, 'screens', `${name}-${width}-${String(i).padStart(2, '0')}.jpg`);
        try { await page.screenshot({ path, fullPage: true, clip: { x: 0, y, width: vw, height: Math.min(TILE, total - y) }, type: 'jpeg', quality: 60, animations: 'disabled', timeout: 120000 }); }
        catch (e) { notes.push(`screenshot tile ${i} failed: ${e.message.split('\n')[0]}`); }
      }
    }
    if (errors.length) fails.push(...errors.slice(0, 5));
    results.push({ page: name, width, fails, notes, links: found.links, ms: Date.now() - t0 });
    await page.close();
    console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name}.html @ ${width}px${fails.length ? '\n     - ' + fails.join('\n     - ') : ''}`);
  }

  // 5. Click-through at desktop width: press every main-nav link and check where it lands.
  if (width >= 1100) {
    for (const name of PAGES) {
      const { page } = await openPage(ctx, name);
      const hrefs = [...new Set(await page.$$eval('nav a[href]', (as) => as.map((a) => a.getAttribute('href'))))];
      const bad = [];
      for (const href of hrefs) {
        if (/^https?:/.test(href)) continue;
        await page.goto(server.url + name + '.html', { waitUntil: 'domcontentloaded' });
        const link = page.locator(`nav a[href="${href}"]`).first();
        try {
          // Links folded into a menu: open it first, as a visitor would.
          if (!(await link.isVisible())) {
            const summary = page.locator('nav details > summary').first();
            if (await summary.isVisible()) await summary.click();
          }
          await link.click({ timeout: 3000 });
          await page.waitForLoadState('domcontentloaded');
          const [file, hash] = href.split('#');
          const landed = new URL(page.url());
          const want = file ? file : name + '.html';
          if (!landed.pathname.endsWith(want) && !(want === 'index.html' && landed.pathname.endsWith('/'))) bad.push(`${href} → ${landed.pathname}`);
          if (hash && !(await page.$(`[id="${hash}"], [data-id="${hash}"]`))) bad.push(`${href}: no element with that id`);
        } catch (e) { bad.push(`${href}: ${e.message.split('\n')[0]}`); }
      }
      const r = results.find((x) => x.page === name && x.width === width);
      if (bad.length) { r.fails.push(`click-through: ${bad.join('; ')}`); console.log(`FAIL click-through ${name}.html: ${bad.join('; ')}`); }
      await page.close();
    }
  }
  await ctx.close();
}

// 6. Static link check: every internal href resolves to a file, and every #fragment to an id.
const linkFails = [];
const seen = new Set();
for (const r of results) {
  for (const href of r.links) {
    if (!href || /^(https?:|mailto:|javascript:|data:)/.test(href) || seen.has(r.page + href)) continue;
    seen.add(r.page + href);
    const [file, hash] = href.split('#');
    const target = file ? file.replace(/^\.\//, '') : r.page + '.html';
    try { await access(join(SITE, target)); } catch { linkFails.push(`${r.page}.html → ${href} (missing file)`); continue; }
    const tp = target.replace(/\.html$/, '');
    if (hash && idsByPage[tp] && !idsByPage[tp].has(decodeURIComponent(hash))) linkFails.push(`${r.page}.html → ${href} (no such id)`);
  }
}
if (linkFails.length) console.log('FAIL links\n     - ' + linkFails.join('\n     - '));

await browser.close();
await server.close();

const failed = results.filter((r) => r.fails.length).length + (linkFails.length ? 1 : 0);
const report = { date: new Date().toISOString(), online: ONLINE, widths: WIDTHS, pages: PAGES, results: results.map(({ links, ...r }) => r), linkFails };
await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const md = ['# QA report', '', `${new Date().toISOString()} · ${ONLINE ? 'online' : 'offline'} · widths ${WIDTHS.join(', ')} px`, '',
  '| Page | Width | Result | Notes |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.page}.html | ${r.width} | ${r.fails.length ? '❌ ' + r.fails.join('<br>') : '✅'} | ${r.notes.join('; ')} |`),
  '', linkFails.length ? '## Broken links\n\n' + linkFails.map((l) => `- ${l}`).join('\n') : 'All internal links resolve.', ''].join('\n');
await writeFile(join(OUT, 'report.md'), md);
console.log(`\n${failed ? `${failed} check group(s) failed` : 'All QA checks passed'} · report: qa-out/report.md · screens: qa-out/screens/`);
process.exit(failed ? 1 : 0);
