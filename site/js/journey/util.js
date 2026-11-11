import { FAB } from './data.js';
// Small helpers shared by the Fab Journey modules.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Per-viewer progress (visited areas, passed theatres, chosen route). Browser storage can be missing or
// throw (private windows, blocked site data), so every access is guarded and the page works without it.
export const store = {
  get(k, d) { try { const v = localStorage.getItem('tfe:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tfe:' + k, JSON.stringify(v)); } catch { /* fine */ } },
};
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Steps of a track, each placed after the steps it requires (stable topological order). */
export function routeSteps(trackId) {
  const inTrack = FAB.steps.filter((s) => s.tracks.includes(trackId));
  const ids = new Set(inTrack.map((s) => s.id)), out = [], seen = new Set();
  const byId = Object.fromEntries(FAB.steps.map((s) => [s.id, s]));
  const visit = (s) => { if (seen.has(s.id)) return; seen.add(s.id); [...s.requires, ...(s.requires_any || [])].filter((r) => ids.has(r)).forEach((r) => visit(byId[r])); out.push(s); };
  inTrack.forEach(visit);
  return out;
}
