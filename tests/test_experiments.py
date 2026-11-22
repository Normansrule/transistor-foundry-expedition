"""Experiments page (roadmap item 5): tiered experiments, the straight-line fitter and the page."""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))
from transistor_sim.physics import fitting as F  # noqa: E402
from transistor_sim import scaling  # noqa: E402

EXP = json.loads((ROOT / "data" / "experiments.json").read_text(encoding="utf-8"))
XS = EXP["experiments"]
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
SITE = ROOT / "site"


def test_counts_and_tiers():
    assert len(XS) >= 10
    assert sum(1 for x in XS if x["tier"] == 1) >= 6
    assert {x["tier"] for x in XS} <= {0, 1, 2, 3}
    assert [t["tier"] for t in EXP["tiers"]] == [0, 1, 2, 3]
    assert len({x["id"] for x in XS}) == len(XS)
    assert [x["n"] for x in XS] == list(range(1, len(XS) + 1))


@pytest.mark.parametrize("x", XS, ids=lambda x: x["id"])
def test_experiment_schema(x):
    m = F.MODELS[x["model"]]
    assert [c["id"] for c in x["cols"]] == m["cols"]
    assert {p["id"] for p in x["params"]} <= set(m["params"])
    assert x["refs"] and all(c["refs"] for c in x["compare"])
    assert x["steps"] and x["need"] and x["leaves_out"] and x["links"] and x["results"]
    assert x.get("example") or x.get("real"), "each experiment needs model data or real data to try"
    for c in x["compare"]:                       # every number in a comparison is cited
        if re.search(r"\d", c["text"]):
            assert c["refs"]


def test_all_refs_resolve():
    used = {k for x in XS for k in x["refs"]} | {k for x in XS for c in x["compare"] for k in c["refs"]}
    assert not used - REFS, sorted(used - REFS)


def test_tier3_publishes_no_recipe():
    for x in XS:
        if x["tier"] == 3:
            assert not x["params"]
            text = " ".join(x["need"] + x["steps"])
            assert not re.search(r"\d", text), x["id"]
            assert "institution" in (x.get("safety") or "").lower()


def test_no_hazardous_procedure_words():
    text = json.dumps(EXP, ensure_ascii=False).lower()
    for bad in ("hydrofluoric", "buffered oxide", "piranha", "fuming", "molar", "% hf", " wt%", "mercury",
                "class 3b", "class 4", "decapsul", "phosphine", "arsine", "diborane", "spin-on dopant"):
        assert bad not in text, bad


@pytest.mark.parametrize("x", [x for x in XS if x.get("example")], ids=lambda x: x["id"])
def test_fit_recovers_the_example_model(x):
    ex = x["example"]
    rows = F.example(x["model"], ex["xs"], ex["truth"], ex["noise"], ex["seed"])
    p = {k: v for k, v in ex["truth"].items() if k in F.MODELS[x["model"]]["params"]}
    r = F.fit(x["model"], rows, p)
    want = {"yield": ("D", ex["truth"].get("D")), "gelatin": ("k_mm2_per_min", ex["truth"].get("k")),
            "capacitor": ("eps_r", ex["truth"].get("eps_r")), "cd": ("d_um", ex["truth"].get("d_um")),
            "diode": ("n", ex["truth"].get("n")), "led": ("h_Js", ex["truth"].get("h_Js")),
            "mosfet": ("Vt", ex["truth"].get("Vt")), "pencil": ("Rs_ohm_sq", ex["truth"].get("Rs_ohm_sq")),
            "thermometer": ("dVdT_mV_per_K", ex["truth"].get("dVdT", 0) * 1e3),
            "sunprint": ("lambda_eff_nm", ex["truth"].get("lambda_um", 0) * 1e3),
            "crystal": ("rate_g_per_day", ex["truth"].get("rate")), "fourpoint": ("Rs_ohm_sq", ex["truth"].get("Rs_ohm_sq")),
            "etch": ("rate_nm_per_min", ex["truth"].get("rate_nm_per_s", 0) * 60)}[x["id"]]
    key, val = want
    assert r["out"][key] == pytest.approx(val, rel=0.1), (key, r["out"][key], val)
    assert r["r2"] > 0.98
    assert abs(r["out"][key] - val) < 4 * r["err"][key] + 0.1 * abs(val)


def test_noise_free_examples_are_exact():
    rows = F.example("tlm", [10, 20, 40, 80], {"Rs_ohm_sq": 50, "Rc_ohm": 7, "W_mm": 2}, 0.0)
    r = F.fit("tlm", rows, {"W_mm": 2})
    assert r["out"]["Rs_ohm_sq"] == pytest.approx(50) and r["out"]["Rc_ohm"] == pytest.approx(7)
    assert r["out"]["LT_mm"] == pytest.approx(7 * 2 / 50)
    rows = F.example("diode", [0.3, 0.4, 0.5, 0.6], {"Is_A": 1e-12, "n": 1.0, "T_K": 300}, 0.0)
    assert F.fit("diode", rows, {"T_K": 300})["out"]["n"] == pytest.approx(1.0, rel=1e-3)   # the "−1" in Shockley's law is tiny here
    rows = F.example("fourpoint", [1, 2, 3], {"Rs_ohm_sq": 10}, 0.0)
    assert F.fit("fourpoint", rows)["out"]["Rs_ohm_sq"] == pytest.approx(10)


def test_line_basics():
    r = F.line([0, 1, 2, 3], [1, 3, 5, 7])
    assert (r["a"], r["b"], r["r2"]) == (pytest.approx(1), pytest.approx(2), pytest.approx(1))
    assert F.line([1, 2, 3], [2, 4, 6.1], origin=True)["a"] == 0
    with pytest.raises(ValueError):
        F.line([1, 2], [1, 2])
    with pytest.raises(ValueError):
        F.line([1, 1, 1], [1, 2, 3])


def test_real_moore_fit_matches_the_site_chart():
    chips = json.loads((ROOT / "data" / "chips.json").read_text(encoding="utf-8"))["chips"]
    rows = [[c["year"], c["transistors"]] for c in chips if c["family"] in ("planar", "3d") and c["id"] not in ("wse3", "ibm07")]
    assert F.fit("moore", rows)["out"]["T_years"] == pytest.approx(scaling.moore_fit()[0], rel=1e-9)


def test_parse_csv():
    assert F.parse_csv("V,I_mA\n# comment\n0.5;0.1\n0.6\t1.2\n\n0.7, 3e-2\n") == [[0.5, 0.1], [0.6, 1.2], [0.7, 0.03]]


def test_diode_temperature_coefficient():
    assert F.diode_dvdt(0.6, 300) * 1e3 == pytest.approx(-2.0, abs=0.1)


def test_page_is_built_and_linked():
    assert subprocess.run([sys.executable, str(ROOT / "scripts" / "build_experiments.py"), "--check"]).returncode == 0
    html = (SITE / "experiments.html").read_text(encoding="utf-8")
    for x in XS:
        assert f'id="ex-{x["id"]}"' in html
        for link in x["links"]:
            page, _, frag = link["href"].partition("#")
            target = (SITE / page).read_text(encoding="utf-8")
            assert not frag or f'id="{frag}"' in target, link["href"]
    assert 'href="experiments.html" aria-current="page"' in html
    assert 'src="js/experiments/main.js"' in html and 'href="css/traveler.css"' in html
    for tag in re.findall(r'<div class="xp-chart"[^>]*>', html):
        assert 'role="img"' in tag and "aria-label=" in tag


def test_docs_chapter_ends_with_what_the_models_leave_out():
    md = (ROOT / "docs" / "26-experiments.md").read_text(encoding="utf-8")
    heads = re.findall(r"^## (.+)$", md, re.M)
    assert heads and heads[-1].startswith("What the models leave out")
