# 29 · Spot the defect

Every process step has a way of going wrong, and most of them depend on the layout: the narrowest trench, the widest sheet, the sparsest block. [Spot the defect](https://normansrule.github.io/transistor-foundry-expedition/fab.html#defects) on the Fab Journey page shows four features made together in one step. One of them failed. You find it, say why, and then see how a fab finds it and how it is fixed.

The pictures are not drawings of a defect someone chose. Each step is run through the model of its process theatre, and the model decides which feature fails. The page shuffles the four, so the defect moves each time, and a fix button reruns the step with better settings so you can see the defect go away.

## The seven defects

| Defect | Step and model | What decides it | The fix |
|---|---|---|---|
| A void in a trench | Deposition, `deposition.fill` | CVD (chemical vapour deposition) grows fastest at the mouth; the 20 nm trench, 80 nm deep, closes over a void while wider ones stay open [@plummer2000] | ALD (atomic layer deposition), which grows one self-limiting layer per cycle on every surface [@george2010] |
| An opening that did not clear | Etch, `etch.etch_opening` | Narrow openings etch more slowly, R₀ / (1 + 3 s AR / 4) [@coburn1989]; stopped 15 % after the wide one clears, the 20 nm opening keeps about 16 nm of film | 50 % over-etch on a stop layer the etch barely attacks |
| A block out of focus | Planarisation, `cmp.polish` | Pad pressure concentrates on sparse patterns [@preston1927; @stine1998]; a 15 % block ends about 160 nm below its neighbours, more than the 106 nm depth of focus k₂ λ / NA² at 193 nm and NA 1.35 [@levinson2019] | Dummy fill to 50 % density |
| SiGe left between nanosheets | Sheet release, `release.run` | Every stack is etched 25 nm from each side, which does not reach the middle of a 70 nm stack [@loubet2017] | Etch 40 nm from each side |
| A wire that voids | Interconnect, `electromigration` | At 2 MA/cm² and 105 °C the Blech length is about 19 µm [@blech1976]; a 60 µm line voids in about 3.6 years (stress model [@korhonen1993], Black’s law [@black1969]) | Lower the current density to 0.5 MA/cm², which makes the Blech length 77 µm |
| A particle short | Cleaning, `cleaning.killer_fraction` | Particle sizes follow 1/d³ above the inspection size [@stapper1983]; a 129 nm particle bridges a 100 nm space. A quarter of all particles above 50 nm are bigger than that space | Clean before each step [@kern1990]; with 200 nm spaces none of the four bridges |
| A blurred field | Lithography, `litho.aerial_image` | A field lifted 90 nm by a particle under the wafer falls outside the depth of focus; its image contrast drops from 93 % to 18 % and the lines are lost [@mack2007] | Clean the wafer chuck |

The sizes are chosen so that exactly one of four features fails, and the tests check that for every shuffle and that the fix leaves none.

## How it is built

The model is `sim/transistor_sim/physics/defects.py` with its JavaScript twin `site/js/physics/defects.js`. Neither has physics of its own: each case calls the existing model of that step with fixed settings and records which feature fails. The shuffle uses the same small random-number generator as the wafer-map yield simulation, so Python and JavaScript put the defect in the same place for the same seed; `tests/js_parity.mjs` compares the shuffles and every number of every case, with and without the fix.

The words (what the picture shows, three possible causes, why it happened, how a fab finds it and the fix) are in `data/defects.json`. You score one point for the right feature and one for the right cause, 14 in all. Your score is kept in your browser only.

## What the models leave out

- **Real pictures.** The pictures are drawn from the models’ numbers, not photographed. Real defects are found by inspection tools among millions of good features, and many need an electron microscope and a cross-section to see.
- **Teaching values.** Each model uses the teaching values of its process theatre for rates, sticking and reaction probabilities; those are marked est. in the theatres.
- **Chance.** The particle sizes are fixed points of the size distribution, not a random draw, and real stochastic failures are far rarer than one in four.
- **Service life.** The electromigration time is for a long line at a fixed current; real lines see changing current, heat from their neighbours and a spread of lifetimes.
- **Several causes at once.** Real defects often have more than one cause, and fabs find them by comparing maps from many wafers. Looking for a defect inside a real chip often means removing layers with hazardous chemistry; that is institution-only work and is not described here.
