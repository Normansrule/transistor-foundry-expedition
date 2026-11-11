// The blocks tiled into arrays: a 4-bit ripple-carry adder built from four full-adder cells, and a
// 4 × 4 SRAM array with alternate rows mirrored so neighbouring rows share a power rail. Placement
// and the carry routes come from data/gate_cells.json (gateblocks.py: fa_array, sram_array); the
// adder's bits are computed stage by stage with the Circuit Lab's switch model (physics/logic.js).
import { GATECELLS } from './data.js';
import { conducts } from '../physics/logic.js';

const AMBER = '#f2b84b', E = '#9fc6ff', DIM = '#5d6878', INK = '#e8ecf1', MUTED = '#8a94a3', M3 = '#ffd36b';
const MONO = 'font-family="IBM Plex Mono, monospace"';
const ORDER = ['nwell', 'active', 'fin', 'poly', 'metal1', 'contact', 'via', 'metal2'];
const N = 4;
const st = { a: [1, 1, 0, 1], b: [1, 0, 1, 0], cin: 0, mem: [[1, 0, 1, 1], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 1, 1]], row: -1 };

const bitsToInt = (bits) => bits.reduce((acc, b, i) => acc + (b << i), 0);
const bin = (bits) => bits.slice().reverse().join('');

/** One adder bit, evaluated stage by stage through the transistor networks (not with +). */
function addBit(fa, a, b, c) {
  const v = { A: a, B: b, C: c };
  fa.stages.forEach((s) => { v[s.out] = conducts(s.pd, v) ? 0 : 1; });
  return v;
}

export function ripple(fa, a, b, cin) {
  const s = [], carry = [cin];
  for (let i = 0; i < a.length; i++) {
    const v = addBit(fa, a[i], b[i], carry[i]);
    s.push(v.S); carry.push(v.Co);
  }
  return { s, carry };
}

function tile(c, sc, id) {
  const L = GATECELLS.layers;
  let s = `<g id="${id}">`;
  for (const layer of ORDER) for (const [l, x0, y0, x1, y1] of c.shapes) {
    if (l !== layer) continue;
    const fill = L[layer].colour, op = layer === 'metal1' ? 0.32 : layer === 'nwell' ? 0.35 : L[layer].opacity;
    s += `<rect x="${(x0 * sc).toFixed(2)}" y="${((c.h - y1) * sc).toFixed(2)}" width="${((x1 - x0) * sc).toFixed(2)}" height="${((y1 - y0) * sc).toFixed(2)}" fill="${fill}" fill-opacity="${op}"${layer === 'metal1' ? ` stroke="${fill}" stroke-width=".6"` : ''}/>`;
  }
  return s + `<rect width="${(c.w * sc).toFixed(2)}" height="${(c.h * sc).toFixed(2)}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-dasharray="3 3"/></g>`;
}

function adderSvg(fa, tech) {
  const c = fa.cells[tech], A = c.array, W = 1040, sc = W / A.w, H = c.h * sc, ox = 64, oy = 92;
  const { s: sum, carry } = ripple(fa, st.a, st.b, st.cin);
  let s = `<defs>${tile(c, sc, 'gtFaTile')}</defs><rect x="0" y="0" width="${W + 2 * ox}" height="${H + oy + 110}" fill="#0c1016"/>`;
  for (let i = 0; i < N; i++) {
    const x = ox + i * A.px * sc;
    s += `<use href="#gtFaTile" x="${x.toFixed(1)}" y="${oy}"/>`;
    s += `<text x="${x + A.px * sc / 2}" y="${oy - 46}" text-anchor="middle" font-size="13" ${MONO} fill="${INK}">bit ${i}</text>`
      + `<text x="${x + A.px * sc / 2}" y="${oy - 26}" text-anchor="middle" font-size="12" ${MONO} fill="${MUTED}">A${i}=<tspan fill="${st.a[i] ? AMBER : MUTED}">${st.a[i]}</tspan>  B${i}=<tspan fill="${st.b[i] ? AMBER : MUTED}">${st.b[i]}</tspan></text>`
      + `<text x="${x + A.px * sc / 2}" y="${oy + H + 28}" text-anchor="middle" font-size="14" ${MONO} fill="${sum[i] ? AMBER : MUTED}">S${i} = ${sum[i]}</text>`;
  }
  // carry routes in metal 3, lit when the carry is 1
  A.routes.forEach((pts, i) => {
    const on = carry[i + 1] === 1, d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${(ox + x * sc).toFixed(1)} ${(oy + (c.h - y) * sc).toFixed(1)}`).join(' ');
    s += `<path d="${d}" fill="none" stroke="#0c1016" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${on ? M3 : DIM}" stroke-width="4" stroke-linejoin="round"${on ? ' class="gt-ch"' : ''}/>`;
    const [x2, y2] = pts[1];
    s += `<text x="${(ox + x2 * sc + 6).toFixed(1)}" y="${(oy + (c.h - y2) * sc - 8).toFixed(1)}" font-size="11" ${MONO} fill="${on ? M3 : MUTED}">C${i + 1}=${carry[i + 1]}</text>`;
  });
  const [cx, cy] = c.pins.C, [ex, ey] = c.outs.Co;
  s += `<path d="M${ox - 40} ${oy + (c.h - cy) * sc} H${ox + cx * sc}" stroke="${st.cin ? M3 : DIM}" stroke-width="4"/><text x="${ox - 44}" y="${oy + (c.h - cy) * sc - 8}" font-size="11" ${MONO} fill="${INK}">Cin=${st.cin}</text>`;
  const xe = ox + (N - 1) * A.px * sc + ex * sc;
  s += `<path d="M${xe} ${oy + (c.h - ey) * sc} V${oy + H + 50} H${W + ox + 30}" fill="none" stroke="${carry[N] ? M3 : DIM}" stroke-width="4"/><text x="${W + ox + 26}" y="${oy + H + 44}" text-anchor="end" font-size="13" ${MONO} fill="${carry[N] ? M3 : MUTED}">Cout = ${carry[N]}</text>`;
  s += `<text x="${ox}" y="24" font-size="12" ${MONO} fill="${MUTED}">${N} full-adder cells side by side · carry hops between cells on metal 3 (yellow when 1) · bit 0 on the left, where the carry starts</text>`;
  s += `<text x="${ox}" y="${oy + H + 92}" font-size="12" ${MONO} fill="${MUTED}">array ${(A.w / 1000).toFixed(A.w < 10000 ? 2 : 1)} × ${(A.h / 1000).toFixed(2)} µm</text>`;
  return { svg: `<svg viewBox="0 0 ${W + 2 * ox} ${H + oy + 110}" style="max-width:none;--mw:1000px">${s}</svg>`, sum, carry };
}

function sramSvg(sr, tech) {
  const c = sr.cells[tech], A = c.array, side = 520, sc = side / Math.max(A.w, A.h), cw = A.px * sc, ch = A.py * sc, ox = 92, oy = 64;
  const W = A.w * sc, H = A.h * sc;
  let s = `<defs>${tile(c, sc, 'gtSrTile')}</defs><rect width="${W + ox + 70}" height="${H + oy + 120}" fill="#0c1016"/>`;
  const rowTop = (r) => oy + (N - 1 - r) * ch;
  for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) {
    const x = ox + k * cw, y = rowTop(r), mir = r % 2 === 1;
    s += mir ? `<use href="#gtSrTile" transform="translate(${x.toFixed(1)} ${(y + ch).toFixed(1)}) scale(1 -1)"/>` : `<use href="#gtSrTile" x="${x.toFixed(1)}" y="${y.toFixed(1)}"/>`;
  }
  // word lines (rows) and bit-line pairs (columns)
  const wly = (r) => { const yl = (c.h - c.pins.WL[1]) * sc; return rowTop(r) + (r % 2 ? ch - yl : yl); };
  for (let r = 0; r < N; r++) {
    const on = st.row === r;
    s += `<line x1="${ox - 14}" y1="${wly(r)}" x2="${ox + W + 6}" y2="${wly(r)}" stroke="${on ? AMBER : '#ffffff'}" stroke-opacity="${on ? 1 : 0.25}" stroke-width="${on ? 4 : 2}"${on ? ' class="gt-ch"' : ''}/>`
      + `<text x="${ox - 18}" y="${wly(r) + 4}" text-anchor="end" font-size="12" ${MONO} fill="${on ? AMBER : MUTED}">WL${r}</text>`;
  }
  for (let k = 0; k < N; k++) {
    const q = st.row >= 0 ? st.mem[st.row][k] : null;
    [['BL', c.outs.BL[0], q === 0], ['BLB', c.outs.BLB[0], q === 1]].forEach(([nm, bx, low]) => {
      const x = ox + k * cw + bx * sc;
      s += `<line x1="${x}" y1="${oy - 10}" x2="${x}" y2="${oy + H + 28}" stroke="${low ? E : AMBER}" stroke-opacity="${st.row >= 0 ? 0.95 : 0.4}" stroke-width="${low ? 3.5 : 2}"${low ? ' class="gt-ch"' : ''}/>`;
    });
    const xm = ox + k * cw + cw / 2;
    s += `<text x="${xm}" y="${oy - 16}" text-anchor="middle" font-size="11" ${MONO} fill="${MUTED}">BL${k} · B̄L̄${k}</text>`;
    s += `<rect x="${xm - 34}" y="${oy + H + 30}" width="68" height="26" rx="5" fill="#141b24" stroke="${q === null ? DIM : AMBER}"/><text x="${xm}" y="${oy + H + 47}" text-anchor="middle" font-size="12" ${MONO} fill="${q === null ? MUTED : AMBER}">${q === null ? 'sense' : 'reads ' + q}</text>`;
  }
  for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) {
    const x = ox + k * cw + cw / 2, y = rowTop(r) + ch / 2, b = st.mem[r][k], on = st.row === r;
    s += `<circle cx="${x}" cy="${y}" r="12" fill="#0c1016" fill-opacity=".85" stroke="${on ? AMBER : '#ffffff55'}"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="600" ${MONO} fill="${b ? AMBER : INK}">${b}</text>`;
  }
  s += `<text x="${ox}" y="22" font-size="12" ${MONO} fill="${MUTED}">${N} × ${N} bit cells · odd rows mirrored to share a rail · bit lines precharged high (amber), pulled low (blue)</text>`;
  s += `<text x="${ox}" y="${oy + H + 84}" font-size="12" ${MONO} fill="${MUTED}">array ${(A.w / 1000).toFixed(2)} × ${(A.h / 1000).toFixed(2)} µm, ${N * N} bits</text>`;
  return `<svg viewBox="0 0 ${W + ox + 70} ${H + oy + 120}" style="--mw:600px">${s}</svg>`;
}

const fmtD = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(3));

export function drawArray(g, tech) {
  const card = document.getElementById('gtArrCard');
  const show = g.kind === 'fa' || g.kind === 'sram';
  card.hidden = !show;
  if (!show) return;
  const ctl = document.getElementById('gtArrCtl'), out = document.getElementById('gtArray'), say = document.getElementById('gtArrSay');
  const techName = GATECELLS.techs[tech].name;
  if (g.kind === 'fa') {
    document.getElementById('gtArrTitle').textContent = 'Four cells make a 4-bit adder';
    const btn = (w, i, v) => `<button type="button" data-w="${w}" data-i="${i}" aria-pressed="${v === 1}" aria-label="${w.toUpperCase()}${i} is ${v}; press to toggle">${v}</button>`;
    ctl.innerHTML = ['a', 'b'].map((w) => `<div class="gt-word"><span>${w.toUpperCase()}</span>${[3, 2, 1, 0].map((i) => btn(w, i, st[w][i])).join('')}<em>= ${bitsToInt(st[w])}</em></div>`).join('')
      + `<div class="gt-word"><span>Cin</span>${btn('cin', 0, st.cin)}</div>`;
    const { svg, sum, carry } = adderSvg(g, tech);
    out.innerHTML = svg;
    const total = bitsToInt(sum) + (carry[N] << N), hops = carry.slice(1, N).filter((x) => x).length;
    say.innerHTML = `<p><b>${bin(st.a)} + ${bin(st.b)}${st.cin ? ' + 1' : ''} = ${carry[N]}${bin(sum)}</b> (${bitsToInt(st.a)} + ${bitsToInt(st.b)}${st.cin ? ' + 1' : ''} = ${total}). Each cell adds one column; its Cout is the next cell’s Cin, so the answer is not settled until the carry has rippled through every cell (${hops} carr${hops === 1 ? 'y' : 'ies'} passed on right now). Delay grows with the word length, which is why 64-bit processors use carry look-ahead instead (<a href="#ref-weste2010">weste2010</a>). In ${techName} the four cells span ${fmtD(g.cells[tech].array.w / 1000)} µm.</p>`;
    out.setAttribute('aria-label', `Four full-adder cells in ${techName}: A=${bin(st.a)}, B=${bin(st.b)}, Cin=${st.cin}, sum ${carry[N]}${bin(sum)}`);
  } else {
    document.getElementById('gtArrTitle').textContent = 'Sixteen cells make a memory array';
    ctl.innerHTML = `<div class="gt-word"><span>Read</span>${[3, 2, 1, 0].map((r) => `<button type="button" data-r="${r}" aria-pressed="${st.row === r}">WL${r}</button>`).join('')}</div>`
      + `<div class="gt-mem" role="group" aria-label="Stored bits; press one to write it">${[3, 2, 1, 0].map((r) => `<div>${[0, 1, 2, 3].map((k) => `<button type="button" data-m="${r},${k}" aria-pressed="${st.mem[r][k] === 1}" aria-label="Row ${r} column ${k} stores ${st.mem[r][k]}; press to write ${1 - st.mem[r][k]}">${st.mem[r][k]}</button>`).join('')}</div>`).join('')}</div>`;
    out.innerHTML = sramSvg(g, tech);
    const A = g.cells[tech].array, real = 0.021;
    const word = st.row >= 0 ? st.mem[st.row].join('') : '';
    say.innerHTML = `<p>${st.row >= 0 ? `<b>Reading row ${st.row}: ${word}.</b> Its word line turns on the eight access transistors in that row. Both bit lines of every column were precharged high; in each column the side holding 0 pulls its line down, and a sense amplifier at the bottom reads which side fell. The other rows stay cut off.` : '<b>Pick a word line to read a row</b>, or press a bit to write it.'} Rows are mirrored so that two rows share each power rail, and the bit lines run unbroken down the columns.</p>`
      + `<p>In ${techName} one drawn bit is ${A.bit_um2 < 1 ? A.bit_um2.toFixed(3) : A.bit_um2.toFixed(1)} µm², or ${fmtD(A.mbit_per_mm2)} Mbit per mm² of bare cells. TSMC’s N5 high-density cell is ${real} µm², ${fmtD(1 / real)} Mbit/mm² (<a href="#ref-yeap2019">yeap2019</a>). Real arrays lose some of that to sense amplifiers, decoders and redundant rows.</p>`;
    out.setAttribute('aria-label', `A 4 by 4 SRAM array in ${techName}${st.row >= 0 ? `, reading row ${st.row}: ${word}` : ''}`);
  }
}

export function initArray(redraw) {
  document.getElementById('gtArrCtl').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.w === 'cin') st.cin ^= 1;
    else if (b.dataset.w) st[b.dataset.w][+b.dataset.i] ^= 1;
    else if (b.dataset.r) st.row = st.row === +b.dataset.r ? -1 : +b.dataset.r;
    else if (b.dataset.m) { const [r, k] = b.dataset.m.split(',').map(Number); st.mem[r][k] ^= 1; }
    const key = Object.entries(b.dataset).map(([k, v]) => `[data-${k}="${v}"]`).join('');
    redraw();
    document.querySelector(`#gtArrCtl button${key}`)?.focus();
  });
}
