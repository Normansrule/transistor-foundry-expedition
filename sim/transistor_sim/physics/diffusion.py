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


def run(ion: str, Cs: float, T1_C: float, t1_s: float, T2_C: float, t2_s: float, N_bg: float, n: int = 600,
        S2: float = 1.0) -> dict:
    """Predeposition at T1 for t1, drive-in at T2 for t2, into a background N_bg (cm⁻³). S2 is the
    interstitial supersaturation C_I/C_I* during the drive-in (1 in an inert ambient, above 1 while oxide grows)."""
    D1, D2 = diffusivity(ion, T1_C), diffusivity(ion, T2_C) * oed_factor(ion, S2)
    Dt1, Dt2 = D1 * t1_s, D2 * t2_s
    dose = predep_dose(Cs, D1, t1_s)
    carrier = IONS[ion]["type"]
    L1 = 2 * math.sqrt(Dt1) * 1e7
    xj1, Rs1 = _layer(lambda v: erfc_profile(v, Cs, Dt1), N_bg, carrier, 6 * L1, n)
    Dt = Dt1 + Dt2
    L = 2 * math.sqrt(Dt) * 1e7
    xj, Rs = _layer(lambda v: gauss_profile(v, dose, Dt), N_bg, carrier, 6 * L, n)
    return dict(D1=D1, D2=D2, Dt1=Dt1, Dt=Dt, dose=dose, xj_pre=xj1, Rs_pre=Rs1, xj=xj, Rs=Rs,
                Cs_after=dose / math.sqrt(math.pi * Dt), L_pre=L1, L=L, oed=oed_factor(ion, S2))


# ---------------------------------------------------------------- oxidation-enhanced and -retarded diffusion
# A growing oxide injects silicon interstitials into the silicon below it (Hu 1974). Each dopant moves partly
# with interstitials (fraction f_I) and partly with vacancies; if interstitials and vacancies stay in local
# equilibrium with each other (C_I·C_V = C_I*·C_V*), the diffusivity scales as (Plummer et al. 2000, ch. 7)
#     D / D* = f_I · S + (1 − f_I) / S,      S = C_I / C_I*
# so boron and phosphorus speed up under an oxidising drive-in while antimony slows down.
FI = {"B": 0.9, "P": 0.95, "As": 0.4, "Sb": 0.02}


def oed_factor(ion: str, S: float) -> float:
    """Diffusivity multiplier for interstitial supersaturation S (S = 1 gives 1)."""
    f = FI[ion]
    return f * S + (1.0 - f) / S


# ---------------------------------------------------------------- concentration-dependent diffusion
# Above the intrinsic carrier density at the furnace temperature, dopants diffuse through charged vacancies
# whose number grows with the electron (or hole) density, so D rises with the doping itself (Fair 1981;
# Plummer et al. 2000, table 7-5):
#     n-type:  D = D⁰ + D⁻ (n/nᵢ) + D⁼ (n/nᵢ)²          p-type:  D = D⁰ + D⁺ (p/nᵢ)
# with each term A exp(−E/kT) and nᵢ = 3.9e16 T^1.5 exp(−0.605 eV / kT) at furnace temperatures.
# The diffusion equation ∂N/∂t = ∂/∂x (D(N) ∂N/∂x) is solved on a uniform grid with backward Euler,
# D taken from the previous step; predeposition holds N(0) = Cs, drive-in has no flux through the surface.
K_EV = 8.617333262e-5
CD = {                                    # (A cm²/s, E eV) for each charge state
    "P": [(3.85, 3.66), (4.44, 4.00), (44.2, 4.37)],
    "As": [(0.066, 3.44), (12.0, 4.05)],
    "Sb": [(0.214, 3.65), (15.0, 4.08)],
    "B": [(0.037, 3.46), (0.41, 3.46)],
}


def ni_hot(T_C: float) -> float:
    """Intrinsic carrier density (cm⁻³) at furnace temperature."""
    T = T_C + 273.15
    return 3.9e16 * T ** 1.5 * math.exp(-0.605 / (K_EV * T))


def diffusivity_cd(ion: str, N: float, T_C: float) -> float:
    """Diffusivity (cm²/s) at net dopant density N (cm⁻³) and temperature T_C."""
    T, n_i = T_C + 273.15, ni_hot(T_C)
    h = 0.5 * N
    r = (h + math.sqrt(h * h + n_i * n_i)) / n_i       # n/nᵢ (or p/nᵢ) with the dopant fully ionised
    d, f = 0.0, 1.0
    for A, E in CD[ion]:
        d += A * math.exp(-E / (K_EV * T)) * f
        f *= r
    return d


def _solve(ion, N, dx, T_C, t_s, nt, Cs, mult=1.0):
    nx = len(N)
    dt = t_s / nt
    k = dt / (dx * dx)
    for _ in range(nt):
        Dv = [diffusivity_cd(ion, v, T_C) * mult for v in N]
        a, b, c, d = [0.0] * nx, [1.0] * nx, [0.0] * nx, N[:]
        for i in range(1, nx - 1):
            a[i] = -k * 0.5 * (Dv[i - 1] + Dv[i])
            c[i] = -k * 0.5 * (Dv[i] + Dv[i + 1])
            b[i] = 1.0 - a[i] - c[i]
        if Cs is not None:
            d[0] = Cs
        else:
            c[0] = -2.0 * k * 0.5 * (Dv[0] + Dv[1])
            b[0] = 1.0 - c[0]
        d[nx - 1] = 0.0
        for i in range(1, nx):
            m = a[i] / b[i - 1]
            b[i] -= m * c[i - 1]
            d[i] -= m * d[i - 1]
        N[nx - 1] = d[nx - 1] / b[nx - 1]
        for i in range(nx - 2, -1, -1):
            N[i] = (d[i] - c[i] * N[i + 1]) / b[i]
    return N


def run_cd(ion: str, Cs: float, T1_C: float, t1_s: float, T2_C: float, t2_s: float, N_bg: float,
           nx: int = 301, nt: int = 300, S2: float = 1.0) -> dict:
    """Predeposition and drive-in with concentration-dependent diffusivity. Returns junction depth (nm),
    sheet resistance (Ω/□), dose (cm⁻²) and the final profile (x in nm, N in cm⁻³)."""
    m2 = oed_factor(ion, S2)
    reach = diffusivity_cd(ion, Cs, T1_C) * t1_s + diffusivity_cd(ion, Cs, T2_C) * t2_s * max(m2, 1.0)
    L = 8.0 * math.sqrt(reach)                          # cm, well beyond the junction
    dx = L / (nx - 1)
    N = [0.0] * nx
    N[0] = Cs
    N = _solve(ion, N, dx, T1_C, t1_s, nt, Cs)
    dose = sum(0.5 * (N[i] + N[i - 1]) * dx for i in range(1, nx))
    N = _solve(ion, N, dx, T2_C, t2_s, nt, None, m2)
    x = [i * dx * 1e7 for i in range(nx)]
    carrier = IONS[ion]["type"]
    k = -1
    for i in range(nx):
        if N[i] > N_bg:
            k = i
    if k < 0:
        xj, Rs = 0.0, math.inf
    else:
        xj = x[k] + (x[k + 1] - x[k]) * (N[k] - N_bg) / (N[k] - N[k + 1]) if k + 1 < nx else x[k]
        g = [Q * float(mobility(v + N_bg, carrier)) * max(v - N_bg, 0.0) for v in N]
        G = sum(0.5 * (g[i] + g[i - 1]) * (x[i] - x[i - 1]) for i in range(1, nx)) * 1e-7
        Rs = 1.0 / G if G > 0 else math.inf
    return dict(xj=xj, Rs=Rs, dose=dose, Cs_after=N[0], ni=ni_hot(T2_C), x=x, N=N,
                D_surf=diffusivity_cd(ion, Cs, T1_C), D_int=diffusivity_cd(ion, 0.0, T1_C), oed=m2)
