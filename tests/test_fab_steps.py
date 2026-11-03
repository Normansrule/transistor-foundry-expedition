"""data/fab_steps.json and data/photo_candidates.json: well formed, cited, safe."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAB = json.loads((ROOT / "data" / "fab_steps.json").read_text(encoding="utf-8"))
CAND = json.loads((ROOT / "data" / "photo_candidates.json").read_text(encoding="utf-8"))
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}


def test_thirteen_areas_and_three_tracks():
    assert [a["number"] for a in FAB["areas"]] == list(range(1, 14))
    assert {t["id"] for t in FAB["tracks"]} == {"modern_gaa", "teaching_cmos", "historical_planar"}


def test_steps_reference_known_things():
    ids = [s["id"] for s in FAB["steps"]]
    assert len(ids) == len(set(ids))
    areas, tracks = {a["id"] for a in FAB["areas"]}, {t["id"] for t in FAB["tracks"]}
    cands = {c["id"] for c in CAND["candidates"]}
    for s in FAB["steps"]:
        assert s["area"] in areas and set(s["tracks"]) <= tracks and s["tracks"], s["id"]
        assert set(s["requires"]) <= set(ids), s["id"]
        assert set(s["photos"]) <= cands, s["id"]
        assert s["safety_tier"] in (0, 1, 2, 3), s["id"]
        assert set(s["refs"]) <= REFS, (s["id"], set(s["refs"]) - REFS)
        for ev in s["timeline"]:
            assert ev["refs"] and set(ev["refs"]) <= REFS, (s["id"], ev)
        if s.get("model"):
            for k in ("py", "js"):
                assert (ROOT / s["model"][k]).exists(), (s["id"], s["model"][k])


def test_every_recipe_number_is_cited():
    for s in FAB["steps"]:
        for r in s["recipe"]:
            assert r["refs"] and set(r["refs"]) <= REFS, (s["id"], r)
            assert r["min"] <= r["max"] and r["unit"], (s["id"], r)


def test_tier3_steps_publish_no_recipe():
    for s in FAB["steps"]:
        if s["safety_tier"] == 3:
            assert s["recipe"] == [], s["id"]


def test_requires_has_no_cycles():
    req = {s["id"]: s["requires"] for s in FAB["steps"]}
    state = {}

    def visit(n):
        assert state.get(n) != 1, f"cycle at {n}"
        if state.get(n) == 2:
            return
        state[n] = 1
        for m in req[n]:
            visit(m)
        state[n] = 2
    for n in req:
        visit(n)


def test_only_verified_photos_are_published():
    spec = importlib.util.spec_from_file_location("chk", ROOT / "scripts" / "check_photo_licenses.py")
    chk = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(chk)
    for ok in ["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "PD-USGov"]:
        assert chk.allowed(ok), ok
    for bad in ["CC BY-NC-SA 4.0", "CC BY-ND 3.0", "Fair use", "", "All rights reserved"]:
        assert not chk.allowed(bad), bad
    for c in CAND["candidates"]:
        assert c["status"] in ("unverified", "verified", "rejected", "missing")
        if c["status"] == "verified":
            assert chk.allowed(c["license"]), c
