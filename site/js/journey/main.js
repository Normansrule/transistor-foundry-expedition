// Fab Journey entry: hero lens, fab map, route card, lazy theatre and Virtual Fab, sources.
import { FAB, THEATRES, REFS, FAMILIES } from './data.js';
import { Lens } from './lens.js';
import { esc, store, routeSteps } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const safe = (fn, name) => { try { return fn(); } catch (e) { console.error(name, e); } };

const THEATRE_BY_AREA = Object.fromEntries(THEATRES.map((t) => [t.area, t]));
const thHref = (t) => (t.id === 'lithography' ? '#litho' : `#proc-${t.id}`);
const TRACK_SHORT = { modern_gaa: 'Modern GAA', teaching_cmos: 'Teaching CMOS', historical_planar: 'Historical planar' };
const HERO_ROUTE = { modern_gaa: 'modern gate-all-around', teaching_cmos: 'teaching cleanroom CMOS', historical_planar: 'historical planar' };
let track = store.get('track', 'modern_gaa');
if (!FAB.tracks.some((t) => t.id === track)) track = 'modern_gaa';


function modelLink(s) {
  if (!s.model) return '—';
  const name = s.model.py.split('/').pop();
  return s.model.lab ? `<a href="${esc(s.model.lab)}">${esc(name)}</a>` : esc(name);
}

function tracks() {
  const host = $('#tracks');
  host.innerHTML = FAB.tracks.map((t) => `<button type="button" data-t="${t.id}" aria-pressed="${t.id === track}" title="${esc(t.name)}">${TRACK_SHORT[t.id] || esc(t.name)}</button>`).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    track = b.dataset.t; store.set('track', track);
    host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    map(); route(); $('#heroRoute').textContent = HERO_ROUTE[track] || track;
  });
  $('#heroRoute').textContent = HERO_ROUTE[track] || track;
}

let openArea = null;
// One accent per process area, drawn from the §9.3 material palette where the area has a material.
const AREA_COLOUR = {
  materials: '#7b8ca5', cleaning: '#7fd3d0', oxidation: '#8fcfd4', lithography: '#b58fd6', etch: '#e07060',
  doping: '#3f7fe0', deposition: '#9a80dc', planarization: '#f2b84b', modules: '#5fd896', interconnect: '#d9825b',
  backend: '#e2b650', families: '#d55181', history: '#ffd27a',
};

function map() {
  const visited = new Set(store.get('visited', []));
  const passed = new Set(store.get('passed', []));
  const grid = $('#mapGrid');
  grid.innerHTML = FAB.areas.map((a) => {
    const steps = FAB.steps.filter((s) => s.area === a.id && s.tracks.includes(track));
    const th = THEATRE_BY_AREA[a.id];
    const stamp = passed.has(a.id) ? '<span class="stamp sm good" aria-hidden="true">Pass</span>'
      : visited.has(a.id) ? '<span class="stamp sm" aria-hidden="true">Seen</span>' : '';
    const status = th ? '<span class="st live">Theatre live</span>' : steps.length ? '<span class="st">Seed steps</span>' : '<span class="st">Not on this route yet</span>';
    const label = `Area ${a.number}: ${a.name}. ${steps.length} step${steps.length === 1 ? '' : 's'} on this route${th ? ', theatre live' : ''}${visited.has(a.id) ? ', visited' : ''}`;
    return `<button type="button" class="fj-area${steps.length || th ? '' : ' off'}" style="--ac:${AREA_COLOUR[a.id] || '#f2b84b'}" data-a="${a.id}" aria-expanded="${openArea === a.id}" aria-controls="areaDetail" aria-label="${esc(label)}">`
      + `<span class="num">${String(a.number).padStart(2, '0')}</span><h3>${esc(a.name)}</h3>${status}${stamp}`
      + `<span class="dots" aria-hidden="true">${steps.map((s) => `<i class="${s.status === 'seed' && !th ? 'seed' : ''}"></i>`).join('')}</span></button>`;
  }).join('');
  if (openArea) detail(openArea, false);
}

function detail(areaId, scroll = true) {
  const a = FAB.areas.find((x) => x.id === areaId), host = $('#areaDetail');
  const steps = routeSteps(track).filter((s) => s.area === areaId);
  const th = THEATRE_BY_AREA[areaId];
  host.hidden = false;
  host.innerHTML = `<div><span class="lotno">Area ${String(a.number).padStart(2, '0')}</span><h3>${esc(a.name)}</h3></div>`
    + (steps.length ? steps.map((s) => `<div class="fj-step"><h4>${esc(s.title)} <span class="tier" data-t="${s.safety_tier}">Tier ${s.safety_tier}</span></h4>`
      + `<p><b>Problem.</b> ${esc(s.problem)}</p><p><b>How it works.</b> ${esc(s.physics)}</p>`
      + (s.model ? `<p class="todo">Model: ${modelLink(s)}</p>` : '')
      + (s.needs_source && s.needs_source.length && !th ? `<p class="todo">Theatre to come. Still to source: ${esc([].concat(s.needs_source).join('; '))}</p>` : '')
      + '</div>').join('') : '<p class="small">This route has no seed step in this area yet.</p>')
    + (th ? `<p><a class="btn primary" href="${thHref(th)}">Open the ${esc(th.id === 'lithography' ? 'lithography' : th.title.toLowerCase())} theatre</a></p>` : '');
  if (scroll) host.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function mapEvents() {
  $('#mapGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.fj-area'); if (!b) return;
    const id = b.dataset.a;
    openArea = openArea === id ? null : id;
    if (openArea) { const v = new Set(store.get('visited', [])); v.add(id); store.set('visited', [...v]); }
    map();
    if (!openArea) $('#areaDetail').hidden = true; else detail(openArea);
  });
}

function route() {
  const steps = routeSteps(track), passed = new Set(store.get('passed', []));
  const area = Object.fromEntries(FAB.areas.map((a) => [a.id, a.name]));
  $('#routeSheet').innerHTML = '<div class="trow head"><span>Step</span><span>Operation</span><span>Model</span><span>Safety</span><span></span></div>'
    + steps.map((s, i) => {
      const th = THEATRE_BY_AREA[s.area] && THEATRE_BY_AREA[s.area].step === s.id;
      const stamp = th && passed.has(s.area) ? '<span class="stamp sm good" aria-label="passed">Pass</span>'
        : th ? '<span class="stamp sm" aria-label="theatre live">Live</span>' : '<span class="stamp sm dim" aria-label="seed step">Seed</span>';
      return `<div class="trow${th ? ' now' : ''}"><span class="n">${String((i + 1) * 10).padStart(3, '0')}</span>`
        + `<span class="t">${th ? `<a href="${thHref(THEATRE_BY_AREA[s.area])}">${esc(s.title)}</a>` : esc(s.title)}<small class="d" style="display:block">${esc(area[s.area])}</small></span>`
        + `<span class="d">${modelLink(s)}</span><span class="d"><span class="tier" data-t="${s.safety_tier}">Tier ${s.safety_tier}</span></span>${stamp}</div>`;
    }).join('');
}

addEventListener('tfe:progress', () => { map(); route(); });

// Process-family comparison matrix (data/families.json): one row per family, every cell with its references
function families() {
  const head = $('#famHead'), body = $('#famRows'); if (!head || !FAMILIES) return;
  const cols = FAMILIES.columns;
  head.innerHTML = `<tr><th scope="col">Family</th>${cols.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr>`;
  body.innerHTML = FAMILIES.families.map((f) => `<tr><th scope="row" data-h="Family"><b>${esc(f.name)}</b> <span class="fam-era">${esc(f.era)}</span>${f.link ? `<br><a class="fam-link" href="${esc(f.link.href)}">${esc(f.link.label)} →</a>` : ''}</th>`
    + cols.map((c) => { const v = f[c.id]; return `<td data-h="${esc(c.label)}">${esc(v.t)}${v.refs.length ? ` <span class="refchips" data-refs="${esc(v.refs.join(' '))}"></span>` : ''}</td>`; }).join('') + '</tr>').join('');
}

function refs() {
  const host = $('#fjRefs');
  const used = new Set([...document.querySelectorAll('[data-refs]')].flatMap((n) => n.dataset.refs.split(/\s+/)));
  THEATRES.forEach((t) => { t.refs.forEach((k) => used.add(k)); t.timeline.forEach((e) => e.refs.forEach((k) => used.add(k))); t.tools.forEach((x) => x.refs.forEach((k) => used.add(k))); });
  FAB.steps.forEach((s) => s.refs.forEach((k) => used.add(k)));
  host.innerHTML = Object.values(REFS).filter((r) => used.has(r.id)).sort((a, b) => a.cite.localeCompare(b.cite))
    .map((r) => `<li id="ref-${r.id}">${esc(r.cite)} ${r.link ? `<a href="${r.link}" rel="noopener">${r.doi ? 'doi:' + esc(r.doi) : 'link'}</a>` : ''}</li>`).join('');
  document.querySelectorAll('[data-refs]').forEach((n) => {
    n.innerHTML = n.dataset.refs.split(/\s+/).filter((k) => REFS[k]).map((k) => `<a href="#ref-${k}" title="${esc(REFS[k].cite)}">${k}</a>`).join('');
  });
}

function renderTeX() {
  if (!window.katex) return;
  document.querySelectorAll('[data-tex]').forEach((n) => safe(() => window.katex.render(n.dataset.tex, n, { displayMode: n.classList.contains('eq'), throwOnError: false, strict: 'ignore' }), 'tex'));
}

function lazy(id, path) {
  const el = document.getElementById(id); if (!el) return;
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return; io.disconnect();
    import(path).then((m) => safe(() => m.init(el), id)).catch((err) => { console.error(id, err); el.querySelector('.sec-head')?.insertAdjacentHTML('beforeend', '<p class="small">This simulation failed to load in your browser.</p>'); });
  }, { rootMargin: '700px 0px' });
  io.observe(el);
}

safe(() => new Lens($('#lens'), $('#scopes'), $('#lensReadout')), 'lens');
safe(tracks, 'tracks'); safe(map, 'map'); safe(mapEvents, 'mapEvents'); safe(route, 'route'); safe(families, 'families'); safe(refs, 'refs');
if (window.katex) renderTeX(); else addEventListener('load', renderTeX);
lazy('litho', './theatre.js');
lazy('proc', './proc.js');
lazy('gates', './gates.js');
lazy('builder', './builder.js');
lazy('nodelab', './nodelab.js');
lazy('defects', './defects.js');
lazy('vfab', './vfab.js');
