# Execution plan: WS-0001@1 (superseded)

> Superseded by [`WS-0001@2`](WS-0001-r2-first-vertical-slice.md). Do not execute this plan.

## Baseline

- Repository/ref: `main`; exact commit captured at G3 readiness
- Environment: local Linux container with Rust stable toolchain
- Known failing checks: none; `./scripts/check.sh` currently passes

## Proposed changes

1. Add `rust-toolchain.toml`, workspace `Cargo.toml`, formatting/lint policy, and dependency policy skeleton.
2. Create `crates/job-index-core` with domain types, source observation types, normalization contract, and deterministic identities.
3. Create `crates/job-index-app` with Axum, Tokio, SQLx, SQLite migrations, repositories, fixture connector, collection command, and API route.
4. Add fixture data representing at least two source occurrences and one canonical result with provenance.
5. Add tests for normalization, transactional persistence, provenance, and identical replay.
6. Update memory-bank and public/internal reference documentation to match the executable state.
7. Produce an evidence bundle for G4/G5 review.

## Alternatives considered

- One crate: smaller initially but weakens the verified runtime-independent domain boundary required by RFC 0001.
- Dioxus fullstack immediately: adds UI complexity before the ingestion and identity path is proven.
- Live NAV source immediately: introduces network, cursor, and external-data failure modes before local semantics are stable.
- In-memory repository: cannot prove persistence, migration, transaction, or replay requirements.

## Risks and mitigations

- **SQLx version or feature incompatibility:** pin versions in `Cargo.lock` and prefer the smallest feature set.
- **Over-engineered domain abstractions:** implement only interfaces used by the vertical slice.
- **Identity semantics become accidental:** encode stable source identity and canonical sequence invariants in tests.
- **Native dependencies leak into core:** enforce dependency inspection and crate-level compilation tests.
- **Demo fixture overfits implementation:** keep raw fixture shape source-specific and assert normalized output separately.

## Verification plan

- `cargo fmt --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `./scripts/check.sh`
- Run collection once against a fresh temporary database and record counts.
- Run the same collection again and prove zero new canonical changes.
- Call `GET /api/jobs` and snapshot the provenance-bearing response.

## Documentation impact

- Update `memory-bank/activeContext.md`, `techContext.md`, and `progress.md`.
- Add public API reference for `GET /api/jobs` once stable.
- Add internal implementation notes only when they cannot be expressed by code, tests, or accepted RFCs.

## Rollback or recovery

- Revert the implementation commit before integration.
- Delete the prototype SQLite file and rerun migrations/fixtures.
- Preserve fixture inputs so derived state can always be rebuilt.

## Capability request

Local repository mutation, Cargo registry access, Rust command execution, and temporary local network binding for API verification.

## Termination and retry policy

Maximum three materially distinct implementation attempts. Stop and return to G2 when an accepted RFC is insufficient, a required dependency violates the native/core boundary, or acceptance requires expanding into an excluded capability.
