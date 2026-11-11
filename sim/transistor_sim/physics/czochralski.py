"""Czochralski crystal growth: how the dopant spreads along the ingot.

A crystal pulled slowly from a well-stirred melt takes in only a fraction k of the
dopant in the liquid at the interface (the equilibrium segregation coefficient,
Trumbore 1960). The rejected dopant stays in the shrinking melt, so with a fraction
f of the charge frozen the solid at the interface holds (the Scheil equation,
Scheil 1942; Plummer et al. ch. 3)
    C_s(f) = k C_0 (1 - f)^(k - 1).
Boron (k = 0.8) barely changes along the ingot; antimony (k = 0.023) piles up
fast in the melt. Resistivity follows from rho = 1 / (q mu(N) N) with
Caughey-Thomas mobility, and the usable length is the part of the ingot whose
resistivity stays inside the customer's tolerance band around the seed-end value.
"""
from __future__ import annotations

import math

from .implant import Q, mobility
from .labrun import resistivity_to_doping

K0 = {"B": 0.8, "P": 0.35, "As": 0.3, "Sb": 0.023}     # Trumbore (1960), Plummer et al. table 3-2
CARRIER = {"B": "p", "P": "n", "As": "n", "Sb": "n"}
F_MAX = 0.98                                           # the last of the melt is never pulled


def concentration(f: float, k: float, N_seed: float) -> float:
    """Dopant density (cm⁻³) in the crystal after a fraction f of the melt has frozen."""
    return N_seed * (1.0 - f) ** (k - 1.0)


def resistivity(N: float, carrier: str) -> float:
    return 1.0 / (Q * float(mobility(N, carrier)) * N)


def usable_fraction(k: float, N_seed: float, carrier: str, tol: float) -> float:
    """Largest f whose resistivity is still within ±tol of the seed end (bisection; rho falls with f when k < 1)."""
    rho0 = resistivity(N_seed, carrier)
    ok = lambda f: abs(resistivity(concentration(f, k, N_seed), carrier) / rho0 - 1.0) <= tol
    if ok(F_MAX):
        return F_MAX
    lo, hi = 0.0, F_MAX
    for _ in range(60):
        m = 0.5 * (lo + hi)
        lo, hi = (m, hi) if ok(m) else (lo, m)
    return lo


def run(dopant: str = "B", rho_seed: float = 10.0, tol: float = 0.2, n: int = 120) -> dict:
    """Pull an ingot doped for rho_seed (Ω·cm) at the seed end. Returns the profile and the usable fraction."""
    k, c = K0[dopant], CARRIER[dopant]
    N0 = resistivity_to_doping(rho_seed, c)
    fs = [F_MAX * i / (n - 1) for i in range(n)]
    N = [concentration(f, k, N0) for f in fs]
    rho = [resistivity(x, c) for x in N]
    fu = usable_fraction(k, N0, c, tol)
    return dict(k=k, carrier=c, N_seed=N0, melt0=N0 / k, f=fs, N=N, rho=rho, f_usable=fu,
                rho_tail=rho[-1], ratio_tail=N[-1] / N0, rho_at_usable=resistivity(concentration(fu, k, N0), c))
