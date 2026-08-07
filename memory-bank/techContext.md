# Technical context

## Executable stack

- TypeScript 5, Bun as runtime/package manager/bundler/test runner.
- Effect v4 (`effect@4.0.0-beta.104`), pinned exactly.
- `effect/unstable/httpapi` declares the API contract (`apps/worker/src/Api.ts`);
  it replaces a hand-kept OpenAPI document and hand-kept router agreement.
- Cloudflare D1 as the sole application persistence layer, reached through
  `apps/worker/src/db/`.
- `oxfmt`/`oxlint` for formatting and lint; `vitest` for tests.
- Wrangler for local `wrangler dev`/`wrangler d1` and for the Alchemy-driven
  deploy; Alchemy v2 (`infra/alchemy.run.ts`) declares the D1 database, the
  Worker, its bindings, and its cron triggers.
- `just` as the internal command graph; `./deploy` for staging and
  `./deploy-production` for explicit production deployment (both currently
  exercise the Rust branch of `infra/alchemy.run.ts` — see
  `activeContext.md`).
- Python and curl remain for policy/credential/repo-hygiene scripts under
  `scripts/`; no Python or shell script builds, tests, or smokes application
  code anymore.

No tool is installed into the user's Cargo, rustup, npm, or shell-profile
state.

## Workspace

```text
apps/worker/src/    routes, handlers, ingestion, corpus, accounts, drafting, db
apps/web/           user interface
packages/domain/     canonical identity, normalization, matching (Effect Schema)
packages/adapters/   source connectors (NAV, JSON-LD, rendered)
infra/               Alchemy v2 infrastructure declaration
db/schema.sql        generated D1 schema snapshot (see scripts/ts/schema.ts)
```

RFC 0015 retired the Rust `crates/` workspace and its ten ordered
`migrations/`: the corpus is a cache, so the TypeScript service starts on a
new database from `db/schema.sql` rather than migrating the old one.

## Deployment

`./deploy` enters the pinned Nix shell and deploys the disposable staging
environment after `just verify`. `./deploy-production` requires private NAV
and administrator credentials and runs only non-destructive remote smoke
checks. Both currently deploy through `infra/alchemy.run.ts`'s Rust branch,
which points at build output that no longer exists in this repository —
repointing those stages at the TypeScript worker is a deliberately separate,
not-yet-taken decision (see `activeContext.md`).

`just preview` / `./scripts/preview.sh` runs the TypeScript stack locally:
the Worker on workerd, the built interface beside it as static assets, and a
local D1 seeded from `db/schema.sql` and `dev/preview-seed.sql`.
`scripts/deploy-preview.sh` deploys the same bundle to its own `preview`
Cloudflare stage, independent of the staging/production cutover.

Detailed deployment: [`docs/internal/architecture/deployment.md`](../docs/internal/architecture/deployment.md)
