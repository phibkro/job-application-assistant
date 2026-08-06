#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))
EXPECTED_TABLES = {
    "sources",
    "collection_runs",
    "canonical_jobs",
    "source_listings",
    "job_changes",
    "source_state",
    "saved_searches",
    "search_matches",
    "source_failures",
    "maintenance_runs",
    "principals",
    "admin_audit_log",
    "webhook_subscriptions",
    "notification_outbox",
    "source_catalog",
    "source_catalog_legacy",
    "users",
    "user_profiles",
    "saved_jobs",
    "application_drafts",
    "applications",
    "application_schedules",
    "application_runs",
    "oauth_states",
}

if not MIGRATIONS:
    raise SystemExit("no SQL migrations found")

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
for migration in MIGRATIONS:
    connection.executescript(migration.read_text(encoding="utf-8"))

tables = {
    row[0]
    for row in connection.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table'"
    )
}
missing = EXPECTED_TABLES - tables
if missing:
    raise SystemExit(f"migration schema missing tables: {sorted(missing)}")

# Validate the constraint used by the runtime atomicity probe. This is a
# SQLite-level migration check; the Worker smoke suite separately proves D1
# batch rollback through the binding.
try:
    with connection:
        connection.execute(
            "INSERT INTO sources (id, name, created_at) VALUES (?, ?, ?)",
            ("migration-atomicity-probe", "Probe", "0"),
        )
        connection.execute(
            """
            INSERT INTO canonical_jobs
            (id, canonical_key, title, employer_name, location, description,
             application_url, published_at, status, sequence, first_seen_at, changed_at)
            VALUES
            ('migration-invalid', 'migration-invalid', NULL, 'Probe', 'Oslo',
             'Probe', 'https://invalid.example', '0', 'active', 999999, '0', '0')
            """
        )
except sqlite3.IntegrityError:
    pass
else:
    raise SystemExit("expected NOT NULL constraint failure did not occur")

count = connection.execute(
    "SELECT COUNT(*) FROM sources WHERE id = 'migration-atomicity-probe'"
).fetchone()[0]
if count != 0:
    raise SystemExit("transaction rollback probe left a partial source row")


# Validate the saved-search ledger and its foreign-key lifecycle.
with connection:
    connection.execute(
        "INSERT INTO sources (id, name, created_at) VALUES ('search-probe-source', 'Probe', '0')"
    )
    connection.execute(
        "INSERT INTO job_changes (canonical_job_id, change_type, changed_at) VALUES ('search-probe-job', 'created', '0')"
    )
    sequence = connection.execute("SELECT MAX(sequence) FROM job_changes").fetchone()[0]
    connection.execute(
        """
        INSERT INTO canonical_jobs
        (id, canonical_key, title, employer_name, location, description,
         application_url, published_at, status, sequence, first_seen_at, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '0', '0')
        """,
        (
            "search-probe-job",
            "search-probe-key",
            "Support",
            "Probe",
            "Oslo",
            "Customer support",
            "https://example.invalid/job",
            "0",
            sequence,
        ),
    )
    connection.execute(
        """
        INSERT INTO saved_searches
        (id, name, query_signature, definition_json, created_at, updated_at)
        VALUES ('search-probe', 'Probe', 'search-probe', '{}', '0', '0')
        """
    )
    connection.execute(
        """
        INSERT INTO search_matches
        (saved_search_id, canonical_job_id, currently_matches,
         matched_job_sequence, first_matched_at, last_evaluated_at)
        VALUES ('search-probe', 'search-probe-job', 1, ?, '0', '0')
        """,
        (sequence,),
    )

match_count = connection.execute(
    "SELECT COUNT(*) FROM search_matches WHERE saved_search_id = 'search-probe'"
).fetchone()[0]
if match_count != 1:
    raise SystemExit("saved-search migration probe did not persist one match")

with connection:
    connection.execute("DELETE FROM saved_searches WHERE id = 'search-probe'")

match_count = connection.execute(
    "SELECT COUNT(*) FROM search_matches WHERE saved_search_id = 'search-probe'"
).fetchone()[0]
if match_count != 0:
    raise SystemExit("saved-search deletion did not cascade to the match ledger")



# Validate conditional source leases, stale-lease reclamation, and failure upsert.
with connection:
    connection.execute(
        "INSERT INTO sources (id, name, created_at) VALUES ('lease-probe', 'Lease Probe', '0')"
    )
    connection.execute(
        "INSERT INTO source_state (source_id, cursor, updated_at) VALUES ('lease-probe', '/api/v1/feed', '0')"
    )
    first = connection.execute(
        """
        UPDATE source_state
        SET lease_owner = 'owner-a', lease_acquired_at = 1000,
            lease_expires_at = 1100, heartbeat_at = 1000
        WHERE source_id = 'lease-probe'
          AND paused = 0
          AND (retry_after_at IS NULL OR retry_after_at <= 1000)
          AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= 1000)
        """
    ).rowcount
    second = connection.execute(
        """
        UPDATE source_state
        SET lease_owner = 'owner-b', lease_acquired_at = 1050,
            lease_expires_at = 1150, heartbeat_at = 1050
        WHERE source_id = 'lease-probe'
          AND paused = 0
          AND (retry_after_at IS NULL OR retry_after_at <= 1050)
          AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= 1050)
        """
    ).rowcount
    stale = connection.execute(
        """
        UPDATE source_state
        SET lease_owner = 'owner-b', lease_acquired_at = 1101,
            lease_expires_at = 1201, heartbeat_at = 1101
        WHERE source_id = 'lease-probe'
          AND paused = 0
          AND (retry_after_at IS NULL OR retry_after_at <= 1101)
          AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= 1101)
        """
    ).rowcount
if (first, second, stale) != (1, 0, 1):
    raise SystemExit(f"lease migration probe failed: {(first, second, stale)}")

with connection:
    connection.execute(
        """
        INSERT INTO source_failures
        (failure_key, source_id, page_url, failure_class, payload_hash,
         message, retryable, first_seen_at, last_seen_at)
        VALUES ('failure-probe', 'lease-probe', '/page', 'network', 'hash',
                'first', 1, '0', '0')
        """
    )
    connection.execute(
        """
        INSERT INTO source_failures
        (failure_key, source_id, page_url, failure_class, payload_hash,
         message, retryable, first_seen_at, last_seen_at)
        VALUES ('failure-probe', 'lease-probe', '/page', 'network', 'hash',
                'second', 1, '1', '1')
        ON CONFLICT(failure_key) DO UPDATE SET
          message = excluded.message,
          attempt_count = source_failures.attempt_count + 1,
          last_seen_at = excluded.last_seen_at,
          resolved_at = NULL
        """
    )
row = connection.execute(
    "SELECT attempt_count, message FROM source_failures WHERE failure_key = 'failure-probe'"
).fetchone()
if row != (2, "second"):
    raise SystemExit(f"failure-ledger upsert probe failed: {row}")


# Validate production principals, ownership, outbox idempotency, and indexes.
with connection:
    connection.execute(
        """
        INSERT INTO principals
        (id, name, api_key_hash, role, status, search_quota, created_at, updated_at)
        VALUES ('principal-probe', 'Probe principal', 'hash-probe', 'member',
                'active', 20, '0', '0')
        """
    )
    connection.execute(
        """
        INSERT INTO saved_searches
        (id, owner_id, name, query_signature, definition_json,
         last_evaluated_sequence, created_at, updated_at)
        VALUES ('owned-search-probe', 'principal-probe', 'Owned probe',
                'owned-probe-signature', '{}', 0, '0', '0')
        """
    )
    connection.execute(
        """
        INSERT INTO webhook_subscriptions
        (id, principal_id, saved_search_id, target_url, secret, active,
         created_at, updated_at)
        VALUES ('subscription-probe', 'principal-probe', 'owned-search-probe',
                'https://example.invalid/hook', '0123456789abcdef', 1, '0', '0')
        """
    )
    connection.execute(
        """
        INSERT INTO notification_outbox
        (dedupe_key, subscription_id, saved_search_id, canonical_job_id,
         transition_kind, job_sequence, payload_json, status, attempts,
         next_attempt_at, created_at)
        VALUES ('dedupe-probe', 'subscription-probe', 'owned-search-probe',
                'search-probe-job', 'added', ?, '{}', 'pending', 0, 0, '0')
        """,
        (sequence,),
    )

try:
    with connection:
        connection.execute(
            """
            INSERT INTO notification_outbox
            (dedupe_key, subscription_id, saved_search_id, canonical_job_id,
             transition_kind, job_sequence, payload_json, status, attempts,
             next_attempt_at, created_at)
            VALUES ('dedupe-probe', 'subscription-probe', 'owned-search-probe',
                    'search-probe-job', 'added', ?, '{}', 'pending', 0, 0, '0')
            """,
            (sequence,),
        )
except sqlite3.IntegrityError:
    pass
else:
    raise SystemExit("notification outbox accepted a duplicate dedupe key")

try:
    with connection:
        connection.execute(
            """
            INSERT INTO principals
            (id, name, api_key_hash, role, status, search_quota, created_at, updated_at)
            VALUES ('invalid-role', 'Invalid', 'invalid-role-hash', 'admin',
                    'active', 20, '0', '0')
            """
        )
except sqlite3.IntegrityError:
    pass
else:
    raise SystemExit("principal role constraint accepted an administrator role")

try:
    with connection:
        connection.execute("DELETE FROM principals WHERE id = 'principal-probe'")
except sqlite3.IntegrityError:
    pass
else:
    raise SystemExit("principal deletion bypassed owned-search foreign-key protection")

with connection:
    connection.execute("DELETE FROM saved_searches WHERE id = 'owned-search-probe'")

subscription_count = connection.execute(
    "SELECT COUNT(*) FROM webhook_subscriptions WHERE id = 'subscription-probe'"
).fetchone()[0]
outbox_count = connection.execute(
    "SELECT COUNT(*) FROM notification_outbox WHERE dedupe_key = 'dedupe-probe'"
).fetchone()[0]
if (subscription_count, outbox_count) != (0, 0):
    raise SystemExit(
        "saved-search deletion did not cascade through subscriptions/outbox: "
        f"{(subscription_count, outbox_count)}"
    )

required_indexes = {
    "idx_saved_searches_owner",
    "idx_principals_key_status",
    "idx_admin_audit_created",
    "idx_outbox_ready",
    "idx_outbox_search_history",
    "idx_webhook_subscriptions_search",
    "idx_canonical_jobs_status_sequence",
    "idx_canonical_jobs_location_nocase_sequence",
    "idx_canonical_jobs_employer_nocase_sequence",
    "idx_job_changes_sequence_type",
}
indexes = {
    row[0]
    for row in connection.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'index'"
    )
}
missing_indexes = required_indexes - indexes
if missing_indexes:
    raise SystemExit(f"migration schema missing indexes: {sorted(missing_indexes)}")


print(f"Migration checks passed: {len(MIGRATIONS)} migration(s), {len(EXPECTED_TABLES)} required tables.")
