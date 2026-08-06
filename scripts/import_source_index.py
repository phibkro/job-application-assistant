#!/usr/bin/env python3
"""Generates the source-catalog seed migration from the researched platform index.

The spreadsheet under research/input/ is the source of truth for which
platforms exist and how they rank. The seed migration is a derivation of it, so
it is generated rather than hand-maintained: editing the SQL by hand would let
the two disagree, and the sheet would stop being authoritative.

Re-run after editing the sheet:

    python3 scripts/import_source_index.py

The output is deterministic for a given sheet, so a no-op edit produces no diff.
Reads the workbook with the standard library because a build-time dependency on
an Excel reader would not survive the pinned Nix environment.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "research/input/norway_oslo_job_platform_index.xlsx"
OUTPUT = ROOT / "migrations/0007_source_catalog_seed.sql"
# Observations recorded by scripts/probe_sources.py. The sheet says which
# platforms exist; the probe says how each one may be read. Both are inputs,
# and this seed is their derivation.
OBSERVATIONS = ROOT / "research/observations/source-probe.json"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# How each platform may be read, and whether it permits automated submission.
#
# The tiers below are recorded from observation, not intention. Every platform
# marked 'agent' was fetched and found to publish no schema.org JobPosting data
# in its server response, because its listings are rendered in the browser —
# so reading it costs a render, which is why it is the paid tier.
#
# Verified 2026-08-06 by requesting each listings URL and inspecting the
# response for JSON-LD: The Hub, Kodejobb, Tekjobb, Jobbnorge, and Webcruiter
# all returned none, as did arbeidsplassen.nav.no and oslo.kommune.no.
#
# Anything absent from this table stays 'unknown' until someone establishes how
# it may be read; ingestion never guesses.
ACQUISITION_TIERS = {
    # Official machine-readable feeds.
    "Arbeidsplassen (NAV)": ("feed", "assisted_only"),
    "EURES": ("feed", "assisted_only"),
    # Rendered in the browser — observed to carry no server-side listing data.
    "Jobbnorge": ("agent", "assisted_only"),
    "Webcruiter": ("agent", "assisted_only"),
    "The Hub": ("agent", "assisted_only"),
    "Kodejobb": ("agent", "assisted_only"),
    "Tekjobb": ("agent", "assisted_only"),
    "Oslo kommune – ledige stillinger": ("agent", "assisted_only"),
    "Politiet – ledige stillinger": ("agent", "assisted_only"),
    "Forsvaret – ledige stillinger": ("agent", "assisted_only"),
    # Terms forbid automated access; reachable only by driving a browser, and
    # never submitted to on a member's behalf.
    "FINN Jobb": ("agent", "prohibited"),
    "LinkedIn Jobs": ("agent", "prohibited"),
    "Indeed Norway": ("agent", "prohibited"),
    "Glassdoor Norway": ("agent", "prohibited"),
}


def cell_values(sheet_xml: bytes, shared: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in ElementTree.fromstring(sheet_xml).iter(f"{NS}row"):
        values: list[str] = []
        for cell in row.iter(f"{NS}c"):
            value = cell.find(f"{NS}v")
            if value is None or value.text is None:
                values.append("")
            elif cell.get("t") == "s":
                values.append(shared[int(value.text)])
            else:
                values.append(value.text)
        if any(value.strip() for value in values):
            rows.append(values)
    return rows


def slug(value: str) -> str:
    normalized = value.strip().lower()
    normalized = normalized.replace("æ", "ae").replace("ø", "o").replace("å", "a")
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized or "unnamed"


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def column(row: list[str], index: int) -> str:
    return row[index].strip() if index < len(row) else ""


def observed_tiers() -> dict[str, tuple[str, str]]:
    """Tiers established by probing, keyed by platform name."""
    if not OBSERVATIONS.exists():
        return {}
    import json

    payload = json.loads(OBSERVATIONS.read_text(encoding="utf-8"))
    tiers: dict[str, tuple[str, str]] = {}
    for platform, record in payload.get("platforms", {}).items():
        tier = record.get("acquisition_tier", "unknown")
        if tier == "unknown":
            continue
        # An observation establishes how a platform may be READ. It says
        # nothing about whether the platform permits automated submission, so
        # that stays unreviewed until a person decides it.
        tiers[platform] = (tier, "unreviewed")
    return tiers


def main() -> None:
    archive = zipfile.ZipFile(WORKBOOK)
    shared = [
        "".join(node.text or "" for node in item.iter(f"{NS}t"))
        for item in ElementTree.fromstring(
            archive.read("xl/sharedStrings.xml")
        ).iter(f"{NS}si")
    ]

    observations = observed_tiers()
    active = cell_values(archive.read("xl/worksheets/sheet2.xml"), shared)[1:]
    legacy = cell_values(archive.read("xl/worksheets/sheet3.xml"), shared)[1:]

    lines = [
        "-- Generated by scripts/import_source_index.py from",
        "-- research/input/norway_oslo_job_platform_index.xlsx. Do not edit by hand:",
        "-- re-run the importer so the sheet stays the single source of truth.",
        "",
    ]

    seen: set[str] = set()
    for row in active:
        platform = column(row, 0)
        if not platform:
            continue
        identifier = slug(platform)
        if identifier in seen:
            continue
        seen.add(identifier)

        # A hand-recorded decision outranks a probe: it carries a reviewed
        # automation policy, which an observation cannot establish.
        tier, policy = ACQUISITION_TIERS.get(
            platform, observations.get(platform, ("unknown", "unreviewed"))
        )
        lines.append(
            "INSERT OR REPLACE INTO source_catalog (\n"
            "  id, platform, category, platform_type, scope, oslo_relevance, language,\n"
            "  listings_url, source_url, priority, confidence, status,\n"
            "  acquisition_tier, automation_policy, requires_premium, notes, verified_at\n"
            ") VALUES (\n"
            f"  {quote(identifier)}, {quote(platform)}, {quote(column(row, 1))},\n"
            f"  {quote(column(row, 2))}, {quote(column(row, 3))}, {quote(column(row, 4))},\n"
            f"  {quote(column(row, 5))}, {quote(column(row, 12))}, {quote(column(row, 13))},\n"
            f"  {quote(column(row, 8))}, {quote(column(row, 15))}, {quote(column(row, 9) or 'active')},\n"
            f"  {quote(tier)}, {quote(policy)}, {1 if tier == 'agent' else 0},\n"
            f"  {quote(column(row, 11))}, {quote(column(row, 14))}\n"
            ");"
        )

    seen_legacy: set[str] = set()
    for row in legacy:
        platform = column(row, 0)
        if not platform:
            continue
        identifier = slug(platform)
        if identifier in seen_legacy:
            continue
        seen_legacy.add(identifier)
        lines.append(
            "INSERT OR REPLACE INTO source_catalog_legacy (\n"
            "  id, platform, current_status, use_instead, reason, replacement_url,\n"
            "  checked_at, confidence\n"
            ") VALUES (\n"
            f"  {quote(identifier)}, {quote(platform)}, {quote(column(row, 1))},\n"
            f"  {quote(column(row, 2))}, {quote(column(row, 3))}, {quote(column(row, 4))},\n"
            f"  {quote(column(row, 5))}, {quote(column(row, 6))}\n"
            ");"
        )

    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    def tier_of(platform: str) -> str:
        return ACQUISITION_TIERS.get(
            platform, observations.get(platform, ("unknown", ""))
        )[0]

    tallies: dict[str, int] = {}
    for row in active:
        name = column(row, 0)
        if name:
            tier = tier_of(name)
            tallies[tier] = tallies.get(tier, 0) + 1
    summary = ", ".join(f"{count} {tier}" for tier, count in sorted(tallies.items()))
    print(
        f"wrote {OUTPUT.relative_to(ROOT)}: {len(seen)} platforms ({summary}), "
        f"{len(seen_legacy)} legacy entries"
    )


if __name__ == "__main__":
    main()
