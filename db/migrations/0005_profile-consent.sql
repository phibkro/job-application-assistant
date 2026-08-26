-- WS-0019: the AI-consent dimension on the account's own row.
-- Fresh databases get the column from the pre-marked snapshot; existing
-- databases are migrated by Wrangler. DEFAULT 0 is the consent default-OFF
-- rollout: every existing account starts with model processing disallowed.
ALTER TABLE profiles ADD COLUMN aiAssist INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1));
