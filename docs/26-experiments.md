# 26 · Experiments you can run

The [Experiments page](https://normansrule.github.io/transistor-foundry-expedition/experiments.html) turns the physics of chip making into fourteen experiments you can measure. Each one stands in for a real process step, from yield to lithography to contact resistance. Each one turns your readings into a straight line, fits it in the browser, and sets the result beside a cited value.

The experiments use the same safety tiers as the process manuals. Four are tier 0 (paper, a pencil, a spreadsheet), eight are tier 1 (batteries, a USB supply, a labelled Class 2 laser pointer, warm water or sunlight), one is tier 2 (a four-point probe in a supervised teaching lab) and one is tier 3, explained conceptually with no recipe.

## Why straight lines

Most laws in this book are exponentials, powers or square roots. Each becomes a straight line after a simple change of variables, and a straight line is the one fit anyone can check by eye. The residuals (each point minus the line) show at once whether the law holds or the data bend away from it.

| # | Experiment | Tier | Line | What the slope or intercept gives |
|---|---|---|---|---|
| 1 | Sprinkle sand on a paper wafer | 0 | ln Y against die area | Defect density D, from Y = exp(−D·A) [@murphy1964; @stapper1973] |
| 2 | Moore’s law from real chips | 0 | log₂ N against year | Doubling time [@moore1965; @moore1975] |
| 3 | Dye diffusing into gelatin | 1 | depth² against time | The √(Dt) law of diffusion [@plummer2000] |
| 4 | A foil-and-paper capacitor | 0 | C against A/t | Relative permittivity ε_r [@sze2006] |
| 5 | A CD’s track pitch with a laser pointer | 1 | sin θ against mλ | Track pitch d [@ecma130; @ecma267] |
| 6 | A diode’s current–voltage curve | 1 | ln I against V | Ideality factor n and saturation current [@shockley1949; @sze2006] |
| 7 | LED colours and Planck’s constant | 1 | turn-on V against 1/λ | An estimate of h [@codata2018] |
| 8 | A MOSFET’s threshold | 1 | √I_D against V_GS | Threshold V_t and gain factor K [@schroder2006] |
| 9 | Pencil resistors | 0 | R against length | Sheet and contact resistance [@berger1972; @schroder2006] |
| 10 | A diode thermometer | 1 | V against temperature | dV/dT [@sze2006] |
| 11 | Printing with sunlight | 1 | smallest line² against gap | An effective wavelength [@plummer2000; @levinson2019] |
| 12 | Growing a crystal from a seed | 1 | mass against day | Growth rate [@plummer2000] |
| 13 | A four-point probe | 2 | V against I | Sheet resistance, R_s = (π/ln 2)·V/I [@smits1958] |
| 14 | An etch-rate test series | 3 | removed against time | Etch rate and start delay [@plummer2000; @coburn1989] |

## How the fit works

The fit is ordinary least squares. For a line y = a + bx it minimises the sum of squared residuals, and for a line through the origin (yield, capacitance, the grating, proximity printing, the four-point probe) it fits the slope alone. The scatter of the points about the line gives the variance of a and b and their covariance. Each physical result is a function of a and b (for example V_t = −a/b for the MOSFET), and its standard error comes from that covariance through a numerical gradient.

Two checks keep the fitter honest:

- Every experiment that has no real data offers **model data**: numbers made from the law itself, with a few per cent of Gaussian noise, and labelled in the table as "model data, not a measurement". The tests check that the fit gives back the value that made them, within the noise.
- The **Moore’s law** experiment uses the real chip list. Its fit, a doubling time of 2.15 ± 0.05 years, is the same number the Moore’s law chart on the History page computes from the same chips with a separate code path.

## Comparisons that tie back to the cleanroom run

Four experiments set their result beside the 2024 teaching-cleanroom run of [Chapter 25](25-real-cleanroom-run.md):

- the diode’s turn-on, against the run’s p–n diode at about 0.44 V [@cleanroom_run_char2024];
- the MOSFET’s threshold, against the run’s test transistors [@cleanroom_run_char2024];
- the pencil’s sheet resistance, against the run’s diffused resistor: 57.1 Ω over 201 µm by 11 µm, about 3.1 Ω per square [@cleanroom_run_char2024];
- the four-point probe, against the run’s substrate at 8.74 Ω per square [@cleanroom_run_fab2024].

The foil capacitor also points out that the run’s own oxide capacitors read up to about four times away from the ideal formula, because of the meter’s series resistance [@cleanroom_run_char2024].

## Safety

The tiers follow the project’s rules. Nothing here involves hazardous chemistry at home. The laser experiment asks for a laser labelled Class 2 or Class 1; Class 2 limits continuous visible output to 1 mW [@iec60825]. The thermometer uses warm tap water, and an adult handles the hot water for the gelatin and the salt solution. The four-point probe belongs in a supervised teaching lab. The etch-rate experiment is institution-only and describes the method, never a chemistry, concentration or temperature.

## The code

- Data: `data/experiments.json` (tiers, experiments, columns, parameters, comparisons, example settings), bundled with the real chip list into `site/js/experiments/data.js` by `scripts/build_data.py`.
- Page: `scripts/build_experiments.py` writes `site/experiments.html` as static HTML, so every method and source reads without JavaScript; `site/js/experiments/main.js` adds the fitter, the chart with residuals, CSV upload and the template download.
- Model: `sim/transistor_sim/physics/fitting.py` and its twin `site/js/physics/fitting.js`. The seeded generator (mulberry32 with Box–Muller noise) produces the same model data in both languages, so `tests/js_parity.mjs` checks every row and every fitted value.
- Tests: `tests/test_experiments.py` (counts and tiers, columns match the models, citations, tier 3 publishes no recipe, no hazardous words, each example recovers its model, the real Moore fit matches the History chart, the CSV parser, the page is up to date and every link lands on a real anchor).

## What the models leave out

- **Measurement error in x:** least squares assumes the x values are exact. A ruler, a clock or a thermometer is not, so the quoted errors are a lower bound.
- **Weighting:** every point counts the same. After a logarithm, small currents and low yields are noisier than the fit assumes.
- **Range:** each law holds only over a range. A diode bends at high current, a MOSFET leaves the square law below threshold, and growth slows when the solution runs out. Look at the residuals before trusting a number.
- **Analogues are analogues:** gelatin is not silicon, sun-print paper is not a resist, and a pencil line is not a doped film. They share the law, not the numbers.
