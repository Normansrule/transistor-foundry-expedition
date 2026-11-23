// 3D layer builder: a transistor built step by step as axis-aligned boxes in nanometres.
// Twin of sim/transistor_sim/physics/builder.py (same arithmetic, same order; checked box by box by
// tests/js_parity.mjs). A box is [material, x0, x1, y0, y1, z0, z1, born, died]: x along the channel,
// y across it, z up; born/died are build-step indices (died null = stays).
export const EPS_RATIO = 11.7 / 3.9;   // silicon over SiO2 permittivity; EOT is SiO2-equivalent
export const SUB_D = 20;               // drawn substrate depth below the fins (nm)
export const RAIL_D = 12;              // drawn backside power rail thickness (nm, est.)

export const dims = (a) => Object.fromEntries(Object.entries(a.dims).map(([k, v]) => [k, v[0]]));

// rect minus the union of holes, as non-overlapping rectangles [y0, y1, z0, z1]
export function subtract(rect, holes) {
  const [y0, y1, z0, z1] = rect;
  const zs = [z0, z1];
  for (const h of holes) for (const z of [h[2], h[3]]) if (z0 < z && z < z1 && !zs.includes(z)) zs.push(z);
  zs.sort((a, b) => a - b);
  const out = [];
  let open = new Map();
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    const cov = holes.filter((h) => h[2] < zb && h[3] > za && h[0] < y1 && h[1] > y0)
      .map((h) => [Math.max(h[0], y0), Math.min(h[1], y1)]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const free = []; let y = y0;
    for (const [a, b] of cov) { if (a > y) free.push([y, a]); if (b > y) y = b; }
    if (y < y1) free.push([y, y1]);
    const nxt = new Map();
    for (const f of free) {
      const k = f[0] + ',' + f[1];
      if (open.has(k)) { nxt.set(k, open.get(k)); open.delete(k); } else nxt.set(k, [f, za]);
    }
    for (const [, [f, zstart]] of open) out.push([f[0], f[1], zstart, za]);
    open = nxt;
  }
  for (const [, [f, zstart]] of open) out.push([f[0], f[1], zstart, z1]);
  out.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1] || p[3] - q[3]);
  return out;
}

export function layout(a) {
  const d = dims(a), style = a.style, half = d.lg / 2, X = d.cpp / 2 + d.contact_w / 2;
  const zones = { sdl: [-X, -half - d.spacer], spl: [-half - d.spacer, -half], g: [-half, half], spr: [half, half + d.spacer], sdr: [half + d.spacer, X] };
  const L = { d, style, X, zones };
  if (style === 'planar') {
    L.Y = d.w + 2 * d.sti_w; L.act = [[d.sti_w, d.sti_w + d.w]]; L.floor = 0; L.top = 0;
  } else if (style === 'finfet') {
    const n = Math.trunc(d.nfin), fp = d.fin_pitch, w = d.fin_w;
    L.Y = n * fp;
    L.act = Array.from({ length: n }, (_, i) => [fp * (i + 0.5) - w / 2, fp * (i + 0.5) + w / 2]);
    L.floor = d.subfin; L.top = d.subfin + d.fin_h;
  } else {
    if (style === 'forksheet') {
      const w0 = d.space / 2 + d.sheet_w;
      L.Y = 2 * d.sheet_w + d.wall + d.space; L.act = [[d.space / 2, w0], [w0 + d.wall, w0 + d.wall + d.sheet_w]]; L.wall = [w0, w0 + d.wall];
    } else { L.Y = d.sheet_w + d.space; L.act = [[d.space / 2, d.space / 2 + d.sheet_w]]; }
    let z = d.subfin; const layers = [];
    const tiers = [['n', Math.trunc(d.sheets)]].concat(style === 'cfet' ? [['p', Math.trunc(d.sheets)]] : []);
    tiers.forEach(([tier, ns], ti) => {
      if (ti === 1) { layers.push(['mid', z, z + d.mid, 'm']); z = z + d.mid; }
      for (let k = 0; k < ns; k++) {
        layers.push(['sige', z, z + d.gap, tier]); z = z + d.gap;
        layers.push(['sich', z, z + d.sheet_t, tier]); z = z + d.sheet_t;
      }
    });
    L.layers = layers; L.floor = d.subfin; L.top = z;
  }
  L.gtop = L.top + d.gate_h;
  return L;
}

export function build(a) {
  const L = layout(a), { d, style, X, Y, zones: Z } = L;
  const S = Object.fromEntries(a.steps.map((s, i) => [s, i]));
  const st = (k) => (k in S ? S[k] : null);
  const boxes = [];
  const put = (m, xr, r, born, died = null) => {
    if (r[1] - r[0] > 1e-9 && r[3] - r[2] > 1e-9 && xr[1] - xr[0] > 1e-9) boxes.push([m, xr[0], xr[1], r[0], r[1], r[2], r[3], born, died]);
  };
  const full = [-X, X], sd = [Z.sdl, Z.sdr], spz = [Z.spl, Z.spr], gz = Z.g;
  const flo = L.floor, top = L.top, gtop = L.gtop, tk = d.tk;
  let ctop, wall = [];
  if (style === 'planar') {
    const sdd = d.sti_d, xj = d.xj, [y0, y1] = L.act[0];
    put('si', full, [0, Y, -sdd - SUB_D, -sdd], st('wafer'));
    for (const yr of [[0, y0], [y1, Y]]) {
      put('si', full, [yr[0], yr[1], -sdd, 0], st('wafer'), st('sti'));
      put('sti', full, [yr[0], yr[1], -sdd, 0], st('sti'));
    }
    put('si', full, [y0, y1, -sdd, -xj], st('wafer'));
    for (const xr of [Z.spl, gz, Z.spr]) put('si', xr, [y0, y1, -xj, 0], st('wafer'));
    for (const xr of sd) { put('si', xr, [y0, y1, -xj, 0], st('wafer'), st('sd_implant')); put('n', xr, [y0, y1, -xj, 0], st('sd_implant')); }
    put('poly', gz, [0, Y, 0, gtop], st('dummy'), st('open'));
    for (const xr of spz) put('spacer', xr, [0, Y, 0, gtop], st('spacer'));
    put('highk', gz, [0, Y, 0, tk], st('hkmg'));
    put('metal', gz, [0, Y, tk, gtop], st('hkmg'));
    ctop = 0;
  } else {
    put('si', full, [0, Y, -SUB_D, 0], st('wafer'), st('flip'));
    const fins = L.act.map(([a0, a1]) => [a0, a1]);
    wall = style === 'forksheet' ? [[L.wall[0], L.wall[1], 0, top + 4]] : [];
    for (const r of wall) put('wall', full, r, st('wall'));
    if (style === 'finfet') put('si', full, [0, Y, 0, top], st('wafer'), st('fin'));
    else {
      put('si', full, [0, Y, 0, flo], st('wafer'), st('fin'));
      for (const [m, z0, z1] of L.layers) put(m === 'mid' ? 'sige' : m, full, [0, Y, z0, z1], st('superlattice'), st('fin'));
    }
    for (const f of fins) {
      if (st('bs_contact') !== null) {
        put('si', Z.sdl, [f[0], f[1], 0, flo], st('fin'), st('bs_contact'));
        put('contact', Z.sdl, [f[0], f[1], 0, flo], st('bs_contact'));
        put('si', [Z.spl[0], X], [f[0], f[1], 0, flo], st('fin'));
      } else put('si', full, [f[0], f[1], 0, flo], st('fin'));
    }
    for (const r of subtract([0, Y, 0, flo], fins.map((f) => [f[0], f[1], 0, flo]).concat(wall.map((w) => [w[0], w[1], 0, flo])))) put('sti', full, r, st('sti'));
    const sdStep = style === 'finfet' || style === 'gaa' || style === 'forksheet' ? st('sd_epi') : st('sd_bottom');
    for (const f of fins) {
      if (style === 'finfet') {
        for (const xr of sd) put('sich', xr, [f[0], f[1], flo, top], st('fin'), sdStep);
        for (const xr of [...spz, gz]) put('sich', xr, [f[0], f[1], flo, top], st('fin'));
      } else {
        for (const [m, z0, z1] of L.layers) {
          const r = [f[0], f[1], z0, z1];
          for (const xr of sd) put(m === 'mid' ? 'sige' : m, xr, r, st('fin'), sdStep);
          if (m === 'sich') { for (const xr of [...spz, gz]) put('sich', xr, r, st('fin')); }
          else {
            for (const xr of spz) { put('sige', xr, r, st('fin'), st('inner')); put('ispacer', xr, r, st('inner')); }
            put('sige', gz, r, st('fin'), st('release'));
          }
        }
      }
    }
    const body = fins.map((f) => [f[0], f[1], flo, top]);
    for (const r of subtract([0, Y, flo, gtop], body.concat(wall.map((w) => [w[0], w[1], flo, w[3]])))) {
      put('poly', gz, r, st('dummy'), st('open'));
      for (const xr of spz) put('spacer', xr, r, st('spacer'));
    }
    const a0 = fins[0][0], a1 = fins[fins.length - 1][1];
    if (style === 'finfet') {
      const e = d.fin_w / 2; ctop = top + 5;
      for (const xr of sd) put('n', xr, [a0 - e, a1 + e, flo, ctop], st('sd_epi'));
    } else if (style === 'gaa') {
      ctop = top + 3;
      for (const xr of sd) put('n', xr, [a0 - 3, a1 + 3, flo, ctop], st('sd_epi'));
    } else if (style === 'forksheet') {
      ctop = top + 3;
      for (const xr of sd) { put('n', xr, [a0 - 3, L.wall[0], flo, ctop], st('sd_epi')); put('p', xr, [L.wall[1], a1 + 3, flo, ctop], st('sd_epi')); }
    } else {
      const mid = L.layers.find((ly) => ly[0] === 'mid');
      const ptop = L.layers.find((ly) => ly[3] === 'p' && ly[0] === 'sich');
      const zb = mid[1] + 4, zi = ptop[1] - 4;
      ctop = top + 3;
      for (const xr of sd) {
        put('n', xr, [a0 - 3, a1 + 3, flo, zb], st('sd_bottom'));
        put('oxide', xr, [a0 - 3, a1 + 3, zb, zi], st('sd_iso'));
        put('p', xr, [a0 - 3, a1 + 3, zi, ctop], st('sd_top'));
      }
    }
    const chan = style === 'finfet' ? fins.map((f) => [f[0], f[1], flo, top])
      : fins.flatMap((f) => L.layers.filter((ly) => ly[0] === 'sich').map(([, z0, z1]) => [f[0], f[1], z0, z1]));
    const grown = chan.map((c) => [c[0] - tk, c[1] + tk, Math.max(flo, c[2] - tk), c[3] + tk]).concat([[0, Y, flo, flo + tk]]);
    const wz = wall.map((w) => [w[0], w[1], flo, w[3]]);
    const metal = subtract([0, Y, flo, gtop], grown.concat(wz));
    for (const r of metal) put('metal', gz, r, st('hkmg'));
    for (const r of subtract([0, Y, flo, gtop], metal.concat(chan, wz))) put('highk', gz, r, st('hkmg'));
  }
  const a0 = L.act[0][0], a1 = L.act[L.act.length - 1][1], cw = d.contact_w;
  const ys = style === 'forksheet' ? [[a0, L.wall[0]], [L.wall[1], a1]] : [[a0, a1]];
  const ends = st('bs_contact') !== null ? [[X - cw, X]] : [[-X, -X + cw], [X - cw, X]];
  for (const xr of ends) for (const y of ys) put('contact', xr, [y[0], y[1], ctop, gtop], st('contact'));
  if (st('bs_rail') !== null) put('rail', [-X, X], [0, L.Y, -RAIL_D, 0], st('bs_rail'));
  return boxes;
}

export const alive = (boxes, step) => boxes.filter((b) => b[7] <= step && (b[8] === null || b[8] > step));

export function metrics(a) {
  const L = layout(a), d = L.d, style = a.style;
  let sides, weff, lam;
  if (style === 'planar') { sides = 1; weff = d.w; lam = null; }
  else if (style === 'finfet') { sides = 3; weff = d.nfin * (2 * d.fin_h + d.fin_w); lam = Math.sqrt(EPS_RATIO * d.fin_w * d.eot / 2); }
  else if (style === 'forksheet') { sides = 3; weff = d.sheets * (2 * d.sheet_w + d.sheet_t); lam = Math.sqrt(EPS_RATIO * d.sheet_t * d.eot / 2); }
  else { sides = 4; weff = d.sheets * 2 * (d.sheet_w + d.sheet_t); lam = Math.sqrt(EPS_RATIO * d.sheet_t * d.eot / 2); }
  const pairW = L.Y * (style === 'cfet' || style === 'forksheet' ? 1 : 2);
  return {
    sides, weff_nm: weff, cell_w_nm: L.Y, weff_per_w: weff / L.Y, pair_w_nm: pairW, pair_weff_per_w: 2 * weff / pairW,
    lam_nm: lam, lg_over_lam: lam === null ? null : d.lg / lam, pair_area_nm2: d.cpp * pairW, steps: a.steps.length, height_nm: L.gtop,
  };
}
