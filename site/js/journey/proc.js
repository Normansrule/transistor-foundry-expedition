// Process theatres for oxidation, implant, diffusion, etch, deposition and CMP. Each theatre is one entry in
// data/theatres.json (stages at three depths, tools, timeline, metrology, failure demos) plus an adapter
// below that runs the matching model in site/js/physics and draws the cross-section from its output, so
// every shape on screen is computed. The scrubber walks through the stages; the model's clock runs during
// the stages where the process actually happens.
import { THEATRES, REFS, PHOTOS } from './data.js';
import * as OX from '../physics/oxidation.js';
import * as IM from '../physics/implant.js';
import * as ET from '../physics/etch.js';
import * as DP from '../physics/deposition.js';
import * as CM from '../physics/cmp.js';
import * as DF from '../physics/diffusion.js';
import * as CZ from '../physics/czochralski.js';
import * as AL from '../physics/anneal.js';
import * as DM from '../physics/damascene.js';
import * as PB from '../physics/probe.js';
import * as RL from '../physics/release.js';
import * as PL from '../physics/planar.js';
import * as CL from '../physics/cleaning.js';
import { esc, store, reduceMotion } from './util.js';

const $ = (s) => document.querySelector(s);
const MONO = 'font-family="IBM Plex Mono, monospace"';
// §9.3 material colours (sim/transistor_sim/crosssection.py)
const M = { si: '#4b596d', ox: '#8fcfd4', nit: '#c9b26b', poly: '#c95c50', resist: '#e07fb0', metal: '#e2b650', cu: '#d9825b', w: '#b9c3cd', hk: '#9a80dc',
  n: '#3f7fe0', p: '#e07f3f', bg: '#0c1016', ink: '#e8ecf1', ink2: '#aab3c0', muted: '#8a94a3', amber: '#f2b84b', line: '#232a34', plasma: '#b58fd6', ok: '#5fd896', warn: '#f0a26b' };
const W = 680, H = 420;
const IDS = ['czochralski', 'cleaning', 'oxidation', 'implant', 'diffusion', 'anneal', 'etch', 'deposition', 'cmp', 'release', 'damascene', 'probe', 'planar'];
const TH = Object.fromEntries(THEATRES.filter((t) => IDS.includes(t.id)).map((t) => [t.id, t]));
const AREA_NO = { czochralski: 1, cleaning: 2, oxidation: 3, implant: 6, diffusion: 6, anneal: 6, etch: 5, deposition: 7, cmp: 8, release: 9, damascene: 10, probe: 11, planar: 13 };

const smooth = (a) => a * a * (3 - 2 * a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const f0 = (x) => x.toFixed(0), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
const sci = (x) => { if (!isFinite(x)) return '∞'; const e = Math.floor(Math.log10(x)); const m = x / 10 ** e; return `${m.toFixed(1)}×10${String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c] || (c === '-' ? '⁻' : c)).join('')}`; };
const txt = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1((o.size || 12) * 1.12)}" ${MONO} fill="${o.fill || M.ink2}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}>${s}</text>`;
const rect = (x, y, w, h, fill, o = '') => (w > 0 && h > 0 ? `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" ${o}/>` : '');
const poly = (pts, fill, o = '') => `<polygon points="${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}" fill="${fill}" ${o}/>`;
const line = (x1, y1, x2, y2, stroke, o = '') => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" ${o}/>`;
const path = (pts, stroke, o = '') => `<path d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join(' ')}" fill="none" stroke="${stroke}" ${o}/>`;
const legend = (items, x, y) => items.map(([c, t], i) => `<g transform="translate(${x + (i % 3) * 210} ${y + Math.floor(i / 3) * 16})"><rect width="10" height="10" fill="${c}"/>${txt(15, 9, t, { size: 11, fill: M.ink })}</g>`).join('');
// a fixed field of uniform numbers, so particles sit still when nothing changes
const RND = (() => { let a = 20261107; return Array.from({ length: 4096 }, () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }); })();

/** A small x–y plot inside the cross-section. series: [{pts, stroke, dash}], marks: [[x, y, label]] */
function plot(x0, y0, w, h, xr, yr, series, o = {}) {
  const X = (v) => x0 + (o.xlog ? (Math.log10(v) - Math.log10(xr[0])) / (Math.log10(xr[1]) - Math.log10(xr[0])) : (v - xr[0]) / (xr[1] - xr[0])) * w;
  const Y = (v) => y0 + h - (o.ylog ? (Math.log10(Math.max(v, yr[0])) - Math.log10(yr[0])) / (Math.log10(yr[1]) - Math.log10(yr[0])) : (v - yr[0]) / (yr[1] - yr[0])) * h;
  let s = rect(x0, y0, w, h, '#0f141b', `stroke="${M.line}"`);
  series.forEach((sr) => { const pts = sr.pts.filter(([a, b]) => isFinite(a) && isFinite(b) && b <= yr[1] * 1.0001).map(([a, b]) => [X(a), clamp(Y(b), y0, y0 + h)]); if (pts.length > 1) s += path(pts, sr.stroke, `stroke-width="${sr.width || 2}"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ''}`); });
  (o.marks || []).forEach(([a, b, lab, c]) => { const px = X(a), py = clamp(Y(b), y0, y0 + h); s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="4" fill="${c || M.amber}"/>` + (lab ? txt(px + 7, py - 6, lab, { size: 10.5, fill: c || M.amber }) : ''); });
  if (o.vline != null) s += line(X(o.vline), y0, X(o.vline), y0 + h, M.amber, 'stroke-dasharray="3 3"');
  s += txt(x0, y0 - 6, o.title || '', { size: 10.5, fill: M.muted }) + txt(x0 + w, y0 + h + 13, o.xlab || '', { size: 10, fill: M.muted, anchor: 'end' });
  return s;
}

// ======================= cleaning (conceptual chemistry, safety tier 3) =======================
const cleaning = {
  controls: [
    { id: 'N0', label: 'Particles arriving (per wafer)', type: 'log', min: 100, max: 50000, fmt: (v) => f0(v) },
    { id: 'eta', label: 'Particles removed per pass', type: 'range', min: 0.5, max: 0.99, step: 0.01, fmt: (v) => `${f0(v * 100)} %` },
    { id: 'passes', label: 'Particle-clean passes', type: 'seg', options: [['0', 'None'], ['1', 'One'], ['2', 'Two']] },
    { id: 'dk', label: 'Killer particle size', type: 'log', min: 50, max: 500, fmt: (v) => `${f0(v)} nm` },
    { id: 'Nfe', label: 'Iron left in the bulk', type: 'log', min: 1e9, max: 1e13, fmt: (v) => `${v.toExponential(0).replace('e+', ' × 10^')} cm⁻³` },
  ],
  defaults: { N0: 2000, eta: 0.9, passes: '1', dk: 100, Nfe: 1e10 },
  eq: ['N = N_0\\,(1-\\eta)^n, \\qquad f_{kill} = (d_0/d_k)^2', '\\tau = \\frac{1}{\\sigma_n v_{th} N_{Fe}}, \\qquad L = \\sqrt{D\\tau}'],
  model: 'cleaning.py',
  sim(s) { return CL.run(s.N0, s.eta, +s.passes, s.dk, s.Nfe); },
  draw(s, r, st, p) {
    const R = 140, cx = 180, cy = 205;
    let g = rect(0, 0, W, H, M.bg) + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1b2330" stroke="${M.line}"/>`;
    // particles: before the particle clean all arrive; during it the count falls pass by pass
    const nNow = st < 3 ? s.N0 : st === 3 ? s.N0 * (1 - s.eta) ** (+s.passes * p) : r.left;
    const each = Math.max(1, s.N0 / 500), nDraw = Math.round(nNow / each);
    if (st <= 1) g += `<circle cx="${cx}" cy="${cy}" r="${f1(R - 3)}" fill="${M.ox}" fill-opacity=".18"/>`;   // native / chemical oxide
    if (st === 0) for (let q = 0; q < 7; q++) g += `<ellipse cx="${f1(cx - 90 + RND[q * 3] * 180)}" cy="${f1(cy - 90 + RND[q * 3 + 1] * 180)}" rx="${f1(14 + RND[q * 3 + 2] * 18)}" ry="9" fill="#c9b26b" fill-opacity=".25"/>`;
    if (st === 1) for (let q = 0; q < 7; q++) g += `<ellipse cx="${f1(cx - 90 + RND[q * 3] * 180)}" cy="${f1(cy - 90 + RND[q * 3 + 1] * 180)}" rx="${f1((14 + RND[q * 3 + 2] * 18) * (1 - p))}" ry="${f1(9 * (1 - p))}" fill="#c9b26b" fill-opacity=".25"/>`;
    for (let i = 0; i < nDraw; i++) {
      const a = RND[(i * 3) % 4096] * 2 * Math.PI, rr = Math.sqrt(RND[(i * 3 + 1) % 4096]) * (R - 6), killer = RND[(i * 3 + 2) % 4096] < r.f_kill;
      g += `<circle cx="${f1(cx + rr * Math.cos(a))}" cy="${f1(cy + rr * Math.sin(a))}" r="${killer ? 2.6 : 1.3}" fill="${killer ? M.warn : M.ink2}"/>`;
    }
    // metal ions: removed in the metal clean, down to what the bulk keeps
    const metalsBefore = 40, metalsAfter = Math.round(Math.max(0, Math.min(40, 8 * (Math.log10(s.Nfe) - 8)))), mNow = st < 4 ? metalsBefore : st === 4 ? Math.round(metalsBefore + (metalsAfter - metalsBefore) * p) : metalsAfter;
    for (let i = 0; i < mNow; i++) { const a = RND[(i * 5 + 2000) % 4096] * 2 * Math.PI, rr = Math.sqrt(RND[(i * 5 + 2001) % 4096]) * (R - 8), x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); g += line(x - 3, y - 3, x + 3, y + 3, M.hk, 'stroke-width="1.6"') + line(x - 3, y + 3, x + 3, y - 3, M.hk, 'stroke-width="1.6"'); }
    if (st === 5) g += line(cx - R, cy - R + 2 * R * p, cx + R, cy - R + 2 * R * p, M.amber, 'stroke-width="1.5" stroke-dasharray="4 3"');
    g += txt(20, 30, ['arriving: organics, oxide, particles and metal traces', 'organic films removed', 'surface oxide removed', 'particles lifted off, pass by pass', 'metal ions removed', 'rinsed, dried and inspected'][st], { size: 11, fill: st >= 1 && st <= 4 ? M.amber : M.muted });
    g += txt(20, 48, `${f0(nNow)} particles ≥ ${CL.D_INSPECT} nm · one dot ≈ ${f0(each)} · metals drawn, not counted`, { size: 10, fill: M.muted });
    // die yield against particles left
    const xs = Array.from({ length: 60 }, (_, i) => 10 * (1e5 / 10) ** (i / 59));
    const yOf = (n) => (1 + 100 / 100 * n * r.f_kill / CL.WAFER_CM2 / 3) ** -3;
    g += plot(380, 70, 270, 230, [10, 1e5], [0, 1.05], [{ pts: xs.map((n) => [n, yOf(n)]), stroke: M.ok, width: 2.4 }, { pts: xs.map((n) => [n, 0.9]), stroke: M.muted, dash: '2 4', width: 1.2 }],
      { xlog: true, title: 'die yield from particles alone (1 cm² die)', xlab: 'particles left on the wafer →', marks: [[Math.max(10, r.left), r.Y, `${f0(r.Y * 100)} %`]] });
    g += txt(382, 334, `${f0(r.killers)} killers ≥ ${f0(s.dk)} nm → D₀ + ${f2(r.D_add)} cm⁻²`, { size: 10, fill: M.muted }) + txt(382, 349, `iron: lifetime ${r.tau_us < 10 ? f1(r.tau_us) : f0(r.tau_us)} µs, L ${f0(r.L_um)} µm`, { size: 10, fill: r.tau_us < 100 ? M.warn : M.muted });
    g += legend([[M.ink2, 'particle'], [M.warn, 'killer particle'], [M.hk, 'metal ion']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Particles left', f0(r.left)], ['Killer particles', f0(r.killers)], ['Defect density added', `${f2(r.D_add)} cm⁻²`],
      ['Die yield (particles alone)', `${f0(r.Y * 100)} %`, r.Y < 0.9 ? 'warn' : ''], ['Electron lifetime', `${r.tau_us < 10 ? f1(r.tau_us) : f0(r.tau_us)} µs`, r.tau_us < 100 ? 'warn' : ''], ['Diffusion length', `${f0(r.L_um)} µm`]];
  },
  verdict(s, r) { return r.Y >= 0.9 && r.tau_us >= 100 ? ['Clean enough to build on', true] : r.Y < 0.9 ? ['Particles will kill dies', false] : ['Iron will spoil the lifetime', false]; },
};

// ======================= oxidation =======================
const oxidation = {
  controls: [
    { id: 'amb', label: 'Ambient', type: 'seg', options: [['dry', 'Dry O₂'], ['wet', 'Steam']] },
    { id: 'T', label: 'Temperature', type: 'range', min: 800, max: 1200, step: 10, fmt: (v) => `${v} °C` },
    { id: 't', label: 'Time', type: 'log', min: 0.05, max: 10, fmt: (v) => (v < 1 ? `${f0(v * 60)} min` : `${f1(v)} h`) },
    { id: 'orient', label: 'Wafer orientation', type: 'seg', options: [['100', '(100)'], ['111', '(111)']] },
  ],
  defaults: { amb: 'dry', T: 1000, t: 1.0, orient: '100' },
  eq: ['x^2 + A\\,x = B\\,(t + \\tau)', 'B = C_1 e^{-E_1/kT}, \\qquad B/A = C_2 e^{-E_2/kT}'],
  model: 'oxidation.py',
  sim(s) {
    const x = OX.thickness(s.amb, s.T, s.t, s.orient), [B, BA] = OX.rateConstants(s.amb, s.T, s.orient);
    return { x, B, BA, rate: OX.growthRate(s.amb, s.T, x, s.orient), reg: OX.regime(s.amb, s.T, x, s.orient) };
  },
  clock(st, p) { return st < 2 ? 0 : st === 2 ? p : 1; },
  draw(s, r, st, p) {
    const k = this.clock(st, p), tNow = Math.max(1e-4, k * s.t), xi = OX.AMBIENTS[s.amb].xi;
    const x = st < 2 ? 0 : st === 2 && k < 0.002 ? xi : OX.thickness(s.amb, s.T, tNow, s.orient);
    const xmax = Math.max(r.x, 0.02), sc = 150 / xmax, y0 = 190, x0 = 30, ww = 290;
    let g = rect(0, 0, W, H, M.bg);
    // furnace status band
    const gasOn = st === 2, gas = st === 2 ? (s.amb === 'dry' ? 'O₂ flowing' : 'H₂O (steam) flowing') : st === 1 || st === 3 ? 'N₂ (inert) · ramp / anneal' : 'N₂ (inert) · boat in tube';
    g += rect(x0, 26, ww, 22, gasOn ? 'rgba(143,207,212,.16)' : 'rgba(138,148,163,.10)', `rx="6"`) + txt(x0 + 10, 41, `${gas} · ${st >= 1 && st <= 3 ? s.T + ' °C' : 'cool'}`, { size: 11, fill: gasOn ? M.ox : M.muted });
    // silicon, oxide, original surface
    const top = y0 - (1 - OX.SI_CONSUMED) * x * sc, bot = y0 + OX.SI_CONSUMED * x * sc;
    g += rect(x0, bot, ww, H - 60 - bot, M.si) + rect(x0, top, ww, bot - top, M.ox);
    g += line(x0 - 6, y0, x0 + ww + 6, y0, '#ffffff', 'stroke-dasharray="5 4" stroke-opacity=".7"') + txt(x0 + 8, y0 - 6, 'original silicon surface', { size: 10, fill: '#0c1016' });
    if (x > 0) {
      g += line(x0 + ww - 24, top, x0 + ww - 24, bot, '#0c1016', 'stroke-width="1.5"') + txt(x0 + ww - 30, top + 18, `${f0(x * 1000)} nm oxide`, { size: 12, fill: '#0c1016', anchor: 'end', weight: 600 });
      g += txt(x0 + 8, bot + 16, `${f0(OX.SI_CONSUMED * x * 1000)} nm of silicon consumed`, { size: 10.5, fill: M.ink });
      if (gasOn) for (let i = 0; i < 26; i++) {           // oxidant diffusing to the interface
        const u = RND[i * 7], v = (RND[i * 7 + 1] + p * 3) % 1;
        g += `<circle cx="${f1(x0 + 8 + u * (ww - 16))}" cy="${f1(top - 20 + v * (bot - top + 20))}" r="2.2" fill="${s.amb === 'dry' ? '#ff8a6b' : '#9fc6ff'}" opacity=".85"/>`;
      }
    }
    g += txt(x0, H - 66, `scale: ${f0(xmax * 1000)} nm = 150 px`, { size: 10, fill: M.muted });
    // growth curve with the linear and parabolic limits
    const n = 80, ts = Array.from({ length: n }, (_, i) => s.t * (i + 1) / n);
    const xs = ts.map((t) => [t, OX.thickness(s.amb, s.T, t, s.orient) * 1000]), A = r.B / r.BA;
    const lin = ts.map((t) => [t, r.BA * t * 1000]), par = ts.map((t) => [t, Math.sqrt(r.B * t) * 1000]);
    g += plot(370, 70, 280, 230, [0, s.t], [0, r.x * 1000 * 1.15], [{ pts: lin, stroke: M.muted, dash: '4 4', width: 1.4 }, { pts: par, stroke: M.ink2, dash: '1 4', width: 1.4 }, { pts: xs, stroke: M.ox, width: 2.4 }],
      { title: 'thickness (nm) against time', xlab: 'time →', marks: st >= 2 ? [[tNow, x * 1000, `${f0(x * 1000)} nm`]] : [] });
    g += txt(372, 322, 'dashed: linear limit (B/A)·t', { size: 10, fill: M.muted }) + txt(372, 337, `dotted: parabolic limit √(Bt) · A = ${f0(A * 1000)} nm`, { size: 10, fill: M.muted });
    g += legend([[M.si, 'silicon'], [M.ox, 'silicon dioxide'], [s.amb === 'dry' ? '#ff8a6b' : '#9fc6ff', s.amb === 'dry' ? 'O₂ molecules' : 'H₂O molecules']], 30, H - 40);
    return g;
  },
  read(s, r) {
    return [['Oxide thickness', `${f0(r.x * 1000)} nm`], ['Silicon consumed', `${f0(OX.SI_CONSUMED * r.x * 1000)} nm`], ['B (parabolic)', `${r.B.toPrecision(2)} µm²/h`], ['B/A (linear)', `${r.BA.toPrecision(2)} µm/h`],
      ['Growth now', `${f1(r.rate * 1000 / 60)} nm/min`], ['Regime', r.reg < 0.5 ? 'reaction-limited' : 'diffusion-limited', r.reg < 0.5 ? '' : 'warn']];
  },
  verdict(s, r) { const nm = r.x * 1000; return nm < 15 ? ['Gate-oxide class', true] : nm < 120 ? ['Thin liner or screen', true] : nm < 400 ? ['Masking oxide', true] : ['Field oxide', true]; },
};

// ======================= implant =======================
const NBG = 1e16;
const implant = {
  controls: [
    { id: 'ion', label: 'Ion', type: 'seg', options: [['B', 'Boron'], ['P', 'Phosphorus'], ['As', 'Arsenic']] },
    { id: 'E', label: 'Energy', type: 'log', min: 1, max: 200, fmt: (v) => `${v < 10 ? f1(v) : f0(v)} keV` },
    { id: 'dose', label: 'Dose', type: 'log', min: 1e12, max: 1e16, fmt: (v) => `${sci(v)} cm⁻²` },
    { id: 'anneal', label: 'Anneal temperature', type: 'range', min: 800, max: 1100, step: 10, fmt: (v) => `${v} °C` },
    { id: 't', label: 'Anneal time', type: 'log', min: 1, max: 600, fmt: (v) => `${v < 10 ? f1(v) : f0(v)} s` },
  ],
  defaults: { ion: 'B', E: 20, dose: 1e15, anneal: 1000, t: 10 },
  eq: ['N(x) = \\frac{\\Phi}{\\sqrt{2\\pi}\\,\\sigma}\\, e^{-(x-R_p)^2/2\\sigma^2}', '\\sigma^2 = \\Delta R_p^2 + 2Dt, \\qquad D = D_0\\, e^{-E_a/kT}'],
  model: 'implant.py',
  sim(s) {
    const r0 = IM.rangeStats(s.ion, s.E), j0 = IM.junction(s.ion, s.E, s.dose, NBG), j = IM.junction(s.ion, s.E, s.dose, NBG, s.anneal, s.t);
    return { Rp: r0.Rp, dRp: r0.dRp, j0, j, type: IM.IONS[s.ion].type };
  },
  draw(s, r, st, p) {
    const doseK = st < 1 ? 0 : st === 1 ? p : 1, ann = st < 3 ? 0 : st === 3 ? p : 1;
    const sig = Math.sqrt(r.dRp ** 2 + ann * (r.j.sigma_nm ** 2 - r.dRp ** 2));
    const depthMax = Math.max(r.j0.xj, r.j.xj, r.Rp + 4 * r.dRp) * 1.25, sc = 260 / depthMax, ys = 92, x0 = 20, ww = 320;
    const N = (x) => doseK * IM.profileAt(x, s.dose, r.Rp, sig);
    let g = rect(0, 0, W, H, M.bg);
    g += rect(x0, ys, ww, 270, M.si);
    // dopant: rows coloured by log concentration, faded sideways past the mask edge (lateral straggle)
    const win = [x0 + 80, x0 + ww - 80], col = r.type === 'n' ? M.n : M.p;
    for (let k = 0; k < 64; k++) {
      const z = (k + 0.5) / 64 * depthMax, n = N(z); if (n < 1e15) continue;
      const a = clamp((Math.log10(n) - 15) / 6, 0.05, 1), lat = Math.min(60, sig * sc * 1.2), yy = ys + z * sc - 0.5 * depthMax / 64 * sc;
      g += rect(win[0], yy, win[1] - win[0], depthMax / 64 * sc + 0.6, col, `fill-opacity="${f2(a)}"`);
      for (let q = 0; q < 4; q++) { const fade = a * (1 - (q + 0.5) / 4); g += rect(win[0] - lat * (q + 1) / 4, yy, lat / 4, depthMax / 64 * sc + 0.6, col, `fill-opacity="${f2(fade)}"`) + rect(win[1] + lat * q / 4, yy, lat / 4, depthMax / 64 * sc + 0.6, col, `fill-opacity="${f2(fade)}"`); }
    }
    if (st === 2) for (let i = 0; i < 70; i++) {                    // displaced lattice atoms around the range
      const z = r.Rp + (RND[i * 3] - 0.5) * 4 * r.dRp, n = N(Math.max(0, z)); if (n <= 0 || z < 0) continue;
      g += `<circle cx="${f1(win[0] + RND[i * 3 + 1] * (win[1] - win[0]))}" cy="${f1(ys + z * sc)}" r="${f1(1.4 + RND[i * 3 + 2] * 1.6)}" fill="#ffffff" opacity="${f2(0.35 + 0.5 * p)}"/>`;
    }
    // resist mask over both sides (removed after implant)
    if (st <= 2) g += rect(x0, ys - 34, win[0] - x0, 34, M.resist) + rect(win[1], ys - 34, x0 + ww - win[1], 34, M.resist);
    if (st === 1) for (let i = 0; i < 18; i++) {                     // incoming ions
      const xx = x0 + 10 + RND[i * 5] * (ww - 20), yy = 10 + ((RND[i * 5 + 1] + p * 2.5) % 1) * (ys - 10);
      g += line(xx, yy - 12, xx, yy, col, 'stroke-width="2" stroke-linecap="round"');
    }
    const xjNow = st < 1 ? 0 : (st >= 3 ? r.j0.xj + ann * (r.j.xj - r.j0.xj) : r.j0.xj);
    if (st >= 1 && xjNow > 0) g += line(x0, ys + xjNow * sc, x0 + ww, ys + xjNow * sc, M.amber, 'stroke-dasharray="6 4" stroke-width="1.5"') + txt(x0 + ww - 4, ys + xjNow * sc - 5, `junction ${f0(xjNow)} nm`, { size: 11, fill: M.amber, anchor: 'end' });
    g += txt(x0, ys + 286, `depth scale: ${f0(depthMax)} nm = 260 px`, { size: 10, fill: M.muted });
    if (st === 4) g += [0, 1, 2, 3].map((i) => line(win[0] + 30 + i * 36, ys - 30, win[0] + 30 + i * 36, ys, M.w, 'stroke-width="3"')).join('') + txt(win[0] + 30, ys - 36, 'four-point probe', { size: 10.5, fill: M.ink });
    // profile plot
    const xs = Array.from({ length: 160 }, (_, i) => depthMax * i / 159);
    const as = xs.map((x) => [x, Math.max(1e14, doseK * IM.profileAt(x, s.dose, r.Rp, r.dRp))]);
    const an = xs.map((x) => [x, Math.max(1e14, N(x))]);
    g += plot(380, 70, 270, 230, [0, depthMax], [1e14, 1e22], [{ pts: xs.map((x) => [x, NBG]), stroke: M.muted, dash: '2 4', width: 1.2 }, { pts: as, stroke: M.ink2, dash: '5 4', width: 1.4 }, { pts: an, stroke: col, width: 2.4 }],
      { ylog: true, title: 'N (cm⁻³), log scale, against depth', xlab: 'depth →', marks: st >= 1 ? [[xjNow, NBG, `xⱼ ${f0(xjNow)} nm`]] : [] });
    g += txt(382, 322, 'dashed: as implanted', { size: 10, fill: M.muted }) + txt(382, 337, `dotted: substrate doping ${sci(NBG)} cm⁻³`, { size: 10, fill: M.muted });
    g += legend([[M.si, 'silicon'], [col, `${IM.IONS[s.ion].name} (${r.type}-type)`], [M.resist, 'resist mask']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Projected range Rp', `${f0(r.Rp)} nm`], ['Straggle ΔRp', `${f0(r.dRp)} nm`], ['Peak after anneal', `${sci(r.j.peak)} cm⁻³`], ['Junction depth', `${f0(r.j.xj)} nm`, r.j.xj > 150 ? 'warn' : ''],
      ['Diffusion √(2Dt)', `${f1(Math.sqrt(Math.max(0, r.j.sigma_nm ** 2 - r.dRp ** 2)))} nm`], ['Sheet resistance', `${isFinite(r.j.Rs) ? f0(r.j.Rs) : '∞'} Ω/□`]];
  },
  verdict(s, r) { return r.j.xj < 40 ? ['Ultra-shallow junction', true] : r.j.xj < 150 ? ['Source/drain class', true] : ['Deep well', true]; },
};

// ======================= diffusion =======================
const SOURCE = '#d9a35f';
const diffusion = {
  controls: [
    { id: 'ion', label: 'Dopant', type: 'seg', options: [['P', 'Phosphorus'], ['B', 'Boron']] },
    { id: 'Cs', label: 'Surface concentration', type: 'log', min: 1e19, max: 1e21, fmt: (v) => `${sci(v)} cm⁻³` },
    { id: 'T1', label: 'Predeposition temperature', type: 'range', min: 900, max: 1150, step: 10, fmt: (v) => `${v} °C` },
    { id: 't1', label: 'Predeposition time', type: 'log', min: 60, max: 3600, fmt: (v) => `${f0(v / 60)} min` },
    { id: 'T2', label: 'Drive-in temperature', type: 'range', min: 900, max: 1150, step: 10, fmt: (v) => `${v} °C` },
    { id: 't2', label: 'Drive-in time', type: 'log', min: 60, max: 7200, fmt: (v) => `${f0(v / 60)} min` },
    { id: 'Nbg', label: 'Substrate doping', type: 'log', min: 1e15, max: 1e17, fmt: (v) => `${sci(v)} cm⁻³` },
  ],
  defaults: { ion: 'P', Cs: 3e20, T1: 1050, t1: 600, T2: 1050, t2: 2220, Nbg: 1.66e16 },
  eq: ['N(x) = C_s\\,\\mathrm{erfc}\\!\\left(\\frac{x}{2\\sqrt{D_1t_1}}\\right), \\qquad Q = 2C_s\\sqrt{\\frac{D_1t_1}{\\pi}}', 'N(x) = \\frac{Q}{\\sqrt{\\pi Dt}}\\,e^{-x^2/4Dt}, \\qquad Dt = D_1t_1 + D_2t_2'],
  model: 'diffusion.py',
  sim(s) { return DF.run(s.ion, s.Cs, s.T1, s.t1, s.T2, s.t2, s.Nbg); },
  draw(s, r, st, p) {
    const pre = st < 2 ? 0 : st === 2 ? p : 1, drv = st < 4 ? 0 : st === 4 ? p : 1;
    const DtNow = r.Dt1 * Math.max(pre, 1e-3) + (r.Dt - r.Dt1) * drv, dose = r.dose * Math.sqrt(Math.max(pre, 1e-3));
    const N = (x) => (st < 2 ? 0 : st <= 3 ? DF.erfcProfile(x, s.Cs, r.Dt1 * Math.max(pre, 1e-3)) : DF.gaussProfile(x, r.dose, DtNow));
    const N0 = st <= 3 ? s.Cs : r.dose / Math.sqrt(Math.PI * DtNow);
    const xjNow = st < 2 ? 0 : st <= 3 ? (() => { let lo = 0, hi = 2e4; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (N(m) > s.Nbg) lo = m; else hi = m; } return lo; })()
      : N0 > s.Nbg ? 2 * Math.sqrt(DtNow * Math.log(N0 / s.Nbg)) * 1e7 : 0;
    const depthMax = Math.max(r.xj, r.xj_pre) * 1.4, sc = 250 / depthMax, ys = 100, x0 = 20, ww = 320;
    const win = [x0 + 120, x0 + ww - 120], col = IM.IONS[s.ion].type === 'n' ? M.n : M.p;
    let g = rect(0, 0, W, H, M.bg) + rect(x0, ys, ww, 260, M.si);
    if (xjNow > 0) {                                                   // doped region: rows by log concentration, rounded under the mask edge
      for (let k = 0; k < 56; k++) {
        const z = (k + 0.5) / 56 * depthMax, n = N(z); if (n <= s.Nbg) continue;
        const a = clamp((Math.log10(n) - Math.log10(s.Nbg)) / (Math.log10(Math.max(N0, s.Nbg * 10)) - Math.log10(s.Nbg)), 0.08, 1);
        const lat = 0.8 * Math.sqrt(Math.max(0, xjNow * xjNow - z * z)) * sc, hh = depthMax / 56 * sc + 0.6, yy = ys + z * sc - hh / 2;
        const l = Math.max(x0, win[0] - lat), rr = Math.min(x0 + ww, win[1] + lat);
        g += rect(l, yy, rr - l, hh, col, `fill-opacity="${f2(a * 0.9)}"`);
      }
      g += line(x0, ys + xjNow * sc, x0 + ww, ys + xjNow * sc, M.amber, 'stroke-dasharray="6 4" stroke-width="1.5"') + txt(x0 + ww - 4, ys + xjNow * sc - 5, `junction ${f0(xjNow)} nm`, { size: 11, fill: M.amber, anchor: 'end' });
    }
    // masking oxide either side of the window, and the source film while it is on
    g += rect(x0, ys - 26, win[0] - x0, 26, M.ox) + rect(win[1], ys - 26, x0 + ww - win[1], 26, M.ox);
    if (st >= 1 && st <= 2 || (st === 3 && p < 0.5)) g += rect(x0, ys - 34, ww, 8, SOURCE, `fill-opacity="${st === 3 ? f2(1 - 2 * p) : 1}"`) + rect(win[0], ys - 8, win[1] - win[0], 8, SOURCE, `fill-opacity="${st === 3 ? f2(1 - 2 * p) : 1}"`);
    if (st === 2) for (let i = 0; i < 22; i++) {                    // atoms crossing into the silicon
      const xx = win[0] + 6 + RND[i * 5] * (win[1] - win[0] - 12), yy = ys - 6 + ((RND[i * 5 + 1] + p * 2) % 1) * Math.max(10, xjNow * sc * 0.7);
      g += `<circle cx="${f1(xx)}" cy="${f1(yy)}" r="2.2" fill="${col}"/>`;
    }
    if (st === 5) g += [0, 1, 2, 3].map((i) => line(win[0] + 13 + i * 18, ys - 34, win[0] + 13 + i * 18, ys, M.w, 'stroke-width="3"')).join('') + txt(win[0] - 30, ys - 40, `four-point probe: ${f1(r.Rs)} Ω/□`, { size: 10.5, fill: M.ink });
    g += txt(x0, ys + 276, `depth scale: ${f0(depthMax)} nm = 250 px`, { size: 10, fill: M.muted }) + txt(x0, 40, st >= 2 && st !== 3 ? `${st === 2 ? 'predeposition' : 'drive-in'} at ${st === 2 ? s.T1 : s.T2} °C` : st === 3 ? 'source removed: dose now fixed' : 'masking oxide, window open', { size: 11, fill: st === 2 || st === 4 ? M.amber : M.muted });
    // profile plot
    const xs = Array.from({ length: 140 }, (_, i) => depthMax * i / 139);
    const ser = [{ pts: xs.map((x) => [x, s.Nbg]), stroke: M.muted, dash: '2 4', width: 1.2 }];
    if (st >= 2) ser.push({ pts: xs.map((x) => [x, Math.max(1e14, DF.erfcProfile(x, s.Cs, r.Dt1 * (st === 2 ? Math.max(pre, 1e-3) : 1)))]), stroke: M.ink2, dash: '5 4', width: 1.4 });
    if (st >= 4) ser.push({ pts: xs.map((x) => [x, Math.max(1e14, N(x))]), stroke: col, width: 2.4 });
    g += plot(380, 70, 270, 230, [0, depthMax], [1e14, 3e21], ser, { ylog: true, title: 'N (cm⁻³), log scale, against depth', xlab: 'depth →', marks: xjNow > 0 ? [[xjNow, s.Nbg, `xⱼ ${f0(xjNow)} nm`]] : [] });
    g += txt(382, 322, 'dashed: after predeposition (erfc)', { size: 10, fill: M.muted }) + txt(382, 337, `dotted: substrate ${sci(s.Nbg)} cm⁻³`, { size: 10, fill: M.muted });
    g += legend([[M.si, 'silicon'], [col, `${IM.IONS[s.ion].name} (${IM.IONS[s.ion].type}-type)`], [M.ox, 'masking oxide'], [SOURCE, 'dopant source film']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Dose Q', `${sci(r.dose)} cm⁻²`], ['Junction after predeposition', `${f0(r.xj_pre)} nm`], ['Junction after drive-in', `${f0(r.xj)} nm`, r.xj > 2000 ? 'warn' : ''],
      ['Surface after drive-in', `${sci(r.Cs_after)} cm⁻³`], ['Diffusion length 2√Dt', `${f0(r.L)} nm`], ['Sheet resistance', `${isFinite(r.Rs) ? f1(r.Rs) : '∞'} Ω/□`]];
  },
  verdict(s, r) { return !isFinite(r.Rs) ? ['No junction formed', false] : r.Rs < 50 ? ['Source/drain class', true] : r.Rs < 500 ? ['Resistor or base class', true] : ['Lightly doped well', true]; },
};

// ======================= czochralski =======================
const MELT = '#ffd166';
const czochralski = {
  controls: [
    { id: 'dopant', label: 'Dopant', type: 'seg', options: [['B', 'Boron'], ['P', 'Phosphorus'], ['As', 'Arsenic'], ['Sb', 'Antimony']] },
    { id: 'rho', label: 'Seed-end resistivity', type: 'log', min: 0.005, max: 100, fmt: (v) => `${v < 0.1 ? v.toFixed(3) : v < 10 ? f2(v) : f0(v)} Ω·cm` },
    { id: 'tol', label: 'Customer tolerance', type: 'range', min: 0.02, max: 0.5, step: 0.01, fmt: (v) => `±${f0(v * 100)} %` },
  ],
  defaults: { dopant: 'B', rho: 10, tol: 0.2 },
  eq: ['C_s(f) = k\\,C_0\\,(1-f)^{\\,k-1}', '\\rho = \\frac{1}{q\\,\\mu(N)\\,N}'],
  model: 'czochralski.py',
  sim(s) { return CZ.run(s.dopant, s.rho, s.tol); },
  draw(s, r, st, p) {
    const fNow = st < 3 ? 0 : st === 3 ? p * CZ.F_MAX : CZ.F_MAX, col = r.carrier === 'n' ? M.n : M.p;
    const cx = 175, cw = 220, cTop = 250, cBot = 360, x0 = cx - cw / 2;
    let g = rect(0, 0, W, H, M.bg);
    // crucible and melt: the melt level falls as the crystal grows
    const level = cTop + 10 + (cBot - cTop - 14) * fNow;
    g += rect(x0 - 8, cTop, 8, cBot - cTop + 8, '#d7dde5', 'fill-opacity=".5"') + rect(x0 + cw, cTop, 8, cBot - cTop + 8, '#d7dde5', 'fill-opacity=".5"') + rect(x0 - 8, cBot, cw + 16, 8, '#d7dde5', 'fill-opacity=".5"');
    g += rect(x0, level, cw, cBot - level, MELT, 'fill-opacity=".85"') + txt(x0 + cw - 6, cBot - 8, `melt ${f0((1 - fNow) * 100)} %`, { size: 10.5, fill: '#0c1016', anchor: 'end', weight: 600 });
    // the ingot, coloured by local doping relative to the seed end
    const top = 48, len = level - top, rad = st < 2 ? 5 : st === 2 ? 5 + p * 55 : 60;
    g += line(cx, 8, cx, top, M.w, 'stroke-width="3"');
    if (st >= 1) {
      const neck = 22, body = Math.max(0, len - neck), bands = 40;
      g += rect(cx - 4, top, 8, neck, M.si);
      for (let i = 0; i < bands; i++) {
        const y = top + neck + body * i / bands, f = fNow * i / bands, wdt = st <= 2 ? Math.min(rad, 5 + (i / bands) * rad * 2) : Math.min(rad, 5 + i * 6);
        const ratio = CZ.concentration(f, r.k, 1), a = clamp(0.5 + Math.log10(ratio) / 2, 0.5, 1), inSpec = f <= r.f_usable;
        g += rect(cx - wdt, y, 2 * wdt, body / bands + 0.6, st === 4 && !inSpec ? '#59606b' : col, `fill-opacity="${f2(a)}"`);
      }
      if (st === 4) {
        const yU = top + neck + body * Math.min(1, r.f_usable / Math.max(fNow, 1e-9));
        g += line(cx - rad - 14, yU, cx + rad + 14, yU, M.amber, 'stroke-dasharray="5 4" stroke-width="1.5"') + txt(cx + rad + 18, yU + 4, 'end of spec', { size: 10.5, fill: M.amber });
        for (let i = 1; i < 14; i++) { const y = top + neck + body * i / 14; g += line(cx - rad, y, cx + rad, y, M.bg, 'stroke-width="1"'); }
      }
    }
    if (st >= 1 && st <= 3) g += `<path d="M${cx - 18} ${top - 26} a18 8 0 1 0 36 0" fill="none" stroke="${M.ink2}" stroke-width="1.3"/>` + txt(cx + 24, top - 22, 'rotate', { size: 10, fill: M.muted });
    g += txt(20, 30, st === 0 ? 'melting the charge' : st === 3 ? `pulling: ${f0(fNow * 100)} % of the melt frozen` : st === 4 ? `usable: ${f0(r.f_usable * 100)} % of the charge` : 'growing from the seed', { size: 11, fill: st === 3 ? M.amber : M.muted });
    // resistivity along the ingot
    const pts = r.f.map((f, i) => [f, r.rho[i]]), lo = Math.min(...r.rho) * 0.6, hi = r.rho[0] * 1.8, r0 = r.rho[0];
    g += plot(380, 70, 270, 230, [0, 1], [lo, hi], [{ pts: [[0, r0 * (1 + s.tol)], [1, r0 * (1 + s.tol)]], stroke: M.muted, dash: '3 4', width: 1.2 }, { pts: [[0, r0 * (1 - s.tol)], [1, r0 * (1 - s.tol)]], stroke: M.muted, dash: '3 4', width: 1.2 }, { pts, stroke: col, width: 2.4 }],
      { ylog: true, title: 'resistivity (Ω·cm), log scale', xlab: 'fraction of melt frozen →', marks: [[r.f_usable, r.rho_at_usable, `in spec to ${f0(r.f_usable * 100)} %`]], vline: st === 3 ? fNow : null });
    g += txt(382, 334, `dashed: ±${f0(s.tol * 100)} % around the seed end`, { size: 10, fill: M.muted }) + txt(382, 349, `k = ${r.k} · tail is ${f1(r.ratio_tail)}× the seed doping`, { size: 10, fill: M.muted });
    g += legend([[col, `${IM.IONS[s.dopant].name}-doped silicon`], [MELT, 'molten silicon'], ['#59606b', 'out of specification']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Segregation coefficient k', `${r.k}`], ['Seed-end doping', `${sci(r.N_seed)} cm⁻³`], ['Melt doping to start', `${sci(r.melt0)} cm⁻³`],
      ['Tail resistivity', `${r.rho_tail < 0.1 ? r.rho_tail.toPrecision(2) : f2(r.rho_tail)} Ω·cm`], ['Usable ingot', `${f0(r.f_usable * 100)} %`, r.f_usable < 0.4 ? 'warn' : '']];
  },
  verdict(s, r) { return r.f_usable >= 0.6 ? ['Most of the ingot sells as prime', true] : r.f_usable >= 0.3 ? ['Much of the ingot is off-spec', false] : ['Most of the ingot is off-spec', false]; },
};

// ======================= anneal =======================
const ANN_E = { B: 5, As: 10 }, ANN_DOSE = 1e15, ANN_BG = 1e17;
const anneal = {
  controls: [
    { id: 'ion', label: 'Implanted dopant', type: 'seg', options: [['B', 'Boron 5 keV'], ['As', 'Arsenic 10 keV']] },
    { id: 'T', label: 'Peak temperature', type: 'range', min: 900, max: 1350, step: 10, fmt: (v) => `${v} °C` },
    { id: 'hold', label: 'Hold at peak', type: 'log', min: 0.001, max: 3600, fmt: (v) => (v < 0.01 ? 'none (spike)' : v < 60 ? `${v < 1 ? f2(v) : f1(v)} s` : `${f0(v / 60)} min`) },
    { id: 'rate', label: 'Ramp rate', type: 'log', min: 0.1, max: 1e6, fmt: (v) => `${v < 1 ? f1(v) : v < 1e4 ? f0(v) : sci(v)} °C/s` },
  ],
  defaults: { ion: 'B', T: 1050, hold: 1, rate: 150 },
  eq: ['Dt = \\int D\\big(T(t)\\big)\\,dt = 2\\int_{T_b}^{T_p}\\frac{D(T)}{R}\\,dT + D(T_p)\\,t_{hold}', '\\sigma^2 = \\Delta R_p^2 + 2Dt, \\qquad t_{eq} = Dt / D(T_p)'],
  model: 'anneal.py',
  sim(s) { return AL.run(s.ion, ANN_E[s.ion], ANN_DOSE, s.T, s.hold, s.rate, ANN_BG); },
  frac(r, st, p) {                                         // share of the thermal budget spent by this point
    const up = r.ramps / 2, Dt = r.Dt || 1e-30;
    return st < 1 ? 0 : st === 1 ? p * up / Dt : st === 2 ? (up + p * r.hold) / Dt : st === 3 ? (up + r.hold + p * up) / Dt : 1;
  },
  draw(s, r, st, p) {
    const k = this.frac(r, st, p), col = s.ion === 'B' ? M.p : M.n;
    const j = IM.junction(s.ion, ANN_E[s.ion], ANN_DOSE, ANN_BG, s.T, Math.max(k * r.t_eq, 0));
    const sig = Math.sqrt(r.sigma0 ** 2 + k * (r.sigma ** 2 - r.sigma0 ** 2));
    const depthMax = Math.max(r.xj, r.xj0) * 1.35, sc = 165 / depthMax, ys = 180, x0 = 20, ww = 320;
    let g = rect(0, 0, W, H, M.bg) + rect(x0, ys, ww, 175, M.si);
    // temperature trace: ramp, hold, ramp, drawn on a time axis that gives each part a fixed share
    const tx = (u) => x0 + u * ww, tyT = (T) => 140 - (T - AL.T_BASE) / (1350 - AL.T_BASE) * 80;
    const ph = st < 1 ? 0 : st === 1 ? p / 3 : st === 2 ? (1 + p) / 3 : st === 3 ? (2 + p) / 3 : 1;
    const tr = [[0, AL.T_BASE], [1 / 3, s.T], [2 / 3, s.T], [1, AL.T_BASE]].map(([u, T]) => [tx(u), tyT(T)]);
    g += rect(x0, 56, ww, 92, '#0f141b', `stroke="${M.line}"`) + path(tr, M.ink2, 'stroke-width="1.6"');
    if (st >= 1) { const u = ph, T = u < 1 / 3 ? AL.T_BASE + (s.T - AL.T_BASE) * u * 3 : u < 2 / 3 ? s.T : s.T - (s.T - AL.T_BASE) * (u - 2 / 3) * 3; g += `<circle cx="${f1(tx(u))}" cy="${f1(tyT(T))}" r="4.5" fill="${M.amber}"/>`; }
    g += txt(x0 + 4, 70, `peak ${s.T} °C`, { size: 10.5, fill: M.ink }) + txt(x0 + ww - 4, 70, `ramps ${f0(r.ramp_share * 100)} % of the budget`, { size: 10.5, fill: r.ramp_share > 0.5 ? M.warn : M.muted, anchor: 'end' });
    const rs = (s.T - AL.T_BASE) / s.rate, rampTxt = rs < 1 ? `${f0(rs * 1000)} ms` : rs < 100 ? `${f1(rs)} s` : rs < 7200 ? `${f0(rs / 60)} min` : `${f1(rs / 3600)} h`;
    const holdTxt = s.hold < 0.01 ? 'none (spike)' : s.hold < 60 ? `${f1(s.hold)} s` : `${f0(s.hold / 60)} min`;
    g += txt(x0 + 4, 162, `ramp ${rampTxt} each way · hold ${holdTxt}`, { size: 10, fill: M.muted });
    // doped layer and junction
    for (let q = 0; q < 50; q++) {
      const z = (q + 0.5) / 50 * depthMax, n = IM.profileAt(z, ANN_DOSE, r.Rp, sig); if (n <= ANN_BG) continue;
      const a = clamp((Math.log10(n) - 17) / 4, 0.08, 1);
      g += rect(x0 + 70, ys + z * sc - depthMax / 100 * sc, ww - 140, depthMax / 50 * sc + 0.6, col, `fill-opacity="${f2(a)}"`);
    }
    if (st <= 1) for (let q = 0; q < 50; q++) g += `<circle cx="${f1(x0 + 74 + RND[q * 3] * (ww - 148))}" cy="${f1(ys + (r.Rp + (RND[q * 3 + 1] - 0.5) * 3 * r.sigma0) * sc)}" r="1.6" fill="#ffffff" opacity="${f2(st === 0 ? 0.8 : 0.8 * (1 - p))}"/>`;
    g += line(x0, ys + j.xj * sc, x0 + ww, ys + j.xj * sc, M.amber, 'stroke-dasharray="6 4" stroke-width="1.5"') + txt(x0 + ww - 4, ys + j.xj * sc - 5, `junction ${f0(j.xj)} nm`, { size: 11, fill: M.amber, anchor: 'end' });
    if (st === 4) g += [0, 1, 2, 3].map((i) => line(x0 + 200 + i * 20, ys - 11, x0 + 200 + i * 20, ys, M.w, 'stroke-width="3"')).join('');
    g += txt(x0, ys + 189, `depth scale: ${f0(depthMax)} nm = 165 px`, { size: 10, fill: M.muted });
    // profile before and now
    const xs = Array.from({ length: 140 }, (_, i) => depthMax * i / 139);
    g += plot(380, 70, 270, 230, [0, depthMax], [1e16, 3e21], [{ pts: xs.map((x) => [x, ANN_BG]), stroke: M.muted, dash: '2 4', width: 1.2 },
      { pts: xs.map((x) => [x, Math.max(1e16, IM.profileAt(x, ANN_DOSE, r.Rp, r.sigma0))]), stroke: M.ink2, dash: '5 4', width: 1.4 }, { pts: xs.map((x) => [x, Math.max(1e16, IM.profileAt(x, ANN_DOSE, r.Rp, sig))]), stroke: col, width: 2.4 }],
      { ylog: true, title: 'N (cm⁻³), log scale, against depth', xlab: 'depth →', marks: [[j.xj, ANN_BG, `xⱼ ${f0(j.xj)} nm`]] });
    g += txt(382, 334, 'dashed: as implanted', { size: 10, fill: M.muted }) + txt(382, 349, `equivalent time at peak: ${r.t_eq < 0.1 ? r.t_eq.toPrecision(2) : r.t_eq < 100 ? f1(r.t_eq) : f0(r.t_eq)} s`, { size: 10, fill: M.muted });
    g += legend([[M.si, 'silicon'], [col, `${IM.IONS[s.ion].name} (${IM.IONS[s.ion].type}-type)`], ['#ffffff', 'implant damage']], 20, H - 40);
    return g;
  },
  read(s, r) {
    const tt = r.t_total;
    return [['Thermal budget Dt', `${sci(r.Dt)} cm²`], ['Equivalent time at peak', `${r.t_eq < 0.1 ? r.t_eq.toPrecision(2) : r.t_eq < 100 ? f1(r.t_eq) : f0(r.t_eq)} s`], ['Share from the ramps', `${f0(r.ramp_share * 100)} %`, r.ramp_share > 0.5 ? 'warn' : ''],
      ['Junction as implanted', `${f0(r.xj0)} nm`], ['Junction after anneal', `${f0(r.xj)} nm`, r.xj > 2 * r.xj0 ? 'warn' : ''], ['Total time', tt < 1 ? `${f0(tt * 1000)} ms` : tt < 600 ? `${f0(tt)} s` : `${f1(tt / 3600)} h`]];
  },
  verdict(s, r) { const g = r.xj / r.xj0; return g < 1.2 ? ['Ultra-shallow junction kept', true] : g < 2 ? ['Junction moved noticeably', true] : ['Junction blown deep', false]; },
};

// ======================= damascene =======================
const DIEL = '#3b4a5f', BARR = '#9aa7b8';
const dmBarrier = (s) => (s.metal === 'Cu' ? s.tb : null);
const damascene = {
  controls: [
    { id: 'metal', label: 'Metal', type: 'seg', options: [['Cu', 'Copper'], ['Co', 'Cobalt'], ['Ru', 'Ruthenium'], ['W', 'Tungsten']] },
    { id: 'w', label: 'Line width', type: 'log', min: 8, max: 200, fmt: (v) => `${f0(v)} nm` },
    { id: 'ar', label: 'Aspect ratio (height / width)', type: 'range', min: 1, max: 3, step: 0.1, fmt: (v) => f1(v) },
    { id: 'tb', label: 'Barrier thickness', type: 'range', min: 0.5, max: 5, step: 0.1, fmt: (v) => `${f1(v)} nm`, only: { metal: 'Cu' } },
    { id: 'L', label: 'Line length', type: 'log', min: 1, max: 1000, fmt: (v) => `${v < 10 ? f1(v) : f0(v)} µm` },
  ],
  defaults: { metal: 'Cu', w: 20, ar: 2, tb: 2, L: 100 },
  eq: ['\\rho = \\rho_{MS}(D) + \\tfrac{3}{8}\\,C\\,\\rho_0\\,\\lambda\\left(\\tfrac{1}{w}+\\tfrac{1}{h}\\right)', 'r = \\frac{\\rho}{(w-2t)(h-t)}, \\qquad \\tau \\approx 0.38\\,r\\,c\\,L^2'],
  model: 'damascene.py',
  sim(s) { return DM.run(s.metal, s.w, s.ar, dmBarrier(s), s.L); },
  draw(s, r, st, p) {
    const x0 = 20, ww = 320, yTop = 130, over = 0.25 * r.h, sc = Math.min(240 / (4 * s.w), 150 / (r.h + over)), tw = s.w * sc, th = r.h * sc, tb = Math.max(r.t * sc, 1);
    const cx = x0 + ww / 2, xs = [cx - s.w * sc * 1.5, cx + s.w * sc * 0.5], metal = s.metal === 'Cu' ? M.cu : s.metal === 'W' ? M.w : s.metal === 'Ru' ? '#c8b5d9' : '#8fb4d9';
    let g = rect(0, 0, W, H, M.bg) + rect(x0, yTop, ww, th + 60, DIEL);
    xs.forEach((x) => { g += rect(x, yTop, tw, th, M.bg); });
    if (st >= 1) xs.forEach((x) => { const k = st === 1 ? p : 1; g += rect(x, yTop, tb * k, th, BARR) + rect(x + tw - tb * k, yTop, tb * k, th, BARR) + rect(x, yTop + th - tb * k, tw, tb * k, BARR); });
    if (st >= 1 && st <= 3) g += rect(x0, yTop - (st === 1 ? p : 1) * tb, ww, (st === 1 ? p : 1) * tb, BARR);
    if (st === 2) xs.forEach((x) => { g += rect(x + tb, yTop, 1.5, th - tb, metal) + rect(x + tw - tb - 1.5, yTop, 1.5, th - tb, metal) + rect(x + tb, yTop + th - tb - 1.5, tw - 2 * tb, 1.5, metal); });
    if (st >= 3) {
      const fill = st === 3 ? p : 1, level = yTop + th - fill * (th + over * sc);   // plating fills bottom-up, then overburden
      const cut = st === 4 ? yTop - (1 - p) * over * sc : st === 5 ? yTop : level;
      xs.forEach((x) => { const top = Math.max(level, yTop); g += rect(x + tb, top, tw - 2 * tb, yTop + th - tb - top, metal); });
      if (level < yTop) g += rect(x0, Math.max(level, cut), ww, yTop - Math.max(level, cut), metal);
    }
    if (st === 5) xs.forEach((x) => { g += txt(x + tw / 2, yTop + th + 18, `${f0(r.r)} Ω/µm`, { size: 10.5, fill: M.ink, anchor: 'middle' }); });
    g += txt(x0, 40, ['trench etched into the dielectric', 'barrier and liner coat the walls', 'thin seed layer for plating', 'electroplating fills bottom-up', 'polish back to the dielectric', 'line resistance measured'][st], { size: 11, fill: st === 3 || st === 4 ? M.amber : M.muted });
    g += txt(x0, 76, `w ${f0(s.w)} nm × h ${f0(r.h)} nm · barrier ${f1(r.t)} nm`, { size: 10.5, fill: M.ink2 }) + txt(x0, 92, `conducting core: ${f0(r.core_share * 100)} % of the trench`, { size: 10.5, fill: M.ink2 });
    // resistivity against width
    const ws = Array.from({ length: 60 }, (_, i) => 8 * (200 / 8) ** (i / 59));
    const ser = [{ pts: ws.map((w) => [w, r.rho_bulk]), stroke: M.muted, dash: '2 4', width: 1.2 },
      { pts: ws.map((w) => [w, DM.run(s.metal, w, s.ar, dmBarrier(s)).rho_core]), stroke: M.ink2, dash: '5 4', width: 1.4 },
      { pts: ws.map((w) => [w, DM.run(s.metal, w, s.ar, dmBarrier(s)).rho_line]), stroke: metal, width: 2.4 }];
    if (s.metal !== 'Cu') ser.splice(1, 0, { pts: ws.map((w) => [w, DM.run('Cu', w, s.ar).rho_line]), stroke: M.cu, width: 1.2, dash: '1 3' });
    g += plot(380, 70, 270, 230, [8, 200], [1, 100], ser, { xlog: true, ylog: true, title: 'resistivity (µΩ·cm), log–log', xlab: 'line width (nm) →', marks: [[s.w, r.rho_line, `${f1(r.rho_line)}`]] });
    g += txt(382, 334, 'solid: whole trench · dashed: core only', { size: 10, fill: M.muted }) + txt(382, 349, s.metal === 'Cu' ? 'dotted: bulk copper' : 'dotted orange: copper with its barrier', { size: 10, fill: M.muted });
    g += legend([[DIEL, 'low-k dielectric'], [BARR, 'barrier and liner'], [metal, METALS_NAME[s.metal]]], 20, H - 40);
    return g;
  },
  read(s, r) {
    const ps = r.rc * 1e12;
    return [['Core resistivity', `${f1(r.rho_core)} µΩ·cm`], ['Whole-trench resistivity', `${f1(r.rho_line)} µΩ·cm`, r.rho_line > 3 * r.rho_bulk ? 'warn' : ''], ['Bulk', `${r.rho_bulk} µΩ·cm`],
      ['Resistance', `${r.r < 10 ? f1(r.r) : f0(r.r)} Ω/µm`], ['Capacitance', `${f0(r.c * 1e18)} aF/µm`], ['Wire RC delay', ps < 1000 ? `${f1(ps)} ps` : `${f1(ps / 1000)} ns`, ps > 1000 ? 'warn' : '']];
  },
  verdict(s, r) { return r.rho_line < 2 * r.rho_bulk ? ['Close to bulk metal', true] : r.rho_line < 5 * r.rho_bulk ? ['Size effects matter', true] : ['Resistance dominated by the narrow line', false]; },
};
const METALS_NAME = { Cu: 'copper', Co: 'cobalt', Ru: 'ruthenium', W: 'tungsten' };

// ======================= probe =======================
const WAFER_USD = 18500;
const probe = {
  controls: [
    { id: 'side', label: 'Die size (square)', type: 'range', min: 5, max: 30, step: 0.5, fmt: (v) => `${f1(v)} mm` },
    { id: 'D0', label: 'Defect density', type: 'log', min: 0.01, max: 1, fmt: (v) => `${f2(v)} cm⁻²` },
    { id: 'cov', label: 'Test fault coverage', type: 'range', min: 0.8, max: 0.999, step: 0.001, fmt: (v) => `${f1(v * 100)} %` },
  ],
  defaults: { side: 10, D0: 0.1, cov: 0.99 },
  eq: ['Y = \\left(1 + \\frac{A D_0}{\\alpha}\\right)^{-\\alpha}', 'DL = 1 - Y^{\\,1-T}'],
  model: 'probe.py',
  sim(s) { return PB.run(s.side, s.D0, s.cov, WAFER_USD); },
  draw(s, r, st, p) {
    const R = 140, cx = 180, cy = 210, k = R / 150;
    let g = rect(0, 0, W, H, M.bg);
    if (st <= 2) {
      g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1b2330" stroke="${M.line}"/>`;
      const n = r.dies.length, shown = st === 0 ? Math.floor(p * n) : n, d = s.side * k;
      r.dies.forEach(([x, y], i) => {
        const bad = r.defects[i] > 0, tested = i < shown;
        g += rect(cx + x * k - d / 2 + 0.3, cy - y * k - d / 2 + 0.3, d - 0.6, d - 0.6, !tested ? '#4b596d' : bad ? '#c95c50' : '#5fd896', `fill-opacity="${tested ? 0.9 : 0.5}"`);
      });
      if (st === 2) for (let i = -Math.ceil(150 / s.side); i <= Math.ceil(150 / s.side); i++) {
        const o = (i + 0.5) * (s.side + 0.1) * k * p;
        g += line(cx + o, cy - R, cx + o, cy + R, M.bg, 'stroke-width="1"') + line(cx - R, cy + o, cx + R, cy + o, M.bg, 'stroke-width="1"');
      }
      if (st === 0) g += line(cx - R, cy - R + 2 * R * p, cx + R, cy - R + 2 * R * p, M.amber, 'stroke-width="1.5" stroke-dasharray="4 3"');
    } else {
      // pick the good dies into a tray, then bond one into a package
      const tray = st === 3 ? Math.min(r.good, 48) : 0;
      for (let i = 0; i < tray; i++) { const col = i % 8, row = Math.floor(i / 8); g += rect(40 + col * 36, 80 + row * 36, 28, 28, '#5fd896', `fill-opacity="${st === 3 ? f2(Math.min(1, p * tray / (i + 1) * 0.5)) : 0.35}"`); }
      g += txt(40, 70, `${r.good} good dies of ${r.n}${st === 3 && r.good > tray ? ` (first ${tray} shown)` : ''}`, { size: 11, fill: M.ink });
      if (st === 4) {
        const px = 200, py = 250, pk = 90;
        g += rect(px - pk, py - pk / 2, 2 * pk, pk, '#232a34', `stroke="${M.muted}"`) + rect(px - 30, py - 22, 60, 44, '#5fd896');
        for (let i = 0; i < 8; i++) { const lx = px - pk + 12 + i * (2 * pk - 24) / 7; g += line(lx, py - pk / 2 - 14, lx, py - pk / 2, M.w, 'stroke-width="3"') + `<path d="M${f1(px - 24 + i * 48 / 7)} ${py - 22} Q ${f1((lx + px - 24 + i * 48 / 7) / 2)} ${py - 70 + 30 * (1 - p)} ${f1(lx)} ${py - pk / 2}" fill="none" stroke="${M.metal}" stroke-width="1.2" opacity="${f2(Math.min(1, p * 2))}"/>`; }
        g += txt(px, py + pk / 2 + 18, 'wire-bonded into a package', { size: 10.5, fill: M.muted, anchor: 'middle' });
      }
    }
    g += txt(20, 30, ['probe card steps across the wafer', 'wafer map: green passes, red fails', 'saw cuts along the scribe lanes', 'good dies picked from the tape', 'bond and package'][st], { size: 11, fill: st === 0 ? M.amber : M.muted });
    // defect level against coverage
    const Ts = Array.from({ length: 80 }, (_, i) => 0.8 + 0.1999 * i / 79);
    g += plot(380, 70, 270, 230, [0.8, 0.9999], [10, 1e5], [{ pts: Ts.map((T) => [T, Math.max(10, PB.defectLevel(r.Y, T) * 1e6)]), stroke: M.amber, width: 2.4 }, { pts: Ts.map((T) => [T, 1000]), stroke: M.muted, dash: '2 4', width: 1.2 }],
      { ylog: true, title: 'bad dies shipped (parts per million)', xlab: 'fault coverage →', marks: [[s.cov, Math.max(10, r.dl_ppm), '']] });
    g += txt(645, 92, `${f0(r.dl_ppm)} ppm at ${f1(s.cov * 100)} %`, { size: 10.5, fill: M.amber, anchor: 'end' });
    g += txt(382, 334, `curve for this yield, Y = ${f0(r.Y * 100)} %`, { size: 10, fill: M.muted }) + txt(382, 349, 'dotted: 1000 ppm', { size: 10, fill: M.muted });
    g += legend([['#5fd896', 'passes test'], ['#c95c50', 'fails test'], ['#4b596d', 'not yet probed']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Dies on the wafer', `${r.n}`], ['Good dies (this wafer)', `${r.good}`], ['Yield, this wafer / model', `${f0(r.yield_mc * 100)} % / ${f0(r.Y * 100)} %`, r.Y < 0.5 ? 'warn' : ''],
      ['Cost per good die', `$${r.cost < 100 ? f1(r.cost) : f0(r.cost)}`], ['Bad dies shipped', `${f0(r.dl_ppm)} ppm`, r.dl_ppm > 1000 ? 'warn' : '']];
  },
  verdict(s, r) { return r.dl_ppm < 1000 && r.Y > 0.7 ? ['Shippable at good cost', true] : r.dl_ppm < 1000 ? ['Ships, but yield is costly', false] : ['Too many escapes for customers', false]; },
};

// ======================= release =======================
const SIGE = '#7aa5c9', SPACER_NM = 10;
const release = {
  controls: [
    { id: 'W', label: 'Sheet width', type: 'range', min: 10, max: 60, step: 1, fmt: (v) => `${f0(v)} nm` },
    { id: 'S', label: 'Etch selectivity SiGe : Si', type: 'log', min: 10, max: 1000, fmt: (v) => `${f0(v)} : 1` },
    { id: 'over', label: 'Over-etch', type: 'range', min: -0.4, max: 1, step: 0.05, fmt: (v) => `${v >= 0 ? '+' : ''}${f0(v * 100)} %` },
    { id: 'n', label: 'Sheets in the stack', type: 'seg', options: [['2', '2'], ['3', '3'], ['4', '4']] },
  ],
  defaults: { W: 30, S: 100, over: 0.2, n: '3' },
  eq: ['e = \\tfrac{W}{2}\\,(1+f), \\qquad t(y) = t_0 - \\frac{2\\,(e-y)}{S}', 'W_{eff} = 2\\,n\\,(w + \\bar t)'],
  model: 'release.py',
  sim(s) { return RL.run(s.W, 5, s.S, s.over, +s.n); },
  draw(s, r, st, p) {
    const n = +s.n, t0 = 5;
    const half = Math.min(r.e, s.W / 2), exNow = st < 1 ? 0 : st === 1 ? p * 0.5 * half : st === 2 ? half * (0.5 + 0.5 * p) : st === 3 ? half + (r.e - half) * p : r.e;
    const x0 = 30, ww = 300, sc = ww / s.W, stack = n * (t0 + SPACER_NM) + SPACER_NM, vsc = 230 / stack, yb = 330;
    let g = rect(0, 0, W, H, M.bg) + rect(x0 - 20, yb, ww + 40, 30, M.si);
    // gate opening walls (inner spacers) at both ends
    g += rect(x0 - 20, yb - stack * vsc, 18, stack * vsc, M.nit) + rect(x0 + ww + 2, yb - stack * vsc, 18, stack * vsc, M.nit);
    for (let i = 0; i < n + 1; i++) {                                 // SiGe layers: what is left between the two fronts
      const y1 = yb - (i * (t0 + SPACER_NM) + SPACER_NM) * vsc, h = SPACER_NM * vsc, l = Math.min(exNow, s.W / 2);
      if (s.W - 2 * l > 0.01) g += rect(x0 + l * sc, y1, (s.W - 2 * l) * sc, h, SIGE);
    }
    for (let i = 0; i < n; i++) {                                     // silicon sheets, thinned where exposed
      const yc = yb - (i * (t0 + SPACER_NM) + SPACER_NM + t0 / 2) * vsc;
      const prof = Array.from({ length: 41 }, (_, j) => { const y = s.W * j / 40, d = Math.min(y, s.W - y), th = Math.max(0, t0 - 2 * Math.max(0, exNow - d) / s.S); return [y, th]; });
      const side = exNow / s.S;
      const top = prof.map(([y, th]) => [x0 + clamp(y, side, s.W - side) * sc, yc - th / 2 * vsc]), bot = prof.slice().reverse().map(([y, th]) => [x0 + clamp(y, side, s.W - side) * sc, yc + th / 2 * vsc]);
      g += poly([...top, ...bot], M.si, `stroke="${M.ink2}" stroke-width=".6"`);
    }
    if (st >= 1 && st <= 3) for (let q = 0; q < 16; q++) { const yy = yb - RND[q * 2] * stack * vsc, side = q % 2; g += `<circle cx="${f1(side ? x0 + ww - 8 - RND[q * 2 + 1] * 20 : x0 + 8 + RND[q * 2 + 1] * 20)}" cy="${f1(yy)}" r="2" fill="${M.plasma}"/>`; }
    if (st === 4 && !r.released) g += txt(x0 + ww / 2, yb - stack * vsc - 10, `SiGe stringer ${f1(r.core)} nm wide left between the sheets`, { size: 11, fill: M.warn, anchor: 'middle' });
    g += txt(20, 34, ['dummy gate removed: the stack is open at both ends', 'etchant attacks SiGe from both sides', 'the two fronts meet in the middle', 'over-etch: only silicon is left to attack', 'sheets inspected, ready for the gate'][st], { size: 11, fill: st >= 1 && st <= 3 ? M.amber : M.muted });
    g += txt(20, 52, `width ${f0(s.W)} nm drawn ${f1(sc)} px/nm · thickness stretched to ${f1(vsc)} px/nm`, { size: 10, fill: M.muted });
    // final thickness across the sheet
    const prof = [...r.y.map((y, i) => [y, r.thick[i]]), ...r.y.slice().reverse().map((y, i) => [s.W - y, r.thick[r.y.length - 1 - i]])];
    g += plot(380, 70, 270, 230, [0, s.W], [0, 6], [{ pts: [[0, 5], [s.W, 5]], stroke: M.muted, dash: '2 4', width: 1.2 }, { pts: prof, stroke: M.ink, width: 2.4 }],
      { title: 'final sheet thickness (nm)', xlab: 'position across the sheet (nm) →', marks: [[s.W / 2, r.t_centre, `centre ${f2(r.t_centre)}`]] });
    g += txt(382, 334, `dotted: 5 nm as grown · edges ${f2(r.t_edge)} nm`, { size: 10, fill: M.muted }) + txt(382, 349, r.released ? `effective width ${f0(r.weff)} of ${f0(r.weff_ideal)} nm` : 'not released: no gate can wrap the sheets', { size: 10, fill: r.released ? M.muted : M.warn });
    g += legend([[M.si, 'silicon sheets'], [SIGE, 'silicon–germanium'], [M.nit, 'inner spacer']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Lateral etch each side', `${f1(r.e)} nm`], ['Silicon lost per face', `${f2(r.side)} nm`], ['Sheet edge / centre', `${f2(r.t_edge)} / ${f2(r.t_centre)} nm`, r.t_edge < 4 ? 'warn' : ''],
      ['SiGe left in the middle', `${f1(r.core)} nm`, r.core > 0 ? 'warn' : ''], ['Effective width', r.released ? `${f0(r.weff)} nm` : 'none', r.released ? '' : 'warn']];
  },
  verdict(s, r) { return !r.released ? ['Not released: SiGe stringer', false] : r.t_edge < 4 ? ['Released, but sheets thinned', false] : ['Clean release', true]; },
};

// ======================= planar =======================
const planar = {
  controls: [
    { id: 'NB', label: 'Substrate doping (n-type)', type: 'log', min: 1e14, max: 1e17, fmt: (v) => `${sci(v)} cm⁻³` },
    { id: 'T2', label: 'Drive-in temperature', type: 'range', min: 1000, max: 1200, step: 10, fmt: (v) => `${v} °C` },
    { id: 't2', label: 'Drive-in time', type: 'log', min: 5, max: 600, fmt: (v) => (v < 60 ? `${f0(v)} min` : `${f1(v / 60)} h`) },
  ],
  defaults: { NB: 1e15, T2: 1100, t2: 60 },
  eq: ['BV_{pp} = 60\\left(\\frac{E_g}{1.1}\\right)^{3/2}\\left(\\frac{N_B}{10^{16}}\\right)^{-3/4}\\ \\mathrm{V}', '\\frac{BV_{cyl}}{BV_{pp}} = \\sqrt{\\left(\\tfrac{r_j}{W}\\right)^2 + 2\\left(\\tfrac{r_j}{W}\\right)^{6/7}} - \\frac{r_j}{W}'],
  model: 'planar.py',
  sim(s) { return PL.run(s.NB, s.T2, s.t2); },
  draw(s, r, st, p) {
    const x0 = 20, ww = 320, ys = 120, umMax = Math.max(12, 2.2 * r.xj / 1000), sc = 220 / umMax, xjNow = (st < 2 ? 0 : st === 2 ? 0.3 * p : st === 3 ? 0.3 + 0.7 * p : 1) * r.xj / 1000;
    const win = [x0 + 90, x0 + ww - 90], ox = 22;
    let g = rect(0, 0, W, H, M.bg) + rect(x0, ys, ww, 230, M.si, 'fill-opacity=".85"');
    if (xjNow > 0) {                                                   // the p region: flat bottom, quarter-circle edges of radius xj
      const R = xjNow * sc, rr = Math.min(R, 230);
      g += `<path d="M${f1(win[0] - rr)} ${ys} A ${f1(rr)} ${f1(rr)} 0 0 0 ${f1(win[0])} ${f1(ys + rr)} L ${f1(win[1])} ${f1(ys + rr)} A ${f1(rr)} ${f1(rr)} 0 0 0 ${f1(win[1] + rr)} ${ys} Z" fill="${M.p}" fill-opacity=".85"/>`;
      if (st === 4) {                                                  // depletion edge under reverse bias: crowds at the curved corner
        const D = Math.min(r.W_um * sc * 0.35, 120) + rr;
        g += `<defs><clipPath id="plSi"><rect x="${x0}" y="${ys}" width="${ww}" height="230"/></clipPath></defs>`;
        g += `<path d="M${f1(win[0] - D)} ${ys} A ${f1(D)} ${f1(D)} 0 0 0 ${f1(win[0])} ${f1(ys + D)} L ${f1(win[1])} ${f1(ys + D)} A ${f1(D)} ${f1(D)} 0 0 0 ${f1(win[1] + D)} ${ys}" fill="none" stroke="${M.amber}" stroke-dasharray="5 4" stroke-width="1.5" clip-path="url(#plSi)"/>`;
        g += `<circle cx="${f1(win[0] - rr * 0.71)}" cy="${f1(ys + rr * 0.71)}" r="9" fill="none" stroke="${M.warn}" stroke-width="2"/>` + txt(Math.max(x0 + 4, win[0] - rr * 0.71 - 60), ys + rr * 0.71 + 24, 'breaks down here first', { size: 10.5, fill: M.warn });
      }
    }
    // masking oxide: grown, then opened; regrows over the window during the drive-in
    if (st >= 0) g += rect(x0, ys - ox, st >= 1 ? win[0] - x0 : ww, ox, M.ox) + (st >= 1 ? rect(win[1], ys - ox, x0 + ww - win[1], ox, M.ox) : '');
    if (st === 2) g += rect(win[0], ys - 6, win[1] - win[0], 6, '#d9a35f');
    if (st >= 3) g += rect(win[0], ys - ox * 0.5 * (st === 3 ? p : 1), win[1] - win[0], ox * 0.5 * (st === 3 ? p : 1), M.ox);
    if (st === 4) g += line(win[0] + 40, ys - 40, win[0] + 40, ys - 4, M.w, 'stroke-width="3"') + txt(win[0] + 48, ys - 30, 'reverse bias', { size: 10.5, fill: M.ink });
    g += txt(20, 34, ['masking oxide grown over the whole wafer', 'window opened in the oxide', 'boron predeposited through the window', 'drive-in: the junction curves up under the oxide', 'reverse bias until avalanche'][st], { size: 11, fill: st >= 2 && st <= 3 ? M.amber : M.muted });
    if (xjNow > 0) g += txt(x0 + ww - 4, ys + xjNow * sc + 14, `xⱼ ${f1(xjNow)} µm`, { size: 10.5, fill: M.amber, anchor: 'end' });
    g += txt(x0, ys + 246, `scale: ${f0(umMax)} µm = 220 px · edge radius ≈ xⱼ`, { size: 10, fill: M.muted });
    // breakdown against junction depth
    // Sze–Gibbons holds for edge radii up to about the depletion width, so the axis stops near r = W.
    const xHi = Math.min(20, Math.max(1.2 * r.W_um, 1.3 * r.xj / 1000, 1)), xs = Array.from({ length: 60 }, (_, i) => 0.2 * (xHi / 0.2) ** (i / 59));
    g += plot(380, 70, 270, 230, [0.2, xHi], [0, r.bv_pp * 1.1], [{ pts: xs.map((x) => [x, r.bv_pp]), stroke: M.muted, dash: '2 4', width: 1.2 }, { pts: xs.map((x) => [x, r.bv_pp * PL.cylRatio(x / r.W_um)]), stroke: M.p, width: 2.4 }],
      { xlog: true, title: 'breakdown voltage (V)', xlab: 'junction depth (µm) →', marks: [[r.xj / 1000, r.bv_cyl, `${f0(r.bv_cyl)} V`]] });
    g += txt(382, 334, `dotted: flat junction, ${f0(r.bv_pp)} V`, { size: 10, fill: M.muted }) + txt(382, 349, `depletion at breakdown ${f1(r.W_um)} µm`, { size: 10, fill: M.muted });
    g += legend([[M.si, 'n-type silicon'], [M.p, 'boron-diffused p region'], [M.ox, 'silicon dioxide']], 20, H - 40);
    return g;
  },
  read(s, r) {
    return [['Junction depth', `${f2(r.xj / 1000)} µm`], ['Sheet resistance', `${f0(r.Rs)} Ω/□`], ['Flat-junction breakdown', `${f0(r.bv_pp)} V`],
      ['Edge breakdown', `${f0(r.bv_cyl)} V`, r.ratio < 0.4 ? 'warn' : ''], ['Edge / flat', `${f0(r.ratio * 100)} %`]];
  },
  verdict(s, r) { return r.ratio >= 0.6 ? ['Edge holds most of the voltage', true] : r.ratio >= 0.4 ? ['Edge limits the breakdown', true] : ['Edge breaks down far below the flat junction', false]; },
};

// ======================= etch =======================
function etchAt(s, t) { return ET.WIDTHS.map((w) => ({ w, ...ET.etchOpening(w, t, s.s, s.aniso, s.sel) })); }
const etch = {
  controls: [
    { id: 's', label: 'Radical reaction probability s', type: 'log', min: 0.01, max: 1, fmt: (v) => f2(v) },
    { id: 'aniso', label: 'Anisotropy (ion direction)', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => (v < 0.05 ? 'isotropic' : f2(v)) },
    { id: 'sel', label: 'Selectivity to the mask', type: 'range', min: 2, max: 30, step: 1, fmt: (v) => `${v} : 1` },
    { id: 'oe', label: 'Over-etch', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${f0(v * 100)}%` },
  ],
  defaults: { s: 0.05, aniso: 0.9, sel: 10, oe: 0.5 },
  eq: ['\\frac{R}{R_0} = \\frac{1}{1 + \\tfrac34\\, s\\, \\mathrm{AR}}', 'u(z) = (1 - A)\\, R(z)\\,(t - t_z)'],
  model: 'etch.py',
  sim(s) { return ET.run(s.s, s.aniso, s.sel, s.oe); },
  time(s, r, st, p) { return st < 2 ? 0 : st === 2 ? p * r.t_end : st === 3 ? r.t_end : st === 4 ? r.t_end + p * (r.t_total - r.t_end) : r.t_total; },
  draw(s, r, st, p) {
    const t = this.time(s, r, st, p), ops = etchAt(s, t);
    const sc = 0.76, x0 = 28, yTop = 112, yFilm = yTop + ET.MASK * sc, yStop = yFilm + ET.FILM * sc, yBase = yStop + 28;
    const centres = [], gap = 84; let cx = x0 + gap * 0.7;
    ET.WIDTHS.forEach((w) => { centres.push(cx + w * sc / 2); cx += w * sc + gap; });
    const xr = cx - gap * 0.3;
    let g = rect(0, 0, W, H, M.bg);
    if (st >= 1 && st <= 4) {                 // plasma glow, ions and radicals
      g += `<defs><linearGradient id="prGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.plasma}" stop-opacity=".55"/><stop offset="1" stop-color="${M.plasma}" stop-opacity="0"/></linearGradient></defs>` + rect(x0, 28, xr - x0, yTop - 30, 'url(#prGlow)');
      for (let i = 0; i < 24; i++) { const xx = x0 + 8 + RND[i * 4] * (xr - x0 - 16), yy = 30 + ((RND[i * 4 + 1] + p * 2) % 1) * (yTop - 44); g += line(xx, yy, xx, yy + 10, '#ffffff', 'stroke-width="1.6" stroke-opacity=".8"'); }
      for (let i = 0; i < 30; i++) { const xx = x0 + RND[i * 4 + 2] * (xr - x0), yy = 32 + RND[i * 4 + 3] * (yTop - 42); g += `<circle cx="${f1(xx)}" cy="${f1(yy)}" r="2" fill="#ffd36b" opacity=".75"/>`; }
    }
    g += rect(x0, yStop, xr - x0, yBase - yStop, M.nit) + rect(x0, yBase, xr - x0, 14, M.si) + rect(x0, yFilm, xr - x0, yStop - yFilm, M.ox);
    // mask (eroded uniformly), absent after strip
    const mLeft = st === 5 ? 0 : ops[0].mask_left;
    if (mLeft > 0) { let xa = x0; ops.forEach((o, i) => { const xl = centres[i] - o.w * sc / 2; g += rect(xa, yFilm - mLeft * sc, xl - xa, mLeft * sc, '#6f7b8c'); xa = xl + o.w * sc; }); g += rect(xa, yFilm - mLeft * sc, xr - xa, mLeft * sc, '#6f7b8c'); }
    else if (st < 5 && t > 0) g += rect(x0, yFilm - 2, xr - x0, 2, M.warn);
    // each opening: cavity from the computed sidewall recess u(z)
    ops.forEach((o, i) => {
      const c = centres[i], hw = o.w * sc / 2;
      if (o.depth <= 0) return;
      const sides = o.side.length ? o.side : [[0, 0]], left = [], right = [];
      sides.forEach(([z, u]) => { left.push([c - hw - u * sc, yFilm + z * sc]); right.push([c + hw + u * sc, yFilm + z * sc]); });
      const dF = Math.min(o.depth, ET.FILM), yB = yFilm + o.depth * sc;
      left.push([c - hw - (sides[sides.length - 1][1]) * sc, yFilm + dF * sc]); right.push([c + hw + (sides[sides.length - 1][1]) * sc, yFilm + dF * sc]);
      if (o.depth > ET.FILM) { left.push([c - hw, yFilm + dF * sc], [c - hw, yB]); right.push([c + hw, yFilm + dF * sc], [c + hw, yB]); }
      else { left.push([left[left.length - 1][0], yB]); right.push([right[right.length - 1][0], yB]); }
      g += poly([[c - hw - sides[0][1] * sc, yFilm], ...left, ...right.reverse(), [c + hw + sides[0][1] * sc, yFilm]], M.bg);
      const cleared = o.depth >= ET.FILM;
      g += txt(c, yBase + 32, `${o.w} nm`, { size: 11.5, fill: M.ink, anchor: 'middle' }) + txt(c, yBase + 48, cleared ? 'cleared' : `${f0(o.depth)} / ${ET.FILM}`, { size: 10.5, fill: cleared ? M.ok : M.warn, anchor: 'middle' });
    });
    // optical-emission endpoint trace
    const tr = Array.from({ length: 120 }, (_, i) => { const tt = r.t_total * i / 119; return [tt, 0.08 + r.openings.reduce((a, o) => a + o.w * (o.t_clear === null || tt < o.t_clear ? 1 : 0), 0) / ET.WIDTHS.reduce((a, b) => a + b, 0)]; });
    g += plot(500, 128, 156, 80, [0, r.t_total], [0, 1.15], [{ pts: tr, stroke: M.plasma, width: 2 }], { title: 'emission: product line', vline: st >= 2 ? t : null, xlab: 'time →' });
    g += line(500 + 156 * r.t_end / r.t_total, 128, 500 + 156 * r.t_end / r.t_total, 208, M.ok, 'stroke-width="1.2"') + txt(500 + 156 * r.t_end / r.t_total + 3, 140, 'endpoint', { size: 9.5, fill: M.ok });
    g += txt(30, 20, st === 0 ? 'patterned hard mask on the film' : `t = ${f0(t)} s${st === 3 ? ' · endpoint' : ''}`, { size: 11, fill: M.muted });
    g += [['#6f7b8c', 'hard mask'], [M.ox, 'film (oxide)'], [M.nit, 'stop layer'], [M.si, 'silicon'], [M.plasma, 'plasma glow'], ['#ffd36b', 'radicals'], ['#ffffff', 'ions']].map(([c, l], i) => rect(504, 246 + i * 18, 10, 10, c) + txt(520, 255 + i * 18, l, { size: 11, fill: M.ink })).join('');
    return g;
  },
  read(s, r) {
    const tEnd = etchAt(s, r.t_end), o = r.openings, wide = o[2];
    const under = Math.max(0, ...wide.side.map(([, u]) => u));
    return [['Endpoint (widest clear)', `${f0(r.t_end)} s`], ['Total with over-etch', `${f0(r.t_total)} s`],
      ['Narrow at endpoint', `${f0(100 * tEnd[0].depth / ET.FILM)}% of the film`, tEnd[0].depth < ET.FILM ? 'warn' : ''], ['All openings clear', r.all_clear ? 'yes' : 'no', r.all_clear ? 'ok' : 'warn'],
      ['Undercut at the top', `${f1(under)} nm`, under > 10 ? 'warn' : ''], ['Mask left', `${f0(o[0].mask_left)} nm`, o[0].mask_left <= 0 ? 'warn' : '']];
  },
  verdict(s, r) {
    const under = Math.max(0, ...r.openings[2].side.map(([, u]) => u));
    if (!r.all_clear) return ['Narrow opening not cleared', false];
    if (r.openings[0].mask_left <= 0) return ['Mask consumed', false];
    if (under > 10) return ['Undercut', false];
    return ['Pass', true];
  },
};

// ======================= deposition =======================
const deposition = {
  controls: [
    { id: 'method', label: 'Method', type: 'seg', options: [['pvd', 'Sputter'], ['cvd', 'CVD'], ['ald', 'ALD']] },
    { id: 'w', label: 'Trench width', type: 'range', min: 20, max: 120, step: 5, fmt: (v) => `${v} nm` },
    { id: 'ar', label: 'Aspect ratio (depth / width)', type: 'range', min: 0.5, max: 8, step: 0.5, fmt: (v) => `${f1(v)} : 1` },
    { id: 'target', label: 'Film on top', type: 'range', min: 2, max: 60, step: 1, fmt: (v) => `${v} nm` },
    { id: 's', label: 'CVD reaction probability', type: 'log', min: 0.002, max: 1, fmt: (v) => (v < 0.01 ? v.toFixed(3) : f2(v)), only: { method: 'cvd' } },
    { id: 'exposure', label: 'ALD exposure (× saturation)', type: 'log', min: 0.3, max: 100, fmt: (v) => (v < 10 ? f1(v) : f0(v)), only: { method: 'ald' } },
  ],
  defaults: { method: 'cvd', w: 60, ar: 3, target: 20, s: 0.05, exposure: 20 },
  eq: ['n\'\' = \\frac{3\\,s}{2\\,w(z)^2}\\; n, \\qquad n(0) = 1,\\; n\'(L) = 0', '\\text{ALD: } \\Delta t = \\mathrm{GPC} \\times \\min(1,\\, E\\,n)'],
  model: 'deposition.py',
  sim(s) { return DP.fill(s.method, s.w, s.ar, s.target, s.method === 'cvd' ? s.s : null, s.exposure); },
  draw(s, r, st, p) {
    const k = st < 2 ? 0 : st === 2 ? Math.max(0.02, p) : 1;
    const f = k >= 1 ? r : DP.fill(s.method, s.w, s.ar, s.target * k, s.method === 'cvd' ? s.s : null, s.exposure, Math.max(8, Math.round(160 * k)));
    const depth = s.ar * s.w, span = s.w * 3, sc = Math.min(270 / (depth + s.target + 20), 330 / span), cx = 190, yS = 70 + (s.target + 10) * sc;
    const xl = cx - s.w * sc / 2, xr = cx + s.w * sc / 2, xa = cx - span * sc / 2, xb = cx + span * sc / 2, yB = yS + depth * sc;
    let g = rect(0, 0, W, H, M.bg);
    // dielectric with the trench cut out
    g += rect(xa, yS, xl - xa, depth * sc + 40, M.ox) + rect(xr, yS, xb - xr, depth * sc + 40, M.ox) + rect(xl, yB, xr - xl, 40, M.ox);
    // film: top, walls level by level, floor
    const fc = s.method === 'pvd' ? M.cu : s.method === 'ald' ? M.hk : M.w, tTop = f.top * sc;
    if (f.top > 0) {
      g += rect(xa, yS - tTop, xl - xa, tTop, fc) + rect(xr, yS - tTop, xb - xr, tTop, fc);
      const nz = DP.NZ, hz = depth * sc / nz, L = [], R = [];
      for (let i = 0; i <= nz; i++) { const y = yS + i * hz, t = f.side[i] * sc; L.push([xl + t, y]); R.push([xr - t, y]); }
      g += poly([[xl, yS - tTop], [xl, yB], ...L.slice().reverse(), [xl + f.side[0] * sc, yS - tTop]], fc);
      g += poly([[xr, yS - tTop], [xr, yB], ...R.slice().reverse(), [xr - f.side[0] * sc, yS - tTop]], fc);
      g += rect(xl, yB - f.floor * sc, xr - xl, f.floor * sc, fc);
      // mouth overhang closes the trench
      if (f.side[0] * 2 >= s.w - 1e-6) g += rect(xl, yS - tTop, xr - xl, tTop + f.side[0] * 0.2 * sc, fc);
      if (f.void && f.void_z) { const [za, zb] = f.void_z; g += rect(xl + 2, yS + za * sc, xr - xl - 4, (zb - za) * sc, 'none', `stroke="${M.warn}" stroke-width="1.6" stroke-dasharray="4 3"`) + txt(xr + 8, yS + (za + zb) / 2 * sc, 'void', { size: 11.5, fill: M.warn }); }
    }
    if (st === 1 || st === 2) {                                         // arriving species
      for (let i = 0; i < 22; i++) {
        const u = RND[i * 6], v = (RND[i * 6 + 1] + p * 2) % 1, xx = xa + u * (xb - xa), yy = 18 + v * (yS - 30);
        if (s.method === 'pvd') g += line(xx, yy, xx + (RND[i * 6 + 2] - 0.5) * 14, yy + 10, fc, 'stroke-width="2" stroke-linecap="round"');
        else g += `<circle cx="${f1(xx)}" cy="${f1(yy)}" r="2.4" fill="${fc}" opacity=".9"/>`;
      }
    }
    if (st === 4 && f.top > 0) {
      const mid = Math.round(DP.NZ * 0.5);
      g += txt(xb + 10, yS - tTop / 2 + 4, `top ${f1(f.top)} nm`, { size: 11, fill: M.ink }) + txt(xb + 10, yS + depth * sc * 0.5, `wall ${f1(f.side[mid])} nm`, { size: 11, fill: M.ink }) + txt(xb + 10, yB - 2, `floor ${f1(f.floor)} nm`, { size: 11, fill: M.ink });
    }
    g += txt(30, 22, `${DP.METHODS[s.method].name}${s.method === 'ald' ? ` · ${Math.ceil(s.target * k / DP.GPC)} cycles` : ''} · trench ${s.w} × ${f0(depth)} nm`, { size: 11, fill: M.muted });
    // film thickness down the wall
    const prof = f.side.map((t, i) => [depth * i / DP.NZ, f.top > 0 ? t / f.top : 0]);
    g += plot(430, 70, 200, 200, [0, depth], [0, 1.05], [{ pts: prof, stroke: fc, width: 2.4 }], { title: 'wall ÷ top thickness', xlab: 'depth →', marks: f.top > 0 ? [[depth, f.floor / f.top, `${f0(100 * f.floor / f.top)}%`]] : [] });
    g += legend([[M.ox, 'dielectric'], [fc, s.method === 'pvd' ? 'sputtered copper' : s.method === 'ald' ? 'ALD high-k' : 'CVD tungsten']], 30, H - 40);
    return g;
  },
  read(s, r) {
    return [['Step coverage', `${f0(r.coverage * 100)}%`, r.coverage < 0.5 ? 'warn' : r.coverage > 0.9 ? 'ok' : ''], ['Floor / top', `${f0(r.bottom_ratio * 100)}%`],
      ['Void', r.void ? 'yes' : 'no', r.void ? 'warn' : 'ok'], ['Trench depth', `${f0(r.depth)} nm`],
      ['Reaction probability', s.method === 'ald' ? `${DP.S_ALD} (self-limiting)` : f2(s.method === 'cvd' ? s.s : 1)], ['ALD cycles', r.cycles ? String(r.cycles) : '—']];
  },
  verdict(s, r) { return r.void ? ['Void sealed in', false] : r.coverage > 0.9 ? ['Conformal', true] : r.coverage < 0.3 ? ['Thin floor', false] : ['Partial coverage', true]; },
};

// ======================= CMP =======================
const cmp = {
  controls: [
    { id: 'P', label: 'Down pressure', type: 'range', min: 7, max: 50, step: 1, fmt: (v) => `${v} kPa` },
    { id: 'V', label: 'Pad velocity', type: 'range', min: 0.3, max: 2, step: 0.1, fmt: (v) => `${f1(v)} m/s` },
    { id: 't', label: 'Polish time', type: 'range', min: 0.5, max: 6, step: 0.1, fmt: (v) => `${f1(v)} min` },
  ],
  defaults: { P: 28, V: 1.0, t: 3.0 },
  eq: ['RR = K_p\\, P\\, V \\quad\\text{(Preston)}', 'h \\ge h_c:\\; \\dot z_{up} = K/\\rho \\qquad h < h_c:\\; \\dot h = -K h / (h_c \\rho)'],
  model: 'cmp.py',
  sim(s) { return CM.run(s.P, s.V, s.t); },
  time(s, st, p) { return st < 2 ? 0 : st === 2 ? 0.5 * s.t * p : st === 3 ? s.t * (0.5 + 0.5 * p) : s.t; },
  draw(s, r, st, p) {
    const t = this.time(s, st, p), regs = CM.DENSITIES.map((rho) => ({ rho, ...CM.polish(rho, s.P, s.V, t) }));
    const sc = 250 / (CM.OX0 + CM.STEP0), yBase = 352, x0 = 24, rw = 196, pitch = 32;
    const Y = (h) => yBase - h * sc;
    let g = rect(0, 0, W, H, M.bg) + rect(x0, yBase, rw * 3 + 20, 30, M.si);
    regs.forEach((g0, i) => {
      const xa = x0 + i * (rw + 10), up = Math.max(g0.up, 0), down = Math.max(g0.down, 0), lw = pitch * g0.rho;
      // oxide: down level everywhere, raised over each line; lines drawn on top where the oxide is gone
      g += rect(xa, Y(down), rw, yBase - Y(down), M.ox);
      for (let k = 0; k < Math.floor(rw / pitch); k++) {
        const lx = xa + 6 + k * pitch;
        g += rect(lx, Y(Math.min(up, CM.OX0 + CM.STEP0)), lw, Y(down) - Y(Math.min(up, CM.OX0 + CM.STEP0)), M.ox);
        g += rect(lx, Y(CM.STEP0), lw, yBase - Y(CM.STEP0), M.cu);
        if (up < CM.STEP0) g += rect(lx, Y(CM.STEP0), lw, Y(up) - Y(CM.STEP0), M.bg);
      }
      g += txt(xa + rw / 2, yBase + 46, `density ${f0(g0.rho * 100)}%`, { size: 11.5, fill: M.ink, anchor: 'middle' });
      g += txt(xa + rw / 2, yBase + 61, g0.up < CM.STEP0 ? 'worn through' : `step ${f0(g0.up - g0.down)} nm · ${f0(g0.up - CM.STEP0)} nm over line`, { size: 10.5, fill: g0.up < CM.STEP0 ? M.warn : g0.up - g0.down < 20 ? M.ok : M.ink2, anchor: 'middle' });
    });
    const padY = Math.min(...regs.map((g0) => Y(g0.up)));
    if (st >= 2 && st <= 4) {
      g += rect(x0 - 6, padY - 34, rw * 3 + 32, 30, '#3a4250', 'rx="4"') + txt(x0 + 4, padY - 14, `pad · ${s.P} kPa · ${f1(s.V)} m/s →`, { size: 11, fill: M.ink });
      for (let i = 0; i < 40; i++) g += `<circle cx="${f1(x0 + ((RND[i * 2] + p * 0.8) % 1) * (rw * 3 + 20))}" cy="${f1(padY - 3 + RND[i * 2 + 1] * 3)}" r="1.6" fill="#ffffff" opacity=".6"/>`;
    } else if (st === 1) g += rect(x0 - 6, 60, rw * 3 + 32, 30, '#3a4250', 'rx="4"') + txt(x0 + 4, 80, 'pad with slurry, wafer lowering', { size: 11, fill: M.ink });
    g += txt(30, 22, `t = ${f1(t)} min · blanket rate ${f0(r.K)} nm/min`, { size: 11, fill: M.muted });
    // step height against time per region
    const cols = ['#8fcfd4', '#f2b84b', '#e07f3f'];
    const series = r.regions.map((g0, i) => ({ pts: g0.hist.map(([tt, u, d]) => [tt, Math.max(0, u - d)]), stroke: cols[i], width: 2 }));
    g += plot(490, 22, 160, 66, [0, s.t], [0, CM.STEP0 * 1.05], series, { title: 'step height, 3 regions', vline: st >= 2 ? t : null, xlab: 'time →' });
    g += [[M.ox, 'oxide'], [M.cu, 'metal lines'], [M.si, 'wafer']].map(([c, l], i) => rect(30 + i * 130, 40, 10, 10, c) + txt(46 + i * 130, 49, l, { size: 11, fill: M.ink })).join('');
    return g;
  },
  read(s, r) {
    const [a, b, c] = r.regions, worn = r.regions.some((g0) => g0.up < CM.STEP0);
    return [['Blanket rate', `${f0(r.K)} nm/min`], ['Within-die range', `${f0(r.range_nm)} nm`, r.range_nm > 150 ? 'warn' : ''],
      ['Step, 20% / 50% / 80%', `${[a, b, c].map((g0) => f0(Math.max(0, g0.step))).join(' / ')} nm`, c.step > 20 ? 'warn' : 'ok'],
      ['Over lines, 20% / 80%', `${f0(a.over_line)} / ${f0(c.over_line)} nm`, worn ? 'warn' : ''],
      ['Flat after (20%)', a.t_flat ? `${f1(a.t_flat)} min` : 'not yet'], ['Flat after (80%)', c.t_flat ? `${f1(c.t_flat)} min` : 'not yet', c.t_flat ? '' : 'warn']];
  },
  verdict(s, r) {
    if (r.regions.some((g0) => g0.up < CM.STEP0)) return ['Worn through', false];
    if (r.regions.some((g0) => g0.step > 20)) return ['Still stepped', false];
    return ['Planar', true];
  },
};

const ADAPT = { czochralski, cleaning, oxidation, implant, diffusion, anneal, etch, deposition, cmp, release, damascene, probe, planar };

// ======================= page =======================
const state = { id: 'etch', set: {}, scrub: 2.5, depth: store.get('depth', 'engineer'), playing: false };
let cache = null;

function cur() { return { t: TH[state.id], a: ADAPT[state.id] }; }
function settings() { return state.set[state.id] ||= { ...ADAPT[state.id].defaults }; }
function stageOf(v, n) { const i = Math.min(n - 1, Math.floor(v)); return { i, p: v >= n - 1 ? 1 : smooth(v - i) }; }
const toSlider = (c, v) => (c.type === 'log' ? Math.log10(v) : v);
const fromSlider = (c, x) => (c.type === 'log' ? 10 ** x : +x);

function controls() {
  const { a } = cur(), s = settings();
  $('#prCtl').innerHTML = a.controls.filter((c) => !c.only || Object.entries(c.only).every(([k, v]) => s[k] === v)).map((c) => {
    if (c.type === 'seg') return `<div class="th-ctl"><span id="prL_${c.id}">${esc(c.label)}</span><div class="seg" role="group" aria-labelledby="prL_${c.id}" data-c="${c.id}">${c.options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${s[c.id] === v}">${esc(l)}</button>`).join('')}</div></div>`;
    const lo = toSlider(c, c.min), hi = toSlider(c, c.max), step = c.type === 'log' ? (hi - lo) / 200 : c.step;
    return `<div class="th-ctl"><label for="prI_${c.id}">${esc(c.label)} <output id="prO_${c.id}">${esc(c.fmt(s[c.id]))}</output></label><input type="range" id="prI_${c.id}" data-c="${c.id}" min="${lo}" max="${hi}" step="${step}" value="${toSlider(c, s[c.id])}"></div>`;
  }).join('');
}

function recompute() {
  const { a } = cur(); cache = a.sim(settings());
  document.dispatchEvent(new CustomEvent('tfe:procset', { detail: JSON.parse(JSON.stringify(state.set)) }));   // the Virtual Fab can follow these
}

function draw() {
  const { t, a } = cur(), s = settings(), n = t.stages.length, { i, p } = stageOf(state.scrub, n);
  $('#prXs').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="presentation">${a.draw(s, cache, i, p)}</svg>`;
  const stg = t.stages[i];
  $('#prStageName').textContent = `${i + 1}. ${stg.label}`;
  $('#prStageText').textContent = stg[state.depth];
  $('#prTicks').querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', k === i ? 'step' : 'false'));
  $('#prXs').setAttribute('aria-label', `${t.title}: computed cross-section at stage ${i + 1} of ${n}, ${stg.label}. ${a.read(s, cache).map(([l, v]) => `${l} ${v}`).join('; ')}`);
}

function readouts() {
  const { a } = cur(), s = settings();
  $('#prRead').innerHTML = a.read(s, cache).map(([l, v, c]) => `<div><b class="${c || ''}">${esc(v)}</b>${esc(l)}</div>`).join('');
  const [vt, ok] = a.verdict(s, cache);
  $('#prVerdict').innerHTML = `<span style="color:${ok ? M.ok : M.warn}">${esc(vt)}</span>`;
}

function tex(host, list) {
  host.innerHTML = list.map(() => '<div class="eq"></div>').join('');
  host.querySelectorAll('.eq').forEach((n, k) => { if (window.katex) { try { window.katex.render(list[k], n, { displayMode: true, throwOnError: false, strict: 'ignore' }); } catch { n.textContent = list[k]; } } else n.textContent = list[k]; });
}

const chips = (ids) => ids.filter((k) => REFS[k]).map((k) => `<a href="#ref-${k}" title="${esc(REFS[k].cite)}">${k}</a>`).join('');

function select(id, focus = false) {
  if (!TH[id]) return;
  state.id = id; state.playing = false; $('#prPlay').textContent = '▶';
  const { t, a } = cur(), n = t.stages.length;
  document.querySelectorAll('#prPick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('#prLot').textContent = `Step ${String(AREA_NO[id] * 10).padStart(3, '0')} · area ${String(AREA_NO[id]).padStart(2, '0')}`;
  $('#prTitle').textContent = t.title; $('#prTool').textContent = t.tool;
  $('#prTier').innerHTML = `<span class="tier" data-t="${t.safety_tier}">Tier ${t.safety_tier}</span>`;
  $('#prSolved').textContent = t.solved;
  const sc = $('#prScrub'); sc.max = String(n - 1);
  state.scrub = Math.min(n - 1, Math.max(0, Math.floor(n / 2) + 0.95)); sc.value = String(state.scrub);
  $('#prTicks').innerHTML = t.stages.map((st, k) => `<li><button type="button" data-k="${k}" data-n="${k + 1}"><span>${esc(st.label)}</span></button></li>`).join('');
  $('#prTools').innerHTML = t.tools.map((x) => `<li><b>${esc(x.name)}</b><span class="refchips">${chips(x.refs)}</span></li>`).join('');
  $('#prTimeline').innerHTML = t.timeline.map((e) => `<li><b>${esc(e.when)}</b>${esc(e.event)} <span class="refchips">${chips(e.refs)}</span></li>`).join('');
  $('#prMetro').innerHTML = t.metrology.map((m) => `<li><b>${esc(m.name)}</b>${esc(m.what)}</li>`).join('');
  $('#prLeave').innerHTML = t.leave_out.map((x) => `<li>${esc(x)}</li>`).join('');
  $('#prFails').innerHTML = t.failures.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="false">${esc(f.name)}</button>`).join('') + '<button type="button" data-f="_reset" aria-pressed="false">Reset</button>';
  $('#prFailSay').textContent = 'Pick one to load it into the simulator.';
  $('#prRefs').innerHTML = chips(t.refs);
  $('#prModel').innerHTML = `Model: <code>sim/transistor_sim/physics/${esc(a.model)}</code>, twin <code>site/js/physics/${esc(a.model.replace('.py', '.js'))}</code>, checked in CI.`;
  const ph = PHOTOS.find((x) => x.file === t.photos.result);
  $('#prPhoto').innerHTML = ph ? `<img src="${esc(ph.src)}" alt="${esc(ph.subject)}" loading="lazy"><figcaption>Where every layer ends up: ${esc(ph.subject)}, ${ph.year}. <a href="${esc(ph.page)}" rel="noopener">${esc(ph.author === 'see source' ? 'Wikimedia Commons' : ph.author)}, ${esc(ph.license)}</a></figcaption>` : '';
  tex($('#prEq'), a.eq);
  controls(); recompute(); readouts(); draw();
  if (focus) document.querySelector(`#prPick button[data-id="${id}"]`)?.focus();
}

let raf = 0;
function play() {
  const { t } = cur(), n = t.stages.length;
  if (state.playing) { state.playing = false; $('#prPlay').textContent = '▶'; return; }
  if (reduceMotion()) { state.scrub = Math.min(n - 1, Math.floor(state.scrub) + 1); $('#prScrub').value = String(state.scrub); draw(); return; }
  state.playing = true; $('#prPlay').textContent = '❚❚';
  if (state.scrub >= n - 1.001) state.scrub = 0;
  let last = performance.now();
  const step = (now) => {
    if (!state.playing) return;
    state.scrub = Math.min(n - 1, state.scrub + (now - last) / 1600); last = now;
    $('#prScrub').value = String(state.scrub); draw();
    if (state.scrub >= n - 1) { state.playing = false; $('#prPlay').textContent = '▶'; return; }
    raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
}

export function init() {
  $('#prPick').innerHTML = IDS.filter((id) => TH[id]).map((id) => `<button type="button" data-id="${id}" aria-pressed="false">${String(AREA_NO[id]).padStart(2, '0')} ${esc({ czochralski: 'Crystal', cleaning: 'Clean', oxidation: 'Oxidation', implant: 'Implant', diffusion: 'Diffusion', anneal: 'Anneal', etch: 'Etch', deposition: 'Deposition', cmp: 'CMP', release: 'Release', damascene: 'Copper', probe: 'Probe', planar: 'Planar 1959' }[id])}</button>`).join('');
  $('#prPick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) select(b.dataset.id); });
  $('#prCtl').addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const id = b.parentElement.dataset.c; settings()[id] = b.dataset.v;
    controls(); recompute(); readouts(); draw();
    document.querySelector(`#prCtl [data-c="${id}"] button[data-v="${b.dataset.v}"]`)?.focus();
  });
  $('#prCtl').addEventListener('input', (e) => {
    const inp = e.target.closest('input[type=range]'); if (!inp) return;
    const c = cur().a.controls.find((x) => x.id === inp.dataset.c), v = fromSlider(c, inp.value);
    settings()[c.id] = v; $(`#prO_${c.id}`).textContent = c.fmt(v);
    recompute(); readouts(); draw();
  });
  $('#prScrub').addEventListener('input', (e) => { state.playing = false; $('#prPlay').textContent = '▶'; state.scrub = +e.target.value; draw(); });
  $('#prTicks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.scrub = +b.dataset.k + 0.999; $('#prScrub').value = String(state.scrub); draw(); });
  $('#prPlay').addEventListener('click', play);
  $('#prDepth').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; state.depth = b.dataset.depth; store.set('depth', state.depth);
    $('#prDepth').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw();
  });
  $('#prDepth').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.depth === state.depth)));
  $('#prFails').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const { t, a } = cur();
    if (b.dataset.f === '_reset') { state.set[state.id] = { ...a.defaults }; $('#prFailSay').textContent = 'Back to the default settings.'; }
    else { const f = t.failures.find((x) => x.id === b.dataset.f); state.set[state.id] = { ...a.defaults, ...f.demo }; $('#prFailSay').textContent = f.what; }   // each demo starts from the defaults, so its text holds
    $('#prFails').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b && b.dataset.f !== '_reset')));
    const n = t.stages.length; state.scrub = n - 1; $('#prScrub').value = String(state.scrub);
    controls(); recompute(); readouts(); draw();
    const v = new Set(store.get('visited', [])); v.add(t.area); store.set('visited', [...v]);
  });
  const fromHash = () => { const m = location.hash.match(/^#proc-(\w+)/); if (m && TH[m[1]]) { select(m[1]); return true; } return false; };
  addEventListener('hashchange', fromHash);
  if (!fromHash()) select(state.id);
}

// exported for tests
export const _adapters = ADAPT;
