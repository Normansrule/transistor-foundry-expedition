"""The site credits a real teaching-cleanroom run but names no specific course or class."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# course codes such as "EE143", "EE 130" or "EE230A", and section or group labels from a class roster
PATTERN = re.compile(r"\bEE ?\d{3}[A-Z]?\b|\bee\d{3}|Tuesday section|Group 1\b|inst\.eecs", re.IGNORECASE)
SKIP_DIRS = {".git", ".venv", "node_modules", "qa-out", "dist", "__pycache__"}
TEXT = {".py", ".js", ".mjs", ".json", ".md", ".html", ".css", ".csv", ".cff", ".txt", ".yml", ".yaml", ".toml"}


def test_no_course_or_class_is_named():
    hits = []
    for p in ROOT.rglob("*"):
        if p.suffix not in TEXT or any(part in SKIP_DIRS for part in p.parts) or p.name == Path(__file__).name:
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            m = PATTERN.search(line)
            if m:
                hits.append(f"{p.relative_to(ROOT)}:{i}: {m.group(0)}")
    assert not hits, hits[:20]
