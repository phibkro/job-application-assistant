-- Sign in with LinkedIn.
--
-- LinkedIn's self-serve OpenID Connect product returns identity only: subject,
-- name, email, picture. Work history is not available to it — the profile
-- scopes that carried positions are partner-gated — so this shortens signup
-- and nothing more. The CV is still entered by the person.
--
-- Job listings are deliberately absent for the same reason: there is no public
-- jobs API, the partner programmes that carry job data are closed to new
-- applicants, and the catalogue already records LinkedIn as prohibited for
-- automated submission.

ALTER TABLE users ADD COLUMN linkedin_subject TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';

-- A LinkedIn identity maps to exactly one account. Partial so accounts that
-- never link stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linkedin_subject
  ON users (linkedin_subject) WHERE linkedin_subject IS NOT NULL;

-- Short-lived authorisation state, so a callback cannot be replayed or forged
-- by a third party who guesses the redirect.
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'linkedin',
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states (created_at);
