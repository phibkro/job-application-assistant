#!/usr/bin/env python3
"""Deterministic realistic-corpus query-plan and restore qualification."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "db/schema.sql").read_text(encoding="utf-8")
DEFAULT_ROWS = 50_000
PROFILE = "qualification-profile"
OTHER_PROFILE = "qualification-other-profile"
NOW = "2026-08-13T00:00:00.000Z"


def chunks(rows: Iterable[tuple[Any, ...]], size: int = 1_000) -> Iterable[list[tuple[Any, ...]]]:
    batch: list[tuple[Any, ...]] = []
    for row in rows:
        batch.append(row)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def insert_many(database: sqlite3.Connection, statement: str, rows: Iterable[tuple[Any, ...]]) -> None:
    for batch in chunks(rows):
        database.executemany(statement, batch)


def canonical_rows(count: int) -> Iterable[tuple[Any, ...]]:
    for sequence in range(1, count + 1):
        job_id = f"job-{sequence:06d}"
        active = sequence % 10 != 0
        yield (
            job_id,
            f"nav:{sequence:06d}",
            f"Software engineer {sequence % 200}",
            f"Employer {sequence % 500}",
            ["Oslo", "Bergen", "Trondheim", "Remote"][sequence % 4],
            f"Deterministic qualification vacancy {sequence}",
            f"https://example.invalid/jobs/{sequence}",
            f"2026-07-{sequence % 28 + 1:02d}T00:00:00.000Z",
            "2026-09-30T00:00:00.000Z" if active else None,
            "Hydrated" if sequence % 5 == 0 else "Unhydrated",
            "Active" if active else "Closed",
            None if active else NOW,
            sequence,
            NOW,
            json.dumps([{"platformId": "arbeidsplassen-nav", "externalId": str(sequence)}]),
            f"software engineer {sequence % 200}",
            f"employer {sequence % 500}",
            ["oslo", "bergen", "trondheim", "remote"][sequence % 4],
        )


def occurrence_rows(count: int) -> Iterable[tuple[Any, ...]]:
    for sequence in range(1, count + 1):
        yield (
            f"occurrence-{sequence:06d}",
            f"job-{sequence:06d}",
            "nav-feed",
            "arbeidsplassen-nav",
            str(sequence),
            hashlib.sha256(f"vacancy-{sequence}".encode()).hexdigest(),
            0 if sequence % 10 == 0 else 1,
            f"2026-07-{sequence % 28 + 1:02d}T00:00:00.000Z",
            NOW,
        )


def seed(database: sqlite3.Connection, count: int) -> None:
    database.executescript(SCHEMA)
    database.execute("PRAGMA foreign_keys = ON")
    insert_many(
        database,
        "INSERT INTO canonical_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        canonical_rows(count),
    )
    insert_many(database, "INSERT INTO occurrences VALUES (?,?,?,?,?,?,?,?,?)", occurrence_rows(count))
    database.execute("INSERT INTO freshness VALUES (?,?,?)", (PROFILE, count - 500, NOW))

    saved_count = min(1_000, count // 2)
    for profile, offset in ((PROFILE, 0), (OTHER_PROFILE, saved_count)):
        insert_many(
            database,
            "INSERT INTO saved_jobs VALUES (?,?,?,?,?,?,?)",
            (
                (
                    f"saved-{profile}-{index:04d}",
                    profile,
                    f"job-{offset + index + 1:06d}",
                    json.dumps({"title": f"Software engineer {index % 200}"}),
                    f"qualification note {index}",
                    NOW,
                    NOW,
                )
                for index in range(saved_count)
            ),
        )

    labels = [(f"label-{index:02d}", PROFILE, f"Priority {index:02d}", f"priority {index:02d}", NOW, NOW) for index in range(20)]
    database.executemany("INSERT INTO custom_labels VALUES (?,?,?,?,?,?)", labels)
    database.executemany(
        "INSERT INTO label_assignments VALUES (?,?,?,?)",
        [(PROFILE, f"saved-{PROFILE}-{index:04d}", f"label-{index % 20:02d}", NOW) for index in range(saved_count)],
    )

    application_rows: list[tuple[Any, ...]] = []
    active_rows: list[tuple[Any, ...]] = []
    for saved in range(saved_count):
        saved_id = f"saved-{PROFILE}-{saved:04d}"
        for attempt in range(2):
            application_id = f"application-{saved:04d}-{attempt}"
            created = f"2026-08-{attempt + 1:02d}T00:00:{saved % 60:02d}.000Z"
            application_rows.append(
                (
                    application_id, PROFILE, saved_id, f"job-{saved + 1:06d}", "{}", "assisted",
                    "submitted" if attempt == 0 else "ready", f"https://example.invalid/apply/{saved}",
                    "cv", "letter", "qualification", None, f"attempt {attempt}", created, created,
                )
            )
        active_rows.append((saved_id, PROFILE, f"application-{saved:04d}-1", NOW))
    database.executemany("INSERT INTO applications VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", application_rows)
    database.executemany("INSERT INTO active_applications VALUES (?,?,?,?)", active_rows)
    database.commit()


def plan(database: sqlite3.Connection, sql: str, bindings: tuple[Any, ...]) -> list[str]:
    return [str(row[3]) for row in database.execute("EXPLAIN QUERY PLAN " + sql, bindings)]


def timed(database: sqlite3.Connection, sql: str, bindings: tuple[Any, ...], samples: int = 7) -> dict[str, Any]:
    durations: list[float] = []
    rows = 0
    for _ in range(samples):
        started = time.perf_counter()
        rows = len(database.execute(sql, bindings).fetchall())
        durations.append((time.perf_counter() - started) * 1_000)
    if rows == 0:
        raise AssertionError(f"query returned no rows: {sql} {bindings}")
    return {
        "rows": rows,
        "samples": samples,
        "median_ms": round(statistics.median(durations), 3),
        "max_ms": round(max(durations), 3),
    }


def fingerprint(database: sqlite3.Connection) -> str:
    digest = hashlib.sha256()
    tables = [row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    for table in tables:
        columns = [str(row[1]) for row in database.execute(f'PRAGMA table_info("{table}")')]
        order = ", ".join(f'"{column}"' for column in columns)
        digest.update(table.encode())
        for row in database.execute(f'SELECT * FROM "{table}" ORDER BY {order}'):
            digest.update(json.dumps(row, separators=(",", ":"), ensure_ascii=False).encode())
    return digest.hexdigest()


def require_index(name: str, details: list[str], expected: str, allow_sort: bool = False) -> None:
    if not any("SEARCH " in detail and expected in detail for detail in details):
        raise AssertionError(f"{name} did not search with {expected}: {details}")
    if not allow_sort and any("SCAN " in detail or "TEMP B-TREE" in detail for detail in details):
        raise AssertionError(f"{name} added a scan or sorter: {details}")


def qualify(database: sqlite3.Connection, count: int) -> dict[str, Any]:
    cursor = count // 2
    fresh_cursor = count - min(500, count // 4)
    detail_id = f"job-{cursor + 1 if (cursor + 1) % 10 else cursor + 2:06d}"
    saved_id = f"saved-{PROFILE}-{min(500, min(1_000, count // 2) - 1):04d}"
    queries = {
        "browse": ("SELECT * FROM canonical_jobs WHERE sequence > ? ORDER BY sequence ASC LIMIT ?", (cursor, 100), "idx_canonical_jobs_sequence", False),
        "fresh": ("SELECT * FROM canonical_jobs WHERE sequence > ? AND statusTag='Active' ORDER BY sequence DESC LIMIT ?", (fresh_cursor, 100), "idx_canonical_jobs_statusTag_sequence", False),
        "status_search": ("SELECT * FROM canonical_jobs WHERE sequence > ? AND statusTag=? ORDER BY sequence ASC LIMIT ?", (cursor, "Active", 100), "idx_canonical_jobs_statusTag_sequence", False),
        "source_occurrences": ("SELECT * FROM occurrences WHERE sourceId=? AND active=1", ("nav-feed",), "idx_occurrences_sourceId_active", False),
        "detail_occurrence": ("SELECT * FROM occurrences WHERE canonicalJobId=? AND active=1 ORDER BY firstSeenAt ASC LIMIT 1", (detail_id,), "idx_occurrences_canonicalJobId_active_firstSeenAt", False),
        "labels": ("SELECT * FROM custom_labels WHERE profileId=? ORDER BY name COLLATE NOCASE ASC,id ASC", (PROFILE,), "idx_custom_labels_profileId", True),
        "application_history": ("SELECT * FROM applications WHERE profileId=? ORDER BY createdAt DESC", (PROFILE,), "idx_applications_profileId_createdAt", False),
        "saved_application_history": ("""SELECT a.id AS applicationId,a.status,a.method,a.applicationUrl,a.notes,a.createdAt,a.updatedAt,CASE WHEN aa.applicationId IS NULL THEN 0 ELSE 1 END AS isCurrent FROM applications a LEFT JOIN active_applications aa ON aa.profileId=a.profileId AND aa.savedJobId=a.savedJobId AND aa.applicationId=a.id WHERE a.profileId=? AND a.savedJobId=? ORDER BY a.createdAt DESC,isCurrent DESC,a.id DESC""", (PROFILE, saved_id), "idx_applications_profileId_savedJobId_createdAt_id", True),
    }
    report: dict[str, Any] = {}
    for name, (sql, bindings, expected, allow_sort) in queries.items():
        details = plan(database, sql, bindings)
        require_index(name, details, expected, allow_sort)
        report[name] = {"plan": details, "expected_index": expected, **timed(database, sql, bindings)}
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--output", default=".artifacts/qualification/report.json")
    args = parser.parse_args()
    if args.rows < 1_000:
        raise SystemExit("--rows must be at least 1000")

    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="job-index-qualification-") as temporary:
        source_path = Path(temporary) / "source.sqlite"
        restored_path = Path(temporary) / "restored.sqlite"
        database = sqlite3.connect(source_path)
        started = time.perf_counter()
        seed(database, args.rows)
        seed_ms = (time.perf_counter() - started) * 1_000
        query_report = qualify(database, args.rows)
        before = fingerprint(database)
        database.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        restore_started = time.perf_counter()
        restored = sqlite3.connect(restored_path)
        database.backup(restored)
        restore_ms = (time.perf_counter() - restore_started) * 1_000
        restored.execute("PRAGMA foreign_keys = ON")
        after = fingerprint(restored)
        integrity = restored.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_keys = restored.execute("PRAGMA foreign_key_check").fetchall()
        if before != after or integrity != "ok" or foreign_keys:
            raise AssertionError({"before": before, "after": after, "integrity": integrity, "foreign_keys": foreign_keys})
        restored_queries = qualify(restored, args.rows)
        counts = {table: restored.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in ("canonical_jobs", "occurrences", "saved_jobs", "applications", "custom_labels", "label_assignments", "active_applications")}
        report = {
            "schema": "db/schema.sql",
            "corpus_rows": args.rows,
            "seed_ms": round(seed_ms, 3),
            "database_bytes": source_path.stat().st_size,
            "counts": counts,
            "queries": query_report,
            "restore": {
                "duration_ms": round(restore_ms, 3),
                "fingerprint_before": before,
                "fingerprint_after": after,
                "integrity_check": integrity,
                "foreign_key_violations": len(foreign_keys),
                "queries": restored_queries,
            },
        }
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        database.close()
        restored.close()
    print(json.dumps({"status": "passed", "output": str(output.relative_to(ROOT)), "corpus_rows": args.rows, "restore_ms": report["restore"]["duration_ms"]}))


if __name__ == "__main__":
    main()
