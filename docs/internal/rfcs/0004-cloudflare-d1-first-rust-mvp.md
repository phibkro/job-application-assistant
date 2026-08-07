# RFC 0004: Cloudflare D1-first Rust MVP

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: Documentation revision before WS-0001 implementation
- Review owners: Human product owner; technical reviewer
- Tracking issue: Not yet created
- Implementation PR: Not yet created
- Supersedes: RFC 0001; RFC 0002
- Superseded by: None

## Summary

Build the first executable prototype as one Cloudflare Worker written in Rust with `workers-rs`, using Cloudflare D1 as the authoritative store from the first vertical slice. Keep the domain crate independent of Workers and D1 bindings, but do not build or maintain a native SQLite persistence adapter first.

## Motivation

The previous design optimized for the broadest native Rust package compatibility and deferred Cloudflare adaptation. The product owner has instead chosen to validate the intended deployment and persistence environment immediately. Starting with D1 removes a later database migration, exposes Wasm and edge-runtime constraints while the codebase is still small, and ensures that the first demonstrated corpus uses the same storage contract intended for continued development.

## Goals

- Keep product and domain implementation in Rust.
- Use a Rust Cloudflare Worker as the first HTTP and collection runtime.
- Use D1 as the system of record from the first executable commit.
- Preserve a platform-independent domain crate for normalization, identity, deduplication, query semantics, and metrics.
- Manage schema changes as committed SQL migrations.
- Prove local replay and deployed staging behaviour against the D1 binding.
- Keep the first deployment to one Worker and one D1 database.

## Non-goals

- Native Axum, Tokio, SQLx, Reqwest, or embedded SQLite adapters.
- Queues, Workflows, Durable Objects, R2, Vectorize, MCP, OAuth, or email.
- Multi-region write coordination or production availability guarantees.
- Dioxus product UI in the first vertical slice.
- Alchemy or another full IaC layer before the Worker/D1 slice is proven.

## Guide-level explanation

A developer extracts the source release and runs `./deploy`. The exact Nix environment supplies Wrangler, worker-build, Rust, the Wasm target, and all verification tools without installing them into user-level directories. The deployment pipeline first applies the committed migrations to a local D1 development database and runs the Worker locally. A fixture collection request writes source occurrences and canonical jobs through the D1 binding. `GET /api/jobs` returns the resulting jobs with provenance. Replaying the same fixture produces no additional canonical changes.

The same repository configuration can create or bind a staging D1 database and deploy the Worker for a remote smoke test. Local development may use Wrangler's local D1 environment, but application code always talks through the D1 binding rather than opening a SQLite file directly.

## Reference-level explanation

The initial workspace contains:

```text
crates/
  job-index-core/    # pure Rust domain logic
  job-index-worker/  # workers-rs HTTP, Fetch, D1, and runtime adapters
migrations/          # ordered D1 SQL migrations
fixtures/            # deterministic source snapshots
wrangler.jsonc       # Worker and D1 binding configuration
```

The Worker receives a D1 binding named `DB`. Repository interfaces are defined at the domain/application boundary and implemented by a D1 adapter in `job-index-worker`. The core crate must not depend on `worker`, D1, JavaScript, Wasm runtime APIs, or HTTP framework types.

The first D1 schema stores at minimum:

- `source`
- `collection_run`
- `source_listing`
- `canonical_job`
- `job_change`

Every source occurrence is unique by `(source_id, external_id)`. Canonical changes advance a monotonic sequence. Related occurrence, canonical, and change-log writes use D1's supported atomic execution mechanism. Replaying an observation with the same stable identity and normalized content hash is a no-op.

The first dynamic flow is:

```text
fixture request
→ Worker route
→ source adapter
→ pure normalization
→ D1 identity lookup
→ atomic occurrence/canonical/change mutation
→ JSON response
```

The read flow is:

```text
GET /api/jobs
→ Worker route
→ D1 repository
→ canonical jobs + source provenance
→ JSON response
```

Dioxus may later compile to static browser assets served by the same Worker or a separate static site. It is not required to prove the storage and canonicalization path.

## ADLC and operational impact

WS-0001 must be revised before implementation. G3 readiness requires pinned Rust, `wasm32-unknown-unknown`, Workers Rust tooling, Wrangler, a named staging environment, and explicit staging deployment capability. G4 evidence must include local D1 migrations, Wasm compilation, fixture replay, and API verification. G5 acceptance requires a staging Worker/D1 smoke test or an explicit blocked decision when the required Cloudflare capability has not been granted.

Schema changes remain versioned and reviewed. Changes to canonical identity, D1 binding topology, or migration compatibility require an RFC.

## Security, privacy, and capabilities

The first slice stores only public fixture job data. No personal profiles, applications, credentials, or production data are accepted. Remote staging deployment requires a narrowly scoped Cloudflare credential supplied outside the repository.

Any fixture collection mutation endpoint must be disabled outside development/staging or protected by an explicit administrative capability before public exposure. Source credentials must use Worker secrets or equivalent scoped bindings and must never be committed.

## Drawbacks

- All runtime dependencies must compile for `wasm32-unknown-unknown` and the Workers runtime.
- Tokio, native SQLx SQLite connections, and ordinary Reqwest usage are unavailable in the Worker.
- Workers Rust bindings may expose less mature ergonomics than TypeScript-first Cloudflare tooling.
- Local D1 emulation cannot prove every remote operational property, so staging verification is required.
- The prototype now depends on Cloudflare tooling and an account earlier in development.

## Rationale and alternatives

**Native Rust with SQLite first:** superseded. It minimizes initial platform constraints but creates a second persistence adapter and postpones discovery of Worker/D1 incompatibilities.

**TypeScript Worker with D1:** offers the most direct Cloudflare ecosystem path, but violates the selected Rust-first product implementation and duplicates domain semantics.

**Native Rust service accessing D1 remotely:** rejected. D1 is designed to be consumed through Cloudflare bindings; adding a proxy merely recreates a second service boundary without helping the MVP.

**Rust Worker with D1:** selected because it proves the intended storage and deployment model immediately while preserving pure Rust domain logic.

## Prior art

The design retains ports-and-adapters separation while selecting Cloudflare Worker and D1 adapters as the first concrete runtime. The database remains relational and migration-driven, so identity and idempotency invariants are enforced by explicit SQL and repository operations.

## Unresolved questions

- Whether the first remote deployment is managed only by Wrangler configuration or also by an Alchemy stack.
- Whether Dioxus static assets should later be served by the Worker or a separate static deployment.
- Which Workers Rust testing harness offers the best balance between Rust-only tests and realistic runtime verification.

## Future possibilities

- Alchemy-managed Worker, D1, preview, and environment resources.
- R2 raw payload archive.
- Queues for asynchronous normalization and matching.
- Workflows for durable connector runs.
- Dioxus web interface compiled to Wasm.
- MCP and generated SDK adapters over the public API.

## Implementation plan

1. Revise WS-0001 to target a Rust Worker and D1.
2. Scaffold `job-index-core` and `job-index-worker`.
3. Add pinned Worker/Wasm and Wrangler configuration.
4. Add the initial D1 migration and repository adapter.
5. Implement deterministic fixture ingestion and replay safety.
6. Expose provenance-bearing `GET /api/jobs`.
7. Verify local D1 behaviour and deploy a staging Worker/D1 smoke test.
8. Record evidence and update memory projections.

## Verification and evidence

- The core crate compiles and tests without Workers dependencies.
- The Worker crate compiles for `wasm32-unknown-unknown`.
- Repository checks, rustfmt, Clippy, and Rust tests pass.
- Migrations apply to a clean local D1 database.
- First fixture ingestion creates the expected occurrence, canonical, and change counts.
- Identical replay creates zero additional canonical changes.
- `GET /api/jobs` returns source provenance.
- The same migration and smoke flow succeeds against a staging D1 database.
- Exact toolchain versions, deployment revision, Worker URL, and D1 database identity are captured in the evidence bundle.

## Rollout and rollback

The first remote rollout targets an isolated staging Worker and D1 database containing only reproducible fixture data. Rollback restores the previous Worker deployment. Because fixture-derived D1 state is rebuildable, recovery may recreate the staging database and reapply migrations rather than attempting reverse migrations. Destructive migration policy must be defined before non-reproducible or personal data is introduced.

## Decision record

- Decision: Accepted
- Decision date: 2026-08-05
- Decision owner: Human product owner
- Final rationale: D1 is the intended system of record, so the project should discover and design around its runtime constraints from the first executable slice rather than paying for a disposable native persistence adapter.
- Dissent or residual concerns: Rust/Wasm and Workers tooling constraints may increase initial implementation friction; staging credentials become a readiness dependency.
- Required follow-up: Supersede RFC 0001 and RFC 0002, issue WS-0001 revision 2, and update architecture and memory documentation.

## Amendments

- 2026-08-05: The accepted runtime architecture is unchanged. The operator boundary was simplified so exact Nix packages supply Wrangler and worker-build directly, and account-specific D1 identifiers are persisted in an ignored generated config rather than the source template.

- 2026-08-07: Superseded by RFC 0015, which moved the implementation language to TypeScript/Effect for a strangler migration and, at its final stage, retired the Rust Worker this RFC accepted. The Cloudflare D1-first decision itself stands — D1 remains the system of record — only the language implementing it changed. The `crates/`, `migrations/`, and Rust toolchain this RFC's decision record refers to are deleted.
