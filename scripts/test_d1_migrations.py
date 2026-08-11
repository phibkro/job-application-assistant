#!/usr/bin/env python3
"""Proves the generated snapshot and ordered D1 migrations compose safely."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "db/schema.sql").read_text()
MIGRATION_NAME = "0001_saved-workspace.sql"
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
  savedJobId TEXT NOT NULL
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
assert migration_names(new_database) == [MIGRATION_NAME]

existing_database = sqlite3.connect(":memory:")
existing_database.executescript(OLD_TABLES)
existing_database.executescript(SCHEMA)
assert migration_names(existing_database) == []
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

print(
    "D1 migration checks passed: new snapshots skip and existing data upgrades safely."
)
