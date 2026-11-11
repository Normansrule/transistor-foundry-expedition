"""Wafer cleaning theatre: particles, killer share, yield cost and iron lifetime (no chemistry)."""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from transistor_sim.physics import cleaning as C, yieldcost  # noqa: E402


def test_each_pass_removes_the_same_fraction():
    r0, r1, r2 = (C.run(2000.0, 0.9, n) for n in (0, 1, 2))
    assert r0["left"] == pytest.approx(2000.0) and r1["left"] == pytest.approx(200.0) and r2["left"] == pytest.approx(20.0)
    assert r0["Y"] < r1["Y"] < r2["Y"] < 1.0


def test_killer_share_follows_the_inverse_cube_size_law():
    # N(>d) ∝ 1/d² for a 1/d³ density, so doubling the killer size quarters the killers
    assert C.killer_fraction(100.0) == pytest.approx(0.25)
    assert C.killer_fraction(200.0) == pytest.approx(C.killer_fraction(100.0) / 4)
    assert C.killer_fraction(30.0) == 1.0


def test_yield_uses_the_negative_binomial_model():
    r = C.run(2000.0, 0.9, 1, 100.0)
    D = 2000.0 * 0.1 * 0.25 / (math.pi * 15.0 ** 2)
    assert r["D_add"] == pytest.approx(D) and r["Y"] == pytest.approx(yieldcost.yield_model(100.0, D))


def test_iron_lifetime_and_diffusion_length():
    assert C.run(N_fe=1e10)["tau_us"] == pytest.approx(1e6 / (5e-14 * 1.1e7 * 1e10))
    a, b = C.run(N_fe=1e10), C.run(N_fe=1e12)
    assert a["tau_us"] / b["tau_us"] == pytest.approx(100.0) and a["L_um"] / b["L_um"] == pytest.approx(10.0)
    assert 150 < a["tau_us"] < 200 and 600 < a["L_um"] < 800


def test_cleaning_theatre_publishes_no_chemistry():
    import json
    root = Path(__file__).resolve().parents[1]
    th = next(t for t in json.loads((root / "data" / "theatres.json").read_text(encoding="utf-8"))["theatres"] if t["id"] == "cleaning")
    assert th["safety_tier"] == 3
    text = json.dumps(th, ensure_ascii=False).lower()
    for bad in ("°c", " ml", "% hf", "piranha", "molar", " wt%", "hcl", "nh4oh", "ammonia", "hydrochloric", "sulfuric", "sulphuric", "hydrofluoric", "h2o2", ":1:"):
        assert bad not in text, bad
