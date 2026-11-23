"""A teaching RISC-V core and its x86 front end (v1.32, SoC Explorer).

Four small models that the SoC Explorer page (site/soc.html) draws side by side:

  * assemble / decode / execute: a subset of RV32I (17 of its 40 instructions, riscv_isa) with
    the real 32-bit encodings: add sub and or xor slt, addi andi ori xori slti, lw sw, beq bne,
    jal and lui. x0 always reads 0.
  * multicycle: the same program run on a multi-cycle core controlled by a 12-state finite-state
    machine (Patterson & Hennessy's textbook design, adapted to RISC-V, patterson2020). Each
    cycle reports the state, the control signals and the datapath blocks that are busy.
  * pipeline: the classic five-stage pipeline (IF ID EX MEM WB) with full forwarding, a one-cycle
    stall after a load whose result is used next, and branches resolved in EX with the two
    younger instructions flushed when taken (predict not taken).
  * x86: decode a small subset of 32-bit x86 machine code (variable length, 1 to 15 bytes,
    intel_sdm), split each instruction into micro-operations (µops) the way an out-of-order x86
    core does (fog_microarch), and translate the block into RV32I. x86 sets flags as a side
    effect; RISC-V has none (riscv_isa), so the translator keeps the last flag-setting result
    ("lazy flags") and turns cmp/dec + jne into one bne, the same pairing x86 cores fuse into one
    µop (wikichip_mopfusion).

Plus the gate-level helpers used for the synthesised blocks (soc.py writes data/soc.json):
eval_netlist() evaluates a mapped netlist and sta() runs static timing with logical-effort
delays (sutherland1999): every cell is unit size, so a cell's delay is d = p + C_load, where
C_load is the sum of the logical efforts g of the pins it drives (in units of the unit
inverter's input capacitance) and 4 for a primary output. FO4 = 5 τ.

The JavaScript twin is site/js/physics/riscv.js (checked by tests/js_parity.mjs).
"""
from __future__ import annotations

import re

MASK = 0xFFFFFFFF

R_OPS = {"add": (0, 0), "sub": (0, 0x20), "slt": (2, 0), "xor": (4, 0), "or": (6, 0), "and": (7, 0)}
I_OPS = {"addi": 0, "slti": 2, "xori": 4, "ori": 6, "andi": 7}
B_OPS = {"beq": 0, "bne": 1}
CLASSES = ["R", "I", "LOAD", "STORE", "BRANCH", "JAL", "LUI"]          # 3-bit class code = index
OPCODE = {"R": 0b0110011, "I": 0b0010011, "LOAD": 0b0000011, "STORE": 0b0100011,
          "BRANCH": 0b1100011, "JAL": 0b1101111, "LUI": 0b0110111}
ABI = {"zero": 0, "ra": 1, "sp": 2, "gp": 3, "tp": 4, "t0": 5, "t1": 6, "t2": 7, "s0": 8, "fp": 8, "s1": 9,
       **{f"a{i}": 10 + i for i in range(8)}, **{f"s{i}": 16 + i for i in range(2, 12)}, **{f"t{i}": 25 + i for i in range(3, 7)}}

DEMO = """# Sum 5 + 4 + 3 + 2 + 1, keep it in RAM, double it and show it on the GPIO LEDs
    addi x1, x0, 5        # n = 5
    addi x2, x0, 0        # sum = 0
loop:
    add  x2, x2, x1       # sum = sum + n
    addi x1, x1, -1       # n = n - 1
    bne  x1, x0, loop     # until n is 0
    sw   x2, 256(x0)      # RAM[0x100] = sum
    lw   x3, 256(x0)      # read it back
    add  x5, x3, x3       # uses the load at once: a stall in the pipeline
    lui  x4, 0x10000      # x4 = 0x1000_0000, the GPIO address
    sw   x5, 0(x4)        # light the LEDs
    jal  x0, 0            # stop: jump to itself
"""
GPIO = 0x10000000


def sx(v: int, bits: int) -> int:
    """Sign-extend the low `bits` bits of v."""
    v &= (1 << bits) - 1
    return v - (1 << bits) if v >> (bits - 1) else v


def s32(v: int) -> int:
    return sx(v, 32)


def reg(tok: str) -> int:
    t = tok.strip().lower()
    if re.fullmatch(r"x([0-9]|[12][0-9]|3[01])", t):
        return int(t[1:])
    if t in ABI:
        return ABI[t]
    raise ValueError(f"unknown register ‘{tok.strip()}’")


def _num(tok: str) -> int:
    t = tok.strip().lower()
    try:
        return int(t, 0)
    except ValueError:
        raise ValueError(f"not a number: ‘{tok.strip()}’") from None


def encode(op: str, a: list[str], pc: int, labels: dict) -> int:
    """One instruction's 32-bit word (riscv_isa formats R, I, S, B, J and U)."""
    def imm_or_label(tok):
        t = tok.strip()
        return labels[t] - pc if t in labels else _num(t)

    def need(n):
        if len(a) != n:
            raise ValueError(f"{op} takes {n} operands")

    if op in R_OPS:
        need(3)
        f3, f7 = R_OPS[op]
        return (f7 << 25) | (reg(a[2]) << 20) | (reg(a[1]) << 15) | (f3 << 12) | (reg(a[0]) << 7) | OPCODE["R"]
    if op in I_OPS:
        need(3)
        imm = _num(a[2])
        if not -2048 <= imm <= 2047:
            raise ValueError(f"{op}: immediate {imm} does not fit in 12 bits")
        return ((imm & 0xFFF) << 20) | (reg(a[1]) << 15) | (I_OPS[op] << 12) | (reg(a[0]) << 7) | OPCODE["I"]
    if op in ("lw", "sw"):
        need(2)
        m = re.fullmatch(r"\s*(-?\w+)\s*\(\s*(\w+)\s*\)\s*", a[1])
        if not m:
            raise ValueError(f"{op}: write the address as offset(register)")
        imm, base = _num(m.group(1)), reg(m.group(2))
        if not -2048 <= imm <= 2047:
            raise ValueError(f"{op}: offset {imm} does not fit in 12 bits")
        if op == "lw":
            return ((imm & 0xFFF) << 20) | (base << 15) | (2 << 12) | (reg(a[0]) << 7) | OPCODE["LOAD"]
        i = imm & 0xFFF
        return ((i >> 5) << 25) | (reg(a[0]) << 20) | (base << 15) | (2 << 12) | ((i & 31) << 7) | OPCODE["STORE"]
    if op in B_OPS:
        need(3)
        off = imm_or_label(a[2])
        if off % 2 or not -4096 <= off <= 4094:
            raise ValueError(f"{op}: branch offset {off} is out of range")
        i = off & 0x1FFF
        return (((i >> 12) & 1) << 31) | (((i >> 5) & 63) << 25) | (reg(a[1]) << 20) | (reg(a[0]) << 15) | \
               (B_OPS[op] << 12) | (((i >> 1) & 15) << 8) | (((i >> 11) & 1) << 7) | OPCODE["BRANCH"]
    if op == "jal":
        need(2)
        off = imm_or_label(a[1])
        if off % 2 or not -(1 << 20) <= off < (1 << 20):
            raise ValueError(f"jal: offset {off} is out of range")
        i = off & 0x1FFFFF
        return (((i >> 20) & 1) << 31) | (((i >> 1) & 0x3FF) << 21) | (((i >> 11) & 1) << 20) | \
               (((i >> 12) & 0xFF) << 12) | (reg(a[0]) << 7) | OPCODE["JAL"]
    if op == "lui":
        need(2)
        imm = _num(a[1])
        if not 0 <= imm <= 0xFFFFF:
            raise ValueError("lui: the immediate is the upper 20 bits, 0 to 0xFFFFF")
        return (imm << 12) | (reg(a[0]) << 7) | OPCODE["LUI"]
    raise ValueError(f"‘{op}’ is not in this core’s 17 instructions")


def assemble(src: str) -> dict:
    """Two passes: labels, then words. Returns {words, lines (source line per word), labels}."""
    rows, labels, pc = [], {}, 0
    for n, line in enumerate(src.splitlines(), 1):
        code = line.split("#", 1)[0].strip()
        while ":" in code:
            lab, code = code.split(":", 1)
            lab = lab.strip()
            if not re.fullmatch(r"[A-Za-z_]\w*", lab):
                raise ValueError(f"line {n}: bad label ‘{lab}’")
            labels[lab] = pc
            code = code.strip()
        if code:
            rows.append((n, pc, code))
            pc += 4
    words, lines = [], []
    for n, pc, code in rows:
        parts = code.split(None, 1)
        op = parts[0].lower()
        args = [x for x in (parts[1].split(",") if len(parts) > 1 else []) if x.strip()]
        try:
            words.append(encode(op, args, pc, labels))
        except (ValueError, KeyError) as e:
            raise ValueError(f"line {n}: {e}") from None
        lines.append(n)
    return dict(words=words, lines=lines, labels=labels)


def decode(w: int) -> dict:
    """Fields of one word, its class and its assembly text."""
    opc, rd, f3, rs1, rs2, f7 = w & 127, (w >> 7) & 31, (w >> 12) & 7, (w >> 15) & 31, (w >> 20) & 31, w >> 25
    cls = next((c for c, o in OPCODE.items() if o == opc), None)
    d = dict(word=w, cls=cls, rd=rd, rs1=rs1, rs2=rs2, f3=f3, imm=0, op=None)
    if cls == "R":
        d["op"] = next((k for k, v in R_OPS.items() if v == (f3, f7)), None)
    elif cls == "I":
        d["op"] = next((k for k, v in I_OPS.items() if v == f3), None)
        d["imm"] = sx(w >> 20, 12)
    elif cls == "LOAD":
        d["op"] = "lw" if f3 == 2 else None
        d["imm"] = sx(w >> 20, 12)
    elif cls == "STORE":
        d["op"] = "sw" if f3 == 2 else None
        d["imm"] = sx(((w >> 25) << 5) | ((w >> 7) & 31), 12)
    elif cls == "BRANCH":
        d["op"] = next((k for k, v in B_OPS.items() if v == f3), None)
        d["imm"] = sx((((w >> 31) & 1) << 12) | (((w >> 7) & 1) << 11) | (((w >> 25) & 63) << 5) | (((w >> 8) & 15) << 1), 13)
    elif cls == "JAL":
        d["op"] = "jal"
        d["imm"] = sx((((w >> 31) & 1) << 20) | (((w >> 12) & 0xFF) << 12) | (((w >> 20) & 1) << 11) | (((w >> 21) & 0x3FF) << 1), 21)
    elif cls == "LUI":
        d["op"] = "lui"
        d["imm"] = w >> 12
    if d["op"] is None:
        raise ValueError(f"0x{w:08x} is not one of this core’s instructions")
    d["code"] = CLASSES.index(cls)
    d["text"] = text(d)
    return d


def text(d: dict) -> str:
    op, c = d["op"], d["cls"]
    if c == "R":
        return f"{op} x{d['rd']}, x{d['rs1']}, x{d['rs2']}"
    if c == "I":
        return f"{op} x{d['rd']}, x{d['rs1']}, {d['imm']}"
    if c == "LOAD":
        return f"lw x{d['rd']}, {d['imm']}(x{d['rs1']})"
    if c == "STORE":
        return f"sw x{d['rs2']}, {d['imm']}(x{d['rs1']})"
    if c == "BRANCH":
        return f"{op} x{d['rs1']}, x{d['rs2']}, {d['imm']:+d}"
    if c == "JAL":
        return f"jal x{d['rd']}, {d['imm']:+d}"
    return f"lui x{d['rd']}, 0x{d['imm']:x}"


def alu(op: str, a: int, b: int) -> int:
    a, b = a & MASK, b & MASK
    if op in ("add", "addi", "lw", "sw"):
        return (a + b) & MASK
    if op == "sub":
        return (a - b) & MASK
    if op in ("and", "andi"):
        return a & b
    if op in ("or", "ori"):
        return a | b
    if op in ("xor", "xori"):
        return a ^ b
    if op in ("slt", "slti"):
        return int(s32(a) < s32(b))
    raise ValueError(op)


class Machine:
    """Architectural state: 32 registers, PC, a word-addressed RAM and the GPIO latch."""

    def __init__(self, words):
        self.x = [0] * 32
        self.pc = 0
        self.mem = {4 * i: w for i, w in enumerate(words)}
        self.gpio = 0
        self.n = len(words)

    def load(self, addr):
        if addr % 4:
            raise ValueError(f"misaligned load at 0x{addr:x}")
        return self.gpio if addr == GPIO else self.mem.get(addr & MASK, 0)

    def store(self, addr, v):
        if addr % 4:
            raise ValueError(f"misaligned store at 0x{addr:x}")
        if addr == GPIO:
            self.gpio = v & 0xFF
        else:
            self.mem[addr & MASK] = v & MASK

    def setx(self, r, v):
        if r:
            self.x[r] = v & MASK


def execute(m: Machine, d: dict) -> dict:
    """One instruction's architectural effect. Returns {next_pc, wb:(rd,val)|None, mem:(addr,val)|None, taken}."""
    c, op, pc = d["cls"], d["op"], m.pc
    a, b = m.x[d["rs1"]], m.x[d["rs2"]]
    out = dict(next_pc=(pc + 4) & MASK, wb=None, mem=None, taken=False, addr=None)
    if c == "R":
        out["wb"] = (d["rd"], alu(op, a, b))
    elif c == "I":
        out["wb"] = (d["rd"], alu(op, a, d["imm"]))
    elif c == "LOAD":
        addr = (a + d["imm"]) & MASK
        out["addr"] = addr
        out["wb"] = (d["rd"], m.load(addr))
    elif c == "STORE":
        addr = (a + d["imm"]) & MASK
        out["addr"] = addr
        out["mem"] = (addr, b)
    elif c == "BRANCH":
        out["taken"] = (a == b) if op == "beq" else (a != b)
        if out["taken"]:
            out["next_pc"] = (pc + d["imm"]) & MASK
    elif c == "JAL":
        out["wb"] = (d["rd"], pc + 4)
        out["next_pc"] = (pc + d["imm"]) & MASK
        out["taken"] = True
    elif c == "LUI":
        out["wb"] = (d["rd"], d["imm"] << 12)
    return out


def commit(m: Machine, r: dict):
    if r["wb"]:
        m.setx(*r["wb"])
    if r["mem"]:
        m.store(*r["mem"])
    m.pc = r["next_pc"]


def halted(d: dict) -> bool:
    return d["cls"] == "JAL" and d["imm"] == 0


# ---------------------------------------------------------------------------- multi-cycle core
STATES = ["FETCH", "DECODE", "EXEC_R", "EXEC_I", "MEMADR", "BRANCH", "JAL", "LUI", "ALUWB", "MEMRD", "MEMWR", "MEMWB"]
FIRST = {"R": "EXEC_R", "I": "EXEC_I", "LOAD": "MEMADR", "STORE": "MEMADR", "BRANCH": "BRANCH", "JAL": "JAL", "LUI": "LUI"}
CONTROLS = ["MemRead", "IRWrite", "PCWrite", "Branch", "MemWrite", "RegWrite"]
ASSERT = {"FETCH": ["MemRead", "IRWrite", "PCWrite"], "BRANCH": ["Branch"], "JAL": ["PCWrite", "RegWrite"],
          "LUI": ["RegWrite"], "ALUWB": ["RegWrite"], "MEMRD": ["MemRead"], "MEMWR": ["MemWrite"], "MEMWB": ["RegWrite"]}
# datapath blocks each state keeps busy (the page lights these)
BUSY = {"FETCH": ["pc", "mem", "ir", "pcadd"], "DECODE": ["ir", "ctrl", "rf", "imm", "alu"], "EXEC_R": ["rf", "alu"],
        "EXEC_I": ["rf", "imm", "alu"], "MEMADR": ["rf", "imm", "alu"], "BRANCH": ["rf", "alu", "pc"],
        "JAL": ["pc", "alu", "rf"], "LUI": ["imm", "rf"], "ALUWB": ["aluout", "rf"], "MEMRD": ["aluout", "mem", "mdr"],
        "MEMWR": ["aluout", "mem"], "MEMWB": ["mdr", "rf"]}


def next_state(state: str, cls: str | None) -> str:
    """The controller's transition function: the table soc.py synthesises into gates."""
    s = state
    if s == "FETCH":
        return "DECODE"
    if s == "DECODE":
        return FIRST[cls]
    if s in ("EXEC_R", "EXEC_I"):
        return "ALUWB"
    if s == "MEMADR":
        return "MEMRD" if cls == "LOAD" else "MEMWR"
    if s == "MEMRD":
        return "MEMWB"
    return "FETCH"


def transitions() -> list:
    """Every (from, condition, to) edge of the controller, the arrows of the state diagram."""
    out = [("FETCH", None, "DECODE")]
    out += [("DECODE", c, FIRST[c]) for c in CLASSES]
    out += [("EXEC_R", None, "ALUWB"), ("EXEC_I", None, "ALUWB"), ("MEMADR", "LOAD", "MEMRD"), ("MEMADR", "STORE", "MEMWR"),
            ("MEMRD", None, "MEMWB")]
    out += [(s, None, "FETCH") for s in ("BRANCH", "JAL", "LUI", "ALUWB", "MEMWR", "MEMWB")]
    return out


def multicycle(words, max_cycles=2000) -> dict:
    """Run on the FSM-controlled core. Architectural effects happen in the state that would latch
    them in hardware (register write in the write-back states, memory in MEMWR, PC at the end)."""
    m = Machine(words)
    state, d, res, trace = "FETCH", None, None, []
    retired, cyc = 0, 0
    while cyc < max_cycles:
        if state == "FETCH":
            if m.pc // 4 >= m.n or m.pc % 4:
                raise ValueError(f"PC 0x{m.pc:x} left the program")
            d = decode(m.load(m.pc))
            res = execute(m, d)
        trace.append(dict(cycle=cyc, state=state, pc=m.pc, idx=m.pc // 4, ctrl=ASSERT.get(state, []), busy=BUSY[state]))
        cyc += 1
        nxt = next_state(state, d["cls"])
        if nxt == "FETCH":
            commit(m, res)
            retired += 1
            if halted(d):
                break
        state = nxt
    return dict(cycles=cyc, retired=retired, x=list(m.x), gpio=m.gpio, mem={k: v for k, v in m.mem.items() if k >= 4 * m.n},
                trace=trace, cpi=cyc / retired)


def sequential(words, max_steps=5000) -> dict:
    """Plain instruction-by-instruction run: the reference the two cores must agree with."""
    m = Machine(words)
    seq = []
    for _ in range(max_steps):
        d = decode(m.load(m.pc))
        r = execute(m, d)
        seq.append(dict(pc=m.pc, idx=m.pc // 4, text=d["text"], cls=d["cls"], taken=r["taken"]))
        commit(m, r)
        if halted(d):
            break
    return dict(x=list(m.x), gpio=m.gpio, mem={k: v for k, v in m.mem.items() if k >= 4 * m.n}, seq=seq)


# ---------------------------------------------------------------------------- 5-stage pipeline
def pipeline(words, max_steps=5000) -> dict:
    """Stage timing of the dynamic instruction stream. Rows: {idx, text, if, id, ex, mem, wb, stall, flushed}.
    Forwarding from EX/MEM and MEM/WB to EX; a load followed by a user stalls one cycle; a taken
    branch or a jal (resolved in EX) flushes the two instructions fetched after it."""
    run = sequential(words, max_steps)["seq"]
    rows, t_if, prev = [], 0, []
    for k, s in enumerate(run):
        d = decode(words[s["idx"]])
        row = dict(idx=s["idx"], text=s["text"], stall=0, flushed=[])
        row["if"] = t_if
        id_ = t_if + 1
        # load-use: the previous instruction is a load into a register this one reads in EX
        if prev:
            p = prev[-1]
            uses = {d["rs1"]} | ({d["rs2"]} if d["cls"] in ("R", "STORE", "BRANCH") else set())
            if d["cls"] in ("LUI", "JAL"):
                uses = set()
            if p["cls"] == "LOAD" and p["rd"] and p["rd"] in uses and not (d["cls"] == "STORE" and d["rs1"] != p["rd"]):
                row["stall"] = 1
        row["id"] = id_
        row["ex"] = id_ + 1 + row["stall"]
        row["mem"], row["wb"] = row["ex"] + 1, row["ex"] + 2
        rows.append(row)
        prev.append(dict(cls=d["cls"], rd=d["rd"]))
        # next fetch
        t_if = t_if + 1 + row["stall"]
        if s["taken"]:
            row["flushed"] = [t_if, t_if + 1]          # the two wrong-path fetches, squashed when EX redirects
            t_if = row["ex"] + 1
    total = rows[-1]["wb"] + 1
    return dict(rows=rows, cycles=total, retired=len(rows), cpi=total / len(rows),
                stalls=sum(r["stall"] for r in rows), flushes=sum(len(r["flushed"]) for r in rows))


# ---------------------------------------------------------------------------- gates and timing
CELL_FN = {
    "inv": lambda p: 1 - p["A"],
    "nand2": lambda p: 1 - (p["A"] & p["B"]),
    "nand3": lambda p: 1 - (p["A"] & p["B"] & p["C"]),
    "nor2": lambda p: 1 - (p["A"] | p["B"]),
    "nor3": lambda p: 1 - (p["A"] | p["B"] | p["C"]),
    "aoi21": lambda p: 1 - ((p["A"] & p["B"]) | p["C"]),
    "oai21": lambda p: 1 - ((p["A"] | p["B"]) & p["C"]),
    "aoi22": lambda p: 1 - ((p["A"] & p["B"]) | (p["C"] & p["D"])),
    "xor2": lambda p: p["A"] ^ p["B"],
}


def eval_netlist(nl: dict, inputs: dict) -> dict:
    """Every net's value for one input vector. Instances are stored in topological order."""
    v = dict(inputs)
    for g in nl["cells"]:
        v[g["out"]] = CELL_FN[g["cell"]]({p: v[n] for p, n in g["ins"].items()})
    return v


def sta(nl: dict, effort: dict, po_load: float = 4.0) -> dict:
    """Arrival time of every net in τ, the critical path and its delay (logical effort, unit cells)."""
    load = {}
    for g in nl["cells"]:
        for pin, n in g["ins"].items():
            load[n] = load.get(n, 0.0) + effort[g["cell"]]["g"][pin]
    for n in nl["outputs"]:
        load[n] = load.get(n, 0.0) + po_load
    at = {n: 0.0 for n in nl["inputs"]}
    via, delay = {}, {}
    for g in nl["cells"]:
        src = max(g["ins"].values(), key=lambda n: (at[n], n))
        d = effort[g["cell"]]["p"] + load.get(g["out"], 0.0)
        delay[g["id"]] = d
        at[g["out"]] = at[src] + d
        via[g["out"]] = (g["id"], src)
    end = max(nl["outputs"], key=lambda n: (at[n], n))
    path, n = [], end
    while n in via:
        gid, n = via[n]
        path.append(gid)
    path.reverse()
    return dict(at=at, delay=delay, path=path, end=end, tau=at[end], fo4=at[end] / 5.0)


# ---------------------------------------------------------------------------- x86 front end
X86_REGS = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"]
# where each x86 register lives in the RISC-V register file (a fixed mapping, like a binary translator's)
X86_MAP = {"eax": 10, "ecx": 11, "edx": 12, "ebx": 13, "esp": 2, "ebp": 8, "esi": 14, "edi": 15}
TMP = 5                                    # t0: scratch for loaded operands
ALU_OPS = {0x01: ("add", "rm,r"), 0x03: ("add", "r,rm"), 0x29: ("sub", "rm,r"), 0x2B: ("sub", "r,rm"),
           0x39: ("cmp", "rm,r"), 0x3B: ("cmp", "r,rm"), 0x89: ("mov", "rm,r"), 0x8B: ("mov", "r,rm"),
           0x21: ("and", "rm,r"), 0x09: ("or", "rm,r"), 0x31: ("xor", "rm,r")}

X86_DEMO = "B9 05 00 00 00 B8 00 00 00 00 01 C8 49 75 FB BB F8 00 00 00 89 43 08 EB FE"


def x86_bytes(src: str) -> list[int]:
    toks = re.findall(r"[0-9A-Fa-f]{2}", src)
    return [int(t, 16) for t in toks]


def x86_decode(b: list[int]) -> list[dict]:
    """Length-decode and decode a block of 32-bit x86 code (no prefixes, no SIB, disp8 only).
    Each instruction: {at, len, bytes, op, dst, src, text}. Operands are ('r', name), ('m', base, disp) or ('i', value)."""
    out, i = [], 0
    while i < len(b):
        at, o = i, b[i]
        ins = None
        if o in ALU_OPS:
            if i + 1 >= len(b):
                raise ValueError(f"byte {at}: ModRM byte missing")
            name, form = ALU_OPS[o]
            mrm = b[i + 1]
            mod, rg, rm = mrm >> 6, (mrm >> 3) & 7, mrm & 7
            n = 2
            if mod == 3:
                rmo = ("r", X86_REGS[rm])
            elif mod in (0, 1) and rm != 4 and not (mod == 0 and rm == 5):
                disp = 0
                if mod == 1:
                    if i + 2 >= len(b):
                        raise ValueError(f"byte {at}: displacement missing")
                    disp = sx(b[i + 2], 8)
                    n = 3
                rmo = ("m", X86_REGS[rm], disp)
            else:
                raise ValueError(f"byte {at}: this teaching decoder has no SIB or 32-bit displacement forms")
            ro = ("r", X86_REGS[rg])
            dst, src = (rmo, ro) if form == "rm,r" else (ro, rmo)
            ins = dict(op=name, dst=dst, src=src, len=n)
        elif 0x40 <= o <= 0x4F:
            ins = dict(op="inc" if o < 0x48 else "dec", dst=("r", X86_REGS[o & 7]), src=None, len=1)
        elif 0x50 <= o <= 0x5F:
            ins = dict(op="push" if o < 0x58 else "pop", dst=("r", X86_REGS[o & 7]), src=None, len=1)
        elif 0xB8 <= o <= 0xBF:
            if i + 4 >= len(b):
                raise ValueError(f"byte {at}: 4-byte immediate missing")
            imm = b[i + 1] | (b[i + 2] << 8) | (b[i + 3] << 16) | (b[i + 4] << 24)
            ins = dict(op="mov", dst=("r", X86_REGS[o & 7]), src=("i", s32(imm)), len=5)
        elif o in (0x74, 0x75, 0xEB):
            if i + 1 >= len(b):
                raise ValueError(f"byte {at}: jump offset missing")
            ins = dict(op={0x74: "je", 0x75: "jne", 0xEB: "jmp"}[o], dst=("t", at + 2 + sx(b[i + 1], 8)), src=None, len=2)
        else:
            raise ValueError(f"byte {at}: opcode {o:02X} is not in this teaching subset")
        ins["at"], ins["bytes"] = at, b[at:at + ins["len"]]
        ins["text"] = x86_text(ins)
        out.append(ins)
        i += ins["len"]
    return out


def _opnd(o):
    if o[0] == "r":
        return o[1]
    if o[0] == "i":
        return str(o[1])
    if o[0] == "t":
        return f"byte {o[1]}"
    return f"[{o[1]}{o[2]:+d}]" if o[2] else f"[{o[1]}]"


def x86_text(ins):
    if ins["src"] is None:
        return f"{ins['op']} {_opnd(ins['dst'])}"
    return f"{ins['op']} {_opnd(ins['dst'])}, {_opnd(ins['src'])}"


def uops(ins: dict) -> list[str]:
    """A typical split into µops on a recent out-of-order x86 core (exact counts vary by core)."""
    op, dst, src = ins["op"], ins["dst"], ins["src"]
    mem_src = src is not None and src[0] == "m"
    mem_dst = dst[0] == "m"
    if op in ("jne", "je", "jmp"):
        return ["branch"]
    if op == "push":
        return ["store-address (esp−4)", "store-data", "esp −= 4"]
    if op == "pop":
        return ["load [esp]", "esp += 4"]
    if op in ("inc", "dec"):
        return [f"{op} (flags except CF)"]
    if op == "mov":
        if mem_dst:
            return ["store-address", "store-data"]
        return ["load"] if mem_src else ["move"]
    alu_uop = f"{op} (sets flags)" if op != "cmp" else "compare (sets flags only)"
    if mem_dst and op != "cmp":
        return ["load", alu_uop, "store-address", "store-data"]
    return (["load"] if (mem_src or mem_dst) else []) + [alu_uop]


def x86_translate(src) -> dict:
    """Translate a block to RV32I assembly. Flags are lazy: an x86 flag-setting op only records
    which values its zero flag depends on; a later je/jne becomes one beq/bne on them."""
    ins_list = x86_decode(x86_bytes(src) if isinstance(src, str) else list(src))
    R = lambda o: f"x{X86_MAP[o[1]]}"
    out, flags = [], None                    # flags: (reg_a, reg_b) whose equality is ZF
    for k, ins in enumerate(ins_list):
        op, dst, s = ins["op"], ins["dst"], ins["src"]
        rv = []
        nxt = ins_list[k + 1]["op"] if k + 1 < len(ins_list) else None
        fused = False
        if op in ("add", "sub", "and", "or", "xor", "cmp", "mov"):
            rop = {"add": "add", "sub": "sub", "and": "and", "or": "or", "xor": "xor", "cmp": "sub", "mov": None}[op]
            if s[0] == "i":
                v = s[1]
                if -2048 <= v <= 2047:
                    rv.append(f"addi {R(dst)}, x0, {v}")
                else:
                    hi = ((v + 0x800) >> 12) & 0xFFFFF
                    lo = v - sx(hi << 12, 32)
                    rv += [f"lui {R(dst)}, 0x{hi:x}", f"addi {R(dst)}, {R(dst)}, {lo}"]
            elif dst[0] == "m":                                     # memory destination
                addr = f"{dst[2]}({R(('r', dst[1]))})"
                if op == "mov":
                    rv.append(f"sw {R(s)}, {addr}")
                elif op == "cmp":
                    rv.append(f"lw x{TMP}, {addr}")
                    flags = (f"x{TMP}", R(s))
                else:
                    rv += [f"lw x{TMP}, {addr}", f"{rop} x{TMP}, x{TMP}, {R(s)}", f"sw x{TMP}, {addr}"]
                    flags = (f"x{TMP}", "x0")
            else:
                if s[0] == "m":
                    rv.append(f"lw x{TMP}, {s[2]}({R(('r', s[1]))})")
                    b = f"x{TMP}"
                else:
                    b = R(s)
                if op == "mov":
                    if s[0] == "m":
                        rv[-1] = rv[-1].replace(f"x{TMP},", f"{R(dst)},", 1)
                    else:
                        rv.append(f"addi {R(dst)}, {b}, 0")
                elif op == "cmp":
                    flags = (R(dst), b)                             # ZF = (dst == src): no instruction needed yet
                    fused = nxt in ("je", "jne")
                else:
                    rv.append(f"{rop} {R(dst)}, {R(dst)}, {b}")
                    flags = (R(dst), "x0")
        elif op in ("inc", "dec"):
            rv.append(f"addi {R(dst)}, {R(dst)}, {1 if op == 'inc' else -1}")
            flags = (R(dst), "x0")
            fused = nxt in ("je", "jne")
        elif op == "push":
            rv += ["addi x2, x2, -4", f"sw {R(dst)}, 0(x2)"]
        elif op == "pop":
            rv += [f"lw {R(dst)}, 0(x2)", "addi x2, x2, 4"]
        elif op in ("je", "jne", "jmp"):
            tgt = dst[1]
            lab = f"L{tgt}"
            if op == "jmp":
                rv.append(f"jal x0, {lab}")
            else:
                if flags is None:
                    raise ValueError(f"{ins['text']}: no earlier instruction set the zero flag")
                rv.append(f"{'beq' if op == 'je' else 'bne'} {flags[0]}, {flags[1]}, {lab}")
        out.append(dict(at=ins["at"], len=ins["len"], bytes=ins["bytes"], text=ins["text"], uops=uops(ins), rv=rv, fused=fused))
    targets = {i["dst"][1] for i in ins_list if i["op"] in ("je", "jne", "jmp")}
    starts = {i["at"] for i in ins_list}
    for t in targets:
        if t not in starts:
            raise ValueError(f"a jump lands at byte {t}, inside another instruction")
    lines = []
    for o in out:
        if o["at"] in targets:
            lines.append(f"L{o['at']}:")
        lines += [f"    {x}" for x in o["rv"]]
    asm = "\n".join(lines) + "\n"
    return dict(ins=out, asm=asm, x86_bytes=sum(o["len"] for o in out), rv_count=sum(len(o["rv"]) for o in out),
                uop_count=sum(len(o["uops"]) for o in out) - sum(1 for o in out if o["fused"]))


def reference() -> dict:
    """Numbers for data/physics_reference.json (JS parity)."""
    a = assemble(DEMO)
    mc, pl, sq = multicycle(a["words"]), pipeline(a["words"]), sequential(a["words"])
    tx = x86_translate(X86_DEMO)
    tw = assemble(tx["asm"])["words"]
    ts = sequential(tw)
    return dict(words=a["words"], mc_cycles=mc["cycles"], mc_retired=mc["retired"], mc_states=[t["state"] for t in mc["trace"][:40]],
                x=sq["x"], gpio=sq["gpio"], pl_cycles=pl["cycles"], pl_stalls=pl["stalls"], pl_flushes=pl["flushes"],
                pl_rows=[[r["idx"], r["if"], r["ex"], r["wb"], r["stall"]] for r in pl["rows"]],
                x86_asm=tx["asm"], x86_uops=tx["uop_count"], x86_rv=tx["rv_count"], x86_words=tw, x86_x=ts["x"],
                x86_mem={str(k): v for k, v in sorted(ts["mem"].items())})
