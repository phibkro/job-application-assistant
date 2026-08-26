#!/usr/bin/env python3
"""Proves the generated snapshot and ordered D1 migrations compose safely."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "db/schema.sql").read_text()
MIGRATION_NAME = "0001_saved-workspace.sql"
# Later additive migrations (0002 WS-0016, 0003 WS-0017, 0004 WS-0018): a
# fresh snapshot pre-marks each via its currentWhen pragma probe, so the names
# must appear in d1_migrations the moment the snapshot runs. Each entry is
# (migration name, table whose presence the probe keys on) so this test can
# prove the probe actually matches the shape the migration file creates.
LATER_MIGRATIONS = (
    ("0002_profile-proposals.sql", "proposals"),
    ("0003_ingestion-gate.sql", "ingestion_gate"),
    ("0004_documents.sql", "documents"),
)
MIGRATION = (ROOT / "db/migrations" / MIGRATION_NAME).read_text()

OLD_TABLES = """
CREATE TABLE saved_jobs (
  id TEXT NOT NULL PRIMARY KEY,
  profileId TEXT NOT NULL,
  canonicalJobId TEXT NOT NULL,
  jobSnapshot TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  UNIQUE (profileId, canonicalJobId)
);
CREATE TABLE applications (
  id TEXT NOT NULL PRIMARY KEY,
  profileId TEXT NOT NULL,
  savedJobId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
INSERT INTO saved_jobs (id, profileId, canonicalJobId, jobSnapshot, note, createdAt)
VALUES ('saved-1', 'profile-1', 'job-1', '{}', 'keep me', '2026-01-02T03:04:05Z');
"""


def migration_names(database: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in database.execute("SELECT name FROM d1_migrations ORDER BY name")
    ]


new_database = sqlite3.connect(":memory:")
new_database.executescript(SCHEMA)
assert migration_names(new_database) == [MIGRATION_NAME] + [
    name for name, _ in LATER_MIGRATIONS
]

existing_database = sqlite3.connect(":memory:")
existing_database.executescript(OLD_TABLES)
existing_database.executescript(SCHEMA)
# An old-shape database gains the *later* additive relations (0002, 0003,
# 0004) from the snapshot itself, so their probes match and those names are
# pre-marked; only the 0001 upgrade remains for Wrangler's ordered run.
assert migration_names(existing_database) == [name for name, _ in LATER_MIGRATIONS]
existing_database.executescript(MIGRATION)
row = existing_database.execute(
    "SELECT createdAt, updatedAt, note FROM saved_jobs WHERE id = 'saved-1'"
).fetchone()
assert row == ("2026-01-02T03:04:05Z", "2026-01-02T03:04:05Z", "keep me")
indexes = {
    row[0]
    for row in existing_database.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%_profileId_id'"
    )
}
assert indexes == {"idx_saved_jobs_profileId_id", "idx_applications_profileId_id"}

# The pre-mark probes and the migration files cannot drift apart: for every
# later migration, applying its file to a database lacking the probed shape
# must create exactly the shape the snapshot's currentWhen clause looks for.
for later_name, table in LATER_MIGRATIONS:
    probe_database = sqlite3.connect(":memory:")
    probe_database.executescript((ROOT / "db/migrations" / later_name).read_text())
    columns = {
        row[1]
        for row in probe_database.execute(f"PRAGMA table_info('{table}')")
    }
    assert table in {
        row[0]
        for row in new_database.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }, table
    assert columns, (later_name, table)
    # The snapshot marked it applied; the migration file's own CREATE TABLE
    # IF NOT EXISTS is a no-op there — same name in both places.
    assert any(
        f"'{later_name}'" in line and f"pragma_table_info('{table}')" in line
        for line in SCHEMA.splitlines()
    ), later_name

print(
    "D1 migration checks passed: new snapshots skip and existing data upgrades safely."
)
