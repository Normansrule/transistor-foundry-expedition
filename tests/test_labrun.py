"""A real cleanroom run (Process Lab 05): the lab-run helpers, the measured data and the page section."""
import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim.physics import labrun as L, oxidation  # noqa: E402

RUN = json.loads((ROOT / "data" / "lab_runs.json").read_text(encoding="utf-8"))
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
FAB = json.loads((ROOT / "data" / "fab_steps.json").read_text(encoding="utf-8"))


# --- model ---------------------------------------------------------------------------------------

def test_splitting_an_oxidation_step_changes_nothing():
    one = L.oxide_sequence([("wet", 1000, 90)], x0_um=0.03)[-1]
    two = L.oxide_sequence([("wet", 1000, 40), ("wet", 1000, 50)], x0_um=0.03)[-1]
    assert two == pytest.approx(one, rel=1e-12)
    assert L.oxide_sequence([("dry", 1100, 60)])[0] == pytest.approx(float(oxidation.thickness("dry", 1100, 1.0)), rel=1e-12)


def test_deal_grove_matches_this_run_within_ten_percent():
    for o in RUN["oxides"]:
        if o["id"] in ("field", "gate", "inter"):
            model = L.oxide_sequence(o["steps"])[-1] * 1000
            assert abs(o["measured_nm"] / model - 1) < 0.10, (o["id"], model)


def test_parabolic_shortcut_overestimates():
    for amb, T, m in (("wet", 1000, 90), ("dry", 1100, 60), ("dry", 1050, 37)):
        assert L.parabolic_only(amb, T, m) > L.oxide_sequence([(amb, T, m)], x0_um=0.0)[0]


def test_effective_pressure_round_trips():
    p = L.effective_pressure("wet", 1050, 37, 0.0629)
    assert 0.01 < p < 0.5
    assert L.oxide_sequence([("wet", 1050, 37, p)])[0] == pytest.approx(0.0629, rel=1e-6)


def test_resistivity_and_doping_are_consistent():
    from transistor_sim.physics.implant import mobility
    for rho, c in ((1.0, "p"), (0.33, "p"), (1e-3, "n")):
        N = L.resistivity_to_doping(rho, c)
        assert 1 / (L.Q * mobility(N, c) * N) == pytest.approx(rho, rel=1e-6)


def test_capacitance_meter_model():
    C = L.parallel_plate_pf(57600, 114)
    assert C == pytest.approx(3.9 * 8.8541878128e-14 * 5.76e-4 / 1.14e-5 * 1e12, rel=1e-9)
    assert L.lcr_reading_pf(C, 0) == C
    R = L.series_r_for_reading(C, 5.95)
    assert L.lcr_reading_pf(C, R) == pytest.approx(5.95, rel=1e-9)
    assert L.series_r_for_reading(2.5, 9.5) == 0.0


def test_threshold_and_oxide_charge_round_trip():
    Na = 1.66e16
    for vt in (-2.0, 0.0, 1.0):
        nox = L.oxide_charge_from_vt(vt, Na, 114)
        assert L.vt_ideal(Na, 114, "n+poly", nox) == pytest.approx(vt, abs=1e-9)
    # an aluminium gate sits 50 mV above n+ poly (4.10 against 4.05 eV)
    assert L.vt_ideal(Na, 114, "al") - L.vt_ideal(Na, 114) == pytest.approx(0.05, abs=1e-12)
    # more oxide charge always lowers the threshold
    assert L.vt_ideal(Na, 114, "n+poly", 1e12) < L.vt_ideal(Na, 114, "n+poly", 1e11)


def test_isotropic_etch_and_resistor_helpers():
    assert L.isotropic_bias_um(0.5, 0.0) == pytest.approx(1.0)
    assert L.implied_overetch(L.isotropic_bias_um(0.548, 0.8), 0.548) == pytest.approx(0.8)
    assert L.sheet_from_resistor(60, 200, 10) == pytest.approx(3.0)
    assert L.builtin_potential(1e16, 1e19) == pytest.approx(0.0258520 * math.log(1e35 / 1e20), rel=0.08)


# --- data ------------------------------------------------------------------------------------------

def _refs(node, out):
    if isinstance(node, dict):
        for k, v in node.items():
            (out.update(v) if k in ("refs", "mosfet_refs") else _refs(v, out))
    elif isinstance(node, list):
        for v in node:
            _refs(v, out)
    return out


def test_every_lab_number_is_cited():
    used = _refs(RUN, set())
    assert used and used <= REFS, used - REFS
    for s in RUN["steps"]:
        assert s["refs"], s["title"]


def test_steps_map_to_fab_steps_and_tier3_publishes_no_recipe():
    ids = {s["id"] for s in FAB["steps"]}
    assert [s["n"] for s in RUN["steps"]] == list(range(1, 11))
    for s in RUN["steps"]:
        assert s["fab_step"] in ids, s
        assert s["tier"] in (0, 1, 2, 3)
        if s["tier"] == 3:
            assert s["recipe"] == [], s["title"]


def test_no_hazardous_chemistry_in_the_lab_data():
    text = json.dumps(RUN, ensure_ascii=False).lower()
    for bad in ("hf", "bhf", "buffered", "piranha", "sulfuric", "peroxide", "molar", " ml", "wt%", "phosphine", "silane", "filmtronics", "etch time"):
        assert bad not in text, bad


def test_mosfet_yield_and_on_off():
    works = [m for m in RUN["mosfets"] if m["works"]]
    assert len(works) == 8 and len(RUN["mosfets"]) == 9
    assert all(m["ion_ua"] > m["ioff_ua"] for m in works)


# --- page -------------------------------------------------------------------------------------------

def test_process_page_hosts_the_section_with_a_twin():
    html = (ROOT / "site" / "process.html").read_text(encoding="utf-8")
    assert 'id="labrun"' in html and 'href="#labrun"' in html
    assert "What the models leave out" in html[html.index('id="labrun"'):]
    main = (ROOT / "site" / "js" / "processlab" / "main.js").read_text(encoding="utf-8")
    assert "labrun: './labrun.js'" in main
    page = (ROOT / "site" / "js" / "processlab" / "labrun.js").read_text(encoding="utf-8")
    assert "../physics/labrun.js" in page and (ROOT / "site" / "js" / "physics" / "labrun.js").exists()
    data = (ROOT / "site" / "js" / "processlab" / "data.js").read_text(encoding="utf-8")
    assert "export const LABRUN = " + json.dumps({k: v for k, v in RUN.items() if not k.startswith("_")}, ensure_ascii=False, separators=(",", ":")) in data
