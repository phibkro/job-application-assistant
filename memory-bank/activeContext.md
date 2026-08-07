# Active context

## Current focus

RFC 0015's strangler migration: the TypeScript/Effect service now serves
every route group, and the Rust worker it replaced has been retired
(crates/, migrations/, Cargo, rust-toolchain.toml, the legacy Wrangler
configs, and the scripts that only built/tested/smoked the Rust worker are
deleted). Remaining focus is closing the gaps that deletion exposed — see
"Open decisions" below — and continuing the WS-0012 slot work
(`work/WS-0012-r1-typescript-migration-plan.md`).

## Current decisions

- TypeScript + Effect v4 Cloudflare Worker (`apps/worker/`) with D1 as the
  system of record; `packages/domain/` owns canonical identity.
- The corpus is a cache: the TypeScript service starts on a new database from
  a generated schema snapshot (`db/schema.sql`, checked by `bun run
  schema:check`), not the Rust worker's ten ordered migrations.
- `infra/alchemy.run.ts` deploys the Rust worker for `staging`/`production`
  and the TypeScript worker for `preview`, unchanged by this cutover — that
  file's stage repoint to TypeScript is a separate, still-open decision (see
  below); its Rust branch now points at build output that no longer exists.
- `./deploy` targets disposable staging; production requires
  `./deploy-production`. Both currently exercise the Rust branch above.
- Production disables demo mutations, unauthenticated NAV operations, and
  public token fallback (asserted against `infra/alchemy.run.ts`).
- Production requires private NAV/admin credentials.
- Production uses staggered cron triggers so ingestion, search evaluation,
  and outbox delivery have isolated budgets (Rust-only; not yet true of the
  TypeScript worker, which runs ingestion unconditionally on its `scheduled`
  handler once deployed with crons).
- Project license is proprietary (see RFC 0005/0008 amendments).

## Current command surface

```text
just nav-key           # configure NAV private consumer key
just admin-key          # generate/configure protected operator token
just check              # repository, credential, and script gates
bun run check            # TypeScript workspace: format, lint, typecheck, schema, bundle, tests
just verify              # just check + bun run check
just preview             # local TypeScript stack: API + interface + seeded D1
just soak                # bounded staging soak; use seven days for acceptance
./deploy                 # verified destructive staging acceptance (Rust branch; see above)
./deploy-production      # explicit non-destructive production deployment (Rust branch; see above)
```

## Next action

Repoint `infra/alchemy.run.ts`'s `staging`/`production` stages at the
TypeScript worker (a separate, deliberately-not-taken decision left to the
integrator), then re-establish the production qualification gates the Rust
worker had and the TypeScript one does not yet: query-plan regression at
realistic corpus size, a restore drill, and a black-box destructive staging
smoke suite.

## Open decisions

- Whether/when to port principal (API-key) administration, owned
  saved-search webhook subscriptions, and corpus maintenance
  (audit/reconcile/purge) to the TypeScript service — WS-0008/0009/0006
  capabilities that existed only in the retired Rust worker.
- Whether/how to regenerate `openapi/job-index-v1.json` from
  `apps/worker/src/Api.ts` (deleted rather than left describing routes that
  no longer exist; see the cutover report).
- A replacement for the deleted `scripts/probe_sources.py` /
  `scripts/import_source_index.py` pipeline: `apps/worker/src/catalog`'s
  `source_catalog` table currently has no seed generator at all.
- Custom production hostname and whether to disable `workers.dev`.
- Cloudflare Access replacement for the temporary admin bearer token.
- Raw source retention and sanitization policy.
