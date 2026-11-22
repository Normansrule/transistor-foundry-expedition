"""Spot the defect: seven process defects whose place on the picture is decided by the process models.

Each challenge shows four features made in one step: four trenches filled together, four openings etched
together, four blocks polished together and so on. The step is run through the same model as its process
theatre, and the model decides which feature fails. The page shuffles the four features, so the defect is
in a different place each time, and the player has to find it and say why it happened.

The seven cases and the model behind each:

fill      deposition.fill    CVD (chemical vapour deposition) into trenches 20 to 80 nm wide, 80 nm deep.
                             The narrow trench pinches off at its mouth over a void. ALD (atomic layer
                             deposition) is the fix: it is conformal and fills from the walls.
etch      etch.etch_opening  Openings 20 to 120 nm wide etched to the endpoint of the wide one plus 15 %.
                             The narrow one etches slower (aspect-ratio-dependent etching) and does not clear.
cmp       cmp.polish         Blocks of pattern density 0.15 to 0.55 polished for 3 minutes. The sparse block
                             is polished lower; if it sits further from the others than the scanner's depth
                             of focus (litho.depth_of_focus, 193 nm at NA 1.35) the next layer cannot print
                             on it. Dummy fill (raising its density to 0.5) is the fix.
release   release.run        Nanosheet stacks 20 to 70 nm wide, all etched the same 25 nm from each side.
                             The widest keeps a core of SiGe; 40 nm reaches the middle of all of them.
em        electromigration   Copper lines 5 to 60 µm long at 2 MA/cm² and 105 °C. A line longer than the
                             Blech length (about 19 µm here) builds enough stress to void at the cathode.
particle  cleaning           Four particles from the 1/d³ size distribution (sizes at fixed quantiles)
                             land on lines with 100 nm spaces; one larger than the space shorts two lines.
focus     litho.aerial_image Lines at 160 nm pitch printed in four fields. One field sits 90 nm high (a
                             particle under the wafer lifts it); its image blurs and the line is lost.

``case(id, seed, good)`` returns the four features in display order and the index of the defect (None
when the good settings are used). The JavaScript twin is site/js/physics/defects.js.
"""
from __future__ import annotations

from . import cleaning, cmp, deposition, electromigration as em, etch, litho, release
from .yieldcost import mulberry32

CASES = ("fill", "etch", "cmp", "release", "em", "particle", "focus")
ZONES = 4
YEAR_S = 3.15576e7

FILL = dict(widths=(20.0, 60.0, 70.0, 80.0), depth=80.0, target=18.0, bad="cvd", good="ald")
ETCH = dict(widths=(20.0, 40.0, 70.0, 120.0), s=0.05, aniso=0.9, s_mask=10.0, bad=0.15, good=0.5)
CMP = dict(rho_bad=(0.15, 0.45, 0.5, 0.55), rho_good=(0.5, 0.45, 0.5, 0.55), P=28.0, V=1.0, t=3.0, lam=193.0, NA=1.35)
RELEASE = dict(widths=(20.0, 30.0, 45.0, 70.0), t=5.0, S=100.0, n=3, bad=25.0, good=40.0)
EM = dict(lengths=(5.0, 10.0, 15.0, 60.0), T=105.0, bad=2.0, good=0.5)
PARTICLE = dict(quantiles=(0.9, 0.6, 0.35, 0.15), line=100.0, bad=100.0, good=200.0)
FOCUS = dict(pitch=160.0, heights_bad=(0.0, -20.0, 30.0, 90.0), heights_good=(0.0, -20.0, 30.0, 0.0), cd_tol=0.10)


def order(seed: int) -> list[int]:
    """Display order of the four features: a Fisher-Yates shuffle driven by the shared PRNG."""
    rnd = mulberry32(seed)
    p = list(range(ZONES))
    for i in range(ZONES - 1, 0, -1):
        j = int(rnd() * (i + 1))
        p[i], p[j] = p[j], p[i]
    return p


def _fill(good):
    m = FILL["good" if good else "bad"]
    out = []
    for w in FILL["widths"]:
        f = deposition.fill(m, w, FILL["depth"] / w, FILL["target"])
        out.append(dict(w=w, closed=f["closed_at"] is not None, void=f["void"], void_z=f["void_z"],
                        coverage=f["coverage"], side=f["side"], bad=f["void"]))
    return dict(method=m, depth=FILL["depth"], target=FILL["target"]), out


def _etch(good):
    o = ETCH["good" if good else "bad"]
    t = etch.endpoint(ETCH["s"]) * (1 + o)
    out = []
    for w in ETCH["widths"]:
        e = etch.etch_opening(w, t, ETCH["s"], ETCH["aniso"], ETCH["s_mask"])
        cleared = e["t_clear"] is not None
        out.append(dict(w=w, depth=e["depth"], cleared=cleared, left=max(0.0, etch.FILM - e["depth"]),
                        side=e["side"], mask_left=e["mask_left"], bad=not cleared))
    return dict(overetch=o, t=t, film=etch.FILM, mask=etch.MASK), out


def _cmp(good):
    rhos = CMP["rho_good" if good else "rho_bad"]
    tol = litho.depth_of_focus(CMP["lam"], CMP["NA"])
    regs = [cmp.polish(r, CMP["P"], CMP["V"], CMP["t"], n_out=4) for r in rhos]
    ups = sorted(g["up"] for g in regs)
    mid = 0.5 * (ups[1] + ups[2])
    out = [dict(rho=r, up=g["up"], down=g["down"], step=g["step"], dev=g["up"] - mid, bad=abs(g["up"] - mid) > tol)
           for r, g in zip(rhos, regs)]
    return dict(tol=tol, median=mid, line=cmp.STEP0), out


def _release(good):
    e = RELEASE["good" if good else "bad"]
    out = []
    for W in RELEASE["widths"]:
        r = release.run(W, RELEASE["t"], RELEASE["S"], 2 * e / W - 1, RELEASE["n"], 21)
        out.append(dict(W=W, core=r["core"], released=r["released"], t_edge=r["t_edge"], w_final=r["w_final"],
                        bad=not r["released"]))
    return dict(e=e, t=RELEASE["t"], S=RELEASE["S"], n=RELEASE["n"]), out


def _em(good):
    j = EM["good" if good else "bad"]
    lb = em.blech_length_um(j, EM["T"])
    t_void = em.t_nucleation_long(j, EM["T"]) / YEAR_S
    out = [dict(L=L, jL=j * 1e6 * L * 1e-4, bad=L > lb, years=t_void if L > lb else None) for L in EM["lengths"]]
    return dict(j=j, T=EM["T"], blech_um=lb, jl_crit=em.blech_product(EM["T"])), out


def _particle(good):
    space = PARTICLE["good" if good else "bad"]
    d0 = cleaning.D_INSPECT
    out = []
    for u in PARTICLE["quantiles"]:
        d = d0 / u ** 0.5                       # share larger than d is (d0/d)²  →  d = d0 / sqrt(u)
        out.append(dict(d=d, bad=d > space))
    return dict(space=space, line=PARTICLE["line"], d0=d0, share=cleaning.killer_fraction(space, d0)), out


def _focus(good):
    p = FOCUS["pitch"]
    x0, I0 = litho.aerial_image(p)
    cd0 = litho.printed_cd(x0, I0, p)
    out = []
    for h in FOCUS["heights_good" if good else "heights_bad"]:
        x, I = litho.aerial_image(p, defocus_nm=h)
        cd = litho.printed_cd(x, I, p)
        out.append(dict(h=h, contrast=litho.contrast(I), cd=cd, bad=abs(cd - cd0) > FOCUS["cd_tol"] * cd0))
    return dict(pitch=p, cd0=cd0, dof=litho.depth_of_focus(193.0, 1.35)), out


MODELS = dict(fill=_fill, etch=_etch, cmp=_cmp, release=_release, em=_em, particle=_particle, focus=_focus)


def case(cid: str, seed: int = 1, good: bool = False) -> dict:
    """Four features in display order and the index of the defect (None if all pass)."""
    info, feats = MODELS[cid](good)
    p = order(seed)
    shown = [feats[i] for i in p]
    bad = [i for i, f in enumerate(shown) if f["bad"]]
    return dict(id=cid, good=good, order=p, info=info, features=shown, defect=bad[0] if len(bad) == 1 else (None if not bad else bad))


def grade(result: dict, zone: int, cause: str, answer: str) -> int:
    """Points for one challenge: one for the right place, one for the right cause."""
    return int(zone == result["defect"]) + int(cause == answer)


def reference() -> dict:
    """Numbers checked against the JavaScript twin by tests/js_parity.mjs."""
    return {
        "orders": [order(s) for s in (1, 2, 3, 42, 2026)],
        "cases": {c: {"bad": case(c, 7), "good": case(c, 7, True)} for c in CASES},
    }
