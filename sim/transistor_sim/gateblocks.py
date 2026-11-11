"""Two classic blocks in silicon, drawn by the same rules as the single gates in gatecells.py:

* the 28-transistor mirror full adder (Weste & Harris 2010): a carry stage whose pull-up is the
  same series/parallel network as its pull-down (the majority function is self-dual), a sum stage
  built the same way, and two output inverters. Each stage is one strip of shared diffusion found
  by an Euler-path search, the stages sit side by side separated by a diffusion break, and the
  inputs reach their gate fingers over metal-2 tracks;
* the six-transistor SRAM bit cell: two cross-coupled inverters and two access transistors on
  one word line, with a cell ratio of 2 (pull-down twice as wide as the access transistor) as in
  the Circuit Lab's SRAM model (physics/sram.py).

Both are teaching drawings on the same λ grid and gridded pitches as gatecells.TECHS. Real
full adders come from cell libraries, and real SRAM arrays use special "pushed" design rules: the
TSMC N5 high-density cell is 0.021 µm² (Yeap et al. 2019), far smaller than a logic-rule drawing.
"""
from __future__ import annotations

from itertools import permutations, product

from .physics import logic

GAMMA = logic.GAMMA

# ---------- full adder ----------
MAJ = ("p", ("s", "A", "B"), ("s", "C", ("p", "A", "B")))           # carry: K̄ = NOT maj(A, B, C)
SUM = ("p", ("s", "A", "B", "C"), ("s", "Kb", ("p", "A", "B", "C")))   # S̄ = ABC + K̄(A + B + C)
FA_STAGES = [
    dict(name="carry", out="Kb", pd=MAJ, pu=MAJ, mirror=True),
    dict(name="sum", out="Sb", pd=SUM, pu=SUM, mirror=True),
    dict(name="carry out", out="Co", pd="Kb", pu="Kb", mirror=False),
    dict(name="sum out", out="S", pd="Sb", pu="Sb", mirror=False),
]
FA_INPUTS = ["A", "B", "C"]
FA_OUTPUTS = ["S", "Co"]


def _conducts(e, val):
    return logic.conducts(e, val)


def eval_stages(stages, val: dict) -> dict:
    """Evaluate the stages in order; each output is NOT (pull-down conducts)."""
    v = dict(val)
    for st in stages:
        v[st["out"]] = 0 if _conducts(st["pd"], v) else 1
    return v


def fa_truth() -> list:
    rows = []
    for bits in product((0, 1), repeat=3):
        v = eval_stages(FA_STAGES, dict(zip(FA_INPUTS, bits)))
        rows.append([list(bits), [v["S"], v["Co"]]])
    return rows


def _devices(stage: dict, typ: str) -> list:
    """[(signal, a, b, width)] for one network of a stage, sized by logical effort (unit nFET = 1).

    The pull-down runs out -> gnd. The pull-up runs vdd -> out; for a mirror stage it has the same
    topology as the pull-down, otherwise it is the dual."""
    e = stage["pd"] if typ == "n" else (stage["pu"] if stage["mirror"] else logic.dual(stage["pd"]))
    top, bot = (stage["out"], "gnd") if typ == "n" else ("vdd", stage["out"])
    out, count = [], [0]

    def build(x, a, b, budget):
        if isinstance(x, str):
            out.append((x, a, b, (GAMMA if typ == "p" else 1.0) / budget))
            return
        kids = x[1:]
        if x[0] == "p":
            for c in kids:
                build(c, a, b, budget)
            return
        nodes = [a]
        for _ in kids[:-1]:
            count[0] += 1
            nodes.append(f"{stage['out']}.{typ}{count[0]}")
        nodes.append(b)
        for i, c in enumerate(kids):
            build(c, nodes[i], nodes[i + 1], budget / len(kids))

    build(e, top, bot, 1.0)
    return out


def _chains(order, devs):
    """All (node sequence, device indices) placing the devices on one unbroken strip in this order."""
    res = []

    def go(i, seq, used):
        if i == len(order):
            res.append((list(seq), list(used)))
            return
        for j, (s, a, b, _) in enumerate(devs):
            if j in used or s != order[i]:
                continue
            ends = [(a, b), (b, a)] if i == 0 else ([(a, b)] if a == seq[-1] else [(b, a)] if b == seq[-1] else [])
            for x, y in ends:
                go(i + 1, (seq if i else [x]) + [y], used + [j])

    go(0, [], [])
    return res


def _role(node, seq, out):
    if node in ("vdd", "gnd"):
        return "rail"
    if node == out:
        return "out"
    return "link" if seq.count(node) > 1 else "internal"


def stage_strip(stage: dict) -> dict:
    """Finger order shared by both strips of a stage, with the fewest straps and contacts."""
    dn, dp = _devices(stage, "n"), _devices(stage, "p")
    best = None
    for order in sorted(set(permutations([d[0] for d in dn]))):
        for sn, un in _chains(order, dn):
            for sp, up in _chains(order, dp):
                roles = [_role(x, sn, stage["out"]) for x in sn] + [_role(x, sp, stage["out"]) for x in sp]
                score = (10 * roles.count("link") + sum(r != "internal" for r in roles), sn[0] != "gnd", sp[0] != "vdd")
                if best is None or score < best[0]:
                    best = (score, list(order), sn, sp, [dn[j][3] for j in un], [dp[j][3] for j in up])
    if best is None:
        raise ValueError(f"stage {stage['name']}: no unbroken strip")
    _, order, sn, sp, wn, wp = best
    return dict(order=order, n=sn, p=sp, wn=wn, wp=wp, out=stage["out"])


def fa_strips() -> list:
    return [stage_strip(s) for s in FA_STAGES]


def _regions(strips, typ):
    out = []
    for k, st in enumerate(strips):
        if k:
            out.append(dict(kind="break"))
        seq = st[typ]
        for i, node in enumerate(seq):
            out.append(dict(kind="sd", role=_role(node, seq, st["out"]), node=node))
            if i < len(st["order"]):
                out.append(dict(kind="gate", input=st["order"][i], w=(st["wn"] if typ == "n" else st["wp"])[i]))
    return out


# ---------- layout geometry shared by both blocks ----------
class _Grid:
    """Positions along x and y for a planar (λ) or gridded (nm) cell."""

    def __init__(self, t):
        self.planar = t["style"] == "planar"
        if self.planar:
            self.P, self.G, self.R, self.u = 8.0, 2.0, 6.0, t["lam"]
            self.rail, self.m, self.track = 4.0, 3.0, 5.0
        else:
            self.P, self.G, self.u = t["cpp"], t["lg"], 1.0
            self.R = self.P - self.G
            self.rail, self.m, self.track = 1.5 * t["mmp"], 0.5 * t["mmp"], t["mmp"]
        self.t = t

    def region_c(self, x0, i):
        return x0 + (self.R / 2 + i * self.P if self.planar else (i + 0.5) * self.P)

    def finger_c(self, x0, k):
        return x0 + (self.R + self.G / 2 + k * self.P if self.planar else (k + 1) * self.P)

    def stage_end(self, x0, n):
        return x0 + (n * self.P + self.R if self.planar else (n + 1) * self.P)


def _strip_y(grid, wmax_n, wmax_p, gap):
    t = grid.t
    if grid.planar:
        yn0 = 7.0
        yn1 = yn0 + 4 * wmax_n
        yp0 = yn1 + gap
        yp1 = yp0 + 4 * wmax_p
        top = yp1 + 7
    else:
        fp, nf = t["fin_pitch"], t.get("fins", 1)
        h = (nf - 1) * fp + 0.25 * fp if t["style"] == "finfet" else t.get("sheet_w", 1.5 * fp)
        yn0 = grid.rail + t["mmp"]
        yn1 = yn0 + h
        yp0 = yn1 + gap
        yp1 = yp0 + h
        top = yp1 + t["mmp"] + grid.rail
    return yn0, yn1, yp0, yp1, top


def _diffusion(S, grid, typ, x0, n, widths, ya_strip, yb_strip):
    """Active (planar, stepped by device width), fins or sheets (gridded) for one stage strip."""
    t = grid.t
    if grid.planar:
        def span(w):
            return (ya_strip, ya_strip + 4 * w) if typ == "n" else (yb_strip - 4 * w, yb_strip)
        for i in range(n + 1):
            w = max(widths[j] for j in (i - 1, i) if 0 <= j < n)
            a, b = span(w)
            xc = grid.region_c(x0, i)
            S.append(("active", xc - grid.R / 2, a, xc + grid.R / 2, b))
        for k in range(n):
            a, b = span(widths[k])
            xc = grid.finger_c(x0, k)
            S.append(("active", xc - grid.G / 2, a, xc + grid.G / 2, b))
        return span
    xa, xb = x0 + 0.15 * grid.P, grid.stage_end(x0, n) - 0.15 * grid.P
    if t["style"] == "finfet":
        fp = t["fin_pitch"]
        for k in range(t.get("fins", 1)):
            y = ya_strip + k * fp
            S.append(("fin", xa, y, xb, y + 0.25 * fp))
    else:
        S.append(("active", xa, ya_strip, xb, yb_strip))
    return lambda w: (ya_strip, yb_strip)


def _contacts(S, grid, xc, a, b):
    if grid.planar:
        y = a + 1
        while y + 2 <= b - 1:
            S.append(("contact", xc - 1, y, xc + 1, y + 2))
            y += 4
    else:
        S.append(("contact", xc - 0.18 * grid.P, a - 0.05 * grid.t["fin_pitch"], xc + 0.18 * grid.P, b + 0.05 * grid.t["fin_pitch"]))


def _poly_pad(S, grid, x, y):
    """Gate contact: a poly landing pad, a contact and a metal-1 pad, then a via up to metal 2."""
    if grid.planar:
        S += [("poly", x - 1.5, y - 2, x + 1.5, y + 2), ("contact", x - 1, y - 1, x + 1, y + 1), ("metal1", x - 1.5, y - 2, x + 1.5, y + 2)]
    else:
        h = 0.25 * grid.t["mmp"]
        S += [("contact", x - grid.G / 2, y - h, x + grid.G / 2, y + h), ("metal1", x - 0.12 * grid.P, y - h, x + 0.12 * grid.P, y + h)]


def _via(S, grid, x, y):
    s = 1.0 if grid.planar else 0.2 * grid.t["mmp"]
    S.append(("via", x - s, y - s, x + s, y + s))


def _m2(S, grid, xa, xb, y):
    h = 1.5 if grid.planar else 0.25 * grid.t["mmp"]
    S.append(("metal2", xa - h, y - h, xb + h, y + h))


def _m1w(grid):
    return 2.0 if grid.planar else 0.12 * grid.P


def fa_cell(t: dict) -> dict:
    grid = _Grid(t)
    strips = fa_strips()
    nets = ["A", "B", "C", "Kb", "Sb"]                  # metal-2 input tracks, bottom to top
    T = len(nets)
    wn = max(max(s["wn"]) for s in strips)
    wp = max(max(s["wp"]) for s in strips)
    gap = (14 + 5 * T) if grid.planar else (T + 3.5) * t["mmp"]
    yn0, yn1, yp0, yp1, top = _strip_y(grid, wn, wp, gap)
    track_y = {net: (yn1 + 10 + 5 * k) if grid.planar else (yn1 + (1.75 + k) * t["mmp"]) for k, net in enumerate(nets)}
    bus_n = (yn1 + 2, yn1 + 5) if grid.planar else (yn1 + 0.5 * t["mmp"], yn1 + t["mmp"])
    bus_p = (yp0 - 5, yp0 - 2) if grid.planar else (yp0 - t["mmp"], yp0 - 0.5 * t["mmp"])
    S, fingers, outs, conn = [], [], {}, {}
    left = 10.0 if grid.planar else grid.P      # room for the input pins on the left
    x0 = left
    m1 = _m1w(grid)
    for st in strips:
        n = len(st["order"])
        end = grid.stage_end(x0, n)
        span_n = _diffusion(S, grid, "n", x0, n, st["wn"], yn0, yn1)
        span_p = _diffusion(S, grid, "p", x0, n, st["wp"], yp0, yp1)
        xconn = end + 5 if grid.planar else end
        conn[st["out"]] = xconn
        for k, sig in enumerate(st["order"]):
            xf = grid.finger_c(x0, k)
            S.append(("poly", xf - grid.G / 2, yn0 - 2 if grid.planar else grid.rail * 0.6, xf + grid.G / 2, yp1 + 2 if grid.planar else top - grid.rail * 0.6))
            _poly_pad(S, grid, xf, track_y[sig])
            _via(S, grid, xf, track_y[sig])
            fingers.append([round(xf * grid.u, 3), sig])
        if not grid.planar:                     # dummy gates at both stage edges (diffusion breaks)
            for xd in (x0, end):
                S.append(("poly", xd - grid.G / 2, grid.rail * 0.6, xd + grid.G / 2, top - grid.rail * 0.6))
        for typ, (ya, yb), bus, rail_y, span in (("n", (yn0, yn1), bus_n, (0, grid.rail), span_n), ("p", (yp0, yp1), bus_p, (top - grid.rail, top), span_p)):
            seq, widths = st[typ], st["wn"] if typ == "n" else st["wp"]
            out_x, links = [], {}
            for i, node in enumerate(seq):
                role = _role(node, seq, st["out"])
                if role == "internal":
                    continue
                w = max(widths[j] for j in (i - 1, i) if 0 <= j < n)
                a, b = span(w)
                xc = grid.region_c(x0, i)
                _contacts(S, grid, xc, a, b)
                if role == "rail":
                    S.append(("metal1", xc - m1, rail_y[0], xc + m1, b) if typ == "n" else ("metal1", xc - m1, a, xc + m1, rail_y[1]))
                elif role == "out":
                    S.append(("metal1", xc - m1, a, xc + m1, bus[1]) if typ == "n" else ("metal1", xc - m1, bus[0], xc + m1, b))
                    out_x.append(xc)
                else:
                    S.append(("metal1", xc - m1, a, xc + m1, b))
                    links.setdefault(node, []).append((xc, a, b))
            for k, (node, xs) in enumerate(sorted(links.items())):
                a = max(p[1] for p in xs)
                b = min(p[2] for p in xs)
                ym = (a + 2 + 3 * k) if (grid.planar and typ == "n") else (b - 2 - 3 * k) if grid.planar else (a + b) / 2 + (k - 0.5 * (len(links) - 1)) * 0.6 * t["mmp"]
                for xc, _, _ in xs:
                    _via(S, grid, xc, ym)
                _m2(S, grid, min(p[0] for p in xs), max(p[0] for p in xs), ym)
            S.append(("metal1", min(out_x) - m1, bus[0], xconn + m1, bus[1]))
        S.append(("metal1", xconn - m1, bus_n[0], xconn + m1, bus_p[1]))
        x0 = end + 12 if grid.planar else end
    width = (x0 - 12 + 10) if grid.planar else x0 + grid.P
    # inputs to the left end of their tracks; internal nets K̄, S̄ start at the stage that drives them
    pins = {}
    for net in nets:
        xs = [f[0] / grid.u for f in fingers if f[1] == net]
        if net in conn:
            xs.append(conn[net])
            _via(S, grid, conn[net], track_y[net])
            _m2(S, grid, min(xs), max(xs), track_y[net])
        else:
            _m2(S, grid, left * 0.4, max(xs), track_y[net])
            pins[net] = [round(left * 0.4 * grid.u, 3), round(track_y[net] * grid.u, 3)]
    for o in ("Co", "S"):
        outs[o] = [round(conn[o] * grid.u, 3), round((bus_n[1] + track_y["A"]) / 2 * grid.u, 3)]
    S += [("nwell", 0, yp0 - (5 if grid.planar else 0.6 * t["mmp"]), width, top), ("metal1", 0, 0, width, grid.rail), ("metal1", 0, top - grid.rail, width, top)]
    if grid.planar:
        S += [("pselect", left - 2, yp0 - 2, width - 8, yp1 + 2), ("nselect", left - 2, yn0 - 2, width - 8, yn1 + 2)]
    u = grid.u
    shapes = [(l, a * u, b * u, c * u, d * u) for l, a, b, c, d in S]
    f0 = grid.finger_c(left, 0)
    if grid.planar:
        dims = [
            dict(label=f"L = 2λ = {2 * u:.0f} nm", axis="x", at=yp1 + 4, a=f0 - 1, b=f0 + 1, ref="mead1980"),
            dict(label=f"gate pitch {grid.P:.0f}λ", axis="x", at=yn0 - 4.5, a=f0, b=f0 + grid.P, ref="mead1980"),
            dict(label="diffusion break 12λ", axis="x", at=yn0 - 4.5,
                 a=grid.stage_end(left, len(strips[0]["order"])), b=grid.stage_end(left, len(strips[0]["order"])) + 12, ref="mead1980"),
            dict(label=f"metal-2 track pitch {grid.track:.0f}λ", axis="y", at=left * 0.4 - 1.5, a=track_y["A"], b=track_y["B"], ref="mead1980"),
            dict(label=f"cell height {top * u / 1000:.2f} µm", axis="y", at=-3, a=0, b=top, ref=None),
        ]
    else:
        ref = t["refs"]
        dims = [
            dict(label=f"gate pitch {grid.P:.0f} nm", axis="x", at=top + 0.6 * t["mmp"], a=f0, b=f0 + grid.P, ref=ref["cpp"]),
            dict(label=f"Lg {grid.G:.0f} nm", axis="x", at=-0.6 * t["mmp"], a=f0 - grid.G / 2, b=f0 + grid.G / 2, ref=ref["lg"]),
            dict(label=f"metal pitch {t['mmp']:.0f} nm", axis="y", at=left * 0.4 - 0.4 * t["mmp"], a=track_y["A"], b=track_y["B"], ref=ref["mmp"]),
            dict(label=f"cell height {top:.0f} nm", axis="y", at=-0.5 * t["mmp"], a=0, b=top, ref=None),
        ]
        dims = [dict(d, label=d["label"] + " (est.)") if d["ref"] is None and not d["label"].startswith("cell") else d for d in dims]
    dims = [dict(d, at=round(d["at"] * u, 3), a=round(d["a"] * u, 3), b=round(d["b"] * u, 3)) for d in dims]
    return dict(shapes=shapes, w=width * u, h=top * u, pins=pins, outs=outs, fingers=fingers,
                cut={"n": (yn0 + 2 if grid.planar else (yn0 + yn1) / 2) * u, "p": (yp1 - 2 if grid.planar else (yp0 + yp1) / 2) * u}, dims=dims, units="nm")


# ---------- 6T SRAM ----------
SRAM_N = dict(order=["WL", "QB", "Q", "WL"], nodes=["BL", "Q", "gnd", "QB", "BLB"], w=[1, 2, 2, 1])    # PG1 PD1 PD2 PG2
SRAM_P = dict(first=1, order=["QB", "Q"], nodes=["Q", "vdd", "QB"], w=[1, 1])                           # PU1 PU2
SRAM_INPUTS = ["WL", "Q"]
SRAM_OUTPUTS = ["QB", "BLd", "BLBd"]


def sram_truth() -> list:
    """WL and the stored bit Q -> Q̄, and which bit line a read pulls down (both precharged high)."""
    rows = []
    for wl, q in product((0, 1), repeat=2):
        rows.append([[wl, q], [1 - q, int(wl and q == 0), int(wl and q == 1)]])
    return rows


def _sram_role(node):
    return "rail" if node in ("vdd", "gnd") else "bitline" if node.startswith("BL") else "storage"


def sram_regions(typ: str) -> list:
    spec = SRAM_N if typ == "n" else SRAM_P
    out = []
    for i, node in enumerate(spec["nodes"]):
        out.append(dict(kind="sd", role=_sram_role(node), node=node))
        if i < len(spec["order"]):
            out.append(dict(kind="gate", input=spec["order"][i], w=spec["w"][i]))
    return out


def sram_cell(t: dict) -> dict:
    t = dict(t, fins=1)                        # high-density bit cells use one fin per transistor
    grid = _Grid(t)
    planar = grid.planar
    mmp = t.get("mmp", 0)
    S = []
    x0 = 4.0 if planar else 0.0
    wl_y = 6.0 if planar else grid.rail + 0.5 * mmp
    if planar:
        yn0 = 10.0
        yn1 = yn0 + 4 * max(SRAM_N["w"])
        yj = (yn1 + 4, yn1 + 9)               # cross-couple jumpers (Q, then Q̄)
        yp0 = yn1 + 14
        yp1 = yp0 + 4 * max(SRAM_P["w"])
        top = yp1 + 7
    else:
        yn0 = grid.rail + 1.5 * mmp
        h = 0.25 * t["fin_pitch"] if t["style"] == "finfet" else t.get("sheet_w", 1.5 * t["fin_pitch"]) * 0.6
        yn1 = yn0 + h
        yj = (yn1 + 1.0 * mmp, yn1 + 2.0 * mmp)
        yp0 = yn1 + 3.0 * mmp
        yp1 = yp0 + h
        top = yp1 + mmp + grid.rail
    m1 = 1.5 if planar else _m1w(grid)
    width = grid.region_c(x0, 4) + (grid.R / 2 + 4 if planar else 0.5 * grid.P)
    # diffusion
    if planar:
        _diffusion(S, grid, "n", x0, 4, SRAM_N["w"], yn0, yn1)
        x1 = x0 + grid.P                       # p strip starts under region 1
        _diffusion(S, grid, "p", x1, 2, SRAM_P["w"], yp0, yp1)
    else:
        _diffusion(S, grid, "n", x0, 4, SRAM_N["w"], yn0, yn1)
        _diffusion(S, grid, "p", x0 + grid.P, 2, SRAM_P["w"], yp0, yp1)
    xr = [grid.region_c(x0, i) for i in range(5)]
    xf = [grid.finger_c(x0, k) for k in range(4)]
    fingers = []
    # gates: the access transistors cross only the nMOS strip; the inverter gates cross both
    for k, sig in enumerate(SRAM_N["order"]):
        if sig == "WL":
            ya, yb = (wl_y - 1, yn1 + 2) if planar else (grid.rail * 0.6, yn1 + 0.5 * mmp)
        else:
            ya, yb = (yn0 - 2, yp1 + 2) if planar else (grid.rail * 0.6, top - grid.rail * 0.6)
        S.append(("poly", xf[k] - grid.G / 2, ya, xf[k] + grid.G / 2, yb))
        fingers.append([round(xf[k] * grid.u, 3), sig])
    if planar:                                 # the word line: one poly bar, edge to edge so it runs on into the next cell
        S.append(("poly", 0, wl_y - 1, width, wl_y + 1))
    else:                                      # gridded poly runs one way only: the word line is metal 2
        for k in (0, 3):
            _poly_pad(S, grid, xf[k], wl_y)
            _via(S, grid, xf[k], wl_y)
        _m2(S, grid, 0, width, wl_y)
        for xd in (x0, grid.stage_end(x0, 4)):
            S.append(("poly", xd - grid.G / 2, grid.rail * 0.6, xd + grid.G / 2, top - grid.rail * 0.6))
    # source/drain contacts and wiring
    def n_span(i):
        w = max(SRAM_N["w"][j] for j in (i - 1, i) if 0 <= j < 4)
        return (yn0, yn0 + 4 * w) if planar else (yn0, yn1)
    p_span = (yp0, yp1)
    for i, node in enumerate(SRAM_N["nodes"]):
        a, b = n_span(i)
        _contacts(S, grid, xr[i], a, b)
        if node == "gnd":
            S.append(("metal1", xr[i] - m1, 0, xr[i] + m1, b))
        elif node.startswith("BL"):            # bit lines: vertical metal 2 through the whole cell
            if planar:                         # metal-1 pad, via, metal-2 bit line over the full cell height
                S.append(("metal1", xr[i] - m1, a, xr[i] + m1, b))
                _via(S, grid, xr[i], (a + b) / 2)
                S.append(("metal2", xr[i] - 1.5, 0, xr[i] + 1.5, top))
            else:                              # gridded: bit lines in metal 1, word line in metal 2
                S.append(("metal1", xr[i] - m1, 0, xr[i] + m1, top))
    for i, node in enumerate(SRAM_P["nodes"]):
        xc = xr[i + 1]
        _contacts(S, grid, xc, *p_span)
        if node == "vdd":
            S.append(("metal1", xc - m1, yp0, xc + m1, top))
    # storage nodes: metal 1 joins the nMOS and pMOS regions, then a jumper reaches the opposite gate
    for xc, yjump, xg in ((xr[1], yj[0], xf[2]), (xr[3], yj[1], xf[1])):
        a, _ = n_span(1)
        S.append(("metal1", xc - m1, a, xc + m1, yp1))
        _poly_pad(S, grid, xg, yjump)
        hj = 1.5 if planar else 0.25 * mmp
        S.append(("metal1", min(xc, xg) - m1, yjump - hj, max(xc, xg) + m1, yjump + hj))
    S.append(("nwell", 0, yp0 - (5 if planar else 0.6 * mmp), width, top))
    if planar:                                 # rails in metal 1 along the top and bottom edges, shared with the next row
        S += [("metal1", 0, 0, width, grid.rail), ("metal1", 0, top - grid.rail, width, top)]
    else:                                      # the bit lines own metal 1 from edge to edge, so the rails move up to metal 2
        S += [("metal2", 0, grid.rail * 0.15, width, grid.rail * 0.85), ("metal2", 0, top - grid.rail * 0.85, width, top - grid.rail * 0.15)]
        _via(S, grid, xr[2], grid.rail / 2)
        _via(S, grid, xr[2], top - grid.rail / 2)
    if planar:
        S += [("pselect", x0 + grid.P - 2, yp0 - 2, grid.stage_end(x0 + grid.P, 2) + 2, yp1 + 2), ("nselect", x0 - 2, yn0 - 2, grid.stage_end(x0, 4) + 2, yn1 + 2)]
    u = grid.u
    pins = {"WL": [round(xf[0] * u, 3), round(wl_y * u, 3)]}
    outs = {"BL": [round(xr[0] * u, 3), round((yp0 + yn1) / 2 * u, 3)], "BLB": [round(xr[4] * u, 3), round((yp0 + yn1) / 2 * u, 3)]}
    if planar:
        dims = [
            dict(label="access W = 4λ", axis="y", at=xf[0] - 2.2, a=yn0, b=yn0 + 4, ref="seevinck1987"),
            dict(label="pull-down W = 8λ (cell ratio 2)", axis="y", at=xf[1] - 2.2, a=yn0, b=yn0 + 8, ref="seevinck1987"),
            dict(label=f"L = 2λ = {2 * u:.0f} nm", axis="x", at=yp1 + 4, a=xf[1] - 1, b=xf[1] + 1, ref="mead1980"),
            dict(label=f"cell {width * u / 1000:.2f} × {top * u / 1000:.2f} µm", axis="y", at=-3, a=0, b=top, ref=None),
        ]
    else:
        ref = t["refs"]
        dims = [
            dict(label=f"gate pitch {grid.P:.0f} nm", axis="x", at=top + 0.6 * mmp, a=xf[1], b=xf[2], ref=ref["cpp"]),
            dict(label=f"Lg {grid.G:.0f} nm", axis="x", at=-0.6 * mmp, a=xf[1] - grid.G / 2, b=xf[1] + grid.G / 2, ref=ref["lg"]),
            dict(label=f"cell {width * u / 1000:.3f} × {top * u / 1000:.3f} µm", axis="y", at=-0.5 * mmp, a=0, b=top, ref=None),
        ]
        dims = [dict(d, label=d["label"] + " (est.)") if d["ref"] is None and not d["label"].startswith("cell") else d for d in dims]
    dims = [dict(d, at=round(d["at"] * u, 3), a=round(d["a"] * u, 3), b=round(d["b"] * u, 3)) for d in dims]
    return dict(shapes=[(l, a * u, b * u, c * u, d * u) for l, a, b, c, d in S], w=width * u, h=top * u, pins=pins, outs=outs,
                fingers=fingers, cut={"n": (yn0 + 2 if planar else (yn0 + yn1) / 2) * u, "p": (yp0 + yp1) / 2 * u}, dims=dims, units="nm")


def _expr(e):
    return e if isinstance(e, str) else [e[0], *(_expr(c) for c in e[1:])]


ARRAY_BITS = 4                                 # a 4-bit adder and a 4 × 4 bit SRAM array


def ripple(a: list, b: list, cin: int = 0) -> tuple:
    """Ripple-carry addition through the transistor stages, bit 0 first: (sum bits, carries C0..Cn)."""
    s, carry = [], [cin]
    for ai, bi in zip(a, b):
        v = eval_stages(FA_STAGES, {"A": ai, "B": bi, "C": carry[-1]})
        s.append(v["S"])
        carry.append(v["Co"])
    return s, carry


def fa_array(cell: dict, n: int = ARRAY_BITS) -> dict:
    """n adder cells side by side. Each carry-out runs on metal 3 (drawn over the cells) to the next cell's
    carry-in track, so the carry ripples from bit 0 on the left to bit n-1 on the right."""
    w, h = cell["w"], cell["h"]
    (xo, yo), (xc, yc) = cell["outs"]["Co"], cell["pins"]["C"]
    routes = [[[round(i * w + xo, 3), round(yo, 3)], [round(i * w + xo, 3), round(yc, 3)], [round((i + 1) * w + xc, 3), round(yc, 3)]] for i in range(n - 1)]
    return dict(nx=n, ny=1, mirror_y=False, px=w, py=h, w=round(n * w, 3), h=h, routes=routes, route_layer="metal 3")


def sram_array(cell: dict, n: int = ARRAY_BITS) -> dict:
    """n × n bit cells. Every other row is mirrored top to bottom, so neighbouring rows share a power rail;
    the word line runs along each row and the bit-line pair down each column, through every cell."""
    w, h = cell["w"], cell["h"]
    a_um2 = w * h / 1e6
    return dict(nx=n, ny=n, mirror_y=True, px=w, py=h, w=round(n * w, 3), h=round(n * h, 3), routes=[],
                bit_um2=round(a_um2, 5), mbit_per_mm2=round(1 / a_um2, 3))


def export(techs: dict) -> dict:
    strips = fa_strips()
    fa = dict(
        name="Full adder", kind="fa", inputs=FA_INPUTS, outputs=FA_OUTPUTS, truth=fa_truth(),
        stages=[dict(name=s["name"], out=s["out"], pd=_expr(s["pd"]), pu=_expr(s["pu"] if s["mirror"] else logic.dual(s["pd"])), mirror=s["mirror"]) for s in FA_STAGES],
        order=[sig for st in strips for sig in st["order"]],
        regions={typ: _regions(strips, typ) for typ in ("n", "p")},
        effort=dict(n=sum(len(_devices(s, t)) for s in FA_STAGES for t in ("n", "p"))),
        cells={k: fa_cell(t) for k, t in techs.items()},
    )
    sram = dict(
        name="6T SRAM cell", kind="sram", inputs=SRAM_INPUTS, outputs=SRAM_OUTPUTS, truth=sram_truth(),
        order=list(SRAM_N["order"]), regions={"n": sram_regions("n"), "p": sram_regions("p")}, p_first=SRAM_P["first"],
        effort=dict(n=6), cells={k: sram_cell(t) for k, t in techs.items()},
    )
    for k in fa["cells"]:
        fa["cells"][k]["array"] = fa_array(fa["cells"][k])
        sram["cells"][k]["array"] = sram_array(sram["cells"][k])
    return {"fa": fa, "sram6t": sram}
