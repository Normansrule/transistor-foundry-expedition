// Node-reading lab: measure pitches on the top of a chip and match them to a node.
// Twin of sim/transistor_sim/physics/nodelab.py (same arithmetic, same order; tests/js_parity.mjs).
// A node is { id, cpp: [nm, ref], mmp: [nm, ref], fin: [nm, ref] | null, sram: [µm², ref] }.
export const QUANTITIES = ['cpp', 'mmp', 'fin', 'sram'];
export const CELL_CPP = 2;                                   // bitcell drawn two gate pitches wide (est.)
export const LINE_FRACTION = { cpp: 0.32, mmp: 0.5, fin: 0.22 };   // drawn line width ÷ pitch (est.)

export const value = (n, q) => (n[q] == null ? null : n[q][0]);

// pitch from two marks `count` pitches apart
export function pitch(first, last, count) {
  if (count < 1) throw new Error('count must be at least 1');
  return Math.abs(last - first) / count;
}

// uncertainty of that pitch when each mark is off by e: √2·e / N
export const pitchError = (e, count) => Math.SQRT2 * e / count;

// drawn bitcell [width, height] in nm
export function cell(n) {
  const w = CELL_CPP * value(n, 'cpp');
  return [w, value(n, 'sram') * 1e6 / w];
}

// RMS of ln(measured / true) over what was measured; null if nothing comparable
export function score(measured, n) {
  let s = 0, k = 0;
  for (const q of QUANTITIES) {
    const m = measured[q], t = value(n, q);
    if (m == null || t == null || m <= 0) continue;
    s += Math.log(m / t) ** 2; k++;
  }
  return k === 0 ? null : Math.sqrt(s / k);
}

// [[id, score]] best first
export function rank(measured, nodes) {
  const out = [];
  for (const n of nodes) { const sc = score(measured, n); if (sc !== null) out.push([n.id, sc]); }
  out.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

// centres of lines of pitch p inside [0, span], the first at offset mod p
export function lines(p, span, offset) {
  let x = ((offset % p) + p) % p;
  const out = [];
  while (x <= span + 1e-9) { out.push(x); x += p; }
  return out;
}

export function view(n, layer, span, offset = 0) {
  if (layer === 'sram') { const [w, h] = cell(n); return { pitch: w, pitch_y: h, centres: lines(w, span, offset), width: 0 }; }
  const q = { gate: 'cpp', metal: 'mmp', fin: 'fin' }[layer];
  const p = value(n, q);
  if (p === null) return null;
  return { pitch: p, centres: lines(p, span, offset), width: p * LINE_FRACTION[q] };
}
