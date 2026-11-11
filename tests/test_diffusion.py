"""Diffusion theatre model: predeposition (erfc) and drive-in (Gaussian)."""
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import diffusion as D  # noqa: E402
from transistor_sim.physics.implant import diffusivity  # noqa: E402


def test_erfc_fit_matches_the_library():
    for x in (-2.0, -0.5, 0.0, 0.3, 1.0, 2.0, 3.5):
        assert abs(D.erfc(x) - math.erfc(x)) <= 1.2e-7 * max(math.erfc(x), 1e-12) + 1e-7


def test_predeposition_dose_and_drive_in_conserve_dopant():
    Cs, Dc, t = 3e20, diffusivity("P", 1050), 600
    Q = D.predep_dose(Cs, Dc, t)
    # integrate the erfc profile numerically: ∫Cs erfc(x/2√Dt) dx = 2 Cs √(Dt/π)
    L = 2 * math.sqrt(Dc * t) * 1e7
    xs = [8 * L * i / 4000 for i in range(4001)]
    num = sum(0.5 * (D.erfc_profile(xs[i], Cs, Dc * t) + D.erfc_profile(xs[i - 1], Cs, Dc * t)) * (xs[i] - xs[i - 1]) for i in range(1, 4001)) * 1e-7
    assert num == pytest.approx(Q, rel=1e-3)
    Dt = Dc * t * 4
    num = sum(0.5 * (D.gauss_profile(xs[i] * 2, Q, Dt) + D.gauss_profile(xs[i - 1] * 2, Q, Dt)) * (xs[i] - xs[i - 1]) * 2 for i in range(1, 4001)) * 1e-7
    assert num == pytest.approx(Q, rel=1e-3)


def test_junction_depth_matches_the_closed_form():
    r = D.run("P", 3e20, 1050, 600, 1050, 2220, 1.66e16)
    N0 = r["dose"] / math.sqrt(math.pi * r["Dt"])
    assert r["xj"] == pytest.approx(2 * math.sqrt(r["Dt"] * math.log(N0 / 1.66e16)) * 1e7, rel=2e-3)
    assert r["xj"] > r["xj_pre"] and r["Cs_after"] < 3e20


def test_trends_the_failure_demos_describe():
    base = D.run("P", 3e20, 1050, 600, 1050, 2220, 1.66e16)
    assert D.run("P", 3e20, 1050, 600, 1050, 2220, 1e17)["xj"] < base["xj"]
    short = D.run("P", 3e20, 1050, 120, 1050, 2220, 1.66e16)
    assert short["dose"] / base["dose"] == pytest.approx(math.sqrt(0.2)) and short["Rs"] > 1.8 * base["Rs"]
    long = D.run("P", 3e20, 1050, 600, 1050, 7200, 1.66e16)
    assert long["xj"] > 1.4 * base["xj"] and long["Cs_after"] < base["Cs_after"]
    # the teaching-process default lands near the process manual's 1 µm junction assumption
    assert 700 < base["xj"] < 1300
