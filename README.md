# Job Index

A Rust/Cloudflare D1 first production design for a source-aware Norwegian job corpus. It provides:

1. reliable NAV backfill and tail ingestion with leases, retries, recovery, and provenance;
2. a canonical lifecycle corpus with bounded maintenance and integrity audits;
3. a versioned cursor-paginated public read and change API;
4. API-key principals with quotas, revocation, ownership isolation, and audit records;
5. incremental owned saved searches evaluated by scheduled bounded sweeps;
6. a transactional HMAC-signed webhook outbox with retries and dead-state recovery; and
7. explicit staging, production, SLO, restore, load, and release qualification gates.

## Deploy from the ZIP

Prerequisite: a NixOS or Linux machine with Nix installed and network access.
No Git checkout, earlier ZIP, patch, rustup, npm, or globally installed Rust
stack is required.

```sh
unzip job-index.zip
cd job-index
./deploy
```

`./deploy` deploys the disposable staging environment after the full verification suite. Production is always explicit:

```sh
just nav-key
just admin-key
export JOB_INDEX_SOURCE_CODE_URL=https://github.com/<owner>/<repository>
./deploy-production
```

Production uses a separate Worker and D1 database, private credentials, a two-phase publication before cron activation, and a non-destructive smoke suite.

The first authenticated run may open `wrangler login`. A scoped
`CLOUDFLARE_API_TOKEN` may be supplied instead.

## Local development

```sh
just fix     # apply safe Clippy rewrites and Rust formatting
just lint    # strict, non-mutating Clippy checks
just check   # formatting, lint, policy, migration, and bundle checks
just audit   # RustSec dependency vulnerability scan
just qualification # query-plan and local restore drills
just verify  # all checks, tests, qualification, and local D1/NAV-stub journeys
just dev     # browser demo at http://localhost:8787
just deploy  # verified disposable staging deployment
just deploy-production # explicit non-destructive production deployment
```

Without a host `just`, use `./bootstrap <command>` or `./deploy`.

## Demo journeys

Open the local or deployed URL.

### Deterministic corpus journey

1. **Reset D1 demo**
2. **Collect fixture** — three source ads become two canonical jobs
3. **Replay fixture** — zero new canonical changes

### Incremental saved-search journey

1. Collect the deterministic fixture.
2. Create the **Oslo support and customer service** search.
3. Evaluate it once to add the existing matches.
4. Evaluate it again and observe `jobs_evaluated: 0`.
5. Add, update, or close the NAV fixture job and evaluate only that changed job.

### Live NAV journey

1. Select **Sync one NAV page**.
2. The Worker fetches one bounded page from NAV's official vacancy feed.
3. D1 records the cursor, ETag/Last-Modified metadata, success/failure state,
   observations, and canonical changes.
4. Repeating the operation consumes only the next page or receives `304 Not
   Modified` at the tail.

Local development uses NAV's rotating experimental token. Before sustained
production use, configure the private token supplied by NAV:

```sh
just nav-key
```

The deployed manual sync route is protected by `ADMIN_SYNC_TOKEN`; scheduled sync uses the same bounded application function. Use `just admin-key` to configure the local production credential.

## Architecture

```text
API clients / Admin operator / Cron Trigger
                 ↓
Rust Cloudflare Worker (workers-rs)
                 ↓
Cloudflare D1 corpus, principals, searches, audit, and outbox
                 ↓
NAV official vacancy feed / signed webhook receivers
```

`job-index-core` owns runtime-independent parsing, normalization, and identity.
`job-index-worker` owns Cloudflare Fetch, D1 persistence, HTTP routes, and the
scheduled handler.

## Documentation

- [Documentation map](docs/index.md)
- [First demo tutorial](docs/public/tutorials/run-first-demo.md)
- [Deployment guide](docs/public/how-to/deploy.md)
- [Production API v1 reference](docs/public/reference/api-v1.md)
- [HTTP/demo API reference](docs/public/reference/http-api.md)
- [Principal management](docs/public/how-to/manage-principals.md)
- [Corpus maintenance](docs/public/how-to/corpus-maintenance.md)
- [Webhook delivery](docs/public/how-to/webhooks.md)
- [Production qualification](docs/public/how-to/production-qualification.md)
- [Add a source](docs/public/how-to/add-source.md)
- [Canonical corpus explanation](docs/public/explanation/canonical-corpus.md)
- [Incremental saved-search explanation](docs/public/explanation/incremental-saved-searches.md)
- [RFC 0006: incremental saved searches](docs/internal/rfcs/0006-incremental-saved-searches.md)
- [RFC 0005: live NAV ingestion](docs/internal/rfcs/0005-live-nav-incremental-ingestion.md)
- [Current agent context](memory-bank/activeContext.md)

## License

Job Index is **proprietary**. Copyright (c) 2026 Philip B. Krogh, all rights
reserved. See [LICENSE](LICENSE).

Possession of this source grants no right to use it. `packages/better-auth-effect-adapter`
is the exception: it carries its own MIT licence, because it is written to be
published. See [licensing](docs/public/reference/licensing.md).
