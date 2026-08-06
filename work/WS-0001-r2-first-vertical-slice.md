# WorkScope: First executable job-index vertical slice

- ID: WS-0001
- Revision: 2
- Status: Approved — G1 passed by human product owner on 2026-08-05
- Owner: Human product owner
- Risk tier: R2 medium
- Repository/ref: main at the exact head recorded by the execution receipt
- Attempt budget: 3 implementation attempts; stop on unresolved architecture, capability, Worker-runtime, or data-licensing ambiguity

## Goal

Create the smallest executable Rust Cloudflare Worker that proves a source observation can be normalized, persisted in D1 as a source occurrence and canonical vacancy, replayed idempotently, and exposed through a JSON API.

## User or system outcome

A developer can run the Rust Worker against a local D1 environment, ingest a deterministic fixture snapshot, and retrieve canonical jobs with source provenance from `GET /api/jobs`. The same repository can deploy the slice to an isolated Cloudflare staging Worker backed by D1.

## Acceptance criteria

- [ ] A Rust 2024 workspace contains a platform-independent `job-index-core` crate and a `job-index-worker` crate targeting `wasm32-unknown-unknown`.
- [ ] The Worker uses `workers-rs` and receives D1 through a configured `DB` binding.
- [ ] Committed, ordered D1 SQL migrations create source, collection-run, source-listing, canonical-job, and job-change state.
- [ ] The application uses committed deterministic fixture data through a `JobSource` connector interface.
- [ ] Fixture records normalize into typed domain records with stable source and external identities.
- [ ] Ingestion persists source occurrences, canonical jobs, and change records using D1-supported atomic execution.
- [ ] Replaying the identical fixture snapshot creates zero additional canonical changes.
- [ ] `GET /api/jobs` returns canonical jobs with source occurrence provenance.
- [ ] Unit and integration tests prove normalization, D1 persistence, provenance, rollback or atomic failure behaviour, and replay idempotency.
- [ ] Local D1 migrations and the Worker/API smoke flow succeed through pinned Cloudflare tooling.
- [ ] The same migration and API smoke flow succeeds in an isolated Cloudflare staging environment.
- [ ] `cargo fmt --check`, Clippy with warnings denied, Rust tests, Wasm compilation, and repository checks pass.
- [ ] The evidence bundle maps every criterion to commands, tests, deployment identifiers, and exact repository revisions.

## Exclusions

- Native SQLite, SQLx, Axum, Tokio, Reqwest, a persistent volume, or a native server binary.
- Live NAV collection.
- Cross-source fuzzy deduplication beyond exact stable identity needed by the fixture.
- Saved searches and incremental query matching.
- Dioxus UI beyond static placeholder assets, if any.
- Alchemy, queues, Workflows, Durable Objects, R2, Vectorize, MCP, OAuth, email, and production deployment.
- Personal data and automated job application actions.

## Constraints and invariants

- Follow RFC 0003 and RFC 0004. RFC 0001 and RFC 0002 are superseded.
- Domain code must not depend on `worker`, D1, Wasm runtime APIs, or HTTP framework types.
- Application code must access persistence only through the D1 binding; it must not open a SQLite file directly.
- One source occurrence has at most one current canonical assignment.
- Canonical changes advance a monotonic sequence.
- Processing the same source observation twice is idempotent.
- Database writes that establish one canonical change are atomic under the selected D1 operation.
- Development and staging state contain only committed, reproducible fixtures.
- No unsafe Rust without a superseding scope and explicit review.

## Required capabilities

- Read and modify the local repository.
- Run the pinned Rust toolchain, Cargo, Wasm target, Workers Rust build tooling, Wrangler, and repository verification commands.
- Download crates and pinned JavaScript deployment tooling from public registries during dependency resolution.
- Create and mutate an isolated Cloudflare staging Worker and D1 database using a narrowly scoped credential.
- Bind a temporary local port for Worker/API verification.
- No production, personal-data, email, browser-automation, or unrelated Cloudflare mutation capability.

## Required evidence

- Exact baseline and final Git revisions.
- Cargo lockfile, Rust toolchain, Wasm target, Workers Rust package, and Wrangler identities.
- Local D1 migration output against a clean database.
- Test, Wasm build, Clippy, and repository-check output.
- Demonstration output for first ingestion and identical replay.
- Example `GET /api/jobs` response.
- Staging Worker deployment revision, D1 database identity, migration result, and smoke-test output.
- Diff summary, RFC mapping, security statement, and documentation-impact statement.

## Supersedes

WS-0001@1.
