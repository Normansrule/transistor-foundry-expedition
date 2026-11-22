// Process manuals: depth switch (Builder / Engineer / Process engineer) and traveler stamps.
// The page works without this script: every depth is in the HTML and the handbook opens with <details>.
const body = document.body;
const KEY = 'tfe-manual-' + location.pathname.split('/').pop();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: no memory */ } },
};

function setDepth(d) {
  body.dataset.depth = d;
  for (const b of document.querySelectorAll('.mn-depth button')) b.setAttribute('aria-pressed', String(b.dataset.set === d));
  for (const el of document.querySelectorAll('.mn-spec')) el.open = d === 'process';
  const s = store.get(KEY) || {};
  store.set(KEY, { ...s, depth: d });
}

const steps = [...document.querySelectorAll('.mn-step')];
const count = document.querySelector('.mn-progress span');
function paint(done) {
  for (const st of steps) {
    const on = done.includes(st.id);
    st.classList.toggle('done', on);
    st.querySelector('.mn-stamp').setAttribute('aria-pressed', String(on));
  }
  if (count) count.textContent = String(done.length);
}

const saved = store.get(KEY) || {};
let done = Array.isArray(saved.done) ? saved.done.filter(id => document.getElementById(id)) : [];
paint(done);
if (saved.depth) setDepth(saved.depth);

for (const b of document.querySelectorAll('.mn-depth button')) b.addEventListener('click', () => setDepth(b.dataset.set));
for (const st of steps) {
  st.querySelector('.mn-stamp').addEventListener('click', () => {
    done = done.includes(st.id) ? done.filter(x => x !== st.id) : [...done, st.id];
    paint(done);
    store.set(KEY, { ...(store.get(KEY) || {}), done });
  });
}
for (const b of document.querySelectorAll('[data-print]')) b.addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => { for (const el of document.querySelectorAll('.mn-spec')) el.open = true; });

// Offline: the same service worker as the main pages (scope is the site root).
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) {
  addEventListener('load', () => navigator.serviceWorker.register('../sw.js').catch(() => {}));
}
