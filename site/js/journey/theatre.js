// Lithography theatre. The cross-section is computed, not drawn: the aerial image comes from the
// Fourier-optics model (physics/litho.js, twin of litho.py), the resist clears where dose × intensity
// passes a threshold, and photon shot noise is counted in 2 nm × 2 nm cells. The same grid feeds the
// 2D section (its middle row) and the 3D isometric view (all rows), so line-edge roughness in 3D is the
// same randomness that moves the edges in 2D.
import { THEATRES, PHOTOS, CANDIDATES } from './data.js';
import { aerialImage, contrast, k1, halfPitch, depthOfFocus, photonsPerNm2 } from '../physics/litho.js';
import { mulberry32 } from '../physics/yieldcost.js';
import { esc, store, reduceMotion } from './util.js';

const T = THEATRES.find((t) => t.id === 'lithography');
const $ = (s) => document.querySelector(s);
const E0 = 9;                       // dose to clear, mJ/cm² (teaching value)
const CELL = 2;                     // shot-noise cell side, nm
const COLS = 180, ROWS = 40, PERIODS = 3;
const C = { si: '#4b596d', ox: '#8fcfd4', resist: '#e07fb0', exposed: '#f2b84b', mask: '#8a94a3', uv: '#b58fd6', bg: '#0c1016', ink: '#e8ecf1', ink2: '#aab3c0', muted: '#8a94a3', amber: '#f2b84b', line: '#232a34' };

// a fixed field of standard normals so moving a slider never re-rolls the dice
const NORMALS = (() => { const r = mulberry32(20261104), n = new Float32Array(4096 * 64); for (let i = 0; i < n.length; i += 2) { const u = Math.max(r(), 1e-12), v = r(), m = Math.sqrt(-2 * Math.log(u)); n[i] = m * Math.cos(2 * Math.PI * v); n[i + 1] = m * Math.sin(2 * Math.PI * v); } return n; })();

const state = { tool: 'euv', kind: 'dipole', pitch: 32, defocus: 0, dose: 30, stage: 2.6, view: 'xs', depth: 'engineer', playing: false };

function toolOf(id) { return T.tools.find((t) => t.id === id); }
function pitchRange(t) { const p0 = t.lam / t.NA; return [Math.ceil(p0 * 0.4), Math.ceil(p0 * 2)]; }

/** Run the model for the current settings: aerial image, clear grid, readouts. */
export function simulate(s = state) {
  const t = toolOf(s.tool), p = s.pitch;
  const sigmaC = Math.min(0.95, t.lam / (2 * p * t.NA));
  const opt = s.kind === 'dipole' ? { kind: 'dipole', sigmaC, sigmaW: 0.05 } : { kind: 'conventional', sigma: 0.7 };
  const { x, I } = aerialImage(p, { lam: t.lam, NA: t.NA, defocus: s.defocus, npts: COLS, periods: PERIODS, ...opt });
  const span = PERIODS * p, dx = span / (COLS - 1);
  const ph = photonsPerNm2(s.dose, t.lam);            // photons / nm² at full intensity
  const cellsAcross = Math.max(1, Math.round(span / CELL));
  const clear = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  const expo = Array.from({ length: ROWS }, () => new Float32Array(COLS));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = Math.min(cellsAcross - 1, Math.floor(x[c] / CELL));
    const n = ph * Math.max(I[c], 1e-6) * CELL * CELL;  // mean photons in this cell
    const g = NORMALS[(r * 4096 + cell) % NORMALS.length];
    const e = s.dose * I[c] * (1 + g / Math.sqrt(n));
    expo[r][c] = e; clear[r][c] = e > E0 ? 1 : 0;
  }
  // per row: spaces printed, their mean width, bridges and breaks. Runs and gaps shorter than a few
  // nanometres are edge roughness, not a new feature, so they are merged before counting.
  const widths = []; let badRows = 0;
  const minLen = Math.max(2, Math.round(Math.max(1.5 * CELL, 0.06 * p) / dx));
  for (let r = 0; r < ROWS; r++) {
    const runs = [];
    for (let c = 0; c < COLS; c++) if (clear[r][c]) { const L = runs[runs.length - 1]; if (L && L[1] === c) L[1] = c + 1; else runs.push([c, c + 1]); }
    for (let k = runs.length - 1; k > 0; k--) if (runs[k][0] - runs[k - 1][1] < minLen) { runs[k - 1][1] = runs[k][1]; runs.splice(k, 1); }
    const big = runs.filter(([a, b]) => b - a >= minLen);
    let n = big.length, total = big.reduce((t, [a, b]) => t + b - a, 0);
    if (n > 1 && big[0][0] === 0 && big[n - 1][1] === COLS) n--;           // half spaces at both ends are one space
    if (n !== PERIODS || total === 0 || total >= COLS - 1) badRows++; else widths.push(total * dx / PERIODS);
  }
  const mean = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
  const sd = widths.length > 1 ? Math.sqrt(widths.reduce((a, b) => a + (b - mean) ** 2, 0) / (widths.length - 1)) : 0;
  const cont = contrast(I);
  const verdict = cont < 0.05 || widths.length === 0 ? 'none' : badRows === 0 && cont > 0.15 ? 'pass' : 'defects';
  return { t, x, I, clear, expo, dx, span, cont, k1: k1(p, t.lam, t.NA), cd: mean, lwr3: 3 * sd, badRows, verdict,
    pmin: 2 * halfPitch(t.lam, t.NA), dof: depthOfFocus(t.lam, t.NA), ph, cellN: ph * CELL * CELL };
}

// ---------- drawing ----------
function setup(cv) {
  const dpr = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const w = Math.max(280, r.width), h = Math.max(200, r.height);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
}
const smooth = (a) => a * a * (3 - 2 * a);
function stageOf(s) { const i = Math.min(6, Math.floor(s)); return { i, p: s >= 6 ? 1 : smooth(s - i) }; }

/** Heights (fractions of layer thickness) of resist and oxide in one column at stage s. */
function column(sim, r, c, s) {
  const { i, p } = stageOf(s), cl = sim.clear[r][c];
  let resist = 1, ox = 1;
  if (i === 0) { const half = (1 - Math.abs(c / (COLS - 1) - 0.5) * 2); resist = half <= 1 - p ? 0 : 1; if (p < 0.02) resist = 0; resist *= Math.min(1, 0.4 + p); }
  if (i === 4 && cl) resist = 1 - p;
  if (i >= 5 && cl) resist = 0;
  if (i === 5 && cl) ox = 1 - p;
  if (i >= 6) { if (cl) ox = 0; resist = 1 - p; }
  return { resist, ox };
}

function drawSection(ctx, w, h, sim, s) {
  const { i, p } = stageOf(s), r0 = ROWS >> 1;
  backdrop(ctx, w, h);
  const L = 18, R = w - 18, cw = (R - L) / COLS;
  const ySi = h * 0.74, tOx = h * 0.07, tRes = h * 0.13, yOx = ySi - tOx, yRes = yOx - tRes;
  const yMask = h * 0.2, yImg = h * 0.43;
  // silicon (with a faint lattice texture) and oxide
  const gSi = ctx.createLinearGradient(0, ySi, 0, h - 14); gSi.addColorStop(0, '#5a6a82'); gSi.addColorStop(1, '#2e3847');
  ctx.fillStyle = gSi; ctx.fillRect(L, ySi, R - L, h - ySi - 14);
  ctx.fillStyle = 'rgba(232,236,241,.10)';
  for (let yy = ySi + 6; yy < h - 18; yy += 7) for (let xx = L + ((yy / 7) % 2) * 3.5 + 2; xx < R; xx += 7) ctx.fillRect(xx, yy, 1.4, 1.4);
  for (let c = 0; c < COLS; c++) {
    const col = column(sim, r0, c, s), x = L + c * cw;
    ctx.fillStyle = C.ox; ctx.fillRect(x, ySi - tOx * col.ox, cw + 0.6, tOx * col.ox);
    if (col.resist > 0) {
      let fill = C.resist;
      if (i >= 2 && i <= 4) {
        const k = Math.min(1, sim.expo[r0][c] / E0) * (i === 2 ? p : 1);
        fill = k >= 1 && i >= 3 ? C.exposed : mix(C.resist, C.exposed, Math.min(1, k * 0.85));
      }
      ctx.fillStyle = fill; ctx.fillRect(x, yOx - tRes * col.resist, cw + 0.6, tRes * col.resist);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, yOx - tRes * col.resist, cw + 0.6, 1.5);
    } else if (col.ox > 0) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, ySi - tOx * col.ox, cw + 0.6, 1.2); }
  }
  // soft shading so the stack reads as a solid, not flat bands
  const gSh = ctx.createLinearGradient(0, yRes, 0, ySi); gSh.addColorStop(0, 'rgba(255,255,255,0)'); gSh.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = gSh; ctx.fillRect(L, yRes, R - L, ySi - yRes);
  // stage effects
  if (i === 3) { const a = Math.sin(p * Math.PI) * 0.45; const g = ctx.createLinearGradient(0, ySi, 0, h); g.addColorStop(0, `rgba(224,127,63,${a})`); g.addColorStop(1, 'rgba(224,127,63,0)'); ctx.fillStyle = g; ctx.fillRect(L, ySi, R - L, h - ySi); label(ctx, 'hot plate', L + 4, h - 22, 'left', `rgba(240,162,107,${0.4 + a})`); }
  if (i === 4) { const a = Math.sin(p * Math.PI) * 0.3; ctx.fillStyle = `rgba(127,211,208,${a})`; ctx.fillRect(L, yRes - h * 0.05, R - L, h * 0.05 + tRes); if (a > 0.08) label(ctx, 'developer', L + 4, yRes - h * 0.05 - 4, 'left', C.ox); }
  if (i === 1) { const a = Math.sin(p * Math.PI) * 0.5; const g = ctx.createLinearGradient(0, ySi, 0, h); g.addColorStop(0, `rgba(224,127,63,${a})`); g.addColorStop(1, 'rgba(224,127,63,0)'); ctx.fillStyle = g; ctx.fillRect(L, ySi, R - L, h - ySi); }
  if (i === 2) {
    // mask: clear openings centred on x = k·pitch (binary mask, duty 0.5)
    const p0 = sim.span / PERIODS;
    ctx.fillStyle = C.mask; ctx.fillRect(L, yMask, R - L, 10);
    ctx.fillStyle = C.bg;
    for (let k = 0; k <= PERIODS; k++) { const xc = L + (k * p0) / sim.span * (R - L); ctx.fillRect(xc - (p0 / 4) / sim.span * (R - L), yMask - 1, (p0 / 2) / sim.span * (R - L), 12); }
    // projection optics above the mask: a lens and the cone of light it focuses (schematic)
    const cx = (L + R) / 2, lw = Math.min((R - L) * 0.32, 220), ly = yMask - h * 0.1;
    const cone = ctx.createLinearGradient(0, 0, 0, yMask); cone.addColorStop(0, 'rgba(181,143,214,0)'); cone.addColorStop(1, `rgba(181,143,214,${0.22 * p})`);
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(cx - lw / 2, ly); ctx.lineTo(cx + lw / 2, ly); ctx.lineTo(R, yMask); ctx.lineTo(L, yMask); ctx.closePath(); ctx.fill();
    const lg = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0); lg.addColorStop(0, 'rgba(143,207,212,.25)'); lg.addColorStop(.5, 'rgba(220,240,245,.65)'); lg.addColorStop(1, 'rgba(143,207,212,.25)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(cx, ly, lw / 2, Math.max(5, h * 0.022), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(232,236,241,.5)'; ctx.lineWidth = 1; ctx.stroke();
    label(ctx, `${sim.t.name || 'scanner'} · λ ${sim.t.lam} nm · NA ${sim.t.NA}`, cx, ly - h * 0.03, 'center', C.ink2);
    // light falling through: drawn as the aerial intensity itself
    for (let c = 0; c < COLS; c++) { const a = Math.min(1, sim.I[c]) * 0.45 * p; ctx.fillStyle = `rgba(181,143,214,${a})`; ctx.fillRect(L + c * cw, yMask + 10, cw + 0.6, yRes - yMask - 10); }
    label(ctx, 'mask', R - 4, yMask - 6, 'right');
  }
  if (i >= 2 && i <= 3) {
    // the aerial image curve and the clearing threshold
    const top = yImg - h * 0.15, bot = yImg + h * 0.02, Imax = Math.max(1.2, ...sim.I);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 2; ctx.beginPath();
    for (let c = 0; c < COLS; c++) { const X = L + c * cw, Y = bot - (sim.I[c] / Imax) * (bot - top); c ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    const yt = bot - (E0 / state.dose / Imax) * (bot - top);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, yt); ctx.lineTo(R, yt); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'aerial image', L + 4, top - 4); label(ctx, 'clears above this line', R - 4, yt - 5, 'right');
  }
  if (i === 5) { const a = Math.sin(p * Math.PI) * 0.35; ctx.fillStyle = `rgba(181,143,214,${a})`; ctx.fillRect(L, yRes - h * 0.18, R - L, h * 0.18); label(ctx, 'plasma', L + 4, yRes - h * 0.18 + 14); }
  // layer labels
  label(ctx, 'silicon', L + 6, ySi + 18, 'left', C.ink);
  label(ctx, 'oxide', L + 6, ySi - 4, 'left', '#0a0d11');
  if (i < 6 || p < 0.5) label(ctx, 'resist', L + 6, yOx - tRes + 14, 'left', '#1a0b14');
  // CD marker on the inspected pattern
  if (i >= 4 && sim.verdict !== 'none') {
    const row = sim.clear[r0]; let a = -1, b = -1;
    let c = Math.floor(COLS / 3); while (c < COLS && row[c]) c++;
    for (; c < COLS; c++) { if (row[c] && a < 0) a = c; if (a >= 0 && !row[c]) { b = c; break; } }
    if (a >= 0 && b > a) {
      const x1 = L + a * cw, x2 = L + b * cw, y = ySi + 34;
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6); ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6); ctx.stroke();
      label(ctx, `CD ${((b - a) * sim.dx).toFixed(1)} nm`, (x1 + x2) / 2, y + 18, 'center', C.amber);
    }
  }
  scaleBar(ctx, sim, L, R, h);
}

function drawIso(ctx, w, h, sim, s) {
  backdrop(ctx, w, h);
  const cols = 90, step = COLS / cols, rows = ROWS;
  const sx = Math.min(w * 0.62, h * 1.25) / cols, sy = sx * 1.1, zs = h * 0.09;
  const ox = w * 0.5 - (cols * sx * 0.866 - rows * sy * 0.866) / 2, oy = h * 0.22;
  const P = (cx, ry, z) => [ox + (cx * sx - ry * sy) * 0.866, oy + (cx * sx + ry * sy) * 0.5 - z * zs];
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  // silicon slab
  const zSi = 1.2;
  poly([P(0, 0, 0), P(cols, 0, 0), P(cols, rows, 0), P(0, rows, 0)], '#1a222d');
  poly([P(0, rows, 0), P(cols, rows, 0), P(cols, rows, zSi), P(0, rows, zSi)], shade(C.si, 0.85));
  poly([P(cols, 0, 0), P(cols, rows, 0), P(cols, rows, zSi), P(cols, 0, zSi)], shade(C.si, 0.65));
  poly([P(0, 0, zSi), P(cols, 0, zSi), P(cols, rows, zSi), P(0, rows, zSi)], C.si);
  const tOx = 0.45, tRes = 0.85;
  // draw back to front: rows from 0 (far) to rows-1 (near), columns left to right
  for (let r = 0; r < rows; r++) {
    const runs = [];
    for (let c = 0; c < cols; c++) {
      const cc = Math.min(COLS - 1, Math.round(c * step)), col = column(sim, r, cc, s);
      const key = col.ox.toFixed(3) + '|' + col.resist.toFixed(3);
      if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].b = c + 1; else runs.push({ a: c, b: c + 1, key, ...col });
    }
    for (const u of runs) {
      const z0 = zSi, z1 = z0 + tOx * u.ox, z2 = z1 + tRes * u.resist;
      if (u.ox > 0) prism(u.a, u.b, r, z0, z1, C.ox);
      if (u.resist > 0) prism(u.a, u.b, r, z1, z2, resistColour(sim, r, Math.round(((u.a + u.b) / 2) * step), s));
    }
  }
  function prism(a, b, r, z0, z1, fill) {
    poly([P(a, r + 1, z0), P(b, r + 1, z0), P(b, r + 1, z1), P(a, r + 1, z1)], shade(fill, 0.78));
    poly([P(b, r, z0), P(b, r + 1, z0), P(b, r + 1, z1), P(b, r, z1)], shade(fill, 0.6));
    poly([P(a, r, z1), P(b, r, z1), P(b, r + 1, z1), P(a, r + 1, z1)], fill);
  }
  // soft ground shadow is drawn first in a real renderer; here a light wash from the upper left
  const wash = ctx.createLinearGradient(0, 0, w, h); wash.addColorStop(0, 'rgba(255,255,255,.05)'); wash.addColorStop(.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
  let lx = 18;
  [['resist', C.resist], ['exposed resist', C.exposed], ['oxide', C.ox], ['silicon', C.si]].forEach(([t, col]) => {
    ctx.fillStyle = col; ctx.fillRect(lx, 14, 10, 10); label(ctx, t, lx + 15, 23, 'left', C.ink2); lx += 15 + ctx.measureText(t).width + 18;
  });
  label(ctx, `${(sim.span).toFixed(0)} nm across · ${(rows * sim.span / COLS * step).toFixed(0)} nm deep`, 18, h - 14, 'left', C.muted);
}

function backdrop(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#111823'); g.addColorStop(1, '#0a0d12');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const r = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.6);
  r.addColorStop(0, 'rgba(181,143,214,.07)'); r.addColorStop(1, 'rgba(181,143,214,0)'); ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
}

function resistColour(sim, r, c, s) {
  const { i, p } = stageOf(s);
  if (i < 2 || i > 4) return C.resist;
  const k = Math.min(1, sim.expo[r][Math.min(COLS - 1, c)] / E0) * (i === 2 ? p : 1);
  return k >= 1 && i >= 3 ? C.exposed : mix(C.resist, C.exposed, Math.min(1, k * 0.85));
}

function scaleBar(ctx, sim, L, R, h) {
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((v) => v >= sim.span / 6) || 1000;
  const px = nice / sim.span * (R - L), y = h - 8;
  ctx.fillStyle = C.ink2; ctx.fillRect(R - px, y - 2, px, 2);
  label(ctx, `${nice} nm`, R - px / 2, y - 6, 'center', C.ink2);
}
function label(ctx, t, x, y, align = 'left', col = C.ink2) { ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(t, x, y); }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(',')})`; }
function shade(c, k) { const A = c.startsWith('rgb') ? c.match(/\d+/g).map(Number) : hex(c); return `rgb(${A.map((v) => Math.round(v * k)).join(',')})`; }

// ---------- page wiring ----------
export function init(section) {
  const cv = $('#thCanvas'), scrub = $('#thScrub'), say = $('#thStageText'), sayH = $('#thStageName');
  $('#lithoSolved').textContent = T.solved;
  // controls
  $('#thToolSel').innerHTML = T.tools.map((t) => `<option value="${t.id}">${esc(t.name)} · ${t.lam} nm · NA ${t.NA.toFixed(2)}</option>`).join('');
  $('#thTicks').innerHTML = T.stages.map((st, k) => `<li><button type="button" data-k="${k}" data-n="${k + 1}"><span>${esc(st.label)}</span></button></li>`).join('');
  $('#thFails').innerHTML = T.failures.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="false">${esc(f.name)}</button>`).join('');
  $('#thMetro').innerHTML = T.metrology.map((m) => `<li><b>${esc(m.name)}</b>${esc(m.what)}</li>`).join('');
  $('#thTimeline').innerHTML = T.timeline.map((e) => `<li><b>${esc(e.when)}</b>${esc(e.event)} <span class="refchips">${e.refs.map((k) => `<a href="#ref-${k}">${k}</a>`).join('')}</span></li>`).join('');
  $('#thLeave').innerHTML = T.leave_out.map((t) => `<li>${esc(t)}</li>`).join('');
  photos();

  const pitch = $('#thPitch'), focus = $('#thFocus'), dose = $('#thDose');
  const setTool = (id, keepPitch = false) => {
    state.tool = id; const t = toolOf(id), [a, b] = pitchRange(t);
    pitch.min = a; pitch.max = b; pitch.step = t.lam < 50 ? 0.5 : 1;
    if (!keepPitch) state.pitch = Math.round(2 * 0.36 * t.lam / t.NA);
    state.pitch = Math.min(b, Math.max(a, state.pitch)); pitch.value = state.pitch;
    const dof = depthOfFocus(t.lam, t.NA); focus.min = 0; focus.max = Math.round(dof * 1.6); focus.step = Math.max(0.5, Math.round(dof / 40));
    state.defocus = Math.min(state.defocus, +focus.max); focus.value = state.defocus;
    $('#thToolSel').value = id; $('#thTool').textContent = t.lam < 50 ? 'EUV scanner' : 'Optical scanner';
  };
  setTool(state.tool);
  $('#thToolSel').addEventListener('change', (e) => { clearFail(); setTool(e.target.value); render(); });
  pitch.addEventListener('input', () => { clearFail(); state.pitch = +pitch.value; render(); });
  focus.addEventListener('input', () => { clearFail(); state.defocus = +focus.value; render(); });
  dose.addEventListener('input', () => { clearFail(); state.dose = +dose.value; render(); });
  $('#thIllum').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; clearFail(); state.kind = b.dataset.k; press('#thIllum', b); render(); });
  section.querySelector('.th-views').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.view = b.dataset.view; press('.th-views', b); render(); });
  $('#thDepth').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.depth = b.dataset.depth; press('#thDepth', b); store.set('depth', state.depth); text(); });
  const savedDepth = store.get('depth', 'engineer'); if (['beginner', 'engineer', 'process'].includes(savedDepth)) { state.depth = savedDepth; press('#thDepth', section.querySelector(`[data-depth="${savedDepth}"]`)); }
  $('#thTicks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stop(); state.stage = +b.dataset.k + 0.999; if (+b.dataset.k === 6) state.stage = 6; scrub.value = state.stage; render(); });
  scrub.addEventListener('input', () => { stop(); state.stage = +scrub.value; render(); });
  $('#thFails').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const f = T.failures.find((x) => x.id === b.dataset.f), d = f.demo;
    stop(); state.kind = d.kind || 'dipole'; press('#thIllum', section.querySelector(`#thIllum [data-k="${state.kind}"]`));
    setTool(d.tool || state.tool, true);
    const t = toolOf(state.tool);
    if (d.pitchK1) { state.pitch = Math.max(+pitch.min, Math.round(2 * d.pitchK1 * t.lam / t.NA)); pitch.value = state.pitch; }
    state.defocus = d.defocusDOF ? Math.min(+focus.max, Math.round(depthOfFocus(t.lam, t.NA) * d.defocusDOF)) : 0; focus.value = state.defocus;
    state.dose = d.dose || 30; dose.value = state.dose;
    state.stage = 4.999; scrub.value = state.stage;
    press('#thFails', b); $('#thFailSay').textContent = f.what; render();
  });
  function clearFail() { section.querySelectorAll('#thFails button').forEach((x) => x.setAttribute('aria-pressed', 'false')); }

  // play
  const play = $('#thPlay'); let last = 0;
  const tick = (now) => {
    if (!state.playing) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    state.stage = Math.min(6, state.stage + dt * 0.55); scrub.value = state.stage; render();
    if (state.stage >= 6) { stop(); return; }
    requestAnimationFrame(tick);
  };
  function stop() { state.playing = false; play.textContent = '▶'; play.setAttribute('aria-label', 'Play the process'); }
  play.addEventListener('click', () => {
    if (state.playing) return stop();
    if (state.stage >= 6) state.stage = 0;
    state.playing = true; last = 0; play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause'); requestAnimationFrame(tick);
  });
  if (!reduceMotion()) {
    new IntersectionObserver(([e], io) => { if (e.isIntersecting && !state.started) { state.started = true; state.stage = 0; scrub.value = 0; play.click(); io.disconnect(); } }, { threshold: 0.45 }).observe(cv);
  }
  new ResizeObserver(() => render()).observe(cv);

  let sim = null, simKey = '';
  function render() {
    const key = [state.tool, state.kind, state.pitch, state.defocus, state.dose].join('|');
    if (key !== simKey) { sim = simulate(); simKey = key; readouts(sim); }
    const photo = state.view === 'photo';
    $('#thPhoto').hidden = !photo; cv.style.visibility = photo ? 'hidden' : 'visible';
    if (!photo) { const { ctx, w, h } = setup(cv); (state.view === 'iso' ? drawIso : drawSection)(ctx, w, h, sim, state.stage); }
    cv.setAttribute('aria-label', `${state.view === 'iso' ? 'Isometric view' : 'Cross-section'} at stage ${T.stages[stageOf(state.stage).i].label}: ${sim.t.name}, pitch ${state.pitch} nm, ${verdictText(sim)}`);
    text(); stamp(sim);
  }
  function text() {
    const { i } = stageOf(state.stage), st = T.stages[i];
    sayH.textContent = `Stage ${i + 1} of ${T.stages.length} · ${st.label}`; say.textContent = st[state.depth];
    section.querySelectorAll('#thTicks button').forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  }
  function stamp(sim) {
    const { i } = stageOf(state.stage), host = $('#thStamp');
    const cls = sim.verdict === 'pass' ? 'good' : 'hold', word = sim.verdict === 'pass' ? 'Pass' : 'Hold';
    const html = i >= 6 && stageOf(state.stage).p > 0.6 ? `<span class="stamp ${cls}${reduceMotion() ? '' : ' land'}">${word}<small>${sim.verdict === 'pass' ? 'CD ok' : sim.verdict === 'none' ? 'no image' : sim.badRows + ' rows'}</small></span>` : '';
    if (host.dataset.v !== html) { host.innerHTML = html; host.dataset.v = html; }
    if (html && sim.verdict === 'pass') {
      const so = $('#thSignoff'); so.className = 'stamp sm good'; so.textContent = 'Pass';
      const passed = new Set(store.get('passed', [])); if (!passed.has('lithography')) { passed.add('lithography'); store.set('passed', [...passed]); dispatchEvent(new Event('tfe:progress')); }
    }
  }
  render();
}

function verdictText(sim) { return sim.verdict === 'pass' ? 'pattern prints' : sim.verdict === 'none' ? 'nothing prints' : `${sim.badRows} of ${ROWS} rows bridge or break`; }

function readouts(sim) {
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const rows = [
    ['k₁', f(sim.k1, 3), sim.k1 < 0.25 ? 'warn' : ''],
    ['image contrast', f(sim.cont, 2), sim.cont < 0.15 ? 'warn' : ''],
    ['printed space (CD)', sim.cd ? f(sim.cd) + ' nm' : '—', ''],
    ['edge roughness, 3σ', sim.cd ? f(sim.lwr3) + ' nm' : '—', sim.cd && sim.lwr3 > 0.1 * sim.cd ? 'warn' : ''],
    ['single-exposure limit λ/2NA', f(sim.pmin) + ' nm', ''],
    ['depth of focus λ/NA²', f(sim.dof, 0) + ' nm', ''],
    ['photons per nm²', f(sim.ph, sim.ph < 100 ? 1 : 0), ''],
    [`noise in a ${CELL} nm cell`, '±' + f(100 / Math.sqrt(sim.cellN), 1) + ' %', 100 / Math.sqrt(sim.cellN) > 8 ? 'warn' : ''],
  ];
  $('#thRead').innerHTML = rows.map(([l, v, c]) => `<div><b class="${c}">${v}</b>${l}</div>`).join('');
  $('#thVerdictText').textContent = sim.verdict === 'pass' ? 'Pass' : sim.verdict === 'none' ? 'Hold: no image' : 'Hold: defects';
  $('#thGen').innerHTML = '<thead><tr><th>Light</th><th class="sym">λ</th><th>NA</th><th class="sym">λ/2NA</th><th>DOF</th><th>photons/nm²</th></tr></thead><tbody>'
    + T.tools.map((t) => `<tr class="${t.id === state.tool ? 'on' : ''}"><td><b>${esc(t.name)}</b></td><td>${t.lam} nm</td><td>${t.NA.toFixed(2)}</td><td>${(t.lam / (2 * t.NA)).toFixed(1)} nm</td><td>${depthOfFocus(t.lam, t.NA).toFixed(0)} nm</td><td>${photonsPerNm2(30, t.lam).toFixed(0)}</td></tr>`).join('') + '</tbody>';
  $('#thPitchO').textContent = `${state.pitch} nm`;
  $('#thFocusO').textContent = `${(+state.defocus).toFixed(1)} nm`;
  $('#thDoseO').textContent = `${state.dose} mJ/cm²`;
}

function photos() {
  const im = PHOTOS.find((p) => p.file === T.photos.result);
  const cands = T.photos.tool_candidates.map((id) => CANDIDATES[id]).filter(Boolean);
  $('#thPhoto').innerHTML = (im ? `<figure><img src="${im.src}" alt="${esc(im.subject)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><figcaption>The result: ${esc(im.subject)}. ${esc(im.author)}, ${esc(im.license)}, <a href="${im.page}" rel="noopener">Wikimedia Commons</a>.</figcaption></figure>` : '')
    + `<div class="pending"><p>The tool photo is waiting for a licence check, so it is not shown yet.</p><ul>${cands.map((c) => `<li>${esc(c.subject || c.file)} · ${esc(c.status)}</li>`).join('')}</ul></div>`;
}

function press(sel, b) { document.querySelectorAll(`${sel} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
