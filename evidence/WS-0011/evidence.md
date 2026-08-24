# WS-0011 evidence

## Current TypeScript local gate

```sh
./bootstrap verify
./bootstrap _qualification 50000
```

Observed on 2026-08-13 from a dirty `main` checkout containing this
qualification implementation:

- `scripts/qualify.py` created a clean database from the generated
  `db/schema.sql`.
- It inserted 50,000 canonical vacancies, 50,000 provenance occurrences,
  2,000 profile-scoped saved jobs, 2,000 application attempts, 20 labels,
  1,000 assignments, and 1,000 active-attempt pointers.
- Eight current feed, browse, detail, label, and application-history queries
  used their declared indexes before and after restore. Each query recorded
  seven timing samples.
- The SQLite backup restored in 94.101 ms. Source and restored full-content
  fingerprints matched
  (`209a6caaf7c83f92d08d033aa7e66aa1445b82b724d7d0570b757f3a7b4cf7ec`);
  `PRAGMA integrity_check` returned `ok`; foreign-key violations were zero.
- Machine-readable local evidence:
  `.artifacts/qualification/report.json`, SHA-256
  `e311dd96c4fcce479fea7a1267b9aa5b83c6d724549025cf0e0679e1a7f7a6aa`.

The local report is runtime validation against SQLite, not Cloudflare D1
production evidence. Timing values describe this workstation only.

## Current TypeScript staging gate

Observed on 2026-08-13 against
`https://job-index-staging.philib-krogh-d23.workers.dev`:

- `./bootstrap verify` passed: 74 Bun files with 600 passing tests and four
  skips; 14 workerd files with 65 passing tests.
- `JOB_INDEX_DEV_VARS_FILE=/dev/null ./deploy` published the current dirty
  candidate with schedules disabled, applied the generated schema and ordered
  migrations, and passed the non-destructive HTTP smoke.
- Deployment identity: D1
  `job-index-staging-typescript-db`
  (`967bfbad-4577-437c-945e-54c023154b8a`), public NAV runtime,
  configuration SHA-256
  `ec620f078f963d30dfd1aeeb394a340203fe1aacd931d04afa8131b3f44b8ad9`.
- `/api/health` and `/api/about` reported `environment: staging`; the public
  browse surface returned current vacancies.
- A browser authenticated through the public interface with a bounded
  qualification principal. A narrowly seeded hydrated staging vacancy then
  exercised the complete mutation journey through the UI: shortlist, create
  and assign the `Qualification` label, template draft, assisted preparation,
  explicit approval to `ready`, separate human confirmation to `submitted`,
  the Applied preset, and current-attempt history.
- D1 persisted one owner-scoped saved job with a 271-byte frozen snapshot, one
  assigned custom label, and one assisted application. The active-application
  pointer selected that application; its final status was `submitted`, and its
  frozen snapshot matched the saved snapshot size.
- One explicitly enabled staging cron invocation at
  `2026-08-13T04:15:01.103Z` read one NAV page, observed five entries, made four
  canonical changes, advanced the cursor from
  `/api/v1/feed/9b8621ca-b956-4abc-992a-59d22b43eb3b` to
  `/api/v1/feed/9d01840f-ebff-452e-b2d2-1bc58fe4bcfd`, and stopped for
  `budget exhausted: pages` after 1,861 ms.
- The persisted cursor matched the run's `cursorAfter`; there were no
  ingestion failures during the run. The NAV occurrence set contained 384
  rows and 384 distinct external IDs, with no duplicate `(sourceId,
  externalId)` groups.
- The cron trigger was reconciled back to zero immediately after this single
  run.

`.deploy/staging.json` is the machine-readable deployment record. Its
`source_code_url` is null because this qualification used a dirty checkout;
the evidence applies to the recorded configuration and observed deployment,
not to a named immutable revision.

## External gate diagnostics

Observed on 2026-08-13:

- A five-minute staging soak diagnostic completed ten checks and failed:
  availability was `0.0` against the `0.995` target, and no feed-lag samples
  were available. Every observation recorded HTTP 403 because
  `scripts/soak.py` requests the retired authenticated
  `/api/sources/nav/status` route without a credential; the current
  TypeScript API does not implement that route and direct access returns 404.
  `.artifacts/soak/observations.jsonl` and
  `.artifacts/soak/observations.summary.json` retain the diagnostic.
- A remote D1 export completed from
  `job-index-staging-typescript-db`
  (`967bfbad-4577-437c-945e-54c023154b8a`).
- A temporary managed D1
  `job-index-staging-restore-drill-20260813`
  (`22d96382-fb19-40b4-ab6c-e4d1f8a3db41`) accepted the export, but Wrangler
  reported only 11 restored tables and subsequent verification found
  `occurrences` absent. The exported SQL/import path therefore did not
  preserve the full 22-table source database and failed the restore gate.
- The failed temporary restore database was deleted after evidence capture.
  Live staging was not modified.

These diagnostics are failures, not acceptance evidence. The soak monitor must
observe a current TypeScript status boundary, and the managed restore procedure
must preserve all tables and owner/corpus invariants before either gate can
close.

## Current local gate repair

The current candidate now implements the public TypeScript ingestion status
boundary consumed by `scripts/soak.py`. The status uses the latest non-failed
run that completed at least one page; failed runs and zero-page duration
exhaustion cannot reset lag. No successful history returns `null`, which the
soak runner rejects as no lag sample.

`scripts/restore-d1.py` now discovers every table from `db/schema.sql`,
transfers data in bounded Wrangler operations, compares full-content digests,
checks owner-scoped workspace and NAV cursor invariants, and deletes its
disposable target. Its create/delete flags match pinned Wrangler `4.93.0`.
Local safety refusals, command smoke, live D1 repository tests, and the full
repository gate pass. An independent security review found no remaining
blocking/high code issue in this repair scope.

This is local evidence only. The repaired candidate has not been deployed to
staging, the seven-day soak has not run, and the managed restore command has
not been authorized against Cloudflare.

## Open external acceptance gates

WS-0011 remains `Executing`. The current remote deployment, HTTP smoke,
authenticated full mutation journey, and bounded NAV checkpoint have staging
evidence. The soak diagnostic and managed D1 restore drill both exposed
blocking defects and did not pass. Seven-day SLO evidence, a successful
Cloudflare D1 restore/Time Travel drill, credential rotation, production
deployment and non-destructive smoke, and independent G5 review remain
required.
Administrative principal, maintenance, and webhook surfaces from the retired
Rust worker are absent and are not covered by this gate.
