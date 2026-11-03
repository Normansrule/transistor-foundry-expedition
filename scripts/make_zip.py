"""Build the release zip: transistor-foundry-expedition-vX.Y.zip with one top folder.

    python scripts/make_zip.py              writes dist/transistor-foundry-expedition-vX.Y.zip
    python scripts/make_zip.py --out DIR

The version comes from CITATION.cff. Build products, caches, git data and QA output are left
out (see EXCLUDE). The zip must stay under 30 MiB; tests/test_budget.py checks the same rule.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "transistor-foundry-expedition"
LIMIT = 30 * 1024 * 1024  # 30 MiB
EXCLUDE_DIRS = {".git", ".venv", "venv", "__pycache__", ".pytest_cache", "qa-out", "dist", "node_modules",
                ".ipynb_checkpoints", ".mypy_cache", ".ruff_cache"}
EXCLUDE_FILES = ["*.pyc", ".DS_Store", "*.zip", "sim/spice/*.csv"]
EXCLUDE_PREFIX = ["site/assets/photos/"]


def version() -> str:
    v = re.search(r"^version:\s*([0-9.]+)", (ROOT / "CITATION.cff").read_text(encoding="utf-8"), re.M).group(1)
    parts = v.split(".")
    return ".".join(parts[:2]) if len(parts) > 2 and parts[2] == "0" else v


def files() -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS)
        for f in sorted(filenames):
            p = Path(dirpath) / f
            rel = p.relative_to(ROOT).as_posix()
            if any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(f, pat) for pat in EXCLUDE_FILES):
                continue
            if any(rel.startswith(x) for x in EXCLUDE_PREFIX):
                continue
            out.append(p)
    return out


def build(out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{SLUG}-v{version()}.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files():
            z.write(p, f"{SLUG}/{p.relative_to(ROOT).as_posix()}")
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "dist"))
    a = ap.parse_args()
    path = build(Path(a.out))
    size = path.stat().st_size
    print(f"{path}  {size:,} bytes ({size / 1024 / 1024:.2f} MiB of {LIMIT / 1024 / 1024:.0f} MiB)")
    return 0 if size < LIMIT else 1


if __name__ == "__main__":
    sys.exit(main())
