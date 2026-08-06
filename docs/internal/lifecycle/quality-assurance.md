# Quality assurance strategy

## Command hierarchy

```sh
just fix      # safe compiler rewrites and formatting
just test     # all host-safe workspace library tests
just check    # format, Clippy, repository, migration, script, and bundle gates
just verify   # check + unit tests + dependency audit + qualification + fresh Worker/D1/NAV-stub integration
./deploy      # verify + destructive staging acceptance
./deploy-production  # verify + non-destructive production acceptance
```

## Test layers

1. **Pinned environment:** Nix locks Rust, workers-rs tooling, Wrangler, native
   compilers, Python, SQLite, ShellCheck, and operator commands.
2. **Dependency security:** `cargo audit` checks the generated lockfile against the RustSec advisory database.
3. **Compiler policy:** formatting and strict Clippy run for native core and Wasm
   Worker targets.
4. **Unit tests:** canonicalization, NAV parsing, search normalization, matching,
   and bounded evaluation constants.
5. **Migration tests:** every migration applies to a clean database; constraints,
   rollback, cascade, lease, and failure-ledger behavior are asserted.
6. **Script/security tests:** bootstrap isolation, public/private NAV credentials,
   admin-token secrecy, constant-time authorization comparison, and NAV-stub behavior.
7. **Real local integration:** Wrangler builds and runs the Rust Worker against a
   fresh D1 database.
8. **NAV adapter contract:** the real Fetch adapter is driven through success,
   304, detail fallback, 429, upstream retry, oversized-page rejection, malformed, feed/detail authentication, concurrency, pause,
   resume, and restart scenarios.
9. **Staging acceptance:** destructive reset/fixture/replay tests run only on a
   staging-specific database.
10. **Production acceptance:** read-only checks prove health, source offer, read
   API, disabled demo mutations, and protected admin routes.

## Evidence discipline

Generated responses and logs are retained under `.artifacts/`. Environment
identity, database identity, auth mode, source URL, config hash, and Cargo lock
hash are retained under `.deploy/`. Credentials and full NAV payloads are not
stored as evidence.

## Remaining production gates

Before public launch, execute the live staging soak, remote D1 Time Travel restore and migration rollback drills, credential rotation, browser accessibility/E2E review, and independent G5 review of the production configuration.
