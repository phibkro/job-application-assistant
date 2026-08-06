-- Scheduled assisted applications.
--
-- A premium subscriber points a schedule at one of their saved searches and a
-- cadence. On each due run the search's new matches are shortlisted, a CV and
-- letter are drafted for each, and an assisted application is prepared. The
-- person still submits: a schedule never changes what a platform's terms
-- permit, so nothing here can auto-submit where automation is prohibited or
-- unreviewed.

CREATE TABLE IF NOT EXISTS application_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  saved_search_id TEXT NOT NULL REFERENCES saved_searches(id),

  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),

  -- Every run costs drafting work per vacancy, so a run is bounded rather
  -- than "however many matched". A subscriber who wants more raises this
  -- deliberately instead of discovering an unbounded bill.
  max_per_run INTEGER NOT NULL DEFAULT 5 CHECK (max_per_run BETWEEN 1 AND 25),

  -- 'assisted' prepares the package for the person to send. 'automated' is
  -- honoured only where the platform's recorded policy allows it; anywhere
  -- else the run falls back to assisted and says why.
  method TEXT NOT NULL DEFAULT 'assisted' CHECK (method IN ('assisted', 'automated')),

  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  next_run_at INTEGER NOT NULL,
  last_run_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, saved_search_id)
);

CREATE INDEX IF NOT EXISTS idx_application_schedules_due
  ON application_schedules (enabled, next_run_at);

-- What each run did, so a subscriber can see why a quiet week was quiet:
-- no new matches is a different answer from the budget being exhausted.
CREATE TABLE IF NOT EXISTS application_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id TEXT NOT NULL REFERENCES application_schedules(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  matches_considered INTEGER NOT NULL DEFAULT 0,
  applications_prepared INTEGER NOT NULL DEFAULT 0,
  stopped_reason TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_application_runs_schedule
  ON application_runs (schedule_id, started_at DESC);
