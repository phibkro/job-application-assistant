# Job Application Assistant

> **Accepted direction (RFC 0016, with amendments, 2026-11-01):** Re-scope the reusable core as a read-only Norwegian Job Market Index, with [technical product/project lead handoff](docs/internal/product/market-index-lead-handoff.md), [RFC 0016](docs/internal/rfcs/0016-read-only-norwegian-market-index.md), [target architecture](docs/internal/architecture/read-only-market-index.md), and [tracer-bullet plan](docs/internal/architecture/market-index-tracers.md). The current vision still governs existing application features (amendment A1); any migration needs its own approved WorkScope.

`Job Application Assistant` is the working product name; repository and package
identifiers remain `job-index`.

The approved mission and MVP boundary are canonical in the
[product vision](docs/internal/product/vision.md): assist the full
job-application process under human control, from permitted-source discovery
and matching through reusable profile facts, application organization, and
preparation for repetitive entry. In-app CV and application-letter writing are
outside the MVP. ATS-friendly document assistance and Cloudflare Agents
SDK/browser/computer-control support are future candidates, not committed
architecture, and submission always requires explicit human approval.

## Current implementation

The source contains a TypeScript/Effect v4 Cloudflare Worker with a canonical,
provenance-preserving job corpus, NAV ingestion, a versioned read API, reusable
profile facts, and the Saved application workspace. The workspace provides
durable snapshots, custom labels, preset filters, drafts, assisted preparation,
explicit submission confirmation, lifecycle actions, and prior-attempt history.
`infra/alchemy.run.ts` declares that Worker for every Alchemy stage.
The generated D1 schema, ordered migration ledger, and researched source catalog
have executable check and deployment commands. Only NAV is registered as an
ingestion adapter.

These are source claims, not live deployment evidence. Local 50,000-row
query-plan and backup/restore qualification is executable; current staging,
production, administrative-route, and generated OpenAPI evidence remains open.

## Run it

Prerequisite: a Linux machine with Nix and [devenv](https://devenv.sh) installed,
and network access. No globally installed Bun/Node is required: `devenv.nix`
declares the toolchain and `devenv.lock` pins it.

```sh
git clone <repository> job-index
cd job-index
devenv shell -- vp run dev
```

`vp run dev` builds the interface and Worker, creates a clean local D1,
applies the schema, migrations, source catalog, and demo seed, then serves the
whole stack. Sign in with `demo-token`. Use **Saved** to exercise the complete
save-to-submission-confirmation journey.

## Local development

Inside `devenv shell` (or prefix each with `devenv shell --`):

```sh
vp check                # format (packages/, apps/) and lint
vp run test             # both Vitest 4 suites (Bun-hosted unit, workerd pool)
vp run policy           # repository, credential, and script gates
vp run verify           # setup + policy + vp check + types, Effect diagnostics, schema, catalog, bundle, coverage
vp run qualification    # 50k query plans plus backup/restore (append --rows N)
vp run dev              # the whole stack, served locally
```

Tasks are declared in `vite.config.ts`. In a clone made before devenv and Vite+
(WS-0027), run `vp hooks enable` once: the old `.githooks` path is gone, and
`vp config` leaves another `core.hooksPath` alone.

## Deploy

```sh
vp run nav-key
vp run deploy
```

`vp run deploy` deploys the disposable staging environment after `vp run verify`.
Production is always explicit:

```sh
vp run nav-key
vp run deploy-production
```

Both commands use the TypeScript Worker declared in `infra/alchemy.run.ts`.
That declaration does not establish current live deployment evidence: staging
evidence is stale, and production qualification remains open.
`scripts/preview.sh` and `scripts/deploy-preview.sh` exercise the TypeScript
Worker directly, independent of staging/production evidence.

The first authenticated Cloudflare run may open `wrangler login`. A scoped
`CLOUDFLARE_API_TOKEN` may be supplied instead.

## Architecture

```text
API clients / browser interface / Cron Trigger
                 ↓
TypeScript + Effect v4 Cloudflare Worker (apps/worker/)
                 ↓
Cloudflare D1 corpus, profiles, applications
                 ↓
NAV official vacancy feed / other catalogued sources
```

`packages/domain/` owns canonical identity, normalization, and matching as
Effect Schema models. `apps/worker/src/Api.ts` declares the HTTP contract that
the router, interface, and test suite derive from. Scheduled ingestion now
selects the Feed tier implemented by this deployment; production declares only
the matching NAV ingestion cron.

For Effect idioms, use the official local source at `../effect`. The project is
pinned to `effect@4.0.0-rc.108`; check exact API compatibility before copying
an example from another revision.

## Documentation

- [Documentation map](docs/index.md)
- [Product vision and MVP boundary](docs/internal/product/vision.md)
- [Effect module specification](docs/internal/architecture/effect-module-map.md)
- [RFC 0015: implementation language for the application product](docs/internal/rfcs/0015-implementation-language-for-the-application-product.md)
- [Current agent context](memory-bank/activeContext.md)
- [Deployment guide](docs/public/how-to/deploy.md)

## License

Job Application Assistant is **proprietary**. Copyright (c) 2026 Philip B.
Krogh, all rights reserved. See [LICENSE](LICENSE).

Possession of this source grants no right to use it. `packages/better-auth-effect-adapter`
is the exception: it carries its own MIT licence, because it is written to be
published. See [licensing](docs/public/reference/licensing.md).
