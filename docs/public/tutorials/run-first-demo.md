# Run the local preview

RFC 0015 retired the Rust worker this tutorial used to describe (the
`just dev` demo UI, its NAV-lifecycle fixture buttons, and the destructive
staging smoke suite are gone with it). This is the tutorial for what
currently runs: the TypeScript/Effect service, served locally against a
seeded database.

## 1. Prepare the NAV token

Setup fetches NAV's current public experiment token into the ignored
`.dev.vars` file. The token is reused while it has more than 24 hours
remaining:

```sh
just setup
```

Force a refresh at any time with:

```sh
just nav-token
```

A NAV-issued private consumer key can be configured instead:

```sh
just nav-key
```

## 2. Verify locally

```sh
nix shell nixpkgs#bun -c bun run check
nix develop --command just check
```

`bun run check` runs the TypeScript workspace's own gates (format, lint,
typecheck, `db/schema.sql` drift, bundle, tests). `just check` runs the
repository, credential, and script gates. `just verify` runs both together.

## 3. Serve the whole stack

```sh
nix develop --command just preview
```

This bundles the interface, bundles the Worker for workerd, applies the
generated schema (`db/schema.sql`) and a small seed to a local D1 database,
and serves the result at `http://127.0.0.1:8799`. If port 8799 is in use,
set `PORT` before running `./scripts/preview.sh` directly.

Sign in with the token `demo-token` to see the feed and the profile. Confirm
the API answers directly:

```sh
curl http://127.0.0.1:8799/api/v1/jobs
curl http://127.0.0.1:8799/api/health
```

## 4. Deploy the preview stage

```sh
nix develop --command just deploy-preview
```

This deploys the same bundle to its own Cloudflare stage (`preview`), with
its own Worker name and D1 database, independent of staging/production —
RFC 0015's strangler migration keeps the TypeScript service exercisable
against real Cloudflare without touching what `staging`/`production`
currently serve. See [`docs/public/how-to/deploy.md`](../how-to/deploy.md)
for the staging/production entry points, which still deploy the retired
Rust worker until `infra/alchemy.run.ts`'s stages are repointed.
