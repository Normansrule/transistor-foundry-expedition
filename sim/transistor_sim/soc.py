"""SoC Explorer generator (v1.32): one small design written four ways.

Two blocks of the teaching RISC-V core (physics/riscv.py) are taken all the way down:

  * alu4: a 4-bit slice of the ALU (AND, OR, ADD, SUB and a zero flag), mapped by hand the way a
    designer would write a structural netlist: per bit two XORs for the sum, three NAND2s for the
    carry (majority = ab + c(a⊕b)), a NAND2 and a NOR2 for AND/OR and two AOI22s for the result
    multiplexer.
  * ctrl: the controller, a 12-state Moore machine. Its next-state and control-output tables come
    from riscv.next_state() and riscv.ASSERT; each output is minimised with the Quine–McCluskey
    method (quine1952, mccluskey1956), shared product terms are built once, and the sums of
    products are mapped onto the library's NAND, NOR and inverter cells.

Both netlists use only cells that already have a drawn layout in data/gate_cells.json (the "Gate to
silicon" cells on fab.html), so the layout view can place real cells for all three technologies in
standard-cell rows. Each netlist is checked against its behaviour for every input (tests/test_soc.py).
The RTL text shown on the page is generated here too, with each line tagged by the gates it became.

    python -m transistor_sim.soc        writes data/soc.json
"""
from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

from .physics import riscv

ROOT = Path(__file__).resolve().parents[2]
GC = json.loads((ROOT / "data" / "gate_cells.json").read_text(encoding="utf-8"))
EFFORT = {k: {"g": GC["gates"][k]["effort"]["g"], "p": GC["gates"][k]["effort"]["p"], "n": GC["gates"][k]["effort"]["n"]}
          for k in riscv.CELL_FN}
PINS = {k: GC["gates"][k]["inputs"] for k in riscv.CELL_FN}


# ---------------------------------------------------------------------------- Quine–McCluskey
def _combine(a, b):
    """Merge two implicants (strings of 0/1/-) that differ in one fixed bit, else None."""
    diff = [i for i in range(len(a)) if a[i] != b[i]]
    if len(diff) == 1 and a[diff[0]] != "-" and b[diff[0]] != "-":
        i = diff[0]
        return a[:i] + "-" + a[i + 1:]
    return None


def covers(imp: str, m: int, n: int) -> bool:
    bits = format(m, f"0{n}b")
    return all(c == "-" or c == b for c, b in zip(imp, bits))


def prime_implicants(ones, dcs, n):
    cur = {format(m, f"0{n}b") for m in ones | dcs}
    primes = set()
    while cur:
        nxt, used = set(), set()
        for a, b in combinations(sorted(cur), 2):
            c = _combine(a, b)
            if c:
                nxt.add(c)
                used |= {a, b}
        primes |= cur - used
        cur = nxt
    return sorted(primes)


def minimise(ones: set, dcs: set, n: int) -> list[str]:
    """Essential primes first, then the smallest set of other primes that covers the rest
    (ties: fewest literals, then alphabetical). Deterministic and minimal in the number of terms."""
    if not ones:
        return []
    primes = prime_implicants(ones, dcs, n)
    left = set(ones)
    chosen = []
    for m in sorted(ones):
        cov = [p for p in primes if covers(p, m, n)]
        if len(cov) == 1 and cov[0] not in chosen:
            chosen.append(cov[0])
    for p in chosen:
        left -= {m for m in left if covers(p, m, n)}
    if left:
        # the cyclic core: try every set of the remaining primes, smallest first (Petrick's goal, by search);
        # ties go to the fewest literals, then alphabetical order
        rest = sorted((p for p in primes if p not in chosen and any(covers(p, m, n) for m in left)),
                      key=lambda p: (-p.count("-"), p))
        for k in range(1, len(rest) + 1):
            best = None
            for combo in combinations(rest, k):
                if all(any(covers(p, m, n) for p in combo) for m in left):
                    key = (-sum(p.count("-") for p in combo), combo)
                    if best is None or key < best[0]:
                        best = (key, combo)
            if best:
                chosen += list(best[1])
                break
    return sorted(chosen)


# ---------------------------------------------------------------------------- netlist builder
class Net:
    """Builds a mapped netlist in topological order, sharing inverters and identical terms."""

    def __init__(self, name, inputs):
        self.name, self.inputs, self.cells, self.outputs = name, list(inputs), [], []
        self.memo, self.k = {}, 0

    def cell(self, kind, ins: list, tags=()):
        key = (kind, tuple(ins))
        if key in self.memo:
            g = self.memo[key]
            for t in tags:
                if t not in g["tags"]:
                    g["tags"].append(t)
            return g["out"]
        self.k += 1
        gid = f"{self.name}.u{self.k}"
        out = f"n{self.k}"
        g = dict(id=gid, cell=kind, ins=dict(zip(PINS[kind], ins)), out=out, tags=list(tags))
        self.cells.append(g)
        self.memo[key] = g
        return out

    def rename(self, net, name):
        """Give a cell's output net a readable name (an output port)."""
        for g in self.cells:
            if g["out"] == net:
                g["out"] = name
            for p, n in g["ins"].items():
                if n == net:
                    g["ins"][p] = name
        return name

    def dict(self):
        return dict(inputs=self.inputs, outputs=self.outputs, cells=self.cells)


def _chunks(xs, k=3):
    return [xs[i:i + k] for i in range(0, len(xs), k)]


def _pos(nb: Net, item, tags):
    net, neg = item
    return nb.cell("inv", [net], tags) if neg else net


def _and(nb: Net, lits, tags):
    """AND of literal nets → (net, neg): neg=True means the net carries the complement."""
    if len(lits) == 1:
        return (lits[0], False)
    if len(lits) <= 3:
        return (nb.cell(f"nand{len(lits)}", sorted(lits), tags), True)
    parts = [nb.cell(f"nand{len(g)}", sorted(g), tags) if len(g) > 1 else nb.cell("inv", g, tags) for g in _chunks(sorted(lits))]
    if len(parts) <= 3:
        return (nb.cell(f"nor{len(parts)}", parts, tags), False)
    raise ValueError("product term too wide")


def _or(nb: Net, items, tags):
    """OR of (net, neg) items → a positive net."""
    if len(items) == 1:
        return _pos(nb, items[0], tags)
    if len(items) <= 3:
        if all(n for _, n in items):
            return nb.cell(f"nand{len(items)}", sorted(x for x, _ in items), tags)
        if not any(n for _, n in items):
            return nb.cell("inv", [nb.cell(f"nor{len(items)}", sorted(x for x, _ in items), tags)], tags)
        negs = sorted(x if n else nb.cell("inv", [x], tags) for x, n in items)
        return nb.cell(f"nand{len(items)}", negs, tags)
    return _or(nb, [(_or(nb, g, tags), False) for g in _chunks(items)], tags)


# ---------------------------------------------------------------------------- the controller
SBITS = 4
CBITS = 3
SIG_S = [f"s{i}" for i in range(SBITS - 1, -1, -1)]          # s3 s2 s1 s0
SIG_C = [f"c{i}" for i in range(CBITS - 1, -1, -1)]          # c2 c1 c0


def ctrl_tables():
    """Truth tables: next-state bits over (state, class) and control outputs over state."""
    S = riscv.STATES
    ns = {f"ns{b}": set() for b in range(SBITS)}
    dc7 = set()
    edge_of = {}
    for code in range(1 << (SBITS + CBITS)):
        s, c = code >> CBITS, code & 7
        if s >= len(S) or c >= len(riscv.CLASSES):
            dc7.add(code)
            continue
        nxt = riscv.next_state(S[s], riscv.CLASSES[c])
        t = S.index(nxt)
        for b in range(SBITS):
            if t >> b & 1:
                ns[f"ns{b}"].add(code)
        cond = riscv.CLASSES[c] if S[s] in ("DECODE", "MEMADR") else None
        if S[s] == "MEMADR" and cond not in ("LOAD", "STORE"):
            dc7.add(code)                                     # MEMADR is only reached by loads and stores
            for b in range(SBITS):
                ns[f"ns{b}"].discard(code)
            continue
        edge_of[code] = f"{S[s]}>{cond or ''}>{nxt}"
    out = {}
    dc4 = set(range(len(S), 1 << SBITS))
    for sig in riscv.CONTROLS:
        out[sig] = {i for i, s in enumerate(S) if sig in riscv.ASSERT.get(s, [])}
    return ns, dc7, out, dc4, edge_of


def lits(imp, names):
    return [(n, c == "0") for n, c in zip(names, imp) if c != "-"]


def imp_text(imp, names):
    t = [("¬" if c == "0" else "") + n for n, c in zip(names, imp) if c != "-"]
    return "·".join(t) if t else "1"


def build_ctrl():
    ns, dc7, ctl, dc4, edge_of = ctrl_tables()
    nb = Net("ctrl", SIG_S + SIG_C)
    inv = {}

    def lit_net(name, neg):
        if not neg:
            return name
        if name not in inv:
            inv[name] = nb.cell("inv", [name], ["inputs"])
        return inv[name]

    eqs, terms = {}, {}
    names7, names4 = SIG_S + SIG_C, SIG_S
    for out, (ones, dcs, names) in {**{k: (v, dc7, names7) for k, v in sorted(ns.items(), reverse=True)},
                                    **{k: (v, dc4, names4) for k, v in ctl.items()}}.items():
        cover = minimise(ones, dcs, len(names))
        if not cover:
            raise ValueError(f"{out} is constant 0")
        items = []
        eq = []
        for imp in cover:
            tag = f"term:{imp_text(imp, names)}"
            ls = [lit_net(n, neg) for n, neg in lits(imp, names)]
            items.append(_and(nb, ls, [tag]))
            terms.setdefault(tag, dict(text=imp_text(imp, names), imp=imp, names=names, outs=[]))["outs"].append(out)
            eq.append(imp_text(imp, names))
        y = _or(nb, items, [f"out:{out}"])
        if y in nb.inputs or y in nb.outputs:                 # a bare input or a shared output: buffer it
            y = nb.cell("inv", [nb.cell("inv", [y], [f"out:{out}"])], [f"out:{out}"])
        nb.rename(y, out)
        nb.outputs.append(out)
        eqs[out] = eq
    # which gates implement each FSM edge and state: the "viewing points"
    for g in nb.cells:
        g["edges"], g["states"] = [], []
    edges = {}
    for code, e in edge_of.items():
        edges.setdefault(e, []).append(code)
    term_gates = {}
    for g in nb.cells:
        for t in g["tags"]:
            term_gates.setdefault(t, []).append(g["id"])
    gate_by = {g["id"]: g for g in nb.cells}
    view = {}
    for e, codes in edges.items():
        ids = set()
        for out in ns:
            for t, info in terms.items():
                if out in info["outs"] and info["names"] == names7 and any(covers(info["imp"], c, 7) for c in codes):
                    ids |= set(term_gates.get(t, []))
                    ids |= set(term_gates.get(f"out:{out}", []))
        view[e] = sorted(ids, key=lambda i: int(i.split("u")[-1]))
    for i, s in enumerate(riscv.STATES):
        ids = set()
        for sig in riscv.ASSERT.get(s, []):
            for t, info in terms.items():
                if sig in info["outs"] and covers(info["imp"], i, 4):
                    ids |= set(term_gates.get(t, [])) | set(term_gates.get(f"out:{sig}", []))
        view[s] = sorted(ids, key=lambda i: int(i.split("u")[-1]))
    for e, ids in view.items():
        for gid in ids:
            gate_by[gid]["edges" if ">" in e else "states"].append(e)
    return nb.dict(), eqs, view


def check_ctrl(nl) -> int:
    """Count of (state, class) inputs where the gates disagree with next_state/ASSERT (should be 0)."""
    bad = 0
    for s, st in enumerate(riscv.STATES):
        for c, cl in enumerate(riscv.CLASSES):
            if st == "MEMADR" and cl not in ("LOAD", "STORE"):
                continue
            v = riscv.eval_netlist(nl, {**{f"s{b}": s >> b & 1 for b in range(4)}, **{f"c{b}": c >> b & 1 for b in range(3)}})
            t = riscv.STATES.index(riscv.next_state(st, cl))
            bad += any(v[f"ns{b}"] != (t >> b & 1) for b in range(4))
            bad += any(v[sig] != int(sig in riscv.ASSERT.get(st, [])) for sig in riscv.CONTROLS)
    return bad


# ---------------------------------------------------------------------------- the ALU slice
def build_alu(bits=4):
    """Inputs a0..a3, b0..b3, sub, f1, f0. f1=1: sum (a+b, or a−b when sub=1); f1=0: f0 ? or : and."""
    ins = [f"a{i}" for i in range(bits)] + [f"b{i}" for i in range(bits)] + ["sub", "f1", "f0"]
    nb = Net("alu", ins)
    f1n = nb.cell("inv", ["f1"], ["mux"])
    f0n = nb.cell("inv", ["f0"], ["mux"])
    cin = "sub"
    ys = []
    for i in range(bits):
        T = lambda *t: [f"bit{i}", *t]
        bx = nb.cell("xor2", [f"b{i}", "sub"], T("sub"))
        p = nb.cell("xor2", [f"a{i}", bx], T("add"))
        s = nb.cell("xor2", [p, cin], T("add"))
        g1 = nb.cell("nand2", [f"a{i}", bx], T("carry"))
        g2 = nb.cell("nand2", [p, cin], T("carry"))
        co = nb.cell("nand2", [g1, g2], T("carry"))
        na = nb.cell("nand2", [f"a{i}", f"b{i}"], T("and"))
        no = nb.cell("nor2", [f"a{i}", f"b{i}"], T("or"))
        m0 = nb.cell("aoi22", [no, "f0", na, f0n], T("mux"))   # f0 ? a|b : a&b
        yb = nb.cell("aoi22", [s, "f1", m0, f1n], T("mux"))    # ¬(f1 ? sum : m0)
        y = nb.cell("inv", [yb], T("mux"))
        ys.append(nb.rename(y, f"y{i}"))
        cin = co
    nb.rename(cin, "cout")
    z01 = nb.cell("nor2", ["y0", "y1"], ["zero"])
    z23 = nb.cell("nor2", ["y2", "y3"], ["zero"])
    zb = nb.cell("nand2", [z01, z23], ["zero"])
    z = nb.cell("inv", [zb], ["zero"])
    nb.rename(z, "zero")
    nb.outputs = ys + ["cout", "zero"]
    return nb.dict()


def alu_ref(a, b, sub, f1, f0, bits=4):
    m = (1 << bits) - 1
    if f1:
        t = a + ((~b & m) if sub else b) + sub
        y, co = t & m, t >> bits & 1
    else:
        y, co = (a | b) if f0 else (a & b), None
    return y, co, int(y == 0)


def check_alu(nl, bits=4) -> int:
    bad = 0
    for a in range(16):
        for b in range(16):
            for sub in (0, 1):
                for f1 in (0, 1):
                    for f0 in (0, 1):
                        v = riscv.eval_netlist(nl, {**{f"a{i}": a >> i & 1 for i in range(bits)}, **{f"b{i}": b >> i & 1 for i in range(bits)},
                                                    "sub": sub, "f1": f1, "f0": f0})
                        y, co, z = alu_ref(a, b, sub, f1, f0)
                        got = sum(v[f"y{i}"] << i for i in range(bits))
                        bad += (got != y) + (v["zero"] != z) + (co is not None and v["cout"] != co)
    return bad


# ---------------------------------------------------------------------------- placement
def place(nl, tech, row_width=None):
    """Standard-cell rows: cells in netlist order, left to right, rows of ≈ √(area) width,
    every other row flipped so neighbouring rows share a supply rail (the usual row style)."""
    cells = [(g, GC["gates"][g["cell"]]["cells"][tech]) for g in nl["cells"]]
    hmax = max(c["h"] for _, c in cells)
    total_w = sum(c["w"] for _, c in cells)
    if row_width is None:
        rows = max(1, round((total_w / hmax) ** 0.5 / 1.6))
        row_width = total_w / rows
    out, x, row = [], 0.0, 0
    for g, c in cells:
        if x > 0 and x + c["w"] > row_width * 1.02:
            x, row = 0.0, row + 1
        out.append(dict(id=g["id"], cell=g["cell"], x=round(x, 2), row=row, w=c["w"], h=c["h"], flip=row % 2 == 1))
        x += c["w"]
    nrows = row + 1
    width = max(p["x"] + p["w"] for p in out)
    area = width * hmax * nrows
    cell_area = sum(c["w"] * c["h"] for _, c in cells)
    return dict(rows=nrows, row_h=hmax, width=round(width, 2), height=round(hmax * nrows, 2), area=round(area, 2),
                cell_area=round(cell_area, 2), units=cells[0][1]["units"], place=out)


# ---------------------------------------------------------------------------- RTL text
def rtl_alu():
    L = [
        ("// 4-bit slice of the ALU (the full core runs this 8 times for 32 bits)", []),
        ("module alu4 (", []),
        ("  input  [3:0] a, b,", ["in"]),
        ("  input        sub,      // 1: a - b", ["sub"]),
        ("  input        f1, f0,   // 1x: sum, 01: or, 00: and", ["mux"]),
        ("  output reg [3:0] y,", ["mux"]),
        ("  output       cout, zero", ["carry", "zero"]),
        (");", []),
        ("  wire [3:0] bx  = b ^ {4{sub}};          // invert b to subtract", ["sub"]),
        ("  wire [4:0] sum = a + bx + sub;          // two's complement: a + ~b + 1", ["add", "carry"]),
        ("  assign cout = sum[4];", ["carry"]),
        ("  always @* begin", ["mux"]),
        ("    if (f1)      y = sum[3:0];", ["mux", "add"]),
        ("    else if (f0) y = a | b;", ["mux", "or"]),
        ("    else         y = a & b;", ["mux", "and"]),
        ("  end", ["mux"]),
        ("  assign zero = (y == 4'b0000);", ["zero"]),
        ("endmodule", []),
    ]
    return [dict(t=t, tags=g) for t, g in L]


def rtl_ctrl():
    S = riscv.STATES
    L = [("// Controller: a 12-state Moore machine (state in a 4-bit register)", []),
         ("module control (", []),
         ("  input            clk, reset,", []),
         ("  input      [2:0] opclass,   // R I LOAD STORE BRANCH JAL LUI = 0..6", ["in"]),
         ("  output reg       " + ", ".join(riscv.CONTROLS) + ",", ["outs"]),
         ("  output reg [3:0] state", []),
         (");", []),
         ("  localparam " + ", ".join(f"{s}={i}" for i, s in enumerate(S[:6])) + ",", []),
         ("             " + ", ".join(f"{s}={i}" for i, s in enumerate(S) if i >= 6) + ";", []),
         ("  reg [3:0] next;", []),
         ("  always @(posedge clk) state <= reset ? FETCH : next;   // the state register", ["reg"]),
         ("  always @* begin                                       // next-state logic", []),
         ("    case (state)", [])]
    for s in S:
        outs = [t for t in riscv.transitions() if t[0] == s]
        if len(outs) == 1:
            L.append((f"      {s + ':':8s} next = {outs[0][2]};", [f"edge:{s}>{outs[0][1] or ''}>{outs[0][2]}", f"state:{s}"]))
        else:
            L.append((f"      {s}: case (opclass)", [f"state:{s}"]))
            for t in outs:
                L.append((f"        {t[1]:7s}: next = {t[2]};", [f"edge:{s}>{t[1]}>{t[2]}"]))
            L.append(("      endcase", [f"state:{s}"]))
    L += [("    endcase", []), ("  end", []),
          ("  always @* begin                                       // Moore outputs: from the state alone", ["outs"]),
          ("    {" + ", ".join(riscv.CONTROLS) + "} = 0;", ["outs"]),
          ("    case (state)", ["outs"])]
    for s in S:
        a = riscv.ASSERT.get(s, [])
        if a:
            L.append((f"      {s + ':':8s} " + " ".join(f"{x} = 1;" for x in a), [f"state:{s}"] + [f"out:{x}" for x in a]))
    L += [("    endcase", ["outs"]), ("  end", ["outs"]), ("endmodule", [])]
    return [dict(t=t, tags=g) for t, g in L]


def rtl_core():
    L = [
        ("// The core: datapath + controller (multi-cycle, one shared memory port)", []),
        ("module core (input clk, reset, output [31:0] mem_addr, mem_wdata,", ["dp:pc", "dp:mem"]),
        ("             input [31:0] mem_rdata, output mem_we);", ["dp:mem"]),
        ("  reg  [31:0] pc, ir, mdr, A, B, aluout;      // the multi-cycle registers", ["dp:pc", "dp:ir", "dp:mdr", "dp:aluout"]),
        ("  reg  [31:0] x [0:31];                       // register file, x[0] reads 0", ["dp:rf"]),
        ("  wire [2:0]  opclass;                        // from ir[6:0]", ["dp:ir", "dp:ctrl"]),
        ("  wire [31:0] imm;                            // I, S, B, J or U format", ["dp:imm"]),
        ("  control u_ctrl (.clk(clk), .reset(reset), .opclass(opclass), ...);", ["dp:ctrl", "mod:ctrl"]),
        ("  alu32   u_alu  (.a(srcA), .b(srcB), .op(aluop), .y(aluy), .zero(zero));", ["dp:alu", "mod:alu"]),
        ("  always @(posedge clk) begin", []),
        ("    if (IRWrite)  ir <= mem_rdata;", ["dp:ir", "ctl:IRWrite"]),
        ("    if (PCWrite || (Branch && taken)) pc <= pcnext;", ["dp:pc", "ctl:PCWrite", "ctl:Branch"]),
        ("    if (RegWrite && rd != 0) x[rd] <= wbdata;", ["dp:rf", "ctl:RegWrite"]),
        ("    mdr <= mem_rdata;  A <= x[rs1];  B <= x[rs2];  aluout <= aluy;", ["dp:mdr", "dp:rf", "dp:aluout"]),
        ("  end", []),
        ("  assign mem_addr = (state == FETCH) ? pc : aluout;", ["dp:mem", "dp:pc", "dp:aluout"]),
        ("  assign mem_we   = MemWrite;", ["dp:mem", "ctl:MemWrite"]),
        ("endmodule", []),
    ]
    return [dict(t=t, tags=g) for t, g in L]


def rtl_soc():
    L = [
        ("// The SoC: core + RAM + GPIO on one bus", []),
        ("module soc (input clk, reset, output [7:0] leds);", ["soc:gpio"]),
        ("  wire [31:0] addr, wdata, rdata;  wire we;", ["soc:bus"]),
        ("  core u_core (.clk(clk), .reset(reset), .mem_addr(addr), .mem_wdata(wdata),", ["soc:core"]),
        ("               .mem_rdata(rdata), .mem_we(we));", ["soc:core"]),
        ("  wire sel_gpio = (addr == 32'h1000_0000);   // the address decoder", ["soc:bus"]),
        ("  ram  #(.WORDS(1024)) u_ram (.clk(clk), .we(we & ~sel_gpio), .addr(addr[11:2]),", ["soc:ram"]),
        ("               .wdata(wdata), .rdata(ram_q));   // 6T SRAM bitcells", ["soc:ram"]),
        ("  reg [7:0] gpio;", ["soc:gpio"]),
        ("  always @(posedge clk) if (we & sel_gpio) gpio <= wdata[7:0];", ["soc:gpio"]),
        ("  assign rdata = sel_gpio ? {24'b0, gpio} : ram_q;", ["soc:bus"]),
        ("  assign leds  = gpio;", ["soc:gpio"]),
        ("endmodule", []),
    ]
    return [dict(t=t, tags=g) for t, g in L]


def stats(nl):
    cnt = {}
    for g in nl["cells"]:
        cnt[g["cell"]] = cnt.get(g["cell"], 0) + 1
    return dict(cells=len(nl["cells"]), by_cell=dict(sorted(cnt.items())), transistors=sum(EFFORT[g["cell"]]["n"] for g in nl["cells"]))


def generic_count(eqs, names7=7):
    """Gates before mapping: one AND per product term (k>1 literals), one OR per output with >1 term, NOTs for inputs."""
    terms = {t for eq in eqs.values() for t in eq}
    ands = sum(1 for t in terms if "·" in t)
    ors = sum(1 for eq in eqs.values() if len(eq) > 1)
    return dict(and_=ands, or_=ors, terms=len(terms))


def build() -> dict:
    alu = build_alu()
    ctrl, eqs, view = build_ctrl()
    techs = [t for t in ("planar_180", "finfet_5", "gaa_2")]
    mods = {}
    for key, nl, rtl in (("alu", alu, rtl_alu()), ("ctrl", ctrl, rtl_ctrl())):
        t = riscv.sta(nl, EFFORT)
        mods[key] = dict(netlist=nl, rtl=rtl, stats=stats(nl), sta=dict(path=t["path"], end=t["end"], tau=round(t["tau"], 4)),
                         layout={tech: place(nl, tech) for tech in techs})
    mods["alu"]["equations"] = {
        "bxᵢ": ["bᵢ ⊕ sub"], "pᵢ": ["aᵢ ⊕ bxᵢ"], "sᵢ": ["pᵢ ⊕ cᵢ"], "cᵢ₊₁": ["aᵢ·bxᵢ", "pᵢ·cᵢ"],
        "yᵢ": ["f1·sᵢ", "¬f1·f0·(aᵢ + bᵢ)", "¬f1·¬f0·aᵢ·bᵢ"], "zero": ["¬y0·¬y1·¬y2·¬y3"]}
    # which parts of the ALU each controller state uses (the state diagram links to the ALU through these)
    mods["alu"]["use"] = {"DECODE": ["add", "carry"], "EXEC_R": ["add", "carry", "sub", "and", "or", "mux"],
                          "EXEC_I": ["add", "carry", "and", "or", "mux"], "MEMADR": ["add", "carry"],
                          "BRANCH": ["sub", "add", "carry", "zero"], "JAL": ["add", "carry"]}
    mods["ctrl"]["equations"] = eqs
    mods["ctrl"]["view"] = view
    return dict(
        _about="Generated by sim/transistor_sim/soc.py — do not edit by hand.",
        states=riscv.STATES, classes=riscv.CLASSES, controls=riscv.CONTROLS, asserts=riscv.ASSERT, busy=riscv.BUSY,
        transitions=[list(t) for t in riscv.transitions()],
        effort=EFFORT, techs={k: GC["techs"][k]["name"] for k in techs},
        modules=mods, core_rtl=rtl_core(), soc_rtl=rtl_soc(),
        demo=riscv.DEMO, x86_demo=riscv.X86_DEMO,
    )


def main():
    d = build()
    assert check_alu(d["modules"]["alu"]["netlist"]) == 0
    assert check_ctrl(d["modules"]["ctrl"]["netlist"]) == 0
    p = ROOT / "data" / "soc.json"
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for k, m in d["modules"].items():
        print(k, m["stats"], "critical path", m["sta"]["tau"], "τ")
    print(p.relative_to(ROOT))


if __name__ == "__main__":
    main()


def gate_reference(d: dict | None = None) -> dict:
    """Timing and sampled outputs of both netlists for data/physics_reference.json (JS parity)."""
    d = d or json.loads((ROOT / "data" / "soc.json").read_text(encoding="utf-8"))
    out = {}
    for key, m in d["modules"].items():
        nl = m["netlist"]
        t = riscv.sta(nl, d["effort"])
        seed, vecs = 12345, []
        for k in range(24):
            vec = {}
            for n in nl["inputs"]:
                seed = (seed * 1103515245 + 12345) % 2 ** 31
                vec[n] = seed >> 16 & 1
            v = riscv.eval_netlist(nl, vec)
            vecs.append([[vec[n] for n in nl["inputs"]], [v[n] for n in nl["outputs"]]])
        out[key] = dict(tau=t["tau"], path=t["path"], end=t["end"], vectors=vecs)
    return out
