PY ?= python3

.PHONY: figures data test serve spice all clean qa gifs zip nav banner pwa icons

all: figures test

figures:
	$(PY) sim/make_figures.py
	$(PY) scripts/build_data.py
	$(PY) scripts/build_nav.py
	$(PY) scripts/build_pwa.py

data:
	$(PY) scripts/build_data.py
	$(PY) scripts/build_nav.py
	$(PY) scripts/build_pwa.py

nav:
	$(PY) scripts/build_nav.py

# Offline app: manifest, service worker precache list and head tags (run after any site change)
pwa:
	$(PY) scripts/build_pwa.py

# Re-render the app icons from the favicon drawing (needs Node.js and Playwright)
icons:
	node scripts/qa/render_icons.mjs

test:
	$(PY) -m pytest -q tests

serve:
	$(PY) -m http.server 8000 -d site

spice:
	cd sim/spice && for f in *.cir; do echo "== $$f"; ngspice -b $$f; done

# Browser QA (needs Node.js and Playwright): screenshots at 1440 and 390 px, overflow, nav, click-through
qa:
	node scripts/qa/qa.mjs

# Re-record the README GIFs from the pages' record mode; each must fit 1.5 MB
gifs:
	PY=$(PY) node scripts/qa/record_gifs.mjs

banner:
	node scripts/qa/render_banner.mjs

zip:
	$(PY) scripts/make_zip.py

clean:
	rm -rf .pytest_cache sim/spice/*.csv qa-out dist
