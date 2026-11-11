// Nanosheet release: selective lateral etch of SiGe, silicon loss and stringers. Twin of sim/transistor_sim/physics/release.py.
export function run(W = 30, t = 5, S = 100, over = 0.2, n = 3, npts = 61) {
  const e = 0.5 * W * (1 + over), side = e / S, core = Math.max(0, W - 2 * e);
  const y = Array.from({ length: npts }, (_, i) => 0.5 * W * i / (npts - 1));
  const thick = y.map((v) => Math.max(0, t - 2 * Math.max(0, e - v) / S));
  let m = 0; for (let i = 0; i < npts - 1; i++) m += 0.5 * (thick[i] + thick[i + 1]) * (y[i + 1] - y[i]);
  const tMean = m / (0.5 * W), wf = Math.max(0, W - 2 * side);
  return { e, side, core, released: core === 0, y, thick, t_edge: thick[0], t_centre: thick[npts - 1], t_mean: tMean, w_final: wf,
    weff: core === 0 ? 2 * (wf + tMean) * n : 0, weff_ideal: 2 * (W + t) * n, spread: thick[npts - 1] - thick[0] };
}
