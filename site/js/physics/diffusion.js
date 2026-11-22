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

// Oxidation-enhanced and -retarded diffusion (Hu 1974; Plummer et al. 2000, ch. 7): D/D* = f_I·S + (1 − f_I)/S,
// S = C_I/C_I* the interstitial supersaturation during the drive-in. Twin of oed_factor in diffusion.py.
export const FI = { B: 0.9, P: 0.95, As: 0.4, Sb: 0.02 };
export function oedFactor(ion, S) { const f = FI[ion]; return f * S + (1 - f) / S; }

export function run(ion, Cs, T1, t1, T2, t2, Nbg, n = 600, S2 = 1) {
  const D1 = diffusivity(ion, T1), D2 = diffusivity(ion, T2) * oedFactor(ion, S2), Dt1 = D1 * t1, Dt2 = D2 * t2;
  const dose = predepDose(Cs, D1, t1), carrier = IONS[ion].type;
  const L1 = 2 * Math.sqrt(Dt1) * 1e7;
  const [xj_pre, Rs_pre] = layer((v) => erfcProfile(v, Cs, Dt1), Nbg, carrier, 6 * L1, n);
  const Dt = Dt1 + Dt2, L = 2 * Math.sqrt(Dt) * 1e7;
  const [xj, Rs] = layer((v) => gaussProfile(v, dose, Dt), Nbg, carrier, 6 * L, n);
  return { D1, D2, Dt1, Dt, dose, xj_pre, Rs_pre, xj, Rs, Cs_after: dose / Math.sqrt(Math.PI * Dt), L_pre: L1, L, oed: oedFactor(ion, S2) };
}

// Concentration-dependent diffusion (Fair 1981; Plummer et al. 2000, table 7-5): D = D⁰ + D⁻(n/nᵢ) + D⁼(n/nᵢ)²
// (D⁺(p/nᵢ) for boron), solved with backward Euler on a uniform grid. Twin of run_cd in diffusion.py.
export const K_EV = 8.617333262e-5;
export const CD = { P: [[3.85, 3.66], [4.44, 4.00], [44.2, 4.37]], As: [[0.066, 3.44], [12.0, 4.05]], Sb: [[0.214, 3.65], [15.0, 4.08]], B: [[0.037, 3.46], [0.41, 3.46]] };
export function niHot(T) { const TK = T + 273.15; return 3.9e16 * TK ** 1.5 * Math.exp(-0.605 / (K_EV * TK)); }
export function diffusivityCd(ion, N, T) {
  const TK = T + 273.15, ni = niHot(T), h = 0.5 * N, r = (h + Math.sqrt(h * h + ni * ni)) / ni;
  let d = 0, f = 1;
  for (const [A, E] of CD[ion]) { d += A * Math.exp(-E / (K_EV * TK)) * f; f *= r; }
  return d;
}
function solve(ion, N, dx, T, t, nt, Cs, mult = 1) {
  const nx = N.length, k = (t / nt) / (dx * dx);
  for (let s = 0; s < nt; s++) {
    const Dv = N.map((v) => diffusivityCd(ion, v, T) * mult);
    const a = new Array(nx).fill(0), b = new Array(nx).fill(1), c = new Array(nx).fill(0), d = N.slice();
    for (let i = 1; i < nx - 1; i++) { a[i] = -k * 0.5 * (Dv[i - 1] + Dv[i]); c[i] = -k * 0.5 * (Dv[i] + Dv[i + 1]); b[i] = 1 - a[i] - c[i]; }
    if (Cs !== null) d[0] = Cs; else { c[0] = -2 * k * 0.5 * (Dv[0] + Dv[1]); b[0] = 1 - c[0]; }
    d[nx - 1] = 0;
    for (let i = 1; i < nx; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    N[nx - 1] = d[nx - 1] / b[nx - 1];
    for (let i = nx - 2; i >= 0; i--) N[i] = (d[i] - c[i] * N[i + 1]) / b[i];
  }
  return N;
}
export function runCd(ion, Cs, T1, t1, T2, t2, Nbg, nx = 301, nt = 300, S2 = 1) {
  const m2 = oedFactor(ion, S2);
  const L = 8 * Math.sqrt(diffusivityCd(ion, Cs, T1) * t1 + diffusivityCd(ion, Cs, T2) * t2 * Math.max(m2, 1)), dx = L / (nx - 1);
  let N = new Array(nx).fill(0); N[0] = Cs;
  N = solve(ion, N, dx, T1, t1, nt, Cs);
  let dose = 0; for (let i = 1; i < nx; i++) dose += 0.5 * (N[i] + N[i - 1]) * dx;
  N = solve(ion, N, dx, T2, t2, nt, null, m2);
  const x = N.map((_, i) => i * dx * 1e7), carrier = IONS[ion].type;
  let k = -1; for (let i = 0; i < nx; i++) if (N[i] > Nbg) k = i;
  let xj = 0, Rs = Infinity;
  if (k >= 0) {
    xj = k + 1 < nx ? x[k] + (x[k + 1] - x[k]) * (N[k] - Nbg) / (N[k] - N[k + 1]) : x[k];
    const g = N.map((v) => Q * mobility(v + Nbg, carrier) * Math.max(v - Nbg, 0));
    let G = 0; for (let i = 1; i < nx; i++) G += 0.5 * (g[i] + g[i - 1]) * (x[i] - x[i - 1]);
    G *= 1e-7; Rs = G > 0 ? 1 / G : Infinity;
  }
  return { xj, Rs, dose, Cs_after: N[0], ni: niHot(T2), x, N, D_surf: diffusivityCd(ion, Cs, T1), D_int: diffusivityCd(ion, 0, T1), oed: m2 };
}
