# Technical context

## Executable stack

- Rust 1.97.1, edition 2024.
- `worker` / workers-rs 0.8.5 for Worker routing and D1 bindings.
- Serde 1.0.228, Serde JSON 1.0.150 and js-sys 0.3.102.
- Cloudflare D1 as the sole application persistence layer.
- `worker-build` 0.8.5 and Wrangler 4.93.0 from an exact nixpkgs revision.
- Exact nixpkgs and rust-overlay revisions as the host dependency boundary.
- `just` as the internal command graph; `./deploy` for staging and `./deploy-production` for explicit production deployment.
- Python, SQLite and curl for policy, migration and black-box assertions.

No tool is installed into the user's Cargo, rustup, npm or shell-profile state.

## Workspace

```text
crates/job-index-core/    normalization and deterministic identity
crates/job-index-worker/  HTTP routes, fixture orchestration, D1 and demo UI
migrations/               ordered D1 schema
fixtures/                 committed replayable source snapshots
```

The core crate has no Worker, database, HTTP or asynchronous-runtime dependency.

## Deployment

`./deploy` enters the pinned Nix shell and deploys the disposable staging environment after full verification. `./deploy-production` uses the isolated production database and `wrangler.production.deploy.jsonc`, requires private NAV and administrator credentials plus an HTTPS AGPL source URL, and runs only non-destructive remote smoke checks.

Detailed deployment: [`docs/internal/architecture/deployment.md`](../docs/internal/architecture/deployment.md)
