// Lab 05 — A real cleanroom run: one teaching-cleanroom NMOS wafer, measured, against the models.
import * as LR from '../physics/labrun.js';
import { LABRUN as D } from './data.js';
import { panel, tiles, experiments, frame, axes, linear, log, path, el, C, txt, fw, onWidth, coalesce, tooltip, tipRows } from '../physlab/ui.js';

const nm = v => (v < 100 ? v.toFixed(1) : v.toFixed(0)) + ' nm';
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + ' %';
const sci = v => { const e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e; return `${m.toFixed(1)}×10<sup>${e}</sup>`; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TIER = { 0: 'safe to describe', 1: 'describe with care', 2: 'equipment and heat: no home procedure', 3: 'institution-only: conceptual' };

/** Model numbers that do not depend on the controls. */
export function oxideRows() {
  return D.oxides.map(o => {
    const model = LR.oxideSequence(o.steps).at(-1) * 1000;
    const parab = Math.sqrt(o.steps.reduce((a, [amb, T, min]) => a + LR.parabolicOnly(amb, T, min) ** 2, 0));
    return { ...o, model, parab: parab * 1000, err: o.measured_nm / model - 1 };
  });
}

function traveler(host) {
  host.innerHTML = D.steps.map(s => `<li class="lr-step t${s.tier}">
      <div class="lr-n" aria-hidden="true">${String(s.n).padStart(2, '0')}</div>
      <div class="lr-body"><h4>${esc(s.title)}</h4><p>${esc(s.note)}</p>
        ${s.recipe.length ? `<dl class="lr-dl">${s.recipe.map(r => `<div><dt>${esc(r.param)}</dt><dd>${esc(r.value)} ${esc(r.unit)}</dd></div>`).join('')}</dl>` : ''}
        ${s.measured.length ? `<dl class="lr-dl lr-meas">${s.measured.map(r => `<div><dt>${esc(r.param)}</dt><dd>${esc(r.value)} ${esc(r.unit)}</dd></div>`).join('')}</dl>` : ''}
        ${s.conceptual ? `<p class="lr-concept">${esc(s.conceptual)}</p>` : ''}
        <span class="lr-tier" title="Safety tier ${s.tier}: ${TIER[s.tier]}">Tier ${s.tier} · ${TIER[s.tier]}</span></div></li>`).join('');
}

export function init(sec) {
  traveler(sec.querySelector('.lr-trav'));
  const ctl = panel(sec.querySelector('.lab-ctl'), [
    { type: 'heading', label: 'Wet etch' },
    { key: 'over', label: 'Over-etch', min: 0, max: 1.5, step: 0.01, value: 0.3, fmt: v => (v * 100).toFixed(0) + ' %' },
    { type: 'heading', label: 'Substrate' },
    { key: 'rho', label: 'p-type resistivity', min: 0.2, max: 20, log: true, value: 1, fmt: v => v.toFixed(v < 1 ? 2 : 1) + ' Ω·cm' },
    { type: 'heading', label: 'Capacitance meter' },
    { key: 'R', label: 'Series resistance', min: 0, max: 30000, step: 100, value: 0, fmt: v => v < 1000 ? v.toFixed(0) + ' Ω' : (v / 1000).toFixed(1) + ' kΩ' },
    { key: 'Cp', label: 'Stray capacitance', min: 0, max: 20, step: 0.1, value: 0, fmt: v => v.toFixed(1) + ' pF' },
  ]);
  const show = tiles(sec.querySelector('.lab-tiles'), [
    { key: 'gate', label: 'Gate oxide: model vs measured', unit: '' }, { key: 'field', label: 'Field oxide: model vs measured', unit: '' },
    { key: 'na', label: 'Substrate doping', unit: 'cm⁻³ (Caughey–Thomas)' }, { key: 'nox', label: 'Implied oxide charge', unit: 'cm⁻², gate-oxide MOSFETs' },
    { key: 'rs', label: 'Poly sheet resistance', unit: 'from resistor 2b' }, { key: 'yield', label: 'MOSFET yield', unit: 'devices that switch' },
  ]);
  const H = { ox: sec.querySelector('[data-role=ox]'), cd: sec.querySelector('[data-role=cd]'), vt: sec.querySelector('[data-role=vt]'), cv: sec.querySelector('[data-role=cv]') };
  const rows = oxideRows();
  const redraw = coalesce(() => { drawOx(); drawCD(); drawVT(); drawCV(); readouts(); });
  ctl.on(redraw);

  function readouts() {
    const s = ctl.state, Na = LR.resistivityToDoping(s.rho, 'p');
    const gate = rows.find(r => r.id === 'gate'), field = rows.find(r => r.id === 'field');
    const nox = D.mosfets.filter(m => m.works && !m.field).map(m => LR.oxideChargeFromVt(m.vt, Na, 114)).sort((a, b) => a - b);
    const r2b = D.resistors.find(r => r.id === '2b');
    show({ gate: `${nm(gate.model)} / ${nm(gate.measured_nm)}`, field: `${nm(field.model)} / ${nm(field.measured_nm)}`, na: sci(Na),
      nox: sci(nox[nox.length >> 1]), rs: LR.sheetFromResistor(r2b.R_ohm, r2b.L_um, r2b.W_um).toFixed(1) + ' Ω/sq',
      yield: `${D.mosfets.filter(m => m.works).length} of ${D.mosfets.length}` });
  }

  function drawOx() {
    const f = frame(H.ox, { w: fw(H.ox), h: 300, m: { t: 14, r: 16, b: 40, l: 58 } });
    const xs = log(30, 1000, f.x0, f.x1), ys = log(30, 1000, f.y0, f.y1), tk = [30, 50, 100, 200, 500, 1000];
    axes(f, xs, ys, { xt: tk, yt: tk, xl: 'Deal–Grove prediction (nm)', yl: 'measured (nm)' });
    el('path', { d: path([[xs(30), ys(30 * 1.15)], [xs(1000 / 1.15), ys(1000)], [xs(1000), ys(1000)], [xs(1000), ys(1000 / 1.15)], [xs(30 * 1.15), ys(30)], [xs(30), ys(30)]]) + 'Z', fill: 'rgba(57,135,229,.10)' }, f.svg);
    el('path', { d: path([[xs(30), ys(30)], [xs(1000), ys(1000)]]), stroke: C.muted, 'stroke-dasharray': '4 4', fill: 'none' }, f.svg);
    txt(f.svg, xs(300) + 6, ys(300) + 18, 'model = measured', { fill: C.muted, 'font-size': 10 });
    txt(f.svg, xs(38), ys(38 * 1.15) - 6, '±15 %', { fill: C.s1, 'font-size': 10 });
    const tip = tooltip(H.ox);
    rows.forEach((r, i) => {
      const col = r.id.startsWith('field') ? C.s4 : r.id === 'gate' ? C.s3 : C.s5, now = !/20\d\d$/.test(r.id);
      el('line', { x1: xs(r.parab), x2: xs(r.model), y1: ys(r.measured_nm), y2: ys(r.measured_nm), stroke: col, opacity: 0.35, 'stroke-dasharray': '2 3' }, f.svg);
      el('circle', { cx: xs(r.parab), cy: ys(r.measured_nm), r: 4, fill: 'none', stroke: col, opacity: 0.7 }, f.svg);
      const dot = el('circle', { cx: xs(r.model), cy: ys(r.measured_nm), r: now ? 6.5 : 5, fill: now ? col : C.surface, stroke: col, 'stroke-width': 2, tabindex: 0, role: 'img', 'aria-label': `${r.label}: model ${nm(r.model)}, measured ${nm(r.measured_nm)}` }, f.svg);
      const html = tipRows(r.label, [['Deal–Grove', nm(r.model)], ['measured', nm(r.measured_nm)], ['difference', pct(r.err)], ['√(Bt) only', nm(r.parab)]]);
      dot.addEventListener('pointerenter', e => tip.show(html, e.clientX, e.clientY)); dot.addEventListener('pointerleave', () => tip.hide());
      dot.addEventListener('focus', () => { const b = dot.getBoundingClientRect(); tip.show(html, b.right, b.bottom); }); dot.addEventListener('blur', () => tip.hide());
      if (now) txt(f.svg, xs(r.model) - 10, ys(r.measured_nm) + (r.id === 'inter' ? 4 : -10), r.id === 'inter' ? 'intermediate' : r.id, { fill: col, 'font-size': 10.5, 'text-anchor': 'end' });
    });
    txt(f.svg, f.x0 + 8, f.y1 + 12, '● full Deal–Grove   ○ √(Bt) only', { fill: C.ink2, 'font-size': 10 });
  }

  function drawCD() {
    const s = ctl.state, f = frame(H.cd, { w: fw(H.cd), h: 300, m: { t: 18, r: 14, b: 40, l: 52 } });
    const M = D.cd_bias.masks, xs = linear(0, M.length, f.x0, f.x1), ys = linear(-2.5, 4.2, f.y0, f.y1);
    axes(f, xs, ys, { xt: [], yt: [-2, -1, 0, 1, 2, 3, 4], yl: 'width change (µm)', yf: v => (v > 0 ? '+' : '') + v });
    el('line', { x1: f.x0, x2: f.x1, y1: ys(0), y2: ys(0), stroke: C.ink2, opacity: 0.6 }, f.svg);
    const bw = (xs(1) - xs(0)) / 11, tip = tooltip(H.cd);
    M.forEach((m, i) => {
      const cx = xs(i + 0.5);
      txt(f.svg, cx, f.y0 + 16, m.mask, { 'text-anchor': 'middle', fill: C.ink, 'font-size': 11 });
      txt(f.svg, cx, f.y0 + 30, m.kind === 'opening' ? 'opening' : 'line', { 'text-anchor': 'middle', fill: C.muted, 'font-size': 9.5 });
      m.etch.forEach((v, k) => {
        const x = cx - 4.5 * bw + k * 2.3 * bw;
        el('rect', { x, y: Math.min(ys(0), ys(m.litho[k])), width: bw, height: Math.abs(ys(m.litho[k]) - ys(0)) || 1, fill: C.s1 }, f.svg);
        const r = el('rect', { x: x + bw, y: Math.min(ys(0), ys(v)), width: bw, height: Math.abs(ys(v) - ys(0)) || 1, fill: C.s2, tabindex: 0, role: 'img', 'aria-label': `${m.mask} ${D.cd_bias.features_um[k]} µm: after lithography ${m.litho[k]} µm, after etch ${v} µm` }, f.svg);
        const html = tipRows(`${m.mask}, ${D.cd_bias.features_um[k]} µm feature`, [['after lithography', `${m.litho[k] > 0 ? '+' : ''}${m.litho[k].toFixed(2)} µm`], ['after etch', `${v > 0 ? '+' : ''}${v.toFixed(2)} µm`]]);
        r.addEventListener('pointerenter', e => tip.show(html, e.clientX, e.clientY)); r.addEventListener('pointerleave', () => tip.hide());
      });
      if (m.t_um) {
        const b = LR.isotropicBiasUm(m.t_um, s.over) * (m.kind === 'opening' ? 1 : -1), y = ys(b);
        el('line', { x1: cx - 5 * bw, x2: cx + 5 * bw, y1: y, y2: y, stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '6 3' }, f.svg);
        txt(f.svg, cx, y + (b > 0 ? -6 : 14), `isotropic ${b > 0 ? '+' : ''}${b.toFixed(2)}`, { 'text-anchor': 'middle', fill: C.ink, 'font-size': 9.5 });
      }
    });
    txt(f.svg, f.x0 + 6, f.y1 - 4, '■ after lithography', { fill: C.s1, 'font-size': 10 });
    txt(f.svg, f.x0 + 130, f.y1 - 4, '■ after wet etch', { fill: C.s2, 'font-size': 10 });
  }

  function drawVT() {
    const s = ctl.state, Na = LR.resistivityToDoping(s.rho, 'p');
    const f = frame(H.vt, { w: fw(H.vt), h: 300, m: { t: 18, r: 14, b: 40, l: 52 } });
    const ms = D.mosfets, xs = linear(0, ms.length, f.x0, f.x1), lo = -4, hi = 12, ys = linear(lo, hi, f.y0, f.y1);
    axes(f, xs, ys, { xt: [], yt: [-4, 0, 4, 8, 12], yl: 'threshold voltage (V)' });
    el('line', { x1: f.x0, x2: f.x1, y1: ys(0), y2: ys(0), stroke: C.ink2, opacity: 0.6 }, f.svg);
    const vg = LR.vtIdeal(Na, 114), vf = LR.vtIdeal(Na, 610, 'al'), bw = (xs(1) - xs(0)) * 0.55, tip = tooltip(H.vt);
    ms.forEach((m, i) => {
      const cx = xs(i + 0.5), col = m.field ? C.s4 : m.works ? C.s3 : C.muted;
      const r = el('rect', { x: cx - bw / 2, y: Math.min(ys(0), ys(m.vt)), width: bw, height: Math.max(Math.abs(ys(m.vt) - ys(0)), 2), fill: col, opacity: m.works ? 1 : 0.5, tabindex: 0, role: 'img', 'aria-label': `MOSFET ${m.id}: measured threshold ${m.vt} V` }, f.svg);
      const nox = m.field ? LR.oxideChargeFromVt(m.vt, Na, 610, 'al') : LR.oxideChargeFromVt(m.vt, Na, 114);
      const html = tipRows(`MOSFET ${m.id} (${m.group})`, [['measured V_T', m.vt.toFixed(1) + ' V'], ['ideal V_T', (m.field ? vf : vg).toFixed(2) + ' V'], ['I_on / I_off', m.works ? (m.ion_ua / m.ioff_ua).toFixed(m.field ? 0 : 1) : 'never turns off'], ['implied Q_ox/q', sci(nox).replace(/<\/?sup>/g, '') + ' cm⁻²']]);
      r.addEventListener('pointerenter', e => tip.show(html, e.clientX, e.clientY)); r.addEventListener('pointerleave', () => tip.hide());
      txt(f.svg, cx, f.y0 + 16, m.id, { 'text-anchor': 'middle', fill: C.ink, 'font-size': 10.5 });
    });
    const gx1 = xs(ms.length - 1);
    const line = (v, x0, x1, label, col) => { const y = ys(Math.max(lo, Math.min(hi, v))); el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: col, 'stroke-width': 2, 'stroke-dasharray': '6 3' }, f.svg); txt(f.svg, x0 + 4, y - 6, label, { fill: col, 'font-size': 10 }); };
    line(vg, f.x0, gx1, `ideal, no oxide charge: ${vg.toFixed(1)} V`, C.ink);
    line(vf, gx1, f.x1, vf > hi ? `${vf.toFixed(0)} V ↑` : vf.toFixed(1) + ' V', C.s4);
    txt(f.svg, f.x0 + 4, f.y0 + 30, 'gate oxide, 114 nm', { fill: C.s3, 'font-size': 9.5 });
    txt(f.svg, f.x1 - 2, f.y0 + 30, 'field, ~610 nm', { fill: C.s4, 'font-size': 9.5, 'text-anchor': 'end' });
  }

  function drawCV() {
    const s = ctl.state, f = frame(H.cv, { w: fw(H.cv), h: 300, m: { t: 18, r: 14, b: 40, l: 52 } });
    const caps = D.capacitors, xs = linear(0, caps.length, f.x0, f.x1), ys = log(0.5, 60, f.y0, f.y1);
    axes(f, xs, ys, { xt: [], yt: [1, 2, 5, 10, 20, 50], yl: 'capacitance (pF)' });
    const bw = (xs(1) - xs(0)) / 5, tip = tooltip(H.cv);
    caps.forEach((c, i) => {
      const cx = xs(i + 0.5), ideal = LR.parallelPlatePf(c.area_um2, c.t_nm), read = s.Cp + LR.lcrReadingPf(ideal, s.R, D.cv_freq_hz);
      const bar = (x, v, col, lab) => el('rect', { x, y: ys(v), width: bw, height: f.y0 - ys(v), fill: col, tabindex: 0, role: 'img', 'aria-label': `${c.label}: ${lab} ${v.toFixed(2)} pF` }, f.svg);
      const bars = [bar(cx - 1.5 * bw, ideal, C.s1, 'ideal'), bar(cx - 0.5 * bw, read, C.s5, 'model meter reading'), bar(cx + 0.5 * bw, c.C_pf, C.s2, 'measured')];
      const html = tipRows(c.label, [['oxide', nm(c.t_nm)], ['ideal ε<sub>ox</sub>A/t', ideal.toFixed(2) + ' pF'], ['meter would read', read.toFixed(2) + ' pF'], ['measured', c.C_pf.toFixed(2) + ' pF'], ['R that explains it', LR.seriesRForReading(ideal, c.C_pf) ? (LR.seriesRForReading(ideal, c.C_pf) / 1000).toFixed(1) + ' kΩ' : 'none: reads high']]);
      bars.forEach(b => { b.addEventListener('pointerenter', e => tip.show(html, e.clientX, e.clientY)); b.addEventListener('pointerleave', () => tip.hide()); });
      txt(f.svg, cx, f.y0 + 16, c.label.replace('-oxide capacitor', ''), { 'text-anchor': 'middle', fill: C.ink, 'font-size': 10.5 });
      txt(f.svg, cx, f.y0 + 30, nm(c.t_nm), { 'text-anchor': 'middle', fill: C.muted, 'font-size': 9.5 });
    });
    txt(f.svg, f.x0 + 6, f.y1 - 4, '■ ideal', { fill: C.s1, 'font-size': 10 });
    txt(f.svg, f.x0 + 64, f.y1 - 4, '■ meter model', { fill: C.s5, 'font-size': 10 });
    txt(f.svg, f.x0 + 160, f.y1 - 4, '■ measured at 1 MHz', { fill: C.s2, 'font-size': 10 });
  }

  experiments(sec.querySelector('.lab-exp'), [
    { label: 'Does Deal–Grove fit the furnace?', run: api => api.animate({ over: 0.3 }, 400), note: 'Hover the dots. The full model lands within 6 % of this run’s field, gate and intermediate oxides. The hollow circles are √(Bt), which ignores the reaction-limited start: it overshoots by 30–60 %. Earlier runs (open dots) scatter by up to 18 % at the same recipe, so run-to-run variation is bigger than the model’s error.' },
    { label: 'How far did the wet etch go?', run: api => api.animate({ over: 1.25 }, 900), note: 'An isotropic etch eats sideways as fast as down. ACTV openings grew by about 2.5 µm through 548 nm of oxide, which needs roughly 125 % over-etch. Lithography itself moved edges by less than 0.5 µm. This is why industry moved to directional plasma etching.' },
    { label: 'Where did the threshold go?', run: api => api.animate({ rho: 1 }, 700), note: 'With no oxide charge an n⁺-poly gate on this substrate should turn on at a positive voltage, yet most devices turned on below zero. A fixed positive charge of several 10¹¹ to about 10¹² per cm² in the oxide explains it. A production gate oxide holds far less.' },
    { label: 'Try the measured substrate', run: api => api.animate({ rho: 0.33 }, 900), note: 'The group measured 8.74 Ω/sq on the bare 380 µm wafer, about 0.33 Ω·cm. Heavier doping raises the ideal threshold and the charge needed to explain the measurements, but the field-oxide MOSFET needs 1 to 6 ×10¹¹ cm⁻² across the same range: the two devices tell the same story.' },
    { label: 'Explain the small gate capacitor', run: api => api.animate({ R: 12700, Cp: 0 }, 900), note: 'A meter that assumes a pure capacitor reads low when resistance sits in series, for example a poor back contact through the stage. About 12.7 kΩ makes the 17.4 pF gate capacitor read 5.95 pF. But no single resistance and stray capacitance fits all three devices, so at least one was probably mis-probed.' },
  ], ctl);
  redraw();
  onWidth(Object.values(H), redraw);
}
