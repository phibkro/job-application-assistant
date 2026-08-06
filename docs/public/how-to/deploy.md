# Deploy staging or production

## Prerequisite

Use NixOS or Linux with Nix installed and outbound network access. Git history,
rustup, npm, and globally installed Rust tools are not required.

## Deploy disposable staging

```sh
unzip job-index.zip
cd job-index
./deploy
```

`./deploy` is intentionally an alias for `just deploy-staging`. It:

```text
enters the pinned Nix shell
→ runs formatting, Clippy, policy, migration, bundle, unit, and local contract gates
→ provisions or reuses job-index-staging-db
→ applies remote migrations
→ deploys job-index-staging
→ runs destructive fixture/reset smoke tests only against staging
→ writes .deploy/staging.json
```

Staging has demo mutations enabled and scheduled NAV synchronization disabled.
Treat its database as disposable acceptance state.

## Configure production prerequisites

Configure a NAV-issued private consumer token:

```sh
just nav-key
```

Configure a strong administrative bearer token. The command generates one when
`ADMIN_SYNC_TOKEN` is not already supplied and does not print it:

```sh
just admin-key
```

Provide the public corresponding-source URL required by the AGPL network use
case:

```sh
export JOB_INDEX_SOURCE_CODE_URL=https://github.com/<owner>/<repository>
```

You may instead store `SOURCE_CODE_URL` in ignored `.dev.vars`.

## Deploy production

```sh
./deploy-production
# equivalent: just deploy-production
```

The production command refuses to mutate Cloudflare until all three
prerequisites are present. It then:

```text
provisions or reuses job-index-production-db
→ applies migrations
→ publishes a bootstrap version with cron and NAV synchronization disabled
→ uploads NAV_API_TOKEN and ADMIN_SYNC_TOKEN as Worker secrets
→ publishes the final cron-enabled production configuration
→ runs read-only health, source-offer, read-API, and authorization checks
→ proves demo mutations return 403
→ writes .deploy/production.json
```

Production has:

```text
ALLOW_DEMO_MUTATIONS=false
ALLOW_NAV_SYNC_WITHOUT_TOKEN=false
NAV_USE_PUBLIC_TOKEN=false
NAV_SYNC_ENABLED=true
```

The production smoke suite never resets, seeds, closes, or otherwise mutates
corpus data.

## Environment files

| File | Purpose | Destructive demo endpoints |
|---|---|---|
| `wrangler.local.jsonc` | Interactive local development | enabled |
| `wrangler.test.jsonc` | Isolated verifier with NAV stub | enabled |
| `wrangler.staging.jsonc` | Disposable remote acceptance | enabled |
| `wrangler.production.jsonc` | Scheduled production service | disabled |

`wrangler.jsonc` remains an exact alias of the local template for tooling that
expects the conventional filename.

Generated account-specific files are ignored:

```text
wrangler.staging.deploy.jsonc
wrangler.production.deploy.jsonc
```

## NAV authentication

`just setup` maintains a rotating public experiment token for local use when no
private credential is configured. It never overwrites a key marked
`NAV_TOKEN_SOURCE=private`.

```sh
just nav-token             # explicit public experiment token
just nav-key               # configure NAV-issued private token
just nav-key-cloudflare    # rotate staging by default
NAV_DEPLOY_ENVIRONMENT=production just nav-key-cloudflare
```

See [Configure NAV authentication](configure-nav-auth.md).

## Manual synchronization

Production manual operations require:

```http
Authorization: Bearer <ADMIN_SYNC_TOKEN>
```

Example:

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  "https://<worker>/api/sources/nav/sync"
```

The cron trigger invokes the same bounded synchronization function.

## Generated evidence

```text
.artifacts/deploy/staging/
.artifacts/deploy/production/
.deploy/staging.json
.deploy/production.json
```

## Recovery

Re-run the environment-specific command after interruption. D1 migrations are
ordered, and each deployment resolves its database by deterministic name.

For ingestion recovery, use the [NAV operations guide](operate-nav-ingestion.md).
