// Spot the defect (showcase): seven process defects. The process models in physics/defects.js (twin of
// sim/transistor_sim/physics/defects.py) decide which of four features fails; the page shuffles them, the
// player finds the defect and names the cause, then sees why, how a fab finds it and how it is fixed.
// The words live in data/defects.json; every picture is drawn from the model's numbers.
import { DEFECTS, REFS } from './data.js';
import { CASES, caseOf, grade } from '../physics/defects.js';
import { aerialImage } from '../physics/litho.js';
import { esc, store } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const TEXT = Object.fromEntries(DEFECTS.cases.map((c) => [c.id, c]));
const M = { si: '#4b596d', sich: '#7b8ca5', ox: '#8fcfd4', nit: '#c9b26b', sige: '#b58fd6', resist: '#e07fb0', metal: '#e2b650',
  cu: '#d9825b', w: '#b9c3cd', bg: '#0c1016', ink: '#e8ecf1', ink2: '#aab3c0', muted: '#8a94a3', amber: '#f2b84b', ok: '#5fd896', bad: '#f0a26b', line: '#232a34' };
const W = 800, H = 380, COL = W / 4, TOP = 46;          // picture size and the four columns
const LETTERS = ['A', 'B', 'C', 'D'];
const f0 = (v) => (Math.round(v * 10) / 10).toFixed(0), f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const refLinks = (keys) => keys.filter((k) => REFS[k]).map((k) => `<a href="#ref-${k}" title="${esc(REFS[k].cite)}">${k}</a>`).join('');

const saved = store.get('df:picks', {});
const state = {
  idx: 0, seed: store.get('df:seed', 0) || newSeed(), zone: null, cause: null, good: false,
  picks: saved && typeof saved === 'object' ? saved : {},
};
function newSeed() { return 1 + Math.floor(Math.random() * 1e6); }
const cid = () => CASES[state.idx];
const seedOf = (c) => state.seed + CASES.indexOf(c) * 7919;          // each case gets its own shuffle
const pick = () => state.picks[cid()] || null;

// ---------- pictures: one per case, from the model's numbers ----------
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" fill="${fill}" ${extra}/>`;
const txt = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size || 12}" fill="${o.fill || M.ink2}" text-anchor="${o.anchor || 'middle'}" font-family="IBM Plex Mono, monospace"${o.weight ? ` font-weight="${o.weight}"` : ''}>${s}</text>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" fill="${fill}" ${extra}/>`;

function drawFill(r) {
  const sc = 1.6, d = r.info.depth * sc, y0 = 120, NZ = 48; let g = '';
  r.features.forEach((f, i) => {
    const cx = COL * i + COL / 2, w = f.w * sc, xl = cx - w / 2, xr = cx + w / 2, x0 = COL * i + 14, x1 = COL * (i + 1) - 14;
    g += rect(x0, y0, x1 - x0, d + 70, M.ox) + rect(xl, y0, w, d, M.bg);                       // oxide with a trench cut in it
    const top = r.info.target * sc, gap = Math.max(0, f.w - 2 * f.side[0]) * sc;
    g += rect(x0, y0 - top, cx - gap / 2 - x0, top, M.w) + rect(cx + gap / 2, y0 - top, x1 - cx - gap / 2, top, M.w);
    const L = [], R = [];
    for (let k = 0; k <= NZ; k++) { const z = y0 + d * k / NZ, t = f.side[k] * sc; L.push([xl + t, z]); R.push([xr - t, z]); }
    g += poly([[xl, y0], ...L, [xl, y0 + d]], M.w) + poly([[xr, y0], ...R, [xr, y0 + d]], M.w);
    g += rect(xl, y0 + d - f.side[NZ] * sc, w, f.side[NZ] * sc, M.w);
    g += txt(cx, y0 + d + 96, `${f0(f.w)} nm wide`, { size: 12 });
  });
  return { g, key: [[M.ox, 'oxide'], [M.w, `film (${r.info.method === 'ald' ? 'ALD' : 'CVD'})`], [M.bg, 'empty space']] };
}

function drawEtch(r) {
  const sc = 0.8, y0 = 110, film = r.info.film * sc; let g = '';
  r.features.forEach((f, i) => {
    const cx = COL * i + COL / 2, w = f.w * sc, x0 = COL * i + 14, x1 = COL * (i + 1) - 14, m = f.mask_left * sc;
    g += rect(x0, y0 + film, x1 - x0, 60, M.si) + rect(x0, y0, x1 - x0, film, M.ox) + rect(x0, y0 - m, x1 - x0, m, M.nit);
    const bot = Math.min(f.depth, r.info.film + 30) * sc, L = [], R = [];
    f.side.forEach(([z, u]) => { L.push([cx - w / 2 - u * sc, y0 + z * sc]); R.push([cx + w / 2 + u * sc, y0 + z * sc]); });
    const last = f.side.length ? f.side[f.side.length - 1] : [0, 0];
    const lx = cx - w / 2 - last[1] * sc, rx = cx + w / 2 + last[1] * sc;
    g += rect(cx - w / 2, y0 - m, w, m, M.bg);
    g += poly([[cx - w / 2, y0], ...L, [lx, y0 + bot], [rx, y0 + bot], ...R.reverse(), [cx + w / 2, y0]], M.bg);
    g += txt(cx, y0 + film + 78, `${f0(f.w)} nm wide`);
  });
  return { g, key: [[M.nit, 'hard mask'], [M.ox, 'film to etch'], [M.si, 'stop layer']] };
}

function drawCmp(r, reveal) {
  const sc = 0.3, base = 300; let g = '';
  r.features.forEach((f, i) => {
    const x0 = COL * i + 14, x1 = COL * (i + 1) - 14, cw = x1 - x0, n = 6, pitch = cw / n, lw = pitch * f.rho;
    g += rect(x0, base, cw, 24, M.si) + rect(x0, base - f.up * sc, cw, f.up * sc, M.ox);
    for (let k = 0; k < n; k++) {
      const lx = x0 + pitch * (k + 0.5) - lw / 2, lh = Math.min(r.info.line, f.up) * sc;
      g += rect(lx, base - lh, lw, lh, M.metal);
    }
    g += txt(x0 + cw / 2, base + 40, `density ${Math.round(f.rho * 100)} %`);
  });
  const mid = base - r.info.median * sc;
  if (reveal) {
    g += rect(0, mid - r.info.tol * sc, W, 2 * r.info.tol * sc, M.amber, 'fill-opacity=".07"');
    g += `<line x1="0" y1="${f1(mid)}" x2="${W}" y2="${f1(mid)}" stroke="${M.amber}" stroke-dasharray="6 5" stroke-width="1.2"/>`;
    g += txt(W - 8, mid - r.info.tol * sc - 6, `± depth of focus (${f0(r.info.tol)} nm)`, { anchor: 'end', fill: M.amber, size: 11 });
  }
  return { g, key: [[M.ox, 'oxide after polishing'], [M.metal, 'lines underneath'], [M.si, 'wafer']] };
}

function drawRelease(r) {
  const sc = 2.2, th = r.info.t * sc * 2.2, gapH = 22, y0 = 120; let g = '';
  r.features.forEach((f, i) => {
    const cx = COL * i + COL / 2, w = f.W * sc;
    g += rect(cx - w / 2 - 10, y0 + 3 * (th + gapH), w + 20, 50, M.si);
    for (let k = 0; k < 3; k++) {
      const ys = y0 + k * (th + gapH);
      g += rect(cx - f.w_final * sc / 2, ys, f.w_final * sc, th, M.sich, 'rx="2"');
      const yg = ys + th, cw = f.core * sc;
      g += rect(cx - cw / 2, yg, cw, gapH, M.sige);
    }
    g += txt(cx, y0 + 3 * (th + gapH) + 76, `${f0(f.W)} nm wide`);
  });
  return { g, key: [[M.sich, 'silicon sheets'], [M.sige, 'SiGe left behind'], [M.si, 'substrate']] };
}

function drawEm(r) {
  const yt = 70; let g = '';
  r.features.forEach((f, i) => {
    const cx = COL * i + COL / 2, len = 40 + f.L * 3.4, lw = 16;
    g += rect(cx - lw / 2, yt, lw, len, M.cu, 'rx="2"') + rect(cx - 13, yt - 13, 26, 16, M.w, 'rx="2"') + rect(cx - 13, yt + len - 3, 26, 16, M.w, 'rx="2"');
    if (f.years !== null) {                                  // void at the cathode, hillock at the anode
      g += `<ellipse cx="${f1(cx)}" cy="${f1(yt + 16)}" rx="${lw / 2 + 0.5}" ry="9" fill="${M.bg}"/>`;
      g += `<ellipse cx="${f1(cx + lw / 2 + 2)}" cy="${f1(yt + len - 14)}" rx="5" ry="7" fill="${M.cu}"/>`;
    }
    g += txt(cx + 22, yt + 4, 'e⁻ in', { anchor: 'start', size: 10.5, fill: M.muted }) + txt(cx, yt + len + 34, `${f0(f.L)} µm long`);
  });
  g += txt(W - 10, H - 8.5, `after 5 years at ${r.info.T} °C, ${r.info.j} MA/cm²`, { fill: M.muted, size: 11, anchor: 'end' });
  return { g, key: [[M.cu, 'copper line'], [M.w, 'via with barrier'], [M.bg, 'void']] };
}

function drawParticle(r) {
  const sc = 0.45, y0 = 60, h = 250; let g = '';
  r.features.forEach((f, i) => {
    const cx = COL * i + COL / 2, sp = r.info.space * sc, lw = r.info.line * sc;
    g += rect(cx - sp / 2 - lw, y0, lw, h, M.cu) + rect(cx + sp / 2, y0, lw, h, M.cu);
    const cy = y0 + h * (0.35 + 0.3 * ((i * 37) % 10) / 10);
    g += `<circle cx="${f1(cx + (i % 2 ? 3 : -3))}" cy="${f1(cy)}" r="${f1(f.d * sc / 2)}" fill="#cfd6e0" stroke="#59606b" stroke-width="1"/>`;
    g += txt(cx, y0 + h + 34, `particle ${f0(f.d)} nm`);
  });
  g += txt(W - 10, H - 8.5, `lines ${r.info.line} nm wide, ${r.info.space} nm apart`, { fill: M.muted, size: 11, anchor: 'end' });
  return { g, key: [[M.cu, 'metal line'], ['#cfd6e0', 'particle']] };
}

function drawFocus(r) {
  const y0 = 64, h = 240, p = r.info.pitch; let g = '';
  r.features.forEach((f, i) => {
    const x0 = COL * i + 16, cw = COL - 32, { x, I } = aerialImage(p, { defocus: f.h, npts: 160, periods: 2 });
    g += rect(x0, y0, cw, h, M.resist);
    // resist is cleared wherever the image is brighter than the threshold (positive resist)
    const sx = cw / (2 * p);
    for (let k = 0; k < x.length - 1; k++) {                 // one rectangle per cleared run, so no hairlines between samples
      if (!(I[k] > 0.3)) continue;
      let e = k; while (e < x.length - 1 && I[e] > 0.3) e++;
      g += rect(x0 + x[k] * sx, y0, (x[e] - x[k]) * sx, h, M.bg); k = e;
    }
    g += txt(x0 + cw / 2, y0 + h + 34, `${f.h > 0 ? '+' : ''}${f0(f.h)} nm high`);
  });
  g += txt(W - 10, H - 8.5, `lines at ${p} nm pitch, 193 nm light, NA 1.35`, { fill: M.muted, size: 11, anchor: 'end' });
  return { g, key: [[M.resist, 'resist left'], [M.bg, 'resist cleared']] };
}

const DRAW = { fill: drawFill, etch: drawEtch, cmp: drawCmp, release: drawRelease, em: drawEm, particle: drawParticle, focus: drawFocus };

function picture(r, reveal) {
  const { g, key } = DRAW[r.id](r, reveal);
  let over = '';
  for (let i = 0; i < 4; i++) {
    const x = COL * i, on = state.zone === i && !reveal, hit = reveal && r.defect === i;
    over += txt(x + COL / 2, 20, LETTERS[i], { size: 15, weight: 600, fill: on || hit ? M.amber : M.ink2 });
    if (on) over += rect(x + 4, 4, COL - 8, H - 8, 'none', `stroke="${M.amber}" stroke-width="2" rx="10"`);
    if (hit) over += rect(x + 4, 4, COL - 8, H - 8, 'none', `stroke="${M.bad}" stroke-width="2.5" stroke-dasharray="8 5" rx="10"`) + txt(x + COL - 12, 21, 'defect', { anchor: 'end', size: 11, fill: M.bad, weight: 600 });
    if (i) over += `<line x1="${x}" y1="34" x2="${x}" y2="${H - 10}" stroke="${M.line}"/>`;
  }
  const legend = key.map(([c, l], k) => `<rect x="${12 + k * 190}" y="${H - 18}" width="11" height="11" rx="2" fill="${c}" stroke="#3a4352"/>` + txt(28 + k * 190, H - 8.5, esc(l), { anchor: 'start', size: 11 })).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${W}" height="${H}" fill="#0f141b"/>${g}${over}${legend}</svg>`;
}

// ---------- the numbers behind each verdict ----------
function numbers(r) {
  const f = r.defect === null ? null : r.features[r.defect], i = r.info;
  switch (r.id) {
    case 'fill': return f ? `The ${f0(f.w)} nm trench closed at the mouth with a void from ${f0(f.void_z[0])} to ${f0(f.void_z[1])} nm deep; its wall coverage was ${Math.round(f.coverage * 100)} % of the top.` : `With ALD the narrow trench fills from both walls; the least-covered wall gets ${Math.round(Math.min(...r.features.map((x) => x.coverage)) * 100)} % of the top thickness and no void forms.`;
    case 'etch': return f ? `Stopped at ${f0(i.t)} s, the ${f0(f.w)} nm opening still has ${f1(f.left)} nm of film in its bottom.` : `At ${f0(i.t)} s every opening has cleared the 200 nm film; the hard mask has ${f0(r.features[0].mask_left)} nm left.`;
    case 'cmp': return f ? `The ${Math.round(f.rho * 100)} % block sits ${f0(-f.dev)} nm below the others, more than the ${f0(i.tol)} nm depth of focus; its oxide is ${f0(f.up)} nm thick over lines ${i.line} nm tall.` : `With dummy fill the blocks lie within ${f0(Math.max(...r.features.map((x) => Math.abs(x.dev))))} nm of each other, inside the ${f0(i.tol)} nm depth of focus.`;
    case 'release': return f ? `Each front travelled ${f0(i.e)} nm, so the ${f0(f.W)} nm stack keeps a ${f0(f.core)} nm core of SiGe.` : `Each front travelled ${f0(i.e)} nm: every stack is free, and each sheet edge lost ${f1(i.t - r.features[0].t_edge)} nm of its ${i.t} nm thickness.`;
    case 'em': return f ? `At ${i.j} MA/cm² the Blech length is ${f0(i.blech_um)} µm ((jL)crit ≈ ${f0(i.jl_crit)} A/cm). The ${f0(f.L)} µm line has jL = ${f0(f.jL)} A/cm and voids after about ${f1(f.years)} years.` : `At ${i.j} MA/cm² the Blech length is ${f0(i.blech_um)} µm, longer than every line: none of them can ever void.`;
    case 'particle': return f ? `The ${f0(f.d)} nm particle is wider than the ${i.space} nm space. Of all particles above ${i.d0} nm, ${Math.round(i.share * 100)} % are larger than that space.` : `With ${i.space} nm spaces no particle here bridges two lines, and only ${f1(i.share * 100)} % of all particles are big enough to.`;
    case 'focus': return f ? `The field ${f0(f.h)} nm high has image contrast ${f1(f.contrast * 100)} % (in focus: ${f1(r.features.find((x) => x.h === 0).contrast * 100)} %); the resist clears everywhere and the lines are lost. The depth of focus is ${f0(i.dof)} nm.` : `Every field sits within ±${f0(Math.max(...r.features.map((x) => Math.abs(x.h))))} nm of focus, and each prints ${f0(i.cd0)} nm spaces.`;
    default: return '';
  }
}

// ---------- rendering ----------
function causes(t) { const k = seedOf(t.id) % t.causes.length; return t.causes.slice(k).concat(t.causes.slice(0, k)); }

function render() {
  const c = cid(), t = TEXT[c], p = pick(), done = !!p, r = caseOf(c, seedOf(c), state.good && done);
  $('#dfCount').textContent = `${state.idx + 1} of ${CASES.length}`;
  $('#dfTitle').textContent = t.title;
  $('#dfMeta').innerHTML = `${esc(t.view)} · step: <a href="${t.theatre}">${esc(TEXT[c].step.replace(/_/g, ' '))}</a>`;
  $('#dfShows').textContent = t.shows;
  const zone = done ? p.zone : state.zone, cause = done ? p.cause : state.cause;
  if (done) state.zone = p.zone;
  $('#dfView').innerHTML = picture(r, done);
  $('#dfView').setAttribute('aria-label', `${t.view} of four ${t.noun.toLowerCase()}s, A to D. ${done ? (r.defect === null ? 'With the fix applied, none of them is defective.' : `The defect is ${t.noun.toLowerCase()} ${LETTERS[r.defect]}.`) : 'Choose the one with the defect.'}`);
  const zb = $('#dfZones');
  zb.innerHTML = LETTERS.map((l, i) => `<button type="button" data-z="${i}" aria-pressed="${zone === i}" ${done ? 'disabled' : ''}>${t.noun} ${l}</button>`).join('');
  $('#dfCauses').innerHTML = causes(t).map((o) => `<button type="button" class="df-cause" data-c="${o.id}" aria-pressed="${cause === o.id}" ${done ? 'disabled' : ''}>${esc(o.text)}${done ? (o.id === t.answer ? ' <b class="df-ok">✓ cause</b>' : o.id === p.cause ? ' <b class="df-no">✗</b>' : '') : ''}</button>`).join('');
  $('#dfCheck').disabled = done || zone === null || cause === null;
  $('#dfCheck').hidden = done;
  $('#dfAfter').hidden = !done;
  if (done) {
    const truth = caseOf(c, seedOf(c), false);
    const placeOk = p.zone === truth.defect, causeOk = p.cause === t.answer;
    $('#dfVerdict').innerHTML = `<b>${p.pts} of 2.</b> ${placeOk ? `You found it: ${t.noun.toLowerCase()} ${LETTERS[truth.defect]}.` : `The defect was ${t.noun.toLowerCase()} ${LETTERS[truth.defect]}, not ${LETTERS[p.zone]}.`} ${causeOk ? 'And you named the cause.' : 'The cause is ticked above.'}`;
    $('#dfNumbers').textContent = numbers(r);
    $('#dfWhy').textContent = t.why;
    $('#dfEng').textContent = t.engineer;
    $('#dfFind').textContent = t.find;
    $('#dfFix').textContent = t.fix;
    $('#dfRefs').innerHTML = refLinks(t.refs);
    $('#dfGood').textContent = state.good ? 'Show the defect again' : `Apply the fix: ${t.good}`;
    $('#dfGood').setAttribute('aria-pressed', String(state.good));
  }
  // scoreboard
  const total = CASES.reduce((s, k) => s + (state.picks[k] ? state.picks[k].pts : 0), 0), n = CASES.filter((k) => state.picks[k]).length;
  $('#dfScore').innerHTML = `<b>${total}</b> of ${2 * CASES.length} points · ${n} of ${CASES.length} checked`;
  $('#dfList').innerHTML = CASES.map((k, i) => {
    const q = state.picks[k], mark = q ? '●'.repeat(q.pts) + '○'.repeat(2 - q.pts) : '';
    return `<li><button type="button" data-i="${i}" ${i === state.idx ? 'aria-current="step"' : ''}><span>${esc(TEXT[k].title)}</span><span class="df-pts" aria-label="${q ? `${q.pts} of 2 points` : 'not tried'}">${mark}</span></button></li>`;
  }).join('');
  $('#dfPrev').disabled = state.idx === 0;
  $('#dfNext').textContent = state.idx === CASES.length - 1 ? 'Back to the first' : 'Next defect';
}

function go(i) { state.idx = (i + CASES.length) % CASES.length; state.zone = null; state.cause = null; state.good = false; render(); }

export function init() {
  const q = new URLSearchParams(location.search);
  if (+q.get('seed') > 0) state.seed = +q.get('seed');
  store.set('df:seed', state.seed);
  $('#dfZones').addEventListener('click', (e) => { const b = e.target.closest('button[data-z]'); if (!b || pick()) return; state.zone = +b.dataset.z; render(); });
  $('#dfCauses').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (!b || pick()) return; state.cause = b.dataset.c; render(); });
  $('#dfView').addEventListener('click', (e) => {
    if (pick()) return;
    const svg = $('#dfView svg'); if (!svg) return;
    const rc = svg.getBoundingClientRect();
    state.zone = Math.max(0, Math.min(3, Math.floor((e.clientX - rc.left) / rc.width * 4))); render();
  });
  $('#dfCheck').addEventListener('click', () => {
    const c = cid(), r = caseOf(c, seedOf(c), false);
    state.picks[c] = { zone: state.zone, cause: state.cause, pts: grade(r, state.zone, state.cause, TEXT[c].answer) };
    store.set('df:picks', state.picks); render();
    $('#dfVerdict').focus();
  });
  $('#dfGood').addEventListener('click', () => { state.good = !state.good; render(); });
  $('#dfPrev').addEventListener('click', () => go(state.idx - 1));
  $('#dfNext').addEventListener('click', () => go(state.idx + 1));
  $('#dfList').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
  $('#dfReset').addEventListener('click', () => { state.picks = {}; state.seed = newSeed(); store.set('df:picks', {}); store.set('df:seed', state.seed); go(0); });
  // ?defect=<id> opens a case; &zone=<0-3>&cause=<id> answers it (screenshots); &good=1 applies the fix
  const d = q.get('defect');
  if (CASES.includes(d)) {
    state.idx = CASES.indexOf(d);
    if (q.has('zone') && q.has('cause')) {
      const r = caseOf(d, seedOf(d), false), z = q.get('zone') === 'right' ? r.defect : +q.get('zone');
      state.picks[d] = { zone: z, cause: q.get('cause'), pts: grade(r, z, q.get('cause'), TEXT[d].answer) };
      state.good = q.get('good') === '1';
    }
  }
  render();
}

