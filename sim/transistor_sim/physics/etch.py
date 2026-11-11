"""Plasma etch of narrow openings: aspect-ratio-dependent etching (ARDE), anisotropy and selectivity.

Neutral etchant reaches the bottom of an opening by molecular flow down a narrow channel. Coburn &
Winters (1989) treated the opening as a conductance: with reaction (sticking) probability s at the
bottom and Clausing transmission K of the channel, the flux that reaches the bottom, relative to an
open surface, is
    K / (K + s (1 - K)),   with K = 1 / (1 + 3 AR / 4) for a long cylinder of aspect ratio AR,
so the local etch rate is  R0 / (1 + 3 s AR / 4).  Narrow openings therefore etch more slowly than
wide ones (ARDE, or RIE lag), and the effect is stronger for a more reactive etchant (larger s).

Sideways etching is set by the anisotropy A (0 = isotropic, as in a wet etch; 1 = purely ion-driven):
a sidewall at depth z, uncovered since the front passed it, recedes at (1 - A) times the local
vertical rate. The mask erodes at R0 / S_mask, and once the film has cleared the front slows to
1 / S_stop of its rate in the stop layer below. Rates are teaching values (est.).
"""
from __future__ import annotations

R0 = 5.0              # nm/s, open-area vertical rate of the film (est.)
FILM = 200.0          # nm, film being etched (est.)
MASK = 80.0           # nm, hard-mask thickness (est.)
S_STOP = 20.0         # selectivity of the film over the stop layer below (est.)
WIDTHS = (20.0, 40.0, 120.0)   # nm, the three openings drawn by the theatre
NZ = 40               # depth levels for the sidewall profile
DT = 0.25             # s, time step


def lag(ar: float, s: float) -> float:
    """Bottom etch rate relative to an open surface at aspect ratio ar (Coburn & Winters 1989)."""
    return 1.0 / (1.0 + 0.75 * s * max(ar, 0.0))


def etch_opening(w: float, t_total: float, s: float, aniso: float, s_mask: float) -> dict:
    """Etch one opening of width w (nm) for t_total seconds.

    Returns the final depth (nm, may pass FILM into the stop layer), the time the film cleared
    (None if it never did), the sidewall recess u(z) at NZ+1 levels from the top of the film to the
    final depth, and the mask left (nm)."""
    d, t, t_clear = 0.0, 0.0, None
    passed = []                                   # (depth, time) when the front passed each level
    levels = [FILM * k / NZ for k in range(NZ + 1)]
    nxt = 0
    steps = int(round(t_total / DT))
    for _ in range(steps):
        while nxt <= NZ and levels[nxt] <= d:
            passed.append((levels[nxt], t))
            nxt += 1
        ar = (d + MASK) / w
        rate = R0 * lag(ar, s) / (1.0 if d < FILM else S_STOP)
        if d < FILM and d + rate * DT >= FILM:
            t_clear = t + (FILM - d) / rate
        d += rate * DT
        t += DT
    while nxt <= NZ and levels[nxt] <= d:
        passed.append((levels[nxt], t))
        nxt += 1
    # sidewall recess at each uncovered level of the film: (1 - A) x local rate x time exposed
    side = []
    for z, tz in passed:
        r_loc = R0 * lag((z + MASK) / w, s)
        side.append([z, (1.0 - aniso) * r_loc * (t - tz)])
    mask_left = max(0.0, MASK - R0 / s_mask * t)
    return dict(depth=d, t_clear=t_clear, side=side, mask_left=mask_left, ar=(min(d, FILM) + MASK) / w)


def endpoint(s: float) -> float:
    """Time (s) for the widest opening to clear the film: the optical-emission endpoint."""
    w = max(WIDTHS)
    d, t = 0.0, 0.0
    while d < FILM:
        rate = R0 * lag((d + MASK) / w, s)
        if d + rate * DT >= FILM:
            return t + (FILM - d) / rate
        d += rate * DT
        t += DT
    return t


def run(s: float = 0.05, aniso: float = 0.9, s_mask: float = 10.0, overetch: float = 0.5) -> dict:
    """The theatre's three openings etched to endpoint plus an over-etch fraction."""
    t_end = endpoint(s)
    t_total = t_end * (1.0 + overetch)
    ops = [dict(w=w, **etch_opening(w, t_total, s, aniso, s_mask)) for w in WIDTHS]
    return dict(t_end=t_end, t_total=t_total, openings=ops,
                lag_ratio=min(o["depth"] for o in ops) / max(o["depth"] for o in ops),
                all_clear=all(o["t_clear"] is not None for o in ops))
