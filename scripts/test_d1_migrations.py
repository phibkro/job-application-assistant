#!/usr/bin/env python3
"""Proves the generated snapshot and ordered D1 migrations compose safely."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "db/schema.sql").read_text()
MIGRATION_NAME = "0001_saved-workspace.sql"
CONSENT_MIGRATION_NAME = "0005_profile-consent.sql"
OBSERVATION_MIGRATION_NAME = "0006_observation-store.sql"
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
CONSENT_MIGRATION = (ROOT / "db/migrations" / CONSENT_MIGRATION_NAME).read_text()

OLD_TABLES = """
CREATE TABLE profiles (
  profileId TEXT NOT NULL PRIMARY KEY,
  cv TEXT NOT NULL,
  erasure TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
INSERT INTO profiles (profileId, cv, erasure, createdAt, updatedAt)
VALUES ('profile-1', '{}', 'Active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
] + [CONSENT_MIGRATION_NAME, OBSERVATION_MIGRATION_NAME]

existing_database = sqlite3.connect(":memory:")
existing_database.executescript(OLD_TABLES)
existing_database.executescript(SCHEMA)
# An old-shape database gains the *later* additive relations (0002, 0003,
# 0004, 0006) from the snapshot itself, so their probes match and those names
# are pre-marked; the 0001 and 0005 upgrades remain for Wrangler's ordered run.
assert migration_names(existing_database) == [name for name, _ in LATER_MIGRATIONS] + [
    OBSERVATION_MIGRATION_NAME
]
existing_database.executescript(MIGRATION)
existing_database.executescript(CONSENT_MIGRATION)
profile = existing_database.execute(
    "SELECT cv, erasure, aiAssist FROM profiles WHERE profileId = 'profile-1'"
).fetchone()
assert profile == ("{}", "Active", 0)
ai_assist_column = existing_database.execute(
    'SELECT name, "notnull", dflt_value FROM pragma_table_info(\'profiles\') WHERE name = \'aiAssist\''
).fetchone()
assert ai_assist_column == ("aiAssist", 1, "0")
try:
    existing_database.execute(
        "INSERT INTO profiles (profileId, cv, erasure, aiAssist, createdAt, updatedAt) "
        "VALUES ('invalid', '{}', 'Active', 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("aiAssist accepted a value outside its checked domain")
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

# WS-0022: 0006 is purely additive and creates exactly the snapshot's objects
# (tables, index, triggers, same SQL text), and its triggers enforce
# append-only storage with one tombstoned purge path.
OBSERVATION_OBJECTS = (
    "observation_tombstones",
    "observations",
    "workload_projection",
    "idx_observations_sourceId_externalId",
    "observation_tombstones_no_update",
    "observation_tombstones_no_delete",
    "observations_no_update",
    "observations_no_delete",
    "observations_no_resurrection",
)


def objects(database: sqlite3.Connection) -> dict[str, str]:
    return {
        name: sql
        for name, sql in database.execute(
            "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL"
        )
        if name in OBSERVATION_OBJECTS
    }


migrated = sqlite3.connect(":memory:")
migrated.executescript((ROOT / "db/migrations" / OBSERVATION_MIGRATION_NAME).read_text())
assert set(objects(migrated)) == set(OBSERVATION_OBJECTS), sorted(objects(migrated))
assert objects(migrated) == objects(new_database), "0006 and the snapshot disagree"
assert any(
    f"'{OBSERVATION_MIGRATION_NAME}'" in line and "pragma_table_info('observations')" in line
    for line in SCHEMA.splitlines()
)

for database in (migrated, new_database):
    database.execute(
        "INSERT INTO observations (id, irVersion, sourceId, externalId, kind, status, dateModified, "
        "recordedSeq, recordedAt, runId, payload) VALUES ('o1', 0, 'nav', 'x', 'FeedEntry', 'ACTIVE', "
        "NULL, 1, '2026-11-01T00:00:00Z', 'run-1', '{}')"
    )
    for statement in (
        "UPDATE observations SET status = 'INACTIVE' WHERE id = 'o1'",
        "DELETE FROM observations WHERE id = 'o1'",
    ):
        try:
            database.execute(statement)
        except sqlite3.IntegrityError as error:
            assert "append-only" in str(error), error
        else:
            raise AssertionError(f"observations accepted: {statement}")
    database.execute(
        "INSERT INTO observation_tombstones (observationId, sourceId, externalId, reason, purgedAt) "
        "SELECT id, sourceId, externalId, 'lawful erasure', '2026-11-02T00:00:00Z' FROM observations WHERE id = 'o1'"
    )
    database.execute("DELETE FROM observations WHERE id = 'o1'")
    database.execute(
        "INSERT INTO observations (id, irVersion, sourceId, externalId, kind, status, dateModified, "
        "recordedSeq, recordedAt, runId, payload) VALUES ('o1', 0, 'nav', 'x', 'FeedEntry', 'ACTIVE', "
        "NULL, 2, '2026-11-03T00:00:00Z', 'run-2', '{}')"
    )
    assert database.execute("SELECT COUNT(*) FROM observations").fetchone() == (0,)
    assert database.execute("SELECT COUNT(*) FROM observation_tombstones").fetchone() == (1,)
    try:
        database.execute("DELETE FROM observation_tombstones")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("a tombstone was deleted")

print(
    "D1 migration checks passed: new snapshots skip and existing data upgrades safely."
)
