// Two-step dopant diffusion: constant-source predeposition (erfc), then a fixed-dose drive-in (half-Gaussian).
// Twin of sim/transistor_sim/physics/diffusion.py.
import { IONS, diffusivity, mobility } from './implant.js';
const Q = 1.602176634e-19;

export function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const predepDose = (Cs, D, t) => 2 * Cs * Math.sqrt(D * t / Math.PI);
export const erfcProfile = (x, Cs, Dt) => Cs * erfc(x * 1e-7 / (2 * Math.sqrt(Dt)));
export function gaussProfile(x, dose, Dt) { const xc = x * 1e-7; return dose / Math.sqrt(Math.PI * Dt) * Math.exp(-xc * xc / (4 * Dt)); }

function layer(f, Nbg, carrier, xmax, n) {
  const x = Array.from({ length: n }, (_, i) => xmax * i / (n - 1)), N = x.map(f);
  let k = -1; for (let i = 0; i < n; i++) if (N[i] > Nbg) k = i;
  if (k < 0) return [0, Infinity];
  const xj = k + 1 < n ? x[k] + (x[k + 1] - x[k]) * (N[k] - Nbg) / (N[k] - N[k + 1]) : x[k];
  const g = N.map((v) => Q * mobility(v + Nbg, carrier) * Math.max(v - Nbg, 0));
  let G = 0; for (let i = 1; i < n; i++) G += 0.5 * (g[i] + g[i - 1]) * (x[i] - x[i - 1]);
  G *= 1e-7;
  return [xj, G > 0 ? 1 / G : Infinity];
}

export function run(ion, Cs, T1, t1, T2, t2, Nbg, n = 600) {
  const D1 = diffusivity(ion, T1), D2 = diffusivity(ion, T2), Dt1 = D1 * t1, Dt2 = D2 * t2;
  const dose = predepDose(Cs, D1, t1), carrier = IONS[ion].type;
  const L1 = 2 * Math.sqrt(Dt1) * 1e7;
  const [xj_pre, Rs_pre] = layer((v) => erfcProfile(v, Cs, Dt1), Nbg, carrier, 6 * L1, n);
  const Dt = Dt1 + Dt2, L = 2 * Math.sqrt(Dt) * 1e7;
  const [xj, Rs] = layer((v) => gaussProfile(v, dose, Dt), Nbg, carrier, 6 * L, n);
  return { D1, D2, Dt1, Dt, dose, xj_pre, Rs_pre, xj, Rs, Cs_after: dose / Math.sqrt(Math.PI * Dt), L_pre: L1, L };
}
