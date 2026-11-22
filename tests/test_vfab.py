"""Computed Virtual Fab: each step runs its theatre model and changes the field and window columns."""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from transistor_sim.physics import diffusion, implant, oxidation, vfab as V  # noqa: E402

TEACH = ["wafer_start", "rca_clean", "ox_thermal", "litho_expose", "etch_rie", "implant", "diffuse_predep", "anneal", "dep_pvd"]


def test_oxide_comes_from_deal_grove_and_consumes_silicon():
    r = V.run(["wafer_start", "ox_thermal"])
    x = float(oxidation.thickness("dry", 1000.0, 1.0, "100")) * 1000
    assert r["field"]["layers"] == [["ox", pytest.approx(x)]]
    assert r["field"]["si_top"] == pytest.approx(-0.44 * x)
    r2 = V.run(["wafer_start", "ox_thermal", "ox_thermal"])
    assert r2["field"]["layers"][0][1] > x and len(r2["field"]["layers"]) == 1


def test_teaching_route_dopes_only_the_window():
    r = V.run(TEACH)
    d = diffusion.run("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, V.N_SUB)
    assert r["window"]["xj"] == pytest.approx(d["xj"], rel=1e-3) and r["field"]["xj"] == 0.0   # the spike anneal nudges it
    assert [m for m, _ in r["field"]["layers"]] == ["ox", "metal"] and [m for m, _ in r["window"]["layers"]] == ["metal"]
    assert r["window"]["si_top"] < r["field"]["si_top"]           # over-etch recesses the window


def test_thin_mask_lets_the_implant_through_shallower():
    j = implant.junction("P", 20.0, 1e15, V.N_SUB)
    r = V.run(["wafer_start", "ox_thermal", "implant"])
    ox = r["field"]["layers"][0][1]
    assert r["field"]["xj"] == pytest.approx(j["xj"] - ox) and r["window"]["xj"] == pytest.approx(j["xj"] - ox)
    r = V.run(["wafer_start", "ox_thermal", "litho_expose", "implant"])
    assert r["field"]["xj"] == 0.0 and r["window"]["xj"] > 0.0


def test_held_steps_do_nothing():
    a = V.run(["wafer_start", "ox_thermal", "dep_pvd"], [False, True, False])
    assert a["field"]["layers"] == [["metal", V.METAL_NM]] and a["log"][1]["applied"] is False


def test_cmp_stops_on_oxide_and_damascene_adds_a_line():
    r = V.run(["wafer_start", "ox_thermal", "litho_expose", "etch_rie", "dep_pvd", "cmp", "damascene"])
    assert [m for m, _ in r["field"]["layers"]] == ["ox", "ild"]
    assert [m for m, _ in r["window"]["layers"]] == ["cu"] and r["cu_r"] > 0


def test_own_settings_change_the_cross_section():
    base = V.run(TEACH)
    wet = V.run(TEACH, cfg={"ox": {"amb": "wet", "T": 1100.0, "t": 1.0}})
    assert wet["field"]["layers"][0][1] > 5 * base["field"]["layers"][0][1]
    assert V.run(TEACH, cfg={}) == base and V.run(TEACH, cfg={"ox": None}) == base


def test_dopant_of_the_substrate_type_makes_no_junction():
    r = V.run(["wafer_start", "implant"], cfg={"imp": {"ion": "B"}})
    assert r["window"]["xj"] == 0.0 and r["log"][1]["value"] == 0.0
    r = V.run(["wafer_start", "implant"], cfg={"imp": {"ion": "As"}})
    assert r["window"]["xj"] > 0.0


def test_diffused_junction_spreads_under_the_mask_edge():
    r = V.run(TEACH)
    assert r["window"]["lateral"] == pytest.approx(0.8 * r["window"]["xj"])
    imp = V.run(["wafer_start", "implant"])["window"]
    j = implant.junction("P", 20.0, 1e15, V.N_SUB)
    y = imp["lateral"]                                     # where (N_peak/2) erfc(y/√2σ) meets the substrate
    assert 0.5 * j["peak"] * diffusion.erfc(y / (math.sqrt(2) * j["sigma_nm"])) == pytest.approx(V.N_SUB, rel=1e-6)
    assert 0 < y < imp["xj"]


@pytest.mark.parametrize("track", ["teaching_cmos", "modern_gaa", "historical_planar"])
def test_every_route_runs_without_a_hold(track):
    import json
    steps = json.loads((Path(__file__).resolve().parents[1] / "data" / "fab_steps.json").read_text(encoding="utf-8"))["steps"]
    by = {s["id"]: s for s in steps}
    route = [s["id"] for s in steps if track in s["tracks"]]
    for i, sid in enumerate(route):
        before = set(route[:i])
        assert set(by[sid]["requires"]) <= before, (track, sid)
        anyof = by[sid].get("requires_any", [])
        assert not anyof or before & set(anyof), (track, sid)
    assert route[-1] == "probe_dice_bond", track


def test_historical_route_ends_with_aluminium_on_the_planar_junction():
    r = V.run(["wafer_start", "rca_clean", "ox_thermal", "litho_expose", "diffuse_predep", "planar_hoerni", "evap_al", "probe_dice_bond"])
    assert r["window"]["by"] == "planar" and r["window"]["layers"] == [["metal", V.METAL_NM]] and r["done"]
    assert [m for m, _ in r["field"]["layers"]] == ["ox", "metal"]          # the oxide insulates the lead elsewhere


LAB = __import__("json").loads((Path(__file__).resolve().parents[1] / "data" / "lab_runs.json").read_text(encoding="utf-8"))


def test_the_2024_run_route_runs_without_a_hold():
    import json
    steps = json.loads((Path(__file__).resolve().parents[1] / "data" / "fab_steps.json").read_text(encoding="utf-8"))["steps"]
    by = {s["id"]: s for s in steps}
    route = LAB["vfab_route"]
    for i, sid in enumerate(route):
        before = set(route[:i])
        assert set(by[sid]["requires"]) <= before, sid
        anyof = by[sid].get("requires_any", [])
        assert not anyof or before & set(anyof), sid
    assert sum(1 for s in route if s == "litho_expose") == V.RUN_MASKS


def test_run_recipe_chains_the_furnace_steps_like_the_process_lab():
    from transistor_sim.physics import labrun
    cfg = V.run_cfg(LAB)
    r = V.run(LAB["vfab_route"], None, cfg)
    ox = {o["id"]: o for o in LAB["oxides"]}
    first = [l for l in r["log"] if l["id"] == "ox_thermal"]
    assert first[0]["value"] == pytest.approx(labrun.oxide_sequence(ox["field"]["steps"])[-1] * 1000)
    assert first[1]["win"] == pytest.approx(labrun.oxide_sequence(ox["gate"]["steps"])[-1] * 1000)   # bare window after the etch
    d = next(l for l in r["log"] if l["id"] == "diffuse_predep")
    assert d["win"] == pytest.approx(labrun.oxide_sequence(ox["inter"]["steps"])[-1] * 1000)
    assert not any(m == "resist" for c in (r["field"], r["window"]) for m, _ in c["layers"])   # stripped before probing
    assert r["window"]["xj"] > 0 and r["field"]["xj"] == 0.0


def test_compare_sets_computed_beside_measured():
    rows = {w["key"]: w for w in V.compare(V.run(LAB["vfab_route"], None, V.run_cfg(LAB)), LAB)}
    for k in ("field_ox", "gate_ox", "inter_ox"):                 # Deal–Grove lands within 10 % of all three oxides
        assert rows[k]["computed"] == pytest.approx(rows[k]["measured"], rel=0.10), k
    assert rows["sd_rs"]["measured"] == pytest.approx(57.1 * 11 / 201)
    assert 2 * rows["sd_rs"]["measured"] < rows["sd_rs"]["computed"] < 6 * rows["sd_rs"]["measured"]   # D rising with doping halves the gap
    intrinsic = {w["key"]: w for w in V.compare(V.run(LAB["vfab_route"], None, {**V.run_cfg(LAB), "diff": {**V.run_cfg(LAB)["diff"], "model": "int"}}), LAB)}
    assert intrinsic["sd_rs"]["computed"] > 5 * intrinsic["sd_rs"]["measured"]
    assert rows["actv_bias"]["computed"] == 0.0 and rows["actv_bias"]["measured"] == pytest.approx(2.48, abs=0.01)
    assert rows["al_rs"]["computed"] == pytest.approx(2.65e-6 / 500e-7) and rows["masks"]["computed"] == 4
    empty = {w["key"]: w["computed"] for w in V.compare(V.run(["wafer_start"]), LAB)}
    assert empty["field_ox"] is None and empty["sd_rs"] is None and empty["masks"] == 0


def test_default_settings_miss_the_wet_field_oxide():
    rows = {w["key"]: w for w in V.compare(V.run(LAB["vfab_route"]), LAB)}
    assert rows["field_ox"]["computed"] < 0.2 * rows["field_ox"]["measured"]   # one dry hour cannot grow half a micron
    assert rows["inter_ox"]["computed"] is None
