"""Numbers printed in Manual 13 (history) come from the planar model, so the manual cannot drift from the theatre."""
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))
from transistor_sim.physics import planar  # noqa: E402

MAN = {m["id"]: m for m in json.loads((ROOT / "data" / "manuals.json").read_text(encoding="utf-8"))["manuals"]}


def _num(s):
    return float(re.search(r"\d+(?:\.\d+)?", s).group())


def _params(mid, sid):
    step = next(s for s in MAN[mid]["steps"] if s["id"] == sid)
    return step, step["spec"]["params"]


def test_history_manual_matches_the_planar_model():
    r = planar.run()                                    # 10¹⁵ cm⁻³, 1 h at 1100 °C: the manual's stated case
    _, drive = _params("history", "drive")
    assert _num(drive[0]["value"]) == pytest.approx(r["xj"] / 1000, abs=0.01)
    _, test = _params("history", "test")
    assert _num(test[0]["value"]) == pytest.approx(r["bv_pp"], abs=1)
    assert _num(test[1]["value"]) == pytest.approx(r["bv_cyl"], abs=1)


def test_history_lateral_spread_chip():
    r = planar.run()
    step, _ = _params("history", "drive")
    assert any("0.8 of the depth" in c["t"] for c in step["chips"])
    assert r["lateral"] / r["xj"] == pytest.approx(0.8, abs=0.01)


def test_last_two_manuals_close_the_roadmap():
    assert MAN["tft"]["code"] == "12" and MAN["history"]["code"] == "13"
    areas = {m["area_no"] for m in MAN.values()}
    assert set(range(1, 14)) <= areas                   # every roadmap area has a manual
    assert MAN["tft"]["steps"][2]["tier"] <= 2          # IGZO sputtering is staff-run, not institution-only
