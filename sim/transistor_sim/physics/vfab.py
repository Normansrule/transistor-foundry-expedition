"""Virtual Fab: a computed two-column cross-section built by running a traveler through the theatre models.

Each step of the route runs the model behind its process theatre at that theatre's default settings and
changes two columns of the wafer: the field (covered by the mask) and the window (opened by lithography).
Layers are listed bottom to top above the silicon surface, in nm; the silicon surface moves down as
oxidation consumes it (0.44 nm of silicon per nm of oxide) and junctions are measured from it.

    ox_thermal      Deal–Grove, dry O2, 1000 °C, 1 h (oxidation.py), grown under any existing oxide
    litho_expose    resist coated everywhere, then opened in the window (RESIST_NM, est.)
    etch_rie        oxide cleared in the window; resist thinned by the selectivity, silicon recessed by the
                    over-etch (etch.py: s_mask 10, over-etch 50 %, stop selectivity S_STOP)
    implant         phosphorus, 20 keV, 1e15 cm^-2 (implant.py); a column is masked when the layers on it are
                    thicker than Rp + 4 dRp, otherwise the junction is shallower by the mask thickness
    diffuse_predep  phosphorus predeposition and drive-in (diffusion.py defaults); any oxide masks it
    anneal          spike anneal of the implant, 1050 °C, 1 s, 150 °C/s (anneal.py)
    dep_pvd         a metal film (METAL_NM, est.) over both columns
    evap_al         evaporated aluminium leads on the historical route, the same film (METAL_NM, est.), through a
                    contact window opened in the oxide over the junction
    cmp             Preston removal for 3 min at 28 kPa and 1 m/s (cmp.py), stopping on oxide or silicon
    damascene       a 20 nm copper line, aspect ratio 2, in a dielectric (damascene.py)
    gaa_release     three released nanosheets (release.py defaults), recorded, not drawn to scale
    planar_hoerni   Hoerni's boron junction under the oxide edge on its own n-type wafer (planar.py)
Held steps (missing a step they require) do nothing. Resist is stripped before any furnace, metal or
after an implant.

Every setting above can be replaced through cfg (the page passes the visitor's own theatre settings). A
dopant of the substrate's own type (boron into this p-type wafer) makes no junction. Diffused junctions
also spread sideways under the mask edge by about 0.8 x_j (Plummer et al.), reported as "lateral". An
implanted junction spreads by the lateral straggle, taken equal to the vertical one (Plummer et al.): under
the mask edge the dopant falls as (N_peak/2) erfc(y / (sqrt(2) sigma)), so the junction reaches
y = sqrt(2) sigma erfcinv(2 N_sub / N_peak).
"""
from __future__ import annotations

import math

from . import anneal, cmp, damascene, diffusion, etch, implant, oxidation, planar, release

N_SUB = 1.66e16           # cm⁻³, p-type substrate of the teaching-cleanroom run
RESIST_NM = 1000.0        # nm (est.)
METAL_NM = 500.0          # nm (est.)
SI_PER_OX = oxidation.SI_CONSUMED
SUB_TYPE = "p"
LATERAL = 0.8             # lateral diffusion under the mask edge, fraction of x_j (Plummer 2000)
STOPS = ("ox", "si")
DEFAULT_CFG = {
    "ox": {"amb": "dry", "T": 1000.0, "t": 1.0, "orient": "100"},
    "imp": {"ion": "P", "E": 20.0, "dose": 1e15},
    "diff": {"ion": "P", "Cs": 3e20, "T1": 1050.0, "t1": 600.0, "T2": 1050.0, "t2": 2220.0},
    "ann": {"T": 1050.0, "hold": 1.0, "rate": 150.0},
    "etch": {"sel": 10.0, "oe": 0.5},
    "cmp": {"P": 28.0, "V": 1.0, "t": 3.0},
    "dam": {"metal": "Cu", "w": 20.0, "ar": 2.0, "tb": 2.0},
    "rel": {"W": 30.0, "S": 100.0, "over": 0.2, "n": 3},
    "planar": {"NB": 1e15, "T2": 1100.0, "t2": 60.0},
}


def merge(cfg=None) -> dict:
    return {k: {**v, **((cfg or {}).get(k) or {})} for k, v in DEFAULT_CFG.items()}


def erfcinv(v: float) -> float:
    """Inverse of diffusion.erfc on (0, 1] by bisection, so the JavaScript twin matches it exactly."""
    lo, hi = 0.0, 10.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if diffusion.erfc(mid) > v:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def lateral_implant(peak: float, sigma_nm: float) -> float:
    return math.sqrt(2.0) * sigma_nm * erfcinv(2.0 * N_SUB / peak) if peak > 2.0 * N_SUB else 0.0


def makes_junction(ion: str) -> bool:
    return implant.IONS[ion]["type"] != SUB_TYPE


def _thick(col, mat):
    return sum(t for m, t in col["layers"] if m == mat)


def _mask(col):
    return sum(t for _, t in col["layers"])


def _strip_resist(col):
    col["layers"] = [[m, t] for m, t in col["layers"] if m != "resist"]


def _new():
    return {"si_top": 0.0, "layers": [], "xj": 0.0, "by": None, "shift": 0.0}


def run(route, held=None, cfg=None) -> dict:
    held = held or [False] * len(route)
    g = merge(cfg)
    cols = {"field": _new(), "window": _new()}
    log, out = [], {"masks": 0}
    for sid, h in zip(route, held):
        v = None
        if h:
            log.append({"id": sid, "applied": False, "value": None}); continue
        if sid == "ox_thermal":
            for c in cols.values():
                if any(m not in ("ox", "resist") for m, _ in c["layers"]):
                    continue                                   # only bare silicon or oxide goes in the furnace
                _strip_resist(c)
                x0 = _thick(c, "ox")
                x = float(oxidation.thickness(g["ox"]["amb"], g["ox"]["T"], g["ox"]["t"], g["ox"]["orient"], x0_um=x0 / 1000 if x0 > 0 else None)) * 1000
                c["si_top"] -= SI_PER_OX * (x - x0)
                c["layers"] = [["ox", x]]
            v = _thick(cols["field"], "ox")
        elif sid == "litho_expose":
            for k, c in cols.items():
                if k == "field":
                    c["layers"].append(["resist", RESIST_NM])
            out["masks"] += 1
            v = RESIST_NM
        elif sid == "etch_rie":
            w, f = cols["window"], cols["field"]
            if any(m == "resist" for m, _ in f["layers"]):
                cleared = sum(t for m, t in w["layers"] if m != "si")
                w["layers"] = []
                w["si_top"] -= g["etch"]["oe"] * cleared / etch.S_STOP
                f["layers"] = [[m, t - cleared / g["etch"]["sel"] if m == "resist" else t] for m, t in f["layers"]]
                v = cleared
        elif sid == "implant":
            im = g["imp"]
            j = implant.junction(im["ion"], im["E"], im["dose"], N_SUB)
            if not makes_junction(im["ion"]):
                j = {**j, "xj": 0.0}
            stop = j["Rp"] + 4 * implant.range_stats(im["ion"], im["E"])["dRp"]
            for c in cols.values():
                m = _mask(c)
                if m < stop and j["xj"] - m > c["xj"]:
                    c["xj"], c["by"], c["shift"] = j["xj"] - m, "implant", m
                    c["peak"], c["sigma"] = j["peak"], j["sigma_nm"]
                _strip_resist(c)
            v = float(j["xj"])
        elif sid == "diffuse_predep":
            df = g["diff"]
            d = diffusion.run(df["ion"], df["Cs"], df["T1"], df["t1"], df["T2"], df["t2"], N_SUB)
            if not makes_junction(df["ion"]):
                d = {**d, "xj": 0.0}
            for c in cols.values():
                _strip_resist(c)
                if _mask(c) == 0 and d["xj"] > c["xj"]:
                    c["xj"], c["by"], c["shift"] = d["xj"], "diffusion", 0.0
            v = float(d["xj"])
        elif sid == "anneal":
            im, an = g["imp"], g["ann"]
            a = anneal.run(im["ion"], im["E"], im["dose"], an["T"], an["hold"], an["rate"], N_SUB)
            if not makes_junction(im["ion"]):
                a = {**a, "xj": 0.0}
            for c in cols.values():
                _strip_resist(c)
                if c["by"] == "implant":
                    c["xj"] = max(0.0, a["xj"] - c["shift"])
                    c["peak"], c["sigma"] = a["peak"], a["sigma"]
            v = float(a["xj"])
        elif sid in ("dep_pvd", "evap_al"):
            if sid == "evap_al":                               # contact window: the lead touches the junction, oxide insulates the rest
                cols["window"]["layers"] = [[m, t] for m, t in cols["window"]["layers"] if m != "ox"]
            for c in cols.values():
                _strip_resist(c)
                c["layers"].append(["metal", METAL_NM])
            v = METAL_NM
        elif sid == "cmp":
            R = cmp.rate(g["cmp"]["P"], g["cmp"]["V"]) * g["cmp"]["t"]
            top = max(c["si_top"] + _mask(c) for c in cols.values())
            target = top - R
            for c in cols.values():                            # polish from the top down, stopping on oxide or silicon
                left = max(0.0, c["si_top"] + _mask(c) - target)
                while left > 0 and c["layers"] and c["layers"][-1][0] not in STOPS:
                    cut = min(left, c["layers"][-1][1])
                    c["layers"][-1][1] -= cut
                    left -= cut
                    if c["layers"][-1][1] <= 1e-9:
                        c["layers"].pop()
            v = R
        elif sid == "damascene":
            dm = g["dam"]
            d = damascene.run(dm["metal"], dm["w"], dm["ar"], dm["tb"] if dm["metal"] == "Cu" else None)
            cols["field"]["layers"].append(["ild", d["h"]])
            cols["window"]["layers"].append(["cu", d["h"]])
            out["cu_r"] = d["r"]
            v = d["h"]
        elif sid == "gaa_release":
            rl = g["rel"]
            r = release.run(rl["W"], 5.0, rl["S"], rl["over"], int(rl["n"]))
            out["sheets"] = {"t_edge": r["t_edge"], "t_centre": r["t_centre"], "weff": r["weff"]}
            v = r["t_edge"]
        elif sid == "planar_hoerni":
            pl = g["planar"]
            p = planar.run(pl["NB"], pl["T2"], pl["t2"])
            out["planar"] = {"xj": p["xj"], "bv_pp": p["bv_pp"], "bv_cyl": p["bv_cyl"]}
            w = cols["window"]
            w["xj"], w["by"], w["shift"] = p["xj"], "planar", 0.0
            v = p["xj"]
        elif sid == "probe_dice_bond":
            out["done"] = True
        log.append({"id": sid, "applied": True, "value": None if v is None else float(v)})
    for c in cols.values():
        c["xj"] = float(c["xj"]); c["si_top"] = float(c["si_top"]); c["shift"] = float(c["shift"])
        c["lateral"] = (LATERAL * c["xj"] if c["by"] in ("diffusion", "planar")
                        else lateral_implant(c["peak"], c["sigma"]) if c["by"] == "implant" and c["xj"] > 0 else 0.0)
        c.pop("peak", None); c.pop("sigma", None)
        c["layers"] = [[m, float(t)] for m, t in c["layers"]]
    return {"field": cols["field"], "window": cols["window"], "log": log, **out}
