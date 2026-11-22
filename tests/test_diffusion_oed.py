"""Oxidation-enhanced and -retarded diffusion (Hu 1974; Plummer et al. 2000, ch. 7): D/D* = f_I S + (1 - f_I)/S."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from transistor_sim.physics import diffusion as D  # noqa: E402
from transistor_sim.physics import vfab as V  # noqa: E402

LAB = json.loads((Path(__file__).resolve().parents[1] / "data" / "lab_runs.json").read_text(encoding="utf-8"))
P = ("P", 3e20, 1050.0, 600.0, 1050.0, 2220.0, 1.66e16)


def test_inert_ambient_changes_nothing():
    for ion in D.FI:
        assert D.oed_factor(ion, 1.0) == pytest.approx(1.0)
    assert D.run(*P, 600, 1.0)["xj"] == pytest.approx(D.run(*P)["xj"])
    assert D.run_cd(*P, 301, 300, 1.0)["Rs"] == pytest.approx(D.run_cd(*P)["Rs"])


def test_interstitial_dopants_speed_up_and_antimony_slows_down():
    assert D.oed_factor("B", 3.0) > 2.5 and D.oed_factor("P", 3.0) > 2.5
    assert 1.0 < D.oed_factor("As", 3.0) < D.oed_factor("P", 3.0)            # arsenic uses both paths
    assert D.oed_factor("Sb", 3.0) < 0.5                                       # vacancy diffuser: retarded


def test_oxidising_drive_in_deepens_the_junction_but_keeps_the_dose():
    inert, ox = D.run_cd(*P), D.run_cd(*P, 301, 300, 3.0)
    assert ox["xj"] > 1.3 * inert["xj"]
    assert ox["dose"] == pytest.approx(inert["dose"], rel=0.01)                # fixed by the predeposition (grid differs)
    assert abs(ox["Rs"] / inert["Rs"] - 1) < 0.1                               # so the sheet resistance barely moves


def test_run_recipe_applies_the_supersaturation_only_while_oxide_grows():
    cfg = V.run_cfg(LAB)
    assert cfg["diff"]["S"] == V.RUN_S and cfg["diff"]["grow"]
    xj = lambda c: [l for l in V.run(LAB["vfab_route"], None, c)["log"] if l["id"] == "diffuse_predep"][0]["value"]
    inert = {**cfg, "diff": {**cfg["diff"], "S": 1.0}}
    assert xj(cfg) > 1.3 * xj(inert)
    no_grow = {"diff": {"S": 5.0}}                                             # no oxide grown: S is ignored
    assert xj(no_grow) == pytest.approx(xj({}))
