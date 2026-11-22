// Spot the defect: seven process defects whose place on the picture is decided by the process models.
// Twin of sim/transistor_sim/physics/defects.py (same settings, same order; tests/js_parity.mjs).
import * as cleaning from './cleaning.js';
import * as cmp from './cmp.js';
import * as deposition from './deposition.js';
import * as em from './electromigration.js';
import * as etch from './etch.js';
import * as litho from './litho.js';
import * as release from './release.js';
import { mulberry32 } from './yieldcost.js';

export const CASES = ['fill', 'etch', 'cmp', 'release', 'em', 'particle', 'focus'];
export const ZONES = 4;
const YEAR_S = 3.15576e7;

export const FILL = { widths: [20, 60, 70, 80], depth: 80, target: 18, bad: 'cvd', good: 'ald' };
export const ETCH = { widths: [20, 40, 70, 120], s: 0.05, aniso: 0.9, s_mask: 10, bad: 0.15, good: 0.5 };
export const CMP = { rho_bad: [0.15, 0.45, 0.5, 0.55], rho_good: [0.5, 0.45, 0.5, 0.55], P: 28, V: 1, t: 3, lam: 193, NA: 1.35 };
export const RELEASE = { widths: [20, 30, 45, 70], t: 5, S: 100, n: 3, bad: 25, good: 40 };
export const EM = { lengths: [5, 10, 15, 60], T: 105, bad: 2.0, good: 0.5 };
export const PARTICLE = { quantiles: [0.9, 0.6, 0.35, 0.15], line: 100, bad: 100, good: 200 };
export const FOCUS = { pitch: 160, heights_bad: [0, -20, 30, 90], heights_good: [0, -20, 30, 0], cd_tol: 0.10 };

// display order of the four features: Fisher-Yates driven by the shared PRNG
export function order(seed) {
  const rnd = mulberry32(seed), p = [0, 1, 2, 3];
  for (let i = ZONES - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

function fill(good) {
  const m = good ? FILL.good : FILL.bad;
  const out = FILL.widths.map((w) => {
    const f = deposition.fill(m, w, FILL.depth / w, FILL.target);
    return { w, closed: f.closed_at !== null, void: f.void, void_z: f.void_z, coverage: f.coverage, side: f.side, bad: f.void };
  });
  return [{ method: m, depth: FILL.depth, target: FILL.target }, out];
}

function etchCase(good) {
  const o = good ? ETCH.good : ETCH.bad, t = etch.endpoint(ETCH.s) * (1 + o);
  const out = ETCH.widths.map((w) => {
    const e = etch.etchOpening(w, t, ETCH.s, ETCH.aniso, ETCH.s_mask), cleared = e.t_clear !== null;
    return { w, depth: e.depth, cleared, left: Math.max(0, etch.FILM - e.depth), side: e.side, mask_left: e.mask_left, bad: !cleared };
  });
  return [{ overetch: o, t, film: etch.FILM, mask: etch.MASK }, out];
}

function cmpCase(good) {
  const rhos = good ? CMP.rho_good : CMP.rho_bad, tol = litho.depthOfFocus(CMP.lam, CMP.NA);
  const regs = rhos.map((r) => cmp.polish(r, CMP.P, CMP.V, CMP.t, 4));
  const ups = regs.map((g) => g.up).sort((a, b) => a - b), mid = 0.5 * (ups[1] + ups[2]);
  const out = rhos.map((rho, i) => { const g = regs[i]; return { rho, up: g.up, down: g.down, step: g.step, dev: g.up - mid, bad: Math.abs(g.up - mid) > tol }; });
  return [{ tol, median: mid, line: cmp.STEP0 }, out];
}

function releaseCase(good) {
  const e = good ? RELEASE.good : RELEASE.bad;
  const out = RELEASE.widths.map((W) => {
    const r = release.run(W, RELEASE.t, RELEASE.S, 2 * e / W - 1, RELEASE.n, 21);
    return { W, core: r.core, released: r.released, t_edge: r.t_edge, w_final: r.w_final, bad: !r.released };
  });
  return [{ e, t: RELEASE.t, S: RELEASE.S, n: RELEASE.n }, out];
}

function emCase(good) {
  const j = good ? EM.good : EM.bad, lb = em.blechLengthUm(j, EM.T), tVoid = em.tNucleationLong(j, EM.T) / YEAR_S;
  const out = EM.lengths.map((L) => ({ L, jL: j * 1e6 * L * 1e-4, bad: L > lb, years: L > lb ? tVoid : null }));
  return [{ j, T: EM.T, blech_um: lb, jl_crit: em.blechProduct(EM.T) }, out];
}

function particle(good) {
  const space = good ? PARTICLE.good : PARTICLE.bad, d0 = cleaning.D_INSPECT;
  const out = PARTICLE.quantiles.map((u) => { const d = d0 / u ** 0.5; return { d, bad: d > space }; });
  return [{ space, line: PARTICLE.line, d0, share: cleaning.killerFraction(space, d0) }, out];
}

function focus(good) {
  const p = FOCUS.pitch, a0 = litho.aerialImage(p), cd0 = litho.printedCD(a0.x, a0.I, p);
  const out = (good ? FOCUS.heights_good : FOCUS.heights_bad).map((h) => {
    const a = litho.aerialImage(p, { defocus: h }), cd = litho.printedCD(a.x, a.I, p);
    return { h, contrast: litho.contrast(a.I), cd, bad: Math.abs(cd - cd0) > FOCUS.cd_tol * cd0 };
  });
  return [{ pitch: p, cd0, dof: litho.depthOfFocus(193, 1.35) }, out];
}

const MODELS = { fill, etch: etchCase, cmp: cmpCase, release: releaseCase, em: emCase, particle, focus };

// four features in display order and the index of the defect (null if all pass)
export function caseOf(cid, seed = 1, good = false) {
  const [info, feats] = MODELS[cid](good), p = order(seed), shown = p.map((i) => feats[i]);
  const bad = []; shown.forEach((f, i) => { if (f.bad) bad.push(i); });
  return { id: cid, good, order: p, info, features: shown, defect: bad.length === 1 ? bad[0] : (bad.length ? bad : null) };
}

// one point for the right place, one for the right cause
export const grade = (result, zone, cause, answer) => (zone === result.defect ? 1 : 0) + (cause === answer ? 1 : 0);
