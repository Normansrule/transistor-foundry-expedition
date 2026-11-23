// Teaching RISC-V core and its x86 front end — JavaScript twin of sim/transistor_sim/physics/riscv.py
// (checked by tests/js_parity.mjs). See the Python file for the model notes and citations.

const MASK = 0xFFFFFFFF;
export const R_OPS = { add: [0, 0], sub: [0, 0x20], slt: [2, 0], xor: [4, 0], or: [6, 0], and: [7, 0] };
export const I_OPS = { addi: 0, slti: 2, xori: 4, ori: 6, andi: 7 };
export const B_OPS = { beq: 0, bne: 1 };
export const CLASSES = ['R', 'I', 'LOAD', 'STORE', 'BRANCH', 'JAL', 'LUI'];
export const OPCODE = { R: 0b0110011, I: 0b0010011, LOAD: 0b0000011, STORE: 0b0100011, BRANCH: 0b1100011, JAL: 0b1101111, LUI: 0b0110111 };
const ABI = { zero: 0, ra: 1, sp: 2, gp: 3, tp: 4, t0: 5, t1: 6, t2: 7, s0: 8, fp: 8, s1: 9 };
for (let i = 0; i < 8; i++) ABI['a' + i] = 10 + i;
for (let i = 2; i < 12; i++) ABI['s' + i] = 16 + i;
for (let i = 3; i < 7; i++) ABI['t' + i] = 25 + i;
export const GPIO = 0x10000000;

export const sx = (v, bits) => {
  const m = 2 ** bits;
  v = ((v % m) + m) % m;
  return v >= m / 2 ? v - m : v;
};
export const s32 = (v) => sx(v, 32);
const u32 = (v) => ((v % 2 ** 32) + 2 ** 32) % 2 ** 32;

export function reg(tok) {
  const t = tok.trim().toLowerCase();
  if (/^x([0-9]|[12][0-9]|3[01])$/.test(t)) return Number(t.slice(1));
  if (t in ABI) return ABI[t];
  throw new Error(`unknown register ‘${tok.trim()}’`);
}

function num(tok) {
  const t = tok.trim().toLowerCase();
  const m = /^(-?)(0x[0-9a-f]+|0b[01]+|0o[0-7]+|0|[1-9][0-9]*)$/.exec(t);
  if (!m) throw new Error(`not a number: ‘${tok.trim()}’`);
  const v = m[2].startsWith('0b') ? parseInt(m[2].slice(2), 2) : m[2].startsWith('0o') ? parseInt(m[2].slice(2), 8) : Number(m[2]);
  return m[1] ? -v : v;
}

export function encode(op, a, pc, labels) {
  const immOrLabel = (tok) => { const t = tok.trim(); return t in labels ? labels[t] - pc : num(t); };
  const need = (n) => { if (a.length !== n) throw new Error(`${op} takes ${n} operands`); };
  if (op in R_OPS) {
    need(3);
    const [f3, f7] = R_OPS[op];
    return u32(f7 * 2 ** 25 + reg(a[2]) * 2 ** 20 + reg(a[1]) * 2 ** 15 + f3 * 2 ** 12 + reg(a[0]) * 2 ** 7 + OPCODE.R);
  }
  if (op in I_OPS) {
    need(3);
    const imm = num(a[2]);
    if (imm < -2048 || imm > 2047) throw new Error(`${op}: immediate ${imm} does not fit in 12 bits`);
    return u32((imm & 0xFFF) * 2 ** 20 + reg(a[1]) * 2 ** 15 + I_OPS[op] * 2 ** 12 + reg(a[0]) * 2 ** 7 + OPCODE.I);
  }
  if (op === 'lw' || op === 'sw') {
    need(2);
    const m = /^\s*(-?\w+)\s*\(\s*(\w+)\s*\)\s*$/.exec(a[1]);
    if (!m) throw new Error(`${op}: write the address as offset(register)`);
    const imm = num(m[1]), base = reg(m[2]);
    if (imm < -2048 || imm > 2047) throw new Error(`${op}: offset ${imm} does not fit in 12 bits`);
    if (op === 'lw') return u32((imm & 0xFFF) * 2 ** 20 + base * 2 ** 15 + 2 * 2 ** 12 + reg(a[0]) * 2 ** 7 + OPCODE.LOAD);
    const i = imm & 0xFFF;
    return u32((i >> 5) * 2 ** 25 + reg(a[0]) * 2 ** 20 + base * 2 ** 15 + 2 * 2 ** 12 + (i & 31) * 2 ** 7 + OPCODE.STORE);
  }
  if (op in B_OPS) {
    need(3);
    const off = immOrLabel(a[2]);
    if (off % 2 || off < -4096 || off > 4094) throw new Error(`${op}: branch offset ${off} is out of range`);
    const i = off & 0x1FFF;
    return u32(((i >> 12) & 1) * 2 ** 31 + ((i >> 5) & 63) * 2 ** 25 + reg(a[1]) * 2 ** 20 + reg(a[0]) * 2 ** 15 +
      B_OPS[op] * 2 ** 12 + ((i >> 1) & 15) * 2 ** 8 + ((i >> 11) & 1) * 2 ** 7 + OPCODE.BRANCH);
  }
  if (op === 'jal') {
    need(2);
    const off = immOrLabel(a[1]);
    if (off % 2 || off < -(2 ** 20) || off >= 2 ** 20) throw new Error(`jal: offset ${off} is out of range`);
    const i = off & 0x1FFFFF;
    return u32(((i >> 20) & 1) * 2 ** 31 + ((i >> 1) & 0x3FF) * 2 ** 21 + ((i >> 11) & 1) * 2 ** 20 +
      ((i >> 12) & 0xFF) * 2 ** 12 + reg(a[0]) * 2 ** 7 + OPCODE.JAL);
  }
  if (op === 'lui') {
    need(2);
    const imm = num(a[1]);
    if (imm < 0 || imm > 0xFFFFF) throw new Error('lui: the immediate is the upper 20 bits, 0 to 0xFFFFF');
    return u32(imm * 2 ** 12 + reg(a[0]) * 2 ** 7 + OPCODE.LUI);
  }
  throw new Error(`‘${op}’ is not in this core’s 17 instructions`);
}

export function assemble(src) {
  const rows = [], labels = {};
  let pc = 0;
  src.split(/\r?\n/).forEach((line, k) => {
    const n = k + 1;
    let code = line.split('#')[0].trim();
    while (code.includes(':')) {
      const j = code.indexOf(':');
      const lab = code.slice(0, j).trim();
      code = code.slice(j + 1);
      if (!/^[A-Za-z_]\w*$/.test(lab)) throw new Error(`line ${n}: bad label ‘${lab}’`);
      labels[lab] = pc;
      code = code.trim();
    }
    if (code) { rows.push([n, pc, code]); pc += 4; }
  });
  const words = [], lines = [];
  for (const [n, rpc, code] of rows) {
    const sp = code.search(/\s/);
    const op = (sp < 0 ? code : code.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : code.slice(sp + 1);
    const args = rest ? rest.split(',').filter((x) => x.trim()) : [];
    try { words.push(encode(op, args, rpc, labels)); } catch (e) { throw new Error(`line ${n}: ${e.message}`); }
    lines.push(n);
  }
  return { words, lines, labels };
}

export function decode(w) {
  const opc = w & 127, rd = (w >>> 7) & 31, f3 = (w >>> 12) & 7, rs1 = (w >>> 15) & 31, rs2 = (w >>> 20) & 31, f7 = w >>> 25;
  const cls = Object.keys(OPCODE).find((c) => OPCODE[c] === opc) ?? null;
  const d = { word: w, cls, rd, rs1, rs2, f3, imm: 0, op: null };
  const find = (o, f) => Object.keys(o).find((k) => f(o[k])) ?? null;
  if (cls === 'R') d.op = find(R_OPS, (v) => v[0] === f3 && v[1] === f7);
  else if (cls === 'I') { d.op = find(I_OPS, (v) => v === f3); d.imm = sx(w >>> 20, 12); }
  else if (cls === 'LOAD') { d.op = f3 === 2 ? 'lw' : null; d.imm = sx(w >>> 20, 12); }
  else if (cls === 'STORE') { d.op = f3 === 2 ? 'sw' : null; d.imm = sx(((w >>> 25) << 5) | ((w >>> 7) & 31), 12); }
  else if (cls === 'BRANCH') {
    d.op = find(B_OPS, (v) => v === f3);
    d.imm = sx((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 63) << 5) | (((w >>> 8) & 15) << 1), 13);
  } else if (cls === 'JAL') {
    d.op = 'jal';
    d.imm = sx((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xFF) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3FF) << 1), 21);
  } else if (cls === 'LUI') { d.op = 'lui'; d.imm = w >>> 12; }
  if (d.op === null) throw new Error(`0x${u32(w).toString(16).padStart(8, '0')} is not one of this core’s instructions`);
  d.code = CLASSES.indexOf(cls);
  d.text = text(d);
  return d;
}

const signed = (v) => (v >= 0 ? '+' : '') + v;
export function text(d) {
  const { op, cls: c } = d;
  if (c === 'R') return `${op} x${d.rd}, x${d.rs1}, x${d.rs2}`;
  if (c === 'I') return `${op} x${d.rd}, x${d.rs1}, ${d.imm}`;
  if (c === 'LOAD') return `lw x${d.rd}, ${d.imm}(x${d.rs1})`;
  if (c === 'STORE') return `sw x${d.rs2}, ${d.imm}(x${d.rs1})`;
  if (c === 'BRANCH') return `${op} x${d.rs1}, x${d.rs2}, ${signed(d.imm)}`;
  if (c === 'JAL') return `jal x${d.rd}, ${signed(d.imm)}`;
  return `lui x${d.rd}, 0x${d.imm.toString(16)}`;
}

export function alu(op, a, b) {
  a = u32(a); b = u32(b);
  if (['add', 'addi', 'lw', 'sw'].includes(op)) return u32(a + b);
  if (op === 'sub') return u32(a - b);
  if (op === 'and' || op === 'andi') return u32(a & b);
  if (op === 'or' || op === 'ori') return u32(a | b);
  if (op === 'xor' || op === 'xori') return u32(a ^ b);
  if (op === 'slt' || op === 'slti') return s32(a) < s32(b) ? 1 : 0;
  throw new Error(op);
}

export class Machine {
  constructor(words) {
    this.x = new Array(32).fill(0); this.pc = 0; this.gpio = 0; this.n = words.length;
    this.mem = new Map(words.map((w, i) => [4 * i, w]));
  }
  load(addr) {
    if (addr % 4) throw new Error(`misaligned load at 0x${addr.toString(16)}`);
    return addr === GPIO ? this.gpio : (this.mem.get(u32(addr)) ?? 0);
  }
  store(addr, v) {
    if (addr % 4) throw new Error(`misaligned store at 0x${addr.toString(16)}`);
    if (addr === GPIO) this.gpio = v & 0xFF; else this.mem.set(u32(addr), u32(v));
  }
  setx(r, v) { if (r) this.x[r] = u32(v); }
  data() { const o = {}; for (const [k, v] of [...this.mem].sort((p, q) => p[0] - q[0])) if (k >= 4 * this.n) o[k] = v; return o; }
}

export function execute(m, d) {
  const c = d.cls, op = d.op, pc = m.pc, a = m.x[d.rs1], b = m.x[d.rs2];
  const out = { next_pc: u32(pc + 4), wb: null, mem: null, taken: false, addr: null };
  if (c === 'R') out.wb = [d.rd, alu(op, a, b)];
  else if (c === 'I') out.wb = [d.rd, alu(op, a, d.imm)];
  else if (c === 'LOAD') { const addr = u32(a + d.imm); out.addr = addr; out.wb = [d.rd, m.load(addr)]; }
  else if (c === 'STORE') { const addr = u32(a + d.imm); out.addr = addr; out.mem = [addr, b]; }
  else if (c === 'BRANCH') { out.taken = op === 'beq' ? a === b : a !== b; if (out.taken) out.next_pc = u32(pc + d.imm); }
  else if (c === 'JAL') { out.wb = [d.rd, pc + 4]; out.next_pc = u32(pc + d.imm); out.taken = true; }
  else if (c === 'LUI') out.wb = [d.rd, d.imm * 4096];
  return out;
}

export function commit(m, r) {
  if (r.wb) m.setx(...r.wb);
  if (r.mem) m.store(...r.mem);
  m.pc = r.next_pc;
}
export const halted = (d) => d.cls === 'JAL' && d.imm === 0;

export const STATES = ['FETCH', 'DECODE', 'EXEC_R', 'EXEC_I', 'MEMADR', 'BRANCH', 'JAL', 'LUI', 'ALUWB', 'MEMRD', 'MEMWR', 'MEMWB'];
const FIRST = { R: 'EXEC_R', I: 'EXEC_I', LOAD: 'MEMADR', STORE: 'MEMADR', BRANCH: 'BRANCH', JAL: 'JAL', LUI: 'LUI' };
export const CONTROLS = ['MemRead', 'IRWrite', 'PCWrite', 'Branch', 'MemWrite', 'RegWrite'];
export const ASSERT = { FETCH: ['MemRead', 'IRWrite', 'PCWrite'], BRANCH: ['Branch'], JAL: ['PCWrite', 'RegWrite'], LUI: ['RegWrite'], ALUWB: ['RegWrite'], MEMRD: ['MemRead'], MEMWR: ['MemWrite'], MEMWB: ['RegWrite'] };
export const BUSY = { FETCH: ['pc', 'mem', 'ir', 'pcadd'], DECODE: ['ir', 'ctrl', 'rf', 'imm', 'alu'], EXEC_R: ['rf', 'alu'], EXEC_I: ['rf', 'imm', 'alu'], MEMADR: ['rf', 'imm', 'alu'], BRANCH: ['rf', 'alu', 'pc'], JAL: ['pc', 'alu', 'rf'], LUI: ['imm', 'rf'], ALUWB: ['aluout', 'rf'], MEMRD: ['aluout', 'mem', 'mdr'], MEMWR: ['aluout', 'mem'], MEMWB: ['mdr', 'rf'] };

export function nextState(s, cls) {
  if (s === 'FETCH') return 'DECODE';
  if (s === 'DECODE') return FIRST[cls];
  if (s === 'EXEC_R' || s === 'EXEC_I') return 'ALUWB';
  if (s === 'MEMADR') return cls === 'LOAD' ? 'MEMRD' : 'MEMWR';
  if (s === 'MEMRD') return 'MEMWB';
  return 'FETCH';
}

export function multicycle(words, maxCycles = 2000) {
  const m = new Machine(words);
  let state = 'FETCH', d = null, res = null, retired = 0, cyc = 0;
  const trace = [];
  while (cyc < maxCycles) {
    if (state === 'FETCH') {
      if (Math.floor(m.pc / 4) >= m.n || m.pc % 4) throw new Error(`PC 0x${m.pc.toString(16)} left the program`);
      d = decode(m.load(m.pc));
      res = execute(m, d);
    }
    trace.push({ cycle: cyc, state, pc: m.pc, idx: Math.floor(m.pc / 4), ctrl: ASSERT[state] || [], busy: BUSY[state], x: m.x.slice(), gpio: m.gpio, text: d.text });
    cyc++;
    const nxt = nextState(state, d.cls);
    if (nxt === 'FETCH') {
      commit(m, res); retired++;
      if (halted(d)) break;
    }
    state = nxt;
  }
  return { cycles: cyc, retired, x: m.x.slice(), gpio: m.gpio, mem: m.data(), trace, cpi: cyc / retired };
}

export function sequential(words, maxSteps = 5000) {
  const m = new Machine(words);
  const seq = [];
  for (let k = 0; k < maxSteps; k++) {
    const d = decode(m.load(m.pc));
    const r = execute(m, d);
    seq.push({ pc: m.pc, idx: Math.floor(m.pc / 4), text: d.text, cls: d.cls, taken: r.taken });
    commit(m, r);
    if (halted(d)) break;
  }
  return { x: m.x.slice(), gpio: m.gpio, mem: m.data(), seq };
}

export function pipeline(words, maxSteps = 5000) {
  const run = sequential(words, maxSteps).seq;
  const rows = [], prev = [];
  let tIf = 0;
  for (const s of run) {
    const d = decode(words[s.idx]);
    const row = { idx: s.idx, text: s.text, stall: 0, flushed: [] };
    row.if = tIf;
    const id = tIf + 1;
    if (prev.length) {
      const p = prev[prev.length - 1];
      let uses = new Set([d.rs1]);
      if (['R', 'STORE', 'BRANCH'].includes(d.cls)) uses.add(d.rs2);
      if (d.cls === 'LUI' || d.cls === 'JAL') uses = new Set();
      if (p.cls === 'LOAD' && p.rd && uses.has(p.rd) && !(d.cls === 'STORE' && d.rs1 !== p.rd)) row.stall = 1;
    }
    row.id = id;
    row.ex = id + 1 + row.stall;
    row.mem = row.ex + 1; row.wb = row.ex + 2;
    rows.push(row);
    prev.push({ cls: d.cls, rd: d.rd });
    tIf = tIf + 1 + row.stall;
    if (s.taken) { row.flushed = [tIf, tIf + 1]; tIf = row.ex + 1; }
  }
  const total = rows[rows.length - 1].wb + 1;
  return { rows, cycles: total, retired: rows.length, cpi: total / rows.length,
    stalls: rows.reduce((a, r) => a + r.stall, 0), flushes: rows.reduce((a, r) => a + r.flushed.length, 0) };
}

export const CELL_FN = {
  inv: (p) => 1 - p.A,
  nand2: (p) => 1 - (p.A & p.B),
  nand3: (p) => 1 - (p.A & p.B & p.C),
  nor2: (p) => 1 - (p.A | p.B),
  nor3: (p) => 1 - (p.A | p.B | p.C),
  aoi21: (p) => 1 - ((p.A & p.B) | p.C),
  oai21: (p) => 1 - ((p.A | p.B) & p.C),
  aoi22: (p) => 1 - ((p.A & p.B) | (p.C & p.D)),
  xor2: (p) => p.A ^ p.B,
};

export function evalNetlist(nl, inputs) {
  const v = { ...inputs };
  for (const g of nl.cells) {
    const p = {};
    for (const [pin, n] of Object.entries(g.ins)) p[pin] = v[n];
    v[g.out] = CELL_FN[g.cell](p);
  }
  return v;
}

const later = (at) => (a, b) => (at[a] !== at[b] ? (at[a] > at[b] ? a : b) : (a > b ? a : b));
export function sta(nl, effort, poLoad = 4.0) {
  const load = {};
  for (const g of nl.cells) for (const [pin, n] of Object.entries(g.ins)) load[n] = (load[n] || 0) + effort[g.cell].g[pin];
  for (const n of nl.outputs) load[n] = (load[n] || 0) + poLoad;
  const at = {}, via = {}, delay = {};
  for (const n of nl.inputs) at[n] = 0;
  for (const g of nl.cells) {
    const src = Object.values(g.ins).reduce(later(at));
    const d = effort[g.cell].p + (load[g.out] || 0);
    delay[g.id] = d;
    at[g.out] = at[src] + d;
    via[g.out] = [g.id, src];
  }
  const end = nl.outputs.reduce(later(at));
  const path = [];
  let n = end;
  while (n in via) { path.push(via[n][0]); n = via[n][1]; }
  path.reverse();
  return { at, delay, path, end, tau: at[end], fo4: at[end] / 5 };
}

// ------------------------------------------------------------------ x86 front end
export const X86_REGS = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
export const X86_MAP = { eax: 10, ecx: 11, edx: 12, ebx: 13, esp: 2, ebp: 8, esi: 14, edi: 15 };
const TMP = 5;
const ALU_OPS = { 0x01: ['add', 'rm,r'], 0x03: ['add', 'r,rm'], 0x29: ['sub', 'rm,r'], 0x2B: ['sub', 'r,rm'], 0x39: ['cmp', 'rm,r'], 0x3B: ['cmp', 'r,rm'],
  0x89: ['mov', 'rm,r'], 0x8B: ['mov', 'r,rm'], 0x21: ['and', 'rm,r'], 0x09: ['or', 'rm,r'], 0x31: ['xor', 'rm,r'] };

export const x86Bytes = (src) => (src.match(/[0-9A-Fa-f]{2}/g) || []).map((t) => parseInt(t, 16));

export function x86Decode(b) {
  const out = [];
  let i = 0;
  while (i < b.length) {
    const at = i, o = b[i];
    let ins;
    if (o in ALU_OPS) {
      if (i + 1 >= b.length) throw new Error(`byte ${at}: ModRM byte missing`);
      const [name, form] = ALU_OPS[o];
      const mrm = b[i + 1], mod = mrm >> 6, rg = (mrm >> 3) & 7, rm = mrm & 7;
      let n = 2, rmo;
      if (mod === 3) rmo = ['r', X86_REGS[rm]];
      else if ((mod === 0 || mod === 1) && rm !== 4 && !(mod === 0 && rm === 5)) {
        let disp = 0;
        if (mod === 1) {
          if (i + 2 >= b.length) throw new Error(`byte ${at}: displacement missing`);
          disp = sx(b[i + 2], 8); n = 3;
        }
        rmo = ['m', X86_REGS[rm], disp];
      } else throw new Error(`byte ${at}: this teaching decoder has no SIB or 32-bit displacement forms`);
      const ro = ['r', X86_REGS[rg]];
      const [dst, src] = form === 'rm,r' ? [rmo, ro] : [ro, rmo];
      ins = { op: name, dst, src, len: n };
    } else if (o >= 0x40 && o <= 0x4F) ins = { op: o < 0x48 ? 'inc' : 'dec', dst: ['r', X86_REGS[o & 7]], src: null, len: 1 };
    else if (o >= 0x50 && o <= 0x5F) ins = { op: o < 0x58 ? 'push' : 'pop', dst: ['r', X86_REGS[o & 7]], src: null, len: 1 };
    else if (o >= 0xB8 && o <= 0xBF) {
      if (i + 4 >= b.length) throw new Error(`byte ${at}: 4-byte immediate missing`);
      const imm = b[i + 1] + b[i + 2] * 2 ** 8 + b[i + 3] * 2 ** 16 + b[i + 4] * 2 ** 24;
      ins = { op: 'mov', dst: ['r', X86_REGS[o & 7]], src: ['i', s32(imm)], len: 5 };
    } else if (o === 0x74 || o === 0x75 || o === 0xEB) {
      if (i + 1 >= b.length) throw new Error(`byte ${at}: jump offset missing`);
      ins = { op: { 0x74: 'je', 0x75: 'jne', 0xEB: 'jmp' }[o], dst: ['t', at + 2 + sx(b[i + 1], 8)], src: null, len: 2 };
    } else throw new Error(`byte ${at}: opcode ${o.toString(16).toUpperCase().padStart(2, '0')} is not in this teaching subset`);
    ins.at = at; ins.bytes = b.slice(at, at + ins.len);
    ins.text = x86Text(ins);
    out.push(ins);
    i += ins.len;
  }
  return out;
}

function opnd(o) {
  if (o[0] === 'r') return o[1];
  if (o[0] === 'i') return String(o[1]);
  if (o[0] === 't') return `byte ${o[1]}`;
  return o[2] ? `[${o[1]}${signed(o[2])}]` : `[${o[1]}]`;
}
export const x86Text = (ins) => (ins.src === null ? `${ins.op} ${opnd(ins.dst)}` : `${ins.op} ${opnd(ins.dst)}, ${opnd(ins.src)}`);

export function uops(ins) {
  const { op, dst, src } = ins;
  const memSrc = src !== null && src[0] === 'm', memDst = dst[0] === 'm';
  if (['jne', 'je', 'jmp'].includes(op)) return ['branch'];
  if (op === 'push') return ['store-address (esp−4)', 'store-data', 'esp −= 4'];
  if (op === 'pop') return ['load [esp]', 'esp += 4'];
  if (op === 'inc' || op === 'dec') return [`${op} (flags except CF)`];
  if (op === 'mov') { if (memDst) return ['store-address', 'store-data']; return memSrc ? ['load'] : ['move']; }
  const aluUop = op !== 'cmp' ? `${op} (sets flags)` : 'compare (sets flags only)';
  if (memDst && op !== 'cmp') return ['load', aluUop, 'store-address', 'store-data'];
  return [...(memSrc || memDst ? ['load'] : []), aluUop];
}

export function x86Translate(src) {
  const insList = x86Decode(typeof src === 'string' ? x86Bytes(src) : [...src]);
  const R = (o) => `x${X86_MAP[o[1]]}`;
  const out = [];
  let flags = null;
  insList.forEach((ins, k) => {
    const { op, dst } = ins, s = ins.src;
    const rv = [];
    const nxt = k + 1 < insList.length ? insList[k + 1].op : null;
    let fused = false;
    if (['add', 'sub', 'and', 'or', 'xor', 'cmp', 'mov'].includes(op)) {
      const rop = { add: 'add', sub: 'sub', and: 'and', or: 'or', xor: 'xor', cmp: 'sub', mov: null }[op];
      if (s[0] === 'i') {
        const v = s[1];
        if (v >= -2048 && v <= 2047) rv.push(`addi ${R(dst)}, x0, ${v}`);
        else {
          const hi = u32(Math.floor((v + 0x800) / 4096)) & 0xFFFFF;
          const lo = v - sx(hi * 4096, 32);
          rv.push(`lui ${R(dst)}, 0x${hi.toString(16)}`, `addi ${R(dst)}, ${R(dst)}, ${lo}`);
        }
      } else if (dst[0] === 'm') {
        const addr = `${dst[2]}(${R(['r', dst[1]])})`;
        if (op === 'mov') rv.push(`sw ${R(s)}, ${addr}`);
        else if (op === 'cmp') { rv.push(`lw x${TMP}, ${addr}`); flags = [`x${TMP}`, R(s)]; }
        else { rv.push(`lw x${TMP}, ${addr}`, `${rop} x${TMP}, x${TMP}, ${R(s)}`, `sw x${TMP}, ${addr}`); flags = [`x${TMP}`, 'x0']; }
      } else {
        let b;
        if (s[0] === 'm') { rv.push(`lw x${TMP}, ${s[2]}(${R(['r', s[1]])})`); b = `x${TMP}`; } else b = R(s);
        if (op === 'mov') {
          if (s[0] === 'm') rv[rv.length - 1] = rv[rv.length - 1].replace(`x${TMP},`, `${R(dst)},`);
          else rv.push(`addi ${R(dst)}, ${b}, 0`);
        } else if (op === 'cmp') { flags = [R(dst), b]; fused = nxt === 'je' || nxt === 'jne'; }
        else { rv.push(`${rop} ${R(dst)}, ${R(dst)}, ${b}`); flags = [R(dst), 'x0']; }
      }
    } else if (op === 'inc' || op === 'dec') {
      rv.push(`addi ${R(dst)}, ${R(dst)}, ${op === 'inc' ? 1 : -1}`);
      flags = [R(dst), 'x0'];
      fused = nxt === 'je' || nxt === 'jne';
    } else if (op === 'push') rv.push('addi x2, x2, -4', `sw ${R(dst)}, 0(x2)`);
    else if (op === 'pop') rv.push(`lw ${R(dst)}, 0(x2)`, 'addi x2, x2, 4');
    else if (['je', 'jne', 'jmp'].includes(op)) {
      const lab = `L${dst[1]}`;
      if (op === 'jmp') rv.push(`jal x0, ${lab}`);
      else {
        if (flags === null) throw new Error(`${ins.text}: no earlier instruction set the zero flag`);
        rv.push(`${op === 'je' ? 'beq' : 'bne'} ${flags[0]}, ${flags[1]}, ${lab}`);
      }
    }
    out.push({ at: ins.at, len: ins.len, bytes: ins.bytes, text: ins.text, uops: uops(ins), rv, fused });
  });
  const targets = new Set(insList.filter((i) => ['je', 'jne', 'jmp'].includes(i.op)).map((i) => i.dst[1]));
  const starts = new Set(insList.map((i) => i.at));
  for (const t of targets) if (!starts.has(t)) throw new Error(`a jump lands at byte ${t}, inside another instruction`);
  const lines = [];
  for (const o of out) {
    if (targets.has(o.at)) lines.push(`L${o.at}:`);
    for (const x of o.rv) lines.push(`    ${x}`);
  }
  return { ins: out, asm: lines.join('\n') + '\n', x86_bytes: out.reduce((a, o) => a + o.len, 0),
    rv_count: out.reduce((a, o) => a + o.rv.length, 0), uop_count: out.reduce((a, o) => a + o.uops.length, 0) - out.filter((o) => o.fused).length };
}
