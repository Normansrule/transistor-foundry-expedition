"""Fab Journey (site/fab.html) and the Lot Traveler layer: data/theatres.json is cited, safe and
consistent with the simulator presets; every page carries the traveler layer."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
TH = json.loads((ROOT / "data" / "theatres.json").read_text(encoding="utf-8"))["theatres"]
FAB = json.loads((ROOT / "data" / "fab_steps.json").read_text(encoding="utf-8"))
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
IMAGES = {im["file"] for im in json.loads((ROOT / "data" / "images.json").read_text(encoding="utf-8"))["images"]}
CANDS = {c["id"] for c in json.loads((ROOT / "data" / "photo_candidates.json").read_text(encoding="utf-8"))["candidates"]}
STEPS = {s["id"]: s for s in FAB["steps"]}
PAGES = sorted(p.name for p in SITE.glob("*.html"))


def test_theatres_are_cited():
    for t in TH:
        assert t["refs"] and set(t["refs"]) <= REFS, t["id"]
        for ev in t["timeline"]:
            assert ev["refs"] and set(ev["refs"]) <= REFS, ev
        for tool in t["tools"]:
            assert tool["refs"] and set(tool["refs"]) <= REFS, tool


def test_theatres_match_fab_steps_and_safety():
    areas = {a["id"] for a in FAB["areas"]}
    for t in TH:
        assert t["area"] in areas and t["step"] in STEPS
        assert t["safety_tier"] == STEPS[t["step"]]["safety_tier"]
        assert t["leave_out"], "every theatre ends with what the models leave out"


def test_stages_have_three_depths():
    for t in TH:
        assert len(t["stages"]) >= 5
        for st in t["stages"]:
            for d in ("beginner", "engineer", "process"):
                assert len(st[d]) > 40, (t["id"], st["id"], d)


def test_photos_are_logged_or_marked_pending():
    for t in TH:
        assert t["photos"]["result"] in IMAGES          # only licensed photos are shown
        assert set(t["photos"]["tool_candidates"]) <= CANDS


def test_litho_tools_match_physics_lab_presets():
    js = (SITE / "js" / "physlab" / "litho.js").read_text(encoding="utf-8")
    presets = {m[0]: (float(m[1]), float(m[2])) for m in re.findall(r"(\w+): \{ lam: ([\d.]+), NA: ([\d.]+)", js)}
    lit = next(t for t in TH if t["id"] == "lithography")
    for tool in lit["tools"]:
        assert presets[tool["id"]] == (tool["lam"], tool["NA"]), tool["id"]


def test_failure_demos_use_known_settings():
    allowed = {"tool", "dose", "pitchK1", "defocusDOF", "kind"}
    lit = next(t for t in TH if t["id"] == "lithography")
    tools = {t["id"] for t in lit["tools"]}
    for f in lit["failures"]:
        assert f["demo"] and set(f["demo"]) <= allowed, f["id"]
        assert f["demo"].get("tool", "euv") in tools


def test_no_hazardous_procedure_words_in_theatre_text():
    # Tier rules: chemicals are named conceptually, never with concentrations or temperatures.
    text = json.dumps(TH).lower()
    for bad in ("°c", " ml", "% hf", "piranha", "molar", " wt%"):
        assert bad not in text, bad


def test_every_page_has_the_traveler_layer():
    for name in PAGES:
        html = (SITE / name).read_text(encoding="utf-8")
        assert 'href="css/traveler.css"' in html, name
        assert 'src="js/traveler.js"' in html, name


def test_fab_page_canvases_are_labelled_and_linked():
    html = (SITE / "fab.html").read_text(encoding="utf-8")
    for tag in re.findall(r"<canvas[^>]*>", html):
        assert "aria-label=" in tag, tag
    for page in PAGES:
        assert f'href="fab.html"' in (SITE / page).read_text(encoding="utf-8"), page
