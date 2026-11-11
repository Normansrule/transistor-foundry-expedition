// A damascene line: barrier, size-effect resistivity and RC. Twin of sim/transistor_sim/physics/damascene.py.
import { METALS, rPerUm, cPerUm, resistivity } from './interconnect.js';

export function run(metal = 'Cu', w = 20, ar = 2, barrier = null, L = 100, k = 2.7) {
  const t = barrier == null ? METALS[metal].barrier : barrier, h = ar * w;
  const wc = Math.max(w - 2 * t, 0.5), hc = Math.max(h - t, 0.5);
  const r = rPerUm(metal, w, h, t), c = cPerUm(w, h, w, k);
  return { t, h, wc, hc, core_share: wc * hc / (w * h), rho_bulk: METALS[metal].rho0, rho_core: resistivity(metal, wc, hc), rho_line: r * (w * h * 1e-18) / 1e-6 * 1e8, r, c, rc: 0.38 * r * c * L * L };
}
