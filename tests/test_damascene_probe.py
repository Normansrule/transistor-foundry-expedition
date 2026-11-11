"""Damascene copper and wafer probe: the closed forms behind the two newest process theatres."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import damascene as D, interconnect as I, probe as P, yieldcost as Y  # noqa: E402


def test_wide_lines_approach_bulk_and_narrow_lines_do_not():
    wide, narrow = D.run("Cu", 1000.0, 2.0, 2.0), D.run("Cu", 10.0, 2.0, 2.0)
    assert wide["rho_line"] / wide["rho_bulk"] < 1.2
    assert narrow["rho_line"] > 3 * narrow["rho_core"] / 2 > narrow["rho_bulk"]


def test_whole_trench_resistivity_counts_the_dead_barrier():
    r = D.run("Cu", 20.0, 2.0, 2.0)
    assert r["rho_line"] == pytest.approx(r["rho_core"] / r["core_share"], rel=1e-12)
    assert r["r"] == pytest.approx(I.r_per_um("Cu", 20.0, 40.0, 2.0), rel=1e-12)
    assert D.run("Cu", 20.0, 2.0, 4.0)["r"] > r["r"]


def test_barrierless_ruthenium_beats_copper_only_when_narrow():
    assert D.run("Ru", 10.0)["rho_line"] < D.run("Cu", 10.0)["rho_line"]
    assert D.run("Ru", 100.0)["rho_line"] > D.run("Cu", 100.0)["rho_line"]


def test_rc_grows_with_length_squared():
    a, b = D.run(L_um=100.0)["rc"], D.run(L_um=1000.0)["rc"]
    assert b / a == pytest.approx(100.0, rel=1e-12)


def test_williams_brown_defect_level():
    assert P.defect_level(1.0, 0.5) == 0.0 and P.defect_level(0.5, 1.0) == 0.0
    assert P.defect_level(0.5, 0.0) == pytest.approx(0.5)
    assert P.defect_level(0.9, 0.99) < P.defect_level(0.9, 0.9) < P.defect_level(0.6, 0.9)


def test_probe_wafer_matches_the_yield_model():
    r = P.run(8.0, 0.2, 0.99, 18500.0)
    assert r["n"] == len(Y.die_grid(8.0, 8.0))
    assert r["Y"] == pytest.approx(Y.yield_model(64.0, 0.2, "negbin", 3.0), rel=1e-12)
    assert abs(r["yield_mc"] - r["Y"]) < 0.05
    assert r["cost"] == pytest.approx(18500.0 / r["good"], rel=1e-12)
