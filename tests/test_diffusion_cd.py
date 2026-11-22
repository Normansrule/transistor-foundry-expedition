"""Concentration-dependent diffusion (Fair 1981; Plummer et al. 2000): D = D0 + D-(n/ni) + D=(n/ni)^2."""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from transistor_sim.physics import diffusion as D  # noqa: E402


def test_ni_at_furnace_temperature():
    assert D.ni_hot(1050.0) == pytest.approx(9.3e18, rel=0.01)       # Plummer: about 10^19 near 1000-1100 C
    assert D.ni_hot(900.0) < D.ni_hot(1000.0) < D.ni_hot(1100.0)


def test_low_doping_is_intrinsic_and_high_doping_much_faster():
    T = 1050.0
    k = D.K_EV * (T + 273.15)
    intrinsic = sum(A * math.exp(-E / k) for A, E in D.CD["P"])       # n = ni: every charge state at r = 1
    assert D.diffusivity_cd("P", 0.0, T) == pytest.approx(intrinsic)
    assert D.diffusivity_cd("P", 3e20, T) > 20 * D.diffusivity_cd("P", 0.0, T)
    assert D.diffusivity_cd("B", 1e20, T) > 3 * D.diffusivity_cd("B", 0.0, T)


def test_drive_in_keeps_the_dose_and_grid_converges():
    a = D.run_cd("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16)
    dx = a["x"][1] * 1e-7
    after = sum(0.5 * (a["N"][i] + a["N"][i - 1]) * dx for i in range(1, len(a["N"])))
    assert after == pytest.approx(a["dose"], rel=0.02)                # nothing leaves through the surface
    b = D.run_cd("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16, nx=601, nt=600)
    assert b["Rs"] == pytest.approx(a["Rs"], rel=0.02) and b["xj"] == pytest.approx(a["xj"], rel=0.02)


def test_heavy_phosphorus_puts_in_more_dose_and_conducts_better():
    i = D.run("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16)
    c = D.run_cd("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16)
    assert c["dose"] > 2 * i["dose"] and c["Rs"] < 0.5 * i["Rs"]
    hot = D.run_cd("P", 5e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16)
    assert hot["Rs"] < 0.5 * c["Rs"]                                    # D grows as N^2, so Cs matters a lot
