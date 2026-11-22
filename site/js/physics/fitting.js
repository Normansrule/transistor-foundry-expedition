// Straight-line fits for the tiered experiments. Twin of sim/transistor_sim/physics/fitting.py:
// each experiment turns its measured columns into y = a + b x (or y = b x) and reads the physics
// from the slope and intercept. example() reproduces the Python model data bit for bit.
export const Q = 1.602176634e-19, K_B = 1.380649e-23, H = 6.62607015e-34, C_LIGHT = 299792458, EPS0 = 8.8541878128e-12;

export const MODELS = {
  yield_poisson: { cols: ['area', 'yield'], params: {}, origin: true },
  moore: { cols: ['year', 'transistors'], params: {}, origin: false },
  sqrt_t: { cols: ['t_min', 'x_mm'], params: {}, origin: false },
  capacitor: { cols: ['area_cm2', 't_um', 'C_pF'], params: {}, origin: true },
  grating: { cols: ['m', 'x_mm'], params: { L_mm: 1000, lambda_nm: 650 }, origin: true },
  diode: { cols: ['V', 'I_mA'], params: { T_K: 295 }, origin: false },
  led: { cols: ['lambda_nm', 'V_on'], params: {}, origin: false },
  mosfet: { cols: ['V_GS', 'I_D_mA'], params: { keep: 0.1 }, origin: false },
  tlm: { cols: ['L_mm', 'R_ohm'], params: { W_mm: 5 }, origin: false },
  diode_temp: { cols: ['T_C', 'V'], params: {}, origin: false },
  proximity: { cols: ['gap_um', 'w_um'], params: {}, origin: true },
  crystal: { cols: ['day', 'mass_g'], params: {}, origin: false },
  fourpoint: { cols: ['I_mA', 'V_mV'], params: {}, origin: true },
  etch: { cols: ['t_s', 'removed_nm'], params: {}, origin: false },
};

/** Measured rows → the (x, y) points of the straight line; untransformable rows are dropped. */
export function transform(model, rows, p = {}) {
  const prm = { ...MODELS[model].params, ...p };
  const xs = [], ys = [];
  let imax = 0;
  if (model === 'mosfet') for (const r of rows) if (r.length > 1 && r[1] === r[1]) imax = Math.max(imax, r[1]);
  for (const r of rows) {
    if (r.some(v => v !== v)) continue;
    let x = null, y = null;
    if (model === 'yield_poisson' && r[1] > 0) { x = r[0]; y = Math.log(r[1]); }
    else if (model === 'moore' && r[1] > 0) { x = r[0]; y = Math.log2(r[1]); }
    else if (model === 'sqrt_t') { x = r[0]; y = r[1] ** 2; }
    else if (model === 'capacitor' && r[1] > 0) { x = r[0] * 1e-4 / (r[1] * 1e-6); y = r[2] * 1e-12; }
    else if (model === 'grating') { x = r[0] * prm.lambda_nm * 1e-9; y = Math.sin(Math.atan2(r[1], prm.L_mm)); }
    else if (model === 'diode' && r[1] > 0) { x = r[0]; y = Math.log(r[1] * 1e-3); }
    else if (model === 'led' && r[0] > 0) { x = 1 / (r[0] * 1e-9); y = r[1]; }
    else if (model === 'mosfet' && r[1] >= prm.keep * imax && r[1] > 0) { x = r[0]; y = Math.sqrt(r[1] * 1e-3); }
    else if (model === 'proximity') { x = r[0]; y = r[1] ** 2; }
    else if (['tlm', 'diode_temp', 'crystal', 'fourpoint', 'etch'].includes(model)) { x = r[0]; y = r[1]; }
    if (x !== null) { xs.push(x); ys.push(y); }
  }
  return [xs, ys];
}

/** Ordinary least squares: a, b, covariance, R² and residuals. */
export function line(xs, ys, origin = false) {
  const n = xs.length, k = origin ? 1 : 2;
  if (n < k + 1) throw new Error(`need at least ${k + 1} points, got ${n}`);
  let a = 0, b, sxx, mx = 0, my = 0;
  if (origin) {
    sxx = xs.reduce((s, x) => s + x * x, 0);
    b = xs.reduce((s, x, i) => s + x * ys[i], 0) / sxx;
  } else {
    mx = xs.reduce((s, x) => s + x, 0) / n; my = ys.reduce((s, y) => s + y, 0) / n;
    sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    if (sxx === 0) throw new Error('all x values are the same');
    b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
    a = my - b * mx;
  }
  const res = xs.map((x, i) => ys[i] - (a + b * x));
  const sse = res.reduce((s, r) => s + r * r, 0), s2 = sse / (n - k);
  let cov, sst;
  if (origin) { cov = [[0, 0], [0, s2 / sxx]]; sst = ys.reduce((s, y) => s + y * y, 0); }
  else { cov = [[s2 * (1 / n + mx * mx / sxx), -s2 * mx / sxx], [-s2 * mx / sxx, s2 / sxx]]; sst = ys.reduce((s, y) => s + (y - my) ** 2, 0); }
  return { a, b, cov, r2: sst > 0 ? 1 - sse / sst : 1, res, n };
}

function derived(model, a, b, p) {
  switch (model) {
    case 'yield_poisson': return { D: -b };
    case 'moore': return { T_years: 1 / b };
    case 'sqrt_t': return { k_mm2_per_min: b, t0_min: -a / b };
    case 'capacitor': return { eps_r: b / EPS0 };
    case 'grating': return { d_um: 1e6 / b };
    case 'diode': { const vt = K_B * p.T_K / Q; return { n: 1 / (b * vt), Is_A: Math.exp(a) }; }
    case 'led': return { h_Js: b * Q / C_LIGHT, V0: a };
    case 'mosfet': return { Vt: -a / b, K_mA_per_V2: b * b * 1e3 };
    case 'tlm': return { Rs_ohm_sq: b * p.W_mm, Rc_ohm: a / 2, LT_mm: a / (2 * b) };
    case 'diode_temp': return { dVdT_mV_per_K: b * 1e3, V_at_0C: a };
    case 'proximity': return { lambda_eff_nm: b * 1e3 };
    case 'crystal': return { rate_g_per_day: b };
    case 'fourpoint': return { Rs_ohm_sq: Math.PI / Math.log(2) * b };
    case 'etch': return { rate_nm_per_min: b * 60, delay_s: -a / b };
  }
  throw new Error(model);
}

/** Fit one experiment's rows: the line, the derived quantities and their standard errors. */
export function fit(model, rows, p = {}) {
  const prm = { ...MODELS[model].params, ...p }, origin = MODELS[model].origin;
  const [xs, ys] = transform(model, rows, prm);
  const L = line(xs, ys, origin), { a, b, cov } = L;
  const out = derived(model, a, b, prm), err = {};
  for (const key of Object.keys(out)) {
    const ha = 1e-6 * (Math.abs(a) || 1), hb = 1e-6 * (Math.abs(b) || 1);
    const ga = origin ? 0 : (derived(model, a + ha, b, prm)[key] - derived(model, a - ha, b, prm)[key]) / (2 * ha);
    const gb = (derived(model, a, b + hb, prm)[key] - derived(model, a, b - hb, prm)[key]) / (2 * hb);
    err[key] = Math.sqrt(Math.max(ga * ga * cov[0][0] + 2 * ga * gb * cov[0][1] + gb * gb * cov[1][1], 0));
  }
  return { ...L, x: xs, y: ys, out, err };
}

/** Shockley-model dV/dT (V/K) of a silicon diode at constant current. */
export const diodeDvdt = (V, T_K, Eg = 1.12) => -(Eg - V) / T_K - 3 * K_B / Q;

export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = rnd => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** Model data (not a measurement): the ideal law at each x times (1 + noise · gaussian). */
export function example(model, xs, T, noise, seed = 1) {
  const rnd = mulberry32(seed);
  return xs.map(x => {
    let y;
    if (model === 'capacitor') {                           // x counts paper sheets between two foils of fixed area
      const t = x * T.t_sheet_um, c = T.eps_r * EPS0 * T.A_cm2 * 1e-4 / (t * 1e-6) * 1e12;
      return [T.A_cm2, t, c * (1 + noise * gauss(rnd))];
    }
    switch (model) {
      case 'yield_poisson': y = Math.exp(-T.D * x); break;
      case 'moore': y = 2 ** ((x - T.year0) / T.T_years) * T.N0; break;
      case 'sqrt_t': y = Math.sqrt(T.k * x); break;
      case 'grating': y = T.L_mm * Math.tan(Math.asin(x * T.lambda_nm * 1e-3 / T.d_um)); break;
      case 'diode': y = T.Is_A * (Math.exp(x / (T.n * K_B * T.T_K / Q)) - 1) * 1e3; break;
      case 'led': y = T.h_Js * C_LIGHT / (x * 1e-9) / Q + T.V0; break;
      case 'mosfet': y = T.K_mA_per_V2 * Math.max(x - T.Vt, 0) ** 2; break;
      case 'tlm': y = 2 * T.Rc_ohm + T.Rs_ohm_sq * x / T.W_mm; break;
      case 'diode_temp': y = T.V_at_0C + T.dVdT * x; break;
      case 'proximity': y = Math.sqrt(T.lambda_um * x); break;
      case 'crystal': y = T.m0 + T.rate * x; break;
      case 'fourpoint': y = T.Rs_ohm_sq * Math.log(2) / Math.PI * x; break;
      case 'etch': y = T.rate_nm_per_s * Math.max(x - T.delay_s, 0); break;
      default: throw new Error(model);
    }
    return [x, y * (1 + noise * gauss(rnd))];
  });
}

/** Parse pasted CSV (comma, semicolon or tab; a header row is skipped) into numeric rows. */
export function parseCSV(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const cells = line.split(/[,;\t]/).map(c => c.trim());
    const nums = cells.map(c => c === '' ? NaN : Number(c));
    if (nums.every(v => v !== v)) continue;                  // a header row
    if (nums.some(v => v !== v) && rows.length === 0 && cells.some(c => /[a-z]/i.test(c))) continue;
    rows.push(nums);
  }
  return rows;
}
