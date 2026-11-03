"""Licence-check photo candidates against the Wikimedia Commons API.

    python scripts/check_photo_licenses.py           update data/photo_candidates.json
    python scripts/check_photo_licenses.py --dry-run print only

For each candidate it records Artist, LicenseShortName and LicenseUrl and sets status:
  verified   public domain, CC0, CC BY or CC BY-SA (any version)
  rejected   anything else (non-commercial, no-derivatives, fair use, unknown)
  missing    the file does not exist on Commons
Requires network access. Only verified candidates may be copied into data/images.json.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
UA = "transistor-foundry-expedition/1.11 (educational repository; https://github.com/Normansrule/transistor-foundry-expedition)"


def allowed(license_name: str) -> bool:
    """True for licences the project may publish: public domain, CC0, CC BY, CC BY-SA."""
    s = (license_name or "").strip().lower()
    if not s or re.search(r"\b(nc|nd)\b|non-?commercial|no-?deriv|fair use|all rights", s):
        return False
    return bool(re.match(r"^(public domain|pd\b|pd-|cc0|cc[- ]by(-sa)?[- ]?\d|cc[- ]by(-sa)?$)", s))


def strip(s: str) -> str:
    import html
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def lookup(files: list[str]) -> dict:
    out = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        q = {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata",
             "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl", "titles": "|".join("File:" + f for f in chunk)}
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)["query"]
        norm = {n["to"]: n["from"] for n in data.get("normalized", [])}
        for page in data["pages"].values():
            title = norm.get(page["title"], page["title"])[5:]
            if "missing" in page or "imageinfo" not in page:
                out[title] = None
                continue
            m = page["imageinfo"][0].get("extmetadata", {})
            out[title] = {k: strip(m.get(k, {}).get("value")) for k in ("Artist", "LicenseShortName", "LicenseUrl")}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    path = ROOT / "data" / "photo_candidates.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    info = lookup([c["file"] for c in doc["candidates"]])
    for c in doc["candidates"]:
        meta = info.get(c["file"]) or info.get(c["file"].replace(" ", "_"))
        if meta is None:
            c["status"] = "missing"
        else:
            c["author"], c["license"] = meta["Artist"] or None, meta["LicenseShortName"] or None
            c["license_url"] = meta["LicenseUrl"] or None
            c["status"] = "verified" if allowed(c["license"]) else "rejected"
        print(f'{c["status"]:9} {c["license"] or "-":22} {c["file"]}')
    doc["checked"] = dt.date.today().isoformat()
    if not a.dry_run:
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
