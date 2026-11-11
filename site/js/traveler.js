// Lot Traveler layer (v1.12), shared by every page.
// Builds the lot strip under the nav from the page's "On this page" menu, numbers each section as a
// traveler step and stamps it once the reader has passed it. Pure progressive enhancement: without
// JavaScript the page is unchanged.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nav = document.querySelector('.nav');
const here = document.querySelector('.nav-pages a[aria-current="page"]')?.textContent.trim() || document.title;
const links = [...document.querySelectorAll('.nav-menu-panel ul:not(.nm-pages) a[href^="#"]')];
const steps = links.map((a) => ({ a, el: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))), label: a.textContent.trim() }))
  .filter((s) => s.el);
const pad = (n) => String(n).padStart(2, '0');

if (nav && steps.length) {
  const strip = document.createElement('div');
  strip.className = 'lot-strip';
  strip.setAttribute('role', 'navigation');
  strip.setAttribute('aria-label', 'Lot traveler: your progress through this page');
  strip.innerHTML = `<div class="wrap"><span class="lot-id">Lot TFE-26<span class="lot-long"> · ${here}</span></span>`
    + `<span class="lot-step" aria-live="polite"></span><span class="lot-rail">`
    + steps.map((s, i) => `<a href="#${s.el.id}" title="Step ${pad(i + 1)} · ${s.label}" aria-label="Step ${i + 1}: ${s.label}"></a>`).join('')
    + '</span></div>';
  nav.after(strip);
  const rail = [...strip.querySelectorAll('.lot-rail a')], label = strip.querySelector('.lot-step');

  // number each section and give it a stamp that lands once it has been read
  steps.forEach((s, i) => {
    const head = s.el.querySelector('.sec-head, .lab-head, .fj-head, header') || null;
    const eb = (head || s.el).querySelector('.eyebrow');
    if (eb && !eb.querySelector('.step-no') && !(head && head.querySelector('.lab-num'))) eb.insertAdjacentHTML('afterbegin', `<span class="step-no">${pad(i + 1)}</span>`);
    if (head && !head.querySelector('.sec-stamp')) {
      head.classList.add('has-sec-stamp');
      head.insertAdjacentHTML('beforeend', `<span class="sec-stamp" aria-hidden="true"><span class="stamp">Pass<small>${pad(i + 1)}</small></span></span>`);
      s.stamp = head.querySelector('.sec-stamp');
    }
  });

  let cur = -1;
  const update = () => {
    const y = scrollY + innerHeight * 0.4;
    let c = 0;
    steps.forEach((s, i) => { if (s.el.getBoundingClientRect().top + scrollY <= y) c = i; });
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    steps.forEach((s, i) => {
      const done = i < c || (atEnd && i === c);
      rail[i].classList.toggle('done', done);
      rail[i].classList.toggle('now', i === c && !done);
      if (done && s.stamp && !s.stamp.classList.contains('on')) {
        s.stamp.classList.add('on');
        if (!reduce) s.stamp.firstElementChild.classList.add('land');
      }
    });
    if (c !== cur) { cur = c; label.innerHTML = `Step ${pad(c + 1)} of ${pad(steps.length)} · <b>${steps[c].label}</b>`; }
  };
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
}

// footer sign-off
const foot = document.querySelector('footer .wrap, .foot .wrap');
if (foot && !foot.querySelector('.foot-stamp')) {
  foot.insertAdjacentHTML('afterbegin', '<div class="foot-stamp"><span class="stamp sm" aria-hidden="true">Lot<small>out</small></span><span>End of route · lot complete</span></div>');
}
