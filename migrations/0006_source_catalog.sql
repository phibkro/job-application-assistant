-- Source catalog: the researched platform index as queryable state.
--
-- The index lives in research/input/platform-index.csv, which
-- no running code could read. Ingestion needs three facts per platform before
-- it touches it: how a machine may read its listings, whether that platform
-- permits automated submission, and whether reaching it costs an agent run.
-- Guessing any of those at request time is how a connector ends up violating a
-- platform's terms, so they are recorded here and seeded from the sheet.

CREATE TABLE IF NOT EXISTS source_catalog (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  category TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  oslo_relevance TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  listings_url TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',

  -- How a machine may read listings. 'feed' is an official machine-readable
  -- endpoint, 'scripted' a deterministic HTTP/HTML adapter we maintain,
  -- 'agent' a browser session driven per visit, and 'unknown' means nobody has
  -- established it yet. Ingestion refuses to invent one.
  acquisition_tier TEXT NOT NULL DEFAULT 'unknown'
    CHECK (acquisition_tier IN ('feed', 'scripted', 'agent', 'unknown')),

  -- Whether the platform permits automated application submission. Default is
  -- the restrictive answer: an unreviewed platform is never auto-applied to.
  automation_policy TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (automation_policy IN ('allowed', 'assisted_only', 'prohibited', 'unreviewed')),

  -- Agent-driven acquisition costs a browser run, so it is a paid capability.
  requires_premium INTEGER NOT NULL DEFAULT 0 CHECK (requires_premium IN (0, 1)),

  notes TEXT NOT NULL DEFAULT '',
  verified_at TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_source_catalog_tier
  ON source_catalog (acquisition_tier, priority);
CREATE INDEX IF NOT EXISTS idx_source_catalog_category
  ON source_catalog (category, platform);

-- Platforms that merged, rebranded, or went dark, with what replaced them.
-- Kept so a stale bookmark resolves to the live platform instead of silently
-- returning nothing.
CREATE TABLE IF NOT EXISTS source_catalog_legacy (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  current_status TEXT NOT NULL DEFAULT '',
  use_instead TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  replacement_url TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT ''
);
