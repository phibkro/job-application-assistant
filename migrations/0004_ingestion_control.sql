ALTER TABLE source_state ADD COLUMN mode TEXT NOT NULL DEFAULT 'backfill';
ALTER TABLE source_state ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE source_state ADD COLUMN lease_owner TEXT;
ALTER TABLE source_state ADD COLUMN lease_acquired_at INTEGER;
ALTER TABLE source_state ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE source_state ADD COLUMN heartbeat_at INTEGER;
ALTER TABLE source_state ADD COLUMN retry_after_at INTEGER;
ALTER TABLE source_state ADD COLUMN last_failure_class TEXT;
ALTER TABLE source_state ADD COLUMN last_feed_modified_at INTEGER;
ALTER TABLE source_state ADD COLUMN last_run_duration_ms INTEGER NOT NULL DEFAULT 0;

ALTER TABLE collection_runs ADD COLUMN pages INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN cursor_before TEXT;
ALTER TABLE collection_runs ADD COLUMN cursor_after TEXT;
ALTER TABLE collection_runs ADD COLUMN lease_owner TEXT;

CREATE TABLE IF NOT EXISTS source_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  failure_key TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL REFERENCES sources(id),
  run_id INTEGER REFERENCES collection_runs(id),
  page_url TEXT NOT NULL,
  item_id TEXT,
  failure_class TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  retryable INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_failures_open
  ON source_failures(source_id, resolved_at, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_source_state_lease
  ON source_state(lease_expires_at, retry_after_at, paused);
