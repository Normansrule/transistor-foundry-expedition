// Hero lens: seven scopes from the planet to the atoms. Outer scopes zoom past the camera and deeper
// ones grow in from the centre, so stepping through them reads as one continuous dive (and stepping
// back reads as climbing out). Drawings are schematic; the wafer's die grid comes from the yield model.
import { dieGrid } from '../physics/yieldcost.js';
import { reduceMotion } from './util.js';

const SCOPES = [
  { id: 'planet', name: 'Planet', say: 'quartz sand, silicon dioxide, is the raw material' },
  { id: 'fab', name: 'Fab', say: 'a cleanroom fab, lithography bays lit amber' },
  { id: 'tool', name: 'Tool', say: 'a scanner projects the mask onto the wafer' },
  { id: 'wafer', name: 'Wafer', say: 'hundreds of dies printed on one wafer' },
  { id: 'die', name: 'Die', say: 'one die: cores, cache and the I/O ring' },
  { id: 'transistor', name: 'Transistor', say: 'the gate wraps three stacked nanosheets' },
  { id: 'atoms', name: 'Atoms', say: 'the silicon crystal, with a few dopant atoms' },
];

function planet() {
  return `<defs><radialGradient id="lzOcean" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#2a5f8f"/><stop offset="1" stop-color="#0b2236"/></radialGradient>
    <radialGradient id="lzAtm" cx="50%" cy="50%" r="50%"><stop offset=".86" stop-color="#7fd3d0" stop-opacity="0"/><stop offset="1" stop-color="#7fd3d0" stop-opacity=".35"/></radialGradient></defs>
  <circle cx="300" cy="300" r="205" fill="url(#lzOcean)"/>
  <g fill="#3d5a3f" opacity=".9"><path d="M170 210 q40 -40 95 -22 q30 12 22 46 q-12 30 -48 34 q-30 4 -50 30 q-24 26 -44 4 q-16 -22 -4 -52 q10 -26 29 -40z"/>
  <path d="M330 170 q50 -10 80 24 q24 30 4 64 q-14 22 -40 18 q-20 -4 -30 16 q-12 26 -40 18 q-26 -10 -16 -44 q8 -30 22 -50 q8 -40 20 -46z"/>
  <path d="M300 360 q40 -8 70 18 q26 24 10 58 q-18 34 -60 32 q-36 -4 -40 -40 q-4 -40 20 -68z"/></g>
  <path d="M330 170 q50 -10 80 24 q24 30 4 64" fill="none" stroke="#e9cf8f" stroke-width="5" stroke-linecap="round" opacity=".9"/>
  <circle cx="300" cy="300" r="214" fill="url(#lzAtm)"/>
  <circle cx="402" cy="212" r="7" fill="#f2b84b"/><circle cx="402" cy="212" r="16" fill="none" stroke="#f2b84b" stroke-width="1.5" opacity=".7"/>`;
}

function fab() {
  // isometric building: cleanroom above, sub-fab below, an amber lithography band
  const iso = (x, y, z) => [300 + (x - y) * 0.866, 360 + (x + y) * 0.5 - z];
  const quad = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => iso(...p).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
  const W = 220, D = 150, H = 120;
  let s = quad([[-W / 2, -D / 2, 0], [W / 2, -D / 2, 0], [W / 2, D / 2, 0], [-W / 2, D / 2, 0]], '#1a222d');
  s += quad([[-W / 2, D / 2, 0], [W / 2, D / 2, 0], [W / 2, D / 2, H], [-W / 2, D / 2, H]], '#3a4658');
  s += quad([[W / 2, -D / 2, 0], [W / 2, D / 2, 0], [W / 2, D / 2, H], [W / 2, -D / 2, H]], '#2b3544');
  s += quad([[-W / 2, -D / 2, H], [W / 2, -D / 2, H], [W / 2, D / 2, H], [-W / 2, D / 2, H]], '#55637a');
  s += quad([[-W / 2 + 10, D / 2, 54], [W / 2 - 10, D / 2, 54], [W / 2 - 10, D / 2, 78], [-W / 2 + 10, D / 2, 78]], '#f2b84b', 'opacity=".85"');
  s += quad([[W / 2, -D / 2 + 10, 54], [W / 2, D / 2 - 10, 54], [W / 2, D / 2 - 10, 78], [W / 2, -D / 2 + 10, 78]], '#c99436', 'opacity=".85"');
  for (let i = 1; i < 8; i++) s += `<line x1="${iso(-W / 2 + i * W / 8, -D / 2, H)[0]}" y1="${iso(-W / 2 + i * W / 8, -D / 2, H)[1]}" x2="${iso(-W / 2 + i * W / 8, D / 2, H)[0]}" y2="${iso(-W / 2 + i * W / 8, D / 2, H)[1]}" stroke="#6d7c94" stroke-width="1"/>`;
  s += quad([[-W / 2 + 10, D / 2, 14], [W / 2 - 10, D / 2, 14], [W / 2 - 10, D / 2, 34], [-W / 2 + 10, D / 2, 34]], '#232c38');
  return `<rect x="0" y="0" width="600" height="600" fill="#0e141c"/><circle cx="300" cy="300" r="230" fill="#f2b84b" opacity=".05"/>${s}`;
}

function tool() {
  return `<defs><linearGradient id="lzBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b58fd6" stop-opacity=".1"/><stop offset="1" stop-color="#b58fd6" stop-opacity=".6"/></linearGradient></defs>
  <rect x="150" y="96" width="300" height="420" rx="14" fill="#1c2430" stroke="#2f3845"/>
  <rect x="250" y="118" width="100" height="34" rx="6" fill="#3a4658"/><text x="300" y="140" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" fill="#aab3c0">source</text>
  <polygon points="288,152 312,152 340,206 260,206" fill="url(#lzBeam)"/>
  <rect x="220" y="206" width="160" height="14" fill="#8a94a3"/><g fill="#0c1016"><rect x="246" y="206" width="16" height="14"/><rect x="292" y="206" width="16" height="14"/><rect x="338" y="206" width="16" height="14"/></g>
  <text x="392" y="218" font-family="IBM Plex Mono" font-size="12" fill="#8a94a3">mask</text>
  <polygon points="250,220 350,220 330,410 270,410" fill="url(#lzBeam)" opacity=".8"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${236 + i * 6}" y="${250 + i * 40}" width="${128 - i * 12}" height="16" rx="8" fill="#7fd3d0" opacity="${0.35 + i * 0.1}"/>`).join('')}
  <text x="392" y="300" font-family="IBM Plex Mono" font-size="12" fill="#8a94a3">lens</text>
  <ellipse cx="300" cy="430" rx="110" ry="18" fill="#4b596d"/><ellipse cx="300" cy="426" rx="110" ry="18" fill="url(#lzWaferSheen)"/>
  <defs><linearGradient id="lzWaferSheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fd3d0" stop-opacity=".45"/><stop offset=".5" stop-color="#b58fd6" stop-opacity=".45"/><stop offset="1" stop-color="#f2b84b" stop-opacity=".45"/></linearGradient></defs>
  <circle cx="300" cy="420" r="5" fill="#f2b84b"/><rect x="190" y="452" width="220" height="30" rx="6" fill="#2b3544"/><text x="300" y="472" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" fill="#aab3c0">wafer stage</text>`;
}

function wafer() {
  const R = 210, k = R / 150, cells = dieGrid(22, 26, 300, 3, 0.1);
  const dies = cells.map(([x, y]) => `<rect x="${(300 + x * k - 11 * k).toFixed(1)}" y="${(300 + y * k - 13 * k).toFixed(1)}" width="${(22 * k).toFixed(1)}" height="${(26 * k).toFixed(1)}"/>`).join('');
  return `<defs><linearGradient id="lzFilm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd3d0"/><stop offset=".35" stop-color="#b58fd6"/><stop offset=".65" stop-color="#f2b84b"/><stop offset="1" stop-color="#d9825b"/></linearGradient>
    <clipPath id="lzWclip"><circle cx="300" cy="300" r="${R}"/></clipPath></defs>
  <circle cx="300" cy="300" r="${R}" fill="#3b4656"/><circle cx="300" cy="300" r="${R}" fill="url(#lzFilm)" opacity=".35"/>
  <g clip-path="url(#lzWclip)" fill="#2a3442" stroke="#8a94a3" stroke-opacity=".5" stroke-width=".8">${dies}</g>
  <path d="M292 ${300 + R - 1} a8 8 0 0 1 16 0z" fill="#0c1016"/>
  <rect x="${(300 - 11 * k).toFixed(1)}" y="${(300 - 13 * k).toFixed(1)}" width="${(22 * k).toFixed(1)}" height="${(26 * k).toFixed(1)}" fill="none" stroke="#f2b84b" stroke-width="2.5"/>`;
}

function die() {
  let s = '<rect x="130" y="110" width="340" height="380" rx="4" fill="#232b36" stroke="#8a94a3" stroke-opacity=".6"/>';
  for (let i = 0; i < 18; i++) { s += `<rect x="${140 + i * 18.6}" y="116" width="10" height="10" fill="#e2b650" opacity=".8"/><rect x="${140 + i * 18.6}" y="474" width="10" height="10" fill="#e2b650" opacity=".8"/>`; }
  for (let j = 0; j < 20; j++) { s += `<rect x="136" y="${136 + j * 17.4}" width="10" height="10" fill="#e2b650" opacity=".8"/><rect x="454" y="${136 + j * 17.4}" width="10" height="10" fill="#e2b650" opacity=".8"/>`; }
  const core = (x, y) => `<rect x="${x}" y="${y}" width="120" height="110" rx="3" fill="#3a4658"/><rect x="${x + 8}" y="${y + 8}" width="50" height="40" fill="#4f6079"/><rect x="${x + 64}" y="${y + 8}" width="48" height="94" fill="#2f3a4a"/><rect x="${x + 8}" y="${y + 54}" width="50" height="48" fill="#58489a" opacity=".7"/>`;
  s += core(162, 146) + core(318, 146) + core(162, 330) + core(318, 330);
  s += '<rect x="162" y="266" width="276" height="54" fill="#1f5f63" opacity=".8"/>';
  for (let i = 0; i < 22; i++) s += `<line x1="${166 + i * 12.4}" y1="268" x2="${166 + i * 12.4}" y2="318" stroke="#7fd3d0" stroke-opacity=".35"/>`;
  s += '<rect x="282" y="282" width="36" height="22" fill="none" stroke="#f2b84b" stroke-width="2"/>';
  return s;
}

function transistor() {
  return `<defs><radialGradient id="lzGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f2b84b" stop-opacity=".5"/><stop offset="1" stop-color="#f2b84b" stop-opacity="0"/></radialGradient></defs>
  <circle cx="300" cy="300" r="200" fill="url(#lzGlow)"/>
  <g transform="translate(150 165)">
    <rect x="0" y="210" width="300" height="70" fill="#4b596d"/><rect x="0" y="200" width="300" height="10" fill="#6fa9b3"/>
    <rect x="0" y="40" width="70" height="160" rx="3" fill="#3f7fe0"/><rect x="230" y="40" width="70" height="160" rx="3" fill="#3f7fe0"/>
    <rect x="80" y="20" width="140" height="180" rx="6" fill="#e2b650"/>
    <g fill="#7b8ca5" stroke="#9a80dc" stroke-width="4"><rect x="70" y="58" width="160" height="22" rx="4"/><rect x="70" y="108" width="160" height="22" rx="4"/><rect x="70" y="158" width="160" height="22" rx="4"/></g>
    <rect x="70" y="20" width="10" height="180" fill="#cfd6e0"/><rect x="220" y="20" width="10" height="180" fill="#cfd6e0"/>
    <g fill="#9fc6ff" class="lz-e"><circle cx="100" cy="69" r="4"/><circle cx="150" cy="119" r="4"/><circle cx="200" cy="169" r="4"/></g>
    <g font-family="IBM Plex Mono" font-size="12" fill="#e8ecf1"><text x="6" y="34">source</text><text x="240" y="34">drain</text><text x="118" y="14" fill="#f2b84b">gate</text></g>
  </g>`;
}

function atoms() {
  // diamond-cubic silicon viewed along [110]: dumbbell pairs on a rectangular lattice
  let s = '<rect x="0" y="0" width="600" height="600" fill="#0d1218"/>', bonds = '', dots = '';
  const ax = 64, ay = 90, dop = new Set(['3,2', '6,4', '2,5']);
  for (let j = -1; j < 8; j++) for (let i = -1; i < 10; i++) {
    const x = 20 + i * ax + (j % 2 ? ax / 2 : 0), y = 30 + j * ay;
    const x2 = x, y2 = y + 22;
    bonds += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/><line x1="${x2}" y1="${y2}" x2="${x2 + ax / 2}" y2="${y2 + ay - 22}"/><line x1="${x2}" y1="${y2}" x2="${x2 - ax / 2}" y2="${y2 + ay - 22}"/>`;
    const d = dop.has(`${i},${j}`);
    dots += `<circle cx="${x}" cy="${y}" r="9" fill="${d ? '#3f7fe0' : '#8fa1bb'}"/><circle cx="${x2}" cy="${y2}" r="9" fill="#8fa1bb"/>`;
  }
  return s + `<g stroke="#4b596d" stroke-width="4">${bonds}</g>${dots}<g fill="#e8ecf1" opacity=".18">${dots.replace(/r="9"/g, 'r="3"')}</g>`;
}

const DRAW = { planet, fab, tool, wafer, die, transistor, atoms };

export class Lens {
  constructor(host, buttons, readout) {
    this.host = host; this.buttons = buttons; this.readout = readout; this.i = 5; this.timer = 0; this.auto = !reduceMotion();
    host.innerHTML = `<svg viewBox="0 0 600 600" aria-hidden="true"><defs><clipPath id="lzClip"><circle cx="300" cy="300" r="276"/></clipPath></defs><g clip-path="url(#lzClip)">`
      + SCOPES.map((s, k) => `<g class="scope" data-k="${k}">${DRAW[s.id]()}</g>`).join('')
      + '<g stroke="#e8ecf1" stroke-opacity=".22" fill="none"><line x1="300" y1="30" x2="300" y2="84"/><line x1="300" y1="516" x2="300" y2="570"/><line x1="30" y1="300" x2="84" y2="300"/><line x1="516" y1="300" x2="570" y2="300"/><circle cx="300" cy="300" r="250" stroke-dasharray="2 10"/></g></g></svg>';
    buttons.innerHTML = SCOPES.map((s, k) => `<button type="button" data-k="${k}" aria-pressed="false"><b>${k + 1}</b>${s.name}</button>`).join('');
    buttons.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.stop(); this.go(+b.dataset.k); });
    buttons.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); this.stop(); this.go((this.i + (e.key === 'ArrowRight' ? 1 : SCOPES.length - 1)) % SCOPES.length);
      buttons.querySelectorAll('button')[this.i].focus();
    });
    this.go(this.auto ? 0 : 5);
    if (this.auto) {
      new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible && this.auto) this.loop(); else clearTimeout(this.timer); }).observe(host);
    }
  }
  loop() { clearTimeout(this.timer); this.timer = setTimeout(() => { if (!this.auto) return; this.go((this.i + 1) % SCOPES.length); this.loop(); }, this.i === 5 ? 4200 : 2600); }
  stop() { this.auto = false; clearTimeout(this.timer); }
  go(k) {
    this.i = k;
    this.host.querySelectorAll('.scope').forEach((g, j) => { g.classList.toggle('on', j === k); g.classList.toggle('past', j < k); g.classList.toggle('future', j > k); });
    this.buttons.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    this.readout.innerHTML = `scope <b>${k + 1}</b> of 7 · ${SCOPES[k].name.toLowerCase()} · ${SCOPES[k].say}`;
  }
}
