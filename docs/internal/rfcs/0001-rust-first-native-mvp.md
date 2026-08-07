# RFC 0001: Rust-first native MVP

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

Build the first job-index prototype as one native Rust application with SQLite. Keep the domain model independent of its HTTP, storage, user-interface, and deployment adapters so a later Cloudflare Workers/D1 implementation remains possible without rewriting the core semantics.

## Motivation

The prototype must prove multi-source ingestion, conservative deduplication, source provenance, incremental matching, and quantitative source value. A Cloudflare Workers-first implementation would impose `wasm32-unknown-unknown` compatibility constraints on Tokio, native SQLite, and parts of the Rust ecosystem before those product claims are proven.

## Goals

- Use Rust for domain logic, API, CLI, collection, and Dioxus UI.
- Preserve a clean boundary between pure domain code and runtime adapters.
- Produce one locally runnable and container-deployable binary.
- Keep a later Workers/D1 adapter architecturally possible.

## Non-goals

- Proving edge deployment or global scale.
- Introducing distributed orchestration, queues, or microservices.
- Guaranteeing that every native dependency compiles for Cloudflare Workers.

## Guide-level explanation

A developer checks out the repository, starts one Rust application, and receives the API and demo UI. Collection can run manually or on a local schedule. The application persists its state in one SQLite file and can be packaged as one OCI container.

## Reference-level explanation

The initial workspace contains:

- A platform-independent core crate for domain types, normalization, identity, query evaluation, and metrics.
- A native application crate using Dioxus, Axum, Tokio, SQLx, Reqwest, and SQLite.
- Connector traits whose implementations return raw observations rather than mutating canonical records directly.
- Explicit adapters for storage, HTTP, clock, hashing, and source collection where testability or portability requires them.

No core domain module may depend on Dioxus, Axum, Tokio, SQLx, Reqwest, or Cloudflare bindings.

## ADLC and operational impact

The first implementation work requires an approved WorkScope and the normal G1–G5 gates. The build must record the Rust toolchain and dependency lockfile. Native deployment evidence is sufficient for the prototype; Workers compatibility is not an acceptance criterion.

## Security, privacy, and capabilities

The prototype uses public job data and local test profiles. Source credentials, when eventually needed, must be injected rather than committed. Collection capabilities remain source-scoped. No automated application submission is permitted.

## Drawbacks

- A later Workers deployment needs new runtime and storage adapters.
- Native hosting requires a persistent volume and server lifecycle management.
- Some work may be duplicated if Cloudflare becomes an immediate deployment requirement.

## Rationale and alternatives

**Workers Rust first:** rejected for the prototype because Wasm compatibility would constrain dependency selection and database access before the product hypothesis is tested.

**TypeScript first:** operationally convenient on Cloudflare, but conflicts with the deliberate Rust-first implementation goal and would duplicate domain types when a Rust client or service is introduced.

**Native Rust first:** selected because it offers the broadest package compatibility and the smallest architecture while preserving adapter boundaries.

## Prior art

The design follows a ports-and-adapters separation: domain semantics remain independent of transport and persistence choices.

## Unresolved questions

- Dioxus fullstack versus a Dioxus web client over explicit Axum routes.
- Exact deployment target for the first public demonstration.

## Future possibilities

- A `workers-rs` and D1 adapter.
- Alchemy-managed Cloudflare resources.
- Browser Run fallback connectors.
- MCP and generated SDK surfaces.

## Implementation plan

1. Scaffold the Rust workspace and CI.
2. Implement fixture ingestion and normalization.
3. Add SQLite occurrence and canonical records.
4. Expose `GET /api/jobs`.
5. Add NAV collection and incremental cursors.
6. Add saved searches and a Dioxus demo UI.

## Verification and evidence

- `cargo fmt --check`, Clippy, and tests pass.
- Domain crate has no native-runtime or web-framework dependencies.
- Replaying one fixture snapshot is idempotent.
- One API response exposes canonical jobs and source provenance.
- One OCI image starts with a persistent SQLite volume.

## Rollout and rollback

The first rollout is a local or single-host demo. Rollback consists of restoring the prior binary and SQLite snapshot. Schema migrations must be versioned and backed up before destructive changes.

## Decision record

- Decision: Accepted
- Decision date: 2026-08-05
- Decision owner: Human product owner
- Final rationale: Native Rust provides the smallest all-Rust path to testing the product hypothesis while preserving future Cloudflare adaptation.
- Dissent or residual concerns: The later Workers adapter remains unproven.
- Required follow-up: Create the implementation WorkScope and scaffold the workspace.

## Amendments

- 2026-08-05: Converted the architectural decision into the repository RFC format without changing its substance.

- 2026-08-05: Superseded by RFC 0004 after the product owner required Cloudflare D1 from the first executable slice.

- 2026-08-07: RFC 0015 moved the implementation language from Rust to TypeScript/Effect; the Rust crates this RFC's chain of decisions led to are deleted from the repository. Nothing else here changes.
