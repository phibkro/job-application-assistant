# Execution plan: WS-0001@2

## Baseline

- Repository/ref: `main`; exact commit captured at G3 readiness
- Environment: local Linux container with pinned Rust, Wasm, Workers Rust, and Wrangler toolchains
- Governing architecture: RFC 0004
- Known failing checks: none; `./scripts/check.sh` currently passes

## Proposed changes

1. Add `rust-toolchain.toml`, workspace `Cargo.toml`, formatting/lint policy, dependency policy skeleton, and pinned Cloudflare deployment tooling.
2. Create `crates/job-index-core` with domain types, source observation types, normalization contract, deterministic identities, and no Worker dependencies.
3. Create `crates/job-index-worker` with `workers-rs`, HTTP routes, D1 repository adapter, fixture connector, and collection operation.
4. Add `wrangler.jsonc` with a D1 `DB` binding and separate local/staging configuration.
5. Add ordered D1 migrations for sources, collection runs, source listings, canonical jobs, and the change sequence.
6. Add fixture data representing at least two source occurrences and one canonical result with provenance.
7. Add tests for normalization, D1 constraints/atomicity, provenance, and identical replay.
8. Run the local D1/Worker demonstration, then deploy the same slice to isolated staging and repeat the smoke flow.
9. Update memory-bank and public/internal reference documentation to match the executable state.
10. Produce an evidence bundle for G4/G5 review.

## Alternatives considered

- Native SQLite first: superseded by RFC 0004 because it delays the intended persistence and deployment constraints.
- TypeScript Worker: more mature Cloudflare ergonomics but violates the Rust-first product decision.
- One crate: smaller initially but weakens the verified runtime-independent domain boundary.
- Dioxus immediately: adds interface complexity before the D1 ingestion and identity path is proven.
- Live NAV immediately: introduces network, cursor, and external-data failure modes before local semantics are stable.

## Risks and mitigations

- **Workers Rust or Wasm incompatibility:** keep `job-index-core` dependency-light, pin versions, and compile the Worker target at the start of the slice.
- **D1 API assumptions are wrong:** implement the smallest repository spike first and verify migration, atomic write, and query semantics before broader scaffolding.
- **Local and remote D1 differ:** require both local integration evidence and a staging smoke test.
- **Over-engineered domain abstractions:** implement only interfaces exercised by the vertical slice.
- **Identity semantics become accidental:** encode stable source identity and canonical sequence invariants in tests.
- **Deployment credentials are unavailable:** stop at G3/G4 with explicit blocked evidence rather than substituting native SQLite.
- **Public mutation endpoint is exposed:** restrict fixture collection to development/staging and document the control before deployment.

## Verification plan

Exact Cloudflare commands are resolved against the pinned Wrangler and Workers Rust versions during G3 readiness. Required outcomes are:

- `cargo fmt --check`
- Core tests and Clippy with warnings denied.
- Worker crate compilation for `wasm32-unknown-unknown`.
- `cargo test --workspace` for tests supported outside the Worker runtime.
- `./scripts/check.sh`
- Apply all migrations to a clean local D1 database.
- Start the Worker locally and collect the fixture once.
- Collect the identical fixture again and prove zero new canonical changes.
- Call `GET /api/jobs` and snapshot the provenance-bearing response.
- Apply migrations to isolated staging D1, deploy the exact tested Worker revision, and repeat the smoke assertions.

## Documentation impact

- Update `memory-bank/activeContext.md`, `techContext.md`, and `progress.md`.
- Update deployment, MVP, Rust stack, and first-demo documentation.
- Add public API reference for `GET /api/jobs` once stable.
- Add internal implementation notes only when they cannot be expressed by code, tests, or accepted RFCs.

## Rollback or recovery

- Revert the implementation commit before integration.
- Restore the previous staging Worker deployment.
- Recreate the fixture-only staging D1 database and reapply migrations when schema rollback is necessary.
- Preserve fixture inputs so all derived state can be rebuilt.

## Capability request

Local repository mutation, Rust and npm registry access, Rust/Wasm command execution, temporary local network binding, and isolated Cloudflare staging Worker/D1 creation and mutation.

## Termination and retry policy

Maximum three materially distinct implementation attempts. Stop and return to G2 when RFC 0004 is insufficient, a required crate cannot satisfy the Wasm/Worker boundary, D1 cannot provide the required identity or atomicity semantics, staging capability is unavailable, or acceptance requires expanding into an excluded service.
