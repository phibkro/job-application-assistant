#!/usr/bin/env python3
"""Prove a corpus backup can restore cursor, jobs, searches, and outbox state."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))

with tempfile.TemporaryDirectory(prefix="job-index-restore-") as temp:
    original_path = Path(temp) / "original.sqlite"
    backup_path = Path(temp) / "backup.sqlite"
    restored_path = Path(temp) / "restored.sqlite"
    db = sqlite3.connect(original_path)
    db.execute("PRAGMA foreign_keys=ON")
    for migration in MIGRATIONS:
        db.executescript(migration.read_text())
    with db:
        db.execute("INSERT INTO sources VALUES ('nav','NAV','0')")
        db.execute("INSERT INTO source_state(source_id,cursor,updated_at) VALUES('nav','/api/v1/feed?page=42','42')")
        db.execute("INSERT INTO job_changes(canonical_job_id,change_type,changed_at) VALUES('job-1','created','1')")
        seq = db.execute("SELECT MAX(sequence) FROM job_changes").fetchone()[0]
        db.execute(
            """INSERT INTO canonical_jobs
            (id,canonical_key,title,employer_name,location,description,application_url,
             published_at,status,sequence,first_seen_at,changed_at)
            VALUES('job-1','key-1','Support','Employer','Oslo','Description',
                   'https://example.invalid/1','1','active',?,'1','1')""",
            (seq,),
        )
        db.execute("INSERT INTO principals VALUES('p1','Principal','hash','member','active',20,'1','1')")
        db.execute(
            """INSERT INTO saved_searches
            (id,name,query_signature,definition_json,created_at,updated_at,owner_id)
            VALUES('s1','Search','sig','{}','1','1','p1')"""
        )
    backup = sqlite3.connect(backup_path)
    db.backup(backup)
    backup.close()

    with db:
        db.execute("DELETE FROM saved_searches")
        db.execute("DELETE FROM canonical_jobs")
        db.execute("UPDATE source_state SET cursor='/corrupted'")
    db.close()

    source = sqlite3.connect(backup_path)
    restored = sqlite3.connect(restored_path)
    source.backup(restored)
    source.close()
    restored.execute("PRAGMA foreign_keys=ON")
    cursor = restored.execute("SELECT cursor FROM source_state WHERE source_id='nav'").fetchone()[0]
    jobs = restored.execute("SELECT COUNT(*) FROM canonical_jobs").fetchone()[0]
    searches = restored.execute("SELECT COUNT(*) FROM saved_searches").fetchone()[0]
    violations = list(restored.execute("PRAGMA foreign_key_check"))
    if (cursor, jobs, searches, violations) != ("/api/v1/feed?page=42", 1, 1, []):
        raise SystemExit(f"restore drill failed: {(cursor, jobs, searches, violations)}")
    print("Restore drill passed: cursor, corpus, ownership, and foreign keys recovered")
