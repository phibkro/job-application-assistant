# Deploy staging or production

`scripts/deploy.sh` is the executable procedure.
`infra/alchemy.run.ts` declares the Worker, D1 database, bindings, and cron.

## Prerequisites

Use Linux with Nix and outbound network access.

For staging, public runtime NAV authentication is the default. You can provide
a private NAV token.

Production requires both credentials:

```sh
just nav-key
just admin-key
```

The NAV credential must be a usable JWT. `ADMIN_SYNC_TOKEN` must contain at
least 32 characters. The deploy script checks both values before it changes
Cloudflare.

## Deploy staging

```sh
./deploy
# equivalent: just deploy
```
The entry point runs the full repository verification gate before
`scripts/deploy.sh` can change Cloudflare.


The command:

1. checks Cloudflare authentication;
2. publishes the TypeScript/Effect stack without schedules;
3. applies `db/schema.sql`;
4. applies ordered migrations through `scripts/migrate-d1.sh`;
5. applies `db/catalog-seed.sql`;
6. runs the non-destructive HTTP smoke;
7. writes evidence to `.artifacts/deploy/staging/` and `.deploy/staging.json`.

Staging schedules remain disabled.

## Deploy production

```sh
./deploy-production
# equivalent: just deploy-production
```
The entry point runs the same verification gate before deployment.


Production uses a two-publication sequence:

1. publish without cron triggers;
2. apply the schema, ordered migrations, and source catalog;
3. publish the cron-enabled configuration;
4. wait for `/api/health`;
5. run the non-destructive HTTP smoke;
6. write evidence to `.artifacts/deploy/production/` and
   `.deploy/production.json`.

This order prevents scheduled ingestion from using the previous table shape.

## Database upgrades

The generated schema creates a new database at the current shape.
`d1_migrations` records ordered upgrades for an existing database.

Do not apply migration SQL manually. Use the deployment command or
`scripts/migrate-d1.sh`. The migration runner records a migration only after
Wrangler applies it successfully.

## NAV authentication

Without a private secret, the deployed staging Worker fetches NAV's public
token at runtime. A private secret disables that public-token request path.

Production requires the private secret.

See [Configure NAV authentication](configure-nav-auth.md).

## Evidence limits

An Alchemy declaration is not deployment evidence. A deployment claim requires
the evidence file from the same source revision.

The current smoke checks health, service identity, and a public corpus read.
Production qualification still requires the separate gates listed in
[`memory-bank/progress.md`](../../../memory-bank/progress.md).

## Recovery

Run the environment-specific command again after an interruption. Alchemy
resolves the stack by stage. The migration ledger skips completed upgrades.
