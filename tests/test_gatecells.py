"""Gate to silicon (gatecells.py → data/gate_cells.json → site/js/journey/gates.js): the layouts follow
the gate's series/parallel networks, the sizes come from logical effort, and the generated JSON is
current. The full adder and the 6T SRAM cell (gateblocks.py) share the same pipeline."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sim"))

from transistor_sim import gateblocks, gatecells  # noqa: E402
from transistor_sim.physics import logic  # noqa: E402

DATA = json.loads((ROOT / "data" / "gate_cells.json").read_text(encoding="utf-8"))
GATES = {k: g for k, g in DATA["gates"].items() if g["kind"] == "gate"}


def test_json_is_current():
    fresh = json.loads(json.dumps(gatecells.export(), ensure_ascii=False))
    assert DATA == fresh, "data/gate_cells.json is stale: run python -m transistor_sim.gatecells"


def test_strips_realise_the_netlist():
    """Both strips use the same finger order, and each finger sits between the two nodes its
    transistor connects in logic.netlist: the layout is the circuit."""
    for k in gatecells.KEYS:
        st = gatecells.strips(k)
        for typ in ("n", "p"):
            seq = st[typ]
            assert len(seq) == len(st["order"]) + 1
            want = sorted((t["g"], *sorted((t["a"], t["b"]))) for t in logic.netlist(k)["transistors"] if t["type"] == typ and not t.get("aux"))
            got = sorted((sig, *sorted((seq[i], seq[i + 1]))) for i, sig in enumerate(st["order"]))
            assert got == want, (k, typ)


def test_region_roles():
    for k in gatecells.KEYS:
        for typ in ("n", "p"):
            regs = gatecells.regions(k, typ)
            assert [r["kind"] for r in regs] == ["sd", "gate"] * len(gatecells.strips(k)["order"]) + ["sd"]
            seq = [r["node"] for r in regs if r["kind"] == "sd"]
            for r in regs:
                if r["kind"] != "sd":
                    continue
                want = "rail" if r["node"] in ("vdd", "gnd") else "out" if r["node"] == "y" else "link" if seq.count(r["node"]) > 1 else "internal"
                assert r["role"] == want
            assert "y" in seq and ("gnd" if typ == "n" else "vdd") in seq


def test_textbook_cases():
    # NAND2: series nMOS shared strip with one internal node; parallel pMOS alternate rail/out
    st = gatecells.strips("nand2")
    assert st["n"] == ["gnd", st["n"][1], "y"] and st["p"] == ["vdd", "y", "vdd"]
    # AOI22 needs a strap (a link) on the pMOS strip but no diffusion break
    assert any(r["role"] == "link" for r in gatecells.regions("aoi22", "p"))


def test_links_have_metal2_straps():
    for k, g in GATES.items():
        has_link = any(r.get("role") == "link" for t in ("n", "p") for r in g["regions"][t])
        for tech, c in g["cells"].items():
            layers = {sh[0] for sh in c["shapes"]}
            assert ("metal2" in layers) == has_link, (k, tech)
            assert ("via" in layers) == has_link, (k, tech)


def test_widths_from_logical_effort():
    for k in ("inv", "nand2", "nor2", "nand3", "nor3"):
        w = gatecells.widths(k)
        nk = logic.GATES[k]["pd"]
        n = len(logic.GATES[k]["inputs"])
        series = isinstance(nk, tuple) and nk[0] == "s"
        assert all(abs(v - (n if series else 1)) < 1e-9 for v in w["n"].values()), k
        assert all(abs(v - (2 if series or n == 1 else 2 * n)) < 1e-9 for v in w["p"].values()), k


def test_dimensions_are_cited_or_marked():
    refs = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}
    for g in DATA["gates"].values():
        for c in g["cells"].values():
            assert len(c["dims"]) >= 3
            for d in c["dims"]:
                assert d["ref"] in refs or "est." in d["label"] or d["label"].startswith("cell"), d
                assert d["b"] > d["a"]


def test_truth_tables_match_logic_model():
    for k, g in GATES.items():
        assert g["outputs"] == ["Y"]
        assert [[list(b), [y]] for b, y in logic.truth(k)] == g["truth"]
        for bits, (y,) in g["truth"]:
            val = dict(zip(g["inputs"], bits))
            assert (0 if logic.conducts(logic.GATES[k]["pd"], val) else 1) == y


def test_shapes_and_techs():
    assert DATA["techs"]["finfet_5"]["cpp"] == 51 and DATA["techs"]["finfet_5"]["mmp"] == 28   # TSMC N5, nodes.csv
    assert DATA["techs"]["planar_180"]["lam"] == 90
    for k, g in DATA["gates"].items():
        for tech, c in g["cells"].items():
            assert c["w"] > 0 and c["h"] > 0
            for l, x0, y0, x1, y1 in c["shapes"]:
                assert l in gatecells.GC_LAYERS and x1 > x0 and y1 > y0, (k, tech, l)
            if g["kind"] == "gate":
                assert set(c["pins"]) == set(g["order"]) and {p.lstrip("!") for p in c["pins"]} == set(g["inputs"]), (k, tech)
            else:   # a block brings out its inputs; the SRAM's Q is stored state, so only WL is a pin
                assert set(c["pins"]) == (set(g["inputs"]) - {"Q"}), (k, tech)
        # newer nodes are smaller
        a = {t: c["w"] * c["h"] for t, c in g["cells"].items()}
        assert a["planar_180"] > a["finfet_5"] > a["gaa_2"], k


def test_page_has_the_gate_section():
    html = (ROOT / "site" / "fab.html").read_text(encoding="utf-8")
    for i in ("gtPick", "gtTech", "gtCut", "gtInputs", "gtTruth", "gtSymbol", "gtSchem", "gtLayout", "gtXs", "gtSay", "gtSize", "gtExpr", "gtDims", "gt3d", "gtExplode"):
        assert f'id="{i}"' in html, i
    js = (ROOT / "site" / "js" / "journey" / "main.js").read_text(encoding="utf-8")
    assert "lazy('gates', './gates.js')" in js


# ── blocks: the 28-transistor mirror adder and the 6T SRAM cell ────────────────────────────────

def test_full_adder_adds():
    fa = DATA["gates"]["fa"]
    assert fa["kind"] == "fa" and fa["outputs"] == ["S", "Co"] and len(fa["truth"]) == 8
    for bits, (s, co) in fa["truth"]:
        assert 2 * co + s == sum(bits), bits


def test_full_adder_is_28_mirrored_transistors():
    strips = gateblocks.fa_strips()
    assert sum(2 * len(st["order"]) for st in strips) == 28 == DATA["gates"]["fa"]["effort"]["n"]
    for stage, st in zip(gateblocks.FA_STAGES, strips):
        for typ in ("n", "p"):
            seq = st[typ]
            assert len(seq) == len(st["order"]) + 1
            want = sorted((g, *sorted((a, b))) for g, a, b, _w in gateblocks._devices(stage, typ))
            got = sorted((sig, *sorted((seq[i], seq[i + 1]))) for i, sig in enumerate(st["order"]))
            assert got == want, (stage["out"], typ)
    # the mirror adder's carry and sum stages are self-dual: pull-up is the same network as pull-down
    for stage in DATA["gates"]["fa"]["stages"][:2]:
        assert stage["mirror"] and stage["pu"] == stage["pd"]


def test_full_adder_stages_are_separated_by_breaks():
    regs = DATA["gates"]["fa"]["regions"]
    for typ in ("n", "p"):
        assert sum(r["kind"] == "break" for r in regs[typ]) == 3
        assert sum(r["kind"] == "gate" for r in regs[typ]) == 14


def test_sram_strips_and_cell_ratio():
    assert gateblocks.SRAM_N["nodes"] == ["BL", "Q", "gnd", "QB", "BLB"]
    assert gateblocks.SRAM_P["nodes"] == ["Q", "vdd", "QB"]
    pg, pd = gateblocks.SRAM_N["w"][0], gateblocks.SRAM_N["w"][1]
    assert pd / pg == 2                                     # cell ratio 2 keeps a read from flipping the cell
    roles = {r["node"]: r["role"] for r in DATA["gates"]["sram6t"]["regions"]["n"] if r["kind"] == "sd"}
    assert roles == {"BL": "bitline", "BLB": "bitline", "Q": "storage", "QB": "storage", "gnd": "rail"}


def test_sram_behaviour():
    g = DATA["gates"]["sram6t"]
    assert g["inputs"] == ["WL", "Q"] and g["outputs"] == ["QB", "BLd", "BLBd"]
    for (wl, q), (qb, bld, blbd) in g["truth"]:
        assert qb == 1 - q                                   # the latch holds complementary nodes
        assert (bld, blbd) == ((1 - q, q) if wl else (0, 0))  # a read discharges the bit line on the 0 side


def test_sram_is_smaller_than_the_adder_and_planar_is_huge():
    for tech in DATA["techs"]:
        s, f = DATA["gates"]["sram6t"]["cells"][tech], DATA["gates"]["fa"]["cells"][tech]
        assert s["w"] * s["h"] < f["w"] * f["h"]
    fin = DATA["gates"]["sram6t"]["cells"]["finfet_5"]
    assert 0.021 < fin["w"] * fin["h"] / 1e6 < 0.2           # µm²; a real N5 cell is 0.021 µm² (yeap2019)


# ── arrays: the blocks tiled as a 4-bit ripple-carry adder and a 4 × 4 SRAM array ─────────────

def test_ripple_adder_adds_through_the_stages():
    bits = lambda x: [(x >> i) & 1 for i in range(4)]
    for x in range(16):
        for y in range(16):
            for ci in (0, 1):
                s, carry = gateblocks.ripple(bits(x), bits(y), ci)
                assert sum(b << i for i, b in enumerate(s)) + (carry[4] << 4) == x + y + ci


def test_carry_routes_join_cout_to_the_next_cin():
    for tech, c in DATA["gates"]["fa"]["cells"].items():
        a = c["array"]
        assert a["nx"] == 4 and a["ny"] == 1 and len(a["routes"]) == 3 and abs(a["w"] - 4 * c["w"]) < 1e-6
        for i, pts in enumerate(a["routes"]):
            assert pts[0] == [round(i * c["w"] + c["outs"]["Co"][0], 3), round(c["outs"]["Co"][1], 3)], tech
            assert pts[-1] == [round((i + 1) * c["w"] + c["pins"]["C"][0], 3), round(c["pins"]["C"][1], 3)], tech
            assert all(p[0] == q[0] or p[1] == q[1] for p, q in zip(pts, pts[1:]))      # Manhattan wiring


def test_sram_cells_tile_without_breaks_or_shorts():
    for tech, c in DATA["gates"]["sram6t"]["cells"].items():
        a, w, h = c["array"], c["w"], c["h"]
        assert a["nx"] == a["ny"] == 4 and a["mirror_y"] and abs(a["w"] - 4 * w) < 1e-6 and abs(a["h"] - 4 * h) < 1e-6
        assert abs(a["bit_um2"] * a["mbit_per_mm2"] - 1) < 0.01
        full_w = lambda l: [sh for sh in c["shapes"] if sh[0] == l and sh[1] <= 0 and sh[3] >= w]
        full_h = lambda l: [sh for sh in c["shapes"] if sh[0] == l and sh[2] <= 0 and sh[4] >= h]
        planar = tech == "planar_180"
        # the word line runs edge to edge (poly in planar, metal 2 when gridded), so it continues into the next cell
        assert full_w("poly" if planar else "metal2"), tech
        # the bit lines run top to bottom: metal 2 in planar, metal 1 when gridded; nothing else on that layer
        # crosses the whole cell sideways, or the bit lines would short to it
        bl = "metal2" if planar else "metal1"
        assert len(full_h(bl)) >= 2, tech
        assert not full_w(bl), tech
