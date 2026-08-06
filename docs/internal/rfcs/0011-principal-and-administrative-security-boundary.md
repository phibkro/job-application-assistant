# RFC 0011: Principal and administrative security boundary

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: WS-0008
- Review owners: Human product owner; independent production-readiness reviewer
- Tracking issue: WS-0008@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Introduce hashed API keys, quotas, request identifiers, and audit records while retaining the existing administrator secret for operator control.

## Motivation

The executable prototype now has reliable NAV ingestion and production-safe environment boundaries. The next production design needs explicit data trust, public contracts, tenant boundaries, delivery durability, and qualification evidence without adding unrelated infrastructure.

## Goals

- Deliver principal provisioning, revocation, quotas, admin audit.
- Keep every read, mutation, repair, and delivery operation bounded.
- Preserve D1 as the authoritative transactional state.
- Add automated regression evidence and operator documentation.

## Non-goals

- end-user passwords, OAuth provider, or Cloudflare Access automation.
- Introducing Workflows, Queues, Pipelines, Durable Objects, or another database without observed need.

## Guide-level explanation

Operators and API clients use the new capability through a versioned or administrator route. Dangerous operations default to read-only or dry-run behavior. Authenticated resources are scoped by principal identity. Background delivery is separated from match evaluation through a transactional outbox.

## Reference-level explanation

The implementation is introduced by `migrations/0005_production_platform.sql` and the Worker modules `auth.rs`, `maintenance.rs`, `public_api.rs`, `searches.rs`, and `outbox.rs`. The migration is intentionally cohesive because these production boundaries refer to one another through foreign keys and transactional batches.

## ADLC and operational impact

WS-0008 is an R3 security-boundary slice. G4 requires repository checks, migration probes, native unit tests, local Worker+D1 integration, query-plan checks where relevant, and production-safe smoke inspection. G5 remains human-owned and requires external runtime evidence.

## Security, privacy, and capabilities

API keys are stored only as SHA-256 hashes. Administrator and principal mutations are audited. Webhook signing uses HMAC-SHA256. Webhook URLs require HTTPS outside local/test. Full NAV payloads and API secrets are not added to logs or evidence.


## Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Principal-key disclosure | Keys are high-entropy, accepted only over TLS, stored in D1 as SHA-256 hashes, and revocable. | A stolen active key remains usable until revocation; client-side storage remains the consumer's responsibility. |
| Cross-principal object access (IDOR) | Every owned-search, match, subscription, and delivery query includes the authenticated `principal_id`; integration tests exercise cross-principal 404 behavior. | Future routes must preserve owner predicates; repository review remains required. |
| Administrator credential disclosure | Admin operations use a separate high-entropy Worker secret, constant-time comparison, and structured audit records. | The temporary shared admin bearer token is broader than Cloudflare Access and should be replaced when operator count grows. |
| Credential or payload leakage through logs | Secrets are not logged; audit metadata is bounded and excludes tokens and webhook signing secrets. | Unexpected platform/runtime diagnostics must still be reviewed during staging. |
| Webhook SSRF | Production requires HTTPS and rejects localhost plus literal private, loopback, link-local, and unspecified addresses; delivery is time-bounded. | DNS rebinding and public hosts that proxy to private services are not fully eliminated; an allowlist or outbound proxy is the activation threshold for higher-risk tenants. |
| Webhook replay or duplicate delivery | Events carry a stable `X-Job-Index-Event-Id`, payloads may be HMAC-signed, and the outbox is explicitly at-least-once. | Consumers must deduplicate by event ID. |
| Brute-force API-key guessing | Keys have a minimum 32-character provisioning boundary and are compared by hash lookup rather than plaintext scanning. | Application-level request throttling is limited; Cloudflare WAF/rate limiting is required before broad public key issuance. |
| Unauthorized production mutation | Production disables demo routes and requires separate admin or principal credentials; smoke tests are non-destructive. | Misconfigured edge policies remain possible and require release review. |

R3 acceptance requires independent security review, credential-rotation evidence, and human release approval.

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

Required evidence is stored under `evidence/WS-0008/`. Local acceptance requires `just fix && just verify`. Production acceptance additionally requires staging/production deployment evidence and independent review.

## Rollout and rollback

Apply the migration in staging, execute the complete smoke and qualification suite, then deploy production. Rollback redeploys the prior Worker; the additive tables and columns remain backward compatible. Destructive repair and delivery retries are never run implicitly during rollback.

## Decision record

- 2026-08-05: Adopted the bounded D1-first implementation.
- 2026-08-05: Rejected additional Cloudflare infrastructure until activation thresholds are observed.

## Amendments

None.
