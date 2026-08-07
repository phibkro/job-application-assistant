# Job Index

A TypeScript/Effect Cloudflare Worker for a source-aware Norwegian job corpus.
RFC 0015 strangled the original Rust/Cloudflare Worker prototype; this
service now serves every route group, and the Rust implementation has been
retired. It provides:

1. live NAV ingestion into a canonical, deduplicated job corpus with provenance;
2. a versioned public read API (`/api/v1/jobs`, source catalogue);
3. a browse / save / draft / apply application flow with account profiles; and
4. explicit local, preview, staging, and production environments.

Principal (API-key) administration, owned saved-search webhook delivery, and
corpus maintenance existed only in the retired Rust worker and have not been
ported — see `memory-bank/progress.md` for the current gap list.

## Run it

Prerequisite: a NixOS or Linux machine with Nix installed and network access.
No Git checkout, npm, or globally installed Bun/Node is required.

```sh
git clone <repository> job-index
cd job-index
nix develop --command just preview
```

`just preview` bundles the interface and the Worker, applies the generated
schema and a small seed to a local D1 database, and serves the whole stack —
sign in with the token `demo-token` to see the feed and the profile.

## Local development

```sh
nix shell nixpkgs#bun -c bun run check   # TypeScript workspace: format, lint, typecheck, schema, bundle, tests
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

Both currently deploy through `infra/alchemy.run.ts`'s Rust branch, which
this cutover leaves in place — that file's stage repoint to the TypeScript
worker is a separate, deliberately-not-yet-taken decision. `scripts/preview.sh`
and `scripts/deploy-preview.sh` exercise the TypeScript worker directly,
independent of that repoint.

The first authenticated Cloudflare run may open `wrangler login`. A scoped
`CLOUDFLARE_API_TOKEN` may be supplied instead.

## Architecture

```text
API clients / browser interface / Cron Trigger
                 ↓
TypeScript + Effect v4 Cloudflare Worker (apps/worker/)
                 ↓
Cloudflare D1 corpus, accounts, applications
                 ↓
NAV official vacancy feed / other catalogued sources
```

`packages/domain/` owns canonical identity, normalization, and matching as
Effect Schema models. `apps/worker/src/Api.ts` declares the HTTP contract
that the router, the interface, and the test suite are all derived from —
see its doc comment for why that replaces a hand-kept OpenAPI document.

## Documentation

- [Documentation map](docs/index.md)
- [Effect module specification](docs/internal/architecture/effect-module-map.md)
- [RFC 0015: implementation language for the application product](docs/internal/rfcs/0015-implementation-language-for-the-application-product.md)
- [Current agent context](memory-bank/activeContext.md)
- [Deployment guide](docs/public/how-to/deploy.md)

## License

Job Index is **proprietary**. Copyright (c) 2026 Philip B. Krogh, all rights
reserved. See [LICENSE](LICENSE).

Possession of this source grants no right to use it. `packages/better-auth-effect-adapter`
is the exception: it carries its own MIT licence, because it is written to be
published. See [licensing](docs/public/reference/licensing.md).
