-- Lazy-ingestion freshness gate (WS-0017): one row per platform, the
-- wall-clock stamp of the last ingestion attempt the gate fired. The
-- generated schema marks this migration as applied on a new database via its
-- currentWhen pragma probe; on an existing database, Wrangler runs this file
-- after the snapshot has created the new relation tables. Additive only — no
-- existing table is touched. Not profile-scoped, so erasure never touches it.
CREATE TABLE IF NOT EXISTS ingestion_gate (
  platformId TEXT NOT NULL,
  lastAttemptAt TEXT NOT NULL,
  PRIMARY KEY (platformId)
);
