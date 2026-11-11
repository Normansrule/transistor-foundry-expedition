"""Chemical-mechanical polishing (CMP) of an oxide layer over patterned lines.

Removal follows Preston's law (1927): rate = Kp P V, pressure times relative pad velocity. Over a
pattern the pad first touches only the raised areas, so the local pressure there is P / rho for a
pattern density rho and the raised oxide goes faster than the blanket rate; the low areas are not
polished at all. Once the step height h falls below a contact height hc the pad also reaches the low
areas. The pressure is shared so the average stays P (Stine et al. 1998):
    h >= hc:  up rate = K / rho,                         down rate = 0
    h <  hc:  up rate = K (1 - h/hc + h/(hc rho)),       down rate = K (1 - h/hc)
with K = Kp P V. Dense regions planarise more slowly than sparse ones, which leaves the die surface
uneven by an amount that depends on the layout: the reason fabs add dummy fill. Kp and hc are teaching
values (est.).
"""
from __future__ import annotations

KP = 7.0             # nm / min per (kPa x m/s), oxide on a stiff pad (est.): 28 kPa at 1 m/s gives ~200 nm/min
HC = 120.0           # nm, contact height (est.)
STEP0 = 500.0        # nm, line height under the oxide: the initial step (est.)
OX0 = 1000.0         # nm, oxide deposited in the low (field) areas (est.)
DENSITIES = (0.2, 0.5, 0.8)
DT = 0.02            # min


def rate(P_kPa: float, V_ms: float) -> float:
    """Blanket removal rate, nm/min (Preston)."""
    return KP * P_kPa * V_ms


def polish(rho: float, P_kPa: float, V_ms: float, t_min: float, n_out: int = 60) -> dict:
    """Up and down oxide surface heights (nm above the wafer base) during t_min minutes of polishing."""
    K = rate(P_kPa, V_ms)
    up, down = OX0 + STEP0, OX0
    steps = int(round(t_min / DT))
    hist, every = [], max(1, steps // n_out)
    t_flat = None
    for i in range(steps + 1):
        if i % every == 0 or i == steps:
            hist.append([round(i * DT, 6), up, down])
        if i == steps:
            break
        h = up - down
        if h >= HC:
            ru, rd = K / rho, 0.0
        else:
            ru, rd = K * (1 - h / HC + h / (HC * rho)), K * (1 - h / HC)
        up -= ru * DT
        down -= rd * DT
        if t_flat is None and up - down < 5.0:
            t_flat = (i + 1) * DT
    return dict(up=up, down=down, step=up - down, over_line=up - STEP0, t_flat=t_flat, hist=hist)


def run(P_kPa: float = 28.0, V_ms: float = 1.0, t_min: float = 3.0) -> dict:
    """The theatre's three regions of different pattern density polished together."""
    regs = [dict(rho=r, **polish(r, P_kPa, V_ms, t_min)) for r in DENSITIES]
    tops = [g["up"] for g in regs]
    return dict(K=rate(P_kPa, V_ms), regions=regs, range_nm=max(tops) - min(tops))
