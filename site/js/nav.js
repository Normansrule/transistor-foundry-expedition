// Main navigation menu: close on Escape, on an outside click, and after choosing a link.
const menu = document.querySelector('.nav-menu');
if (menu) {
  const summary = menu.querySelector('summary');
  const close = (focus) => { if (menu.open) { menu.open = false; if (focus) summary.focus(); } };
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(false); });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close(false)));
}
