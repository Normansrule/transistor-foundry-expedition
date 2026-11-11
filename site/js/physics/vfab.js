// Virtual Fab: a computed two-column cross-section (field and window) built by running a traveler through the
// theatre models at their default settings. Twin of sim/transistor_sim/physics/vfab.py.
import * as OX from './oxidation.js';
import * as IM from './implant.js';
import * as DF from './diffusion.js';
import * as AL from './anneal.js';
import * as CM from './cmp.js';
import * as ET from './etch.js';
import * as DM from './damascene.js';
import * as RL from './release.js';
import * as PL from './planar.js';

export const N_SUB = 1.66e16, RESIST_NM = 1000, METAL_NM = 500, SUB_TYPE = 'p', LATERAL = 0.8, STOPS = ['ox', 'si'];
export const DEFAULT_CFG = {
  ox: { amb: 'dry', T: 1000, t: 1.0, orient: '100' }, imp: { ion: 'P', E: 20, dose: 1e15 },
  diff: { ion: 'P', Cs: 3e20, T1: 1050, t1: 600, T2: 1050, t2: 2220 }, ann: { T: 1050, hold: 1, rate: 150 },
  etch: { sel: 10, oe: 0.5 }, cmp: { P: 28, V: 1, t: 3 }, dam: { metal: 'Cu', w: 20, ar: 2, tb: 2 },
  rel: { W: 30, S: 100, over: 0.2, n: 3 }, planar: { NB: 1e15, T2: 1100, t2: 60 },
};
export const merge = (cfg = null) => Object.fromEntries(Object.entries(DEFAULT_CFG).map(([k, v]) => [k, { ...v, ...((cfg || {})[k] || {}) }]));
export const makesJunction = (ion) => IM.IONS[ion].type !== SUB_TYPE;
/** Inverse of DF.erfc on (0, 1] by bisection, matching the Python twin step for step. */
export function erfcinv(v) { let lo = 0, hi = 10; for (let k = 0; k < 80; k++) { const mid = 0.5 * (lo + hi); if (DF.erfc(mid) > v) lo = mid; else hi = mid; } return 0.5 * (lo + hi); }
export const lateralImplant = (peak, sigma) => (peak > 2 * N_SUB ? Math.SQRT2 * sigma * erfcinv(2 * N_SUB / peak) : 0);
const thick = (c, mat) => c.layers.filter(([m]) => m === mat).reduce((a, [, t]) => a + t, 0);
const mask = (c) => c.layers.reduce((a, [, t]) => a + t, 0);
const strip = (c) => { c.layers = c.layers.filter(([m]) => m !== 'resist'); };
const fresh = () => ({ si_top: 0, layers: [], xj: 0, by: null, shift: 0 });

export function run(route, held = null, cfg = null) {
  held = held || route.map(() => false);
  const g = merge(cfg);
  const cols = { field: fresh(), window: fresh() }, log = [], out = { masks: 0 };
  route.forEach((sid, i) => {
    let v = null;
    if (held[i]) { log.push({ id: sid, applied: false, value: null }); return; }
    if (sid === 'ox_thermal') {
      for (const c of Object.values(cols)) {
        if (c.layers.some(([m]) => m !== 'ox' && m !== 'resist')) continue;
        strip(c);
        const x0 = thick(c, 'ox'), x = OX.thickness(g.ox.amb, g.ox.T, g.ox.t, g.ox.orient, 1, x0 > 0 ? x0 / 1000 : null) * 1000;
        c.si_top -= OX.SI_CONSUMED * (x - x0); c.layers = [['ox', x]];
      }
      v = thick(cols.field, 'ox');
    } else if (sid === 'litho_expose') {
      cols.field.layers.push(['resist', RESIST_NM]); out.masks += 1; v = RESIST_NM;
    } else if (sid === 'etch_rie') {
      const w = cols.window, f = cols.field;
      if (f.layers.some(([m]) => m === 'resist')) {
        const cleared = w.layers.filter(([m]) => m !== 'si').reduce((a, [, t]) => a + t, 0);
        w.layers = []; w.si_top -= g.etch.oe * cleared / ET.S_STOP;
        f.layers = f.layers.map(([m, t]) => [m, m === 'resist' ? t - cleared / g.etch.sel : t]);
        v = cleared;
      }
    } else if (sid === 'implant') {
      const im = g.imp; let j = IM.junction(im.ion, im.E, im.dose, N_SUB); if (!makesJunction(im.ion)) j = { ...j, xj: 0 };
      const stop = j.Rp + 4 * IM.rangeStats(im.ion, im.E).dRp;
      for (const c of Object.values(cols)) { const m = mask(c); if (m < stop && j.xj - m > c.xj) { c.xj = j.xj - m; c.by = 'implant'; c.shift = m; c.peak = j.peak; c.sigma = j.sigma_nm; } strip(c); }
      v = j.xj;
    } else if (sid === 'diffuse_predep') {
      const df = g.diff; let d = DF.run(df.ion, df.Cs, df.T1, df.t1, df.T2, df.t2, N_SUB); if (!makesJunction(df.ion)) d = { ...d, xj: 0 };
      for (const c of Object.values(cols)) { strip(c); if (mask(c) === 0 && d.xj > c.xj) { c.xj = d.xj; c.by = 'diffusion'; c.shift = 0; } }
      v = d.xj;
    } else if (sid === 'anneal') {
      let a = AL.run(g.imp.ion, g.imp.E, g.imp.dose, g.ann.T, g.ann.hold, g.ann.rate, N_SUB); if (!makesJunction(g.imp.ion)) a = { ...a, xj: 0 };
      for (const c of Object.values(cols)) { strip(c); if (c.by === 'implant') { c.xj = Math.max(0, a.xj - c.shift); c.peak = a.peak; c.sigma = a.sigma; } }
      v = a.xj;
    } else if (sid === 'dep_pvd' || sid === 'evap_al') {
      if (sid === 'evap_al') cols.window.layers = cols.window.layers.filter(([m]) => m !== 'ox');   // contact window over the junction
      for (const c of Object.values(cols)) { strip(c); c.layers.push(['metal', METAL_NM]); }
      v = METAL_NM;
    } else if (sid === 'cmp') {
      const R = CM.rate(g.cmp.P, g.cmp.V) * g.cmp.t, target = Math.max(...Object.values(cols).map((c) => c.si_top + mask(c))) - R;
      for (const c of Object.values(cols)) {
        let left = Math.max(0, c.si_top + mask(c) - target);
        while (left > 0 && c.layers.length && !STOPS.includes(c.layers[c.layers.length - 1][0])) {
          const top = c.layers[c.layers.length - 1], cut = Math.min(left, top[1]);
          top[1] -= cut; left -= cut; if (top[1] <= 1e-9) c.layers.pop();
        }
      }
      v = R;
    } else if (sid === 'damascene') {
      const d = DM.run(g.dam.metal, g.dam.w, g.dam.ar, g.dam.metal === 'Cu' ? g.dam.tb : null); cols.field.layers.push(['ild', d.h]); cols.window.layers.push(['cu', d.h]); out.cu_r = d.r; v = d.h;
    } else if (sid === 'gaa_release') {
      const r = RL.run(g.rel.W, 5, g.rel.S, g.rel.over, Math.trunc(+g.rel.n)); out.sheets = { t_edge: r.t_edge, t_centre: r.t_centre, weff: r.weff }; v = r.t_edge;
    } else if (sid === 'planar_hoerni') {
      const p = PL.run(g.planar.NB, g.planar.T2, g.planar.t2); out.planar = { xj: p.xj, bv_pp: p.bv_pp, bv_cyl: p.bv_cyl };
      Object.assign(cols.window, { xj: p.xj, by: 'planar', shift: 0 }); v = p.xj;
    } else if (sid === 'probe_dice_bond') out.done = true;
    log.push({ id: sid, applied: true, value: v });
  });
  for (const c of Object.values(cols)) {
    c.lateral = c.by === 'diffusion' || c.by === 'planar' ? LATERAL * c.xj : c.by === 'implant' && c.xj > 0 ? lateralImplant(c.peak, c.sigma) : 0;
    delete c.peak; delete c.sigma;
  }
  return { field: cols.field, window: cols.window, log, ...out };
}
