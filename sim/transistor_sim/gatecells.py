"""Logic gates in silicon: from a gate's series/parallel netlist to a mask layout and a cut-line
cross-section, for three technologies.

The gates are the single-level static CMOS gates of the Circuit Lab (physics/logic.py): the
inverter, NAND2, NOR2, NAND3 and NOR3. Each input is one vertical gate finger that crosses both
the nMOS and the pMOS diffusion, so the layout is a row of fingers with a source/drain region
between each pair. Which regions get a contact, and whether a contact goes to the supply rail or
to the output, follows from the network:

  * a series network is contacted only at its two ends: rail on the left, output on the right;
  * a parallel network is contacted between every pair of fingers, alternating rail and output.

Planar cells use Mead–Conway λ rules (Mead & Conway 1980) at λ = 90 nm, the same 180 nm-class
setting as layout.py, with transistor widths taken from the logical-effort sizes in logic.netlist
(unit nFET = 4λ wide). FinFET and nanosheet cells are drawn on the gridded style of layout.py
(gates every CPP, dummy gates at the cell edges, fixed fins or one sheet stack per device) with
the same CPP, fin pitch and metal pitch as layout.py and data/nodes.csv.

    python -m transistor_sim.gatecells    writes data/gate_cells.json and figures/layout/<gate>_180_nm.gds

The website draws these shapes and cross-sections from data/gate_cells.json; it does not
regenerate them, so this file is the single source.
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path

from .layout import LAYERS
from . import gateblocks
from .physics import logic

ROOT = Path(__file__).resolve().parents[2]
# layout.py layers plus a second metal for straps between regions that share a node
GC_LAYERS = {**LAYERS, "metal2": (10, "#f39ac7", 0.6)}
KEYS = ["inv", "nand2", "nor2", "nand3", "nor3", "aoi21", "oai21", "aoi22", "xor2"]

TECHS = {
    "planar_180": dict(name="180 nm planar", year=1999, style="planar", lam=90.0),
    # refs: the source of each drawn pitch; None marks an estimate (data/nodes.csv), labelled "est." on the page
    "finfet_5": dict(name="5 nm FinFET", year=2020, style="finfet", cpp=51.0, lg=16.0, fin_pitch=28.0, mmp=28.0, fins=2,
                     refs=dict(cpp="yeap2019", mmp="yeap2019", lg=None, fin_pitch=None)),
    "gaa_2": dict(name="2 nm-class nanosheet (est.)", year=2025, style="gaa", cpp=45.0, lg=14.0, fin_pitch=24.0, mmp=21.0, sheets=3,
                  refs=dict(cpp=None, mmp=None, lg=None, sheet_w=None)),
}


def _devices(key: str, typ: str) -> dict:
    """{gate signal: (terminal, terminal, width)} of one network, from logic.netlist (input inverters left out)."""
    out = {}
    for t in logic.netlist(key)["transistors"]:
        if t["type"] == typ and not t.get("aux"):
            if t["g"] in out:
                raise ValueError(f"{key}: a signal drives two {typ}MOS transistors; not drawn")
            out[t["g"]] = (t["a"], t["b"], t["w"])
    return out


def _chains(order, dev):
    """Every node sequence that puts the devices on one unbroken diffusion strip in this finger order."""
    seqs = []
    a0, b0, _ = dev[order[0]]
    for first in ((a0, b0), (b0, a0)):
        seq = list(first)
        for s in order[1:]:
            a, b, _ = dev[s]
            if a == seq[-1]:
                seq.append(b)
            elif b == seq[-1]:
                seq.append(a)
            else:
                break
        else:
            seqs.append(seq)
    return seqs


def _role(node: str, seq: list) -> str:
    if node in ("vdd", "gnd"):
        return "rail"
    if node == "y":
        return "out"
    return "link" if seq.count(node) > 1 else "internal"


def strips(key: str) -> dict:
    """Finger order and the node under every source/drain region of both strips.

    Each input is one gate finger crossing the nMOS and the pMOS strip, so both networks must be
    laid out in the same finger order. For each order we look for an Euler path through each
    network's graph (nodes = source/drain nets, edges = transistors) that visits the edges in that
    order, so neighbouring transistors share one diffusion region (Uehara & van Cleemput 1981).
    Among the orders that work, the one with the fewest regions needing extra wiring (an internal
    node that appears twice, a "link") and the fewest contacts wins; ties go to a strip that starts
    at the supply rail.
    """
    from itertools import permutations
    dn, dp = _devices(key, "n"), _devices(key, "p")
    best = None
    for order in permutations(logic.GATES[key]["inputs"] if set(dn) == set(logic.GATES[key]["inputs"]) else sorted(dn)):
        for sn in _chains(order, dn):
            for sp in _chains(order, dp):
                roles = [_role(x, sn) for x in sn] + [_role(x, sp) for x in sp]
                score = (10 * roles.count("link") + sum(r != "internal" for r in roles), sn[0] not in ("gnd",), sp[0] != "vdd")
                if best is None or score < best[0]:
                    best = (score, list(order), sn, sp)
    if best is None:
        raise ValueError(f"{key}: no shared finger order without a diffusion break")
    _, order, sn, sp = best
    return dict(order=order, n=sn, p=sp)


def regions(key: str, typ: str) -> list[dict]:
    """Source/drain regions and gates along one diffusion strip, left to right."""
    st = strips(key)
    seq, dev = st[typ], _devices(key, typ)
    out = []
    for i, node in enumerate(seq):
        out.append(dict(kind="sd", role=_role(node, seq), node=node))
        if i < len(st["order"]):
            s = st["order"][i]
            out.append(dict(kind="gate", input=s, w=dev[s][2]))
    return out


def widths(key: str) -> dict:
    """Logical-effort widths (unit nFET = 1) of each network's transistors, from logic.netlist."""
    return {typ: {s: d[2] for s, d in _devices(key, typ).items()} for typ in ("n", "p")}


def _planar(key: str, lam: float) -> dict:
    """Mead–Conway λ-rule cell. Returns shapes in nm and the strip geometry for the cross-section.

    Each transistor is drawn at its own logical-effort width (unit nFET = 4λ), so strips step in
    width where a wide device meets a narrow one. Gate length is 2λ, contacts 2λ × 2λ."""
    st = strips(key)
    order, n = st["order"], len(st["order"])
    R = {typ: regions(key, typ) for typ in ("n", "p")}
    gw = {typ: [4 * r["w"] for r in R[typ] if r["kind"] == "gate"] for typ in ("n", "p")}
    wn, wp = max(gw["n"]), max(gw["p"])
    S, dims = [], []
    reg, gate = 6, 2
    x0 = 4
    xs_gate = [x0 + reg + i * (reg + gate) for i in range(n)]
    x_end = x0 + reg * (n + 1) + gate * n
    yn0, yn1 = 7, 7 + wn
    gap = 22
    yp0, yp1 = yn1 + gap, yn1 + gap + wp
    top = yp1 + 7
    xr = x_end + 3
    width = xr + 8
    S += [("nwell", 0, yp0 - 5, width, top), ("pselect", x0 - 2, yp0 - 2, x_end + 2, yp1 + 2), ("nselect", x0 - 2, yn0 - 2, x_end + 2, yn1 + 2),
          ("metal1", 0, 0, width, 4), ("metal1", 0, top - 4, width, top)]

    def span(typ, i, w):        # y extent of a slot of width w (n grows up from yn0, p down from yp1)
        return (yn0, yn0 + w) if typ == "n" else (yp1 - w, yp1)

    for typ in ("n", "p"):
        sds = [r for r in R[typ] if r["kind"] == "sd"]
        for i in range(n + 1):     # source/drain region i is as wide as the wider neighbouring device
            w = max(gw[typ][j] for j in (i - 1, i) if 0 <= j < n)
            ya, yb = span(typ, i, w)
            S.append(("active", x0 + i * (reg + gate), ya, x0 + i * (reg + gate) + reg, yb))
        for k in range(n):
            ya, yb = span(typ, k, gw[typ][k])
            S.append(("active", xs_gate[k], ya, xs_gate[k] + gate, yb))
    for xg, name in zip(xs_gate, order):
        S.append(("poly", xg, yn0 - 2, xg + gate, yp1 + 2))
        pad_y = yn1 + 9
        S += [("poly", xg - 1, pad_y, xg + gate + 1, pad_y + 4), ("contact", xg, pad_y + 1, xg + 2, pad_y + 3), ("metal1", xg - 1, pad_y, xg + gate + 1, pad_y + 4)]
    pins = {name: [(xg + 1) * lam, (pad_y + 2) * lam] for xg, name in zip(xs_gate, order)}
    bus_n, bus_p = (yn1 + 2, yn1 + 5), (yp0 - 5, yp0 - 2)
    for typ, bus, rail_y in (("n", bus_n, (0, 4)), ("p", bus_p, (top - 4, top))):
        sds = [r for r in R[typ] if r["kind"] == "sd"]
        outs, links = [], {}
        for i, r in enumerate(sds):
            if r["role"] == "internal":
                continue
            w = max(gw[typ][j] for j in (i - 1, i) if 0 <= j < n)
            ya, yb = span(typ, i, w)
            xc = x0 + i * (reg + gate) + reg / 2
            y = ya + 1
            while y + 2 <= yb - 1:
                S.append(("contact", xc - 1, y, xc + 1, y + 2))
                y += 4
            if r["role"] == "rail":
                S.append(("metal1", xc - 2, rail_y[0], xc + 2, yb) if typ == "n" else ("metal1", xc - 2, ya, xc + 2, rail_y[1]))
            elif r["role"] == "out":
                S.append(("metal1", xc - 2, ya, xc + 2, bus[1]) if typ == "n" else ("metal1", xc - 2, bus[0], xc + 2, yb))
                outs.append(xc)
            else:                      # link: metal-1 pad, via, and a metal-2 strap over the strip
                S.append(("metal1", xc - 2, ya, xc + 2, yb))
                links.setdefault(r["node"], []).append(xc)
        for k, (node, xs) in enumerate(sorted(links.items())):
            ym = (yn0 + 2 + 3 * k) if typ == "n" else (yp1 - 2 - 3 * k)
            for xc in xs:
                S.append(("via", xc - 1, ym - 1, xc + 1, ym + 1))
            S.append(("metal2", min(xs) - 2, ym - 1.5, max(xs) + 2, ym + 1.5))
        S.append(("metal1", min(outs) - 2, bus[0], xr + 4, bus[1]))
    S.append(("metal1", xr, bus_n[0], xr + 4, bus_p[1]))
    # dimensions (λ rules, Mead & Conway 1980; widths from logical effort)
    k0 = gw["n"].index(min(gw["n"]))
    dims = [
        dict(label=f"L = 2λ = {2 * lam:.0f} nm", axis="x", at=yp1 + 4, a=xs_gate[0], b=xs_gate[0] + gate, ref="mead1980"),
        dict(label=f"W = {gw['n'][k0]:.0f}λ", axis="y", at=xs_gate[k0] - 1.2, a=yn0, b=yn0 + gw["n"][k0], ref="sutherland1999"),
        dict(label=f"W = {max(gw['p']):.0f}λ", axis="y", at=xs_gate[gw['p'].index(max(gw['p']))] - 1.2, a=yp1 - max(gw["p"]), b=yp1, ref="sutherland1999"),
        dict(label=f"gate pitch {reg + gate}λ", axis="x", at=yn0 - 4.5, a=xs_gate[0] + 1, b=xs_gate[1] + 1 if n > 1 else xs_gate[0] + reg + gate + 1, ref="mead1980"),
        dict(label=f"cell height {top * lam / 1000:.2f} µm", axis="y", at=-3, a=0, b=top, ref=None),
    ]
    sc = lambda v: round(v * lam, 3)
    dims = [dict(d, at=sc(d["at"]), a=sc(d["a"]), b=sc(d["b"])) for d in dims]
    shapes = [(l, a * lam, b * lam, c * lam, d * lam) for l, a, b, c, d in S]
    cut_n = (yn0 + min(gw["n"]) / 2) * lam
    cut_p = (yp1 - min(gw["p"]) / 2) * lam
    return dict(shapes=shapes, w=width * lam, h=top * lam, pins=pins, out=[(xr + 2) * lam, (yn1 + gap / 2) * lam],
                cut={"n": cut_n, "p": cut_p}, strip=dict(sd=reg * lam, gate=gate * lam, x0=x0 * lam), dims=dims, units="nm")


def _gridded(key: str, t: dict) -> dict:
    """Gridded FinFET / nanosheet cell: one gate line per input at CPP, dummy gates at the edges.

    Device widths are quantised: every FinFET here has the same number of fins and every nanosheet
    device the same sheet width, as in real gridded libraries; drive strength is chosen by picking a
    bigger cell, not by drawing a wider transistor."""
    st = strips(key)
    order, n = st["order"], len(st["order"])
    R = {typ: regions(key, typ) for typ in ("n", "p")}
    cpp, lg, fp, mmp = t["cpp"], t["lg"], t["fin_pitch"], t["mmp"]
    width = (n + 1) * cpp
    rail = 1.5 * mmp
    nf = t.get("fins", 1)
    S = []
    y_n = rail + mmp
    sheet_w = t.get("sheet_w", 1.5 * fp)
    if t["style"] == "finfet":
        rows_n = [y_n + k * fp for k in range(nf)]
        for y in rows_n:
            S.append(("fin", 0, y, width, y + t.get("fin_w", 0.25 * fp)))
        yn1 = rows_n[-1] + t.get("fin_w", 0.25 * fp)
    else:
        S.append(("active", 0, y_n, width, y_n + sheet_w))
        yn1 = y_n + sheet_w
    gap = 3 * mmp
    y_p = yn1 + gap
    if t["style"] == "finfet":
        rows_p = [y_p + k * fp for k in range(nf)]
        for y in rows_p:
            S.append(("fin", 0, y, width, y + t.get("fin_w", 0.25 * fp)))
        yp1 = rows_p[-1] + t.get("fin_w", 0.25 * fp)
    else:
        S.append(("active", 0, y_p, width, y_p + sheet_w))
        yp1 = y_p + sheet_w
    top = yp1 + mmp + rail
    S += [("nwell", 0, y_p - 0.6 * mmp, width, top), ("metal1", 0, 0, width, rail), ("metal1", 0, top - rail, width, top)]
    for g in range(n + 2):
        S.append(("poly", g * cpp - lg / 2, rail * 0.6, g * cpp + lg / 2, top - rail * 0.6))
    pins = {}
    for k, name in enumerate(order):
        x = (k + 1) * cpp
        pins[name] = [x, yn1 + gap / 2]
        S.append(("contact", x - lg / 2, yn1 + gap / 2 - 0.25 * mmp, x + lg / 2, yn1 + gap / 2 + 0.25 * mmp))
    ym = yn1 + 0.25 * gap
    yq = y_p - 0.25 * gap
    outs = {"n": [], "p": []}
    for typ, (ya, yb), rail_y in (("n", (y_n, yn1), (0, rail)), ("p", (y_p, yp1), (top - rail, top))):
        sds = [r for r in R[typ] if r["kind"] == "sd"]
        links = {}
        for i, r in enumerate(sds):
            if r["role"] == "internal":
                continue
            xc = (i + 0.5) * cpp
            S.append(("contact", xc - 0.18 * cpp, ya - 0.2 * fp, xc + 0.18 * cpp, yb + 0.2 * fp))
            if r["role"] == "rail":
                S.append(("metal1", xc - 0.12 * cpp, rail_y[0] if typ == "n" else ya, xc + 0.12 * cpp, yb if typ == "n" else rail_y[1]))
            elif r["role"] == "out":
                outs[typ].append(xc)
            else:
                links.setdefault(r["node"], []).append(xc)
        for k, (node, xs) in enumerate(sorted(links.items())):
            yl = (ya + yb) / 2 + k * 0.6 * mmp
            for xc in xs:
                S.append(("via", xc - 0.1 * cpp, yl - 0.2 * mmp, xc + 0.1 * cpp, yl + 0.2 * mmp))
            S.append(("metal2", min(xs) - 0.14 * cpp, yl - 0.25 * mmp, max(xs) + 0.14 * cpp, yl + 0.25 * mmp))
    for x in outs["n"]:
        S.append(("metal1", x - 0.12 * cpp, yn1, x + 0.12 * cpp, ym + 0.25 * mmp))
    for x in outs["p"]:
        S.append(("metal1", x - 0.12 * cpp, yq - 0.25 * mmp, x + 0.12 * cpp, y_p))
    xr = width - 0.25 * cpp
    S.append(("metal1", min(outs["n"]) - 0.12 * cpp, ym - 0.25 * mmp, xr + 0.12 * cpp, ym + 0.25 * mmp))
    S.append(("metal1", min(outs["p"]) - 0.12 * cpp, yq - 0.25 * mmp, xr + 0.12 * cpp, yq + 0.25 * mmp))
    S.append(("metal1", xr - 0.12 * cpp, ym - 0.25 * mmp, xr + 0.12 * cpp, yq + 0.25 * mmp))
    ref = t["refs"]
    dims = [
        dict(label=f"gate pitch {cpp:.0f} nm", axis="x", at=top + 0.6 * mmp, a=cpp, b=2 * cpp, ref=ref["cpp"]),
        dict(label=f"Lg {lg:.0f} nm", axis="x", at=-0.6 * mmp, a=cpp - lg / 2, b=cpp + lg / 2, ref=ref["lg"]),
        dict(label=f"metal pitch {mmp:.0f} nm", axis="y", at=width + 0.25 * mmp, a=ym, b=ym + mmp, ref=ref["mmp"]),
        dict(label=f"cell height {top:.0f} nm", axis="y", at=-0.5 * mmp, a=0, b=top, ref=None),
    ]
    if t["style"] == "finfet" and nf > 1:
        dims.append(dict(label=f"fin pitch {fp:.0f} nm", axis="y", at=0.35 * cpp, a=y_n, b=y_n + fp, ref=ref["fin_pitch"]))
    else:
        dims.append(dict(label=f"sheet width {sheet_w:.0f} nm", axis="y", at=0.35 * cpp, a=y_n, b=yn1, ref=ref.get("sheet_w")))
    dims = [dict(d, label=d["label"] + " (est.)") if d["ref"] is None and not d["label"].startswith("cell") else d for d in dims]
    return dict(shapes=S, w=width, h=top, pins=pins, out=[xr, (ym + yq) / 2], cut={"n": (y_n + yn1) / 2, "p": (y_p + yp1) / 2},
                strip=dict(sd=cpp - lg, gate=lg, x0=lg / 2), dims=dims, units="nm")


def _expr(e):
    """Series/parallel expression as JSON: a signal name or [kind, child, child, ...]."""
    return e if isinstance(e, str) else [e[0], *(_expr(c) for c in e[1:])]


def cell(key: str, tech: str) -> dict:
    t = TECHS[tech]
    c = _planar(key, t["lam"]) if t["style"] == "planar" else _gridded(key, t)
    c["shapes"] = [[l, round(a, 3), round(b, 3), round(cc, 3), round(d, 3)] for l, a, b, cc, d in c["shapes"]]
    c["outs"] = {"Y": c.pop("out")}
    c["fingers"] = [[round(x, 3), name] for name, (x, _) in c["pins"].items()]
    return c


def export() -> dict:
    gates = {}
    for k in KEYS:
        g = logic.GATES[k]
        gates[k] = dict(
            name=g["name"], kind="gate", inputs=g["inputs"], outputs=["Y"], truth=[[list(bits), [y]] for bits, y in logic.truth(k)],
            pd=_expr(g["pd"]), pu=_expr(logic.dual(g["pd"])), order=strips(k)["order"],
            regions={typ: regions(k, typ) for typ in ("n", "p")},
            widths=widths(k), effort=logic.effort(k),
            cells={tech: cell(k, tech) for tech in TECHS},
        )
    for k, b in gateblocks.export(TECHS).items():          # full adder and 6T SRAM cell
        for c in b["cells"].values():
            c["shapes"] = [[l, round(a, 3), round(y0, 3), round(x1, 3), round(y1, 3)] for l, a, y0, x1, y1 in c["shapes"]]
        gates[k] = b
    return dict(_about="Generated by sim/transistor_sim/gatecells.py — do not edit by hand.", techs=TECHS,
                layers={k: dict(gds=v[0], colour=v[1], opacity=v[2]) for k, v in GC_LAYERS.items()}, gates=gates)


def write_all() -> list[Path]:
    data = export()
    p = ROOT / "data" / "gate_cells.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    written = [p]
    try:
        import gdstk
    except ImportError:
        return written
    out = ROOT / "figures" / "layout"
    for k in ("nand2", "nor2", "aoi21", "xor2", "fa", "sram6t"):
        lib = gdstk.Library(unit=1e-9, precision=1e-12)
        c = lib.new_cell(f"{k.upper()}_180nm")
        for l, x0, y0, x1, y1 in data["gates"][k]["cells"]["planar_180"]["shapes"]:
            c.add(gdstk.rectangle((x0, y0), (x1, y1), layer=GC_LAYERS[l][0]))
        f = out / f"{k}_180_nm.gds"
        lib.write_gds(str(f), timestamp=datetime.datetime(2026, 1, 1))
        written.append(f)
    return written


if __name__ == "__main__":
    for p in write_all():
        print(p.relative_to(ROOT))
