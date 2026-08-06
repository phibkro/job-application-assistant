# Run the first live demo

This tutorial proves canonicalization, source lifecycle transitions, bounded live NAV synchronization, and incremental saved-search evaluation.

## 1. Prepare the NAV token

Setup fetches NAV's current public experiment token into the ignored `.dev.vars` file. The token is reused while it has more than 24 hours remaining:

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
just fix
just verify
# or: ./bootstrap fix && ./bootstrap verify
```

The suite builds the Rust Worker, creates a clean local D1 database, applies
all migrations, and proves:

```text
3 source observations → 2 canonical jobs
1 duplicate occurrence merged
0 canonical changes on identical replay
NAV create → close → replay → reopen → update
saved-search added → idle → updated → removed → re-added → closed
D1 batch rollback
```

## 3. Explore deterministic journeys

```sh
just dev
```

Open <http://localhost:8787>, then select:

1. **Reset D1 demo**
2. **Collect fixture**
3. **Replay fixture**

The Technical Support Specialist job displays two source badges. The replay
reports unchanged observations and no new canonical changes.

The verification suite also exercises the NAV lifecycle fixtures through the
JSON endpoints.

## 4. Prove incremental saved-search evaluation

In the browser:

1. Select **Create Oslo support search**.
2. Select **Evaluate changed jobs**. The two fixture jobs are added.
3. Select **Evaluate changed jobs** again. The report shows `jobs_evaluated: 0`.
4. Use the NAV fixture actions through the smoke suite or API to add, update, remove, re-add, and close one matching job. Each evaluation inspects exactly that changed canonical job.

The saved-search panel shows its normalized definition, stable query signature, last evaluated sequence, and current match count.

## 5. Synchronize one live NAV page

Select **Sync one NAV page**. Local configuration permits this operation and
uses NAV's rotating experimental token.

The result reports:

- cursor before and after;
- active and inactive observations;
- created, updated, closed, and reopened canonical jobs;
- unchanged observations and detail fallbacks;
- whether the current tail page returned no modification.

The **NAV source state** panel displays the durable D1 checkpoint and connector
health. Each click handles at most one feed page and at most 200 observations.

## 6. Deploy to staging

```sh
./deploy
```

This deploys the disposable staging environment and runs the full destructive demo smoke suite against the separate staging D1 database. The printed `workers.dev` URL is suitable for acceptance testing.

Configure an administrator token for manual staging operations with:

```sh
just admin-key
```

A NAV-issued private consumer key can be stored with `just nav-key`; staging uploads it automatically when present.

Production is deliberately separate and requires private NAV credentials, an administrator credential, and the public AGPL source URL:

```sh
just nav-key
just admin-key
export JOB_INDEX_SOURCE_CODE_URL=https://github.com/<owner>/<repository>
./deploy-production
```

Production disables all demo mutations and uses a non-destructive smoke suite.
