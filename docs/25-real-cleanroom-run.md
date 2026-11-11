# 25 · A real cleanroom run, checked against the models

Every model on this site is a simplification. The honest way to find out how good one is: take a real wafer, measure it, and compare. This chapter does that with one wafer made in a university teaching cleanroom in 2024 by Ronan Loberg and Aleksander Norman [@cleanroom_run_fab2024; @cleanroom_run_char2024]. The interactive version is [Process Lab 05](https://normansrule.github.io/transistor-foundry-expedition/process.html#labrun); the data are in `data/lab_runs.json`.

## The process

The process builds n-channel metal–oxide–semiconductor (NMOS) devices on a 3-inch p-type (100) wafer with four masks: ACTV (active area), POLY (gates), CONT (contact holes) and METL (aluminium wiring) [@teaching_process_manual2023]. The ten steps are:

1. Field oxidation, 1000 °C, dry–wet–dry for 5–90–5 minutes.
2. ACTV lithography (i-line positive resist, 9 s contact exposure) and a wet oxide etch.
3. Gate oxidation in dry oxygen, 1100 °C for 60 minutes.
4. Phosphorus-doped polysilicon by low-pressure chemical vapour deposition (LPCVD), run by staff.
5. POLY lithography and etch.
6. Source and drain doping from a spin-on phosphorus source in a 1050 °C furnace.
7. Drive-in and intermediate oxidation, 1050 °C for 37 minutes.
8. CONT lithography and etch.
9. Aluminium evaporation.
10. METL lithography, etch and a 400 °C sinter.

The wet etches, the doping source and the polysilicon source gas are institution-only (safety tier 3), so the site shows what they produced, never how to do them.

## Oxide thickness: Deal–Grove holds up

Chaining Deal–Grove through each step, with each one restarting from the thickness the last one left [@dealgrove1965; @plummer2000], gives:

| Oxide | Recipe | Deal–Grove | Measured | Difference |
|---|---|---|---|---|
| Field (this run) | 1000 °C, dry 5 + wet 90 + dry 5 min | 517 nm | 548 nm | +6 % |
| Field (2023 run) | same, wet 88 min | 510 nm | 445 nm | −13 % |
| Field (2021 run) | same, wet 125 min | 634 nm | 522 nm | −18 % |
| Gate | 1100 °C, dry 60 min | 111 nm | 114 nm | +3 % |
| Intermediate | 1050 °C, 37 min, dry model | 62 nm | 62.9 nm | +1 % |

The 2021 and 2023 runs are from the process manual [@teaching_process_manual2023]. The same recipe scatters by up to 18 % from year to year, which is more than the model's error on this run. The shortcut x = √(Bt), which drops the linear term, overshoots by 30–60 %: at these thicknesses growth is still partly reaction-limited.

The intermediate oxide is a puzzle in a useful way. The group logged it as dry, and dry Deal–Grove fits it to 1 %. The process manual runs this step with steam from a bubbler and notes that the furnace grows far less oxide than Deal–Grove predicts [@teaching_process_manual2023]. If it was wet, Deal–Grove needs an effective steam pressure of only 0.08 atm to grow 62.9 nm. The second reading on the device wafer, 608–629 nm, was most likely taken over the field oxide, where the model gives 558 nm.

## Lithography is precise; wet etching is not

The group measured 2, 3, 4 and 8 µm test lines after developing and again after etching [@cleanroom_run_fab2024]. After lithography the edges moved by less than about 0.5 µm. After the wet etch, ACTV openings had grown by 2.5 µm on average, POLY lines had shrunk by 1.3 µm and CONT openings had grown by 2.4 µm.

A wet etch is isotropic: it eats sideways as fast as down, so an opening grows by about twice the film thickness, more with over-etch:

$$\Delta W = 2\,t_{film}\,(1+f_{over})$$

For 548 nm of field oxide that is 1.1 µm with no over-etch. The measured 2.5 µm implies about 125 % over-etch; POLY implies about 60 %. The students also note that agitating the wafer in the bath sped up the contact etch. This is exactly the problem that made industry move to anisotropic plasma etching (see the etch theatre on the Fab Journey).

Mask-to-mask overlay with a manual aligner was 0.2–0.5 µm (ACTV to POLY) and up to 1.4 µm (POLY to CONT).

## Threshold voltage and the charge in the oxide

Eight of the nine MOSFETs switched [@cleanroom_run_char2024]. The ones on the 114 nm gate oxide turned on between −3 V and 0 V, and the field-oxide device at 7.5 V. The long-channel threshold of an NMOS on p-type silicon is [@hu2010; @sze2006]

$$V_T = \phi_{ms} - \frac{qN_{ox}}{C_{ox}} + 2\phi_B + \frac{\sqrt{2\varepsilon_{Si}qN_A\,2\phi_B}}{C_{ox}}$$

With an n⁺ polysilicon gate, no oxide charge and a 1 Ω·cm substrate (the value the characterization manual gives [@teaching_char_manual2024]; 1.7 × 10¹⁶ cm⁻³ through Caughey–Thomas mobility [@caughey1967]), the ideal threshold is about +1.9 V. Every device sits below it. A fixed positive oxide charge of 4 × 10¹¹ to 9 × 10¹¹ cm⁻² explains the gap; using the 0.33 Ω·cm the group measured on the bare wafer raises it to 0.9–1.4 × 10¹² cm⁻². The field device, with an aluminium gate over about 610 nm of oxide, needs 1–6 × 10¹¹ cm⁻² over the same range, so the two kinds of device tell a consistent story. A production gate oxide holds far less charge than this [@sze2006].

## Capacitors: when the measurement is the puzzle

Parallel-plate capacitance from the measured oxide thickness and drawn area gives 2.5 pF (field), 17.4 pF (gate) and 22.0 pF (intermediate). The 1 MHz readings were 9.5, 5.95 and 35.5 pF [@cleanroom_run_char2024]. The field and intermediate capacitors read high, the gate capacitor low. A parallel-mode meter reads a capacitor with series resistance R as

$$C_{read} = \frac{C}{1+(\omega R C)^2}$$

so about 12.7 kΩ in series, for example a poor back contact through the probe stage, would make the gate capacitor read 5.95 pF. Stray capacitance would push the small ones up. But no single series resistance and stray capacitance fit all three devices, so at least one was probably mis-probed or mislabelled. The page lets you try.

## Resistors and sheet resistance

Sheet resistance follows from R_s = R·W/L. The diffused resistor (2a: 57.1 Ω, 201 × 11 µm after etch bias) gives 3.1 Ω/□, against the 3 Ω/□ the manual quotes [@teaching_char_manual2024]. The polysilicon resistor (2b: 203 Ω, 199 × 9 µm) gives 9.2 Ω/□, three times the quoted value, so this polysilicon was more resistive than assumed.

The new **diffusion theatre** on the Fab Journey models step 6 and 7: a constant-source predeposition (an erfc profile) followed by a fixed-dose drive-in (a Gaussian) [@plummer2000; @jaeger2002]. With the teaching-process settings it puts the junction at about 0.95 µm, close to the 1 µm the manual assumes, but gives about 31 Ω/□ rather than 3: heavy phosphorus diffuses faster than its intrinsic diffusivity [@uiuc_diffusivity] and the real surface concentration is set by the source.

## A design exercise at 25 nm

A separate design study by one of the same students tuned a 25 nm-gate NMOSFET in a device simulator [@norman2024_nmos_design; @hu2010]: body doping 2.6 × 10¹⁸ cm⁻³, junction depth 12 nm and a 15 nm spacer gave a subthreshold swing of 125 mV/decade and drain-induced barrier lowering of 239 mV/V (V_T 0.577 V at 50 mV drain bias, 0.398 V at 0.8 V). The long-channel formula above predicts 1.32 V for the same doping and a 1 nm oxide. The gap is short-channel physics: at 25 nm the drain helps the gate turn the channel on.

## Beyond the transistor

The teaching chip also carries microelectromechanical (MEMS) cantilevers from 300 to 600 µm long, a comb drive and a 17-stage ring oscillator [@teaching_process_manual2023]. Research is now building three-dimensional microstructures by additive methods instead: two-photon polymerisation writes features near 100 nm inside a resin with a focused femtosecond laser [@fraunhofer_2pp], and recent theses integrate printed 3D MEMS with ultrafast lasers and magnetic assembly [@pagliano2022] or print directly on finished chips [@schweiger2023].

## The code

- Model: `sim/transistor_sim/physics/labrun.py` (oxide sequences, parabolic shortcut, effective pressure, resistivity to doping, ideal and meter-model capacitance, threshold and oxide charge, isotropic bias, sheet resistance) and `diffusion.py` (predeposition and drive-in), with twins in `site/js/physics/` checked by `tests/js_parity.mjs`.
- Data: `data/lab_runs.json`, bundled into `site/js/processlab/data.js` by `scripts/build_data.py`. Teaching-track recipe ranges in `data/fab_steps.json` now cite this run and the process manual.
- Page: `site/js/processlab/labrun.js` (Process Lab 05) and the diffusion adapter in `site/js/journey/proc.js`.
- Tests: `tests/test_labrun.py` (model identities, the Deal–Grove fit, citations, tier-3 steps publish no recipe, no hazardous chemistry words, the page and its data bundle) and `tests/test_diffusion.py` (erfc accuracy, dose conservation, the closed-form junction depth and the failure-demo trends).

## What the models leave out

- **Furnace reality:** ramps, boat position, gas flow and how much water a bubbler delivers are not modelled; the process manual notes this furnace under-grows oxide.
- **Dopant physics:** intrinsic diffusivities only, no concentration-enhanced or oxidation-enhanced diffusion, no segregation of boron into the growing oxide (which lowers the doping under the field oxide), and lateral spread drawn as a fixed fraction of the depth.
- **Oxide charge:** lumped into one fixed sheet at the interface; mobile ions, interface traps and their bias and temperature dependence are left out.
- **Devices:** long-channel threshold only; no short-channel effects, series resistance or mobility degradation in the MOSFETs.
- **Measurement:** probe damage, contact resistance and the meter's real equivalent circuit are reduced to one series resistance and one stray capacitance.
- **The data:** one wafer from one pair of students in one run. Some readings disagree with each other, and the page says so rather than smoothing them over.
