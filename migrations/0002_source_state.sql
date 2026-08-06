ALTER TABLE collection_runs ADD COLUMN source_id TEXT;
ALTER TABLE collection_runs ADD COLUMN trigger_type TEXT;
ALTER TABLE collection_runs ADD COLUMN error TEXT;

CREATE TABLE IF NOT EXISTS source_state (
  source_id TEXT PRIMARY KEY REFERENCES sources(id),
  cursor TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  observations_processed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_source
  ON collection_runs(source_id, started_at);
