"""SoC Explorer (v1.32): the RISC-V core, its synthesised blocks, the x86 translator and the page."""
import json
import re
from pathlib import Path

import pytest

from transistor_sim import soc
from transistor_sim.physics import riscv as R

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data" / "soc.json").read_text(encoding="utf-8"))
REFS = {r["id"] for r in json.loads((ROOT / "data" / "references.json").read_text(encoding="utf-8"))["references"]}


def test_encodings_match_the_riscv_spec_examples():
    # hand-checked against the RV32I formats (riscv_isa)
    words = R.assemble("addi x1, x0, 5\nadd x2, x2, x1\nsub x3, x1, x2\nlw x3, 256(x0)\nsw x2, 256(x0)\nlui x4, 0x10000\njal x0, 0\n")["words"]
    assert words == [0x00500093, 0x00110133, 0x402081B3, 0x10002183, 0x10202023, 0x10000237, 0x0000006F]


def test_decode_inverts_encode_for_every_instruction_kind():
    src = "\n".join(["add x1, x2, x3", "sub x4, x5, x6", "and x7, x8, x9", "or x10, x11, x12", "xor x13, x14, x15", "slt x16, x17, x18",
                     "addi x1, x2, -2048", "slti x3, x4, 2047", "xori x5, x6, -1", "ori x7, x8, 255", "andi x9, x10, 15",
                     "lw x11, -4(x12)", "sw x13, 2047(x14)", "lui x15, 0xfffff", "jal x1, 0"])
    for line, w in zip(src.splitlines(), R.assemble(src)["words"]):
        d = R.decode(w)
        assert R.assemble(d["text"].replace("+", ""))["words"] == [w] or d["cls"] == "JAL", line


def test_branch_offsets_round_trip():
    a = R.assemble("top: addi x1, x1, 1\n beq x1, x2, top\n bne x1, x0, end\n addi x0, x0, 0\nend: jal x0, top\n")
    ds = [R.decode(w) for w in a["words"]]
    assert ds[1]["imm"] == -4 and ds[2]["imm"] == 8 and ds[4]["imm"] == -16


def test_assembler_reports_errors_with_line_numbers():
    for bad, msg in [("addi x1, x0, 4096", "12 bits"), ("mul x1, x2, x3", "17 instructions"), ("add x1, x2", "3 operands"), ("addi x40, x0, 1", "register")]:
        with pytest.raises(ValueError, match=msg):
            R.assemble("addi x1, x0, 1\n" + bad)


def test_demo_program_result():
    sq = R.sequential(R.assemble(R.DEMO)["words"])
    assert sq["x"][2] == 15 and sq["x"][3] == 15 and sq["x"][5] == 30 and sq["gpio"] == 30
    assert sq["mem"][256] == 15


def test_both_cores_agree_with_the_plain_run():
    words = R.assemble(R.DEMO)["words"]
    sq, mc, pl = R.sequential(words), R.multicycle(words), R.pipeline(words)
    assert mc["x"] == sq["x"] and mc["gpio"] == sq["gpio"]
    assert mc["retired"] == len(sq["seq"]) == pl["retired"]
    # cycles per class: R, I, STORE 4; LOAD 5; BRANCH, JAL, LUI 3 (patterson2020's multi-cycle design)
    per = {"R": 4, "I": 4, "LOAD": 5, "STORE": 4, "BRANCH": 3, "JAL": 3, "LUI": 3}
    assert mc["cycles"] == sum(per[s["cls"]] for s in sq["seq"])


def test_pipeline_hazards():
    pl = R.pipeline(R.assemble(R.DEMO)["words"])
    assert pl["stalls"] == 1                                   # lw x3 then add x5, x3, x3
    taken = sum(1 for s in R.sequential(R.assemble(R.DEMO)["words"])["seq"] if s["taken"])
    assert pl["flushes"] == 2 * taken
    # ideal: 4 cycles to fill + 1 per instruction, plus bubbles (the halting jump's own flush comes after the end)
    assert pl["cycles"] == 4 + pl["retired"] + pl["stalls"] + pl["flushes"] - len(pl["rows"][-1]["flushed"])
    for a, b in zip(pl["rows"], pl["rows"][1:]):
        assert b["if"] > a["if"] and b["ex"] > a["ex"] and b["wb"] > a["wb"]


def test_controller_states_and_edges():
    assert len(R.STATES) == 12
    edges = R.transitions()
    for s in R.STATES:
        assert any(e[0] == s for e in edges)
    for s, c, t in edges:
        assert R.next_state(s, c or "R") == t


def test_alu_netlist_equals_its_rtl_for_every_input():
    assert soc.check_alu(DATA["modules"]["alu"]["netlist"]) == 0


def test_controller_netlist_equals_its_rtl_for_every_legal_input():
    assert soc.check_ctrl(DATA["modules"]["ctrl"]["netlist"]) == 0


def test_quine_mccluskey_minimises():
    # f = Σm(0,1,2,5,6,7) has a known minimum of three 2-literal terms
    cover = soc.minimise({0, 1, 2, 5, 6, 7}, set(), 3)
    assert len(cover) == 3 and all(c.count("-") == 1 for c in cover)
    for m in range(8):
        assert any(soc.covers(c, m, 3) for c in cover) == (m in {0, 1, 2, 5, 6, 7})


@pytest.mark.parametrize("key", ["alu", "ctrl"])
def test_netlists_use_only_cells_with_a_layout_and_are_topological(key):
    nl = DATA["modules"][key]["netlist"]
    gc = json.loads((ROOT / "data" / "gate_cells.json").read_text(encoding="utf-8"))
    seen = set(nl["inputs"])
    for g in nl["cells"]:
        assert g["cell"] in gc["gates"]
        assert set(g["ins"]) == set(gc["gates"][g["cell"]]["inputs"])
        assert all(n in seen for n in g["ins"].values()), g
        seen.add(g["out"])
    assert all(o in seen for o in nl["outputs"])


@pytest.mark.parametrize("key", ["alu", "ctrl"])
def test_placement_rows_do_not_overlap(key):
    for tech, L in DATA["modules"][key]["layout"].items():
        rows = {}
        for p in L["place"]:
            rows.setdefault(p["row"], []).append(p)
        for ps in rows.values():
            ps.sort(key=lambda p: p["x"])
            for a, b in zip(ps, ps[1:]):
                assert a["x"] + a["w"] <= b["x"] + 1e-6, (tech, a, b)
        assert len(L["place"]) == len(DATA["modules"][key]["netlist"]["cells"])
    a = {t: L["width"] * L["height"] for t, L in DATA["modules"][key]["layout"].items()}
    assert a["planar_180"] > a["finfet_5"] > a["gaa_2"]


def test_alu_critical_path_is_the_ripple_carry():
    t = DATA["modules"]["alu"]["sta"]
    nl = {g["id"]: g for g in DATA["modules"]["alu"]["netlist"]["cells"]}
    carries = [g for g in t["path"] if "carry" in nl[g]["tags"]]
    assert len(carries) >= 6 and t["end"] == "zero"
    assert t["tau"] == pytest.approx(R.sta(DATA["modules"]["alu"]["netlist"], DATA["effort"])["tau"])


def test_every_fsm_edge_and_rtl_tag_links_somewhere():
    view = DATA["modules"]["ctrl"]["view"]
    for s, c, t in DATA["transitions"]:
        e = f"{s}>{c or ''}>{t}"
        assert e in view
        assert any(f"edge:{e}" in l["tags"] for l in DATA["modules"]["ctrl"]["rtl"]), e
        if t != "FETCH":
            assert view[e], e                                 # a transition into a non-zero code needs gates
    for s in DATA["states"]:
        assert bool(view[s]) == bool(R.ASSERT.get(s)), s


def test_x86_decoder_lengths_and_translation():
    ins = R.x86_decode(R.x86_bytes(R.X86_DEMO))
    assert [i["len"] for i in ins] == [5, 5, 2, 1, 2, 5, 3, 2]
    assert all(1 <= i["len"] <= 15 for i in ins)               # intel_sdm: at most 15 bytes
    tx = R.x86_translate(R.X86_DEMO)
    run = R.sequential(R.assemble(tx["asm"])["words"])
    assert run["x"][R.X86_MAP["eax"]] == 15 and run["mem"][0x100] == 15   # same answer as the RISC-V demo
    assert "bne x11, x0" in tx["asm"]                          # dec ecx; jne → one bne (lazy zero flag)


@pytest.mark.parametrize("src,reg,val", [
    ("BB F8 00 00 00 B8 07 00 00 00 01 43 08 03 43 08 EB FE", "eax", 14),
    ("B8 2A 00 00 00 BC 00 02 00 00 50 59 EB FE", "ecx", 42),
    ("B8 03 00 00 00 B9 03 00 00 00 39 C8 74 02 41 41 42 EB FE", "edx", 1),
    ("B8 78 56 34 12 EB FE", "eax", 0x12345678),
])
def test_x86_presets_run(src, reg, val):
    run = R.sequential(R.assemble(R.x86_translate(src)["asm"])["words"])
    assert run["x"][R.X86_MAP[reg]] == val


def test_x86_decoder_rejects_what_it_does_not_know():
    with pytest.raises(ValueError, match="teaching subset"):
        R.x86_decode([0x0F, 0xAF, 0xC1])
    with pytest.raises(ValueError, match="SIB"):
        R.x86_decode([0x01, 0x04, 0x24])


def test_generated_file_is_current():
    fresh = soc.build()
    assert json.loads(json.dumps(fresh, ensure_ascii=False)) == DATA, "run python -m transistor_sim.soc"


def test_page_and_citations():
    html = (ROOT / "site" / "soc.html").read_text(encoding="utf-8")
    for sec in ("chip", "views", "synth", "pipeline", "x86", "soc-limits", "soc-sources"):
        assert f'id="{sec}"' in html
    assert "What the models leave out" in html
    for svg in re.findall(r"<svg id=[^>]*>", html):
        assert "aria-label" in svg, svg
    js = (ROOT / "site" / "js" / "soc" / "data.js").read_text(encoding="utf-8")
    for k in ("riscv_isa", "intel_sdm", "fog_microarch", "wikichip_mopfusion", "patterson2020", "quine1952", "mccluskey1956", "sutherland1999"):
        assert k in REFS and f'"{k}"' in js
