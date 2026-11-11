// A real teaching-cleanroom run checked against the models. Twin of sim/transistor_sim/physics/labrun.py.
import * as OX from './oxidation.js';
import { K_B, intrinsicDensity } from './carriers.js';
import { mobility } from './implant.js';
import { EPS0, Q } from './junction.js';

export const EPS_OX = 3.9 * EPS0, EPS_SI = 11.7 * EPS0, EG_SI = 1.12, CHI_SI = 4.05;
export const PHI_M = { al: 4.10, 'n+poly': CHI_SI, 'p+poly': CHI_SI + EG_SI };

/** Thickness (µm) after each [ambient, T_C, minutes, p?] step, each starting from the last. */
export function oxideSequence(steps, orient = '100', x0 = null) {
  const out = []; let x = x0;
  for (const [amb, T, min, p = 1] of steps) { x = OX.thickness(amb, T, min / 60, orient, p, x); out.push(x); }
  return out;
}
export function parabolicOnly(amb, T_C, minutes, orient = '100') { const [B] = OX.rateConstants(amb, T_C, orient); return Math.sqrt(B * minutes / 60); }
export function effectivePressure(amb, T_C, minutes, x, orient = '100', x0 = null) {
  let lo = -5, hi = 1.5;
  for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (OX.thickness(amb, T_C, minutes / 60, orient, 10 ** mid, x0) < x) lo = mid; else hi = mid; }
  return 10 ** (0.5 * (lo + hi));
}
export function resistivityToDoping(rho, carrier = 'p') {
  let N = 1 / (Q * 400 * rho);
  for (let i = 0; i < 100; i++) N = 1 / (Q * mobility(N, carrier) * rho);
  return N;
}
export const parallelPlatePf = (area_um2, t_nm, k = 3.9) => k * EPS0 * (area_um2 * 1e-8) / (t_nm * 1e-7) * 1e12;
export function lcrReadingPf(C, R, f = 1e6) { const w = 2 * Math.PI * f * R * C * 1e-12; return C / (1 + w * w); }
export function seriesRForReading(C, Cm, f = 1e6) { return Cm >= C ? 0 : Math.sqrt(C / Cm - 1) / (2 * Math.PI * f * C * 1e-12); }
export const phiB = (Na, T = 300) => K_B * T * Math.log(Na / intrinsicDensity('Si', T));
export const phiMs = (Na, gate = 'n+poly', T = 300) => PHI_M[gate] - (CHI_SI + EG_SI / 2 + phiB(Na, T));
export function vtIdeal(Na, tox_nm, gate = 'n+poly', Nox = 0, T = 300) {
  const Cox = EPS_OX / (tox_nm * 1e-7), pb = phiB(Na, T), Qd = Math.sqrt(2 * EPS_SI * Q * Na * 2 * pb);
  return phiMs(Na, gate, T) - Q * Nox / Cox + 2 * pb + Qd / Cox;
}
export function oxideChargeFromVt(vt, Na, tox_nm, gate = 'n+poly', T = 300) { const Cox = EPS_OX / (tox_nm * 1e-7); return (vtIdeal(Na, tox_nm, gate, 0, T) - vt) * Cox / Q; }
export function builtinPotential(Na, Nd, T = 300) { const ni = intrinsicDensity('Si', T); return K_B * T * Math.log(Na * Nd / (ni * ni)); }
export const isotropicBiasUm = (t, over = 0) => 2 * t * (1 + over);
export const impliedOveretch = (bias, t) => Math.abs(bias) / (2 * t) - 1;
export const sheetFromResistor = (R, L, W) => R * W / L;
