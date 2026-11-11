"""Wafer cleaning: what particles and metal traces left on the surface cost (conceptual chemistry only).

The cleaning chemistry itself is institution-only (safety tier 3); this model says nothing about
recipes. It follows what a clean is for, in two numbers:

Particles. A clean removes a fraction eta of the particles on each pass, so N = N0 (1 - eta)^n
are left. Particles are counted above an inspection size d0, and their sizes follow the
1/d^3 distribution used in yield modelling (Stapper 1983), so the share larger than a killer
size dk is (d0/dk)^2. Killer particles spread over the wafer add a defect density that the
negative-binomial yield model of yieldcost.py turns into lost dies.

Metals. Iron that reaches the bulk sits on interstitial sites and is a recombination centre:
minority-electron lifetime tau = 1 / (sigma_n v_th N_Fe), sigma_n = 5e-14 cm^2 (Istratov et al.
1999), v_th = 1.1e7 cm/s (Macdonald et al. 2001). The diffusion length L = sqrt(D tau), with
D = mu kT/q from Caughey-Thomas mobility, says how far an electron travels before it is lost.
"""
from __future__ import annotations

import math

from .implant import mobility
from .yieldcost import yield_model

D_INSPECT = 50.0        # nm, smallest particle the inspection counts (est.)
WAFER_CM2 = math.pi * 15.0 ** 2
SIGMA_N = 5e-14         # cm², interstitial iron, electrons (Istratov 1999)
V_TH = 1.1e7            # cm/s (Macdonald 2001)
N_A = 1.66e16           # cm⁻³, p-type substrate of the teaching-cleanroom run
KT_Q = 0.025852         # V at 300 K


def killer_fraction(dk_nm: float, d0_nm: float = D_INSPECT) -> float:
    return 1.0 if dk_nm <= d0_nm else (d0_nm / dk_nm) ** 2


def lifetime_s(N_fe: float) -> float:
    return 1.0 / (SIGMA_N * V_TH * N_fe)


def run(N0: float = 2000.0, eta: float = 0.9, passes: int = 1, dk_nm: float = 100.0, N_fe: float = 1e10,
        die_mm2: float = 100.0) -> dict:
    left = N0 * (1.0 - eta) ** passes
    f = killer_fraction(dk_nm)
    killers = left * f
    D_add = killers / WAFER_CM2
    Y = yield_model(die_mm2, D_add)
    Y0 = yield_model(die_mm2, N0 * f / WAFER_CM2)
    tau = lifetime_s(N_fe)
    D = mobility(N_A, "n") * KT_Q
    L_um = math.sqrt(D * tau) * 1e4
    return dict(left=left, removed=N0 - left, f_kill=f, killers=killers, D_add=D_add, Y=float(Y), Y_dirty=float(Y0),
                tau_us=tau * 1e6, D=float(D), L_um=L_um)
