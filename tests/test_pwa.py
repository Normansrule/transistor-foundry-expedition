"""Offline app (v1.29, roadmap item 7): manifest, icons, service worker and head tags."""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def test_pwa_files_are_up_to_date():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_pwa.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, "run python scripts/build_pwa.py\n" + r.stdout


def test_manifest_and_icons():
    m = json.loads((SITE / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert m["name"] == "Transistor Foundry Expedition" and m["display"] == "standalone"
    assert m["start_url"].startswith("./") and m["scope"] == "./"
    sizes = {i["sizes"] for i in m["icons"]}
    assert {"192x192", "512x512"} <= sizes and any(i["purpose"] == "maskable" for i in m["icons"])
    for i in m["icons"]:
        assert (SITE / i["src"]).exists(), i["src"]
    for s in m["shortcuts"]:
        assert (SITE / s["url"][2:]).exists()


def test_service_worker_precaches_every_file_and_names_the_version():
    sw = (SITE / "sw.js").read_text(encoding="utf-8")
    files = json.loads("[" + sw.split("const FILES = [")[1].split("];")[0].rstrip().rstrip(",") + "]")
    for f in files[1:]:
        assert (SITE / f).is_file(), f
    on_disk = {p.relative_to(SITE).as_posix() for p in SITE.rglob("*") if p.is_file() and not p.name.startswith(".")}
    assert on_disk - set(files) == {"sw.js", "assets/og.png"}
    ver = re.search(r"^version:\s*([0-9.]+)", (ROOT / "CITATION.cff").read_text(encoding="utf-8"), re.M).group(1)
    assert f'const CACHE = "tfe-v{ver}-' in sw


def test_every_page_links_the_manifest_and_registers_the_worker():
    for p in list(SITE.glob("*.html")) + list((SITE / "manuals").glob("*.html")):
        html = p.read_text(encoding="utf-8")
        pre = "../" if p.parent.name == "manuals" else ""
        assert f'<link rel="manifest" href="{pre}manifest.webmanifest">' in html, p.name
        assert ("js/nav.js" in html) or ("js/manual.js" in html), p.name
    assert "serviceWorker.register('sw.js')" in (SITE / "js" / "nav.js").read_text(encoding="utf-8")
    assert "serviceWorker.register('../sw.js')" in (SITE / "js" / "manual.js").read_text(encoding="utf-8")
