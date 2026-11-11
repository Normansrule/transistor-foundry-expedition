"""A real teaching-cleanroom run checked against the models.

Small closed-form helpers used to compare measurements from one four-mask NMOS run
(a university teaching cleanroom, 2024) with the site's physics models:

* oxide_sequence: chains Deal–Grove steps (for example dry–wet–dry field oxide).
* parabolic_only: x = sqrt(B t), the estimate that ignores the linear term.
* effective_pressure: oxidant pressure that makes Deal–Grove match a measured
  thickness (a weak bubbler gives far less than 1 atm of steam).
* resistivity_to_doping: N = 1 / (q mu(N) rho), solved with Caughey–Thomas mobility.
* parallel_plate_pf, lcr_reading_pf: ideal oxide capacitance, and what a
  parallel-mode LCR meter reads when a series resistance R sits in the path,
  C_meas = C / (1 + (w R C)^2).
* vt_ideal, oxide_charge_from_vt: long-channel threshold with no oxide charge,
  and the fixed positive oxide charge Q_ox/q that moves it to the measured value.
* isotropic_bias_um, implied_overetch: a wet (isotropic) etch undercuts by the
  film thickness on each side, so an opening grows by 2 t (1 + over-etch).
* sheet_from_resistor: R_s = R W / L.

Twin: site/js/physics/labrun.js.
"""
from __future__ import annotations

import math

from . import oxidation
from .carriers import K_B, intrinsic_density
from .implant import mobility
from .junction import EPS0, Q

EPS_OX = 3.9 * EPS0          # F/cm
EPS_SI = 11.7 * EPS0         # F/cm
EG_SI = 1.12                 # eV at 300 K
CHI_SI = 4.05                # eV, electron affinity
PHI_M = {"al": 4.10, "n+poly": CHI_SI, "p+poly": CHI_SI + EG_SI}


def oxide_sequence(steps, orient: str = "100", x0_um: float | None = None) -> list[float]:
    """Thickness (µm) after each (ambient, T_C, minutes[, p_atm]) step, each starting from the last."""
    out, x = [], x0_um
    for st in steps:
        amb, T, minutes = st[0], st[1], st[2]
        p = st[3] if len(st) > 3 else 1.0
        x = float(oxidation.thickness(amb, T, minutes / 60.0, orient, p, x))
        out.append(x)
    return out


def parabolic_only(ambient: str, T_C: float, minutes: float, orient: str = "100") -> float:
    """x = sqrt(B t) in µm: the diffusion-limited estimate that drops the linear term."""
    B, _ = oxidation.rate_constants(ambient, T_C, orient)
    return math.sqrt(B * minutes / 60.0)


def effective_pressure(ambient: str, T_C: float, minutes: float, x_um: float, orient: str = "100",
                       x0_um: float | None = None) -> float:
    """Oxidant pressure (atm) at which Deal–Grove grows x_um in the given time (bisection in log p)."""
    lo, hi = -5.0, 1.5
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        x = float(oxidation.thickness(ambient, T_C, minutes / 60.0, orient, 10 ** mid, x0_um))
        lo, hi = (mid, hi) if x < x_um else (lo, mid)
    return 10 ** (0.5 * (lo + hi))


def resistivity_to_doping(rho_ohm_cm: float, carrier: str = "p") -> float:
    """Dopant density (cm⁻³) whose majority carriers give resistivity rho (fixed-point on mobility)."""
    N = 1.0 / (Q * 400.0 * rho_ohm_cm)
    for _ in range(100):
        N = 1.0 / (Q * mobility(N, carrier) * rho_ohm_cm)
    return N


def parallel_plate_pf(area_um2: float, t_nm: float, k: float = 3.9) -> float:
    """Ideal parallel-plate capacitance in pF."""
    return k * EPS0 * (area_um2 * 1e-8) / (t_nm * 1e-7) * 1e12


def lcr_reading_pf(C_pf: float, R_ohm: float, f_hz: float = 1e6) -> float:
    """What a parallel-mode (Cp) meter reads for a true C in series with R."""
    wrc = 2 * math.pi * f_hz * R_ohm * C_pf * 1e-12
    return C_pf / (1 + wrc * wrc)


def series_r_for_reading(C_pf: float, Cmeas_pf: float, f_hz: float = 1e6) -> float:
    """Series resistance (Ω) that would make a true C read as Cmeas (0 if Cmeas ≥ C)."""
    if Cmeas_pf >= C_pf:
        return 0.0
    return math.sqrt(C_pf / Cmeas_pf - 1) / (2 * math.pi * f_hz * C_pf * 1e-12)


def phi_b(Na: float, T: float = 300.0) -> float:
    return K_B * T * math.log(Na / intrinsic_density("Si", T))


def phi_ms(Na: float, gate: str = "n+poly", T: float = 300.0) -> float:
    """Work-function difference (V) between the gate and p-type silicon."""
    return PHI_M[gate] - (CHI_SI + EG_SI / 2 + phi_b(Na, T))


def vt_ideal(Na: float, tox_nm: float, gate: str = "n+poly", Nox_cm2: float = 0.0, T: float = 300.0) -> float:
    """Long-channel NMOS threshold (V) on p-type silicon, with a fixed oxide charge Nox (cm⁻², positive)."""
    Cox = EPS_OX / (tox_nm * 1e-7)
    pb = phi_b(Na, T)
    Qd = math.sqrt(2 * EPS_SI * Q * Na * 2 * pb)
    return phi_ms(Na, gate, T) - Q * Nox_cm2 / Cox + 2 * pb + Qd / Cox


def oxide_charge_from_vt(vt_meas: float, Na: float, tox_nm: float, gate: str = "n+poly", T: float = 300.0) -> float:
    """Fixed positive oxide charge (cm⁻²) that moves the ideal threshold to vt_meas."""
    Cox = EPS_OX / (tox_nm * 1e-7)
    return (vt_ideal(Na, tox_nm, gate, 0.0, T) - vt_meas) * Cox / Q


def builtin_potential(Na: float, Nd: float, T: float = 300.0) -> float:
    ni = intrinsic_density("Si", T)
    return K_B * T * math.log(Na * Nd / (ni * ni))


def isotropic_bias_um(t_film_um: float, overetch: float = 0.0) -> float:
    """Total width change (µm) of an opening after a wet etch: 2 t (1 + over-etch fraction)."""
    return 2 * t_film_um * (1 + overetch)


def implied_overetch(bias_um: float, t_film_um: float) -> float:
    """Over-etch fraction that explains a measured width change, assuming isotropic etching."""
    return abs(bias_um) / (2 * t_film_um) - 1


def sheet_from_resistor(R_ohm: float, L_um: float, W_um: float) -> float:
    """Sheet resistance (Ω/sq) from a measured resistor: R W / L."""
    return R_ohm * W_um / L_um
