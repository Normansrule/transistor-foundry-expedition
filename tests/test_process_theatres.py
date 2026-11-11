"""Process theatres for oxidation, implant, etch, deposition and CMP (site/js/journey/proc.js): the new
models behave as their closed forms say, each theatre runs a model with a JavaScript twin, and every
failure demo only sets controls the theatre has."""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import cmp, deposition, etch  # noqa: E402

TH = {t["id"]: t for t in json.loads((ROOT / "data" / "theatres.json").read_text(encoding="utf-8"))["theatres"]}
PROC = (ROOT / "site" / "js" / "journey" / "proc.js").read_text(encoding="utf-8")
NEW = ("czochralski", "oxidation", "implant", "diffusion", "anneal", "etch", "deposition", "cmp", "damascene", "probe", "release", "planar", "cleaning")


# ── etch: Coburn & Winters conductance limit ────────────────────────────────────────────────────

def test_etch_lag_follows_the_conductance_formula():
    assert etch.lag(0, 0.5) == 1.0
    assert abs(etch.lag(8, 0.5) - 1 / (1 + 0.75 * 0.5 * 8)) < 1e-12
    # narrower openings lag more, and a more reactive etchant lags more
    r = etch.run(s=0.3, overetch=0.0)
    d = [o["depth"] for o in r["openings"]]
    assert d[0] < d[1] < d[2]
    assert etch.run(s=1.0, overetch=0.0)["lag_ratio"] < etch.run(s=0.05, overetch=0.0)["lag_ratio"]


def test_isotropic_etch_undercuts_by_its_depth_and_the_mask_erodes_linearly():
    o = etch.etch_opening(1000.0, 20.0, 0.01, 0.0, 10.0)    # a wide opening: almost no lag
    assert abs(o["side"][0][1] - o["depth"]) / o["depth"] < 0.05
    assert abs(o["mask_left"] - (etch.MASK - etch.R0 / 10.0 * 20.0)) < 1e-9
    assert all(u == 0 for _, u in etch.etch_opening(40.0, 30.0, 0.1, 1.0, 10.0)["side"])


def test_endpoint_is_when_the_widest_opening_clears():
    r = etch.run()
    assert abs(r["openings"][2]["t_clear"] - r["t_end"]) < etch.DT
    assert abs(r["t_total"] - r["t_end"] * 1.5) < 1e-9


# ── deposition: Knudsen diffusion-reaction in a trench ──────────────────────────────────────────

def test_flux_matches_the_cosh_solution_for_a_straight_trench():
    w, L, s = 50.0, 200.0, 0.05
    n = deposition.flux([w] * (deposition.NZ + 1), L, s)
    lam = w * math.sqrt(2 / (3 * s))
    for k in (0, 12, 24, 36, 48):
        z = L * k / deposition.NZ
        assert abs(n[k] - math.cosh((L - z) / lam) / math.cosh(L / lam)) < 0.01


def test_step_coverage_orders_pvd_cvd_ald():
    pvd, cvd, ald = (deposition.fill(m, 60, 3, 20) for m in ("pvd", "cvd", "ald"))
    assert pvd["coverage"] < cvd["coverage"] < ald["coverage"]
    assert ald["coverage"] > 0.95 and ald["cycles"] == math.ceil(20 / deposition.GPC)
    assert deposition.fill("cvd", 60, 3, 20, s=0.01)["coverage"] > deposition.fill("cvd", 60, 3, 20, s=0.3)["coverage"]


def test_sputtering_seals_a_keyhole_void_and_ald_fills_solid():
    v = deposition.fill("pvd", 60, 3, 40)
    assert v["void"] and v["void_z"][1] > v["void_z"][0]
    assert not deposition.fill("ald", 60, 3, 40)["void"]


# ── CMP: Preston and the pattern-density step-height model ─────────────────────────────────────

def test_preston_rate_is_linear_in_pressure_and_velocity():
    assert abs(cmp.rate(28, 1.0) - cmp.KP * 28) < 1e-12
    assert abs(cmp.rate(56, 1.0) - 2 * cmp.rate(28, 1.0)) < 1e-12 and abs(cmp.rate(28, 2.0) - 2 * cmp.rate(28, 1.0)) < 1e-12


def test_raised_areas_polish_at_k_over_rho_until_the_contact_height():
    rho, P, V = 0.5, 28.0, 1.0
    K = cmp.rate(P, V)
    t = 0.5 * (cmp.STEP0 - cmp.HC) * rho / K                 # well before the step reaches hc
    g = cmp.polish(rho, P, V, t)
    assert abs((cmp.OX0 + cmp.STEP0 - g["up"]) - K / rho * round(t / cmp.DT) * cmp.DT) < 1e-6
    assert g["down"] == cmp.OX0


def test_dense_regions_planarise_last_and_leave_a_range():
    r = cmp.run(28, 1.0, 6.0)
    flat = [g["t_flat"] for g in r["regions"]]
    assert flat[0] < flat[1] < flat[2]
    assert cmp.run(28, 1.0, 3.0)["range_nm"] > 100


# ── the theatres ───────────────────────────────────────────────────────────────────────────────

def test_each_theatre_runs_a_model_with_a_javascript_twin():
    for k in NEW:
        t = TH[k]
        assert t["model"] == k
        py = ROOT / "sim" / "transistor_sim" / "physics" / f"{k}.py"
        js = ROOT / "site" / "js" / "physics" / f"{k}.js"
        assert py.exists() and js.exists(), k
        assert f"model: '{k}.py'" in PROC, k
        assert len(t["failures"]) >= 2 and t["metrology"] and t["tools"]


def test_failure_demos_only_set_controls_the_theatre_has():
    blocks = re.findall(r"const (\w+) = \{\n  controls: \[(.*?)\n  \],\n  defaults: \{([^}]*)\}", PROC, re.S)
    ctl = {name: set(re.findall(r"id: '(\w+)'", c)) for name, c, _ in blocks}
    assert set(ctl) == set(NEW)
    for k in NEW:
        for f in TH[k]["failures"]:
            assert set(f["demo"]) <= ctl[k], (k, f["id"])


def test_fab_page_hosts_the_process_theatres():
    html = (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
    for i in ("proc", "prPick", "prXs", "prScrub", "prTicks", "prDepth", "prCtl", "prRead", "prEq", "prFails", "prLeave", *[f"proc-{k}" for k in NEW]):
        assert f'id="{i}"' in html, i
    js = (ROOT / "site" / "js" / "journey" / "main.js").read_text(encoding="utf-8")
    assert "lazy('proc', './proc.js')" in js and "#proc-${t.id}" in js
