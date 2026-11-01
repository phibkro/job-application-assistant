-- WS-0022 (TB-01): the append-only, content-addressed observation store and the
-- rebuildable workload projection. Additive only: no existing table is touched,
-- and nothing existing reads these tables. The generated snapshot marks this
-- migration as applied on a new database via its currentWhen probe; on an
-- existing database, Wrangler runs this file after the snapshot.
--
-- Append-only is enforced by SQLite triggers (D1 accepts CREATE TRIGGER; probed
-- in apps/worker/src/observations/triggerProbe.live.test.ts). The one lawful
-- purge path writes an observation_tombstones row, then deletes the observation.
-- The tombstone keeps the purged recordedSeq, and INSERT guards make a replay a
-- no-op, reject an overwrite (INSERT OR REPLACE included: D1 runs REPLACE's
-- implicit delete without delete triggers) and reject a recordedSeq that does
-- not exceed every sequence ever issued (WS-0022 review round 1: R1, R2). This
-- file was amended before it reached main or any deployed database.
-- Rollback (WS-0022 L2): dropping these tables loses the as-of history recorded
-- since deployment; NAV's detail endpoint returns only the newest version, so
-- observations are not fully rebuildable from the source.
CREATE TABLE IF NOT EXISTS observation_tombstones (
  observationId TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  externalId TEXT NOT NULL,
  recordedSeq INTEGER NOT NULL CHECK (recordedSeq >= 1),
  reason TEXT NOT NULL CHECK (length(reason) > 0),
  purgedAt TEXT NOT NULL,
  PRIMARY KEY (observationId),
  UNIQUE (recordedSeq)
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT NOT NULL,
  irVersion INTEGER NOT NULL CHECK (irVersion IN (0)),
  sourceId TEXT NOT NULL,
  externalId TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('FeedEntry', 'Detail', 'StatusOnly')),
  status TEXT NOT NULL,
  dateModified TEXT,
  recordedSeq INTEGER NOT NULL CHECK (recordedSeq >= 1),
  recordedAt TEXT NOT NULL,
  runId TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (recordedSeq)
);

CREATE INDEX IF NOT EXISTS idx_observations_sourceId_externalId ON observations (sourceId, externalId);

CREATE TABLE IF NOT EXISTS workload_projection (
  canonicalJobId TEXT NOT NULL,
  workloadState TEXT NOT NULL CHECK (workloadState IN ('Stated', 'Derived', 'Negotiable', 'Conflicting', 'Unknown', 'TempUnknown', 'Unsupported')),
  workloadMin REAL,
  workloadMax REAL,
  workloadMethod TEXT NOT NULL,
  PRIMARY KEY (canonicalJobId)
);

CREATE TRIGGER IF NOT EXISTS observation_tombstones_no_update BEFORE UPDATE ON observation_tombstones BEGIN SELECT RAISE(ABORT, 'observation tombstones are permanent'); END;
CREATE TRIGGER IF NOT EXISTS observation_tombstones_no_delete BEFORE DELETE ON observation_tombstones BEGIN SELECT RAISE(ABORT, 'observation tombstones are permanent'); END;
CREATE TRIGGER IF NOT EXISTS observation_tombstones_no_replace BEFORE INSERT ON observation_tombstones WHEN EXISTS (SELECT 1 FROM observation_tombstones WHERE observationId = NEW.observationId OR recordedSeq = NEW.recordedSeq) BEGIN SELECT RAISE(ABORT, 'observation tombstones are permanent'); END;
CREATE TRIGGER IF NOT EXISTS observations_no_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT, 'observations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS observations_no_delete BEFORE DELETE ON observations WHEN NOT EXISTS (SELECT 1 FROM observation_tombstones WHERE observationId = OLD.id AND recordedSeq = OLD.recordedSeq) BEGIN SELECT RAISE(ABORT, 'observations are append-only; purge writes a tombstone first'); END;
CREATE TRIGGER IF NOT EXISTS observations_no_resurrection BEFORE INSERT ON observations WHEN EXISTS (SELECT 1 FROM observation_tombstones WHERE observationId = NEW.id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER IF NOT EXISTS observations_replay_is_noop BEFORE INSERT ON observations WHEN EXISTS (SELECT 1 FROM observations WHERE id = NEW.id AND irVersion IS NEW.irVersion AND sourceId IS NEW.sourceId AND externalId IS NEW.externalId AND kind IS NEW.kind AND status IS NEW.status AND dateModified IS NEW.dateModified AND payload IS NEW.payload) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER IF NOT EXISTS observations_no_overwrite BEFORE INSERT ON observations WHEN EXISTS (SELECT 1 FROM observations WHERE id = NEW.id AND NOT (irVersion IS NEW.irVersion AND sourceId IS NEW.sourceId AND externalId IS NEW.externalId AND kind IS NEW.kind AND status IS NEW.status AND dateModified IS NEW.dateModified AND payload IS NEW.payload)) BEGIN SELECT RAISE(ABORT, 'observations are append-only; an id names one content'); END;
CREATE TRIGGER IF NOT EXISTS observations_seq_monotone BEFORE INSERT ON observations WHEN NOT EXISTS (SELECT 1 FROM observations WHERE id = NEW.id) AND NOT EXISTS (SELECT 1 FROM observation_tombstones WHERE observationId = NEW.id) AND NEW.recordedSeq <= MAX(COALESCE((SELECT MAX(recordedSeq) FROM observations), 0), COALESCE((SELECT MAX(recordedSeq) FROM observation_tombstones), 0)) BEGIN SELECT RAISE(ABORT, 'recordedSeq must exceed every sequence ever issued, purged ones included'); END;

