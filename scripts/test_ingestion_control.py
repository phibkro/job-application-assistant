#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def require(path: str, fragments: list[str]) -> None:
    text = (ROOT / path).read_text(encoding="utf-8")
    for fragment in fragments:
        if fragment not in text:
            errors.append(f"{path} missing ingestion invariant: {fragment!r}")


require(
    "migrations/0004_ingestion_control.sql",
    [
        "lease_owner TEXT",
        "lease_expires_at INTEGER",
        "retry_after_at INTEGER",
        "CREATE TABLE IF NOT EXISTS source_failures",
        "failure_key TEXT NOT NULL UNIQUE",
    ],
)
require(
    "crates/job-index-worker/src/repository.rs",
    [
        "AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?2)",
        "AND mode != 'failed'",
        "WHERE source_id = ?10 AND lease_owner = ?11",
        "attempt_count = source_failures.attempt_count + 1",
        "pub async fn clear_stale_source_lease",
    ],
)
require(
    "crates/job-index-worker/src/sync.rs",
    [
        "const HARD_MAX_PAGES_PER_RUN: usize = 10;",
        "const HARD_MAX_OBSERVATIONS_PER_RUN: usize = 1_000;",
        "const HARD_MAX_DURATION_MS: i64 = 25_000;",
        "release_source_lease(&database, NAV_SOURCE_ID, &lease_owner).await",
        "current.consecutive_failures.saturating_add(1)",
        '"nav_sync_completed"',
        '"nav_sync_failed"',
        "retry_after_seconds=",
    ],
)
require(
    "crates/job-index-worker/src/lib.rs",
    [
        '"/api/sources/nav/pause"',
        '"/api/sources/nav/resume"',
        '"/api/sources/nav/retry"',
        '"/api/sources/nav/restart"',
        '"/api/sources/nav/lease/release"',
    ],
)
require(
    "scripts/smoke.sh",
    [
        "/api/demo/nav/lease",
        'lease["first_acquired"] is True',
        'lease["second_contended"] is True',
        'lease["stale_reclaimed"] is True',
    ],
)

if errors:
    for error in errors:
        print(f"ERROR: {error}")
    raise SystemExit(1)

print("Ingestion-control checks passed: lease, bounds, recovery routes, and telemetry invariants present.")
