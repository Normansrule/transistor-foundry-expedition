# 28 · Reading the node from the top of a chip

A node's name, such as "10 nm" or "N7", stopped being a physical length in the late 1990s. What still describes how small a process is can be measured from above: how often the gates, fins, metal lines and memory cells repeat. The [node-reading lab](https://normansrule.github.io/transistor-foundry-expedition/fab.html#nodelab) on the Fab Journey page lets you measure those pitches on a drawn top view of a chip and works out which node made it.

## The four measurements

- **Contacted gate pitch (CPP)**: gate to gate, with room for a contact between them. It sets how many transistors fit along a row.
- **Fin pitch**: fin to fin on a FinFET. A planar transistor has none.
- **Minimum metal pitch (MMP)**: line to line on the tightest wiring layer. CPP × MMP roughly sets the area of a standard logic cell.
- **SRAM bitcell area**: one high-density six-transistor memory cell, the smallest repeating cell on most chips.

## The seven nodes

| Node | Year | CPP (nm) | MMP (nm) | Fin pitch (nm) | SRAM (µm²) |
|---|---|---|---|---|---|
| Intel 45 nm | 2007 | 160 [@mistry2007] | 160 (est.) | — | 0.346 [@rwt_intel45] |
| Intel 32 nm | 2009 | 112.5 [@natarajan2008] | 112.5 [@natarajan2008] | — | 0.171 [@natarajan2008] |
| Intel 22 nm | 2011 | 90 [@cdrinfo_intel_density2017] | 80 [@cdrinfo_intel_density2017] | 60 [@auth2012] | 0.092 [@intel22_pres] |
| Intel 14 nm | 2014 | 70 [@natarajan2014] | 52 [@cdrinfo_intel_density2017] | 42 [@natarajan2014] | 0.0588 [@natarajan2014] |
| Intel 10 nm | 2018 | 54 [@auth2017] | 36 [@cdrinfo_intel_density2017] | 34 [@auth2017] | 0.0312 [@intel10_iedm2017] |
| TSMC N7 | 2018 | 57 [@wikichip_n7] | 40 [@wikichip_n7] | 30 [@wikichip_n7] | 0.027 [@wu2016_n7] |
| TSMC N5 | 2020 | 51 [@angstronomics_n5] | 28 [@angstronomics_n5] | 28 [@angstronomics_n5] | 0.021 [@wikichip_sram2022] |

The data live in `data/node_pitches.json`. Intel 10 nm and TSMC N7 show why names stopped meaning lengths: their pitches are within a few nanometres of each other.

## Measuring a pitch

Put mark A on the centre of one line and mark B on a line N pitches further on. The pitch is the distance between them divided by N. Each mark can be off by about one step e of the microscope (the lab has 400 steps across the picture), and the two errors add in quadrature, so the pitch is uncertain by

  σ = √2 · e / N.

Measuring across ten pitches is ten times better than measuring one. The SRAM bitcell is measured twice, across and down, and its area is the product.

## Matching a node

The lab compares what you measured with every node by the root-mean-square of ln(measured ÷ published) over the quantities you measured, and shows the three best as a typical percentage off. A logarithm treats 10 % too big and 10 % too small alike at every scale. One pitch can leave two nodes close; gate pitch and metal pitch together separate Intel 10 nm from N7, and the tests check this.

The model is `sim/transistor_sim/physics/nodelab.py` with its JavaScript twin `site/js/physics/nodelab.js`; `tests/js_parity.mjs` compares the pitch arithmetic, every bitcell, every ranking and every drawn line.

## What the models leave out

- **Real pictures.** The views are drawn. Real micrographs show rounded line ends, gate cuts, contacts, dummy fins and many cell types, and you must find a regular stretch first.
- **Shapes.** Line widths and the bitcell's shape are drawing choices. The bitcell is drawn two gate pitches wide, with its height from the published area.
- **One pitch per node.** Fast libraries use a wider gate pitch than dense ones, and each metal layer has its own pitch. The table gives the tightest published figures.
- **Disagreements.** The 45 nm metal pitch is an estimate. Write-ups disagree on N5's metal pitch (28 nm from TSMC's stated 30 % shrink from N7, 36 nm in others); the lab uses 28 nm.
- **Getting at the layers.** Exposing these layers on a real chip means removing the ones above with hazardous chemistry. That is institution-only work and is not described here.
