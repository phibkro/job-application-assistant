CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_signature TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  last_evaluated_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_matches (
  saved_search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  canonical_job_id TEXT NOT NULL REFERENCES canonical_jobs(id) ON DELETE CASCADE,
  currently_matches INTEGER NOT NULL CHECK (currently_matches IN (0, 1)),
  matched_job_sequence INTEGER NOT NULL,
  first_matched_at TEXT NOT NULL,
  last_evaluated_at TEXT NOT NULL,
  PRIMARY KEY (saved_search_id, canonical_job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_signature
  ON saved_searches(query_signature);
CREATE INDEX IF NOT EXISTS idx_search_matches_current
  ON search_matches(saved_search_id, currently_matches, matched_job_sequence);
