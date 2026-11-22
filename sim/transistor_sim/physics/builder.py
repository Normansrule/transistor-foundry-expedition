"""3D layer builder: a transistor built step by step, as axis-aligned boxes in nanometres.

Four architectures (planar, FinFET, gate-all-around nanosheet and complementary FET) are built
from the dimensions in data/builder.json. Every piece of material is a box

    [material, x0, x1, y0, y1, z0, z1, born, died]

x runs along the channel from source to drain, y across it and z up. ``born`` is the index of the
build step that makes the piece and ``died`` the step that removes it (None if it stays). The pieces
alive at any step never overlap, so the page can draw them with a painter's sort.

The cell is one gate pitch long, centred on the gate. Its x is split into five zones (source and
drain, two spacers, the gate) because material changes zone by zone: the dummy gate becomes the
metal gate, SiGe under the spacers becomes inner spacer, the stack beside them is recessed.

The rectangles inside each zone are made by ``subtract``, which cuts holes out of a y–z rectangle and
returns the remainder as non-overlapping rectangles. The JavaScript twin is site/js/physics/builder.js;
both run the same arithmetic in the same order so tests/js_parity.mjs can compare every box.

metrics() gives the numbers the compare mode shows: how many faces of the channel the gate touches,
the effective width W_eff of one transistor, W_eff per nanometre of cell width, the natural length
of the thin body (Colinge 2008) and the area of an n plus p pair one gate pitch long.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "data" / "builder.json"
EPS_RATIO = 11.7 / 3.9      # silicon over SiO2 permittivity; EOT is SiO2-equivalent
SUB_D = 20.0                # drawn depth of substrate below the fins (nm)


def load():
    return json.loads(DATA.read_text(encoding="utf-8"))


def arch(key, data=None):
    data = data or load()
    for a in data["archs"]:
        if a["id"] == key:
            return a
    raise KeyError(key)


def dims(a):
    return {k: v[0] for k, v in a["dims"].items()}


def subtract(rect, holes):
    """rect minus the union of holes, as non-overlapping rectangles (y0, y1, z0, z1).

    The rectangle is cut into horizontal slabs at every hole edge; each slab keeps the y-intervals no
    hole covers, and slabs with the same interval are merged upwards.
    """
    y0, y1, z0, z1 = rect
    zs = [z0, z1]
    for h in holes:
        for z in (h[2], h[3]):
            if z0 < z < z1 and z not in zs:
                zs.append(z)
    zs.sort()
    out, openp = [], {}
    for i in range(len(zs) - 1):
        za, zb = zs[i], zs[i + 1]
        cov = sorted([(max(h[0], y0), min(h[1], y1)) for h in holes if h[2] < zb and h[3] > za and h[0] < y1 and h[1] > y0])
        free, y = [], y0
        for a, b in cov:
            if a > y:
                free.append((y, a))
            if b > y:
                y = b
        if y < y1:
            free.append((y, y1))
        nxt = {}
        for f in free:
            if f in openp:
                nxt[f] = openp.pop(f)
            else:
                nxt[f] = za
        for f, zstart in openp.items():
            out.append((f[0], f[1], zstart, za))
        openp = nxt
    for f, zstart in openp.items():
        out.append((f[0], f[1], zstart, z1))
    out.sort(key=lambda r: (r[0], r[2], r[1], r[3]))
    return out


def layout(a):
    """Cell frame: x zones, y extent, active y-ranges and the z levels of the stack."""
    d = dims(a)
    style = a["style"]
    half = d["lg"] / 2
    X = d["cpp"] / 2 + d["contact_w"] / 2
    zones = {"sdl": (-X, -half - d["spacer"]), "spl": (-half - d["spacer"], -half), "g": (-half, half),
             "spr": (half, half + d["spacer"]), "sdr": (half + d["spacer"], X)}
    L = {"d": d, "style": style, "X": X, "zones": zones}
    if style == "planar":
        L["Y"] = d["w"] + 2 * d["sti_w"]
        L["act"] = [(d["sti_w"], d["sti_w"] + d["w"])]
        L["floor"] = 0.0
        L["top"] = 0.0
    elif style == "finfet":
        n, fp, w = int(d["nfin"]), d["fin_pitch"], d["fin_w"]
        L["Y"] = n * fp
        L["act"] = [(fp * (i + 0.5) - w / 2, fp * (i + 0.5) + w / 2) for i in range(n)]
        L["floor"] = d["subfin"]
        L["top"] = d["subfin"] + d["fin_h"]
    else:
        L["Y"] = d["sheet_w"] + d["space"]
        L["act"] = [(d["space"] / 2, d["space"] / 2 + d["sheet_w"])]
        z = d["subfin"]
        layers = []                                   # (material, z0, z1, tier)
        tiers = [("n", int(d["sheets"]))] + ([("p", int(d["sheets"]))] if style == "cfet" else [])
        for ti, (tier, ns) in enumerate(tiers):
            if ti == 1:
                layers.append(("mid", z, z + d["mid"], "m"))
                z = z + d["mid"]
            for _ in range(ns):
                layers.append(("sige", z, z + d["gap"], tier))
                z = z + d["gap"]
                layers.append(("sich", z, z + d["sheet_t"], tier))
                z = z + d["sheet_t"]
        L["layers"] = layers
        L["floor"] = d["subfin"]
        L["top"] = z
    L["gtop"] = L["top"] + d["gate_h"]
    return L


def build(a):
    """Every box of the architecture, with the step that makes it and the step that removes it."""
    L = layout(a)
    d, style, X, Y, Z = L["d"], L["style"], L["X"], L["Y"], L["zones"]
    S = {s: i for i, s in enumerate(a["steps"])}
    st = lambda k: S.get(k)                           # noqa: E731
    boxes = []

    def put(m, xr, r, born, died=None):
        if r[1] - r[0] > 1e-9 and r[3] - r[2] > 1e-9 and xr[1] - xr[0] > 1e-9:
            boxes.append([m, xr[0], xr[1], r[0], r[1], r[2], r[3], born, died])

    full = (-X, X)
    sd = (Z["sdl"], Z["sdr"])
    spz = (Z["spl"], Z["spr"])
    gz = Z["g"]
    flo, top, gtop, tk = L["floor"], L["top"], L["gtop"], d["tk"]

    if style == "planar":
        sd_, xj = d["sti_d"], d["xj"]
        y0, y1 = L["act"][0]
        put("si", full, (0, Y, -sd_ - SUB_D, -sd_), st("wafer"))
        for yr in ((0, y0), (y1, Y)):
            put("si", full, (yr[0], yr[1], -sd_, 0), st("wafer"), st("sti"))
            put("sti", full, (yr[0], yr[1], -sd_, 0), st("sti"))
        put("si", full, (y0, y1, -sd_, -xj), st("wafer"))
        for xr in (Z["spl"], gz, Z["spr"]):
            put("si", xr, (y0, y1, -xj, 0), st("wafer"))
        for xr in sd:
            put("si", xr, (y0, y1, -xj, 0), st("wafer"), st("sd_implant"))
            put("n", xr, (y0, y1, -xj, 0), st("sd_implant"))
        put("poly", gz, (0, Y, 0, gtop), st("dummy"), st("open"))
        for xr in spz:
            put("spacer", xr, (0, Y, 0, gtop), st("spacer"))
        put("highk", gz, (0, Y, 0, tk), st("hkmg"))
        put("metal", gz, (0, Y, tk, gtop), st("hkmg"))
        ctop = 0.0
    else:
        put("si", full, (0, Y, -SUB_D, 0), st("wafer"))
        fins = [(a0, a1) for a0, a1 in L["act"]]
        # material above the substrate before the fins are cut
        if style == "finfet":
            put("si", full, (0, Y, 0, top), st("wafer"), st("fin"))
        else:
            put("si", full, (0, Y, 0, flo), st("wafer"), st("fin"))
            for m, z0, z1, _t in L["layers"]:
                put("sige" if m == "mid" else m, full, (0, Y, z0, z1), st("superlattice"), st("fin"))
        # the sub-fin under the trench oxide, and the oxide around it
        for f in fins:
            put("si", full, (f[0], f[1], 0, flo), st("fin"))
        for r in subtract((0, Y, 0, flo), [(f[0], f[1], 0, flo) for f in fins]):
            put("sti", full, r, st("sti"))
        # the channel material, zone by zone
        sd_step = st("sd_epi") if style in ("finfet", "gaa") else st("sd_bottom")
        for f in fins:
            if style == "finfet":
                for xr in sd:
                    put("sich", xr, (f[0], f[1], flo, top), st("fin"), sd_step)
                for xr in spz + (gz,):
                    put("sich", xr, (f[0], f[1], flo, top), st("fin"))
            else:
                for m, z0, z1, _t in L["layers"]:
                    r = (f[0], f[1], z0, z1)
                    for xr in sd:
                        put("sige" if m == "mid" else m, xr, r, st("fin"), sd_step)
                    if m == "sich":
                        for xr in spz + (gz,):
                            put("sich", xr, r, st("fin"))
                    else:                             # SiGe and the middle layer
                        for xr in spz:
                            put("sige", xr, r, st("fin"), st("inner"))
                            put("ispacer", xr, r, st("inner"))
                        put("sige", gz, r, st("fin"), st("release"))
        # dummy gate and spacers wrap the fin or the whole stack
        body = [(f[0], f[1], flo, top) for f in fins]
        for r in subtract((0, Y, flo, gtop), body):
            put("poly", gz, r, st("dummy"), st("open"))
            for xr in spz:
                put("spacer", xr, r, st("spacer"))
        # source and drain
        a0, a1 = fins[0][0], fins[-1][1]
        if style == "finfet":
            e = d["fin_w"] / 2
            ctop = top + 5
            for xr in sd:
                put("n", xr, (a0 - e, a1 + e, flo, ctop), st("sd_epi"))
        elif style == "gaa":
            ctop = top + 3
            for xr in sd:
                put("n", xr, (a0 - 3, a1 + 3, flo, ctop), st("sd_epi"))
        else:
            mid = [ly for ly in L["layers"] if ly[0] == "mid"][0]
            ptop = [ly for ly in L["layers"] if ly[3] == "p" and ly[0] == "sich"][0]
            zb = mid[1] + 4                          # bottom epi stops just above the n tier
            zi = ptop[1] - 4                         # isolation up to just below the first p sheet's gap
            ctop = top + 3
            for xr in sd:
                put("n", xr, (a0 - 3, a1 + 3, flo, zb), st("sd_bottom"))
                put("oxide", xr, (a0 - 3, a1 + 3, zb, zi), st("sd_iso"))
                put("p", xr, (a0 - 3, a1 + 3, zi, ctop), st("sd_top"))
        # replacement gate: high-k on every face the gate touches, metal in the rest
        if style == "finfet":
            chan = [(f[0], f[1], flo, top) for f in fins]
        else:
            chan = [(f[0], f[1], z0, z1) for f in fins for m, z0, z1, _t in L["layers"] if m == "sich"]
        grown = [(c[0] - tk, c[1] + tk, max(flo, c[2] - tk), c[3] + tk) for c in chan] + [(0, Y, flo, flo + tk)]
        metal = subtract((0, Y, flo, gtop), grown)
        for r in metal:
            put("metal", gz, r, st("hkmg"))
        for r in subtract((0, Y, flo, gtop), metal + chan):
            put("highk", gz, r, st("hkmg"))
    # contacts on the source and drain, centred half a gate pitch from the gate
    a0, a1 = L["act"][0][0], L["act"][-1][1]
    cw = d["contact_w"]
    for xr in ((-X, -X + cw), (X - cw, X)):
        put("contact", xr, (a0, a1, ctop, gtop), st("contact"))
    return [[b[0]] + [round(v, 9) for v in b[1:7]] + b[7:] for b in boxes]


def alive(boxes, step):
    return [b for b in boxes if b[7] <= step and (b[8] is None or b[8] > step)]


def overlaps(boxes, tol=1e-6):
    """Pairs of boxes that share volume (should be none at every step)."""
    bad = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            p, q = boxes[i], boxes[j]
            if all(min(p[2 * k + 2], q[2 * k + 2]) - max(p[2 * k + 1], q[2 * k + 1]) > tol for k in range(3)):
                bad.append((i, j))
    return bad


def metrics(a):
    """Numbers for the compare mode, all from the drawn dimensions."""
    L = layout(a)
    d, style = L["d"], a["style"]
    if style == "planar":
        sides, weff, lam = 1, d["w"], None
    elif style == "finfet":
        sides, weff = 3, d["nfin"] * (2 * d["fin_h"] + d["fin_w"])
        lam = math.sqrt(EPS_RATIO * d["fin_w"] * d["eot"] / 2)
    else:
        sides, weff = 4, d["sheets"] * 2 * (d["sheet_w"] + d["sheet_t"])
        lam = math.sqrt(EPS_RATIO * d["sheet_t"] * d["eot"] / 2)
    pair_w = L["Y"] * (1 if style == "cfet" else 2)      # an nFET and a pFET: side by side, or stacked
    return {"sides": sides, "weff_nm": weff, "cell_w_nm": L["Y"], "weff_per_w": weff / L["Y"],
            "pair_w_nm": pair_w, "pair_weff_per_w": 2 * weff / pair_w,
            "lam_nm": lam, "lg_over_lam": None if lam is None else d["lg"] / lam,
            "pair_area_nm2": d["cpp"] * pair_w, "steps": len(a["steps"]), "height_nm": L["gtop"]}


def reference():
    """Everything tests/js_parity.mjs compares: every box of every architecture and its metrics."""
    data = load()
    return {a["id"]: {"boxes": build(a), "metrics": metrics(a),
                      "sub": subtract((0, 10, 0, 10), [(2, 4, 1, 3), (3, 6, 2, 5), (8, 12, -1, 4)])} for a in data["archs"]}
