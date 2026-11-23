# 30. The SoC Explorer: one RISC-V chip read four ways

The [SoC Explorer](https://normansrule.github.io/transistor-foundry-expedition/soc.html) is a small system-on-chip (SoC): a RISC-V core, a 4 KiB RAM and a GPIO (general-purpose input/output) port with eight LEDs on one bus. It answers a question the rest of the site leaves open: how does code a designer writes become the transistors the fab prints?

Two blocks of the core are taken all the way down, from Verilog RTL (register-transfer level code) to a gate netlist to placed transistor cells. The page shows four views of the same design side by side, and they share one selection: click a line of code, a gate, a cell or a state and it lights up in every view.

## The core

The core runs a subset of RV32I, the 32-bit base integer instruction set of RISC-V. RV32I has 40 unique instructions [@riscv_isa]; this core implements 17 of them with their real 32-bit encodings: `add sub and or xor slt`, `addi andi ori xori slti`, `lw sw`, `beq bne`, `jal` and `lui`. Register x0 always reads 0 [@riscv_isa].

It is a multi-cycle core, the textbook design of Patterson and Hennessy adapted to RISC-V [@patterson2020]. A 12-state controller (a Moore machine: its outputs depend only on the state) steps each instruction through FETCH, DECODE, an execute state chosen by the instruction class, and a write-back or memory state. R-type, immediate and store instructions take 4 cycles, loads 5, and branches, `jal` and `lui` 3. The demo program sums 5 + 4 + 3 + 2 + 1, keeps the sum in RAM, doubles it and writes 30 to the LEDs: 23 instructions in 86 cycles, 3.74 cycles per instruction.

Step one clock cycle at a time and the datapath diagram lights the blocks the controller keeps busy, the write signals it asserts and the state it is in.

## The four views

- **RTL.** The Verilog of each block, plus the core and SoC top levels. The controller is two `case` statements; the ALU slice is an add with an optionally inverted b and a choice of AND, OR or the sum.
- **Gate schematic.** The synthesised netlist, drawn left to right by logic depth. With "live logic values" on, every wire is coloured by its value in the current clock cycle: the controller's inputs come from the running core, and the ALU's from the core's operands (low 4 bits) or from sliders.
- **Transistor layout.** The same cells placed in standard-cell rows, in 180 nm planar, 5 nm FinFET or 2 nm-class nanosheet silicon. Every cell is the drawn layout from the Gate to silicon bench (`data/gate_cells.json`): λ rules for 180 nm [@mead1980] and a 51 nm gate pitch for the FinFET cells [@yeap2019].
- **State machine.** The controller's 12 states and 19 transitions. Each arrow is a viewing point: click it to see the Verilog line that describes it and the gates and cells that make it happen.

## From RTL to silicon

`sim/transistor_sim/soc.py` runs the same steps as a commercial flow, small enough to read:

1. **Logic equations.** Each next-state bit and control output of the controller is minimised from its truth table with the Quine–McCluskey method [@quine1952; @mccluskey1956]. Unused state codes, the unused class code and impossible pairs are don't-cares. Essential prime implicants come first; the rest of the cover is the smallest set of the remaining primes.
2. **Technology mapping.** Sums of products become NAND–NAND logic, with NOR and inverters where the polarity needs them, and product terms shared by several outputs are built once. The ALU slice is mapped by hand: per bit, two XORs for the sum, three NAND2s for the carry (the majority function), a NAND2 and a NOR2 for AND and OR, and two AOI22s for the result multiplexer. The controller becomes 58 cells (240 transistors) and the ALU slice 50 cells (314 transistors).
3. **Check.** The gate netlists are simulated against their behaviour for every input: all 2,048 ALU inputs and the 79 legal (state, class) pairs of the controller. A failure stops the build.
4. **Placement.** Cells go into rows of equal height in netlist order, with every other row flipped so neighbours share a supply rail. The controller takes about 1,150 µm² in 180 nm planar and about 3.6 µm² as 5 nm FinFET cells.
5. **Timing.** Static timing with logical effort [@sutherland1999]: every cell is unit size, so a cell's delay is d = p + C_load in units of τ, where C_load is the sum of the logical efforts of the pins it drives (4 for a block output). One FO4 (fan-out-of-4 inverter delay) is 5 τ. The ALU slice's critical path is the ripple carry from bit 0 to bit 3 and then the zero detector: 74.7 τ, about 15 FO4. That is why real ALUs use carry-lookahead or prefix adders [@weste2010]. The controller's path is 53.3 τ.

## The pipeline

The same program also runs through the classic five-stage pipeline: IF, ID, EX, MEM and WB [@patterson2020]. Results are forwarded from EX/MEM and MEM/WB, so neighbours rarely wait. A load followed at once by a user of its result stalls one cycle, and a taken branch or jump, resolved in EX with "predict not taken", flushes the two instructions fetched behind it. The demo takes 36 cycles (1.57 cycles per instruction), with 1 stall and 10 flushed fetches, against 86 on the multi-cycle core.

## x86 on a RISC-V core

x86 instructions are 1 to 15 bytes long [@intel_sdm], and many read memory, compute and write flags at once. Out-of-order x86 cores split them into micro-operations (µops) after decoding [@fog_microarch; @bakhvalov_uops]. The page length-decodes real 32-bit x86 machine code (14 mnemonics, no prefixes or SIB byte), shows a typical µop split and translates the block into RV32I.

RISC-V has no flags register: its branches compare two registers [@riscv_isa]. The translator keeps flags "lazily". It only records which result the zero flag depends on, and turns `dec ecx; jne` or `cmp eax, ebx; je` into one `bne` or `beq`. x86 cores make the same pairing in hardware: the decoder fuses a compare, test, add, subtract, increment, decrement or AND with the conditional jump after it into one µop [@wikichip_mopfusion]. The translated code runs on the RISC-V model, and the demo loop gives the same answer as the RISC-V demo: 15 in eax and at address 0x100.

## How it is built

- `sim/transistor_sim/physics/riscv.py`: assembler, decoder, multi-cycle and pipeline timing, x86 decoder and translator, gate evaluation and static timing. Its JavaScript twin is `site/js/physics/riscv.js`. `tests/js_parity.mjs` compares encodings, cycle counts, state sequences, register files, pipeline rows, the translation and gate outputs.
- `sim/transistor_sim/soc.py` writes `data/soc.json`: the two netlists, their RTL with each line tagged by what it became, the transition-to-gates map, the placements for three technologies and the timing. `scripts/build_data.py` bundles it with the cell shapes into `site/js/soc/data.js`.
- `tests/test_soc.py` checks the encodings against the RV32I formats, that both cores agree with a plain instruction-by-instruction run, the pipeline's hazard arithmetic, the gate-level equivalence, the placement and that every state-machine arrow links to code and gates.
- Deep links: `soc.html?mod=alu&tech=planar_180&crit=1&step=5&cycle=12&sel=state:EXEC_R`.

## What the models leave out

- **Most of the chip.** Only the ALU slice and the controller reach gates and layout. The register file, RAM and bus stay at RTL and block level, and a real 32-bit ALU would not ripple its carry.
- **Routing.** The layout is placement only. A real flow routes the metal between cells, adds buffers, a clock tree, power straps and fill, and checks the result against the design rules.
- **Real delays.** Logical effort with unit-sized cells and no wire load gives τ and FO4, not picoseconds, and no gate is resized to speed up the critical path.
- **Smarter synthesis.** Two-level minimisation with shared terms and a fixed binary state encoding; commercial tools restructure logic over many levels and choose encodings.
- **A complete ISA.** No interrupts, exceptions, privileged mode, caches, multiply or shifts. The x86 decoder keeps only the zero flag, and its µop counts are a typical split that varies from core to core.
- **Foundry cells.** The FinFET and nanosheet cells use the Gate to silicon bench's pitches, some of them estimates, not a foundry library.
