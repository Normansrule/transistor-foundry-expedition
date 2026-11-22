"""Process-family comparison matrix (data/families.json): every cell cited, every number referenced."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAM = json.loads((ROOT / "data" / "families.json").read_text(encoding="utf-8"))
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
LAB = json.loads((ROOT / "data" / "lab_runs.json").read_text(encoding="utf-8"))


def cells():
    for f in FAM["families"]:
        for c in FAM["columns"]:
            yield f, c["id"], f[c["id"]]


def test_every_cell_has_text_and_known_refs():
    ids = [f["id"] for f in FAM["families"]]
    assert len(ids) == len(set(ids)) >= 6
    for f, col, v in cells():
        assert v["t"].strip(), (f["id"], col)
        assert set(v["refs"]) <= REFS, (f["id"], col, set(v["refs"]) - REFS)


def test_numbers_are_cited_and_dashes_are_not():
    for f, col, v in cells():
        if v["t"] == "—":
            assert v["refs"] == [], (f["id"], col)
        else:
            assert v["refs"], f"{f['id']}.{col} has text but no reference"
        if re.search(r"\d", v["t"]):
            assert v["refs"], (f["id"], col)


def test_teaching_row_matches_the_recorded_run():
    row = next(f for f in FAM["families"] if f["id"] == "teach_nmos")
    hottest = max(T for o in LAB["oxides"] if o["id"] in ("field", "gate", "inter") for _, T, _ in o["steps"])
    assert f"{hottest} °C" in row["hottest"]["t"]
    assert row["masks"]["t"].startswith("4")


def test_bundled_for_the_fab_journey():
    js = (ROOT / "site" / "js" / "journey" / "data.js").read_text(encoding="utf-8")
    assert "export const FAMILIES" in js
    assert 'id="famRows"' in (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
