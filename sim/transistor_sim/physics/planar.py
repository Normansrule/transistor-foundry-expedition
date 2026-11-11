"""Hoerni's planar junction: diffusion through an oxide window, and where it breaks down.

Boron is diffused into n-type silicon through a window in a masking oxide (two-step
predeposition and drive-in, diffusion.py). The junction comes up under the oxide edge
with a radius of curvature about equal to its depth x_j, and stays covered by oxide
where it meets the surface, which is what made planar devices stable.

Avalanche breakdown of a one-sided abrupt junction on the lightly doped side
(Sze and Gibbons 1966):
    BV_pp = 60 (Eg / 1.1)^(3/2) (N_B / 1e16)^(-3/4)  V
with depletion width at breakdown W = sqrt(2 eps BV_pp / q N_B). The curved edge of a
planar junction concentrates the field and breaks down first (Sze and Gibbons 1966):
    BV_cyl / BV_pp = sqrt( (r/W)^2 + 2 (r/W)^(6/7) ) - r/W,     r = x_j.
"""
from __future__ import annotations

import math

from .diffusion import run as diffuse

Q = 1.602176634e-19
EPS_SI = 11.7 * 8.8541878128e-14     # F/cm
EG = 1.12
CS, T1, T1_S = 1e20, 1000.0, 1200.0  # boron predeposition shared by every case (teaching values)


def bv_plane(N_B: float) -> float:
    return 60.0 * (EG / 1.1) ** 1.5 * (N_B / 1e16) ** -0.75


def depletion_um(V: float, N_B: float) -> float:
    return math.sqrt(2 * EPS_SI * V / (Q * N_B)) * 1e4


def cyl_ratio(r_over_w: float) -> float:
    x = r_over_w
    return math.sqrt(x * x + 2 * x ** (6 / 7)) - x


def run(N_B: float = 1e15, T2: float = 1100.0, t2_min: float = 60.0) -> dict:
    d = diffuse("B", CS, T1, T1_S, T2, t2_min * 60.0, N_B)
    bv = bv_plane(N_B)
    W = depletion_um(bv, N_B)
    xj_um = d["xj"] / 1000.0
    ratio = cyl_ratio(xj_um / W)
    return dict(xj=d["xj"], Rs=d["Rs"], lateral=0.8 * d["xj"], bv_pp=bv, W_um=W, r_over_w=xj_um / W, ratio=ratio, bv_cyl=bv * ratio)
