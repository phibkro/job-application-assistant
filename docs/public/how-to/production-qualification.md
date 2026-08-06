# Qualify the first production release


## Cloudflare plan baseline

The first production design assumes a **Workers Paid** account. D1 is available on both Free and Paid plans, but the Free plan retains daily D1 usage limits and lower per-invocation external-subrequest limits. Local development and disposable staging can use Free where the observed workload fits; unattended NAV backfill, scheduled search evaluation, and webhook delivery should be qualified against the paid production limits.

Before each production release, compare the bounded workload settings and observed staging usage with the current official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/).

## Local qualification

```sh
just fix
just verify
just qualification
```

The suite seeds 50,000 jobs and verifies indexed query plans, performs a SQLite backup/restore drill, runs host-safe unit tests, and exercises the real Worker, D1 binding, controlled NAV server, ownership boundaries, maintenance, and webhook outbox.

## Staging soak

```sh
just soak https://<staging-worker> 604800 60
```

This runs for seven days at a 60-second interval and writes JSONL evidence plus a summary to `.artifacts/soak/`. It reads `ops/slo.json` and fails when API availability or NAV feed-lag p95 misses the declared targets, when no lag samples are available, or when the source reports consecutive failures.

## External drills

Before production acceptance, attach evidence for:

1. successful staging deployment and seven-day soak;
2. D1 Time Travel or export/restore drill against staging;
3. private NAV, administrator, and principal API-key rotation;
4. production deployment and non-destructive smoke;
5. independent review of migration, authorization, repair, and delivery boundaries;
6. observed SLOs from [ops/slo.json](../../../ops/slo.json).

These external gates cannot be certified by static repository checks alone.
