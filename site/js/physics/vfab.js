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
export const RHO_AL = 2.65e-6, RUN_MASKS = 4;   // Ω·cm bulk aluminium (Gall 2016); ACTV, POLY, CONT, METL
export const RUN_S = 3;   // assumed interstitial supersaturation under the dry drive-in; a few-fold is typical (Plummer et al. 2000, ch. 7)
export const DEFAULT_CFG = {
  ox: { amb: 'dry', T: 1000, t: 1.0, orient: '100' }, imp: { ion: 'P', E: 20, dose: 1e15 },
  diff: { ion: 'P', Cs: 3e20, T1: 1050, t1: 600, T2: 1050, t2: 2220, model: 'int', S: 1 }, ann: { T: 1050, hold: 1, rate: 150 },
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
const fresh = () => ({ si_top: 0, layers: [], xj: 0, by: null, shift: 0, prof: null });
// Thermal budget (twin of _set_prof, _xj_now and _heat in vfab.py): each doped column keeps a Gaussian equivalent of
// its profile, and every later hot step adds 2·D(T)·t to sig² with the dose kept; oxidation moves the surface down.
function setProf(c, ion, A, sig) {
  if (c.xj <= 0 || A <= N_SUB || sig <= 0) { c.prof = null; return; }
  c.prof = { ion, A, sig, centre: -c.si_top + c.xj - sig * Math.sqrt(2 * Math.log(A / N_SUB)) };
}
function xjNow(c) {
  const p = c.prof; if (!p) return;
  c.xj = p.A > N_SUB ? Math.max(0, p.centre + p.sig * Math.sqrt(2 * Math.log(p.A / N_SUB)) + c.si_top) : 0;
  if (c.by === 'implant') { c.peak = p.A; c.sigma = p.sig; }
}
function heat(c, steps) {
  const p = c.prof; if (!p || c.xj <= 0) return 0;
  const before = c.xj, Dt = steps.reduce((a, [T, t]) => a + IM.diffusivity(p.ion, T) * t, 0), sig = Math.sqrt(p.sig ** 2 + 2 * Dt * 1e14);
  p.A = p.A * p.sig / sig; p.sig = sig; xjNow(c);
  return c.xj - before;
}
const furnaceOk = (c) => c.layers.every(([m]) => m === 'ox' || m === 'resist');
/** Chain one furnace step onto a bare or oxidised column (Deal–Grove from the oxide already there). */
function grow(c, amb, T, minutes, orient) {
  const x0 = thick(c, 'ox'), x = OX.thickness(amb, T, minutes / 60, orient, 1, x0 > 0 ? x0 / 1000 : null) * 1000;
  c.si_top -= OX.SI_CONSUMED * (x - x0); c.layers = [['ox', x]];
}

export function run(route, held = null, cfg = null) {
  held = held || route.map(() => false);
  const g = merge(cfg);
  const cols = { field: fresh(), window: fresh() }, log = [], out = { masks: 0 };
  let nOx = 0;
  route.forEach((sid, i) => {
    let v = null, extra = {};
    if (held[i]) { log.push({ id: sid, applied: false, value: null }); return; }
    if (sid === 'ox_thermal') {
      const seq = g.ox.seq, recipe = seq ? seq[Math.min(nOx, seq.length - 1)] : [[g.ox.amb, g.ox.T, g.ox.t * 60]];
      nOx += 1;
      const x0 = cols.window.xj;
      for (const c of Object.values(cols)) {
        if (!furnaceOk(c)) continue;                       // only bare silicon or oxide goes in the furnace
        strip(c);
        for (const [amb, T, minutes] of recipe) grow(c, amb, T, minutes, g.ox.orient);
        xjNow(c);                                          // the surface moved down towards the junction
        heat(c, recipe.map(([, T, minutes]) => [T, minutes * 60]));
      }
      v = thick(cols.field, 'ox'); extra = { win: thick(cols.window, 'ox') };
      if (x0 > 0) extra.push = cols.window.xj - x0;
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
      for (const c of Object.values(cols)) { const m = mask(c); if (m < stop && j.xj - m > c.xj) { c.xj = j.xj - m; c.by = 'implant'; c.shift = m; c.peak = j.peak; c.sigma = j.sigma_nm; setProf(c, im.ion, j.peak, j.sigma_nm); } strip(c); }
      v = j.xj;
    } else if (sid === 'diffuse_predep') {
      const df = g.diff; const S2 = df.grow ? (df.S ?? 1) : 1; let d = df.model === 'cd' ? DF.runCd(df.ion, df.Cs, df.T1, df.t1, df.T2, df.t2, N_SUB, 301, 300, S2) : DF.run(df.ion, df.Cs, df.T1, df.t1, df.T2, df.t2, N_SUB, 600, S2); if (!makesJunction(df.ion)) d = { ...d, xj: 0 };
      const x0 = cols.window.xj;
      for (const c of Object.values(cols)) {
        strip(c);
        if (mask(c) === 0 && d.xj > c.xj) { c.xj = d.xj; c.by = 'diffusion'; c.shift = 0; const A = d.Cs_after; setProf(c, df.ion, A, A > N_SUB ? d.xj / Math.sqrt(2 * Math.log(A / N_SUB)) : 0); }
        else heat(c, [[df.T1, df.t1], [df.T2, df.t2]]);   // junctions made earlier feel both bakes
      }
      if (df.grow) { for (const c of Object.values(cols)) if (furnaceOk(c)) { grow(c, df.grow, df.T2, df.t2 / 60, g.ox.orient); xjNow(c); } extra = { win: thick(cols.window, 'ox') }; }
      if (x0 > 0 && cols.window.by !== 'diffusion') extra.push = cols.window.xj - x0;
      extra.Rs = d.Rs; v = d.xj;
    } else if (sid === 'anneal') {
      let a = AL.run(g.imp.ion, g.imp.E, g.imp.dose, g.ann.T, g.ann.hold, g.ann.rate, N_SUB); if (!makesJunction(g.imp.ion)) a = { ...a, xj: 0 };
      const x0 = cols.window.xj;
      for (const c of Object.values(cols)) {
        strip(c);
        if (c.by === 'implant') { c.xj = Math.max(0, a.xj - c.shift); c.peak = a.peak; c.sigma = a.sigma; setProf(c, g.imp.ion, a.peak, a.sigma); }
        else if (c.by === 'diffusion') heat(c, [[g.ann.T, a.t_eq]]);   // the spike also nudges a diffused junction
      }
      if (x0 > 0 && cols.window.by === 'diffusion') extra.push = cols.window.xj - x0;
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
      Object.assign(cols.window, { xj: p.xj, by: 'planar', shift: 0, prof: null }); v = p.xj;
    } else if (sid === 'probe_dice_bond') { for (const c of Object.values(cols)) strip(c); out.done = true; }
    log.push({ id: sid, applied: true, value: v, ...extra });
  });
  for (const c of Object.values(cols)) {
    c.lateral = c.by === 'diffusion' || c.by === 'planar' ? LATERAL * c.xj : c.by === 'implant' && c.xj > 0 ? lateralImplant(c.peak, c.sigma) : 0;
    delete c.peak; delete c.sigma; delete c.prof;
  }
  out.heat_nm = log.reduce((a, l) => a + (l.push ?? 0), 0);   // how far later heat moved the window junction
  return { field: cols.field, window: cols.window, log, ...out };
}

/** Settings that follow the teaching-cleanroom run (field and gate oxidation recipes, the drive-in that grew the
 *  intermediate oxide). Predeposition time and surface concentration were not recorded: theatre defaults. */
export function runCfg(lab) {
  const ox = Object.fromEntries(lab.oxides.map((o) => [o.id, o])), inter = ox.inter.steps.at(-1);
  return { ox: { seq: [ox.field.steps.map((st) => [...st]), ox.gate.steps.map((st) => [...st])] },
    diff: { T1: inter[1], T2: inter[1], t2: inter[2] * 60, grow: inter[0], model: 'cd', S: RUN_S } };
}

const applied = (res, sid) => res.log.filter((l) => l.id === sid && l.applied);
/** The computed numbers beside the run's measurements; computed is null when the route skipped the step. */
export function compare(res, lab) {
  const ox = Object.fromEntries(lab.oxides.map((o) => [o.id, o.measured_nm]));
  const oxs = applied(res, 'ox_thermal'), dif = applied(res, 'diffuse_predep'), met = [...applied(res, 'dep_pvd'), ...applied(res, 'evap_al')];
  const r2a = lab.resistors.find((r) => r.id === '2a'), actv = lab.cd_bias.masks.find((m) => m.mask === 'ACTV');
  const al = lab.steps.flatMap((s) => s.measured).find((m) => m.param === 'Aluminium sheet resistance').value;
  return [
    { key: 'field_ox', step: 'ox_thermal', label: 'Field oxide', unit: 'nm', computed: oxs.length ? oxs[0].value : null, measured: ox.field },
    { key: 'gate_ox', step: 'ox_thermal', label: 'Gate oxide (second oxidation, in the window)', unit: 'nm', computed: oxs.length > 1 ? oxs[1].win : null, measured: ox.gate },
    { key: 'inter_ox', step: 'diffuse_predep', label: 'Oxide grown in the drive-in (window)', unit: 'nm', computed: dif.length ? (dif[0].win ?? null) : null, measured: ox.inter },
    { key: 'sd_rs', step: 'diffuse_predep', label: 'Source and drain sheet resistance', unit: 'Ω/sq', computed: dif.length ? dif[0].Rs : null, measured: r2a.R_ohm * r2a.W_um / r2a.L_um },
    { key: 'actv_bias', step: 'etch_rie', label: 'Opening growth in the first oxide etch', unit: 'µm', computed: applied(res, 'etch_rie').length ? 0 : null, measured: actv.etch.reduce((a, b) => a + b, 0) / actv.etch.length },
    { key: 'al_rs', step: 'dep_pvd', label: 'Aluminium sheet resistance', unit: 'Ω/sq', computed: met.length ? RHO_AL / (METAL_NM * 1e-7) : null, measured: al },
    { key: 'masks', step: 'litho_expose', label: 'Masks', unit: '', computed: res.masks, measured: RUN_MASKS },
  ];
}
