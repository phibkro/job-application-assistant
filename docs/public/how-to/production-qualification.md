# Qualify the first production release

The local gate qualifies the current TypeScript schema and read paths. It does
not replace staging, Cloudflare D1, soak, credential-rotation, or independent
review evidence.

## Cloudflare plan baseline

The first production design assumes a **Workers Paid** account. D1 is available on both Free and Paid plans, but the Free plan retains daily D1 usage limits and lower per-invocation external-subrequest limits. Local development and disposable staging can use Free where the observed workload fits; unattended NAV backfill, scheduled search evaluation, and webhook delivery should be qualified against the paid production limits.

Before each production release, compare the bounded workload settings and observed staging usage with the current official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/).

## Local qualification

```sh
vp run verify
vp run qualification
```

`vp run qualification` creates a clean database from `db/schema.sql`, seeds
50,000 deterministic vacancies with provenance and representative Saved and
application history, and asserts the indexes used by current feed, browse,
detail, label, and history queries. It records seven timing samples per query,
backs the database up into a clean SQLite target, compares deterministic state
fingerprints, runs integrity and foreign-key checks, and repeats every plan
probe against the restored database.

The machine-readable report is
`.artifacts/qualification/report.json`. Override the corpus size only for a
quick local diagnostic: `vp run qualification --rows 5000`. Release evidence must use
the default 50,000 rows.

## Staging soak

```sh
vp run soak https://<staging-worker> --duration 604800 --interval 60
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
