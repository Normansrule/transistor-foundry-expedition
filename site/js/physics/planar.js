// Hoerni's planar junction: oxide-window diffusion and cylindrical-edge breakdown. Twin of sim/transistor_sim/physics/planar.py.
import { run as diffuse } from './diffusion.js';

const Q = 1.602176634e-19, EPS_SI = 11.7 * 8.8541878128e-14, EG = 1.12;
export const CS = 1e20, T1 = 1000, T1_S = 1200;
export const bvPlane = (NB) => 60 * (EG / 1.1) ** 1.5 * (NB / 1e16) ** -0.75;
export const depletionUm = (V, NB) => Math.sqrt(2 * EPS_SI * V / (Q * NB)) * 1e4;
export const cylRatio = (x) => Math.sqrt(x * x + 2 * x ** (6 / 7)) - x;

export function run(NB = 1e15, T2 = 1100, t2min = 60) {
  const d = diffuse('B', CS, T1, T1_S, T2, t2min * 60, NB), bv = bvPlane(NB), W = depletionUm(bv, NB), xj = d.xj / 1000, ratio = cylRatio(xj / W);
  return { xj: d.xj, Rs: d.Rs, lateral: 0.8 * d.xj, bv_pp: bv, W_um: W, r_over_w: xj / W, ratio, bv_cyl: bv * ratio };
}
