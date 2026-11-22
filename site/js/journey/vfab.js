// Virtual Fab: build a traveler from the seed steps, check each step against the steps it requires, compute a
// two-column cross-section by running each step's theatre model (physics/vfab.js) and estimate yield (yieldcost.js).
import { FAB, LABRUN } from './data.js';
import { diesPerWafer, yieldModel, mulberry32 } from '../physics/yieldcost.js';
import { esc, store, routeSteps } from './util.js';
import * as VF from '../physics/vfab.js';

const $ = (s) => document.querySelector(s);
const BY = Object.fromEntries(FAB.steps.map((s) => [s.id, s]));
const AREA_COLOUR = { materials: '#4b596d', cleaning: '#7fd3d0', oxidation: '#8fcfd4', lithography: '#e07fb0', etch: '#8a94a3', doping: '#3f7fe0',
  deposition: '#e2b650', planarization: '#cfd6e0', modules: '#9a80dc', interconnect: '#d9825b', backend: '#199e70', families: '#b58fd6', history: '#c98500' };
let route = store.get('vfab', null), mode = store.get('vfabMode', store.get('vfabMine', false) === true ? 'mine' : 'def'), mine = {};
if (!['def', 'mine', 'run'].includes(mode)) mode = 'def';
const RUN_CFG = VF.runCfg(LABRUN);
const MODE_SAID = { def: 'Using the theatre defaults.', mine: 'Using your theatre settings.', run: 'Using the 2024 run’s recipe.' };
/** The visitor's theatre settings, in the Virtual Fab model's terms. Only theatres they have opened are included. */
function cfgFrom(set) {
  const pick = (o, ks) => (o ? Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : undefined);
  return { ox: pick(set.oxidation, ['amb', 'T', 't', 'orient']), imp: pick(set.implant, ['ion', 'E', 'dose']), diff: pick(set.diffusion, ['ion', 'Cs', 'T1', 't1', 'T2', 't2', 'model', 'S']),
    ann: pick(set.anneal, ['T', 'hold', 'rate']), etch: pick(set.etch, ['sel', 'oe']), cmp: pick(set.cmp, ['P', 'V', 't']), dam: pick(set.damascene, ['metal', 'w', 'ar', 'tb']),
    rel: pick(set.release, ['W', 'S', 'over', 'n']), planar: pick(set.planar, ['NB', 'T2', 't2']) };
}
if (!Array.isArray(route) || route.some((id) => !BY[id])) route = ['wafer_start', 'rca_clean', 'ox_thermal'];

/** For each position: the required steps that do not appear earlier in the route. */
export function check(ids) {
  return ids.map((id, i) => {
    const before = new Set(ids.slice(0, i)), s = BY[id], miss = s.requires.filter((r) => !before.has(r));
    const any = s.requires_any || [];                       // at least one of these, e.g. any metal before probing
    if (any.length && !any.some((r) => before.has(r))) miss.push(any.join('|'));
    return miss;
  });
}

export function init() {
  $('#vfPalette').innerHTML = FAB.steps.map((s) => `<button type="button" data-id="${s.id}" aria-label="Add step: ${esc(s.title)}"><i style="background:${AREA_COLOUR[s.area] || '#8a94a3'}"></i><span>${esc(s.title)}</span><em aria-hidden="true">+</em></button>`).join('');
  $('#vfPalette').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; route.push(b.dataset.id); draw(`Added ${BY[b.dataset.id].title}.`); });
  $('#vfRows').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const i = +b.dataset.i, act = b.dataset.act;
    if (act === 'up' && i > 0) [route[i - 1], route[i]] = [route[i], route[i - 1]];
    if (act === 'down' && i < route.length - 1) [route[i + 1], route[i]] = [route[i], route[i + 1]];
    if (act === 'del') route.splice(i, 1);
    draw(); const again = $(`#vfRows button[data-act="${act}"][data-i="${act === 'up' ? Math.max(0, i - 1) : act === 'down' ? Math.min(route.length - 1, i + 1) : Math.min(i, route.length - 1)}"]`); again?.focus();
  });
  $('#vfTeach').addEventListener('click', () => { route = routeSteps('teaching_cmos').map((s) => s.id); draw('Loaded the teaching route.'); });
  $('#vfGaa').addEventListener('click', () => { route = routeSteps('modern_gaa').map((s) => s.id); draw('Loaded the modern route.'); });
  $('#vfPlanar').addEventListener('click', () => { route = routeSteps('historical_planar').map((s) => s.id); draw('Loaded the 1959 route.'); });
  $('#vfRun').addEventListener('click', () => { route = [...LABRUN.vfab_route]; draw('Loaded the 2024 cleanroom run.'); });
  $('#vfShuffle').addEventListener('click', () => { const r = mulberry32(Date.now() & 0xffff); for (let i = route.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [route[i], route[j]] = [route[j], route[i]]; } draw('Shuffled. Find the holds and fix the order.'); });
  $('#vfClear').addEventListener('click', () => { route = []; draw('Cleared.'); });
  $('#vfMine').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
  $('#vfMine').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; mode = b.dataset.v; store.set('vfabMode', mode);
    $('#vfMine').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(MODE_SAID[mode]);
  });
  document.addEventListener('tfe:procset', (e) => { mine = e.detail || {}; if (mode === 'mine') draw(); });
  $('#vfD0').addEventListener('input', () => kpis());
  $('#vfArea').addEventListener('input', () => kpis());
  draw();
}

function draw() {
  store.set('vfab', route);
  const miss = check(route), res = VF.run(route, miss.map((m) => m.length > 0), mode === 'mine' ? cfgFrom(mine) : mode === 'run' ? RUN_CFG : null);
  $('#vfRows').innerHTML = route.length ? route.map((id, i) => {
    const s = BY[id], m = miss[i], ok = !m.length;
    return `<li class="trow${ok ? '' : ' hold'}"><span class="n">${String((i + 1) * 10).padStart(3, '0')}</span>`
      + `<span class="t">${esc(s.title)}<small>${ok ? 'Order OK' + said(res.log[i]) : 'Needs first: ' + m.map((r) => r.split('|').map((x) => esc(BY[x].title)).join(' or ')).join(', ')}</small></span>`
      + `<span class="d"><span class="stamp sm ${ok ? 'good' : 'hold'}" aria-label="${ok ? 'OK' : 'Hold'}">${ok ? 'OK' : 'Hold'}</span></span>`
      + `<span class="vf-move"><button type="button" data-act="up" data-i="${i}" aria-label="Move ${esc(s.title)} up">↑</button><button type="button" data-act="down" data-i="${i}" aria-label="Move ${esc(s.title)} down">↓</button><button type="button" data-act="del" data-i="${i}" aria-label="Remove ${esc(s.title)}">✕</button></span><span></span></li>`;
  }).join('') : '<li class="vf-empty">Your traveler is empty. Add a step from the list, or load the teaching route.</li>';
  stack(res);
  lastHeat = res.heat_nm;
  kpis(miss);
  compare(res);
}

/** Why each computed number differs from the measured one; the run's own recipe is in data/lab_runs.json. */
const CMP_NOTE = {
  field_ox: 'The run grew it dry–wet–dry at 1000 °C: 5, 90 and 5 minutes. One dry hour, the theatre default, grows about a tenth of it.',
  gate_ox: 'Dry oxygen at 1100 °C for 60 minutes, on the silicon the first etch opened. The default route has only one oxidation.',
  inter_ox: 'Grown in the 37-minute drive-in at 1050 °C and measured on a bare-silicon control wafer. Only the run’s recipe grows oxide in the drive-in.',
  sd_rs: 'From the run’s diffused resistor. With the theatre default the diffusivity is the intrinsic one and the gap is ten-fold; the run’s recipe lets it rise with doping, as heavy phosphorus does, which more than halves the gap. The drive-in also grew oxide, so the recipe assumes three times the usual interstitials (an assumption, not a measurement): that pushes the junction from about 0.9 to 1.3 µm but barely moves the sheet resistance, because the dose was already fixed. The rest hangs on the predeposition time and surface concentration, which were not recorded: 5 × 10²⁰ cm⁻³ at the surface would give about 5.3 Ω/sq.',
  actv_bias: 'The Virtual Fab etches straight down, as a plasma etch does. The run used a wet etch, which undercuts the resist on both sides.',
  al_rs: '',
  masks: 'ACTV, POLY, CONT and METL.',
};
const FMT = { nm: (v) => `${NM(v)} nm`, 'Ω/sq': (v) => `${v < 1 ? v.toFixed(3) : v.toFixed(1)} Ω/sq`, 'µm': (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} µm`, '': (v) => String(Math.round(v)) };
function compare(res) {
  const rows = VF.compare(res, LABRUN), al = rows.find((r) => r.key === 'al_rs');
  const note = { ...CMP_NOTE, al_rs: `At the Virtual Fab’s estimated ${VF.METAL_NM} nm film. The measured value means about ${(VF.RHO_AL / al.measured * 1e7).toFixed(0)} nm of aluminium.` };
  $('#vfCmp').innerHTML = rows.map((r) => {
    const f = FMT[r.unit], has = r.computed !== null, ratio = has && r.computed > 0 && r.measured > 0 ? r.computed / r.measured : null;
    const cls = !has ? 'none' : ratio === null ? 'far' : Math.abs(Math.log(ratio)) < Math.log(1.1) ? 'good' : Math.abs(Math.log(ratio)) < Math.log(2) ? 'near' : 'far';
    const said = !has ? 'not in this traveler' : ratio === null ? (r.unit ? `${(r.computed - r.measured).toFixed(2)} ${r.unit} off` : '—') : `×${ratio < 10 ? ratio.toFixed(2) : ratio.toFixed(0)}`;
    return `<tr><td>${esc(r.label)}<small>${esc(note[r.key])}</small></td><td class="${cls}" data-h="Computed">${has ? f(r.computed) : '—'}</td><td data-h="Measured">${f(r.measured)}</td><td class="${cls}" data-h="Ratio">${said}</td></tr>`;
  }).join('');
}

let lastHeat = 0;   // nm the window junction moved in hot steps after it was made (the thermal budget)
function kpis(miss = check(route)) {
  const D0 = +$('#vfD0').value, S = +$('#vfArea').value;
  $('#vfD0O').textContent = `${D0.toFixed(2)} /cm²`; $('#vfAreaO').textContent = `${S} mm²`;
  const holds = miss.filter((m) => m.length).length, masks = route.filter((id) => BY[id].area === 'lithography').length;
  const dpw = Math.floor(diesPerWafer(S)), y = yieldModel(S, D0);
  $('#vfKpis').innerHTML = `<div>Steps<b>${route.length}</b></div><div>Masks<b>${masks}</b></div><div>Holds<b style="color:${holds ? '#f0a26b' : '#5fd896'}">${holds}</b></div>`
    + `<div title="How far furnace steps after doping moved the window junction">Junction moved by later heat<b>${Math.abs(lastHeat) < 0.05 ? '0 nm' : `${lastHeat > 0 ? '+' : '−'}${NM(Math.abs(lastHeat))} nm`}</b></div>`
    + `<div>Dies per wafer<b>${dpw}</b></div><div>Yield<b>${(y * 100).toFixed(0)} %</b></div><div>Good dies<b>${Math.floor(dpw * y)}</b></div>`;
}

const NM = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
/** What each step computed, for its row. */
function said(l) {
  if (!l || l.value == null) return '';
  return ' · ' + ({ ox_thermal: `${NM(l.value)} nm oxide`, litho_expose: `${NM(l.value)} nm resist`, etch_rie: `${NM(l.value)} nm cleared`, implant: `xⱼ ${NM(l.value)} nm as implanted`,
    diffuse_predep: `xⱼ ${NM(l.value)} nm`, anneal: `xⱼ ${NM(l.value)} nm`, dep_pvd: `${NM(l.value)} nm metal`, cmp: `up to ${NM(l.value)} nm polished`, damascene: `${NM(l.value)} nm copper line`,
    gaa_release: `sheet edges ${l.value.toFixed(2)} nm`, planar_hoerni: `xⱼ ${(l.value / 1000).toFixed(2)} µm` }[l.id] || '')
    + (l.push !== undefined && Math.abs(l.push) >= 0.05 ? ` · heat moves the earlier junction ${l.push > 0 ? '+' : '−'}${NM(Math.abs(l.push))} nm` : '');
}

const MAT = { ox: ['#8fcfd4', 'oxide'], resist: ['#e07fb0', 'resist'], metal: ['#e2b650', 'metal'], ild: ['#5b6676', 'dielectric'], cu: ['#d9825b', 'copper'] };
/** Computed cross-section: two columns (field under the mask, window opened by lithography), from physics/vfab.js. */
function stack(res) {
  const W = 520, x0 = 30, x1 = 490, win = [200, 320], ys = 150, any = route.length > 0;
  const cols = [res.field, res.window], above = Math.max(100, ...cols.map((c) => c.layers.reduce((a, [, t]) => a + t, 0))), below = Math.max(200, ...cols.map((c) => c.xj - c.si_top));
  const sa = 100 / above, sb = 52 / below;                 // two scales: layers above the surface, junctions below it
  const segs = (k) => (k === 'window' ? [[win[0], win[1]]] : [[x0, win[0]], [win[1], x1]]);
  const parts = [`<rect x="0" y="0" width="${W}" height="240" fill="#0c1016"/>`];
  const surfOf = (k) => ys - res[k].si_top * sb;             // consumed or recessed silicon lowers the surface
  if (any) {
    for (const k of ['field', 'window']) for (const [a, b] of segs(k)) parts.push(`<rect x="${a}" y="${surfOf(k).toFixed(1)}" width="${b - a}" height="${(212 - surfOf(k)).toFixed(1)}" fill="#4b596d"/>`);
    for (const k of ['field', 'window']) {                     // junctions; a diffused one spreads under the mask edge by ~0.8 xj
      const c = res[k], col = c.by === 'planar' ? '#e07f3f' : '#3f7fe0', d = c.xj * sb, top = Math.min(surfOf('field'), surfOf('window'));
      if (c.xj <= 0) continue;
      for (const [a, b] of segs(k)) parts.push(`<rect x="${a}" y="${surfOf(k).toFixed(1)}" width="${b - a}" height="${d.toFixed(1)}" fill="${col}" opacity=".8"/>`);
      if (k === 'window' && c.lateral > 0) {
        const lat = Math.min(c.lateral * sb, win[0] - x0), y0 = surfOf(k);
        parts.push(`<clipPath id="vfLat"><rect x="${x0}" y="${top.toFixed(1)}" width="${x1 - x0}" height="${(212 - top).toFixed(1)}"/></clipPath>`
          + `<path clip-path="url(#vfLat)" d="M${win[0]} ${y0.toFixed(1)} h${-lat.toFixed(1)} a${lat.toFixed(1)} ${d.toFixed(1)} 0 0 0 ${lat.toFixed(1)} ${d.toFixed(1)} Z M${win[1]} ${y0.toFixed(1)} h${lat.toFixed(1)} a${lat.toFixed(1)} ${d.toFixed(1)} 0 0 1 ${(-lat).toFixed(1)} ${d.toFixed(1)} Z" fill="${col}" opacity=".8"/>`);
      }
    }
    for (const k of ['field', 'window']) for (const [a, b] of segs(k)) {
      let y = surfOf(k);
      for (const [m, t] of res[k].layers) { const h = Math.max(t * sa, 1.5); y -= h; parts.push(`<rect x="${a}" y="${y.toFixed(1)}" width="${b - a}" height="${h.toFixed(1)}" fill="${MAT[m][0]}"/>`); }
    }
  }
  if (res.sheets) parts.push([0, 1, 2].map((k) => `<rect x="${win[0] + 12}" y="${ys - 26 - k * 16}" width="${win[1] - win[0] - 24}" height="7" rx="3" fill="#7b8ca5" stroke="#9a80dc" stroke-width="1.5"/>`).join(''));
  if (res.done) parts.push(`<g transform="translate(462 44) rotate(-12)"><circle r="22" fill="none" stroke="#5fd896" stroke-width="2"/><text text-anchor="middle" y="4" font-family="IBM Plex Mono" font-size="11" font-weight="700" fill="#5fd896">DIE</text></g>`);
  if (!any) parts.push(`<text x="${W / 2}" y="104" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" fill="#8a94a3">add steps to build a stack</text>`);
  const desc = (c) => (c.layers.length ? c.layers.map(([m, t]) => `${MAT[m][1]} ${NM(t)}`).join(' + ') + ' nm' : 'bare') + (c.xj > 0 ? ` · xⱼ ${NM(c.xj)} nm` : '') + (c.lateral > 0 ? `, ${NM(c.lateral)} nm under the mask` : '');
  parts.push(`<text x="${x0}" y="18" font-family="IBM Plex Mono" font-size="10.5" fill="#8a94a3">computed · held steps skipped${any ? ` · 1 px ≈ ${(1 / sa).toFixed(0)} nm above, ${(1 / sb).toFixed(0)} nm below the surface` : ''}</text>`);
  if (any) parts.push(`<text x="${x0}" y="228" font-family="IBM Plex Mono" font-size="9.5" fill="#8a94a3">field: ${esc(desc(res.field))}</text><text x="${x0}" y="34" font-family="IBM Plex Mono" font-size="9.5" fill="#8a94a3">window: ${esc(desc(res.window))}</text>`);
  $('#vfStack').innerHTML = parts.join('');
  $('#vfStack').setAttribute('aria-label', `Computed cross-section. Field: ${desc(res.field)}. Window: ${desc(res.window)}.`);
}
