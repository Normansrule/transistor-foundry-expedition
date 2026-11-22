"""Node-reading lab (v1.29): cited pitches, the measuring arithmetic, the matching and the page section."""
import csv
import json
import math
from pathlib import Path

import pytest

from transistor_sim.physics import nodelab as N

ROOT = Path(__file__).resolve().parents[1]
DATA = N.load()
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
HAZARD = ("hydrofluoric", "piranha", "fuming", "nitric", "decap", "sulfuric", "hf ", "boe")


def test_every_value_cites_a_real_key_or_is_marked_est():
    for n in DATA["nodes"]:
        for q in N.QUANTITIES:
            v = n.get(q)
            if v is None:
                assert q == "fin" and n["style"] == "planar", (n["id"], q)
                continue
            assert v[0] > 0
            assert v[1] is None or v[1] in REFS, (n["id"], q, v[1])
    est = [(n["id"], q) for n in DATA["nodes"] for q in N.QUANTITIES if n.get(q) and n[q][1] is None]
    assert est == [("intel45", "mmp")]          # the only estimate, and the page says so


def test_finfets_have_fins_and_pitches_shrink_within_intel():
    intel = [n for n in DATA["nodes"] if n["maker"] == "Intel"]
    assert [n["year"] for n in intel] == sorted(n["year"] for n in intel)
    for a, b in zip(intel, intel[1:]):
        assert N.value(b, "cpp") < N.value(a, "cpp") and N.value(b, "sram") < N.value(a, "sram")
    for n in DATA["nodes"]:
        assert (n["fin"] is not None) == (n["style"] == "finfet")


def test_pitches_agree_with_nodes_csv():
    rows = {r["representative"]: r for r in csv.DictReader(open(ROOT / "data" / "nodes.csv", encoding="utf-8"))}
    pairs = {"intel45": "Core 2 (Penryn)", "intel32": "Sandy Bridge", "intel22": "Ivy Bridge", "intel14": "Broadwell",
             "intel10": "Cannon Lake / Ice Lake", "tsmc_n7": "Apple A12", "tsmc_n5": "Apple A14 / M1"}
    for nid, rep in pairs.items():
        n, r = N.node(nid, DATA), rows[rep]
        assert abs(N.value(n, "cpp") - float(r["cpp_nm"])) <= 1, nid
        assert abs(N.value(n, "mmp") - float(r["mmp_nm"])) <= 1, nid


def test_sram_matches_the_circuit_lab_list():
    mem = json.loads((ROOT / "data" / "memory.json").read_text(encoding="utf-8"))["sram"]
    by = {(m["maker"], m["node"]): m["area_um2"] for m in mem}
    for n in DATA["nodes"]:
        key = (n["maker"], n["label"].split(" (")[0])
        if key in by:
            assert N.value(n, "sram") == pytest.approx(by[key]), n["id"]


def test_pitch_and_its_error():
    assert N.pitch(13.0, 553.0, 10) == pytest.approx(54.0)
    assert N.pitch(700.0, 520.0, 2) == pytest.approx(90.0)
    with pytest.raises(ValueError):
        N.pitch(0, 10, 0)
    assert N.pitch_error(3.0, 10) == pytest.approx(N.pitch_error(3.0, 1) / 10)
    assert N.pitch_error(1.0, 1) == pytest.approx(math.sqrt(2))


@pytest.mark.parametrize("nid", [n["id"] for n in DATA["nodes"]])
def test_exact_measurements_find_their_own_node(nid):
    n = N.node(nid, DATA)
    full = {q: N.value(n, q) for q in N.QUANTITIES if n.get(q)}
    r = N.rank(full, DATA)
    assert r[0] == (nid, 0.0)


def test_five_percent_error_still_separates_intel10_from_n7():
    # Intel 10 nm and TSMC N7 are the closest pair; gate and metal pitch together tell them apart.
    r = N.rank({"cpp": 54 * 1.02, "mmp": 36 * 0.98}, DATA)
    assert r[0][0] == "intel10" and r[1][0] == "tsmc_n7"
    assert N.rank({}, DATA) == []
    assert N.score({"fin": 30}, N.node("intel45", DATA)) is None


def test_bitcell_area_and_drawn_lines():
    for n in DATA["nodes"]:
        w, h = N.cell(n)
        assert w == 2 * N.value(n, "cpp") and w * h / 1e6 == pytest.approx(N.value(n, "sram"))
        v = N.view(n, "gate", 600.0, 17.0)
        gaps = [b - a for a, b in zip(v["centres"], v["centres"][1:])]
        assert all(g == pytest.approx(N.value(n, "cpp")) for g in gaps)
        assert 0 <= v["centres"][0] < N.value(n, "cpp") and v["centres"][-1] <= 600
        assert 0 < v["width"] < N.value(n, "cpp")
    assert N.view(N.node("intel32", DATA), "fin", 600.0) is None


def test_reference_json_has_the_lab():
    ref = json.loads((ROOT / "data" / "physics_reference.json").read_text(encoding="utf-8"))["nodelab"]
    assert ref == json.loads(json.dumps(N.reference()))


def test_page_section_and_bundle():
    html = (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
    assert 'id="nodelab"' in html and "What the model leaves out" in html.split('id="nodelab"')[1].split("</section>")[0]
    sec = html.split('id="nodelab"')[1].split("</section>")[0].lower()
    assert not any(w in sec for w in HAZARD)
    for k in ("nlA", "nlB", "nlN"):
        assert f'<label for="{k}"' in html
    assert "lazy('nodelab', './nodelab.js')" in (ROOT / "site" / "js" / "journey" / "main.js").read_text(encoding="utf-8")
    bundle = (ROOT / "site" / "js" / "journey" / "data.js").read_text(encoding="utf-8")
    assert "export const NODEPITCH" in bundle
    for n in DATA["nodes"]:
        for q in N.QUANTITIES:
            if n.get(q) and n[q][1]:
                assert f'"{n[q][1]}":' in bundle.split("export const REFS")[1], n[q][1]
    assert "'" not in json.dumps(DATA, ensure_ascii=False)     # typographic apostrophes only
