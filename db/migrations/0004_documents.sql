-- Studio documents: CV/letter drafts the owner deliberately creates, edits,
-- and keeps (WS-0015 §4 S2 / WS-0018). One document per row; targeted rows
-- freeze the saved vacancy's JobSnapshot alongside jobId, the applications
-- precedent, so a stored document describes the advert as it stood when it
-- was drafted. The generated schema marks this migration as applied on a new
-- database via its currentWhen pragma probe; on an existing database,
-- Wrangler runs this file after the snapshot has created the new relation
-- tables. Additive only — no existing table is touched. Every row is
-- profileId-scoped owner data and joins the erasure sweep's purge batch.
CREATE TABLE IF NOT EXISTS documents (
  id TEXT NOT NULL,
  profileId TEXT NOT NULL,
  jobId TEXT,
  jobSnapshot TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('cv', 'letter')),
  engine TEXT NOT NULL CHECK (engine IN ('template', 'model')),
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (profileId, id)
);

CREATE INDEX IF NOT EXISTS idx_documents_profileId_createdAt ON documents (profileId, createdAt);
