# Changelog

All notable changes to Transistor Foundry Expedition (formerly Transistor Odyssey). Versions follow the `version` field in [CITATION.cff](CITATION.cff); `scripts/setup_ubuntu.sh` uses the newest entry as the commit message.

## v1.21 — Every route runs through

- **No more holds on the three routes.** Lithography now needs a clean wafer rather than a thermal oxide, so the modern gate-all-around route no longer stops at its first lithography step. Probing needs either metal step (a new `requires_any` in `data/fab_steps.json`), and Hoerni's planar step follows the predeposition. A test walks all three routes.
- **Evaporated aluminium leads** (`evap_al`), a new seed step on the 1959 route: aluminium over the oxide, touching the junction through a contact window, as in Noyce's patent. In the Virtual Fab it opens the window and lays the metal.
- **Implanted junctions spread sideways.** The Virtual Fab draws an implanted junction reaching under the mask edge by the lateral straggle, taken equal to the vertical one: ½N_peak erfc(y/√2σ) meets the substrate at about 45 nm for the default phosphorus implant, 49 nm after the anneal.
- **Route buttons.** The Virtual Fab loads the teaching, modern or 1959 route.
- 3 new tests (322 in total); parity covers the new route and the implant spread.

## v1.20 — The Virtual Fab follows your theatres

- **Your own settings in the Virtual Fab.** A new switch, Theatre defaults or My theatre settings, runs the cross-section with the settings you chose in the process theatres on the same page: oxidation ambient, temperature, time and orientation; implant ion, energy and dose; the diffusion recipe; the anneal; etch selectivity and over-etch; CMP pressure, speed and time; the damascene metal and line; the nanosheet release; and the planar drive-in. Settings stay on the page and are not stored.
- **Junction type.** A dopant of the wafer's own type (boron into the p-type wafer) now makes no junction in the Virtual Fab, and the row says so with xⱼ 0.
- **Lateral diffusion.** A diffused junction is drawn spreading under the mask edge by about 0.8 xⱼ, and the cross-section label reports it.
- **Probing needs only the metal.** Probe, dice and bond now requires the metal film instead of the damascene step, so the teaching route runs from start to finish without a hold.
- `vfab.py` and its JavaScript twin take the settings as an optional argument; 52 new parity checks over three routes with changed settings. 4 new tests (319 in total).

## v1.19 — Wafer cleaning and a computed Virtual Fab

- **Cleaning theatre** on the Fab Journey (`fab.html#proc-cleaning`), area 02, safety tier 3: what a clean removes and what is left costs, with no chemistry. Particles left after each pass, the killer share of a 1/d³ size distribution, the defect density and die yield they cost, and the electron lifetime and diffusion length that interstitial iron leaves. Four failure modes (a weak particle clean, no particle clean, iron, lines half as wide). A test keeps chemical names and recipe units out of it.
- **Computed Virtual Fab.** Each step of your traveler that passes the order check now runs the model behind its process theatre at that theatre's default settings, and the cross-section is computed for two columns, the field under the mask and the window: Deal–Grove oxide that consumes silicon, a lithography window, etch with over-etch recess, implant masking by the layers above, diffusion masked by oxide, the anneal, a sputtered metal, CMP stopping on oxide, a damascene copper line and Hoerni's planar junction. Each row shows what its step computed.
- **Two new models with JavaScript twins and parity checks:** `cleaning.py` and `vfab.py` (built on the oxidation, implant, diffusion, anneal, etch, CMP, damascene, release and planar models).
- 5 new references (361 in total: Kern and Puotinen, Kern, Stapper 1983, Istratov et al., Macdonald et al.), 10 new tests (315 in total).

## v1.18 — Nanosheet release and the planar process

- **Release theatre** on the Fab Journey (`fab.html#proc-release`), area 09: the silicon-germanium layers between three stacked silicon nanosheets etched out sideways until the fronts meet. The finite selectivity thins every exposed silicon face, most at the sheet ends; the theatre computes the thickness profile across the sheet, whether the sheets are free and the effective width against the ideal. Three failure modes (low selectivity, too little over-etch, a 60 nm sheet).
- **Planar theatre** (`fab.html#proc-planar`), area 13: Hoerni's 1959 process. Oxide mask, window, boron predeposition and drive-in under the oxide (on the diffusion model), then reverse bias. Flat-junction breakdown from Sze and Gibbons and the lower breakdown of the curved window edge, plotted against junction depth. Three failure modes (a short drive-in, a heavily doped substrate, a long hot drive-in).
- **Two new models with JavaScript twins and parity checks:** `release.py` and `planar.py` (built on `diffusion.py`).
- The seed fab steps for the gate-all-around release and the planar process now link to their theatres.
- 2 new references (356 in total: Sze and Gibbons on breakdown voltages and on junction curvature), 6 new tests (305 in total).

## v1.17 — Copper wiring and wafer probe

- **Damascene theatre** on the Fab Journey (`fab.html#proc-damascene`), area 10: trench, barrier, seed, bottom-up plating and polish, computed for copper, cobalt, ruthenium or tungsten. Core and whole-trench resistivity against width (surface and grain-boundary scattering), the barrier's dead area, resistance and capacitance per micrometre and the wire's RC delay. Four failure modes (halve the width, a thick barrier, barrier-free ruthenium at 10 nm, a millimetre-long line).
- **Probe theatre** (`fab.html#proc-probe`), area 11: a Monte Carlo wafer map probed die by die, then diced, picked and bonded. Yield on this wafer and from the negative-binomial model, cost per good die at a reported leading-edge wafer price, and the Williams–Brown defect level against test fault coverage. Three failure modes (a die twice as wide, a dirty process, 90 % coverage).
- **Two new models with JavaScript twins and parity checks:** `damascene.py` (built on `interconnect.py`) and `probe.py` (built on `yieldcost.py`).
- 3 new references (354 in total: Williams and Brown, Kaanta et al., Edelstein et al.), 6 new tests (299 in total). README counts brought up to date.

## v1.16 — Step-by-step process manuals

- **Four illustrated process manuals** in the style of a building-brick instruction book, one picture per step with the new part outlined, a parts list and a check at the end of each step: **4B Make the photomask** (8 steps, blank to pellicle, plus mask types from contact masks to EUV reticles), **4A Print a pattern with light** (10 steps, prime to hard bake, plus EUV and the light-source generations), **5 Carve the pattern into the film** (9 steps of plasma etch, plus wet against plasma etch with the measured etch bias of the teaching-cleanroom run) and **8 Make the surface flat again** (spin-on glass, then chemical mechanical polishing with Preston's law, pattern density and dummy fill).
- **Three depths per step:** Builder, Engineer (an operation specification: tool, purpose, cited parameter ranges, control and what to do when out of control) and Process engineer (physics, equation and a link to the matching simulator). Lithography steps carry the teaching-cleanroom run's recipe. Steps can be stamped DONE, and progress is remembered.
- **New page, [`manuals.html`](site/manuals.html)**, in the main navigation: a shelf of manuals, three routes (teaching CMOS, modern gate-all-around, historical), the safety tiers and the sources. Each manual is also written as GitHub Markdown in `docs/manuals/` with SVG step pictures, and summarised in this README.
- **PDFs:** each manual prints to its own A4 layout with Save as PDF; `node scripts/qa/print_manuals.mjs` writes all of them to `dist/manuals/` for a release (they are kept out of `site/` to stay within the size budget).
- **Safety:** gas supply, chrome etchant, developer and wet etchants are named only and marked institution-only; tier 3 steps carry no numbers, and a test enforces it.
- Generated from `data/manuals.json` by `scripts/build_manuals.py` (`--check` mode in the tests). 11 new references (351 in total), 8 new tests (293 in total).

## v1.15 — Crystal growth, the anneal and no course names

- **Czochralski theatre** on the Fab Journey (`fab.html#proc-czochralski`), area 01: a crystal pulled from a doped melt, with the Scheil equation for dopant segregation along the ingot, resistivity through Caughey–Thomas mobility, a customer tolerance band and the usable fraction of the ingot. Four dopants, three failure modes (phosphorus instead of boron, a tight tolerance, antimony for heavily doped substrates).
- **Anneal theatre** (`fab.html#proc-anneal`): furnace, rapid thermal and spike anneals on one thermal-budget model, Dt = ∫D(T(t))dt over ramp, hold and cool, feeding the implant Gaussian. Three failure modes (furnace instead of lamps, a slow ramp, a minute-long hold).
- **Two new models with JavaScript twins and parity checks:** `czochralski.py` and `anneal.py`.
- **Failure demos now start from the default settings**, so each one's description matches what the simulator shows, in every process theatre.
- **No course names.** The real cleanroom run is credited to its makers and described as a university teaching-cleanroom run; course codes, section and group labels, course URLs and instructor names are gone from the site, data, docs and references. The course-material references were renamed (`cleanroom_run_fab2024`, `cleanroom_run_char2024`, `teaching_process_manual2023`, `teaching_char_manual2024`, `norman2024_nmos_design`); two course-slide references were dropped. A new test fails if a course code comes back.
- 8 new references (340 in total: Czochralski, Scheil, Teal and Little, Dash, Burton–Prim–Slichter, Trumbore, Fair, Eaglesham et al.), 6 new tests (285 in total).

## v1.14 — A real cleanroom run and the diffusion theatre

- **Process Lab 05, "A real cleanroom run"** (`process.html#labrun`): one university teaching-cleanroom NMOS wafer from 2024 (Ronan Loberg and Aleksander Norman) set against the models. A ten-step traveler with each recipe and measured result (wet etches and the dopant source stay institution-only), and four live charts: Deal–Grove against five measured oxides (this run lands within 6 %, earlier runs scatter by up to 18 %, and √(Bt) overshoots by 30–60 %), lithography against wet-etch bias with an isotropic-etch model and over-etch slider, measured thresholds against the ideal long-channel value with the oxide charge that explains them, and oxide capacitors against a parallel-mode meter model with series resistance and stray capacitance. Five guided experiments and "What the models leave out".
- **Diffusion theatre** on the Fab Journey (`fab.html#proc-diffusion`), the seventh process theatre: constant-source predeposition (erfc) and fixed-dose drive-in (Gaussian) through an oxide window, junction depth against the background, sheet resistance from Caughey–Thomas mobility, three failure modes, and a new `diffuse_predep` step (tier 3) on the teaching and historical routes.
- **Two new models with JavaScript twins and parity checks:** `labrun.py` (chained oxidation, parabolic shortcut, effective oxidant pressure, resistivity to doping, ideal and meter-model capacitance, threshold and oxide charge, isotropic etch bias, sheet resistance) and `diffusion.py`.
- **Data:** `data/lab_runs.json` (the run, cited); teaching-track recipe ranges in `data/fab_steps.json` for oxidation, lithography and drive-in now cite the run and the process manual; the oxidation theatre's timeline gains the 2024 run.
- Chapter 25, 11 new references (the run records, the process and characterization manuals, a 25 nm MOSFET design study, Jaeger, and three additive-microfabrication sources), 17 new tests (279 in total).

## v1.13 — Five more process theatres: oxidation, implant, etch, deposition and CMP

- **Five new process theatres** on the Fab Journey (`fab.html#proc`), each with stages at three depths, live controls, a cross-section computed from a model, readouts, equations, failure modes that load into the controls, tools, a cited timeline, metrology and "What the models leave out": thermal oxidation (Deal–Grove), ion implantation (LSS range statistics), plasma etch, deposition and chemical-mechanical polishing. The fab map's area cards now open the matching theatre.
- **Three new models** with JavaScript twins and parity checks: `etch.py` (aspect-ratio-dependent etching from Coburn and Winters' conductance model, anisotropic undercut, mask erosion, endpoint and over-etch), `deposition.py` (Knudsen diffusion-reaction down a trench re-solved as it narrows, PVD, CVD and self-limiting ALD, void and seam detection) and `cmp.py` (Preston's law with pattern-density contact, three densities polished together).
- Chapter 24 gains "The process theatres". Four new references (323 in total), 12 new tests (262 in total).

## v1.12 — Lot Traveler redesign and the Fab Journey

- **Lot Traveler look across the whole site** (the concept picked in v1.11): a lot strip under the navigation that tracks your step through each page, numbered section steps, PASS stamps that land as you finish a section, perforated traveler sheets and a closing "lot complete" stamp. Headings now use Space Grotesk (vendored, SIL Open Font License 1.1); Oxanium stays vendored as the fallback. Shared in `site/css/traveler.css` and `site/js/traveler.js`, loaded by every page.
- **New page, [`fab.html`](site/fab.html): the Fab Journey.** A hero lens that dives through seven scopes (planet, fab, tool, wafer, die, transistor, atoms), a map of the 13 process areas for three routes, a route card in dependency order, and a Virtual Fab that stamps each step OK or HOLD against the steps it requires, with a schematic stack and a yield estimate from the Process Lab model.
- **Lithography theatre**, the first process theatre: seven stages on a scrubber with Beginner, Engineer and Process engineer text, a 2D section and a 3D isometric view computed from the Fourier-optics aerial image, a dose threshold and photon shot noise in 2 nm cells, live readouts (k₁, contrast, CD, 3σ edge roughness, λ/2NA, depth of focus, photons per nm²), four failure modes, the light-source table, a cited timeline, metrology and "What the models leave out".
- **Gate to silicon:** "this is a NAND, and this is what it looks like in silicon". Nine gates (inverter, NAND2/3, NOR2/3, AOI21, OAI21, AOI22, XOR2) shown six ways at once: logic symbol, truth table with the Boolean expression, transistor schematic with the conducting path, mask layout with numbered, cited dimensions, a 3D view of the cell whose layers can be pulled apart, and a cut-line cross-section (silicide, spacers, extensions, contacts, metal 1 and metal-2 straps), in 180 nm planar (Mead–Conway λ rules), 5 nm FinFET and 2 nm-class nanosheet form. The new `gatecells.py` finds a finger order that is an Euler path through both transistor networks, so neighbouring devices share diffusion, and writes `data/gate_cells.json` plus GDS files for NAND2, NOR2, AOI21 and XOR2; which transistors conduct comes from the Circuit Lab's logic model. Two blocks get the same six views: the 28-transistor mirror full adder, four stages on separate diffusion strips joined by metal-2 tracks, and the 6T SRAM cell with its cell-ratio sizing, word line and bit lines (`gateblocks.py`, GDS for both). A seventh view tiles them: a 4-bit ripple-carry adder whose carries hop between cells on metal 3 and light up as they ripple, and a 4 × 4 SRAM array with mirrored rows where you write bits, read a row and watch the bit lines fall.
- **More colour and detail:** an accent colour per process area on the fab map, a gradient headline, and richer theatre renderings (projection lens and light cone, hot-plate and developer effects, textured silicon, a legend in 3D).
- **Model:** `half_pitch`, `depth_of_focus`, `photons_per_nm2` and `shot_noise` in `litho.py` with JavaScript twins and parity checks.
- `data/theatres.json` holds the theatre content; `tests/test_journey.py` checks it is cited, safe and consistent with the simulator presets. Chapter 24, three new references (319 in total), 30 new tests (250 in total).

## v1.11 — Rename to Transistor Foundry Expedition and QA tooling

- Renamed from Transistor Odyssey to **Transistor Foundry Expedition**; the repository, Pages address and release zip use the slug `transistor-foundry-expedition`. `scripts/setup_ubuntu.sh` renames the old repository with `gh repo rename` when it finds it, and `docs/moved/` holds a forwarding page for the old address.
- `tests/test_rename.py` fails if the old slug appears anywhere except this changelog and the "formerly" lines.
- **QA tooling:** `make qa` serves the site and runs Playwright at 1440 and 390 px: tiled screenshots, horizontal overflow, a nav check that every page is reachable, a click-through of every nav link, unlabelled canvases and controls, and broken local links. A new CI job runs it and uploads the report.
- **GIF recorder:** `make gifs` re-records the README animations from each page's record mode and encodes them with ffmpeg and gifsicle until each fits its budget; all 25 are now under 1 MB (13.1 MB in total, from 17.2 MB). `tests/test_budget.py` checks the per-GIF limit, folder ceilings and the zip size.
- **Fixes:** the index timeline no longer overflows at 1440 px (it had been hidden by `overflow-x: hidden` on the body), the marquee is clipped, the Device Atlas nav no longer scrolls sideways, every page links to every other page at 390 px through a generated menu (`scripts/build_nav.py`), and 25 canvases gained an `aria-label`.
- **Planning for the process theatres:** `data/fab_steps.json` (13 seed steps, three tracks, safety tiers), a photo candidate list awaiting a licence check (`scripts/check_photo_licenses.py`), the process coverage plan and three visual concepts in `docs/concepts/`.
- `scripts/make_zip.py` builds `transistor-foundry-expedition-v1.11.zip`; the banner is re-rendered with Playwright for Node; 38 new tests (220 in total).

## v1.10 — Analog & RF Lab: the transistor as an amplifier

- New page, [`analog.html`](site/analog.html), opening on the radio spectrum from 10 Hz to 2 THz drawn as a chirp, with the bands from audio to terahertz and the record f_max of CMOS, GaN, SiGe and InP.
- **Common-source amplifier:** exact large-signal solution against the load line, an animated schematic and oscilloscope, harmonics from a discrete Fourier transform, transfer curve and distortion versus amplitude for five generations.
- **Gain versus scaling:** g_m/I_D against current density and intrinsic gain g_m·r_o for six generations, on an animated output-characteristics view with the g_ds tangent.
- **Frequency response:** two-pole model with the Miller-multiplied gate–drain capacitance and the right-half-plane zero, a phasor read-out, Bode plot, and room-temperature speed records beside the model's peak f_T by CMOS generation.
- **Noise:** thermal (4kTγ/g_m) and flicker (K_f/C_ox·W·L·f) noise, the corner frequency, integrated rms noise and signal-to-noise ratio, with a live noisy trace.
- Python model `analog.py` with a JavaScript twin; 8 new tests (182 in total) and new parity checks.
- Three new charts (39 in total), five new animations (25 in total), Chapter 23, 14 new references (316 in total), `data/rf_records.json`, seven glossary terms, and a shorter navigation bar on narrow desktop screens.

## v1.9 — Process Lab: the physics of making chips

- New page, [`process.html`](site/process.html), opening on an animated cross-section built step by step (oxidation, lithography, implant, anneal, gate, contacts, copper).
- **Thermal oxidation:** Deal–Grove model for dry and wet ambients, (100) and (111) orientation, and pressure; growth-regime meter and Arrhenius plot.
- **Implant and diffuse:** LSS ranges from ZBL nuclear and Lindhard electronic stopping for B, P, As and Sb; Gaussian profiles, anneal broadening, junction depth and sheet resistance.
- **Yield and cost:** Monte Carlo wafer maps with clustered defects; Poisson, Murphy and negative-binomial yield; and the CSET cost of the same chip from 90 nm to 5 nm, with N3 and N2 wafer prices.
- **Electromigration:** Korhonen stress solver with blocked ends, the Blech length, and Black's law (n = 2) emerging from the simulation.
- Python models `oxidation.py`, `implant.py`, `yieldcost.py` and `electromigration.py` with JavaScript twins; 17 new tests (174 in total) and new parity checks, including a shared random-number generator.
- Three new charts (36 in total), four new animations (20 in total), Chapter 22, 20 new references (302 in total) and `data/fab_economics.json`.

## v1.8 — Circuit Lab: from transistor to computer

- New page, [`circuits.html`](site/circuits.html), with a powers-of-ten zoom from a 300 mm wafer to a silicon–silicon bond (ten procedural scenes, real dimensions for a 2 nm-class process).
- **Gate builder:** ten static CMOS gates built from series/parallel expressions, a switch-level simulator (after Bryant 1984), truth tables, and logical effort derived from the netlists.
- **8-bit adder:** event-driven ripple-carry simulation with transport delays and glitch counting, compared with a Kogge–Stone parallel-prefix adder.
- **Six-transistor SRAM:** butterfly curves, Seevinck static noise margins for hold and read, read disturb, threshold mismatch, bitline timing, and published bitcell areas from 90 nm to N2.
- **Floating-gate flash:** Fowler–Nordheim programming, incremental step pulse programming (ISPP), SLC to QLC threshold distributions, a tunnel-oxide band diagram, and 3D NAND layer counts to 321.
- Python models `logic.py`, `sram.py` and `flash.py` with JavaScript twins; 25 new tests (157 in total) and new parity checks.
- Three new charts (33 in total), five new animations (16 in total), Chapter 21, 20 new references (282 in total) and `data/memory.json`.
- The release zip ships without `.git`; the setup script now rebuilds on top of GitHub's history, so the history stays linear.

## v1.7 — Physics Lab Part VI: from transistor to circuit
- CMOS inverter, ballistic MOSFET and interconnect labs (15 labs in total), with Python twins and tests.

## v1.6 — Junction solver, device comparison, quiz and a visual README
- 1D Poisson heterojunction solver, side-by-side device comparison, band-diagram quiz, and 11 README animations.

## v1.5 — Device Atlas
- 19 animated transistors with live band diagrams along the current path and through the gate.

## v1.4 — Physics Lab: twelve labs in five parts

## v1.3 — Physics Lab: seven interactive semiconductor simulations

## v1.2 — Fab stepper (14-step GAA process flow) and packaging/3D chapter

## v1.1 — Diamond deep dive, niche atlas, steep-slope devices and Ubuntu setup script

## v1.0 — History, simulations and interactive site
