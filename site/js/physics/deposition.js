// Filling a trench: step coverage for sputtering (PVD), CVD and ALD. Knudsen diffusion-reaction down the
// trench, re-solved as the film narrows it. Twin of sim/transistor_sim/physics/deposition.py; checked by tests/js_parity.mjs.
export const NZ = 48, GPC = 0.11, S_ALD = 0.01, SEAM = 0.10;
export const METHODS = { pvd: { s: 1.0, name: 'Sputtering (PVD)' }, cvd: { s: 0.05, name: 'CVD' }, ald: { s: S_ALD, name: 'ALD' } };

function thomas(a, b, c, d) {
  const n = d.length, cp = new Array(n).fill(0), dp = new Array(n).fill(0);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) { const m = b[i] - a[i] * cp[i - 1]; cp[i] = i < n - 1 ? c[i] / m : 0; dp[i] = (d[i] - a[i] * dp[i - 1]) / m; }
  const x = new Array(n).fill(0); x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

export function flux(widths, depth, s) {
  const h = depth / NZ, n = NZ + 1, a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), d = new Array(n).fill(0);
  b[0] = 1; d[0] = 1;
  for (let k = 1; k < n; k++) {
    const wk = Math.max(widths[k], 1e-3), g = 1.5 * s / (wk * wk) * h * h;
    if (k < n - 1) { a[k] = -1; b[k] = 2 + g; c[k] = -1; } else { a[k] = -2; b[k] = 2 + g; }
  }
  return thomas(a, b, c, d);
}

export function fill(method, w, ar, targetNm, s = null, exposure = 20.0, steps = 160) {
  const depth = ar * w; s = s === null ? METHODS[method].s : s;
  const side = new Array(NZ + 1).fill(0);
  let top = 0, closedAt = null, voidZ = null;
  const dt = targetNm / steps;
  for (let i = 0; i < steps; i++) {
    const widths = side.map((t) => w - 2 * t);
    if (widths[0] <= 0) {
      if (closedAt === null) {
        closedAt = top;
        const open = []; widths.forEach((x, k) => { if (x > SEAM * w) open.push(k); });
        voidZ = open.length ? [depth * open[0] / NZ, depth * open[open.length - 1] / NZ] : null;
      }
      top += dt; continue;
    }
    const n = flux(widths, depth, s);
    for (let k = 0; k <= NZ; k++) {
      if (widths[k] <= 0) continue;
      const g = method === 'ald' ? Math.min(1, exposure * n[k]) : n[k];
      side[k] = Math.min(side[k] + dt * g, w / 2);
    }
    top += dt;
  }
  return { depth, side, floor: side[NZ], top, coverage: top > 0 ? Math.min(...side) / top : 0, bottom_ratio: top ? side[NZ] / top : 0,
    void: voidZ !== null, void_z: voidZ, closed_at: closedAt, cycles: method === 'ald' ? Math.ceil(targetNm / GPC) : null };
}
