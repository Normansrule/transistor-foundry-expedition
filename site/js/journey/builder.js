// 3D layer builder (roadmap item 6): planar → FinFET → nanosheet → CFET, built one process step at a
// time and drawn to scale in nanometres. Geometry comes from physics/builder.js (twin of
// sim/transistor_sim/physics/builder.py); dimensions and step texts from data/builder.json.
// Drawn as SVG with a painter's sort: the boxes alive at any step never overlap, so for every pair
// whose drawings overlap there is an axis that separates them and decides which is in front.
import { BUILDER, REFS } from './data.js';
import { build, alive, metrics, layout } from '../physics/builder.js';
import { esc, store, reduceMotion } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const COL = { // §9.3 material colours
  si: '#4b596d', sich: '#7b8ca5', sige: '#b58fd6', sti: '#6fa9b3', poly: '#c95c50', spacer: '#cfd6e0', ispacer: '#a9b4c4',
  n: '#3f7fe0', p: '#e07f3f', highk: '#9a80dc', metal: '#e2b650', oxide: '#8fcfd4', contact: '#c9d1db',
  wall: '#9be0c9', rail: '#d9825b',
};
const MAT = BUILDER.materials;
const ARCH = Object.fromEntries(BUILDER.archs.map((a) => [a.id, a]));
const BOXES = Object.fromEntries(BUILDER.archs.map((a) => [a.id, build(a)]));
const MET = Object.fromEntries(BUILDER.archs.map((a) => [a.id, metrics(a)]));
const CUTS = [['whole', 'Whole'], ['along', 'Cut along the channel'], ['across', 'Cut through the gate']];
const DIM_LABEL = {
  cpp: 'contacted gate pitch', lg: 'gate length', w: 'channel width', fin_pitch: 'fin pitch', fin_h: 'fin height', fin_w: 'fin width',
  nfin: 'fins per transistor', sheets: 'sheets per transistor', sheet_t: 'sheet thickness', sheet_w: 'sheet width', gap: 'gap between sheets',
  mid: 'gap between the n and p tiers', wall: 'dielectric wall between n and p', spacer: 'spacer thickness', eot: 'equivalent oxide thickness',
};
const SHOW = ['cpp', 'lg', 'w', 'fin_pitch', 'fin_h', 'fin_w', 'nfin', 'sheets', 'sheet_t', 'sheet_w', 'wall', 'gap', 'mid', 'eot'];

const state = { arch: store.get('bld:arch', 'nanosheet'), step: 0, cut: store.get('bld:cut', 'along'), A: 'planar_45', B: 'nanosheet' };
if (!ARCH[state.arch]) state.arch = 'nanosheet';
if (!CUTS.some((c) => c[0] === state.cut)) state.cut = 'along';
let tour = null;

// ---------- drawing ----------
const AX = { x: [Math.cos(0.32), Math.sin(0.32)], y: [-Math.cos(0.7), Math.sin(0.7)] };   // screen direction of +x and +y
const proj = (x, y, z, s) => [(x * AX.x[0] + y * AX.y[0]) * s, (x * AX.x[1] + y * AX.y[1]) * s - z * s];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * k))).join(',')})`; };

function cutBoxes(a, boxes, cut) {
  if (cut === 'whole') return boxes;
  if (cut === 'across') return boxes.map((b) => (b[1] >= 0 ? null : b[2] > 0 ? [...b.slice(0, 2), 0, ...b.slice(3)] : b)).filter(Boolean);
  const L = layout(a), f = L.act[Math.floor(L.act.length / 2)], yc = (f[0] + f[1]) / 2;
  return boxes.map((b) => (b[3] >= yc ? null : b[4] > yc ? [...b.slice(0, 4), yc, ...b.slice(5)] : b)).filter(Boolean);
}

function painterOrder(bs, s) {
  const n = bs.length, rect = bs.map((b) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [b[1], b[2]]) for (const y of [b[3], b[4]]) for (const z of [b[5], b[6]]) {
      const [u, v] = proj(x, y, z, s); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
    }
    return [x0, y0, x1, y1];
  });
  const after = Array.from({ length: n }, () => []), deg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const r = rect[i], q = rect[j];
    if (r[2] <= q[0] + 0.01 || q[2] <= r[0] + 0.01 || r[3] <= q[1] + 0.01 || q[3] <= r[1] + 0.01) continue;
    const p = bs[i], o = bs[j];
    let first = null;                                 // the box farther from the viewer is drawn first
    for (let k = 0; k < 3 && first === null; k++) {
      if (p[2 * k + 2] <= o[2 * k + 1] + 1e-9) first = i; else if (o[2 * k + 2] <= p[2 * k + 1] + 1e-9) first = j;
    }
    if (first === null) continue;
    const second = first === i ? j : i;
    after[first].push(second); deg[second]++;
  }
  const key = (i) => bs[i][1] + bs[i][3] + bs[i][5];
  const ready = []; for (let i = 0; i < n; i++) if (!deg[i]) ready.push(i);
  const out = [], done = new Array(n).fill(false);
  while (out.length < n) {
    if (!ready.length) { let m = -1; for (let i = 0; i < n; i++) if (!done[i] && (m < 0 || key(i) < key(m))) m = i; ready.push(m); deg[m] = 0; }
    ready.sort((u, v) => key(v) - key(u));
    const i = ready.pop(); if (done[i]) continue; done[i] = true; out.push(i);
    for (const j of after[i]) if (--deg[j] === 0 && !done[j]) ready.push(j);
  }
  return out.map((i) => bs[i]);
}

function extent(a) { // the whole build, at every step, so the frame does not jump while scrubbing
  const L = layout(a), bs = BOXES[a.id];
  const z0 = Math.min(...bs.map((b) => b[5])), z1 = Math.max(...bs.map((b) => b[6]));
  return { x: [-L.X, L.X], y: [0, L.Y], z: [z0, z1] };
}

function frame(e, s) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const x of e.x) for (const y of e.y) for (const z of e.z) { const [u, v] = proj(x, y, z, s); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return [u0, v0, u1, v1];
}

/** SVG of architecture a at step k. scale: px per nm (null = fit). */
function svg(a, k, cut, { scale = null, label = true, fresh = true, size = null } = {}) {
  const e = extent(a);
  const s = scale || 430 / Math.max(...(() => { const f = frame(e, 1); return [f[2] - f[0], (f[3] - f[1]) * 1.25]; })());
  const [u0, v0, u1, v1] = frame(e, s);
  const pad = 34, W = size ? size[0] : Math.max(u1 - u0 + 2 * pad, 220), H = size ? size[1] : v1 - v0 + 2 * pad + 22;
  const ox = pad - u0 + (W - (u1 - u0 + 2 * pad)) / 2, oy = pad + 6 - v0 + (size ? (H - (v1 - v0 + 2 * pad + 22)) / 2 : 0);
  const P = (x, y, z) => { const [u, v] = proj(x, y, z, s); return `${(u + ox).toFixed(1)},${(v + oy).toFixed(1)}`; };
  const bs = painterOrder(cutBoxes(a, alive(BOXES[a.id], k), cut), s);
  let g = '';
  for (const b of bs) {
    const [m, x0, x1, y0, y1, z0, z1, born] = b, c = COL[m] || '#888';
    const poly = (pts, fill) => `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${shade(c, 0.45)}" stroke-width=".5" stroke-linejoin="round"/>`;
    const faces = poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(c, 1.12))
      + poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shade(c, 0.82))
      + poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(c, 0.62));
    g += born === k && k > 0 && fresh ? `<g class="bl-new">${faces}</g>` : faces;
  }
  // scale bar (vertical, z is drawn without foreshortening) and source / drain marks
  const bar = 10 * s, bx = 12, by = H - 14;
  let t = `<line x1="${bx}" y1="${by}" x2="${bx}" y2="${(by - bar).toFixed(1)}" stroke="#e8ecf1" stroke-width="2"/><text x="${bx + 6}" y="${(by - bar / 2 + 4).toFixed(1)}" class="bl-t">10 nm</text>`;
  if (label) {
    const [su, sv] = P(e.x[0], e.y[0], e.z[1]).split(',').map(Number), [du, dv] = P(e.x[1], e.y[1], e.z[0]).split(',').map(Number);
    t += `<text x="${su.toFixed(1)}" y="${(sv - 10).toFixed(1)}" class="bl-t" text-anchor="middle">source</text>`;
    if (cut !== 'across') t += `<text x="${du.toFixed(1)}" y="${(dv + 18).toFixed(1)}" class="bl-t" text-anchor="middle">drain</text>`;
  }
  return { W, H, html: `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" aria-hidden="true">${g}${t}</svg>`, mats: [...new Set(bs.map((b) => b[0]))], s };
}

// ---------- page ----------
const refLinks = (keys) => keys.filter((k) => REFS[k]).map((k) => `<a href="#ref-${k}" title="${esc(REFS[k].cite)}">${k}</a>`).join('');
const fmt = (v, d = 0) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }));

function seg(host, items, cur, on) {
  host.innerHTML = items.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('');
  host.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); on(b.dataset.v); };
}

function draw(fresh = true) {
  const a = ARCH[state.arch], n = a.steps.length;
  state.step = Math.max(0, Math.min(n - 1, state.step));
  const sid = a.steps[state.step], st = BUILDER.steps[sid];
  const r = svg(a, state.step, state.cut, { fresh: fresh && !reduceMotion() });
  const view = $('#blView');
  view.innerHTML = r.html;
  view.setAttribute('aria-label', `${a.name}, step ${state.step + 1} of ${n}: ${st.title}. ${CUTS.find((c) => c[0] === state.cut)[1]}. Materials shown: ${r.mats.map((m) => MAT[m]).join(', ')}.`);
  $('#blKey').innerHTML = r.mats.map((m) => `<li><i style="background:${COL[m]}"></i>${esc(MAT[m])}</li>`).join('');
  const sl = $('#blStep'); sl.max = String(n - 1); sl.value = String(state.step);
  $('#blStepO').textContent = `${state.step + 1} / ${n}`;
  $('#blPrev').disabled = state.step === 0; $('#blNext').disabled = state.step === n - 1;
  $('#blSay').innerHTML = `<p class="bl-mod">Step ${state.step + 1} · ${esc(st.module)}</p><h3>${esc(st.title)}</h3><p>${esc(st.text)} <span class="refchips">${refLinks(st.refs)}</span></p>`;
  $('#blSteps').innerHTML = a.steps.map((s, i) => `<li><button type="button" data-i="${i}" aria-current="${i === state.step ? 'step' : 'false'}" class="${i < state.step ? 'done' : ''}">${String(i + 1).padStart(2, '0')} ${esc(BUILDER.steps[s].title)}</button></li>`).join('');
  $('#blBlurb').textContent = a.blurb;
  $('#blDims').innerHTML = SHOW.filter((k) => a.dims[k]).map((k) => {
    const [v, ref] = a.dims[k], unit = ['nfin', 'sheets'].includes(k) ? '' : ' nm';
    return `<li><span>${esc(DIM_LABEL[k])}</span><b>${v}${unit}</b>${ref ? `<span class="refchips">${refLinks([ref])}</span>` : '<em title="A drawing value, not a cited figure">est.</em>'}</li>`;
  }).join('');
  table();
}

function table() {
  const ids = BUILDER.archs.map((a) => a.id);
  const rows = [
    ['Faces of the channel the gate touches', (m) => fmt(m.sides)],
    ['Channel width W<sub>eff</sub> of one transistor (nm)', (m) => fmt(m.weff_nm)],
    ['Cell width it takes (nm)', (m) => fmt(m.cell_w_nm)],
    ['W<sub>eff</sub> per nm of cell width, one nFET + one pFET', (m) => fmt(m.pair_weff_per_w, 1)],
    ['Area of the pair, one gate pitch long (nm²)', (m) => fmt(m.pair_area_nm2)],
    ['Natural length λ of the thin body (nm)', (m) => fmt(m.lam_nm, 1)],
    ['Gate length ÷ λ', (m) => fmt(m.lg_over_lam, 1)],
    ['Build steps shown', (m) => fmt(m.steps)],
  ];
  $('#blTable').innerHTML = `<thead><tr><th scope="col">Quantity</th>${ids.map((i) => `<th scope="col" class="${i === state.arch ? 'on' : ''}">${esc(ARCH[i].short)}<small>${esc(String(ARCH[i].year))}</small></th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(([l, f]) => `<tr><th scope="row">${l}</th>${ids.map((i) => `<td class="${i === state.arch ? 'on' : ''}" data-h="${esc(ARCH[i].short)}">${f(MET[i])}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function compare() {
  const a = ARCH[state.A], b = ARCH[state.B];
  // one scale for both, chosen so the larger of the two fits
  const fit = (x) => { const f = frame(extent(x), 1); return 300 / Math.max(f[2] - f[0], (f[3] - f[1]) * 1.25); };
  const s = Math.min(fit(a), fit(b));
  const sz = [a, b].map((x) => svg(x, x.steps.length - 1, state.cut, { scale: s, fresh: false }));
  const size = [Math.max(sz[0].W, sz[1].W), Math.max(sz[0].H, sz[1].H)];   // one viewBox for both, so both draw at one scale
  for (const [side, x] of [['A', a], ['B', b]]) {
    const r = svg(x, x.steps.length - 1, state.cut, { scale: s, fresh: false, size });
    const host = $(`#blCmp${side}`);
    host.innerHTML = r.html;
    host.setAttribute('aria-label', `${x.name}, finished, drawn at the same scale as the other view.`);
    const m = MET[x.id];
    $(`#blCmp${side}Say`).innerHTML = `<b>${esc(x.short)}</b> · ${fmt(m.weff_nm)} nm of channel width in a ${fmt(m.cell_w_nm)} nm wide cell · gate on ${m.sides} face${m.sides > 1 ? 's' : ''}`;
  }
  const ma = MET[a.id], mb = MET[b.id];
  $('#blCmpSay').textContent = a.id === b.id ? 'Pick two different architectures.'
    : `Drawn to the same scale. An nFET and a pFET one gate pitch long take ${fmt(ma.pair_area_nm2)} nm² as ${a.short} and ${fmt(mb.pair_area_nm2)} nm² as ${b.short}: ${fmt(ma.pair_area_nm2 / mb.pair_area_nm2, 1)} times ${ma.pair_area_nm2 >= mb.pair_area_nm2 ? 'larger' : 'smaller'}, at the drawn widths.`;
}

function stopTour() {
  if (!tour) return;
  clearTimeout(tour.t); tour = null;
  $('#blTour').textContent = 'Take the tour'; $('#blTour').setAttribute('aria-pressed', 'false');
}
function startTour() {
  tour = { i: 0 };
  $('#blTour').textContent = 'Stop the tour'; $('#blTour').setAttribute('aria-pressed', 'true');
  const ids = BUILDER.tour;
  const go = () => {
    if (!tour) return;
    const a = ARCH[ids[tour.i]];
    if (state.arch !== a.id) { setArch(a.id, false); state.step = 0; }
    draw();
    const last = state.step >= a.steps.length - 1;
    tour.t = setTimeout(() => {
      if (!tour) return;
      if (!last) state.step++;
      else if (tour.i < ids.length - 1) { tour.i++; setArch(ids[tour.i], false); state.step = 0; }
      else { stopTour(); return; }
      go();
    }, last ? 3200 : 1700);
  };
  setArch(ids[0], false); state.step = 0; go();
}

function setArch(id, redraw = true) {
  state.arch = id; store.set('bld:arch', id);
  $('#blArch').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === id)));
  if (redraw) { state.step = ARCH[id].steps.length - 1; draw(false); }
}

export function init() {
  const archItems = BUILDER.archs.map((a) => [a.id, a.short]);
  seg($('#blArch'), archItems, state.arch, (v) => { stopTour(); setArch(v); });
  seg($('#blCut'), CUTS, state.cut, (v) => { state.cut = v; store.set('bld:cut', v); draw(false); compare(); });
  seg($('#blA'), archItems, state.A, (v) => { state.A = v; compare(); });
  seg($('#blB'), archItems, state.B, (v) => { state.B = v; compare(); });
  $('#blStep').addEventListener('input', (e) => { stopTour(); state.step = +e.target.value; draw(); });
  $('#blPrev').addEventListener('click', () => { stopTour(); state.step--; draw(); });
  $('#blNext').addEventListener('click', () => { stopTour(); state.step++; draw(); });
  $('#blSteps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stopTour(); state.step = +b.dataset.i; draw(); });
  $('#blTour').addEventListener('click', () => (tour ? stopTour() : startTour()));
  // ?bld=<arch>&step=<n>&cut=<whole|along|across> opens a given view (used for screenshots and links)
  const q = new URLSearchParams(location.search);
  if (ARCH[q.get('bld')]) state.arch = q.get('bld');
  if (CUTS.some((c) => c[0] === q.get('cut'))) state.cut = q.get('cut');
  setArch(state.arch, false);
  seg($('#blCut'), CUTS, state.cut, (v) => { state.cut = v; store.set('bld:cut', v); draw(false); compare(); });
  state.step = q.has('step') ? +q.get('step') - 1 : ARCH[state.arch].steps.length - 1;
  draw(false); compare();
}
