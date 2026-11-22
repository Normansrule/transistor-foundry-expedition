"""Node-reading lab: measure the pitches on the top of a chip and work out which node made it.

A process node's name stopped being a physical length in the late 1990s. What you can still measure,
from a microscope image of a die with its layers removed, is how often things repeat:

- the contacted gate pitch (CPP), gate to gate with a contact between them;
- the minimum metal pitch (MMP), line to line on the tightest wiring layer;
- the fin pitch, on a FinFET;
- the area of one six-transistor SRAM bitcell, the smallest repeating memory cell.

The data are in data/node_pitches.json. The JavaScript twin is site/js/physics/nodelab.js; both run the
same arithmetic in the same order so tests/js_parity.mjs can compare them.

Measuring a pitch. Put one mark on a line's centre and another N lines further on: the pitch is the
distance divided by N. Each mark can be off by about ``e``, the two errors add in quadrature, so the
pitch is off by √2·e / N. Measuring across ten pitches is ten times better than measuring one.

Matching a node. ``score`` is the root-mean-square of ln(measured / true) over whatever was measured
(0 is a perfect match, 0.1 is about 10 % off on average), and ``rank`` sorts the nodes by it.

``view`` lays out the drawing for one layer: the centres of the lines inside a window of the die,
starting from a given offset. The line widths and the bitcell's aspect are drawing choices (est.).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "data" / "node_pitches.json"
QUANTITIES = ("cpp", "mmp", "fin", "sram")
CELL_CPP = 2                 # a high-density 6T bitcell is drawn two gate pitches wide (est.)
LINE_FRACTION = {"cpp": 0.32, "mmp": 0.5, "fin": 0.22}   # drawn line width ÷ pitch (est.)


def load():
    return json.loads(DATA.read_text(encoding="utf-8"))


def node(key, data=None):
    for n in (data or load())["nodes"]:
        if n["id"] == key:
            return n
    raise KeyError(key)


def value(n, q):
    v = n.get(q)
    return None if v is None else v[0]


def pitch(first, last, count):
    """Pitch from two marks ``count`` pitches apart (any length unit)."""
    if count < 1:
        raise ValueError("count must be at least 1")
    return abs(last - first) / count


def pitch_error(mark_error, count):
    """Uncertainty of that pitch when each mark is off by ``mark_error``: √2·e / N."""
    return math.sqrt(2.0) * mark_error / count


def cell(n):
    """Drawn bitcell (width, height) in nm: CELL_CPP gate pitches wide, height from the cited area."""
    w = CELL_CPP * value(n, "cpp")
    return w, value(n, "sram") * 1e6 / w


def score(measured, n):
    """RMS of ln(measured / true) over the quantities measured; None if nothing comparable."""
    s, k = 0.0, 0
    for q in QUANTITIES:
        m, t = measured.get(q), value(n, q)
        if m is None or t is None or m <= 0:
            continue
        s += math.log(m / t) ** 2
        k += 1
    return None if k == 0 else math.sqrt(s / k)


def rank(measured, data=None):
    """[(id, score)] best first; nodes with nothing comparable are left out."""
    out = []
    for n in (data or load())["nodes"]:
        sc = score(measured, n)
        if sc is not None:
            out.append((n["id"], sc))
    out.sort(key=lambda p: (p[1], p[0]))
    return out


def lines(p, span, offset):
    """Centres of lines of pitch ``p`` inside [0, span], the first at ``offset`` mod p."""
    x = offset % p
    out = []
    while x <= span + 1e-9:
        out.append(x)
        x += p
    return out


def view(n, layer, span, offset=0.0):
    """Line centres and drawn width for one layer: 'gate', 'metal', 'fin' or 'sram' (cell edges)."""
    if layer == "sram":
        w, h = cell(n)
        return {"pitch": w, "pitch_y": h, "centres": lines(w, span, offset), "width": 0.0}
    q = {"gate": "cpp", "metal": "mmp", "fin": "fin"}[layer]
    p = value(n, q)
    if p is None:
        return None
    return {"pitch": p, "centres": lines(p, span, offset), "width": p * LINE_FRACTION[q]}


def reference():
    """Numbers checked against the JavaScript twin by tests/js_parity.mjs."""
    data = load()
    cases = [
        {"cpp": 54.6, "mmp": 36.4},
        {"cpp": 90.0},
        {"cpp": 57.0, "mmp": 40.0, "fin": 30.0, "sram": 0.027},
        {"sram": 0.06},
        {"cpp": 160.0, "mmp": 150.0},
    ]
    return {
        "pitch": [pitch(13.0, 553.0, 10), pitch(700.0, 520.0, 2)],
        "pitch_error": [pitch_error(3.0, 1), pitch_error(3.0, 10)],
        "cells": {n["id"]: list(cell(n)) for n in data["nodes"]},
        "ranks": [rank(c, data) for c in cases],
        "views": {n["id"]: {layer: view(n, layer, 600.0, 17.0) for layer in ("gate", "metal", "fin", "sram")}
                  for n in data["nodes"]},
    }
