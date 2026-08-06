#!/usr/bin/env python3
"""Seed a realistic SQLite corpus and verify production query plans stay indexed."""
from __future__ import annotations

import sqlite3
import statistics
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))
JOB_COUNT = 50_000

with tempfile.TemporaryDirectory(prefix="job-index-query-plan-") as temp:
    path = Path(temp) / "corpus.sqlite"
    db = sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    for migration in MIGRATIONS:
        db.executescript(migration.read_text())

    db.execute("INSERT INTO sources VALUES ('nav','NAV','0')")
    changes = [(f"job-{i}", "created", str(i)) for i in range(1, JOB_COUNT + 1)]
    db.executemany(
        "INSERT INTO job_changes(canonical_job_id,change_type,changed_at) VALUES(?,?,?)",
        changes,
    )
    jobs = [
        (
            f"job-{i}", f"key-{i}", f"Support Engineer {i}",
            f"Employer {i % 200}", "Oslo" if i % 3 else "Bergen",
            "Customer support and technical operations", f"https://example.invalid/{i}",
            str(i), "active" if i % 7 else "closed", i, "0", str(i),
        )
        for i in range(1, JOB_COUNT + 1)
    ]
    db.executemany(
        """INSERT INTO canonical_jobs
        (id,canonical_key,title,employer_name,location,description,application_url,
         published_at,status,sequence,first_seen_at,changed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        jobs,
    )
    db.executemany(
        """INSERT INTO source_listings
        (id,source_id,external_id,canonical_job_id,content_fingerprint,active,first_seen_at,last_seen_at)
        VALUES(?,?,?,?,?,?,?,?)""",
        [
            (f"occ-{i}", "nav", str(i), f"job-{i}", f"fp-{i}", 0 if i % 7 == 0 else 1, "0", str(i))
            for i in range(1, JOB_COUNT + 1)
        ],
    )
    db.commit()
    db.execute("ANALYZE")

    plans = {
        "api_active_jobs": (
            """EXPLAIN QUERY PLAN
            SELECT cj.id, GROUP_CONCAT(DISTINCT sl.source_id)
            FROM canonical_jobs cj
            LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
            WHERE cj.status=? AND cj.sequence<?
            GROUP BY cj.id ORDER BY cj.sequence DESC, cj.id LIMIT 100""",
            ("active", JOB_COUNT),
            "idx_canonical_jobs_status_sequence",
        ),
        "changes": (
            "EXPLAIN QUERY PLAN SELECT sequence FROM job_changes WHERE sequence>? ORDER BY sequence LIMIT 100",
            (JOB_COUNT - 1000,),
            "idx_job_changes_sequence_type",
        ),
        "api_location": (
            """EXPLAIN QUERY PLAN
            SELECT cj.id, GROUP_CONCAT(DISTINCT sl.source_id)
            FROM canonical_jobs cj
            LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
            WHERE cj.location=? COLLATE NOCASE
            GROUP BY cj.id ORDER BY cj.sequence DESC, cj.id LIMIT 100""",
            ("oslo",),
            "idx_canonical_jobs_location_nocase_sequence",
        ),
        "api_employer": (
            """EXPLAIN QUERY PLAN
            SELECT cj.id, GROUP_CONCAT(DISTINCT sl.source_id)
            FROM canonical_jobs cj
            LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
            WHERE cj.employer_name=? COLLATE NOCASE
            GROUP BY cj.id ORDER BY cj.sequence DESC, cj.id LIMIT 100""",
            ("employer 42",),
            "idx_canonical_jobs_employer_nocase_sequence",
        ),
        "owner_searches": (
            "EXPLAIN QUERY PLAN SELECT id FROM saved_searches WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at LIMIT 20",
            ("principal",),
            "idx_saved_searches_owner",
        ),
        "outbox": (
            "EXPLAIN QUERY PLAN SELECT id FROM notification_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY id LIMIT 20",
            (0,),
            "idx_outbox_ready",
        ),
        "outbox_search_history": (
            "EXPLAIN QUERY PLAN SELECT id FROM notification_outbox WHERE saved_search_id=? AND id<? ORDER BY id DESC LIMIT 100",
            ("search", 1000),
            "idx_outbox_search_history",
        ),
    }
    for name, (sql, params, expected) in plans.items():
        rendered = " | ".join(str(row) for row in db.execute(sql, params))
        if expected not in rendered:
            raise SystemExit(f"{name} query is not using {expected}: {rendered}")

    query = "SELECT id,title FROM canonical_jobs WHERE status='active' AND sequence<? ORDER BY sequence DESC LIMIT 100"
    timings: list[float] = []
    for _ in range(50):
        started = time.perf_counter()
        list(db.execute(query, (JOB_COUNT,)))
        timings.append((time.perf_counter() - started) * 1000)
    p95 = statistics.quantiles(timings, n=20)[18]
    if p95 > 50:
        raise SystemExit(f"indexed read p95 too slow in local SQLite probe: {p95:.2f}ms")

    text_query = """SELECT id FROM canonical_jobs
        WHERE lower(title || ' ' || description) LIKE '%' || lower(?) || '%'
        ORDER BY sequence DESC LIMIT 100"""
    text_timings: list[float] = []
    for _ in range(20):
        started = time.perf_counter()
        list(db.execute(text_query, ("support",)))
        text_timings.append((time.perf_counter() - started) * 1000)
    text_p95 = statistics.quantiles(text_timings, n=20)[18]
    if text_p95 > 100:
        raise SystemExit(
            f"bounded substring read p95 too slow in local SQLite probe: {text_p95:.2f}ms"
        )
    print(
        f"Query-plan checks passed: {JOB_COUNT} jobs, "
        f"indexed_p95={p95:.2f}ms, substring_p95={text_p95:.2f}ms"
    )
