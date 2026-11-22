"""Spot the defect (v1.30): the models place exactly one defect, the fix removes it, the words are cited and safe."""
import json
from pathlib import Path

import pytest

from transistor_sim.physics import defects as D
from transistor_sim.physics import electromigration as em, litho

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data" / "defects.json").read_text(encoding="utf-8"))
TEXT = {c["id"]: c for c in DATA["cases"]}
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
STEPS = {s["id"] for s in json.loads((ROOT / "data" / "fab_steps.json").read_text(encoding="utf-8"))["steps"]}
HAZARD = ("hydrofluoric", "piranha", "fuming", "nitric", "decap", "sulfuric", "hf ", "boe", "buffered oxide")


@pytest.mark.parametrize("cid", D.CASES)
def test_exactly_one_defect_and_the_fix_removes_it(cid):
    for seed in (1, 5, 99):
        r = D.case(cid, seed)
        assert isinstance(r["defect"], int) and 0 <= r["defect"] < 4, (cid, seed, r["defect"])
        assert D.case(cid, seed, good=True)["defect"] is None
        # the shuffle moves features around but never changes which one is bad
        assert r["features"][r["defect"]] == D.MODELS[cid](False)[1][r["order"][r["defect"]]]


def test_shuffle_is_a_permutation_and_varies():
    seen = set()
    for s in range(1, 60):
        p = D.order(s)
        assert sorted(p) == [0, 1, 2, 3]
        seen.add(tuple(p))
    assert len(seen) >= 12


def test_the_physics_picks_the_expected_feature():
    pick = lambda cid: D.MODELS[cid](False)[1]
    bad = {cid: [i for i, f in enumerate(pick(cid)) if f["bad"]] for cid in D.CASES}
    assert pick("fill")[bad["fill"][0]]["w"] == min(D.FILL["widths"])          # narrowest trench voids
    assert pick("etch")[bad["etch"][0]]["w"] == min(D.ETCH["widths"])          # narrowest opening lags
    assert pick("cmp")[bad["cmp"][0]]["rho"] == min(D.CMP["rho_bad"])          # sparsest block polished low
    assert pick("release")[bad["release"][0]]["W"] == max(D.RELEASE["widths"])  # widest stack keeps SiGe
    assert pick("em")[bad["em"][0]]["L"] == max(D.EM["lengths"])               # longest line voids
    assert pick("particle")[bad["particle"][0]]["d"] > D.PARTICLE["bad"]       # particle wider than the space
    assert pick("focus")[bad["focus"][0]]["h"] == max(D.FOCUS["heights_bad"])  # raised field defocuses


def test_thresholds_come_from_the_shared_models():
    info, _ = D.MODELS["cmp"](False)
    assert info["tol"] == pytest.approx(litho.depth_of_focus(193.0, 1.35))
    info, feats = D.MODELS["em"](False)
    assert info["blech_um"] == pytest.approx(em.blech_length_um(2.0, 105.0))
    assert all((f["jL"] > info["jl_crit"]) == f["bad"] for f in feats)
    assert 1 < feats[-1]["years"] < 10
    info, feats = D.MODELS["particle"](False)
    assert info["share"] == pytest.approx(0.25)
    sizes = [f["d"] for f in feats]
    assert sizes == sorted(sizes) and sizes[0] > info["d0"]


def test_grade():
    r = D.case("etch", 3)
    t = TEXT["etch"]["answer"]
    assert D.grade(r, r["defect"], t, t) == 2
    assert D.grade(r, (r["defect"] + 1) % 4, t, t) == 1
    assert D.grade(r, (r["defect"] + 1) % 4, "nope", t) == 0


def test_words_are_complete_cited_and_safe():
    assert [c["id"] for c in DATA["cases"]] == list(D.CASES)
    for c in DATA["cases"]:
        assert c["step"] in STEPS, c["id"]
        assert c["refs"] and all(k in REFS for k in c["refs"]), c["id"]
        assert len(c["causes"]) == 3 and c["answer"] in {o["id"] for o in c["causes"]}
        for k in ("title", "shows", "why", "engineer", "find", "fix", "good"):
            assert c[k].strip(), (c["id"], k)
    raw = json.dumps(DATA, ensure_ascii=False)
    assert "'" not in raw                                      # typographic apostrophes only
    assert not any(w in raw.lower() for w in HAZARD)


def test_page_section_bundle_and_reference():
    html = (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
    sec = html.split('id="defects"')[1].split("</section>")[0]
    assert "What the model leaves out" in sec and 'role="img"' in sec and "aria-label" in sec
    assert not any(w in sec.lower() for w in HAZARD)
    assert '<a href="#defects">Spot the defect</a>' in html
    assert "lazy('defects', './defects.js')" in (ROOT / "site" / "js" / "journey" / "main.js").read_text(encoding="utf-8")
    bundle = (ROOT / "site" / "js" / "journey" / "data.js").read_text(encoding="utf-8")
    assert "export const DEFECTS" in bundle
    for c in DATA["cases"]:
        for k in c["refs"]:
            assert f'"{k}":' in bundle.split("export const REFS")[1], k
    ref = json.loads((ROOT / "data" / "physics_reference.json").read_text(encoding="utf-8"))["defects"]
    assert ref == json.loads(json.dumps(D.reference()))
