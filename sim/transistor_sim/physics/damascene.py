"""A damascene copper line: what the barrier and size effects do to its resistance.

Damascene wiring etches a trench into the dielectric, lines it with a barrier, fills
it with metal and polishes the top flat. The barrier (about 2 nm of TaN/Ta for copper)
carries almost no current, so only the core (w - 2t) x (h - t) conducts, and the core's
resistivity rises above bulk as the line narrows (surface and grain-boundary
scattering; Fuchs-Sondheimer and Mayadas-Shatzkes, as in interconnect.py). Cobalt,
ruthenium and tungsten need almost no barrier, which is why they compete with copper
in the narrowest lines (Gall 2016). Capacitance uses the same parallel-plate-plus-
fringe form with spacing equal to width, and the bare line's delay is the distributed
RC term 0.38 r c L^2 (Elmore).
"""
from __future__ import annotations

from .interconnect import METALS, c_per_um, r_per_um, resistivity


def run(metal: str = "Cu", w_nm: float = 20.0, ar: float = 2.0, barrier_nm: float | None = None, L_um: float = 100.0, k: float = 2.7) -> dict:
    t = METALS[metal]["barrier"] if barrier_nm is None else barrier_nm
    h = ar * w_nm
    wc, hc = max(w_nm - 2 * t, 0.5), max(h - t, 0.5)
    r = r_per_um(metal, w_nm, h, t)                          # Ohm per µm
    c = c_per_um(w_nm, h, w_nm, k)                           # F per µm
    rho_core = resistivity(metal, wc, hc)                    # µOhm cm
    rho_line = r * (w_nm * h * 1e-18) / 1e-6 * 1e8           # whole trench, µOhm cm
    return dict(t=t, h=h, wc=wc, hc=hc, core_share=wc * hc / (w_nm * h), rho_bulk=METALS[metal]["rho0"], rho_core=rho_core,
                rho_line=rho_line, r=r, c=c, rc=0.38 * r * c * L_um ** 2)
