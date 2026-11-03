"""Size budget: the release zip stays under 30 MiB and every GIF under 1.5 MB.

Budgets (bytes) are deliberately explicit so a release that grows has to say so here.
"""
import importlib.util
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ZIP_LIMIT = 30 * 1024 * 1024        # 30 MiB, hard limit for uploading the release zip
ZIP_WARN = 28 * 1024 * 1024         # keep ~2 MiB of headroom for the next release
GIF_LIMIT = 1_500_000               # 1.5 MB per animation
BUDGET = {                          # per-folder ceilings, uncompressed
    "figures/anim": 15_000_000,
    "site": 4_500_000,
    "figures": 29_000_000,
}


def _make_zip():
    spec = importlib.util.spec_from_file_location("make_zip", ROOT / "scripts" / "make_zip.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _du(rel):
    return sum(p.stat().st_size for p in (ROOT / rel).rglob("*") if p.is_file() and "__pycache__" not in p.parts)


@pytest.mark.parametrize("gif", sorted((ROOT / "figures" / "anim").glob("*.gif")), ids=lambda p: p.name)
def test_gif_under_limit(gif):
    assert gif.stat().st_size <= GIF_LIMIT, f"{gif.name}: {gif.stat().st_size:,} bytes > {GIF_LIMIT:,}"


@pytest.mark.parametrize("folder,limit", BUDGET.items())
def test_folder_budget(folder, limit):
    assert _du(folder) <= limit, f"{folder}: {_du(folder):,} bytes > {limit:,}"


def test_release_zip_under_limit(tmp_path):
    mz = _make_zip()
    path = mz.build(tmp_path)
    size = path.stat().st_size
    assert path.name == f"transistor-foundry-expedition-v{mz.version()}.zip"
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
    assert all(n.startswith("transistor-foundry-expedition/") for n in names)
    assert not any("/.git/" in n or "__pycache__" in n or "/qa-out/" in n for n in names)
    assert size < ZIP_WARN, f"zip is {size:,} bytes; limit {ZIP_LIMIT:,}, keep under {ZIP_WARN:,}"
