# Process coverage plan

What each of the 13 process theaters will show, what the repository already has to reuse, and which models are new. Data lives in [`data/fab_steps.json`](../../data/fab_steps.json) (13 seed steps) and [`data/photo_candidates.json`](../../data/photo_candidates.json) (23 candidates, licence check pending). Written for v1.11, 3 November 2026.

Every theater has the same parts: the problem and when it was solved, the physics, a 2D cross-section and 3D isometric view with a scrubber, a licensed photo of the tool and the result, cited recipe ranges, the equations with a live simulator, metrology, failure modes, an evolution timeline, and three depths (Beginner, Engineer, Process engineer). "Recipe ranges" below names the source to read; no number goes in until it is cited.

| # | Area | Simulator | Photo candidates | Recipe ranges: source to read | Failure modes | Timeline anchors | Reuse from the repo | New models needed |
|---|---|---|---|---|---|---|---|---|
| 1 | Materials: quartz to wafer | Czochralski pull: dopant segregation along the ingot | `cand_cz_ingot`, `cand_poly_rod`, `cand_poly_compilation`, `cand_wafer_mirror`, `cand_wafer_sizes` | Plummer 2000 ch. 3 [@plummer2000]; SOI wafer bonding needs a primary source | Dislocations, oxygen precipitates, bow and warp | Teal's grown-junction crystals, float zone, SOI | `crystal.py` lattice viewer, `crystals.json`, process step 1 drawing | Segregation along the ingot (Scheil) with twin and tests; source to add |
| 2 | Cleaning and the cleanroom | Particle size against feature size, and yield | `cand_cleanroom_litho`, `cand_ucdavis_cleanroom` | Conceptual only (tier 3): no chemistry ranges published | Particles, metal contamination, watermarks | RCA clean (Kern, to add), ISO cleanroom classes (to add) | `yieldcost.py` defect-density yield | None (reuse yield model) |
| 3 | Oxidation | Deal–Grove, dry and wet, (100) and (111) | `cand_diffusion_furnace` | Plummer 2000 ch. 6 [@plummer2000], Deal & Grove [@dealgrove1965] | Non-uniformity, interface traps, oxide charge | Atalla 1959 [@atalla1959], Deal–Grove 1965 | `oxidation.py` + twin, Process Lab oxide lab and GIF | None |
| 4 | Lithography | Aerial image, resolution and depth of focus by generation, EUV shot noise | `cand_cleanroom_litho`, `cand_lcn_litho`, `cand_stepper_anim`, `cand_euv_tool`, `cand_euv_fr` | Levinson 2019 [@levinson2019], Mack 2007 [@mack2007], Bakshi 2018 [@bakshi2018], ASML [@asml_euv] | Defocus, overlay error, stochastic bridges and breaks | g-line to High-NA EUV; OPC; SADP/SAQP | `litho.py` + twin (Physics Lab 12), `lithography.png`, Chapter 7 | Depth of focus and EUV line-edge roughness (from photon counting) |
| 5 | Etch | Ion-assisted etch profile against ion/neutral flux ratio | none yet (search plasma etch chambers) | Primary plasma-etch text to add (e.g. Lieberman & Lichtenberg) | Undercut, microloading, aspect-ratio-dependent etch, notching | Wet etch to RIE to ALE | Process step drawings | Etch selectivity and anisotropy model |
| 6 | Doping | LSS ranges, Gaussian profiles, anneal broadening, junction depth | `cand_implanter_schematic` | Tuttle worked examples [@tuttle_implant]; anneal regimes from Plummer [@plummer2000] | Channeling, damage, transient enhanced diffusion | Diffusion furnaces, implantation (Dennard 1974 [@dennard1974]) | `implant.py`, `dopants.py` + twins, Process Lab implant lab and GIF | Channeling probability against tilt (optional) |
| 7 | Deposition | ALD growth per cycle and conformality; sputter step coverage | `cand_magnetron`, `cand_cvd_chamber` | Primary ALD and PVD references to add | Poor step coverage, voids, seams, pinholes | CVD, PECVD, ALD for high-k (Mistry 2007 [@mistry2007]) | High-k story in Chapter 5 | ALD growth per cycle model |
| 8 | Planarization (CMP) | Dishing and erosion against pattern density | `cand_wafer_mirror` | Primary CMP reference to add | Dishing, erosion, scratches | Oxide CMP, copper CMP | Process step drawings | CMP dishing and erosion model |
| 9 | Device modules | 3D layer builder: planar to FinFET to nanosheet to CFET | none yet (die TEM images, check licences) | Mistry 2007, Natarajan 2014, Auth 2017, Yeap 2019, Loubet 2017 (all in references) | Fin bending, sheet-release residue, spacer shorts | LOCOS to STI, poly to HKMG, FinFET 2011, GAA 2022–25, backside power | Device Atlas cross-sections, `crosssection.py`, `explorer3d.js`, 14-step process stepper | Layer builder geometry rules (shared with Virtual Fab) |
| 10 | Interconnect | RC delay against pitch; electromigration lifetime | none yet | Black [@black1969], Blech [@blech1976], Korhonen [@korhonen1993]; resistivity size effect [@mayadas1970] | Electromigration voids, barrier breach, via opens | Aluminium to copper dual damascene, cobalt, ruthenium | `electromigration.py`, `interconnect.py` + twins | None |
| 11 | Back end | Yield to cost per good die; bond-pitch comparison | `cand_wafer_prober`, `cand_dicing_tape`, `cand_stealth_dicing`, `cand_wire_bond`, `cand_wedge_bond` | TSMC 3DFabric and SoIC [@tsmc_3dfabric] [@tsmc_soic] | Wire sweep, bond lift-off, warpage | Wire bond to flip-chip to hybrid bonding | `yieldcost.py`, Chapter 17, CoWoS and hybrid-bond cross-sections | None for v1 |
| 12 | Other process families | Comparison matrix: masks, peak temperature, devices | `cand_photonics_wafer` | Family-specific primary sources (SiC, GaN MOCVD, IGZO [@nomura2004]) | Family-specific | Bipolar, FD-SOI, BiCMOS, SiC, GaN HEMT, TFT | Device Atlas devices, Chapters 10 and 14, `hemt.py` | None (data only) |
| 13 | History | Point contact to silicon gate, scrubbable | existing `images.json` historical photos | Hoerni [@hoerni1962], Faggin & Klein [@faggin1970] | Mesa fragility, contamination (historical) | 1947 to 1971 | Chapters 1–3, timeline, historical cross-sections | None |

## Order of work

1. v1.12: Fab Journey shell with the teaching-CMOS and historical tracks, using areas 3, 4, 6 and 13, which already have models.
2. v1.13: Virtual Fab on the teaching-CMOS track; new models for depth of focus and EUV roughness.
3. v1.14: ALD growth, etch selectivity, CMP dishing; theaters 5, 7, 8.
4. Then the modern GAA track (area 9) and back end (11).

## Open items

- Run `python scripts/check_photo_licenses.py` with network access, then move verified candidates into `data/images.json`.
- Reconcile safety tiers with HANDOFF.md §9.4.
- Add the references named in "Recipe ranges" before filling any recipe numbers.
