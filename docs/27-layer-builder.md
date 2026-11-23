# 27 · The layer builder: planar to FinFET to nanosheet to CFET

The [layer builder](https://normansrule.github.io/transistor-foundry-expedition/fab.html#builder) on the Fab Journey page builds one transistor at a time, step by step, and draws it to scale in nanometres. It has eight builds: a planar high-k metal gate transistor of the 45 nm generation, three FinFETs (22, 14 and 10 nm), a gate-all-around nanosheet, the same nanosheet with backside power, a forksheet and a complementary FET (CFET). Each can be cut open along the channel or through the gate, so the channel inside the gate stays visible.

## The eight builds

| Build | Steps | Cited dimensions | Drawing values (est.) |
|---|---|---|---|
| Planar, high-k metal gate (2007) | 8 | 160 nm gate pitch, 35 nm gate length [@mistry2007] | 120 nm width, trench, junction and gate heights |
| FinFET, first generation (2011) | 9 | 90 nm gate pitch, 30 nm gate length, fins 8 nm wide, 34 nm tall at 60 nm pitch [@auth2012] | three fins, sub-fin and gate heights |
| FinFET, second generation (2014) | 9 | 70 nm gate pitch, fins 42 nm tall at 42 nm pitch [@natarajan2014] | two fins 8 nm wide, 20 nm gate length, sub-fin and gate heights |
| FinFET, third generation (2018) | 9 | 54 nm gate pitch, 18 nm gate length, fins 7 nm wide, 46 nm tall at 34 nm pitch [@auth2017] | two fins, sub-fin and gate heights |
| Gate-all-around nanosheet | 12 | 44 nm gate pitch, 12 nm gate length [@loubet2017] | three sheets 5 nm thick and 30 nm wide, 10 nm apart |
| Nanosheet with backside power | 15 | as the nanosheet; the source is contacted from below, as in TSMC’s Super Power Rail [@toms_a16; @tsmc_a16] | as the nanosheet, plus a 12 nm power rail |
| Forksheet | 13 | 42 nm gate pitch and 8 nm between n and p, from imec’s 2 nm study [@imec_forksheet2019; @weckx2019] | three sheets 25 nm wide per side, 12 nm gate length |
| Complementary FET | 14 | none: the whole build is illustrative [@ryckaert2018] | two n sheets under two p sheets, 30 nm between the tiers |

Every dimension on the page carries its source or the label est. The equivalent oxide thicknesses are the site's own model presets.

## The steps

The builds share one front-end order [@plummer2000]. Each step adds, removes or replaces material:

1. **Wafer.** A slice of single-crystal silicon.
2. **Superlattice** (nanosheet and CFET only). Epitaxy grows alternating SiGe and silicon layers; the silicon becomes the sheets [@loubet2017].
3. **Fins.** Lithography and etch cut the top into lines [@hisamoto2000]. A planar transistor has no fin step.
4. **Trench isolation.** Oxide fills between the fins and is recessed so they stand above it.
5. **Dummy gate.** A polysilicon placeholder that everything else lines up to.
6. **Spacers.** A dielectric left on the gate's side walls sets the distance from gate to source and drain.
7. **Inner spacers** (nanosheet and CFET). The ends of the SiGe layers under the spacers are recessed and refilled with dielectric.
8. **Source and drain.** Implanted in the planar build; recessed and regrown by epitaxy on fins and sheets [@mistry2007]. The CFET grows them twice: n-type for the lower tier, an isolation layer, then p-type for the upper tier [@ryckaert2018].
9. **Pull the dummy gate.** The replacement-gate flow leaves a trench where the gate belongs [@mistry2007].
10. **Release** (nanosheet and CFET). A selective etch removes the SiGe inside the trench, leaving the sheets suspended.
11. **High-k metal gate.** High-k lines every exposed face and metal fills the rest. The gate now touches one face of a planar channel, three of a fin and four of a sheet.
12. **Contacts.** Metal down to the source and drain.

The forksheet adds one step after the fins: **a dielectric wall** fills the narrow slot between the n and p stacks [@weckx2019]. It then grows n-type epitaxy on one side of the wall and p-type on the other, and the gate wraps three faces of each sheet, with the fourth face against the wall.

The backside-power build adds three steps after the contacts [@intel_18a; @tsmc_a16]:

13. **Bond, flip and thin.** The finished front is bonded to a carrier wafer and the silicon underneath is removed up to the bottom of the transistors. The carrier is not drawn.
14. **Backside contact.** The silicon under the source is replaced by metal, so the source is fed from below and needs no front contact; only the drain is contacted on the front [@toms_a16].
15. **Backside power rail.** A rail runs under the cell, and the power network is built below it, leaving the front wiring for signals.

## How the geometry is computed

`sim/transistor_sim/physics/builder.py` turns the dimensions into axis-aligned boxes. x runs along the channel, y across it and z up. The cell is one gate pitch long, split into five zones along x (source and drain, two spacers and the gate) because material changes zone by zone: the dummy gate becomes metal only in the gate zone, SiGe becomes inner spacer only under the spacers, and the stack is recessed only beside them.

Inside each zone the shapes are rectangles in the y–z plane. The dummy gate, the spacers and the metal gate are made by subtracting the fins or sheets from a rectangle: the rectangle is cut into horizontal slabs at every edge, each slab keeps the spans no hole covers, and equal spans are merged upwards. The high-k is whatever lies between the grown-out channel and the channel itself.

Each box records the step that makes it and the step that removes it. The tests check that no two boxes alive at the same step share any volume, at every step of every build, and that every step changes something. Because nothing overlaps, the page can draw the boxes in SVG with a painter's sort: for every pair whose drawings overlap there is an axis that separates them, and the box on the far side is drawn first.

The JavaScript twin is `site/js/physics/builder.js`; `tests/js_parity.mjs` compares all 372 boxes and every number in the table.

## The numbers in the comparison table

- **Effective width** is the channel perimeter the gate covers: W for the planar device, 2H + w per fin and 2(w + t) per sheet. The 22 nm FinFET's three fins give 3 × (2 × 34 + 8) = 228 nm; the 14 nm FinFET's two taller fins give 184 nm in a cell 84 nm wide, and the 10 nm FinFET's two give 198 nm in a cell 68 nm wide instead of 180. The 14 nm gate length is a drawing value, so its λ ratio is too.
- **Width per footprint**, for one nFET and one pFET side by side, rises from 0.6 (planar) to 1.3, 2.2 and 2.9 (the 22, 14 and 10 nm FinFETs) and 4.2 (nanosheet). The CFET stacks the pair, so the same sheets give 5.6, and the pair's area one gate pitch long halves from 4,400 to 2,200 nm² [@ryckaert2018]. The forksheet puts its n and p stacks 8 nm apart in one 78 nm cell. Its sheets are gated on three faces, so each transistor has 3 × (2 × 25 + 5) = 165 nm of width, and the pair takes 3,276 nm², 26 % less than the nanosheet pair. About 4 points of that come from its 42 nm gate pitch; imec’s study found about 20 % smaller cells [@imec_forksheet2019]. Backside power does not change the transistor, so its numbers match the nanosheet’s: its gain is in the wiring, which the table does not count.
- **Natural length.** λ = √(ε_Si t_Si EOT / 2ε_ox) measures how far the drain's field reaches into a thin body [@colinge2008]. The double-gate form is used for both fins and sheets, because a tall fin and a wide sheet are each controlled mainly across their thin dimension. The 22 nm fin gives λ = 3.3 nm and a gate 9.1 λ long; the nanosheet, with a 12 nm gate, is only 4.9 λ long, which is why the gate has to surround it.

## What the models leave out

- **Shapes.** Everything is a rectangular box: no tapered fins, rounded sheet corners or faceted epitaxy merging between fins.
- **Layers.** Work-function metals, the interface oxide under the high-k, liners, silicide, the oxide around the gate and all wiring above the contacts are left out.
- **Doping.** Wells, channel doping, extension and halo implants and the anneals are not drawn; only the heavily doped source and drain are.
- **Backside power in full.** Only one rail and one source contact are drawn. The carrier wafer, the backside wiring layers, the bonding interface and Intel’s PowerVia variant, which reaches the transistors through the front contacts, are left out.
- **The forksheet's wall.** The wall is drawn as a straight slab up to just above the sheets. Its real height, material and how the shared gate crosses it vary between proposals; every forksheet dimension except the gate pitch and the 8 nm spacing is a drawing value.
- **The CFET's lower contact.** Only the top pFET is contacted here. A real CFET reaches its lower nFET through a deep contact or from the back of the wafer, and every CFET dimension is illustrative.
- **Performance.** λ and W_eff are geometry. Drive current also depends on mobility, series resistance and the gate length actually printed.
