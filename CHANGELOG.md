# Changelog

All notable changes to Transistor Foundry Expedition (formerly Transistor Odyssey). Versions follow the `version` field in [CITATION.cff](CITATION.cff); `scripts/setup_ubuntu.sh` uses the newest entry as the commit message.

## v1.30 — Spot the defect

- **Spot the defect on the Fab Journey page (`fab.html#defects`), the last showcase on the list.** Seven challenges, each showing four features made together in one step. One failed, and the step’s own process model decided which:
  - a 20 nm trench that closes over a void in CVD (deposition model);
  - a 20 nm opening that does not clear at 15 % over-etch (aspect-ratio-dependent etching);
  - a 15 % density block polished 160 nm low, beyond the 106 nm depth of focus (CMP and lithography models);
  - a 70 nm nanosheet stack that keeps a 20 nm SiGe core (release model);
  - a 60 µm copper line longer than its 19 µm Blech length, voiding in about 3.6 years (electromigration model);
  - a 129 nm particle bridging a 100 nm space (the cleaning model’s 1/d³ sizes);
  - a field lifted 90 nm out of focus, contrast 93 % → 18 % (aerial-image model).
- Pick the feature (click or the buttons) and one of three causes, then check: 2 points each, 14 in all, kept only in your browser. The answer shows why it happened, the engineer’s equation, how a fab finds it, the fix and the model’s own numbers. **Apply the fix** reruns the step with better settings (ALD, more over-etch, dummy fill, a longer release, lower current, wider spaces, a clean chuck) and the defect disappears. `?defect=<id>` opens a challenge.
- **New model `physics/defects.py` with its twin `js/physics/defects.js`**, built only from the existing process models. The parity test compares the shuffles and every number of all fourteen runs. New data `data/defects.json`, Chapter 29, a README section and screenshot. No new references (372). 13 new tests (441 in total).

## v1.29 — Read the node, and take the site offline

- **A node-reading lab on the Fab Journey page (`fab.html#nodelab`, roadmap item 8).** A drawn top view of a chip at its real pitches, with two measuring marks on sliders (or a click on the picture). Measure the gate pitch, fin pitch, metal pitch and an SRAM bitcell's width and height; the pitch is the distance over N pitches, ± √2·e/N. The lab ranks seven nodes by the root-mean-square log error.
  - **Mystery chip:** a random node at a random field of view, revealed when you are ready. **Pick a node:** explore any of them.
  - **A cited pitch table** for Intel 45, 32, 22, 14 and 10 nm and TSMC N7 and N5: gate, metal and fin pitch, SRAM bitcell and CPP × MMP. Only the 45 nm metal pitch is an estimate, and it says so.
- **New data `data/node_pitches.json` and new model `physics/nodelab.py` with its twin `js/physics/nodelab.js`.** The parity test checks the arithmetic, every bitcell, five rankings and every drawn line.
- **The site works offline (roadmap item 7, PWA half).** A web app manifest, app icons and a service worker that precaches all 270-odd site files, with a cache name tied to the version and to the files' contents. Photos from Wikimedia Commons are cached as you see them (the last 80). `scripts/build_pwa.py` writes the manifest, the worker and the head tags; `make pwa` and `make icons` rebuild them. The worker is not registered in automated browsers, so QA always sees the live files.
- **A 14 nm FinFET in the layer builder.** Fins 42 nm tall at 42 nm pitch and a 70 nm gate pitch (Natarajan 2014); fin width, gate length and heights are labelled est. The tour and the compare table now have six builds.
- Chapter 28 explains the lab. Chapter 27 and the README cover the 14 nm build. 3 new references (372): CDRinfo on Intel's 22, 14 and 10 nm pitches, WikiChip on N7, and Angstronomics on N5. New tests for the lab and the offline app.

## v1.28 — Build a transistor, one layer at a time

- **A 3D layer builder on the Fab Journey page (roadmap item 6).** Five transistors built step by step and drawn to scale in nanometres: a 45 nm planar high-k metal gate device (Mistry 2007), the 22 nm FinFET (fins 8 nm wide, 34 nm tall at 60 nm pitch; Auth 2012), the 10 nm FinFET (7 nm wide, 46 nm tall at 34 nm pitch; Auth 2017), a gate-all-around nanosheet at 44 nm gate pitch and 12 nm gate length (Loubet 2017) and a complementary FET with the pFET stacked on the nFET (Ryckaert 2018, illustrative). Every other dimension is labelled est.
  - 8 to 14 steps each: wafer, superlattice, fins, trench isolation, dummy gate, spacers, inner spacers, source and drain (implanted, regrown, or grown twice with isolation between for the CFET), dummy-gate removal, sheet release, high-k metal gate and contacts. New material drops into place at each step.
  - Cut the device open along the channel or through the gate; scrub with the slider, the arrows or the step list.
  - **Tour:** walks through all five builds, step by step, with the explanation for each.
  - **Compare mode:** any two finished devices side by side at one scale.
  - **Computed table:** gate faces, effective width, width per footprint for an n plus p pair (0.6 planar → 5.6 CFET), pair area, the natural length λ of each thin body and gate length ÷ λ (Colinge 2008).
- **New model `physics/builder.py` with its twin `js/physics/builder.js`.** The geometry is non-overlapping boxes made by rectangle subtraction, each with the step that makes and removes it. The parity test compares all 326 boxes and every metric.
- Chapter 27 explains the builds, the geometry and what the model leaves out. The README chapter list now includes chapters 26 and 27. No new references (369). 22 new tests (405 in total).

## v1.27 — Experiments you can run

- **A new page, Experiments (`experiments.html`), with fourteen tiered experiments (roadmap item 5).** Each stands in for a real process step and links to its theatre, lab or manual:
  - Tier 0: sand on a paper wafer (Poisson yield, Murphy 1964), Moore’s law from the site’s real chip list, a foil-and-paper capacitor, and pencil resistors with the transfer length method (Berger 1972).
  - Tier 1: dye diffusing into gelatin (depth² against time), a CD’s track pitch read with a Class 2 laser pointer (1.6 µm, ECMA-130), a diode’s current–voltage curve (ideality factor), LED colours and Planck’s constant, a MOSFET’s threshold from √I_D, a diode thermometer, printing with sunlight (proximity printing, W ≈ √(λg)), and growing a crystal from a seed.
  - Tier 2: a four-point probe in a teaching lab (R_s = (π/ln 2)·V/I, Smits 1958). Tier 3: an etch-rate test series, conceptual and with no recipe.
- **A fitter in every experiment.** Paste, type or upload readings as CSV. Each is turned into a straight line and fitted by least squares, with residuals, standard errors carried through to every result, and the cited value beside it. "Load model data" fills in labelled model data; Moore’s law uses the real chips and gives 2.15 ± 0.05 years, the same as the History chart. A template CSV downloads for each experiment.
- **New model `physics/fitting.py` with its twin `js/physics/fitting.js`.** A seeded generator makes the same model data in both languages, so the parity test checks every row and every fitted value.
- Four experiments compare with the 2024 teaching-cleanroom run: diode turn-on, transistor thresholds, the diffused resistor’s sheet resistance and the substrate.
- **Navigation:** nine pages now. The bar may run wider than the content column and folds into the menu below 1240 px.
- The site budget is raised from 5.2 to 5.3 MB for the new page.
- Chapter 26 explains the experiments, the fit and the safety tiers. 6 new references (369): Schroder, Berger, Smits, ECMA-130, ECMA-267 and IEC 60825-1. 38 new tests (383 in total) and 219 new parity checks.

## v1.26 — The last two manuals, and all sixteen as one book

- **Two more process manuals, making sixteen; every roadmap area now has one:**
  - **12 Other families: a transistor on glass.** An oxide thin-film transistor built upside down on a glass sheet: bottom gate, gate insulator, a sputtered amorphous IGZO channel, source and drain, passivation with a mild bake, and the transfer curve. It shows why display backplanes need no crystal and no furnace (Weimer 1962, Nomura 2004, and the bendable IGZO processor of Ozer 2024).
  - **13 History: a planar transistor the 1959 way.** Masking oxide, window, a staff-run predeposition, drive-in under the oxide edge, aluminium lead and a breakdown test. Its numbers come from the planar theatre’s model: one hour at 1100 °C on 10¹⁵ cm⁻³ gives a 2.05 µm junction that breaks down near 347 V where it is flat but only about 150 V at its curved edge (Sze and Gibbons). A new test keeps the manual and the model in step.
  - The historical route now goes through Manual 13.
- **All sixteen manuals as one printable book.** `scripts/qa/print_manuals.mjs` now also writes `dist/manuals/process-manuals-book.pdf`: a cover with contents, then every manual in route order, each starting a new sheet (125 pages).
- The site budget is raised from 5.0 to 5.2 MB for the two new manuals. 3 new tests (345 in total). No new references (363).

## v1.25 — The thermal budget, and the first and ninth manuals

- **Thermal budget in the Virtual Fab.** Every hot step after doping now keeps moving the junctions already made. Each doped column keeps a Gaussian equivalent of its profile (same dose, peak and junction depth). A later oxidation, diffusion or anneal adds 2·D(T)·t to its variance, using the intrinsic diffusivity of that column’s dopant (Plummer, Deal and Griffin), and oxidation also moves the surface down into the silicon. Examples:
  - An hour of dry oxidation at 1000 °C after the phosphorus diffusion pushes the window junction about 120 nm deeper.
  - The same hour after a 20 keV implant takes it from 90 to 540 nm.
  - A cold oxidation only eats into the junction.
  - Each traveler row now says how far its heat moved the earlier junction, and a new readout, "Junction moved by later heat", totals it.
  - Routes that were already in order barely change: the teaching route's spike anneal nudges its diffused junction by 0.24 nm.
- **Two more process manuals, making fourteen:**
  - **1 Wafer:** melt and dope, seed and Dash neck, pull the body with Scheil segregation, grind and notch, slice and polish, sort by resistivity.
  - **9 Device modules:** trench isolation, high-k metal gate, fins, a silicon–germanium stack, release and gate wrap, measure. Epitaxy and the release etch are institution-only.
  - Every route now starts at Manual 1, and the modern route goes through Manual 9.
- 4 new tests (342 in total), 73 new parity checks. The thermal-budget routes and the per-step push are checked against Python.

## v1.24 — Oxidation speeds the drive-in, and other process families

- **Oxidation-enhanced and -retarded diffusion.** A growing oxide injects silicon interstitials into the silicon below it (Hu 1974). Both diffusion models (`diffusion.run` and `run_cd`, with their twins) take an interstitial excess S = C_I/C_I* for the drive-in and scale the diffusivity by f_I·S + (1 − f_I)/S (Plummer, Deal and Griffin, ch. 7), with f_I 0.9 for boron, 0.95 for phosphorus, 0.4 for arsenic and 0.02 for antimony. So boron and phosphorus speed up and antimony slows down. The default, S = 1, changes nothing.
- **The diffusion theatre** gains a drive-in ambient slider (interstitial excess 1 to 10) and arsenic and antimony as dopants, so retarded diffusion can be seen.
- **The 2024 run’s recipe** assumes S = 3 while the drive-in grows its oxide; this is an assumption, not a measurement, and is labelled as one. It deepens the computed junction from about 0.9 to 1.3 µm but moves the source and drain sheet resistance only from 13.7 to 13.2 Ω/sq, because the dose was fixed in the predeposition. The four-fold gap to the measured 3.1 Ω/sq therefore comes from the unrecorded predeposition, not the drive-in.
- **Two more process manuals**, making twelve: 7B Thin-film deposition (CVD and ALD: load, staff-run precursors, CVD step coverage, ALD cycles, a high-k gate stack, measuring coverage) and 10 Damascene copper (insulator, trench, barrier and seed, staff-run plating, polish, measure). Metal becomes 7A, and the modern route lists both new manuals. A step can now link to another manual.
- **Other process families** (roadmap area 12): a new section on the Fab Journey compares eight families. They are 1959 planar, the 2024 teaching NMOS run, FinFET and gate-all-around, FD-SOI, SiGe BiCMOS, SiC power, GaN HEMT and IGZO thin-film transistors. Each is described by what it starts from, its defining step, its hottest step, its masks and what it makes. Every cell is cited, and a dash marks values with no public source (`data/families.json`).
- The site budget is raised from 4.8 to 5.0 MB. 1 new reference (Hu 1974, 363 in total), 8 new tests (338 in total), 36 new parity checks.

## v1.23 — Heavy doping diffuses faster

- **Concentration-dependent diffusivity.** A new model, `diffusion.run_cd` with its JavaScript twin, solves the diffusion equation with D rising with doping through charged vacancies, D = D⁰ + D⁻(n/nᵢ) + D⁼(n/nᵢ)² for phosphorus (D⁻ for arsenic and antimony, D⁺ for boron), after Fair and Plummer, Deal and Griffin, by backward Euler on a uniform grid. At 3×10²⁰ cm⁻³ and 1050 °C phosphorus diffuses about 24 times faster at the surface than at low doping.
- **The diffusion theatre** has a new Diffusivity switch, Intrinsic or Rises with doping. The second plots the solved profile beside the textbook one and adds its dose, junction and sheet resistance to the readouts.
- **The 2024 run’s recipe in the Virtual Fab now uses it.** The computed source and drain sheet resistance falls from 30.8 to 13.7 Ω/sq against the measured 3.1, so the gap shrinks from ten-fold to about four-fold. The rest hangs on the run’s predeposition time and surface concentration, which were not recorded: 5×10²⁰ cm⁻³ at the surface would give 5.4 Ω/sq. Theatre defaults are unchanged.
- **Two more process manuals**, so there are ten: 3 Oxidation (load, ramp, dry gate oxide, steam field oxide, anneal, measure, with the run’s recipes and thicknesses) and 6B Implantation (mask, beam, tilted implant, damage, anneal, measure; the ion source is institution-only). Diffusion becomes 6A.
- 1 new reference (Fair 1981, 362 in total), 4 new tests (330 in total), 36 new parity checks.

## v1.22 — Computed beside measured, and four more manuals

- **The 2024 cleanroom run in the Virtual Fab.** A fourth route button loads the real four-mask NMOS run as a traveler (field oxidation, active-area mask and etch, gate oxidation, gate mask and etch, diffusion with drive-in, contact mask and etch, aluminium, metal mask, probe), and a third setting, "The 2024 run’s recipe", runs it with the run’s own furnace recipes: dry–wet–dry field oxide at 1000 °C, dry gate oxide at 1100 °C, and a 37-minute drive-in at 1050 °C that also grows the intermediate oxide.
- **Computed here, measured in a real run.** A table under the cross-section puts seven computed numbers beside the run’s measurements and updates with every change to the traveler: field oxide 517 against 548 nm, gate oxide 111 against 114 nm, drive-in oxide 62.0 against 62.9 nm, source and drain sheet resistance 30.8 against 3.1 Ω/sq (the intrinsic-diffusivity model is ten times too resistive), opening growth in the first etch (the Virtual Fab etches straight down; the run’s wet etch grew openings by 2.48 µm), aluminium sheet resistance at the estimated 500 nm film against 0.123 Ω/sq (about 216 nm of aluminium), and masks.
- **Model changes.** `vfab.py` and its twin take an optional furnace sequence per oxidation (`cfg.ox.seq`) and an oxide grown in the drive-in (`cfg.diff.grow`), record the window oxide and the diffused sheet resistance in the log, strip resist before probing, and gain `run_cfg()` and `compare()`. Defaults are unchanged.
- **Metal needs an anneal or a diffusion.** The sputtered metal step now requires either the implant anneal or the furnace diffusion (`requires_any`), because a diffusion’s drive-in activates its dopant too. This lets the 2024 run reach its metal without an implant. To undo it, set `dep_pvd` back to `"requires": ["anneal"]`.
- **Four new process manuals**, so there are eight: 2 Cleaning (conceptual; every bath is institution-only), 6 Diffusion (the dopant source stages are institution-only; drive-in and sheet resistance from the run), 7 Metal (evaporated aluminium, measured, patterned, etched and sintered, with the run’s values) and 11 Probe and package. The shelf follows the area order, and the three routes list them.
- The site budget is raised from 4.5 to 4.8 MB for the new manual pages. 4 new tests (326 in total); 89 new parity checks cover the run route, the run recipe and the comparison.

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
