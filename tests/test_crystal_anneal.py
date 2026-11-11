"""Czochralski segregation and anneal thermal budget: the closed forms behind the two new theatres."""
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import anneal as A, czochralski as C, implant  # noqa: E402


def test_scheil_conserves_dopant():
    # dopant frozen into the first fraction F of the ingot is what left the melt: C0 [1 - (1 - F)^k]
    F, n = C.F_MAX, 200000
    for k in C.K0.values():
        frozen = sum(C.concentration((i + 0.5) * F / n, k, k) for i in range(n)) * F / n   # N_seed = k, so C0 = 1
        assert frozen == pytest.approx(1 - (1 - F) ** k, rel=1e-4)


def test_boron_spreads_least_and_antimony_most():
    use = {d: C.run(d, 10.0, 0.2)["f_usable"] for d in C.K0}
    assert use["B"] > use["P"] > use["As"] > use["Sb"]
    assert C.run("B", 10.0, 0.05)["f_usable"] < C.run("B", 10.0, 0.2)["f_usable"]


def test_usable_fraction_sits_on_the_tolerance_edge():
    r = C.run("P", 5.0, 0.1)
    assert r["rho_at_usable"] / r["rho"][0] == pytest.approx(0.9, rel=1e-6)
    # with mobility held constant the edge would be (1 - f)^(k-1) = 1/0.9
    assert abs(r["f_usable"] - (1 - (1 / 0.9) ** (1 / (C.K0["P"] - 1)))) < 0.03


def test_ramp_budget_matches_the_integral():
    T, R = 1050.0, 50.0
    exact = 0.0
    n = 20000
    for i in range(n):
        Tm = A.T_BASE + (i + 0.5) * (T - A.T_BASE) / n
        exact += implant.diffusivity("B", Tm) * (T - A.T_BASE) / n / R
    assert A.ramp_dt("B", T, R) == pytest.approx(exact, rel=1e-6)


def test_budget_adds_up_and_spike_beats_furnace():
    b = A.budget("B", 1050, 10.0, 100.0)
    assert b["Dt"] == pytest.approx(b["ramps"] + implant.diffusivity("B", 1050) * 10.0, rel=1e-12)
    spike, furnace = A.run(hold_s=0.001, rate=250), A.run(T_peak=1000, hold_s=1800, rate=0.1)
    assert spike["xj"] < 1.1 * spike["xj0"] and furnace["xj"] > 5 * furnace["xj0"]
    # a slower ramp only ever adds budget
    assert A.budget("B", 1050, 1.0, 5.0)["Dt"] > A.budget("B", 1050, 1.0, 150.0)["Dt"]
    assert math.isclose(A.budget("B", 1050, 0.0, 1e9)["Dt"], 0.0, abs_tol=1e-20)
