// Chemical-mechanical polishing of oxide over lines: Preston's law and the pattern-density step-height
// model (Stine et al. 1998). Twin of sim/transistor_sim/physics/cmp.py; checked by tests/js_parity.mjs.
export const KP = 7.0, HC = 120.0, STEP0 = 500.0, OX0 = 1000.0, DENSITIES = [0.2, 0.5, 0.8], DT = 0.02;

export const rate = (P, V) => KP * P * V;

export function polish(rho, P, V, tMin, nOut = 60) {
  const K = rate(P, V), steps = Math.round(tMin / DT), every = Math.max(1, Math.floor(steps / nOut)), hist = [];
  let up = OX0 + STEP0, down = OX0, tFlat = null;
  for (let i = 0; i <= steps; i++) {
    if (i % every === 0 || i === steps) hist.push([Math.round(i * DT * 1e6) / 1e6, up, down]);
    if (i === steps) break;
    const h = up - down;
    const [ru, rd] = h >= HC ? [K / rho, 0] : [K * (1 - h / HC + h / (HC * rho)), K * (1 - h / HC)];
    up -= ru * DT; down -= rd * DT;
    if (tFlat === null && up - down < 5) tFlat = (i + 1) * DT;
  }
  return { up, down, step: up - down, over_line: up - STEP0, t_flat: tFlat, hist };
}

export function run(P = 28.0, V = 1.0, tMin = 3.0) {
  const regions = DENSITIES.map((rho) => ({ rho, ...polish(rho, P, V, tMin) }));
  const tops = regions.map((g) => g.up);
  return { K: rate(P, V), regions, range_nm: Math.max(...tops) - Math.min(...tops) };
}
