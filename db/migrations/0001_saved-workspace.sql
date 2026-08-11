-- Preserve existing TypeScript deployments while adding the Saved workspace.
-- The generated schema marks this migration as applied on a new database. On an
-- existing database, Wrangler runs this file after the snapshot has created the
-- new relation tables but left the existing saved_jobs/applications tables in
-- place.
ALTER TABLE saved_jobs ADD COLUMN updatedAt TEXT;
UPDATE saved_jobs SET updatedAt = createdAt WHERE updatedAt IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_jobs_profileId_id ON saved_jobs (profileId, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_profileId_id ON applications (profileId, id);
