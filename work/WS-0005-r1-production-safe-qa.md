# WS-0005@1: Production-safe QA boundaries

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0008
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Local, test, staging, and production are isolated by configuration and resource identity. The full NAV adapter is exercised against a deterministic local contract server. Production deployment cannot run destructive demo smoke tests and cannot begin without private credentials and a public corresponding-source URL.

## Acceptance criteria

- Four Wrangler templates declare distinct environment identities.
- Production disables demo mutations, unauthenticated NAV control, and public-token fallback.
- `./deploy` targets staging; production requires an explicit command.
- Staging and production use different deterministic D1 names.
- Production deployment validates private NAV key, admin token, and HTTPS source URL before Cloudflare mutation.
- Production smoke is non-destructive and asserts demo/admin authorization boundaries.
- Local verification starts the NAV stub and uses `wrangler.test.jsonc`.
- Happy backfill, 304, 404 fallback, 429, malformed, authentication, concurrency, pause/resume, and restart paths execute through HTTP.
- `cargo test --workspace --lib` runs all host-safe unit tests.
- Static, migration, shell, Rust, Wasm, bundle, local D1, and staging gates pass.

## Exclusions

- Browser automation.
- Performance and soak testing.
- Restore and rollback drills.
- Corpus audit/repair.
- Cloudflare Access and API Shield.
