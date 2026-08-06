-- The application loop: an account, a shortlist, a CV, drafts, and a submission
-- record — browse -> inspect -> save -> draft -> apply -> repeat.
--
-- Identity reuses the existing principal boundary rather than introducing a
-- second credential system: a person is a principal with a profile attached,
-- so API keys, hashing, revocation, and quotas keep one implementation.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL UNIQUE REFERENCES principals(id),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',

  -- Agent-driven acquisition and drafting cost a browser or model run, so they
  -- are the paid capabilities. Stored per user and checked server-side; a
  -- client-side gate would be no gate at all.
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'premium')),
  subscription_reference TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Set when the person asks to be forgotten. Retained rows are purged by the
  -- maintenance run; the column exists so erasure is a state the schema can
  -- express rather than an ad-hoc delete.
  erasure_requested_at TEXT
);

-- The CV, as structured data rather than a document, so a draft can be
-- composed from it. This is personal data: it is written only by its owner,
-- read only by its owner, and removed with the account.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  languages TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]',
  experience_json TEXT NOT NULL DEFAULT '[]',
  education_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

-- A shortlisted vacancy and where the person has got to with it.
--
-- The vacancy is referenced by id but deliberately NOT by foreign key, and the
-- advert is snapshotted at the moment it was saved. An application is a
-- historical fact about what someone applied to; corpus maintenance that
-- purges a closed advert must not erase it, and a cascade would do exactly
-- that. The live row is joined when it still exists, and the snapshot answers
-- when it does not.
CREATE TABLE IF NOT EXISTS saved_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  canonical_job_id TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT '',
  job_employer TEXT NOT NULL DEFAULT '',
  job_location TEXT NOT NULL DEFAULT '',
  job_application_url TEXT NOT NULL DEFAULT '',
  job_deadline TEXT,
  stage TEXT NOT NULL DEFAULT 'saved'
    CHECK (stage IN ('saved', 'drafted', 'applied', 'closed')),
  note TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, canonical_job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_stage
  ON saved_jobs (user_id, stage, updated_at DESC);

-- Generated CV and letter text, versioned so an edit never destroys what was
-- actually sent.
CREATE TABLE IF NOT EXISTS application_drafts (
  id TEXT PRIMARY KEY,
  saved_job_id TEXT NOT NULL REFERENCES saved_jobs(id),
  kind TEXT NOT NULL CHECK (kind IN ('cv', 'letter')),
  version INTEGER NOT NULL DEFAULT 1,
  -- 'template' composes deterministically from the profile and the advert.
  -- 'model' is the premium path, where a language model tailors the text.
  generator TEXT NOT NULL DEFAULT 'template'
    CHECK (generator IN ('template', 'model')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (saved_job_id, kind, version)
);

-- The submission itself, and what came back.
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  saved_job_id TEXT NOT NULL UNIQUE REFERENCES saved_jobs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  -- 'assisted' hands a finished package to the person, who submits it.
  -- 'automated' submits on their behalf, and is only ever recorded for a
  -- platform whose automation_policy allows it.
  method TEXT NOT NULL CHECK (method IN ('assisted', 'automated')),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'submitted', 'rejected', 'interview', 'offer', 'withdrawn')),
  application_url TEXT NOT NULL DEFAULT '',
  external_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_user_status
  ON applications (user_id, status, updated_at DESC);
