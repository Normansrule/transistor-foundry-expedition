"""Straight-line fits for the tiered experiments (site/experiments.html).

Every experiment on the page turns its measured columns into one straight line,
y = a + b x (or y = b x through the origin), and reads the physics from the
slope and intercept. The transforms are the classic ones:

* yield_poisson   ln Y against die area A: Y = exp(-D A)            (Murphy 1964)
* moore           log2 N against year: doubling time T = 1 / b       (Moore 1965, 1975)
* sqrt_t          front depth squared against time: x^2 = k t       (diffusion, x ~ sqrt(Dt))
* capacitor       C against A / t: C = eps_r eps0 A / t
* grating         sin(theta) against m lambda: d sin(theta) = m lambda
* diode           ln I against V: I = I_s exp(V / n V_T)             (Shockley 1949)
* led             turn-on V against 1 / lambda: e V ~ h c / lambda
* mosfet          sqrt(I_D) against V_GS: I_D = K (V_GS - V_t)^2     (gate tied to drain)
* tlm             R against L: R = 2 R_c + R_s L / W                (Berger 1972)
* diode_temp      V against T at constant current: dV/dT
* proximity       W_min^2 against gap g: W_min ~ sqrt(lambda g)
* crystal         mass against day: growth rate
* fourpoint       V against I: R_s = (pi / ln 2) V / I              (Smits 1958)
* etch            film removed against time: etch rate

Errors come from the residual scatter (ordinary least squares) and are carried
to the derived quantities through the parameter covariance with a numerical
gradient. example() makes the clearly labelled "model data" the page offers when
you have no measurements yet: a seeded mulberry32 generator with Box–Muller noise
that the browser twin reproduces bit for bit.

Twin: site/js/physics/fitting.js (checked by tests/js_parity.mjs).
"""
from __future__ import annotations

import math

Q = 1.602176634e-19        # C, exact (CODATA 2018)
K_B = 1.380649e-23         # J/K, exact
H = 6.62607015e-34         # J s, exact
C_LIGHT = 299792458.0      # m/s, exact
EPS0 = 8.8541878128e-12    # F/m (CODATA 2018)

# Each model: the CSV columns it reads, the parameters you type in, whether the line
# is forced through the origin, and how to make (x, y) from one row.
MODELS = {
    "yield_poisson": {"cols": ["area", "yield"], "params": {}, "origin": True},
    "moore": {"cols": ["year", "transistors"], "params": {}, "origin": False},
    "sqrt_t": {"cols": ["t_min", "x_mm"], "params": {}, "origin": False},
    "capacitor": {"cols": ["area_cm2", "t_um", "C_pF"], "params": {}, "origin": True},
    "grating": {"cols": ["m", "x_mm"], "params": {"L_mm": 1000.0, "lambda_nm": 650.0}, "origin": True},
    "diode": {"cols": ["V", "I_mA"], "params": {"T_K": 295.0}, "origin": False},
    "led": {"cols": ["lambda_nm", "V_on"], "params": {}, "origin": False},
    "mosfet": {"cols": ["V_GS", "I_D_mA"], "params": {"keep": 0.1}, "origin": False},
    "tlm": {"cols": ["L_mm", "R_ohm"], "params": {"W_mm": 5.0}, "origin": False},
    "diode_temp": {"cols": ["T_C", "V"], "params": {}, "origin": False},
    "proximity": {"cols": ["gap_um", "w_um"], "params": {}, "origin": True},
    "crystal": {"cols": ["day", "mass_g"], "params": {}, "origin": False},
    "fourpoint": {"cols": ["I_mA", "V_mV"], "params": {}, "origin": True},
    "etch": {"cols": ["t_s", "removed_nm"], "params": {}, "origin": False},
}


def transform(model: str, rows: list[list[float]], p: dict | None = None) -> tuple[list[float], list[float]]:
    """Turn measured rows into the (x, y) points of the straight line. Rows that cannot
    be transformed (a log of zero, an empty cell) are dropped."""
    prm = {**MODELS[model]["params"], **(p or {})}
    xs, ys = [], []
    imax = max((r[1] for r in rows if len(r) > 1 and r[1] == r[1]), default=0.0) if model == "mosfet" else 0.0
    for r in rows:
        if any(v != v for v in r):          # NaN from an empty cell
            continue
        x = y = None
        if model == "yield_poisson" and r[1] > 0:
            x, y = r[0], math.log(r[1])
        elif model == "moore" and r[1] > 0:
            x, y = r[0], math.log2(r[1])
        elif model == "sqrt_t":
            x, y = r[0], r[1] ** 2
        elif model == "capacitor" and r[1] > 0:
            x, y = r[0] * 1e-4 / (r[1] * 1e-6), r[2] * 1e-12
        elif model == "grating":
            x, y = r[0] * prm["lambda_nm"] * 1e-9, math.sin(math.atan2(r[1], prm["L_mm"]))
        elif model == "diode" and r[1] > 0:
            x, y = r[0], math.log(r[1] * 1e-3)
        elif model == "led" and r[0] > 0:
            x, y = 1.0 / (r[0] * 1e-9), r[1]
        elif model == "mosfet" and r[1] >= prm["keep"] * imax and r[1] > 0:
            x, y = r[0], math.sqrt(r[1] * 1e-3)
        elif model == "proximity":
            x, y = r[0], r[1] ** 2
        elif model in ("tlm", "diode_temp", "crystal", "fourpoint", "etch"):
            x, y = r[0], r[1]
        if x is not None:
            xs.append(float(x))
            ys.append(float(y))
    return xs, ys


def line(xs: list[float], ys: list[float], origin: bool = False) -> dict:
    """Ordinary least squares. Returns a, b, their covariance, R^2 and residuals."""
    n = len(xs)
    k = 1 if origin else 2
    if n < k + 1:
        raise ValueError(f"need at least {k + 1} points, got {n}")
    if origin:
        sxx = sum(x * x for x in xs)
        b = sum(x * y for x, y in zip(xs, ys)) / sxx
        a = 0.0
    else:
        mx, my = sum(xs) / n, sum(ys) / n
        sxx = sum((x - mx) ** 2 for x in xs)
        if sxx == 0:
            raise ValueError("all x values are the same")
        b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
        a = my - b * mx
    res = [y - (a + b * x) for x, y in zip(xs, ys)]
    sse = sum(r * r for r in res)
    s2 = sse / (n - k)
    if origin:
        cov = [[0.0, 0.0], [0.0, s2 / sxx]]
        sst = sum(y * y for y in ys)
    else:
        cov = [[s2 * (1 / n + mx * mx / sxx), -s2 * mx / sxx], [-s2 * mx / sxx, s2 / sxx]]
        my = sum(ys) / n
        sst = sum((y - my) ** 2 for y in ys)
    r2 = 1 - sse / sst if sst > 0 else 1.0
    return {"a": a, "b": b, "cov": cov, "r2": r2, "res": res, "n": n}


def _derived(model: str, a: float, b: float, p: dict) -> dict:
    """The physical quantities each model reads from the slope b and intercept a."""
    if model == "yield_poisson":
        return {"D": -b}
    if model == "moore":
        return {"T_years": 1 / b}
    if model == "sqrt_t":
        return {"k_mm2_per_min": b, "t0_min": -a / b}
    if model == "capacitor":
        return {"eps_r": b / EPS0}
    if model == "grating":
        return {"d_um": 1e6 / b}
    if model == "diode":
        vt = K_B * p["T_K"] / Q
        return {"n": 1 / (b * vt), "Is_A": math.exp(a)}
    if model == "led":
        return {"h_Js": b * Q / C_LIGHT, "V0": a}
    if model == "mosfet":
        return {"Vt": -a / b, "K_mA_per_V2": b * b * 1e3}
    if model == "tlm":
        return {"Rs_ohm_sq": b * p["W_mm"], "Rc_ohm": a / 2, "LT_mm": a / (2 * b)}
    if model == "diode_temp":
        return {"dVdT_mV_per_K": b * 1e3, "V_at_0C": a}
    if model == "proximity":
        return {"lambda_eff_nm": b * 1e3}
    if model == "crystal":
        return {"rate_g_per_day": b}
    if model == "fourpoint":
        return {"Rs_ohm_sq": math.pi / math.log(2) * b}
    if model == "etch":
        return {"rate_nm_per_min": b * 60, "delay_s": -a / b}
    raise KeyError(model)


def fit(model: str, rows: list[list[float]], p: dict | None = None) -> dict:
    """Fit one experiment's rows: the line, the derived quantities and their standard errors."""
    prm = {**MODELS[model]["params"], **(p or {})}
    origin = MODELS[model]["origin"]
    xs, ys = transform(model, rows, prm)
    L = line(xs, ys, origin)
    a, b, cov = L["a"], L["b"], L["cov"]
    out = _derived(model, a, b, prm)
    err = {}
    for key, val in out.items():
        ha = 1e-6 * (abs(a) or 1.0)
        hb = 1e-6 * (abs(b) or 1.0)
        ga = 0.0 if origin else (_derived(model, a + ha, b, prm)[key] - _derived(model, a - ha, b, prm)[key]) / (2 * ha)
        gb = (_derived(model, a, b + hb, prm)[key] - _derived(model, a, b - hb, prm)[key]) / (2 * hb)
        var = ga * ga * cov[0][0] + 2 * ga * gb * cov[0][1] + gb * gb * cov[1][1]
        err[key] = math.sqrt(max(var, 0.0))
    return {**L, "x": xs, "y": ys, "out": out, "err": err}


def diode_dvdt(V: float, T_K: float, Eg: float = 1.12) -> float:
    """Shockley-model temperature coefficient of a silicon diode's forward voltage at
    constant current, in V/K: dV/dT = -(Eg/q - V)/T - 3 k/q (I_s ~ T^3 exp(-Eg/kT))."""
    return -(Eg - V) / T_K - 3 * K_B / Q


# ---- model data: a seeded generator both twins reproduce exactly ----

def _mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nxt


def _gauss(rnd) -> float:
    u = max(rnd(), 1e-12)
    v = rnd()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def example(model: str, xs: list[float], truth: dict, noise: float, seed: int = 1) -> list[list[float]]:
    """Rows of model data: the ideal law at each x, times (1 + noise * gaussian).
    The page labels these 'model data, not a measurement'."""
    rnd = _mulberry32(seed)
    rows = []
    for x in xs:
        if model == "yield_poisson":
            y = math.exp(-truth["D"] * x)
        elif model == "moore":
            y = 2 ** ((x - truth["year0"]) / truth["T_years"]) * truth["N0"]
        elif model == "sqrt_t":
            y = math.sqrt(truth["k"] * x)
        elif model == "grating":
            s = x * truth["lambda_nm"] * 1e-3 / truth["d_um"]
            y = truth["L_mm"] * math.tan(math.asin(s))
        elif model == "diode":
            y = truth["Is_A"] * (math.exp(x / (truth["n"] * K_B * truth["T_K"] / Q)) - 1) * 1e3
        elif model == "led":
            y = truth["h_Js"] * C_LIGHT / (x * 1e-9) / Q + truth["V0"]
        elif model == "mosfet":
            y = truth["K_mA_per_V2"] * max(x - truth["Vt"], 0.0) ** 2
        elif model == "tlm":
            y = 2 * truth["Rc_ohm"] + truth["Rs_ohm_sq"] * x / truth["W_mm"]
        elif model == "diode_temp":
            y = truth["V_at_0C"] + truth["dVdT"] * x
        elif model == "proximity":
            y = math.sqrt(truth["lambda_um"] * x)
        elif model == "crystal":
            y = truth["m0"] + truth["rate"] * x
        elif model == "fourpoint":
            y = truth["Rs_ohm_sq"] * math.log(2) / math.pi * x
        elif model == "etch":
            y = truth["rate_nm_per_s"] * max(x - truth["delay_s"], 0.0)
        elif model == "capacitor":           # x counts paper sheets between two foils of fixed area
            t = x * truth["t_sheet_um"]
            c = truth["eps_r"] * EPS0 * truth["A_cm2"] * 1e-4 / (t * 1e-6) * 1e12
            rows.append([truth["A_cm2"], t, c * (1 + noise * _gauss(rnd))])
            continue
        else:
            raise KeyError(model)
        rows.append([x, y * (1 + noise * _gauss(rnd))])
    return rows


def parse_csv(text: str) -> list[list[float]]:
    """Pasted CSV (comma, semicolon or tab) to numeric rows; header and # lines are skipped."""
    import re as _re
    rows = []
    for raw in str(text).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        cells = [c.strip() for c in _re.split(r"[,;\t]", line)]
        nums = []
        for c in cells:
            try:
                nums.append(float(c) if c else float("nan"))
            except ValueError:
                nums.append(float("nan"))
        if all(v != v for v in nums):
            continue
        if any(v != v for v in nums) and not rows and any(_re.search(r"[a-z]", c, _re.I) for c in cells):
            continue
        rows.append(nums)
    return rows
