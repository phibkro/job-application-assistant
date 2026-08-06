PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  observations INTEGER NOT NULL DEFAULT 0,
  canonical_changes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS canonical_jobs (
  id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  employer_name TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  application_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  deadline TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  sequence INTEGER NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_listings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  canonical_job_id TEXT NOT NULL REFERENCES canonical_jobs(id),
  content_fingerprint TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS job_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_job_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'closed', 'reopened')),
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_listings_canonical
  ON source_listings(canonical_job_id);
CREATE INDEX IF NOT EXISTS idx_canonical_jobs_sequence
  ON canonical_jobs(sequence);
CREATE INDEX IF NOT EXISTS idx_job_changes_canonical
  ON job_changes(canonical_job_id, sequence);
