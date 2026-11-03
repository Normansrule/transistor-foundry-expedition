"""v1.11 rename: the old slug may survive only in CHANGELOG.md and on a "formerly" line."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = "transistor-" + "odyssey"  # split so this file does not match itself
SKIP_DIRS = {".git", ".venv", "venv", "__pycache__", ".pytest_cache", "qa-out", "dist", "node_modules"}
TEXT = {".md", ".py", ".js", ".mjs", ".json", ".html", ".css", ".sh", ".cff", ".yml", ".yaml", ".txt", ".csv",
        ".svg", ".cir", "", ".toml", ".cfg", ".webmanifest"}


def text_files():
    for p in ROOT.rglob("*"):
        if p.is_file() and not (set(p.relative_to(ROOT).parts) & SKIP_DIRS) and p.suffix.lower() in TEXT:
            yield p


def test_old_name_only_in_changelog_or_formerly_lines():
    hits = []
    for p in text_files():
        rel = p.relative_to(ROOT).as_posix()
        if rel == "CHANGELOG.md":
            continue
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(lines, 1):
            if OLD in line.lower() and "formerly" not in line.lower():
                hits.append(f"{rel}:{n}: {line.strip()[:120]}")
    assert not hits, "old name still present:\n" + "\n".join(hits)


def test_new_name_in_titles_citation_and_setup():
    cff = (ROOT / "CITATION.cff").read_text(encoding="utf-8")
    assert 'title: "Transistor Foundry Expedition' in cff
    assert "github.com/Normansrule/transistor-foundry-expedition" in cff
    assert "normansrule.github.io/transistor-foundry-expedition" in cff
    for page in ["index", "devices", "physics", "circuits", "process", "analog"]:
        html = (ROOT / "site" / f"{page}.html").read_text(encoding="utf-8")
        title = html.split("<title>")[1].split("</title>")[0]
        assert "Transistor Foundry Expedition" in title, page
    setup = (ROOT / "scripts" / "setup_ubuntu.sh").read_text(encoding="utf-8")
    assert 'REPO="${REPO:-transistor-foundry-expedition}"' in setup


def test_navigation_is_generated_and_current():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_nav.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
