# WorkScope: First executable job-index vertical slice

- ID: WS-0001
- Revision: 1
- Status: Superseded by WS-0001@2
- Owner: Human product owner
- Risk tier: R2 medium
- Repository/ref: main at the exact head recorded by the execution receipt
- Attempt budget: 3 implementation attempts; stop on unresolved architecture, capability, or data-licensing ambiguity

## Goal

Create the smallest executable Rust system that proves a source observation can be normalized, persisted as a source occurrence and canonical vacancy, replayed idempotently, and exposed through a JSON API.

## User or system outcome

A developer can start one local Rust application, ingest a deterministic fixture snapshot, and retrieve canonical jobs with source provenance from `GET /api/jobs`.

## Acceptance criteria

- [ ] A Rust 2024 workspace contains a platform-independent `job-index-core` crate and a native `job-index-app` crate.
- [ ] The application uses committed deterministic fixture data through a `JobSource` connector interface.
- [ ] Fixture records normalize into typed domain records with stable source and external identities.
- [ ] Versioned SQLx migrations create source, collection-run, source-listing, canonical-job, and job-change state in SQLite.
- [ ] Ingestion persists source occurrences and canonical jobs transactionally.
- [ ] Replaying the identical fixture snapshot creates zero additional canonical changes.
- [ ] `GET /api/jobs` returns canonical jobs with source occurrence provenance.
- [ ] Unit or integration tests prove normalization, persistence, provenance, and replay idempotency.
- [ ] `cargo fmt --check`, Clippy with warnings denied, tests, and repository checks pass.
- [ ] The evidence bundle maps every criterion to commands, tests, and exact repository revisions.

## Exclusions

- Live NAV collection.
- Cross-source fuzzy deduplication beyond exact stable identity needed by the fixture.
- Saved searches and incremental query matching.
- Dioxus UI beyond a placeholder or health page.
- Cloudflare Workers, D1, Alchemy, queues, Workflows, MCP, OAuth, email, and production deployment.
- Personal data and automated job application actions.

## Constraints and invariants

- Follow RFC 0001, RFC 0002, and RFC 0003.
- Domain code must not depend on Axum, Tokio, SQLx, Reqwest, Dioxus, or Cloudflare APIs.
- One source occurrence has at most one current canonical assignment.
- Canonical changes advance a monotonic sequence.
- Processing the same source observation twice is idempotent.
- Database writes that establish one canonical change are transactional.
- No unsafe Rust without a superseding scope and explicit review.

## Required capabilities

- Read and modify the local repository.
- Run Rust toolchain, Cargo, SQLite, and repository verification commands.
- Download crates from the public Rust registry during dependency resolution.
- No production, secret, email, browser-automation, or external mutation capability.

## Required evidence

- Exact baseline and final Git revisions.
- Cargo lockfile and Rust toolchain identity.
- Migration output against a clean temporary database.
- Test and Clippy output.
- Demonstration output for first ingestion and identical replay.
- Example `GET /api/jobs` response.
- Diff summary and documentation-impact statement.

## Supersedes

None.

## Superseded by

WS-0001@2.
