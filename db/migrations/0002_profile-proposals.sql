-- Profile proposals: inferred facts staged for per-field human confirmation
-- (WS-0015 S1 / WS-0016). The generated schema marks this migration as applied
-- on a new database via its currentWhen pragma probe; on an existing database,
-- Wrangler runs this file after the snapshot has created the new relation
-- tables. Additive only — no existing table is touched, and no raw document is
-- ever stored here: one structured value plus a short evidence quote per row.
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT NOT NULL,
  profileId TEXT NOT NULL,
  sourceKind TEXT NOT NULL CHECK (sourceKind IN ('text', 'pdf')),
  fieldPath TEXT NOT NULL,
  proposedValue TEXT NOT NULL,
  evidenceExcerpt TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  engine TEXT NOT NULL DEFAULT 'heuristic' CHECK (engine IN ('heuristic', 'model')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'discarded')),
  createdAt TEXT NOT NULL,
  decidedAt TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_profileId_status ON proposals (profileId, status);
