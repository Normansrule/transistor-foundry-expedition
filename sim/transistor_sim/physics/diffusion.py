"""Two-step dopant diffusion from a surface source: predeposition, then drive-in.

Predeposition holds the surface at a fixed concentration Cs (the source film or
gas keeps it topped up), giving the complementary-error-function profile
    N(x) = Cs erfc( x / 2√(D₁t₁) ),   dose Q = 2 Cs √(D₁t₁ / π).
The source is then removed and the wafer heated again. With a fixed dose the
profile spreads into a half-Gaussian,
    N(x) = Q / √(π Dt) · exp(−x² / 4Dt),   Dt = D₁t₁ + D₂t₂,
which is exact when the drive-in dominates and a fair approximation otherwise
(Plummer et al. ch. 7). D = D₀ exp(−Eₐ/kT) is the intrinsic diffusivity shared
with implant.py. The junction sits where N equals the background doping, and
the sheet resistance integrates Caughey–Thomas mobility over the layer.

erfc uses the Numerical Recipes Chebyshev fit (fractional error < 1.2e-7) so
that the JavaScript twin (site/js/physics/diffusion.js) gives identical numbers.
"""
from __future__ import annotations

import math

from .implant import IONS, Q, diffusivity, mobility


def erfc(x: float) -> float:
    z = abs(x)
    t = 1.0 / (1.0 + 0.5 * z)
    r = t * math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
    return r if x >= 0 else 2.0 - r


def predep_dose(Cs: float, D: float, t_s: float) -> float:
    """Dose (cm⁻²) put in by a constant-surface-concentration predeposition."""
    return 2 * Cs * math.sqrt(D * t_s / math.pi)


def erfc_profile(x_nm: float, Cs: float, Dt: float) -> float:
    return Cs * erfc(x_nm * 1e-7 / (2 * math.sqrt(Dt)))


def gauss_profile(x_nm: float, dose: float, Dt: float) -> float:
    x = x_nm * 1e-7
    return dose / math.sqrt(math.pi * Dt) * math.exp(-x * x / (4 * Dt))


def _layer(f, N_bg: float, carrier: str, xmax_nm: float, n: int):
    """Junction depth (nm) and sheet resistance (Ω/□) of a profile function f(x_nm) over a background."""
    x = [xmax_nm * i / (n - 1) for i in range(n)]
    N = [f(v) for v in x]
    k = -1
    for i in range(n):
        if N[i] > N_bg:
            k = i
    if k < 0:
        return 0.0, math.inf
    xj = x[k] + (x[k + 1] - x[k]) * (N[k] - N_bg) / (N[k] - N[k + 1]) if k + 1 < n else x[k]
    g = [Q * float(mobility(v + N_bg, carrier)) * max(v - N_bg, 0.0) for v in N]
    G = sum(0.5 * (g[i] + g[i - 1]) * (x[i] - x[i - 1]) for i in range(1, n)) * 1e-7
    return xj, (1.0 / G if G > 0 else math.inf)


def run(ion: str, Cs: float, T1_C: float, t1_s: float, T2_C: float, t2_s: float, N_bg: float, n: int = 600) -> dict:
    """Predeposition at T1 for t1, drive-in at T2 for t2, into a background N_bg (cm⁻³)."""
    D1, D2 = diffusivity(ion, T1_C), diffusivity(ion, T2_C)
    Dt1, Dt2 = D1 * t1_s, D2 * t2_s
    dose = predep_dose(Cs, D1, t1_s)
    carrier = IONS[ion]["type"]
    L1 = 2 * math.sqrt(Dt1) * 1e7
    xj1, Rs1 = _layer(lambda v: erfc_profile(v, Cs, Dt1), N_bg, carrier, 6 * L1, n)
    Dt = Dt1 + Dt2
    L = 2 * math.sqrt(Dt) * 1e7
    xj, Rs = _layer(lambda v: gauss_profile(v, dose, Dt), N_bg, carrier, 6 * L, n)
    return dict(D1=D1, D2=D2, Dt1=Dt1, Dt=Dt, dose=dose, xj_pre=xj1, Rs_pre=Rs1, xj=xj, Rs=Rs,
                Cs_after=dose / math.sqrt(math.pi * Dt), L_pre=L1, L=L)
