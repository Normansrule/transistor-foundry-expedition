// Czochralski crystal growth: dopant segregation along the ingot (Scheil). Twin of sim/transistor_sim/physics/czochralski.py.
import { mobility } from './implant.js';
import { resistivityToDoping } from './labrun.js';

const Q = 1.602176634e-19;
export const K0 = { B: 0.8, P: 0.35, As: 0.3, Sb: 0.023 };
export const CARRIER = { B: 'p', P: 'n', As: 'n', Sb: 'n' };
export const F_MAX = 0.98;

export const concentration = (f, k, Nseed) => Nseed * (1 - f) ** (k - 1);
export const resistivity = (N, carrier) => 1 / (Q * mobility(N, carrier) * N);

export function usableFraction(k, Nseed, carrier, tol) {
  const rho0 = resistivity(Nseed, carrier);
  const ok = (f) => Math.abs(resistivity(concentration(f, k, Nseed), carrier) / rho0 - 1) <= tol;
  if (ok(F_MAX)) return F_MAX;
  let lo = 0, hi = F_MAX;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (ok(m)) lo = m; else hi = m; }
  return lo;
}

export function run(dopant = 'B', rhoSeed = 10, tol = 0.2, n = 120) {
  const k = K0[dopant], c = CARRIER[dopant], N0 = resistivityToDoping(rhoSeed, c);
  const f = Array.from({ length: n }, (_, i) => F_MAX * i / (n - 1));
  const N = f.map((x) => concentration(x, k, N0)), rho = N.map((x) => resistivity(x, c));
  const fu = usableFraction(k, N0, c, tol);
  return { k, carrier: c, N_seed: N0, melt0: N0 / k, f, N, rho, f_usable: fu, rho_tail: rho[n - 1], ratio_tail: N[n - 1] / N0, rho_at_usable: resistivity(concentration(fu, k, N0), c) };
}
