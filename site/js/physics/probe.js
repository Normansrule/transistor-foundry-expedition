// Probe, dice and bond: wafer-map yield, cost per good die and the Williams–Brown defect level. Twin of sim/transistor_sim/physics/probe.py.
import { simulateWafer, yieldModel } from './yieldcost.js';

export const defectLevel = (Y, T) => 1 - Y ** (1 - T);

export function run(side = 10, D0 = 0.1, coverage = 0.99, waferUsd = 18500, alpha = 3, seed = 7) {
  const w = simulateWafer(side, side, D0, alpha, seed), Y = yieldModel(side * side, D0, 'negbin', alpha), dl = defectLevel(Y, coverage);
  return { n: w.dies.length, good: w.good, yield_mc: w.yield_, Y, dl_ppm: dl * 1e6, cost: waferUsd / Math.max(w.good, 1), passed: dl < 1 ? w.good / (1 - dl) : Infinity, defects: w.defects, dies: w.dies };
}
