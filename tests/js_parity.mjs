// Checks that the browser physics (site/js/physics) matches the Python reference
// numbers in data/physics_reference.json. Run: node tests/js_parity.mjs
import { readFileSync } from 'node:fs';
import * as C from '../site/js/physics/carriers.js';
import * as J from '../site/js/physics/junction.js';
import * as M from '../site/js/physics/moscap.js';
import * as T from '../site/js/physics/tunnel.js';
import * as P from '../site/js/physics/poisson2d.js';
import * as MC from '../site/js/physics/montecarlo.js';
import * as KP from '../site/js/physics/bandstructure.js';
import * as QW from '../site/js/physics/qwell.js';
import * as CS from '../site/js/physics/chargesheet.js';
import * as TH from '../site/js/physics/thermal.js';
import * as LI from '../site/js/physics/litho.js';
import * as BA from '../site/js/devices/bands.js';
import * as HJ from '../site/js/physics/hetero.js';
import * as INV from '../site/js/physics/inverter.js';
import * as BAL from '../site/js/physics/ballistic.js';
import * as WR from '../site/js/physics/interconnect.js';
import * as LG from '../site/js/physics/logic.js';
import * as SR from '../site/js/physics/sram.js';
import * as FL from '../site/js/physics/flash.js';
import * as GA from '../site/js/journey/gatearray.js';
import * as ET from '../site/js/physics/etch.js';
import * as DP from '../site/js/physics/deposition.js';
import * as CM from '../site/js/physics/cmp.js';
import { GATECELLS } from '../site/js/journey/data.js';
import { LABRUN } from '../site/js/processlab/data.js';
import * as OX from '../site/js/physics/oxidation.js';
import * as LR from '../site/js/physics/labrun.js';
import * as DF from '../site/js/physics/diffusion.js';
import * as CZ from '../site/js/physics/czochralski.js';
import * as AL from '../site/js/physics/anneal.js';
import * as DMS from '../site/js/physics/damascene.js';
import * as PRB from '../site/js/physics/probe.js';
import * as RLS from '../site/js/physics/release.js';
import * as PLN from '../site/js/physics/planar.js';
import * as CLN from '../site/js/physics/cleaning.js';
import * as VFB from '../site/js/physics/vfab.js';
import * as IM from '../site/js/physics/implant.js';
import * as YC from '../site/js/physics/yieldcost.js';
import * as EM from '../site/js/physics/electromigration.js';
import * as AN from '../site/js/physics/analog.js';
import * as FIT from '../site/js/physics/fitting.js';

const ref = JSON.parse(readFileSync(new URL('../data/physics_reference.json', import.meta.url)));
let fails = 0;
const check = (name, got, want, rel = 1e-6) => {
  const ok = Math.abs(got - want) <= rel * Math.abs(want) + 1e-300;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: js=${got.toPrecision(6)} py=${want.toPrecision(6)}`);
};
for (const m of Object.keys(ref.ni)) { check(`ni ${m}`, C.intrinsicDensity(m), ref.ni[m]); check(`Eg ${m}`, C.bandGap(m), ref.Eg[m]); }
const pn = J.solve(1e16, 5e16, -1.0);
for (const k of ['Vbi', 'W_um', 'xn_um', 'xp_um', 'Emax']) check(`pn ${k}`, pn[k], ref.pn[k]);
check('J0', J.saturationCurrent(1e17, 1e16), ref.J0);
const mp = M.params({ Na: 1e17, toxNm: 5 });
check('MOS Vt', M.threshold(mp), ref.mos.Vt);
check('MOS Vg(0.5)', M.gateVoltage(0.5, mp), ref.mos['Vg_at_0.5']);
check('TMM rect', T.transfer(0.5, [1.0], [0.5]).T, ref.tunnel['rect_0.5_1_0.5'], 1e-9);
check('SiO2 1nm', T.stackTransmission(1.0, 'SiO2'), ref.tunnel.sio2_1nm, 1e-6);
check('HfO2 1nm/IL0.5', T.stackTransmission(1.0, 'HfO2', 0.5), ref.tunnel['hfo2_1nm_il0.5'], 1e-6);
for (const [key, dg] of [['SG20', false], ['DG20', true]]) {
  const g = P.build({ L: 20, dg });
  const a = P.solve(g, { Vgs: 0, Vds: 0.05 }), b = P.solve(g, { Vgs: 0, Vds: 0.7, psi0: a.psi });
  check(`DIBL ${key}`, (P.barrier(g, a.psi).Eb - P.barrier(g, b.psi).Eb) / 0.65 * 1000, ref.dibl[key], 0.02);
}
const g1 = KP.gaps(2.0, 0.5, 0.2)[0];
check('KP gap lower edge', g1[0], ref.kp.gap1[0], 1e-6); check('KP gap upper edge', g1[1], ref.kp.gap1[1], 1e-6);
check('KP m*', KP.effectiveMass(2.0, 0.5, 0.2)[0], ref.kp.mstar, 1e-4);
QW.finiteWell(5.0).E.forEach((e, i) => check(`well E${i}`, e, ref.qwell.E5[i], 1e-6));
const sp = QW.hemtSP(0.25, 20.0);
check('2DEG ns', sp.ns, ref.qwell.ns_25_20, 1e-4); check('2DEG E0', sp.E[0], ref.qwell.E0_25_20, 1e-4);
const csp = CS.params();
for (const [k, v] of Object.entries(ref.chargesheet)) { const [vg, vd] = k.split('_').map(Number); check(`charge-sheet I(${vg},${vd})`, CS.drainCurrent(vg, vd, csp), v, 1e-6); }
check('thermal Si', TH.peakRise('Si', 5.0).rise, ref.thermal.Si, 1e-6);
check('thermal diamond', TH.peakRise('Diamond', 5.0).rise, ref.thermal.Diamond, 1e-6);
check('thermal diamond+TBR', TH.peakRise('Diamond', 5.0, { tbr: 25 }).rise, ref.thermal.Diamond_tbr25, 1e-6);
check('litho conventional', LI.contrast(LI.aerialImage(100, { sigma: 0.9 }).I), ref.litho.conv100, 1e-6);
check('litho dipole', LI.contrast(LI.aerialImage(80, { kind: 'dipole', sigmaC: 0.89, sigmaW: 0.05 }).I), ref.litho.dip80, 1e-6);
check('litho defocus', LI.contrast(LI.aerialImage(120, { sigma: 0.7, defocus: 80 }).I), ref.litho.def120, 1e-6);
check('litho half-pitch', LI.halfPitch(13.5, 0.33, 0.3), ref.litho.hp_euv, 1e-9);
check('litho DOF', LI.depthOfFocus(13.5, 0.55), ref.litho.dof_hna, 1e-9);
check('photons EUV', LI.photonsPerNm2(30, 13.5), ref.litho.ph_euv30, 1e-9);
check('photons ArF', LI.photonsPerNm2(30, 193), ref.litho.ph_arf30, 1e-9);
check('shot noise', LI.shotNoise(30, 13.5, 10).rel, ref.litho.sn_euv, 1e-9);
const devs = JSON.parse(readFileSync(new URL('../data/devices.json', import.meta.url))).devices;
for (const d of devs) {
  const r = ref.atlas[d.id], vg = 0.5 * (d.model.vg[0] + d.model.vg[1]), vd = 0.3 * d.model.vd[1];
  check(`atlas ${d.id} barrier`, BA.barrier(d, vg, vd), r.barrier_mid, 1e-9);
  check(`atlas ${d.id} on-fraction`, BA.onFraction(d, d.model.vt + 0.1 * (d.model.vg[1] - d.model.vg[0])), r.f_vt, 1e-9);
  const L = BA.lateral(d, vg, vd, 21); let worst = 0;
  L.Ec.forEach((e, i) => { const want = r.Ec_mid[i], got = isNaN(e) ? -99 : e; worst = Math.max(worst, Math.abs(got - want)); });
  if (worst > 1e-9) fails++;
  console.log(`${worst > 1e-9 ? 'FAIL' : 'ok  '} atlas ${d.id} lateral Ec (max diff ${worst.toExponential(1)})`);
  if (r.vert0 !== null) { const V = BA.vertical(d, vg); check(`atlas ${d.id} vertical Ec(0)`, V.Ec[0], r.vert0, d.model.vertical === 'hemt' ? 1e-3 : 1e-6); }
}
const mats = Object.fromEntries(JSON.parse(readFileSync(new URL('../data/band_alignment.json', import.meta.url))).materials.map(m => [m.id, m]));
for (const r of ref.hetero) {
  const [a, b, da, db, V] = r.case, s = HJ.solve(mats[a], mats[b], da, db, V), tag = `hetero ${a}/${b} ${da}/${db} V=${V}`;
  let worst = 0; r.Ec.forEach((e, k) => { worst = Math.max(worst, Math.abs(s.Ec[k * 60] - e)); });
  if (worst > 1e-6) fails++;
  console.log(`${worst > 1e-6 ? 'FAIL' : 'ok  '} ${tag} Ec (max diff ${worst.toExponential(1)})`);
  check(`${tag} VA`, s.VA, r.VA, 1e-6); check(`${tag} VB`, s.VB, r.VB, 1e-6); check(`${tag} W`, s.W_nm, r.W_nm, 1e-4);
}
const presets = JSON.parse(readFileSync(new URL('../data/model_presets.json', import.meta.url)));
for (const [k, r] of Object.entries(ref.inverter)) {
  const m = INV.metrics(presets[k], presets[k].VDD, 0.6);
  for (const q of ['VM', 'NML', 'NMH', 'gain', 'tp_ps', 'E_fJ', 'Pleak_nW']) check(`inverter ${k} ${q}`, m[q], r[q], 1e-6);
}
for (const r of ref.ballistic) {
  const [ch, vg, vd, b] = r.case, s = BAL.solve(BAL.params({ channel: ch }), vg, vd, b);
  for (const q of ['eta', 'ns', 'I', 'T']) check(`ballistic ${ch} VG=${vg} VD=${vd}${b ? ' ballistic' : ''} ${q}`, s[q], r[q], 1e-6);
}
for (const [k, v] of Object.entries(ref.wires.rho)) { const [m, w] = k.split('_'); check(`rho ${m} w=${w}`, WR.resistivity(m, +w, 2 * w), v, 1e-9); }
check('wire r Cu 14', WR.rPerUm('Cu', 14, 28), ref.wires.r_Cu_14, 1e-9); check('wire r Ru 14', WR.rPerUm('Ru', 14, 28), ref.wires.r_Ru_14, 1e-9);
check('wire c 14', WR.cPerUm(14, 28, 14), ref.wires.c_14, 1e-9); check('Elmore', WR.elmoreDelay(458.0, 1.6e-16, 100, 5e3, 1e-15), ref.wires.elmore, 1e-9);
{ const sim = WR.lineSim(458.0, 1.6e-16, 50, 2e3, 1e-15, 51); const V = sim.step(4e-11 / 200, 200);
  let worst = 0; ref.wires.line.forEach((v, i) => { worst = Math.max(worst, Math.abs(V[i * 10] - v)); });
  if (worst > 1e-9) fails++; console.log(`${worst > 1e-9 ? 'FAIL' : 'ok  '} RC line Crank–Nicolson (max diff ${worst.toExponential(1)})`); }
for (const [k, e] of Object.entries(ref.logic.effort)) {
  const j = LG.effort(k);
  check(`effort ${k} p`, j.p, e.p, 1e-12); check(`effort ${k} n`, j.n, e.n, 0);
  for (const [x, g] of Object.entries(e.g)) check(`effort ${k} g_${x}`, j.g[x], g, 1e-12);
  const tt = LG.truth(k).map(r => r[1]), net = LG.netlist(k);
  const sw = LG.truth(k).map(([bits]) => +LG.simulate(net, Object.fromEntries(net.inputs.map((x, i) => [x, bits[i]]))).y);
  const ok = JSON.stringify(tt) === JSON.stringify(ref.logic.truth[k]) && JSON.stringify(sw) === JSON.stringify(ref.logic.truth[k]);
  if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${k} truth table and switch-level simulation`);
}
for (const r of ref.logic.adder) {
  const s = LG.rippleAdd(...r.case, 8);
  for (const q of ['settle', 'transitions', 'sum']) check(`adder ${r.case.join(',')} ${q}`, s[q], r[q], 1e-12);
}
for (const [n, d] of Object.entries(ref.logic.ks)) check(`Kogge–Stone ${n}`, LG.koggeStoneDelay(+n), d, 1e-12);
check('KS count 32', LG.koggeStoneCount(32), ref.logic.ksn, 0); check('ripple count 32', LG.rippleCount(32), ref.logic.rcn, 0);
for (const r of ref.sram) {
  const [k, cr, dvt] = r.case, c = SR.cell(presets[k], { cr, beta: SR.BETA[k], dvt });
  for (const q of ['hold_snm', 'read_snm', 'v_read', 'i_read_uA', 't_sense_ps']) check(`sram ${k} cr=${cr} dvt=${dvt} ${q}`, c[q], r[q], 1e-6);
}
check('FN B', FL.fnCoeffs().B, ref.flash.B, 1e-12); check('FN J(10 MV/cm)', FL.fnCurrent(1e9), ref.flash.J1e9, 1e-9);
check('FN rate', FL.rate(-2, 17), ref.flash.rate, 1e-9); check('flash pulse', FL.pulse(-2, 18, 1e-5).v, ref.flash.pulse, 1e-6);
{ const r = FL.ispp(3.0, { step: 0.5 }).vt; let worst = Math.abs(r.length - ref.flash.ispp.length);
  ref.flash.ispp.forEach((v, i) => { worst = Math.max(worst, Math.abs(r[i] - v)); });
  if (worst > 1e-6) fails++; console.log(`${worst > 1e-6 ? 'FAIL' : 'ok  '} ISPP staircase (max diff ${worst.toExponential(1)})`); }
for (const [b, L] of Object.entries(ref.flash.levels)) {
  const st = b === '1' ? 0.5 : 0.15, j = FL.levels(+b, { step: st });
  for (const q of ['spacing', 'width', 'margin']) check(`levels ${b} bit ${q}`, j[q], L[q], 1e-12);
}
for (const r of ref.etch) { const e = ET.run(...r.case); check(`etch ${r.case} t_end`, e.t_end, r.t_end, 1e-9); check(`etch ${r.case} lag`, e.lag_ratio, r.lag, 1e-9);
  e.openings.forEach((o, i) => { check(`etch ${r.case} depth ${i}`, o.depth, r.depths[i], 1e-9); check(`etch ${r.case} side ${i}`, o.side[Math.floor(o.side.length / 2)][1], r.side[i], 1e-9); }); check(`etch ${r.case} mask`, e.openings[0].mask_left, r.mask, 1e-9); }
for (const r of ref.deposition) { const f = DP.fill(...r.case); for (const q of ['coverage', 'floor']) check(`deposition ${r.case} ${q}`, f[q], r[q], 1e-9); check(`deposition ${r.case} mid`, f.side[24], r.mid, 1e-9);
  if (f.void !== r.void) { fails++; console.log(`FAIL deposition ${r.case} void`); } }
for (const r of ref.cmp) { const c = CM.run(...r.case); check(`cmp ${r.case} K`, c.K, r.K, 1e-12); check(`cmp ${r.case} range`, c.range_nm, r.range, 1e-9); c.regions.forEach((g, i) => { check(`cmp ${r.case} up ${i}`, g.up, r.ups[i], 1e-9); check(`cmp ${r.case} down ${i}`, g.down, r.downs[i], 1e-9); }); }
for (const [k, v] of Object.entries(ref.diffusion.erfc)) check(`diffusion erfc ${k}`, DF.erfc(+k), v, 1e-12);
for (const r of ref.diffusion.runs) { const c = DF.run(...r.case); for (const q of ['dose', 'xj_pre', 'Rs_pre', 'xj', 'Rs', 'Cs_after']) check(`diffusion ${r.case[0]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.czochralski) { const c = CZ.run(...r.case); for (const q of ['f_usable', 'rho_tail', 'N_seed']) check(`czochralski ${r.case[0]} ${q}`, c[q], r[q], 1e-9); check(`czochralski ${r.case[0]} rho_mid`, c.rho[60], r.rho_mid, 1e-9); }
for (const r of ref.damascene) { const c = DMS.run(...r.case.map((v) => (v === null ? null : v))); for (const q of ['rho_core', 'rho_line', 'r', 'c', 'rc', 'core_share']) check(`damascene ${r.case[0]} ${r.case[1]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.probe) { const c = PRB.run(...r.case); for (const q of ['n', 'good', 'Y', 'dl_ppm', 'cost']) check(`probe ${r.case[0]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.release) { const c = RLS.run(...r.case); for (const q of ['e', 'side', 'core', 't_edge', 't_centre', 't_mean', 'w_final', 'weff']) check(`release ${r.case[0]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.cleaning) { const c = CLN.run(...r.case); for (const q of ['left', 'f_kill', 'killers', 'D_add', 'Y', 'Y_dirty', 'tau_us', 'L_um']) check(`cleaning ${r.case[0]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.vfab) {
  const c = VFB.run(...r.case), tag = `vfab ${r.case[0].length} steps${r.case[2] ? ' (own settings)' : ''}`;
  for (const k of ['field', 'window']) {
    check(`${tag} ${k} si_top`, c[k].si_top, r[k].si_top, 1e-9); check(`${tag} ${k} xj`, c[k].xj, r[k].xj, 1e-9); check(`${tag} ${k} lateral`, c[k].lateral, r[k].lateral, 1e-9);
    check(`${tag} ${k} layers`, c[k].layers.length, r[k].layers.length, 0);
    r[k].layers.forEach(([m, t], i) => { check(`${tag} ${k} ${m} ${i}`, c[k].layers[i]?.[1] ?? NaN, t, 1e-9); if (c[k].layers[i]?.[0] !== m) check(`${tag} ${k} material ${i}`, 1, 0, 0); });
  }
  r.log.forEach((l, i) => {
    if (l.value !== null) check(`${tag} log ${l.id}`, c.log[i].value, l.value, 1e-9); else if (c.log[i].value !== null) check(`${tag} log ${l.id} null`, 1, 0, 0);
    for (const q of ['win', 'Rs', 'push']) if (l[q] !== undefined) check(`${tag} log ${l.id} ${q}`, c.log[i][q], l[q], 1e-9);
    if (l.push === undefined && c.log[i].push !== undefined) check(`${tag} log ${l.id} push extra`, 1, 0, 0);
  });
  check(`${tag} heat_nm`, c.heat_nm, r.heat_nm, 1e-9);
}
for (const r of ref.diffusion_cd) { const c = DF.runCd(...r.case); for (const q of ['xj', 'Rs', 'dose', 'Cs_after', 'ni', 'D_surf', 'D_int']) check(`diffusion cd ${r.case[0]} ${r.case[1]} ${q}`, c[q], r[q], 1e-6); check(`diffusion cd ${r.case[0]} N[60]`, c.N[60], r.N_mid, 1e-6); check(`diffusion cd ${r.case[0]} x[60]`, c.x[60], r.x_mid, 1e-9); }
for (const r of ref.diffusion_oed) {
  const c = r.case, a = DF.run(...c.slice(0, 7), 600, c[7]), b = DF.runCd(...c.slice(0, 7), 301, 300, c[7]);
  check(`diffusion oed ${c[0]} factor`, DF.oedFactor(c[0], c[7]), r.factor, 1e-12);
  for (const q of ['xj', 'Rs', 'Dt', 'oed']) check(`diffusion oed ${c[0]} int ${q}`, a[q], r.int[q], 1e-9);
  for (const q of ['xj', 'Rs', 'dose', 'oed']) check(`diffusion oed ${c[0]} cd ${q}`, b[q], r.cd[q], 1e-6);
}
for (const r of ref.vfab_compare) {
  const rows = VFB.compare(VFB.run(r.case[0], null, r.case[1]), LABRUN), tag = `vfab compare ${r.case[0].length} steps${r.case[1] ? ' (run recipe)' : ''}`;
  check(`${tag} rows`, rows.length, r.rows.length, 0);
  r.rows.forEach((w, i) => { check(`${tag} ${w.key} measured`, rows[i].measured, w.measured, 1e-12);
    if (w.computed === null) { if (rows[i].computed !== null) check(`${tag} ${w.key} null`, 1, 0, 0); } else check(`${tag} ${w.key}`, rows[i].computed, w.computed, 1e-9); });
}
{ const a = VFB.runCfg(LABRUN), b = ref.vfab_compare[0].case[1]; check('vfab runCfg', JSON.stringify(a) === JSON.stringify(b) ? 1 : 0, 1, 0); }
for (const r of ref.planar) { const c = PLN.run(...r.case); for (const q of ['xj', 'Rs', 'bv_pp', 'W_um', 'ratio', 'bv_cyl']) check(`planar ${r.case[0]} ${q}`, c[q], r[q], 1e-9); }
for (const r of ref.anneal) { const c = AL.run(...r.case); for (const q of ['Dt', 'ramps', 't_eq', 't_total', 'xj', 'Rs']) check(`anneal ${r.case[0]} ${r.case[3]} ${q}`, c[q], r[q], 1e-6); }
{ const L = ref.labrun;
  LR.oxideSequence([['dry', 1000, 5], ['wet', 1000, 90], ['dry', 1000, 5]]).forEach((v, i) => check(`labrun seq ${i}`, v, L.seq[i], 1e-12));
  check('labrun seq p', LR.oxideSequence([['wet', 1050, 37, 0.1]], '100', 0.02)[0], L.seq_p[0], 1e-12);
  check('labrun parabolic', LR.parabolicOnly('wet', 1000, 90), L.parab, 1e-12); check('labrun p_eff', LR.effectivePressure('wet', 1050, 37, 0.0629), L.peff, 1e-9);
  for (const [k, v] of Object.entries(L.dop)) { const [r, c] = k.split('_'); check(`labrun doping ${k}`, LR.resistivityToDoping(+r, c), v, 1e-9); }
  check('labrun Cpp', LR.parallelPlatePf(57600, 114), L.cpp, 1e-12); check('labrun LCR', LR.lcrReadingPf(17.4, 12000), L.lcr, 1e-12); check('labrun R series', LR.seriesRForReading(17.4, 5.95), L.rser, 1e-12);
  for (const [k, v] of Object.entries(L.vt)) { const [Na, t, g] = k.split('_'); check(`labrun VT ${k}`, LR.vtIdeal(+Na, +t, g, 5e11), v, 1e-9); }
  check('labrun Nox', LR.oxideChargeFromVt(-1.5, 7e16, 114), L.nox, 1e-9); check('labrun Vbi', LR.builtinPotential(1.66e16, 8.5e19), L.vbi, 1e-9);
  check('labrun bias', LR.isotropicBiasUm(0.548, 0.3), L.bias, 1e-12); check('labrun over-etch', LR.impliedOveretch(-1.341, 0.42), L.over, 1e-12); check('labrun Rs', LR.sheetFromResistor(203, 199, 9), L.rs, 1e-12); }
for (const [k, v] of Object.entries(ref.oxidation)) { const [a, T, t, o] = k.split('_'); check(`oxide ${k}`, OX.thickness(a, +T, +t, o), v, 1e-12); }
for (const [k, v] of Object.entries(ref.implant.ranges)) { const [i, E] = k.split('_'), r = IM.rangeStats(i, +E); for (const q of ['R', 'Rp', 'dRp']) check(`range ${k} ${q}`, r[q], v[q], 1e-9); }
for (const [i, v] of Object.entries(ref.implant.cross)) check(`crossover ${i}`, IM.crossoverKeV(i), v, 1e-6);
for (const r of ref.implant.junction) { const j = IM.junction(...r.case); for (const q of ['xj', 'peak', 'Rs', 'sigma_nm']) check(`junction ${r.case.slice(0, 3).join(' ')} ${q}`, j[q], r[q], 1e-9); }
for (const [s2, v] of Object.entries(ref.yield.dpw)) check(`DPW ${s2} mm²`, YC.diesPerWafer(+s2), v, 1e-12);
for (const [k, v] of Object.entries(ref.yield.models)) { const [m, A, D] = k.split('_'); check(`yield ${k}`, YC.yieldModel(+A, +D, m, 2), v, 1e-12); }
for (const [k, v] of Object.entries(ref.yield.grid)) { const [w, h] = k.split('x'); check(`die grid ${k}`, YC.dieGrid(+w, +h).length, v, 0); }
{ const r1 = YC.mulberry32(42), r2 = YC.mulberry32(7); const got = [r1(), r2(), r2(), r2(), r2(), r2()];
  got.forEach((g, i) => check(`mulberry32 #${i}`, g, ref.yield.rand[i], 0)); }
for (const [s3, v] of Object.entries(ref.yield.mc)) { const w = YC.simulateWafer(10, 10, 0.5, 3, +s3); check(`MC wafer seed ${s3} good dies`, w.good, v.good, 0); check(`MC wafer seed ${s3} defects`, w.defects.reduce((a, b) => a + b, 0), v.defects, 0); }
check('Blech jL', EM.blechProduct(105), ref.em.blech, 1e-12); check('EM kappa', EM.kappa(300), ref.em.kappa300, 1e-12);
check('EM G', EM.G(2, 300), ref.em.G, 1e-12); check('EM t_nuc long', EM.tNucleationLong(2, 300), ref.em.tlong, 1e-12);
for (const [L, v] of Object.entries(ref.em.ttf)) check(`EM time to fail L=${L}`, EM.timeToFail(+L, 2, 300), v, 1e-9);
{ const l = new EM.Line(50, 2, 300, 81); l.step(l.L ** 2 / l.k / 200, 40); let worst = 0;
  ref.em.line.forEach((v, i) => { worst = Math.max(worst, Math.abs(l.sigma[i * 10] - v) / 1e6); });
  if (worst > 1e-6) fails++; console.log(`${worst > 1e-6 ? 'FAIL' : 'ok  '} Korhonen line stress (max diff ${worst.toExponential(1)} MPa)`); }
for (const r of ref.analog.ss) { const [k, vg, vd] = r.case, s = AN.smallSignal(presets[k], vg, vd, 2); for (const q of ['I', 'gm', 'gds', 'gm_id', 'A0', 'fT']) check(`analog ${k} ${q}`, s[q], r[q], 1e-6); }
check('analog vgs for 10 µA/µm', AN.vgsForCurrent(presets['2007_45nm_hkmg'], 10, 0.5), ref.analog.vgsI, 1e-9);
{ const p = presets['1999_180nm'], c = ref.analog.cs, vb = AN.biasForMidrail(p, 1.8, 20); check('CS bias', vb, c.vb, 1e-9);
  const st = AN.csStage(p, 1.8, 20, vb); for (const q of ['vout', 'gain', 'rout']) check(`CS ${q}`, st[q], c[q], 1e-6);
  check('CS THD', AN.sineResponse(p, 1.8, 20, vb, 0.05).thd, c.thd, 1e-6);
  const b = AN.bode(p, 1.8, 20, vb, 2, 10); for (const q of ['A0_dB', 'f3dB', 'GBW', 'C_miller']) check(`Bode ${q}`, b[q], c['bode_' + q], 1e-6);
  let worst = 0; c.bode_mag.forEach((v, i) => { worst = Math.max(worst, Math.abs(b.mag[i * 40] - v)); });
  if (worst > 1e-6) fails++; console.log(`${worst > 1e-6 ? 'FAIL' : 'ok  '} Bode magnitude (max diff ${worst.toExponential(1)} dB)`); }
check('noise corner', AN.noiseCorner(presets['1999_180nm'], 1e-3, 10), ref.analog.noise.corner, 1e-9);
check('noise rms', AN.noiseRms(presets['2011_22nm_finfet'], 5e-4, 4, 10, 1e7), ref.analog.noise.rms, 1e-9);
check('noise psd', AN.noisePsd(presets['2025_2nm_gaa'], 2e-4, 1, 1e3), ref.analog.noise.psd, 1e-9);
{ // the 4-bit ripple-carry adder on the page, evaluated stage by stage, adds like gateblocks.ripple
  let bad = 0; const bits = (x) => [0, 1, 2, 3].map((i) => (x >> i) & 1);
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (const ci of [0, 1]) {
    const { s, carry } = GA.ripple(GATECELLS.gates.fa, bits(x), bits(y), ci);
    if (s.reduce((a, b, i) => a + (b << i), 0) + (carry[4] << 4) !== x + y + ci) bad++;
  }
  if (bad) fails++; console.log(`${bad ? 'FAIL' : 'ok  '} ripple-carry adder, all 512 cases (${bad} wrong)`); }
// Experiments page (v1.27): the seeded generator, the CSV parser, every example fit and the real Moore fit
{ const R = ref.fitting;
  const g42 = FIT.mulberry32(42), g7 = FIT.mulberry32(7);
  [g42(), g7(), g7(), g7(), g7()].forEach((v, i) => check(`fit rng ${i}`, v, R.rng[i], 1e-15));
  const csv = FIT.parseCSV('V,I_mA\n# note\n0.5;0.1\n0.6\t1.2\n\n0.7, 3e-2\n');
  { const ok = JSON.stringify(csv) === JSON.stringify(R.csv); if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} fit parseCSV ${JSON.stringify(csv)}`); }
  check('fit diode dV/dT', FIT.diodeDvdt(0.6, 298.15), R.dvdt, 1e-12);
  for (const e of R.examples) {
    const ex = (await import('../site/js/experiments/data.js')).EXPERIMENTS.experiments.find(x => x.id === e.id).example;
    const rows = FIT.example(e.model, ex.xs, ex.truth, ex.noise, ex.seed);
    rows.forEach((r, i) => r.forEach((v, j) => check(`fit ${e.id} row ${i}.${j}`, v, e.rows[i][j], 1e-12)));
    const r = FIT.fit(e.model, rows, e.params);
    for (const k of Object.keys(e.out)) { check(`fit ${e.id} ${k}`, r.out[k], e.out[k], 1e-9); check(`fit ${e.id} σ(${k})`, r.err[k], e.err[k], 1e-5); }
    check(`fit ${e.id} R²`, r.r2, e.r2, 1e-12);
  }
  const { REAL } = await import('../site/js/experiments/data.js');
  const m = FIT.fit('moore', REAL.chips.map(c => [c[0], c[1]]));
  check('fit Moore doubling time (real chips)', m.out.T_years, R.moore.T, 1e-12);
  check('fit Moore σ', m.err.T_years, R.moore.err, 1e-9);
}
// 3D layer builder (v1.28): every box of every architecture, the rectangle subtraction and the metrics
{ const BL = await import('../site/js/physics/builder.js');
  const { BUILDER } = await import('../site/js/journey/data.js');
  for (const a of BUILDER.archs) {
    const R = ref.builder[a.id], bx = BL.build(a);
    let bad = bx.length === R.boxes.length ? 0 : 1;
    bx.forEach((b, i) => { const r = R.boxes[i]; if (!r || b[0] !== r[0] || b[7] !== r[7] || b[8] !== r[8] || b.slice(1, 7).some((v, k) => Math.abs(v - r[k + 1]) > 1e-6)) bad++; });
    if (bad) fails++; console.log(`${bad ? 'FAIL' : 'ok  '} builder ${a.id}: ${bx.length} boxes (${bad} differ)`);
    const sub = BL.subtract([0, 10, 0, 10], [[2, 4, 1, 3], [3, 6, 2, 5], [8, 12, -1, 4]]);
    { const ok = JSON.stringify(sub) === JSON.stringify(R.sub); if (!ok) fails++; if (!ok) console.log(`FAIL builder subtract ${JSON.stringify(sub)}`); }
    const m = BL.metrics(a);
    for (const [k, v] of Object.entries(R.metrics)) {
      if (v === null) { const ok = m[k] === null; if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} builder ${a.id} ${k} null`); }
      else check(`builder ${a.id} ${k}`, m[k], v, 1e-12);
    }
  }
}
// Node-reading lab (v1.29): pitch from marks, its error, bitcells, node ranking and the drawn lines
{ const NL = await import('../site/js/physics/nodelab.js');
  const { NODEPITCH } = await import('../site/js/journey/data.js');
  const R = ref.nodelab, nodes = NODEPITCH.nodes;
  check('nodelab pitch 10', NL.pitch(13, 553, 10), R.pitch[0], 1e-12);
  check('nodelab pitch 2 reversed', NL.pitch(700, 520, 2), R.pitch[1], 1e-12);
  R.pitch_error.forEach((v, i) => check(`nodelab pitch error ${i}`, NL.pitchError(3, [1, 10][i]), v, 1e-12));
  for (const n of nodes) { const c = NL.cell(n); check(`nodelab cell ${n.id} w`, c[0], R.cells[n.id][0], 1e-12); check(`nodelab cell ${n.id} h`, c[1], R.cells[n.id][1], 1e-12); }
  const cases = [{ cpp: 54.6, mmp: 36.4 }, { cpp: 90 }, { cpp: 57, mmp: 40, fin: 30, sram: 0.027 }, { sram: 0.06 }, { cpp: 160, mmp: 150 }];
  cases.forEach((c, i) => {
    const r = NL.rank(c, nodes), want = R.ranks[i];
    const ok = r.length === want.length && r.every((p, k) => p[0] === want[k][0] && Math.abs(p[1] - want[k][1]) < 1e-12);
    if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} nodelab rank ${i}: best ${r[0][0]}`);
  });
  for (const n of nodes) for (const layer of ['gate', 'metal', 'fin', 'sram']) {
    const v = NL.view(n, layer, 600, 17), w = R.views[n.id][layer];
    const ok = (v === null && w === null) || (v && w && v.centres.length === w.centres.length && v.centres.every((x, k) => Math.abs(x - w.centres[k]) < 1e-9) && Math.abs(v.width - w.width) < 1e-12);
    if (!ok) { fails++; console.log(`FAIL nodelab view ${n.id} ${layer}`); }
  }
  console.log(`ok   nodelab views (${nodes.length} nodes × 4 layers)`);
}
// Spot the defect (v1.30): shuffles and the seven model-placed defects, bad and good settings
{ const DF = await import('../site/js/physics/defects.js');
  const R = ref.defects;
  [1, 2, 3, 42, 2026].forEach((s, i) => { const ok = JSON.stringify(DF.order(s)) === JSON.stringify(R.orders[i]); if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} defects order seed ${s}`); });
  // deep compare: numbers to 1e-9 relative, everything else exactly
  const same = (a, b, path) => {
    if (typeof b === 'number') return (typeof a === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))) || (console.log(`  ${path}: ${a} vs ${b}`), false);
    if (b === null || typeof b !== 'object') return a === b || (console.log(`  ${path}: ${a} vs ${b}`), false);
    if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((v, k) => same(a[k], v, `${path}[${k}]`));
    return a && typeof a === 'object' && Object.keys(b).every((k) => same(a[k], b[k], `${path}.${k}`));
  };
  for (const c of DF.CASES) for (const g of ['bad', 'good']) {
    const ok = same(DF.caseOf(c, 7, g === 'good'), R.cases[c][g], `${c}.${g}`);
    if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} defects ${c} ${g}: defect at ${JSON.stringify(R.cases[c][g].defect)}`);
  }
}
const v = MC.simulate(1e5, { n: 1000, tPs: 3 });
check('MC v(1e5 V/cm) within 25% of 1.07e7', v, 1.07e7, 0.25);
if (fails) { console.error(`${fails} parity check(s) failed`); process.exit(1); }
console.log('all parity checks passed');
