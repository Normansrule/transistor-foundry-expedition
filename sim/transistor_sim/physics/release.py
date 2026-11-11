"""Nanosheet release: etching the sacrificial SiGe out from between the silicon sheets.

A gate-all-around stack alternates silicon sheets with silicon-germanium spacers
(Loubet et al. 2017). Once the dummy gate is removed, a selective etch attacks the
SiGe from both open sides of a sheet of width W. The etch front moves inwards at
rate r and meets in the middle after it has travelled W/2; an over-etch fraction f
carries it to e = (W/2)(1 + f). Silicon is etched too, S times slower (S is the
selectivity), and only where it is exposed: a point at distance y from the edge is
uncovered once the front passes it, so it loses (e - y)/S from each face.
    thickness(y) = t - 2 (e - y) / S          for y < e
The sheet edges thin most, its width shrinks by 2e/S, and with f < 0 a core of SiGe
W|f| wide is left bridging the sheets.
"""
from __future__ import annotations


def run(W: float = 30.0, t: float = 5.0, S: float = 100.0, over: float = 0.2, n: int = 3, npts: int = 61) -> dict:
    e = 0.5 * W * (1 + over)                      # lateral etch distance from each side (nm)
    side = e / S                                  # silicon lost from each sidewall
    core = max(0.0, W - 2 * e)                    # SiGe left in the middle when f < 0
    ys = [0.5 * W * i / (npts - 1) for i in range(npts)]          # edge (0) to centre (W/2)
    th = [max(0.0, t - 2 * max(0.0, e - y) / S) for y in ys]
    mean_t = sum(0.5 * (th[i] + th[i + 1]) * (ys[i + 1] - ys[i]) for i in range(npts - 1)) / (0.5 * W)
    w_f = max(0.0, W - 2 * side)
    weff = 2 * (w_f + mean_t) * n if core == 0 else 0.0
    return dict(e=e, side=side, core=core, released=core == 0, y=ys, thick=th, t_edge=th[0], t_centre=th[-1],
                t_mean=mean_t, w_final=w_f, weff=weff, weff_ideal=2 * (W + t) * n, spread=th[-1] - th[0])
