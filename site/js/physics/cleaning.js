// Wafer cleaning: particles left after n passes, the killer share of a 1/d³ size distribution, the yield they cost,
// and the lifetime iron in the bulk leaves. Twin of sim/transistor_sim/physics/cleaning.py. Chemistry is conceptual only.
import { mobility } from './implant.js';
import { yieldModel } from './yieldcost.js';

export const D_INSPECT = 50, WAFER_CM2 = Math.PI * 15 ** 2, SIGMA_N = 5e-14, V_TH = 1.1e7, N_A = 1.66e16, KT_Q = 0.025852;
export const killerFraction = (dk, d0 = D_INSPECT) => (dk <= d0 ? 1 : (d0 / dk) ** 2);
export const lifetimeS = (Nfe) => 1 / (SIGMA_N * V_TH * Nfe);

export function run(N0 = 2000, eta = 0.9, passes = 1, dk = 100, Nfe = 1e10, die = 100) {
  const left = N0 * (1 - eta) ** passes, f = killerFraction(dk), killers = left * f, D_add = killers / WAFER_CM2;
  const tau = lifetimeS(Nfe), D = mobility(N_A, 'n') * KT_Q;
  return { left, removed: N0 - left, f_kill: f, killers, D_add, Y: yieldModel(die, D_add), Y_dirty: yieldModel(die, N0 * f / WAFER_CM2),
    tau_us: tau * 1e6, D, L_um: Math.sqrt(D * tau) * 1e4 };
}
