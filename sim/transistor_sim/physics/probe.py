"""Probe, dice and bond: which dies are good, what each costs, and how many bad ones escape test.

Wafer probe applies test patterns to every die. The wafer map comes from yieldcost.py
(dies on a grid inside the edge exclusion, defects scattered with gamma-distributed
clustering, so the yield follows the negative binomial of Stapper 1973). No test
catches every fault: with fault coverage T the fraction of shipped dies that are
actually bad, the defect level, is (Williams and Brown 1981)
    DL = 1 - Y^(1 - T),
so a low-yield process needs much higher coverage for the same parts-per-million.
Cost per good die is the wafer cost over the good dies found.
"""
from __future__ import annotations

from .yieldcost import simulate_wafer, yield_model


def defect_level(Y: float, T: float) -> float:
    return 1.0 - Y ** (1.0 - T)


def run(side_mm: float = 10.0, D0_cm2: float = 0.1, coverage: float = 0.99, wafer_usd: float = 18500.0, alpha: float = 3.0, seed: int = 7) -> dict:
    w = simulate_wafer(side_mm, side_mm, D0_cm2, alpha, seed)
    Y = yield_model(side_mm * side_mm, D0_cm2, "negbin", alpha)
    dl = defect_level(Y, coverage)
    n = len(w["dies"])
    return dict(n=n, good=w["good"], yield_mc=w["yield_"], Y=Y, dl_ppm=dl * 1e6, cost=wafer_usd / max(w["good"], 1),
                passed=w["good"] / (1 - dl) if dl < 1 else float("inf"), defects=w["defects"], dies=w["dies"])
