# Run the local preview

RFC 0015 retired the Rust worker this tutorial used to describe (the
`just dev` demo UI, its NAV-lifecycle fixture buttons, and the destructive
staging smoke suite are gone with it). This is the tutorial for what
currently runs: the TypeScript/Effect service, served locally against a
seeded database.

## 1. Prepare NAV authentication

The Worker obtains NAV's public token at runtime when no private secret is
configured. `just setup` checks the toolchain and does not persist a public
token in `.dev.vars`.

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

## 4. Exercise the Saved workspace

1. Open a vacancy and select **Shortlist this job**.
2. Select **Draft CV & letter**.
3. Select **Prepare (assisted)**.
4. Approve the prepared attempt.
5. Open **Saved**.
6. Create and assign a custom label.
7. Confirm an external submission only after you submit on the external site.
8. Open the application history.

The Saved page keeps the frozen vacancy snapshot and prior attempts. It also
shows the current application state and its next human action.


## 5. Deploy the preview stage

```sh
nix develop --command just deploy-preview
```

This command deploys the same TypeScript bundle to an independent Cloudflare
preview stage. It does not change staging or production.

All Alchemy stages now declare the TypeScript Worker. A source declaration is
not deployment evidence. See [`docs/public/how-to/deploy.md`](../how-to/deploy.md)
for the staging and production procedures.
