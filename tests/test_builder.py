"""3D layer builder (v1.28): geometry, citations and the page section."""
import json
import math
import re
from pathlib import Path

import pytest

from transistor_sim.physics import builder as B

ROOT = Path(__file__).resolve().parents[1]
DATA = B.load()
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
ARCHS = [a["id"] for a in DATA["archs"]]


@pytest.mark.parametrize("key", ARCHS)
def test_no_two_pieces_overlap_at_any_step(key):
    a = B.arch(key, DATA)
    boxes = B.build(a)
    for k in range(len(a["steps"])):
        assert B.overlaps(B.alive(boxes, k)) == [], (key, a["steps"][k])


@pytest.mark.parametrize("key", ARCHS)
def test_every_piece_is_made_before_it_is_removed(key):
    a = B.arch(key, DATA)
    n = len(a["steps"])
    for b in B.build(a):
        assert b[0] in DATA["materials"], b
        assert b[2] > b[1] and b[4] > b[3] and b[6] > b[5]
        assert 0 <= b[7] < n and (b[8] is None or b[7] < b[8] < n)


@pytest.mark.parametrize("key", ARCHS)
def test_every_step_changes_the_structure(key):
    a = B.arch(key, DATA)
    boxes = B.build(a)
    for k in range(len(a["steps"])):
        assert any(b[7] == k or b[8] == k for b in boxes), a["steps"][k]


def test_subtract_covers_the_remainder_exactly():
    rect, holes = (0, 10, 0, 10), [(2, 4, 1, 3), (3, 6, 2, 5), (8, 12, -1, 4)]
    out = B.subtract(rect, holes)
    area = sum((r[1] - r[0]) * (r[3] - r[2]) for r in out)
    assert area == pytest.approx(100 - 4 - 9 + 1 - 8)       # hole union: 4 + 9 - 1 (overlap) + 8 (clipped)
    assert B.overlaps([["x", 0, 1, r[0], r[1], r[2], r[3], 0, None] for r in out]) == []


def test_gate_wraps_the_channel_as_the_architecture_says():
    for key in ("finfet_22", "nanosheet"):
        a = B.arch(key, DATA)
        fin = [b for b in B.alive(B.build(a), len(a["steps"]) - 1) if b[0] == "sich" and b[1] < 0 < b[2]]
        hk = [b for b in B.alive(B.build(a), len(a["steps"]) - 1) if b[0] == "highk"]
        c = fin[0]
        above = any(h[5] == pytest.approx(c[6]) and h[3] <= c[3] and h[4] >= c[4] for h in hk)
        below = any(h[6] == pytest.approx(c[5]) and h[3] <= c[3] and h[4] >= c[4] for h in hk)
        assert above
        assert below == (key == "nanosheet")              # a fin sits on silicon; a sheet is gated underneath too


def test_released_sheets_float_and_inner_spacers_replace_sige():
    a = B.arch("nanosheet", DATA)
    boxes = B.build(a)
    rel = a["steps"].index("release")
    gate_sige = [b for b in B.alive(boxes, rel) if b[0] == "sige" and b[1] < 0 < b[2]]
    assert gate_sige == []
    assert any(b[0] == "ispacer" for b in B.alive(boxes, rel))


def test_metrics_follow_from_the_cited_dimensions():
    m = {k: B.metrics(B.arch(k, DATA)) for k in ARCHS}
    assert m["finfet_22"]["weff_nm"] == 3 * (2 * 34 + 8)                 # auth2012
    assert m["finfet_10"]["weff_nm"] == 2 * (2 * 46 + 7)                 # auth2017
    assert [m[k]["sides"] for k in ARCHS] == [1, 3, 3, 3, 4, 4, 3, 4]
    assert m["forksheet"]["weff_nm"] == 3 * (2 * 25 + 5)                 # top, bottom and the outer edge of each sheet
    assert m["forksheet"]["pair_area_nm2"] < m["nanosheet"]["pair_area_nm2"]   # n and p 8 nm apart in one cell
    assert m["nanosheet_bspdn"] == {**m["nanosheet"], "steps": m["nanosheet"]["steps"] + 3}
    assert m["finfet_14"]["weff_nm"] == 2 * (2 * 42 + 8)                 # natarajan2014 fins (width est.)
    w = [m[k]["pair_weff_per_w"] for k in ARCHS]
    assert w == sorted(w)                                                # each generation packs more width per footprint
    assert m["cfet"]["pair_area_nm2"] == pytest.approx(m["nanosheet"]["pair_area_nm2"] / 2)
    assert m["finfet_22"]["lam_nm"] == pytest.approx(math.sqrt(3.0 * 8 * 0.9 / 2))
    assert m["planar_45"]["lam_nm"] is None


def test_dimensions_cite_real_references_or_say_est():
    for a in DATA["archs"]:
        for k, (v, ref) in a["dims"].items():
            assert isinstance(v, (int, float)) and v > 0, (a["id"], k)
            assert ref is None or ref in REFS, (a["id"], k, ref)
        for s in a["steps"]:
            assert s in DATA["steps"], s
    for s in DATA["steps"].values():
        assert s["refs"] and all(r in REFS for r in s["refs"])
    cited = {(a["id"], k) for a in DATA["archs"] for k, (v, r) in a["dims"].items() if r}
    assert ("finfet_10", "fin_h") in cited and ("finfet_22", "fin_pitch") in cited and ("nanosheet", "cpp") in cited
    assert not any(r for k, (v, r) in B.arch("cfet", DATA)["dims"].items())   # the CFET is illustrative throughout


def test_step_texts_are_safe_and_plain():
    banned = re.compile(r"hydrofluoric|\bHF\b|buffered oxide|piranha|fuming|phosphine|arsine|diborane|°C|\d+\s*(?:min|s)\b", re.I)
    for s in DATA["steps"].values():
        assert not banned.search(s["text"]), s["title"]
        assert "'" not in s["text"]


def test_page_section_and_parity_reference():
    html = (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
    assert 'id="builder"' in html and 'id="blView"' in html and "What the model leaves out" in html
    assert re.search(r'id="blView"[^>]*role="img"', html)
    assert "lazy('builder', './builder.js')" in (ROOT / "site" / "js" / "journey" / "main.js").read_text(encoding="utf-8")
    js = (ROOT / "site" / "js" / "journey" / "data.js").read_text(encoding="utf-8")
    assert "export const BUILDER" in js
    ref = json.loads((ROOT / "data" / "physics_reference.json").read_text(encoding="utf-8"))["builder"]
    for k in ARCHS:
        assert len(ref[k]["boxes"]) == len(B.build(B.arch(k, DATA)))
    assert (ROOT / "site" / "js" / "physics" / "builder.js").exists()


def test_forksheet_wall_splits_n_from_p():
    a = B.arch("forksheet", DATA)
    L = B.layout(a)
    end = B.alive(B.build(a), len(a["steps"]) - 1)
    wall = [b for b in end if b[0] == "wall"]
    assert len(wall) == 1 and wall[0][4] - wall[0][3] == 8                # imec_forksheet2019: 8 nm p–n spacing
    n = [b for b in end if b[0] == "n"]
    p = [b for b in end if b[0] == "p"]
    assert n and p and all(b[4] <= L["wall"][0] for b in n) and all(b[3] >= L["wall"][1] for b in p)
    gate = [b for b in end if b[0] in ("metal", "highk") and b[1] < 0 < b[2]]
    assert not any(b[3] < L["wall"][1] and b[4] > L["wall"][0] and b[5] < wall[0][6] for b in gate)   # no gate inside the wall


def test_backside_power_removes_the_substrate_and_feeds_the_source_from_below():
    a = B.arch("nanosheet_bspdn", DATA)
    boxes = B.build(a)
    flip, last = a["steps"].index("flip"), len(a["steps"]) - 1
    end = B.alive(boxes, last)
    assert not any(b[0] == "si" and b[5] < 0 for b in B.alive(boxes, flip))   # silicon below the devices is gone
    rail = [b for b in end if b[0] == "rail"]
    assert len(rail) == 1 and rail[0][6] == 0
    front = [b for b in end if b[0] == "contact" and b[5] > 0]
    back = [b for b in end if b[0] == "contact" and b[5] == 0]
    assert len(front) == 1 and front[0][1] > 0                           # only the drain is contacted on the front
    assert len(back) == 1 and back[0][2] < 0                             # the source is contacted from below
