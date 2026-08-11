# Job Application Assistant

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

These are source claims, not live deployment evidence. Staging evidence is
stale. Production qualification, administrative routes, and generated OpenAPI
coverage remain gaps; see [current progress](memory-bank/progress.md).

## Run it

Prerequisite: a NixOS or Linux machine with Nix installed and network access.
No Git checkout, npm, or globally installed Bun/Node is required.

```sh
git clone <repository> job-index
cd job-index
nix develop --command just preview
```

`just preview` builds the interface and Worker, creates a clean local D1,
applies the schema, migrations, source catalog, and demo seed, then serves the
whole stack. Sign in with `demo-token`. Use **Saved** to exercise the complete
save-to-submission-confirmation journey.

## Local development

```sh
nix shell nixpkgs#bun -c bun run check   # TypeScript workspace: format, lint, typecheck, schema, catalog, bundle, tests
nix develop --command just check          # repository, credential, and script gates
nix develop --command just verify         # just check + bun run check
nix develop --command just preview        # the whole stack, served locally
```

Without a host `just`, use `./bootstrap <command>`.

## Deploy

```sh
just nav-key
just admin-key
./deploy
```

`./deploy` deploys the disposable staging environment after `just verify`.
Production is always explicit:

```sh
just nav-key
just admin-key
./deploy-production
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
pinned to `effect@4.0.0-beta.104`, while the checkout currently reports
beta.107; check exact API compatibility before copying an example.

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
