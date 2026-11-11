"""Filling a trench: step coverage for sputtering (PVD), chemical vapour deposition (CVD) and atomic
layer deposition (ALD).

Precursor (or sputtered metal) enters a trench of width w and depth L and is lost on each wall hit with
reaction (sticking) probability s. In the molecular-flow limit the concentration n(z) down the trench
obeys a diffusion-reaction balance (Knudsen diffusion along the slit, reaction on both walls):
    n'' = (3 s / (2 w(z)^2)) n,    n(0) = 1 at the mouth,  n'(L) = 0 at the floor,
so the film grows fastest at the mouth and thins with depth over a length of order w / sqrt(s). With s
near 1 (sputtering) the bottom is starved and the mouth closes over a void; with small s (CVD) the film
is more conformal (Plummer et al. 2000). The width w(z) shrinks as the film grows, so the equation is
re-solved every step and the mouth can pinch off.

ALD splits growth into self-limiting half-cycles (George 2010): each cycle adds one growth-per-cycle
layer wherever the exposure was enough to saturate the surface, here where exposure x n(z) >= 1 with a
small reaction probability. Rates and probabilities are teaching values (est.).
"""
from __future__ import annotations

import math

NZ = 48                 # depth levels
GPC = 0.11              # nm per ALD cycle, Al2O3 from trimethylaluminium and water (George 2010)
S_ALD = 0.01            # ALD reaction probability (est.)
SEAM = 0.10             # a gap narrower than this fraction of the trench when the mouth closes is a seam, not a void
METHODS = {"pvd": dict(s=1.0, name="Sputtering (PVD)"), "cvd": dict(s=0.05, name="CVD"), "ald": dict(s=S_ALD, name="ALD")}


def _thomas(a, b, c, d):
    n = len(d)
    cp, dp = [0.0] * n, [0.0] * n
    cp[0], dp[0] = c[0] / b[0], d[0] / b[0]
    for i in range(1, n):
        m = b[i] - a[i] * cp[i - 1]
        cp[i] = c[i] / m if i < n - 1 else 0.0
        dp[i] = (d[i] - a[i] * dp[i - 1]) / m
    x = [0.0] * n
    x[-1] = dp[-1]
    for i in range(n - 2, -1, -1):
        x[i] = dp[i] - cp[i] * x[i + 1]
    return x


def flux(widths, depth: float, s: float):
    """n(z) at NZ+1 levels from the mouth (z=0) to the floor (z=depth) for local widths widths[k] (nm)."""
    h = depth / NZ
    n = NZ + 1
    a, b, c, d = [0.0] * n, [0.0] * n, [0.0] * n, [0.0] * n
    b[0], d[0] = 1.0, 1.0                           # mouth: n = 1
    for k in range(1, n):
        wk = max(widths[k], 1e-3)
        g = 1.5 * s / (wk * wk) * h * h
        if k < n - 1:
            a[k], b[k], c[k] = -1.0, 2.0 + g, -1.0
        else:                                       # floor: zero gradient (mirror node)
            a[k], b[k] = -2.0, 2.0 + g
    return _thomas(a, b, c, d)


def fill(method: str, w: float, ar: float, target_nm: float, s: float | None = None, exposure: float = 20.0, steps: int = 160) -> dict:
    """Grow a film of nominal (top-surface) thickness target_nm into a trench of width w and aspect ratio ar.

    Returns per-level sidewall thickness (nm), floor thickness, top thickness, step coverage
    (thinnest sidewall / top), whether and where a void closed, and the ALD cycle count."""
    depth = ar * w
    s = METHODS[method]["s"] if s is None else s
    side = [0.0] * (NZ + 1)
    top, closed_at, void_z = 0.0, None, None
    dt = target_nm / steps
    for i in range(steps):
        widths = [w - 2 * t for t in side]
        if widths[0] <= 0.0:                       # mouth pinched off: whatever is open below is a void
            if closed_at is None:
                closed_at = top
                open_below = [k for k in range(NZ + 1) if widths[k] > SEAM * w]   # a hairline seam is not a void
                void_z = [depth * open_below[0] / NZ, depth * open_below[-1] / NZ] if open_below else None
            top += dt
            continue
        n = flux(widths, depth, s)
        for k in range(NZ + 1):
            if widths[k] <= 0.0:
                continue
            g = min(1.0, exposure * n[k]) if method == "ald" else n[k]
            side[k] = min(side[k] + dt * g, w / 2)
        top += dt
    cov = min(side) / top if top > 0 else 0.0
    return dict(depth=depth, side=side, floor=side[-1], top=top, coverage=cov, bottom_ratio=side[-1] / top if top else 0.0,
                void=void_z is not None, void_z=void_z, closed_at=closed_at,
                cycles=int(math.ceil(target_nm / GPC)) if method == "ald" else None)
