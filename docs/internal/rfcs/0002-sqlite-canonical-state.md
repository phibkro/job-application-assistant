# RFC 0002: SQLite is the prototype system of record

- Status: Superseded
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: Documentation foundation
- Review owners: Human product owner; technical reviewer
- Tracking issue: Not yet created
- Implementation PR: Not yet created
- Supersedes: None
- Superseded by: RFC 0004

## Summary

Use SQLite as the authoritative prototype store for source cursors, collection runs, source occurrences, canonical jobs, change sequences, saved searches, and match state.

## Motivation

The prototype needs transactions, uniqueness constraints, monotonic change cursors, explicit SQL, replay safety, and portable deployment. It does not need a distributed database or independently scaled persistence services.

## Goals

- Maintain one durable and inspectable state store.
- Enforce identity and idempotency using database constraints.
- Support transactional canonical updates and change records.
- Make demo setup, backup, replay, and teardown simple.

## Non-goals

- Multi-region writes.
- Horizontal database scaling.
- High-availability guarantees beyond the single-host prototype.
- Hiding domain queries behind a general-purpose ORM.

## Guide-level explanation

Running the application creates or opens one database file. A developer can inspect it with normal SQLite tools, copy it to preserve a demo state, and restore it without provisioning external infrastructure.

## Reference-level explanation

SQLite stores at minimum:

- `source`
- `source_cursor` or equivalent collection state
- `collection_run`
- `source_listing`
- `canonical_job`
- `job_change`
- `saved_search`
- `search_match`

Every source occurrence is unique by source and external identity. Canonical changes advance a monotonic sequence. Ingestion and matching operations use transactions and uniqueness constraints so replaying an observation cannot create duplicate state.

SQLx manages connections and migrations. Domain repositories expose explicit operations rather than leaking arbitrary SQL into handlers or UI code.

## ADLC and operational impact

Schema changes require versioned migrations, test fixtures, backup/restore evidence, and an RFC when they alter canonical identity or compatibility semantics. Local checks must run migrations against a clean database.

## Security, privacy, and capabilities

The database can contain personal saved-search or application state after the MVP. File permissions, encrypted transport to backups, data minimization, and deletion/export paths are required before real user data is accepted.

## Drawbacks

- Single-writer and single-host constraints may eventually limit throughput or availability.
- A file volume complicates stateless platform deployment.
- Migration to D1 or PostgreSQL requires adapter and SQL compatibility work.

## Rationale and alternatives

**PostgreSQL:** more operational overhead than the prototype requires.

**D1:** aligns with a later Cloudflare deployment but couples the first implementation to Workers constraints.

**In-memory state:** cannot prove durable cursors, replay, or idempotency.

SQLite is selected because it directly satisfies the prototype's strongest data requirements with one deployable file.

## Prior art

SQLite is commonly used as an embedded transactional system of record for local-first and single-node services. Its explicit constraints and transactions fit the canonicalization problem better than an ephemeral cache.

## Unresolved questions

- Whether full-text search is included in the first vertical slice.
- Whether corpus and personal state should be separated into two files before real-user testing.

## Future possibilities

- Separate corpus and account databases.
- D1 adapter for Cloudflare.
- PostgreSQL migration when measured contention or availability requires it.

## Implementation plan

1. Add SQLx migration support.
2. Create occurrence, canonical, and change-sequence tables.
3. Implement transactional repository methods.
4. Add replay and constraint tests.
5. Add saved-search and match tables after corpus ingestion works.

## Verification and evidence

- Migrations apply to an empty database.
- Reapplying a fixture snapshot creates no additional changes.
- A failed canonical update rolls back related writes.
- Backup and restore preserve corpus sequence and provenance.

## Rollout and rollback

Back up the database before every destructive migration. Keep migrations forward-only during the prototype and restore the previous binary/database snapshot when rollback is required.

## Decision record

- Decision: Accepted
- Decision date: 2026-08-05
- Decision owner: Human product owner
- Final rationale: SQLite provides the minimum durable architecture needed to test canonicalization and incremental search.
- Dissent or residual concerns: The migration path to an edge database is deferred.
- Required follow-up: Define and implement the initial migration under the first vertical-slice WorkScope.

## Amendments

- 2026-08-05: Converted the architectural decision into the repository RFC format without changing its substance.

- 2026-08-05: Superseded by RFC 0004 after the product owner required Cloudflare D1 from the first executable slice.
