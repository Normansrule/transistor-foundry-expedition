// Node-reading lab (roadmap item 8): measure the gate, fin and metal pitches and the SRAM bitcell on a
// top view of a die, then match them to a node. The pitches come from data/node_pitches.json (cited);
// the arithmetic from physics/nodelab.js (twin of sim/transistor_sim/physics/nodelab.py).
// Two marks on range inputs measure across N pitches, so the page works fully from the keyboard.
import { NODEPITCH, REFS } from './data.js';
import { pitch, pitchError, rank, view, value, cell } from '../physics/nodelab.js';
import { esc, store } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const NODES = NODEPITCH.nodes;
const BY = Object.fromEntries(NODES.map((n) => [n.id, n]));
const COL = { si: '#4b596d', sich: '#7b8ca5', metal: '#e2b650', poly: '#c95c50', cu: '#d9825b', sti: '#2a3442', cell: '#6fa9b3' };
const STEPS = 400;                         // positions per mark: the "pixels" of this microscope
// layer → what it measures and along which axis
const LAYERS = [
  ['gate', 'Gates', 'cpp', 'x'],
  ['fin', 'Fins', 'fin', 'y'],
  ['metal', 'Metal 1', 'mmp', 'y'],
  ['sramw', 'SRAM width', 'sramw', 'x'],
  ['sramh', 'SRAM height', 'sramh', 'y'],
];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l[0], { id: l[0], label: l[1], q: l[2], axis: l[3] }]));
const QLABEL = { cpp: 'gate pitch', fin: 'fin pitch', mmp: 'metal pitch', sramw: 'bitcell width', sramh: 'bitcell height' };
const refLinks = (keys) => keys.filter((k) => k && REFS[k]).map((k) => `<a href="#ref-${k}" title="${esc(REFS[k].cite)}">${k}</a>`).join('');
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
const name = (n) => `${n.maker} ${n.label}`;

const state = { mode: store.get('nl:mode', 'challenge'), node: 'intel22', layer: 'gate', a: 40, b: 360, count: 5, span: 600, off: {}, got: {}, revealed: false };

function rnd(a, b) { return a + Math.random() * (b - a); }

// A fresh chip: a hidden node, a random field of view and random line offsets.
function newChip(id) {
  state.node = id || NODES[Math.floor(Math.random() * NODES.length)].id;
  const n = BY[state.node];
  state.span = Math.round(value(n, 'cpp') * rnd(7.5, 11.5) / 10) * 10;
  state.off = { x: rnd(0, 1000), y: rnd(0, 1000), sx: rnd(0, 1000), sy: rnd(0, 1000) };
  state.got = {}; state.revealed = state.mode === 'explore';
  if (!LAYER[state.layer]) state.layer = 'gate';
}

const nmOf = (s) => (s / STEPS) * state.span;

// ---------- drawing ----------
function scaleBar(span) {
  const nice = [10, 20, 25, 50, 100, 200, 250, 500];
  const len = nice.filter((v) => v <= span / 4).pop() || 10;
  const y = span * 0.955, x = span * 0.04;
  return `<g class="nl-bar"><rect x="${x - 6}" y="${y - span * 0.05}" width="${len + 12}" height="${span * 0.07}" rx="3" fill="rgba(10,13,17,.78)"/>
    <rect x="${x}" y="${y}" width="${len}" height="${span * 0.008}" fill="#e8edf3"/>
    <text x="${x + len / 2}" y="${y - span * 0.012}" text-anchor="middle" font-size="${span * 0.032}" fill="#e8edf3" font-family="IBM Plex Mono, monospace">${len} nm</text></g>`;
}

function picture() {
  const n = BY[state.node], S = state.span, L = LAYER[state.layer];
  const parts = [`<rect width="${S}" height="${S}" fill="${COL.sti}"/>`];
  if (L.id === 'gate' || L.id === 'fin') {
    const fv = n.fin ? view(n, 'fin', S, state.off.y) : null;
    if (fv) fv.centres.forEach((y) => parts.push(`<rect x="0" y="${y - fv.width / 2}" width="${S}" height="${fv.width}" fill="${COL.sich}"/>`));
    else parts.push(`<rect x="0" y="${S * 0.18}" width="${S}" height="${S * 0.64}" fill="${COL.si}"/>`);
    const g = view(n, 'gate', S, state.off.x);
    g.centres.forEach((x) => parts.push(`<rect x="${x - g.width / 2}" y="0" width="${g.width}" height="${S}" fill="${COL.metal}" opacity="${L.id === 'fin' ? 0.55 : 0.95}"/>`));
  } else if (L.id === 'metal') {
    const m = view(n, 'metal', S, state.off.y);
    m.centres.forEach((y) => parts.push(`<rect x="0" y="${y - m.width / 2}" width="${S}" height="${m.width}" fill="${COL.cu}"/>`));
  } else {
    const [w, h] = cell(n);
    const xs = view(n, 'sram', S, state.off.sx).centres;
    const ys = [];
    for (let y = ((state.off.sy % h) + h) % h; y <= S + 1e-9; y += h) ys.push(y);
    const g = view(n, 'gate', S, state.off.sx + w / 4);
    g.centres.forEach((x) => parts.push(`<rect x="${x - g.width / 2}" y="0" width="${g.width}" height="${S}" fill="${COL.metal}" opacity=".35"/>`));
    xs.forEach((x) => parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${S}" stroke="${COL.cell}" stroke-width="${S * 0.006}"/>`));
    ys.forEach((y) => parts.push(`<line x1="0" y1="${y}" x2="${S}" y2="${y}" stroke="${COL.cell}" stroke-width="${S * 0.006}"/>`));
  }
  // marks
  const A = nmOf(state.a), B = nmOf(state.b), sw = S * 0.006;
  const mark = (p, c, t) => (L.axis === 'x'
    ? `<line x1="${p}" y1="0" x2="${p}" y2="${S}" stroke="${c}" stroke-width="${sw}"/><text x="${p + S * 0.01}" y="${S * 0.05}" font-size="${S * 0.035}" fill="${c}" font-family="IBM Plex Mono, monospace">${t}</text>`
    : `<line x1="0" y1="${p}" x2="${S}" y2="${p}" stroke="${c}" stroke-width="${sw}"/><text x="${S * 0.86}" y="${p - S * 0.01}" font-size="${S * 0.035}" fill="${c}" font-family="IBM Plex Mono, monospace">${t}</text>`);
  parts.push(mark(A, '#5fd3e0', 'A'), mark(B, '#f29fc8', 'B'), scaleBar(S));
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><filter id="nlGrain"><feTurbulence type="fractalNoise" baseFrequency="${(2.2 / S * 100).toFixed(3)}" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
    ${parts.join('')}<rect width="${S}" height="${S}" filter="url(#nlGrain)" fill="#fff" opacity=".9"/></svg>`;
}

// ---------- measuring ----------
function current() {
  const d = Math.abs(nmOf(state.b) - nmOf(state.a));
  const p = pitch(nmOf(state.a), nmOf(state.b), state.count);
  return { d, p, e: pitchError(state.span / STEPS, state.count) };
}

function measured() {
  const g = state.got, m = {};
  ['cpp', 'fin', 'mmp'].forEach((q) => { if (g[q]) m[q] = g[q]; });
  if (g.sramw && g.sramh) m.sram = g.sramw * g.sramh / 1e6;
  return m;
}

function render() {
  const n = BY[state.node], L = LAYER[state.layer];
  $('#nlLayer').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.layer)));
  $('#nlView').innerHTML = picture();
  const ax = L.axis === 'x' ? 'from the left' : 'from the top';
  $('#nlView').setAttribute('aria-label', `Top view of a chip, ${L.label.toLowerCase()} layer, ${state.span} nm across, with mark A at ${fmt(nmOf(state.a))} nm and mark B at ${fmt(nmOf(state.b))} nm ${ax}.`);
  $('#nlAo').textContent = `${fmt(nmOf(state.a))} nm`; $('#nlBo').textContent = `${fmt(nmOf(state.b))} nm`;
  $('#nlNo').textContent = state.count;
  const c = current();
  $('#nlRead').innerHTML = `A to B is <b>${fmt(c.d)} nm</b> across ${state.count} ${state.count === 1 ? 'pitch' : 'pitches'}, so the ${QLABEL[L.q]} is <b>${fmt(c.p)} ± ${fmt(c.e)} nm</b>.`;
  $('#nlFinNote').hidden = !(L.id === 'fin' && !n.fin);
  $('#nlUse').disabled = L.id === 'fin' && !n.fin;
  // what has been recorded
  const g = state.got, m = measured();
  const rows = [['cpp', 'Gate pitch (CPP)', 'nm'], ['fin', 'Fin pitch', 'nm'], ['mmp', 'Metal pitch (MMP)', 'nm']]
    .map(([q, l, u]) => `<li><span>${l}</span><b>${g[q] ? fmt(g[q]) + ' ' + u : '—'}</b></li>`);
  rows.push(`<li><span>SRAM bitcell</span><b>${m.sram ? fmt(m.sram, 4) + ' µm²' : g.sramw || g.sramh ? 'measure width and height' : '—'}</b></li>`);
  if (m.cpp && m.mmp) rows.push(`<li><span>CPP × MMP</span><b>${fmt(m.cpp * m.mmp, 0)} nm²</b></li>`);
  $('#nlGot').innerHTML = rows.join('');
  // the match
  const r = rank(m, NODES);
  if (!r.length) $('#nlMatch').innerHTML = '<p class="small">Measure a pitch and press “Use this measurement”. The more you measure, the surer the match.</p>';
  else {
    $('#nlMatch').innerHTML = `<ol class="nl-rank">${r.slice(0, 3).map(([id, s], i) => `<li${i === 0 ? ' class="best"' : ''}><span>${esc(name(BY[id]))} <small>${BY[id].year}</small></span><b>${fmt(100 * (Math.exp(s) - 1), 0)} % off</b></li>`).join('')}</ol>`;
  }
  const best = r.length ? r[0][0] : null;
  $('#nlReveal').hidden = state.mode !== 'challenge';
  $('#nlReveal').disabled = state.revealed;
  $('#nlTruth').innerHTML = state.revealed
    ? `<p><b>This chip is ${esc(name(n))}</b> (${n.year}). ${esc(n.note)}${best ? (best === n.id ? ' Your measurements found it.' : ` Your best match was ${esc(name(BY[best]))}: measure another layer to tell them apart.`) : ''}</p>`
    : '<p class="small">The chip is hidden. Measure it, then reveal it.</p>';
  $('#nlTable').querySelectorAll('tr[data-id]').forEach((tr) => tr.classList.toggle('on', state.revealed && tr.dataset.id === n.id));
}

function table() {
  const H = { cpp: 'Gate pitch, nm', mmp: 'Metal pitch, nm', fin: 'Fin pitch, nm', sram: 'SRAM bitcell, µm²' };
  const cellv = (n, q, d) => { const v = n[q]; if (!v) return `<td data-h="${H[q]}">—</td>`; return `<td data-h="${H[q]}">${fmt(v[0], d === 1 && Number.isInteger(v[0]) ? 0 : d)}${v[1] ? ` <span class="refchips">${refLinks([v[1]])}</span>` : ' <em title="Not a cited figure">est.</em>'}</td>`; };
  $('#nlTable').innerHTML = `<thead><tr><th scope="col">Node</th><th scope="col">Year</th><th scope="col">Gate pitch <span class="u">(nm)</span></th><th scope="col">Metal pitch <span class="u">(nm)</span></th><th scope="col">Fin pitch <span class="u">(nm)</span></th><th scope="col">SRAM bitcell <span class="u">(µm²)</span></th><th scope="col">CPP × MMP <span class="u">(nm²)</span></th></tr></thead><tbody>`
    + NODES.map((n) => `<tr data-id="${n.id}"><th scope="row">${esc(name(n))}</th><td data-h="Year">${n.year}</td>${cellv(n, 'cpp', 1)}${cellv(n, 'mmp', 1)}${cellv(n, 'fin', 0)}${cellv(n, 'sram', 4)}<td data-h="CPP × MMP, nm²">${fmt(value(n, 'cpp') * value(n, 'mmp'), 0)}</td></tr>`).join('') + '</tbody>';
}

function seg(host, items, cur, on) {
  host.innerHTML = items.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('');
  host.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); on(b.dataset.v); };
}

function modeUi() {
  const ex = state.mode === 'explore';
  $('#nlNodeGrp').hidden = !ex; $('#nlNew').hidden = ex;
  if (ex) seg($('#nlNode'), NODES.map((n) => [n.id, name(n)]), state.node, (v) => { newChip(v); render(); });
}

export function init() {
  const bind = (id, k) => $(id).addEventListener('input', (e) => { state[k] = +e.target.value; render(); });
  bind('#nlA', 'a'); bind('#nlB', 'b'); bind('#nlN', 'count');
  $('#nlNew').addEventListener('click', () => { newChip(); render(); });
  $('#nlReveal').addEventListener('click', () => { state.revealed = true; render(); });
  $('#nlUse').addEventListener('click', () => { const L = LAYER[state.layer]; state.got[L.q] = current().p; render(); });
  $('#nlClear').addEventListener('click', () => { state.got = {}; render(); });
  // Click the picture to move the nearer mark there.
  $('#nlView').addEventListener('click', (e) => {
    const svg = $('#nlView svg'); if (!svg) return;
    const r = svg.getBoundingClientRect(), L = LAYER[state.layer];
    const f = L.axis === 'x' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    const s = Math.round(Math.max(0, Math.min(1, f)) * STEPS);
    const k = Math.abs(s - state.a) <= Math.abs(s - state.b) ? 'a' : 'b';
    state[k] = s; $(k === 'a' ? '#nlA' : '#nlB').value = s; render();
  });
  const q = new URLSearchParams(location.search);       // ?node=<id>&layer=<id> opens a given chip (screenshots)
  if (BY[q.get('node')]) { state.mode = 'explore'; state.node = q.get('node'); }
  if (LAYER[q.get('layer')]) state.layer = q.get('layer');
  seg($('#nlMode'), [['challenge', 'Mystery chip'], ['explore', 'Pick a node']], state.mode, (v) => {
    state.mode = v; store.set('nl:mode', v); newChip(v === 'explore' ? state.node : null); modeUi(); render();
  });
  seg($('#nlLayer'), LAYERS.map((l) => [l[0], l[1]]), state.layer, (v) => { state.layer = v; render(); });
  newChip(state.mode === 'explore' ? state.node : null);
  if (q.has('node')) state.off = { x: 20, y: 10, sx: 15, sy: 30 };
  modeUi(); table(); render();
}
