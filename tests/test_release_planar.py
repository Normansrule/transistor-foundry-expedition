"""Nanosheet release and Hoerni's planar junction: the closed forms behind the last two process theatres."""
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import diffusion, planar as P, release as R  # noqa: E402


def test_release_thins_edges_by_two_e_over_s_and_the_centre_by_the_over_etch():
    W, t, S, f = 30.0, 5.0, 50.0, 0.4
    r = R.run(W, t, S, f)
    e = W / 2 * (1 + f)
    assert r["t_edge"] == pytest.approx(t - 2 * e / S, rel=1e-12)
    assert r["t_centre"] == pytest.approx(t - W * f / S, rel=1e-12)
    assert r["w_final"] == pytest.approx(W - 2 * e / S, rel=1e-12)
    # mean thickness of a linear profile is the average of its ends
    assert r["t_mean"] == pytest.approx(0.5 * (r["t_edge"] + r["t_centre"]), rel=1e-9)


def test_under_etch_leaves_a_stringer_and_no_effective_width():
    r = R.run(30.0, 5.0, 100.0, -0.2)
    assert not r["released"] and r["core"] == pytest.approx(6.0) and r["weff"] == 0.0
    assert R.run(30.0, 5.0, 100.0, 0.0)["released"]


def test_more_selective_etch_keeps_the_sheet():
    assert R.run(S=500.0)["t_edge"] > R.run(S=100.0)["t_edge"] > R.run(S=20.0)["t_edge"]


def test_parallel_plane_breakdown_and_depletion():
    assert P.bv_plane(1e16) == pytest.approx(60 * (1.12 / 1.1) ** 1.5, rel=1e-12)
    assert P.bv_plane(1e15) / P.bv_plane(1e16) == pytest.approx(10 ** 0.75, rel=1e-12)
    W = P.depletion_um(P.bv_plane(1e15), 1e15)
    assert 15 < W < 30                 # tens of micrometres for lightly doped silicon


def test_cylindrical_edge_is_weaker_and_recovers_as_it_flattens():
    # Sze-Gibbons holds for edge radii up to about the depletion width.
    xs = [0.01, 0.1, 0.5, 1.0]
    rs = [P.cyl_ratio(x) for x in xs]
    assert all(0 < v < 1 for v in rs) and rs == sorted(rs)


def test_planar_run_uses_the_diffusion_model():
    r = P.run(1e15, 1100.0, 60.0)
    d = diffusion.run("B", P.CS, P.T1, P.T1_S, 1100.0, 3600.0, 1e15)
    assert r["xj"] == d["xj"] and r["bv_cyl"] == pytest.approx(r["bv_pp"] * P.cyl_ratio(d["xj"] / 1000 / r["W_um"]), rel=1e-12)
    assert P.run(1e15, 1150.0, 240.0)["bv_cyl"] > r["bv_cyl"] > P.run(1e15, 1100.0, 10.0)["bv_cyl"]
