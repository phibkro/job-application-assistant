/**
 * The fixed set of statements this slot sends through `Database`.
 *
 * Named constants, not inline strings, for one reason: `testSupport.ts`'s
 * fake `Database` recognises a statement by importing and comparing against
 * the *same* constant, not by re-deriving or pattern-matching the SQL text.
 * That is the "generate, don't hand-sync" rung applied to a test double —
 * production code and its fake cannot drift apart on what a statement means,
 * because there is only one copy of it.
 */

export const SELECT_CANONICAL_JOB_BY_ID = `
  SELECT id, canonicalKey, title, employerName, location, description, applicationUrl,
         publishedAt, deadline, statusTag, statusClosedAt, sequence, changedAt, sources
  FROM canonical_jobs WHERE id = ?
`;

export const SELECT_NEXT_SEQUENCE = `SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM canonical_jobs`;

export const INSERT_CANONICAL_JOB = `
  INSERT INTO canonical_jobs
    (id, canonicalKey, title, employerName, location, description, applicationUrl,
     publishedAt, deadline, statusTag, statusClosedAt, sequence, changedAt, sources)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const UPDATE_CANONICAL_JOB = `
  UPDATE canonical_jobs SET
    canonicalKey = ?, title = ?, employerName = ?, location = ?, description = ?,
    applicationUrl = ?, publishedAt = ?, deadline = ?, statusTag = ?, statusClosedAt = ?,
    sequence = ?, changedAt = ?, sources = ?
  WHERE id = ?
`;

export const SELECT_OCCURRENCE_BY_ID = `
  SELECT id, canonicalJobId, sourceId, externalId, contentFingerprint, firstSeenAt, lastSeenAt
  FROM occurrences WHERE id = ?
`;

export const INSERT_OCCURRENCE = `
  INSERT INTO occurrences (id, canonicalJobId, sourceId, externalId, contentFingerprint, firstSeenAt, lastSeenAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

export const UPDATE_OCCURRENCE = `
  UPDATE occurrences SET
    canonicalJobId = ?, sourceId = ?, externalId = ?, contentFingerprint = ?, firstSeenAt = ?, lastSeenAt = ?
  WHERE id = ?
`;

export const SELECT_CANONICAL_JOBS_CHANGED_SINCE = `
  SELECT id, canonicalKey, title, employerName, location, description, applicationUrl,
         publishedAt, deadline, statusTag, statusClosedAt, sequence, changedAt, sources
  FROM canonical_jobs WHERE sequence > ? ORDER BY sequence ASC LIMIT ?
`;

/** Fresh, per profile: unseen and still `Active` — offering a closed vacancy serves nobody. */
export const SELECT_FRESH_CANONICAL_JOBS = `
  SELECT id, canonicalKey, title, employerName, location, description, applicationUrl,
         publishedAt, deadline, statusTag, statusClosedAt, sequence, changedAt, sources
  FROM canonical_jobs WHERE sequence > ? AND statusTag = 'Active' ORDER BY sequence DESC LIMIT ?
`;

export const SELECT_FRESHNESS_BY_PROFILE = `SELECT profileId, seenThrough, updatedAt FROM freshness WHERE profileId = ?`;

export const INSERT_FRESHNESS = `INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)`;

export const UPDATE_FRESHNESS = `UPDATE freshness SET seenThrough = ?, updatedAt = ? WHERE profileId = ?`;
