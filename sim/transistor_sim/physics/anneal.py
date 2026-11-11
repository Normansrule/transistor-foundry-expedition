"""Thermal budget of an anneal: furnace, rapid thermal, spike and millisecond anneals.

An anneal heats the wafer from a base temperature T_b to a peak T_p at a ramp rate R,
holds it for t_hold, and cools it at the same rate. Dopant spreading depends only on
the thermal budget Dt = ∫ D(T(t)) dt (Plummer et al. ch. 7; Fair 1993). Each ramp
contributes ∫ D(T) dT / R, so a slow furnace ramp can add far more diffusion than
the hold itself, while a spike anneal with a fast ramp adds about a second's worth.
The equivalent time at the peak, t_eq = Dt / D(T_p), feeds the implant model:
    ΔR_p² → ΔR_p² + 2 D(T_p) t_eq.
D = D_0 exp(-E_a/kT) uses the intrinsic values shared with implant.py.
"""
from __future__ import annotations

import math

from .implant import diffusivity, junction

T_BASE = 500.0     # °C: diffusion below this is negligible on any of these time scales


def ramp_dt(ion: str, T_peak: float, rate: float, n: int = 400) -> float:
    """∫ D dT / R from T_BASE to T_peak (cm²) by Simpson's rule."""
    if T_peak <= T_BASE:
        return 0.0
    h = (T_peak - T_BASE) / n
    s = diffusivity(ion, T_BASE) + diffusivity(ion, T_peak)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * diffusivity(ion, T_BASE + i * h)
    return s * h / 3 / rate


def budget(ion: str, T_peak: float, hold_s: float, rate: float) -> dict:
    up = ramp_dt(ion, T_peak, rate)
    hold = diffusivity(ion, T_peak) * hold_s
    Dt = 2 * up + hold
    return dict(Dt=Dt, ramps=2 * up, hold=hold, t_eq=Dt / diffusivity(ion, T_peak),
                t_total=2 * (T_peak - T_BASE) / rate + hold_s, ramp_share=2 * up / Dt if Dt > 0 else 0.0)


def run(ion: str = "B", E_keV: float = 5.0, dose: float = 1e15, T_peak: float = 1050.0, hold_s: float = 1.0,
        rate: float = 100.0, N_bg: float = 1e17) -> dict:
    b = budget(ion, T_peak, hold_s, rate)
    j0 = junction(ion, E_keV, dose, N_bg)
    j = junction(ion, E_keV, dose, N_bg, T_peak, b["t_eq"])
    return dict(**b, xj0=j0["xj"], xj=j["xj"], Rs=j["Rs"], peak=j["peak"], Rp=j0["Rp"], sigma0=j0["sigma_nm"],
                sigma=j["sigma_nm"], L=math.sqrt(2 * b["Dt"]) * 1e7)
