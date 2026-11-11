// Plasma etch of narrow openings: aspect-ratio-dependent etching, anisotropy and selectivity.
// Twin of sim/transistor_sim/physics/etch.py (Coburn & Winters 1989 conductance model); checked by tests/js_parity.mjs.
export const R0 = 5.0, FILM = 200.0, MASK = 80.0, S_STOP = 20.0, WIDTHS = [20.0, 40.0, 120.0], NZ = 40, DT = 0.25;

/** Bottom etch rate relative to an open surface at aspect ratio ar. */
export const lag = (ar, s) => 1 / (1 + 0.75 * s * Math.max(ar, 0));

export function etchOpening(w, tTotal, s, aniso, sMask) {
  let d = 0, t = 0, tClear = null, nxt = 0;
  const passed = [], levels = Array.from({ length: NZ + 1 }, (_, k) => FILM * k / NZ);
  const steps = Math.round(tTotal / DT);
  for (let i = 0; i < steps; i++) {
    while (nxt <= NZ && levels[nxt] <= d) { passed.push([levels[nxt], t]); nxt++; }
    const rate = R0 * lag((d + MASK) / w, s) / (d < FILM ? 1 : S_STOP);
    if (d < FILM && d + rate * DT >= FILM) tClear = t + (FILM - d) / rate;
    d += rate * DT; t += DT;
  }
  while (nxt <= NZ && levels[nxt] <= d) { passed.push([levels[nxt], t]); nxt++; }
  const side = passed.map(([z, tz]) => [z, (1 - aniso) * R0 * lag((z + MASK) / w, s) * (t - tz)]);
  return { depth: d, t_clear: tClear, side, mask_left: Math.max(0, MASK - R0 / sMask * t), ar: (Math.min(d, FILM) + MASK) / w };
}

export function endpoint(s) {
  const w = Math.max(...WIDTHS);
  let d = 0, t = 0;
  while (d < FILM) {
    const rate = R0 * lag((d + MASK) / w, s);
    if (d + rate * DT >= FILM) return t + (FILM - d) / rate;
    d += rate * DT; t += DT;
  }
  return t;
}

export function run(s = 0.05, aniso = 0.9, sMask = 10.0, overetch = 0.5) {
  const tEnd = endpoint(s), tTotal = tEnd * (1 + overetch);
  const openings = WIDTHS.map((w) => ({ w, ...etchOpening(w, tTotal, s, aniso, sMask) }));
  const depths = openings.map((o) => o.depth);
  return { t_end: tEnd, t_total: tTotal, openings, lag_ratio: Math.min(...depths) / Math.max(...depths), all_clear: openings.every((o) => o.t_clear !== null) };
}
