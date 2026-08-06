# WS-0011 evidence

## Implemented

- Define executable performance, restore, soak, SLO, security, and release gates for first production qualification.
- Additive schema and policy checks.
- Deterministic local test coverage and public/operator documentation.

## Local executable gate

```sh
just fix
just verify
```

## Evidence available in this source release

Verified in the constrained build container on 2026-08-06:

- Repository, RFC, documentation-link, OpenAPI, environment, and secret-boundary checks.
- Five ordered migration applications with fourteen required tables and the required production indexes.
- 50,000-row query-plan probe using job, change, owner-search, ready-outbox, and delivery-history indexes.
- Local SQLite backup/restore reconstruction of cursor, corpus, ownership, and foreign keys.
- Deterministic NAV and webhook contract server.
- Bootstrap, public/private NAV key, administrator key, principal key, and production preflight tests.
- Production preflight proof that Wrangler is never invoked before private NAV, administrator, and source-offer inputs pass validation.
- Shell, Python, JSON/JSONC/TOML, migration, embedded-browser-JavaScript, and patch-whitespace checks.
- Staggered production schedules with isolated budgets for NAV ingestion, saved-search evaluation, and outbox delivery.
- Explicit R3 threat model and non-destructive production smoke contract.

## Blocked external acceptance gate

The slice remains `Executing` until the pinned Nix environment supplies Rust formatting, Clippy, Rust unit tests, Wasm compilation, Wrangler/D1 integration, and `Cargo.lock`; and until staging deployment, a seven-day soak, live D1 Time Travel restore/rollback drill, credential rotation, production deployment, and independent G5 review evidence are attached.
