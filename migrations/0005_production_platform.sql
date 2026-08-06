CREATE TABLE IF NOT EXISTS maintenance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0,1)),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  findings_json TEXT,
  repairs INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('reader','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  search_quota INTEGER NOT NULL DEFAULT 20 CHECK (search_quota BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE saved_searches ADD COLUMN owner_id TEXT REFERENCES principals(id);
ALTER TABLE saved_searches ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  saved_search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  secret TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(principal_id, saved_search_id, target_url)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  saved_search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  canonical_job_id TEXT NOT NULL REFERENCES canonical_jobs(id) ON DELETE CASCADE,
  transition_kind TEXT NOT NULL CHECK (transition_kind IN ('added','updated','removed','closed')),
  job_sequence INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','delivered','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_owner
  ON saved_searches(owner_id, deleted_at, created_at);
CREATE INDEX IF NOT EXISTS idx_principals_key_status
  ON principals(api_key_hash, status);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(created_at, id);
CREATE INDEX IF NOT EXISTS idx_outbox_ready
  ON notification_outbox(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_outbox_search_history
  ON notification_outbox(saved_search_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_search
  ON webhook_subscriptions(saved_search_id, active);

CREATE INDEX IF NOT EXISTS idx_canonical_jobs_status_sequence
  ON canonical_jobs(status, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_jobs_location_nocase_sequence
  ON canonical_jobs(location COLLATE NOCASE, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_jobs_employer_nocase_sequence
  ON canonical_jobs(employer_name COLLATE NOCASE, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_job_changes_sequence_type
  ON job_changes(sequence, change_type);
