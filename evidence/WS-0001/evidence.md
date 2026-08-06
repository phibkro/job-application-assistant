# Evidence bundle: WS-0001@2

## Identity

- Baseline repository/ref: `main` at `5a6518b`
- Implementation revision: `9a31722`
- Actor: GPT-5.6 Thinking operating in the local repository workspace
- Environment: Linux container plus operator NixOS workstation; deployment remains delegated to the human product owner
- Capability receipts: local repository read/write and command execution; no Cloudflare account mutation; deployment delegated to the human product owner

## Scope mapping

| Acceptance criterion | Evidence | Result |
|---|---|---|
| Rust workspace with pure core and Wasm Worker crates | `Cargo.toml`, `crates/job-index-core`, `crates/job-index-worker`, `rust-toolchain.toml` | Native and Wasm compilation observed on operator machine |
| `workers-rs` Worker with D1 `DB` binding | exact `worker = =0.8.5`; `wrangler.jsonc`; `env.d1("DB")` repository routes | Source implemented; runtime pending |
| Ordered D1 migrations | `migrations/0001_initial.sql`; `scripts/check_migrations.py`; operator Wrangler output | Static check and local D1 migration passed |
| Fixture through a `JobSource` interface | `fixtures/initial.json`; `fixtures::JobSource`; `InitialFixtureSource` | Source implemented |
| Typed normalization and stable identities | `job-index-core`; four unit tests | Tests authored; execution pending |
| Atomic occurrence/canonical/change writes | D1 `batch` operations; `/api/demo/atomicity`; smoke assertion | Probe authored; D1 execution pending |
| Identical replay creates no canonical changes | `/api/demo/collect`; `scripts/smoke.sh` replay assertions | Test authored; execution pending |
| Provenance-bearing `GET /api/jobs` | repository join, API route, browser source badges | Source implemented; runtime pending |
| Unit and integration coverage | core tests plus local/remote black-box smoke suite | Authored; execution pending |
| Local D1 migration and API smoke | `just smoke-local`, `scripts/verify-local.sh` | Pending network-enabled setup |
| Isolated Cloudflare deployment smoke | `./deploy` | Delegated to human operator; pending |
| Format, Clippy, Rust tests, Wasm build, repository checks | `just check`, `just verify`; operator logs | Formatting and Worker build passed; demo.3 fixes Clippy lint priority before rerun |
| Complete evidence map | this manifest and generated `.artifacts` paths | Partial; deployment identifiers pending |

## Changes

- Added a two-crate Rust workspace with a platform-independent domain core and Cloudflare Worker adapter.
- Added deterministic fixture ingestion, exact URL-based canonicalization, source occurrence provenance, canonical change sequencing, and replay idempotency.
- Added a D1 schema and all persistence through the `DB` binding.
- Added a same-origin browser demo and JSON endpoints for health, corpus reads, collection, reset, and atomicity verification.
- Added a one-command operator surface through `bootstrap` and `just`.
- Replaced host-installed tooling with an exact Nix environment that supplies Rust, linker, worker-build, Wrangler, `just`, SQLite and verification utilities.

## Verification

Executed successfully in this environment:

```text
./scripts/check.sh
Repository checks passed: 8 JSON files, documentation links valid.
Migration checks passed: 1 migration(s), 5 required tables.

bash -n bootstrap scripts/*.sh
JSON/TOML parse checks
git diff --check
node --check on the embedded browser script
```

Operator execution subsequently established:

```text
Nix shell entered with Rust 1.97.1, worker-build 0.8.5 and Wrangler 4.93.0
local D1 migration applied successfully
workers-rs release build completed successfully
```

The same run discovered two release defects before deployment: the Clippy lint group had equal priority to explicit deny lints, and the local Worker runtime supported compatibility dates only through 2026-05-25. Release demo.3 fixes both and adds `just fix` plus `just lint`; full verification and deployment remain pending rerun.

## Behavioural evaluations

The black-box smoke suite encodes these expected journeys:

1. Reset fixture-derived D1 state.
2. Submit an invalid D1 batch and verify complete rollback.
3. Collect three source observations and obtain two canonical jobs with three provenance occurrences.
4. Replay the same fixture and obtain zero new canonical changes.
5. Read the corpus and verify source-count distribution `[1, 2]`.

## Security and privacy

- The slice accepts only committed synthetic fixture data.
- No personal profiles, applications, credentials, or production source data are stored.
- Demo mutation routes are controlled by `ALLOW_DEMO_MUTATIONS` and are explicitly not a production API.
- Secrets and account identifiers are excluded from the repository.

## Documentation

Updated:

- root quick start;
- first-demo tutorial;
- deployment how-to;
- HTTP API reference;
- internal deployment architecture;
- current memory-bank projections;
- RFC 0004 status to `Implementing`.

## Attempt history

1. Implemented the source slice against the verified `workers-rs` API surface.
2. Added local and remote deployment automation.
3. Added an explicit D1 rollback probe after review identified atomicity evidence as a missing gate.
4. Added a host-SQL migration check because Worker execution was unavailable in the current environment.
5. Replaced the bootstrap installer after the operator exposed missing host linker and shell-profile assumptions; the flake is now the enforced host dependency boundary.
6. Added a public fix/lint workflow, lowered the Clippy group priority, pinned a compatible local runtime date, and committed `flake.lock` after the operator's first executable run exposed those gates.

## Residual risk and uncertainty

- Rust and Wasm compilation have been observed; Clippy, complete smoke tests, and remote deployment still require a clean `just verify` rerun.
- Automatic remote D1 provisioning and authenticated deployment require a real Wrangler run.
- Exact Nix revisions and direct Rust dependency versions are pinned in the source release; executable dependency resolution still requires a network-enabled Nix run.
- Exact URL identity is intentionally narrow and does not perform fuzzy entity resolution.

## Requested transition

Remain in **Executing**. Do not transition WS-0001 to Evidence Ready or Accepted until `just verify` succeeds and the deployment smoke evidence is attached.
