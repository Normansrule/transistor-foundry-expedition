"""Install the process manuals into a working tree (idempotent; safe to run again).

    python scripts/manuals_apply.py

1. merges data/manual_refs.json into data/references.json (adds missing ids only, keeps order and format)
2. adds the Manuals page to scripts/build_nav.py (PAGES and SECTIONS) if it is not there yet
3. reruns scripts/build_manuals.py, scripts/build_data.py and scripts/build_nav.py
It stops early if a reference the manuals cite is still missing (for example a run record that a newer
release renames), and says which.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFS = ROOT / "data" / "references.json"
NAV = ROOT / "scripts" / "build_nav.py"


def merge_refs() -> int:
    data = json.loads(REFS.read_text(encoding="utf-8"))
    have = {r["id"] for r in data["references"]}
    new = [r for r in json.loads((ROOT / "data" / "manual_refs.json").read_text(encoding="utf-8"))["references"] if r["id"] not in have]
    if new:
        data["references"].extend(new)
        REFS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + ("\n" if REFS.read_text(encoding="utf-8").endswith("\n") else ""), encoding="utf-8")
    return len(new)


def missing_cites() -> set[str]:
    have = {r["id"] for r in json.loads(REFS.read_text(encoding="utf-8"))["references"]}
    manuals = json.loads((ROOT / "data" / "manuals.json").read_text(encoding="utf-8"))["manuals"]
    text = json.dumps(manuals, ensure_ascii=False)
    used = set(re.findall(r"\[@([\w-]+)\]", text)) | set(re.findall(r'"ref": "([\w-]+)"', text))
    used |= {k for k in re.findall(r'"refs": \[([^\]]*)\]', text) for k in re.findall(r'"([\w-]+)"', k)}
    for m in manuals:
        used |= set(m["refs"]) | set((m.get("variant") or {}).get("generations_ref", []))
    return used - have


def patch_nav() -> bool:
    src = NAV.read_text(encoding="utf-8")
    if '("manuals", "Manuals")' in src:
        return False
    src = src.replace('    ("process", "Process Lab"),\n', '    ("process", "Process Lab"),\n    ("manuals", "Manuals"),\n', 1)
    src = src.replace('SECTIONS = {\n', 'SECTIONS = {\n    "manuals": [("shelf", "All manuals"), ("route", "By route"), ("mn-safety", "Safety"), ("mn-sources", "Sources")],\n', 1)
    if '("manuals", "Manuals")' not in src:
        sys.exit("could not find the PAGES list in scripts/build_nav.py: add (\"manuals\", \"Manuals\") by hand")
    NAV.write_text(src, encoding="utf-8")
    return True


def run(*args):
    print("$", " ".join(args))
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


if __name__ == "__main__":
    print(f"references added: {merge_refs()}")
    gone = missing_cites()
    if gone:
        sys.exit("these cited references are missing from data/references.json: " + ", ".join(sorted(gone))
                 + "\napply the manuals on top of the release that defines them (v1.15 or later).")
    print(f"nav patched: {patch_nav()}")
    run("scripts/build_manuals.py")
    run("scripts/build_data.py")
    run("scripts/build_nav.py")
    print("done: now run python -m pytest -q and node scripts/qa/print_manuals.mjs")
