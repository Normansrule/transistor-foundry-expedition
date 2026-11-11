"""data/manuals.json: cited, safe, and its generated outputs (web, Markdown, README block) up to date."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAN = json.loads((ROOT / "data" / "manuals.json").read_text(encoding="utf-8"))["manuals"]
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
FAB = json.loads((ROOT / "data" / "fab_steps.json").read_text(encoding="utf-8"))
CANDS = {c["id"] for c in json.loads((ROOT / "data" / "photo_candidates.json").read_text(encoding="utf-8"))["candidates"]}
CITE = re.compile(r"\[@([\w-]+)\]")
NUMBER = re.compile(r"\d")


def refs_of(x):
    return x["refs"] if "refs" in x else [x["ref"]]


def texts(m):
    yield m["intro"]; yield m["model_after"]
    for s in m["steps"]:
        yield s["do"]; yield s["check"]; yield s["deep"]
        yield from (c["t"] for c in s["chips"])
    yield from m["leave_out"]


def test_every_cite_key_exists():
    for m in MAN:
        for t in texts(m):
            assert set(CITE.findall(t)) <= REFS, (m["id"], t)
        for s in m["steps"]:
            assert all(set(refs_of(p)) <= REFS for p in s["spec"]["params"]), s["id"]
            assert set(CITE.findall(s["spec"]["ooc"])) <= REFS, s["id"]
        v = m.get("variant")
        if v:
            assert all(set(refs_of(f)) <= REFS and refs_of(f) for f in v["facts"])
            assert set(v.get("generations_ref", [])) <= REFS
            for t in v.get("tables", []):
                for row in t["rows"]:
                    assert set(CITE.findall(" ".join(row))) <= REFS, row
        assert set(m["refs"]) <= REFS


def test_chips_with_numbers_are_cited():
    for m in MAN:
        for s in m["steps"]:
            for c in s["chips"]:
                if NUMBER.search(CITE.sub("", c["t"])):
                    assert CITE.search(c["t"]), (s["id"], c["t"])


def test_steps_numbered_and_linked():
    areas = {a["id"] for a in FAB["areas"]}
    fab_ids = {s["id"] for s in FAB["steps"]}
    for m in MAN:
        assert m["area"] in areas and m["fab_step"] in fab_ids
        assert next(a["number"] for a in FAB["areas"] if a["id"] == m["area"]) == m["area_no"], m["id"]
        assert [s["n"] for s in m["steps"]] == list(range(1, len(m["steps"]) + 1))
        assert set(m["photos"]) <= CANDS
        assert m["leave_out"], "every manual ends with what the models leave out"
        for s in m["steps"]:
            assert s["tier"] in (0, 1, 2, 3) and s["frame"]["layers"], s["id"]


def test_ids_codes_and_routes():
    ids = [m["id"] for m in MAN]
    assert len(ids) == len(set(ids)) and len({m["code"] for m in MAN}) == len(MAN)
    doc = json.loads((ROOT / "data" / "manuals.json").read_text(encoding="utf-8"))
    for r in doc["routes"]:
        assert r["order"], r["name"]


def test_tier3_publishes_no_parameters():
    for m in MAN:
        for s in m["steps"]:
            if s["tier"] == 3:
                assert s["spec"]["params"] == [] and not NUMBER.search(" ".join(c["t"] for c in s["chips"])), s["id"]


def test_generated_outputs_up_to_date():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_manuals.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_manual_refs_are_merged():
    extra = json.loads((ROOT / "data" / "manual_refs.json").read_text(encoding="utf-8"))["references"]
    assert {r["id"] for r in extra} <= REFS, "run python scripts/manuals_apply.py"


def test_manuals_page_in_nav():
    html = (ROOT / "site" / "manuals.html").read_text(encoding="utf-8")
    assert 'aria-current="page"' in html and 'href="manuals.html"' in (ROOT / "site" / "index.html").read_text(encoding="utf-8")
