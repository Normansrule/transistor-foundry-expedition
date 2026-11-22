// Experiments page: tier filter and one straight-line fitter per experiment (lazy, on first view).
import { EXPERIMENTS, REAL } from './data.js';
import * as F from '../physics/fitting.js';
import { el, frame, axes, linear, niceTicks, path, label } from '../svgchart.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BY_ID = Object.fromEntries(EXPERIMENTS.experiments.map(x => [x.id, x]));

// How each model's straight line is drawn: axis labels and display scale factors.
const AX = {
  yield_poisson: { xl: 'Die area A (cm²)', yl: 'ln Y' },
  moore: { xl: 'Year', yl: 'log₂ transistors' },
  sqrt_t: { xl: 'Time (min)', yl: 'Depth² (mm²)' },
  capacitor: { xl: 'A / t (m)', yl: 'C (pF)', ys: 1e12 },
  grating: { xl: 'm λ (µm)', yl: 'sin θ', xs: 1e6 },
  diode: { xl: 'V (V)', yl: 'ln I (I in A)' },
  led: { xl: '1/λ (µm⁻¹)', yl: 'Turn-on V (V)', xs: 1e-6 },
  mosfet: { xl: 'V_GS (V)', yl: '√I_D (√mA)', ys: Math.sqrt(1e3) },
  tlm: { xl: 'Length (mm)', yl: 'R (Ω)' },
  diode_temp: { xl: 'Temperature (°C)', yl: 'V (V)' },
  proximity: { xl: 'Gap (µm)', yl: 'Smallest line² (µm²)' },
  crystal: { xl: 'Day', yl: 'Mass (g)' },
  fourpoint: { xl: 'I (mA)', yl: 'V (mV)' },
  etch: { xl: 'Time (s)', yl: 'Removed (nm)' },
};

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fmt(v, digits = 3, sci = false) {
  if (!Number.isFinite(v)) return '—';
  if (sci || (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0))) {
    const e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e;
    return `${m.toFixed(Math.max(digits - 1, 0))} × 10${String(e).split('').map(c => SUP[c]).join('')}`;
  }
  const d = Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(v) || 1)));
  return v.toFixed(Math.min(d, 6)).replace('-', '−');
}
const fmtErr = (v, e, r) => {
  if (!Number.isFinite(e) || e === 0 || !Number.isFinite(v)) return fmt(v, r.digits, r.sci);
  // round both to the error's second significant figure, sharing one power of ten when large or small
  const big = r.sci || Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0);
  const p10 = big ? Math.floor(Math.log10(Math.abs(v))) : 0, m = v / 10 ** p10, me = e / 10 ** p10;
  const dec = Math.min(Math.max(0, 1 - Math.floor(Math.log10(me))), 6);
  const s = `${m.toFixed(dec)} ± ${me.toFixed(dec)}`.replace(/-/g, '−');
  return big ? `(${s}) × 10${String(p10).split('').map(c => SUP[c]).join('')}` : s;
};
const csvOf = rows => rows.map(r => r.map(v => (typeof v === 'number' ? +v.toPrecision(5) : v)).join(',')).join('\n');

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function draw(host, model, r, title) {
  const ax = AX[model], xs = ax.xs || 1, ys = ax.ys || 1;
  const X = r.x.map(v => v * xs), Y = r.y.map(v => v * ys);
  const W = Math.round(Math.min(560, Math.max(300, host.clientWidth || 560)));
  const f = frame(host, { w: W, h: Math.round(Math.max(300, W * 0.62)), m: { t: 14, r: 14, b: 124, l: W < 420 ? 50 : 62 } });
  f.svg.setAttribute('aria-label', `${title}: ${r.n} points and the fitted line, R² ${r.r2.toFixed(4)}, with residuals underneath.`);
  const pad = (a, b) => { const s = (b - a) || Math.abs(a) || 1; return [a - 0.06 * s, b + 0.06 * s]; };
  const origin = F.MODELS[model].origin;
  let [x0, x1] = pad(Math.min(...X), Math.max(...X)), [y0, y1] = pad(Math.min(...Y), Math.max(...Y));
  if (origin) { x0 = Math.min(x0, 0); x1 = Math.max(x1, 0); y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  const top = { ...f, y0: f.h - 124 };
  const sx = linear(x0, x1, f.x0, f.x1), sy = linear(y0, y1, top.y0, f.y1);
  const fmtT = v => Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(0).replace('e', 'e') : String(+v.toPrecision(4));
  axes(top, sx, sy, { xt: [], yt: niceTicks(y0, y1, 4), yl: ax.yl, xf: fmtT, yf: fmtT });
  const lx = [x0, x1].map(x => [sx(x), sy((r.a + r.b * x / xs) * ys)]);
  const cid = `clip-${model}`, defs = el('defs', {}, f.svg);
  el('rect', { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: top.y0 - f.y1 }, el('clipPath', { id: cid }, defs));
  el('path', { d: path(lx), class: 'fit', 'clip-path': `url(#${cid})` }, f.svg);
  X.forEach((x, i) => el('circle', { cx: sx(x), cy: sy(Y[i]), r: 4.5, class: 'pt' }, f.svg));
  // residual strip
  const rb = f.h - 40, rt = f.h - 90, rmax = Math.max(...r.res.map(Math.abs)) * ys || 1;
  const sr = linear(-rmax * 1.15, rmax * 1.15, rb, rt);
  el('line', { x1: f.x0, x2: f.x1, y1: sr(0), y2: sr(0), class: 'zero' }, f.svg);
  r.res.forEach((e, i) => el('line', { x1: sx(X[i]), x2: sx(X[i]), y1: sr(0), y2: sr(e * ys), class: 'res' }, f.svg));
  el('text', { x: f.x0, y: rt - 8, class: 'cap' }, f.svg).textContent = 'Residuals (point minus line)';
  const xt = niceTicks(x0, x1, 5);
  for (const t of xt) { const x = sx(t); if (x < f.x0 - 0.5 || x > f.x1 + 0.5) continue; el('text', { x, y: f.h - 22, 'text-anchor': 'middle', class: 'cap' }, f.svg).textContent = fmtT(t); }
  label(el('text', { x: (f.x0 + f.x1) / 2, y: f.h - 4, 'text-anchor': 'middle', class: 'cap' }, f.svg), ax.xl);
}

function initFit(box) {
  const art = box.closest('.xp'), id = art.id.replace(/^ex-/, ''), x = BY_ID[id], model = x.model;
  const ta = $('.xp-csv', box), status = $('.xp-status', box), chart = $('.xp-chart', box);
  const extra = document.createElement('p'); extra.className = 'xp-model'; status.after(extra);
  const params = () => Object.fromEntries($$('[data-param]', box).map(i => [i.dataset.param, parseFloat(i.value)]));
  const head = x.cols.map(c => c.id).join(',');
  let timer = 0;
  function run() {
    const rows = F.parseCSV(ta.value);
    const clear = msg => { status.textContent = msg; status.classList.toggle('bad', !!rows.length); chart.querySelector('svg')?.remove(); $$('.xp-results dd', box).forEach(d => { d.textContent = '—'; }); extra.textContent = ''; };
    if (rows.length < 3) return clear(rows.length ? `${rows.length} reading${rows.length > 1 ? 's' : ''} so far: add at least three to fit a line.` : 'Add at least three readings to fit a line.');
    if (rows.some(r => r.length < x.cols.length)) return clear(`Each row needs ${x.cols.length} numbers: ${head.replace(/,/g, ', ')}.`);
    let r;
    try { r = F.fit(model, rows, params()); } catch (e) { return clear(`Could not fit: ${e.message}. Check that the readings are numbers and not all the same.`); }
    if (![r.a, r.b].every(Number.isFinite)) return clear('Could not fit these readings: check the units and the boxes above.');
    status.classList.remove('bad');
    const dropped = rows.length - r.n;
    status.textContent = `Fitted ${r.n} of ${rows.length} readings${dropped ? ` (${dropped} left out: ${model === 'mosfet' ? 'below the current cut-off or ' : ''}not usable on this line)` : ''}.`;
    for (const res of x.results) { const dd = $(`[data-key="${res.key}"] dd`, box); if (dd) dd.textContent = `${fmtErr(r.out[res.key], r.err[res.key], res)}${res.unit ? ' ' + res.unit : ''}`; }
    $('[data-key="r2"] dd', box).textContent = r.r2.toFixed(4);
    extra.textContent = '';
    if (model === 'diode_temp') {
      const v25 = r.a + r.b * 25;
      extra.textContent = `The Shockley model predicts ${fmt(F.diodeDvdt(v25, 298.15) * 1e3, 3)} mV/K for your diode’s ${fmt(v25, 3)} V at 25 °C.`;
    } else if (model === 'led') {
      extra.textContent = `That is ${fmt(r.out.h_Js / F.H * 100, 3)} % of the exact value of Planck’s constant.`;
    } else if (model === 'capacitor') {
      extra.textContent = `Silicon dioxide, for comparison, has ε_r = 3.9.`;
    }
    draw(chart, model, r, x.title);
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
  ta.addEventListener('input', later);
  $$('[data-param]', box).forEach(i => i.addEventListener('input', later));
  box.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'example' && x.example) {
      const ex = x.example;
      for (const [k, v] of Object.entries(ex.truth)) { const inp = $(`[data-param="${k}"]`, box); if (inp) inp.value = v; }
      ta.value = `${head}\n# model data, not a measurement\n${csvOf(F.example(model, ex.xs, ex.truth, ex.noise, ex.seed))}\n`;
      run();
    } else if (b.dataset.act === 'real' && x.real) {
      ta.value = `${head}\n# ${x.real.note}\n${REAL[x.real.source].map(r => `${r[0]},${r[1]}`).join('\n')}\n`;
      run();
    } else if (b.dataset.act === 'template') {
      download(`${id}-template.csv`, `${head}\n`);
    }
  });
  $('input[type=file]', box)?.addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    ta.value = await file.text(); e.target.value = ''; run();
  });
  run();
}

function filter() {
  const btns = $$('.xp-filter button');
  const apply = tier => {
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tier === tier)));
    $$('.xp-card, .xp').forEach(n => { n.hidden = tier !== 'all' && n.dataset.tier !== tier; });
  };
  btns.forEach(b => b.addEventListener('click', () => apply(b.dataset.tier)));
  // a deep link to a hidden experiment shows everything again
  addEventListener('hashchange', () => { const t = document.getElementById(location.hash.slice(1)); if (t?.hidden) apply('all'); });
}

const started = new WeakSet();
function start(box) {
  if (started.has(box)) return; started.add(box);
  try { initFit(box); } catch (err) { console.error(err); }
}
function lazy() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } }), { rootMargin: '400px 0px' });
  $$('.xp-fit').forEach(b => io.observe(b));
}

filter();
lazy();
// ?demo=<id> or ?demo=all: open with real or model data already fitted (used for screenshots)
const pre = new URLSearchParams(location.search).get('demo');
if (pre) $$(pre === 'all' ? '.xp-fit' : `#ex-${pre} .xp-fit`).forEach(b => {
  start(b); (b.querySelector('[data-act="real"]') || b.querySelector('[data-act="example"]'))?.click();
});
