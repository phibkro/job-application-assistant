# RFC 0008: Production-safe environments and deterministic NAV contract testing

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: WS-0005
- Review owners: Human product owner; production-readiness reviewer
- Tracking issue: WS-0005@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Separate local, test, staging, and production Cloudflare configurations. Keep destructive fixture/reset journeys only in disposable environments. Add a dependency-free NAV HTTP stub and exercise the real Worker Fetch adapter against deterministic success, retry, upstream, bounded-input, malformed-input, feed/detail authentication, detail-fallback, cursor, and concurrency scenarios. Production deployment requires a private NAV credential, an administrative bearer token, and a public AGPL corresponding-source URL, then runs only non-destructive smoke tests.

## Motivation

The existing verification pipeline compiles the real Worker and exercises D1 through HTTP, but live NAV failure behavior was partly structural and the deployment smoke suite reset its database. That is appropriate for a disposable prototype environment and unacceptable for production. The project needs executable environment boundaries before corpus maintenance, public API, or user ownership work can safely proceed.

## Goals

- Give local, test, staging, and production distinct Wrangler configuration files and Worker/database identities.
- Make `./deploy` converge only the disposable staging environment.
- Require an explicit production command.
- Disable every demo mutation route in production.
- Keep production smoke tests read-only, except for deliberately rejected unauthorized requests.
- Require a private NAV consumer key and administrative bearer token before production remote mutation.
- Require and expose an HTTPS corresponding-source URL for AGPL network operation.
- Make the NAV base URL configurable only through runtime configuration, defaulting to the official NAV service.
- Run a local deterministic NAV stub during `just verify`.
- Test actual concurrent HTTP synchronization requests against the D1 lease.
- Run all host-safe workspace library unit tests.

## Non-goals

- Browser E2E testing.
- Performance or sustained-load testing.
- D1 restore drills.
- Corpus audit and repair tooling.
- Cloudflare Access, WAF, Queues, Workflows, Pipelines, or Durable Objects.
- A general-purpose mock server framework.

## Guide-level explanation

Developers use `just dev` for a disposable local database and `just verify` for a fresh test database. Verification starts a small local NAV server, points the Worker at it through `NAV_BASE_URL`, and drives the same Fetch adapter used in production.

`./deploy` deploys staging, applies its own migrations, and runs the existing destructive fixture smoke suite against a staging-only D1 database. Production requires `./deploy-production` or `just deploy-production`. That path refuses to begin Cloudflare mutation until private NAV/admin credentials and a corresponding-source URL are present. It first publishes a synchronization-disabled bootstrap version, uploads secrets, and only then publishes the cron-enabled version. After deployment it runs only health, read, source-offer, and authorization-boundary checks.

## Reference-level explanation

Committed Wrangler templates:

```text
wrangler.local.jsonc       local UI and manual experiments
wrangler.test.jsonc        isolated D1 plus deterministic NAV stub
wrangler.staging.jsonc     disposable remote acceptance environment
wrangler.production.jsonc  cron-enabled, non-demo production environment
```

Generated account-specific files remain ignored:

```text
wrangler.staging.deploy.jsonc
wrangler.production.deploy.jsonc
```

Deterministic D1 names default to:

```text
job-index-staging-db
job-index-production-db
```

The Worker reads `NAV_BASE_URL` when present. If absent, it uses `https://pam-stilling-feed.nav.no`. Absolute URLs returned by a source are preserved.

The NAV stub supports scripted scenarios:

```text
happy
slow_happy
detail_404
detail_auth
rate_limit
upstream
auth
malformed
oversized
inactive
updated
token_error
```

The integrated contract smoke proves bounded two-page backfill, tail ETag replay, detail fallback, `Retry-After`, retry deferral, upstream retry classification, oversized-page rejection, terminal feed/detail authentication and malformed failure states, actual lease contention, pause/resume, and cursor restart.

## ADLC and operational impact

WS-0005 is an R2 release-safety slice because it changes deployment targets, credential gates, and the definition of acceptable production evidence. G3 requires explicit environment identities and mutation policies. G4 requires repository configuration checks, NAV-stub contract tests, local Worker+D1 contract smoke, production-smoke source inspection, strict Rust/Wasm gates, and staging/production dry-run bundles. G5 requires an independent review that production cannot execute destructive smoke operations.

This slice is inserted before the previously planned corpus-integrity work. The roadmap change is intentional: trustworthy maintenance tools require a production-safe deployment boundary first.

## Security, privacy, and capabilities

Production deployment requires:

- NAV-issued private `NAV_API_TOKEN`;
- strong `ADMIN_SYNC_TOKEN`;
- HTTPS `SOURCE_CODE_URL`.

Secrets are read from environment or ignored `.dev.vars`, uploaded through Wrangler standard input, and never included in generated evidence. Production configuration disables unauthenticated manual synchronization and the public NAV-token fallback.

The stub contains synthetic data only and binds to loopback. It does not proxy or record real NAV traffic.

## Drawbacks

- Four configuration files contain deliberate duplication.
- Staging remains destructive and must use a dedicated D1 database.
- Production deployment still uses `workers.dev` until a custom domain is selected.
- The standard-library NAV stub models only the contract cases the project currently needs.
- Separate deploy templates increase policy-check surface.

## Rationale and alternatives

**Wrangler named environments in one file:** rejected for now. Separate files make destructive capabilities visually obvious and avoid accidental inheritance between staging and production.

**Use NAV itself in CI:** rejected. It would make tests dependent on an external service, rotating credentials, and mutable production data.

**Adopt WireMock or another mock-server dependency:** rejected. The required contract is small and Python's standard library is already in the pinned environment.

**Keep one deployment smoke suite:** rejected. A smoke test that proves reset behavior cannot also be safe against a production database.

## Unresolved questions

- Whether staging should later run cron continuously or remain an on-demand acceptance environment.
- Whether production should disable `workers.dev` after a custom hostname is configured.
- Whether administrative identity should move from bearer token to Cloudflare Access.
- Whether the NAV stub should evolve into a reusable source-contract harness for additional connectors.

## Implementation plan

1. Add four explicit Wrangler templates and keep `wrangler.jsonc` as the local compatibility alias.
2. Parameterize NAV origin resolution through `NAV_BASE_URL`.
3. Add `/api/about` and expose the corresponding-source link in the UI.
4. Add a loopback NAV stub and direct contract tests.
5. Extend local verification with real Worker+D1+stub adversarial journeys.
6. Run workspace library unit tests.
7. Split staging and production deployment commands and D1 identities.
8. Add production credential/source gates and non-destructive smoke tests.
9. Add environment-safety repository checks and update operator documentation.

## Verification and evidence

Required evidence:

- Environment-safety policy check passes for all Wrangler templates.
- NAV stub self-test passes.
- Administrative-token test proves secrecy, preservation, strength, and mode `0600`.
- `just verify` passes core and Worker library tests.
- Real local Worker reaches the stub tail and then receives `304`.
- `429` honors `Retry-After` and immediate replay is deferred.
- Malformed/authentication failures preserve the cursor and enter terminal failure state.
- Two concurrent HTTP sync requests yield one completed and one busy outcome.
- Production bundle has demo mutation disabled and public token fallback disabled.
- Production smoke performs no successful mutation.
- Staging and production deployment evidence is stored separately.

Evidence is recorded under `evidence/WS-0005/`.

## Rollout and rollback

Rollout first verifies local/test configuration, then deploys staging using the staging-only database. Production is deployed only after private credentials and source URL are configured. Existing demo deployment resources are not reused as production resources.

Rollback redeploys the prior Worker to the same environment-specific D1 database. No schema migration is introduced by this slice. Generated environment deployment configs can be deleted and regenerated.

## Decision record

- 2026-08-05: Inserted production-safe QA boundaries before corpus-integrity work.
- 2026-08-05: Chose separate Wrangler files over inherited environment sections.
- 2026-08-05: Reserved destructive smoke tests for staging.
- 2026-08-05: Required private NAV/admin credentials and AGPL source URL for production.
- 2026-08-05: Chose a dependency-free loopback NAV stub for deterministic adapter tests.
- 2026-08-05: Adopted two-phase production publication so cron cannot run before secrets exist.

## Amendments

None.
