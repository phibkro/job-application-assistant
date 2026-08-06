# RFC 0014: Production qualification gates

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: WS-0011
- Review owners: Human product owner; independent production-readiness reviewer
- Tracking issue: WS-0011@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Define executable performance, restore, soak, SLO, security, and release gates for first production qualification.

## Motivation

The executable prototype now has reliable NAV ingestion and production-safe environment boundaries. The next production design needs explicit data trust, public contracts, tenant boundaries, delivery durability, and qualification evidence without adding unrelated infrastructure.

## Goals

- Deliver 50k query-plan probe, local restore drill, bounded soak runner, production checklist.
- Keep every read, mutation, repair, and delivery operation bounded.
- Preserve D1 as the authoritative transactional state.
- Add automated regression evidence and operator documentation.

## Non-goals

- claiming live production acceptance without external evidence.
- Introducing Workflows, Queues, Pipelines, Durable Objects, or another database without observed need.

## Guide-level explanation

Operators and API clients use the new capability through a versioned or administrator route. Dangerous operations default to read-only or dry-run behavior. Authenticated resources are scoped by principal identity. Background delivery is separated from match evaluation through a transactional outbox.

## Reference-level explanation

The implementation is introduced by `migrations/0005_production_platform.sql` and the Worker modules `auth.rs`, `maintenance.rs`, `public_api.rs`, `searches.rs`, and `outbox.rs`. The migration is intentionally cohesive because these production boundaries refer to one another through foreign keys and transactional batches.

## ADLC and operational impact

WS-0011 is an R2 production-readiness slice. G4 requires repository checks, migration probes, native unit tests, local Worker+D1 integration, query-plan checks where relevant, and production-safe smoke inspection. G5 remains human-owned and requires external runtime evidence.

## Security, privacy, and capabilities

API keys are stored only as SHA-256 hashes. Administrator and principal mutations are audited. Webhook signing uses HMAC-SHA256. Webhook URLs require HTTPS outside local/test. Full NAV payloads and API secrets are not added to logs or evidence.

## Drawbacks

- The single Worker has a larger API surface.
- D1 remains responsible for both operational and product state.
- Webhook delivery is bounded polling rather than Queue-backed fan-out.

## Rationale and alternatives

A separate service or Cloudflare product was rejected because the current scale and failure evidence do not justify it. The design keeps interfaces modular so delivery or orchestration can move later without changing canonical state semantics.

## Unresolved questions

- When observed volume should trigger Queues for delivery.
- Whether Cloudflare Access should replace the administrator bearer token.
- Whether a second source changes maintenance or deduplication policy.

## Implementation plan

1. Add schema and indexes.
2. Add bounded Worker routes and transactional operations.
3. Extend deterministic local smoke coverage.
4. Add operator and API documentation.
5. Record remaining external qualification gates.

## Verification and evidence

Required evidence is stored under `evidence/WS-0011/`. Local acceptance requires `just fix && just verify`. Production acceptance additionally requires staging/production deployment evidence and independent review.

## Rollout and rollback

Apply the migration in staging, execute the complete smoke and qualification suite, then deploy production. Rollback redeploys the prior Worker; the additive tables and columns remain backward compatible. Destructive repair and delivery retries are never run implicitly during rollback.

## Decision record

- 2026-08-05: Adopted the bounded D1-first implementation.
- 2026-08-05: Rejected additional Cloudflare infrastructure until activation thresholds are observed.

## Amendments

None.


The soak runner evaluates API availability and NAV feed-lag p95 against `ops/slo.json` and fails when the source reports consecutive failures.
