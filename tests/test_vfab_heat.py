"""Thermal budget in the Virtual Fab: hot steps after doping keep moving the junctions already made."""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from transistor_sim.physics import diffusion, vfab as V  # noqa: E402

DIFF_THEN_OX = ["wafer_start", "rca_clean", "ox_thermal", "litho_expose", "etch_rie", "diffuse_predep", "ox_thermal"]
IMP_THEN_OX = ["wafer_start", "rca_clean", "litho_expose", "etch_rie", "implant", "anneal", "ox_thermal"]


def test_routes_without_later_heat_barely_move():
    for route in (["wafer_start", "rca_clean", "ox_thermal", "litho_expose", "etch_rie", "diffuse_predep"],):
        assert V.run(route)["heat_nm"] == 0.0
    teach = V.run(["wafer_start", "rca_clean", "ox_thermal", "litho_expose", "etch_rie", "implant", "diffuse_predep", "anneal"])
    assert 0.0 < teach["heat_nm"] < 1.0                     # a one-second spike nudges a micron-deep junction


def test_gaussian_spreading_matches_the_diffusion_length():
    """Before the second oxidation the junction sits at sig*sqrt(2 ln(A/N)); the heat adds 2Dt to sig^2."""
    base = V.run(DIFF_THEN_OX[:-1])
    hot = {"ox": {"amb": "dry", "T": 1000.0, "t": 1.0}}
    r = V.run(DIFF_THEN_OX, None, hot)
    d = diffusion.run("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, V.N_SUB)
    A, xj0 = d["Cs_after"], base["window"]["xj"]
    sig0 = xj0 / math.sqrt(2 * math.log(A / V.N_SUB))
    Dt = diffusion.diffusivity("P", 1000.0) * 3600.0
    sig1 = math.sqrt(sig0 ** 2 + 2 * Dt * 1e14)
    consumed = base["window"]["si_top"] - r["window"]["si_top"]
    expect = sig1 * math.sqrt(2 * math.log(A * sig0 / sig1 / V.N_SUB)) - consumed
    assert r["window"]["xj"] == pytest.approx(expect, rel=1e-9)
    assert r["heat_nm"] == pytest.approx(r["window"]["xj"] - xj0)


def test_a_hotter_oxidation_pushes_further_and_shallow_implants_move_most():
    cool = V.run(DIFF_THEN_OX, None, {"ox": {"amb": "dry", "T": 900.0, "t": 1.0}})["heat_nm"]
    hot = V.run(DIFF_THEN_OX, None, {"ox": {"amb": "wet", "T": 1100.0, "t": 1.0}})["heat_nm"]
    assert hot > cool
    imp = V.run(IMP_THEN_OX)
    before = V.run(IMP_THEN_OX[:-1])["window"]["xj"]
    assert imp["window"]["xj"] > 3 * before                  # a 90 nm implant is several times deeper after an hour at 1000 °C


def test_cold_oxidation_only_eats_into_the_junction():
    cold = {"ox": {"amb": "dry", "T": 700.0, "t": 1.0}}
    r, base = V.run(DIFF_THEN_OX, None, cold), V.run(DIFF_THEN_OX[:-1], None, cold)
    consumed = base["window"]["si_top"] - r["window"]["si_top"]
    assert consumed > 0
    assert r["window"]["xj"] == pytest.approx(base["window"]["xj"] - consumed, abs=0.5)
