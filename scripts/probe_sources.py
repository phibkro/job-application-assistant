#!/usr/bin/env python3
"""Establishes, per platform, how a machine may read its listings.

The catalogue starts every platform at 'unknown' because guessing is how a
connector ends up violating a platform's terms or silently returning nothing.
This probe replaces guessing with observation: it requests each recorded
listings URL and records what the response actually contains.

    python3 scripts/probe_sources.py                 # probe unknown platforms
    python3 scripts/probe_sources.py --all           # re-probe everything
    python3 scripts/probe_sources.py --limit 20      # bounded run

Findings are written to research/observations/source-probe.json, which
scripts/import_source_index.py reads when generating the seed. The probe never
edits the seed directly: the sheet plus these observations are the inputs, and
the migration is their derivation.

A platform whose server response carries schema.org JobPosting data can be read
with a plain fetch ('scripted'). One that does not needs its page rendered
first ('agent'), which costs a browser run and is therefore the paid tier. A
platform that cannot be reached at all stays 'unknown' — a failed request is
not evidence about how a working one would behave.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "migrations/0007_source_catalog_seed.sql"
OUTPUT = ROOT / "research/observations/source-probe.json"
USER_AGENT = (
    "job-index/1.0 (+https://github.com/phibkro/job-index) listing-format probe; "
    "one request per platform"
)
TIMEOUT_SECONDS = 25
MAX_BYTES = 3_000_000

JSON_LD = re.compile(r'type=["\']application/ld\+json["\']', re.IGNORECASE)
JOB_POSTING = re.compile(r'"@type"\s*:\s*\[?[^]]*"JobPosting"', re.IGNORECASE)


def catalogued() -> list[dict[str, str]]:
    """Reads platform id, name, tier, and listings URL out of the seed."""
    text = SEED.read_text(encoding="utf-8")
    entries: list[dict[str, str]] = []
    for statement in text.split("INSERT OR REPLACE INTO source_catalog (")[1:]:
        if statement.lstrip().startswith("\n  id, platform, current_status"):
            continue
        values = re.search(r"\) VALUES \((.*?)\n\);", statement, re.DOTALL)
        if not values:
            continue
        fields = [
            field.strip().strip("'").replace("''", "'")
            for field in re.split(r",(?=(?:[^']*'[^']*')*[^']*$)", values.group(1))
        ]
        if len(fields) < 14:
            continue
        entries.append(
            {
                "id": fields[0],
                "platform": fields[1],
                "listings_url": fields[7],
                "acquisition_tier": fields[12],
            }
        )
    return entries


def probe(url: str) -> dict[str, object]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read(MAX_BYTES).decode("utf-8", errors="replace")
            status = response.status
    except urllib.error.HTTPError as error:
        return {"reachable": False, "status": error.code, "reason": f"HTTP {error.code}"}
    except Exception as error:  # noqa: BLE001 - any transport failure is the same answer
        return {"reachable": False, "status": None, "reason": type(error).__name__}

    has_json_ld = bool(JSON_LD.search(body))
    has_job_posting = bool(JOB_POSTING.search(body))
    return {
        "reachable": True,
        "status": status,
        "bytes": len(body),
        "json_ld_blocks": has_json_ld,
        "job_posting_data": has_job_posting,
    }


def classify(result: dict[str, object]) -> tuple[str, str]:
    if not result.get("reachable"):
        # Unreachable now says nothing about how a reachable page behaves.
        return "unknown", f"not reachable from the probe ({result.get('reason')})"
    if result.get("job_posting_data"):
        return "scripted", "server response publishes schema.org JobPosting data"
    if result.get("json_ld_blocks"):
        return "agent", "publishes JSON-LD but no JobPosting; needs a rendered page"
    return "agent", "server response carries no listing data; rendered in the browser"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="re-probe every platform")
    parser.add_argument("--limit", type=int, default=0, help="probe at most N platforms")
    arguments = parser.parse_args()

    entries = catalogued()
    if not arguments.all:
        entries = [entry for entry in entries if entry["acquisition_tier"] == "unknown"]
    entries = [entry for entry in entries if entry["listings_url"].startswith("http")]
    if arguments.limit:
        entries = entries[: arguments.limit]
    if not entries:
        print("nothing to probe")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    existing: dict[str, object] = {}
    if OUTPUT.exists():
        existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("platforms", {})

    observed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counts: dict[str, int] = {}
    for index, entry in enumerate(entries, start=1):
        result = probe(entry["listings_url"])
        tier, reason = classify(result)
        counts[tier] = counts.get(tier, 0) + 1
        existing[entry["platform"]] = {
            "id": entry["id"],
            "listings_url": entry["listings_url"],
            "acquisition_tier": tier,
            "reason": reason,
            "observed_at": observed_at,
            "evidence": result,
        }
        print(f"[{index}/{len(entries)}] {entry['platform'][:38]:40} -> {tier:8} {reason}")
        sys.stdout.flush()

    OUTPUT.write_text(
        json.dumps({"platforms": existing}, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    summary = ", ".join(f"{count} {tier}" for tier, count in sorted(counts.items()))
    print(f"\nwrote {OUTPUT.relative_to(ROOT)}: {summary}")
    print("run scripts/import_source_index.py to fold these into the seed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
