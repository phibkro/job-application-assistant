# Progress

## Complete

- AGPL-3.0-or-later licensing and network-source documentation.
- Cybernetic ADLC, RFC process, policy, quality gates, and memory bank.
- Rust/Cloudflare Worker/D1 vertical slice with deterministic canonicalization,
  provenance, exact deduplication, replay idempotency, and rollback probe.
- Nix-based setup, fix, lint, check, test, verify, dev, and deployment workflow.
- Runtime-independent NAV parser and official Fetch adapter.
- Public and private NAV credential setup plus protected admin credential setup.
- D1 source cursor, conditional headers, lifecycle convergence, and source metrics.
- D1 collector lease, bounded multi-page backfill, retry policy, failure ledger,
  recovery controls, and structured telemetry.
- Incremental structured saved searches and match-transition ledger.
- Explicit local, test, staging, and production Wrangler configurations.
- Dependency-free NAV contract stub and executable adversarial adapter tests.
- Actual HTTP lease contention test through the real Worker.
- Separate destructive staging and non-destructive production smoke suites.
- Production credential/source-offer gates and `/api/about` source link.

## WS-0002 through WS-0004 remaining acceptance evidence

- Run Rust formatting, Clippy, unit tests, Wasm build, local D1 smoke, and bundle
  validation on the Nix machine.
- Deploy staging and prove bounded progress to NAV tail with private credentials.
- Record redacted source state, lag, cursor, corpus counts, and structured logs.
- Independent G5 review of feed usage, closure, checkpoint, lease, and retry semantics.

## WS-0005 implementation

- Four explicit environment templates and resource identities.
- Staging-default and explicit-production deployment commands.
- Non-destructive production smoke and AGPL corresponding-source requirement.
- Local NAV stub success/failure scenarios integrated into `just verify`.
- Workspace library tests and environment-safety regression checks.

## Remaining WS-0005 acceptance

- `just fix && just verify` on the pinned Nix environment.
- Staging deployment evidence under `.deploy/staging.json`.
- Production dry-run/review and later deployment evidence under `.deploy/production.json`.
- Independent review that production cannot execute destructive smoke operations.

## WS-0006 through WS-0011 implementation

- Bounded corpus audit and dry-run/apply reconciliation with maintenance records.
- Versioned `/api/v1` jobs, changes, sources, owned searches, and deliveries.
- SHA-256 API-key principals, quotas, revocation, request identifiers, and audit log.
- Principal-owned saved searches with update, delete, reset, evaluation, and isolation.
- Transactional webhook outbox with HMAC-SHA256 signing, bounded delivery, retry,
  dead state, inspection, administrator recovery, and bounded delivered-event retention.
- Staggered production schedules isolate NAV ingestion, saved-search evaluation, and webhook delivery.
- Maintenance rejects malformed requests and records failed reconciliation runs.
- 50,000-job query-plan test, local backup/restore drill, bounded soak runner,
  machine-readable SLOs, OpenAPI contract, and production release checklist.

## Remaining production qualification evidence

- Run `just fix && just verify` with the pinned Nix/Rust/Worker/D1 environment.
- Deploy staging and complete the seven-day soak.
- Complete a live D1 Time Travel or export/restore drill.
- Rotate NAV, administrator, and API-principal credentials against staging.
- Deploy production and retain non-destructive smoke evidence.
- Obtain independent G5 review and human acceptance.
