// Thermal budget of an anneal (furnace, RTA, spike, millisecond). Twin of sim/transistor_sim/physics/anneal.py.
import { diffusivity, junction } from './implant.js';

export const T_BASE = 500;

export function rampDt(ion, Tp, rate, n = 400) {
  if (Tp <= T_BASE) return 0;
  const h = (Tp - T_BASE) / n;
  let s = diffusivity(ion, T_BASE) + diffusivity(ion, Tp);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * diffusivity(ion, T_BASE + i * h);
  return s * h / 3 / rate;
}

export function budget(ion, Tp, hold, rate) {
  const up = rampDt(ion, Tp, rate), ho = diffusivity(ion, Tp) * hold, Dt = 2 * up + ho;
  return { Dt, ramps: 2 * up, hold: ho, t_eq: Dt / diffusivity(ion, Tp), t_total: 2 * (Tp - T_BASE) / rate + hold, ramp_share: Dt > 0 ? 2 * up / Dt : 0 };
}

export function run(ion = 'B', E = 5, dose = 1e15, Tp = 1050, hold = 1, rate = 100, Nbg = 1e17) {
  const b = budget(ion, Tp, hold, rate), j0 = junction(ion, E, dose, Nbg), j = junction(ion, E, dose, Nbg, Tp, b.t_eq);
  return { ...b, xj0: j0.xj, xj: j.xj, Rs: j.Rs, peak: j.peak, Rp: j0.Rp, sigma0: j0.sigma_nm, sigma: j.sigma_nm, L: Math.sqrt(2 * b.Dt) * 1e7 };
}
