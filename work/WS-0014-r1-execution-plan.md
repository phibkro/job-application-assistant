# WS-0014@1 execution plan: qualification closeout

Execution plan only. It sequences and evidences the remaining external
production-acceptance gates on top of the current staged candidate; it
implements nothing. Governing scope: WS-0011@1 (production qualification
gates, RFC 0014). Authority rules: `AGENTS.md` § Work rules — agents propose,
never self-approve a human or independent gate.

## Baseline

- Repository/ref: no immutable ref exists yet. The index holds a staged
  37-path candidate (+1483/−243; 28 M, 7 A, 2 D —
  `scripts/configure-admin-key.sh` and `scripts/test_admin_key.sh`
  deleted): status handler + repository + soak-contract repair +
  `restore-d1.py`/`test_d1_restore.py`/`qualify.py` + docs. On top of it,
  the accepted-but-unstaged WS-0013 UI delta sits in the worktree: 17
  modified paths under `apps/web/**`, untracked
  `apps/web/src/theme.ts`, `theme.test.ts`, `view/icons.ts`, and unstaged
  additions to `memory-bank/activeContext.md` and `memory-bank/progress.md`
  (both `MM`: staged from the candidate, plus WS-0013 notes).
- Environment: staging last deployed 2026-08-13 from the dirty tree —
  `.deploy/staging.json`: `job-index-staging.philib-krogh-d23.workers.dev`,
  D1 `job-index-staging-typescript-db`
  (`967bfbad-4577-437c-945e-54c023154b8a`), `nav_auth_mode:
  public-runtime`, `source_code_url: null`, config SHA-256 `ec62…8ad9`.
  That deployment predates both repairs: it has **no**
  `/api/sources/nav/status` route (404) and no managed restore command.
- Known failing checks: `bun run check`'s `imports:check`
  (`scripts/ts/tracked-imports.ts`) is red until the three untracked
  `apps/web` modules are staged — by design; it compares imports against
  `git ls-files`. The remaining-gate-green claim in
  `evidence/WS-0011/evidence.md:106-120` covers the staged-candidate
  revision only — it predates the WS-0013 restyle and has not been
  re-evidenced on the current combined tree; P1's `just verify` on the
  committed revision is what re-establishes it.
- Recorded defects (evidence/WS-0011/evidence.md:81-99): (1) five-minute soak
  diagnostic — ten HTTP 403s against the then-retired status contract, zero
  lag samples, availability 0.0; (2) managed export/import restored 11 of 22
  tables, omitting `occurrences`; disposable target deleted, staging
  untouched. Both gates open.

## Verified fix status

### (a) Soak ↔ status contract — CLOSED in the staged tree

What the worker serves:

- Route: `GET /api/sources/nav/status`, declared
  `apps/worker/src/Api.ts:264-268` (`HttpApiEndpoint.get("navStatus",
  "/api/sources/nav/status")`, group `ingestion`), success shape
  `{ data: { lag_seconds: number | null, consecutive_failures: number } }`
  (`Api.ts:253-257`).
- Handler: `apps/worker/src/handlers/status.ts:16-17`
  (`HttpApiBuilder.group(api, "ingestion")` → `handle("navStatus")`),
  returning `lag_seconds` clamped at 0 and `consecutive_failures`
  (`status.ts:36-41`). Wired via `handlers/index.ts:6,23` into
  `src/index.ts:92-103`.
- Auth: none. The `ingestion` group carries no `.middleware(Authenticated)`
  (contrast feed `Api.ts:322`, profile `:387`, applications `:492`);
  `handlers/index.ts:16` states it is public read-only observability.
- Semantics: `db/repositories/IngestionStatus.ts:22-42` — checkpoint is the
  latest `ingestion_runs` row with `pages > 0 AND stoppedReason NOT LIKE
  'failed:%'`; failures counted strictly after it (all of them when no
  checkpoint exists).

What the soak requests (`scripts/soak.py`):

- Line 63: `GET <base>/api/sources/nav/status`, no credential
  (`fetch_json`, lines 16-19). Lines 22-26 unwrap `{data: …}`; lines 74-79
  read `lag_seconds` (number ≥ 0; `null` → no sample) and
  `consecutive_failures` (int); line 71 counts success on HTTP 200 from both
  `/api/health` and the status route.

Verdict: identical path, method, envelope, and field semantics. A `null`
lag is deliberately rejected by the soak runner (`soak.py:110-111`), so the
seven-day soak can only pass while scheduled ingestion produces fresh
checkpoints — see Gate 4. Tests asserting the contract end-to-end:
`handlers/status.test.ts:44-69` (200 + exact body through the full
HttpApi stack, skew clamp, reset) and
`db/repositories/IngestionStatus.test.ts:16-90` (checkpoint selection,
strict-after counting against the live SQLite TestLayer). Both run inside
`bun run check` (`package.json:22` → `coverage:all`).

Residual: the *deployed* staging worker still lacks the route. The defect
closes observably only at Gate 1.

### (b) `scripts/restore-d1.py` — CLOSED in the staged tree

End-to-end flow (`main`, lines 578-643):

1. Guards: `--confirm` required (571-572); source ≠ target ignoring case
   (599-600); target refused if it is a shared-stage name or carries a
   `job-index-production|staging|preview` prefix (35-46, 532-536, 601-602);
   target must not already exist (608-609); source must exist (606-607).
2. Manifest: `schema_metadata()` (206-249) executes `db/schema.sql` into an
   in-memory SQLite and enumerates tables from `sqlite_master` — **the
   manifest is derived from the generated snapshot, not a hand-written
   list**. Counted independently: `grep -c '^CREATE TABLE' db/schema.sql`
   = **22** (answers, delivery_platforms, submissions, freshness,
   judgements, sessions, subscriptions, profiles, principals,
   source_catalog, canonical_jobs, occurrences (:160), saved_jobs,
   applications, custom_labels, label_assignments, active_applications,
   platform_policies, source_state, ingestion_runs, ingestion_failures,
   d1_migrations). FK graph yields a topological transfer order; a cycle is
   a hard error (242-243).
3. Create: `wrangler d1 create <target> --location weur` (611).
4. Restore + assert (`restore_data`, 483-529): source table set must equal
   the canonical 22 (490-494 — the direct answer to the 11-table import
   loss: absent tables abort with names); schema applied to target from
   `db/schema.sql` (140-151) and target table set must equal the manifest
   (496-498); per table in FK order — bounded transfer (≤100-row /
   ≤250 kB inserts, PAGE_SIZE 100, `transfer_table` 356-388), then SHA-256
   full-content digest of source re-read with a row-count stability guard
   (`rows_digest` 308-335), compared against transferred and target digests;
   any drift aborts (509-515).
5. Invariants: `owner_invariants` (391-460) digest-compare six owner-scoped
   tables for `profile-qualification` and require five referential
   anti-joins to report zero violations on both sides;
   `nav_cursor_invariant` (463-480) requires the `arbeidsplassen-nav`
   `source_state` row to survive byte-equal.
6. Cleanup: the disposable target is deleted
   (`wrangler d1 delete --skip-confirmation`, 629) in a `finally` on
   success, failure, and Ctrl-C alike (617-634). Report written to
   `.artifacts/d1-restore/report.json` (24, 636-640) with
   `expected_tables`, per-table counts/digests, invariants,
   `provider_limitations`, and cleanup outcome; `run_wrangler` never places
   output or SQL into an error string (71-91). Exit 0 only when passed and
   deleted.

Test assertions (`scripts/test_d1_restore.py`, executed by `just check` via
`scripts/check.sh:9`): static policy pins for `--confirm`, casefold
inequality, shared-target refusal, `db/schema.sql` + `sqlite_master`
discovery, `PRAGMA foreign_key_list`, `MAX_INSERT_ROWS`/`MAX_INSERT_BYTES`,
exact create/delete argv forms matching pinned Wrangler 4.93.0 (lines 19-20),
redacted `"source_database": []` report default, provider-limitation and
constant presence, and the `justfile` wiring (`d1-restore source target:`,
lines 26-27).

## Remediation items

None. `scripts/soak.py` already requests the exact route+shape the staged
handler serves (see (a)), and `scripts/restore-d1.py` already covers all 22
tables with fingerprint assertion (see (b)). No code change is a
precondition to executing this plan. Two operational facts discovered during
verification are recorded as preconditions P2 and P5 below, not as defects.

## Proposed changes

None to product code. This plan adds execution order, authorities,
commands, evidence locations, and abort/rollback rules for the remaining
gates. The only writes it anticipates are generated evidence under
`.artifacts/` and `.deploy/`, plus the owner's post-gate memory-bank updates
(`AGENTS.md:41`).

## Preconditions

- **P1 — Owner integration (blocking everything).** Stage the three
  untracked `apps/web` files (`src/theme.ts`, `src/theme.test.ts`,
  `src/view/icons.ts`) alongside the WS-0013 delta, then commit the staged
  candidate and the UI delta (one or more commits, owner's choice).
  Expected end state: `git status --porcelain` shows no `M`/`A`/`D` entries
  (untracked Nix `result*` symlinks are inert), `bun run check` — including
  `imports:check` — passes on the committed revision, and `git rev-parse
  HEAD` is recorded. Set `SOURCE_CODE_URL` (via `.dev.vars` or
  `JOB_INDEX_SOURCE_CODE_URL`) to the commit ref so the next
  `.deploy/staging.json` carries immutable provenance — closing the
  `source_code_url: null` gap from 2026-08-13
  (evidence/WS-0011/evidence.md:72-75). Per `AGENTS.md:68`, a deployment
  claim is invalid unless verification passed for the same revision.
- **P2 — Schedules-disabled confirmation (Gate 1).** Two-part method:
  (i) `./deploy` invoked with `JOB_INDEX_ACTIVATE_SCHEDULES` unset compiles
  `CRONS = []` (`infra/alchemy.run.ts:81,146-149`), a property
  `scripts/check_repo.py:363-377` permanently asserts on the source; (ii)
  behavioral probe — after deploy, `ingestion_runs` gains no rows across at
  least one quarter-hour boundary (`INGESTION_CRON = "0,15,30,45 * * * *"`,
  alchemy.run.ts:146) except the deliberate checkpoint of Gate 2:
  `wrangler d1 execute job-index-staging-typescript-db --remote --command
  "SELECT COUNT(*) FROM ingestion_runs WHERE startedAt > '<deploy-time>'"`.
- **P3 — Disposable-DB isolation (Gate 3).** The drill target must differ
  from the source ignoring case, must not equal or begin with a reserved
  shared-stage name (`job-index-production|staging|preview`,
  `production|staging|preview|prod|stage`), must not pre-exist, and is
  created and deleted by the script itself. Recommended form:
  `job-index-staging-restore-<YYYYMMDD>` (script epilog, line 551-553).
  The source is opened read-only — every statement against it is a `SELECT`;
  the live staging database (`job-index-staging-typescript-db`) can never be
  the target under these rules. The operator runs this command personally;
  it consumes ambient Wrangler authentication.
- **P4 — Qualification fixtures present (Gate 3).** `owner_invariants`
  requires `profile-qualification` workspace data and the NAV
  `source_state` cursor row; both exist since the 2026-08-13 journey and
  checkpoint. Do not reseed with different profile ids before the drill.
- **P5 — The seven-day soak requires schedules ON during its window.**
  With the trigger disabled, lag grows from the last manual checkpoint past
  the 1800 s p95 target (`ops/slo.json`) and the soak fails by construction.
  Activation mechanism is the documented staging escape hatch
  (`infra/alchemy.run.ts:77-81`): redeploy with
  `JOB_INDEX_ACTIVATE_SCHEDULES=1 ./deploy` for the soak window, then a
  plain `./deploy` reconciles crons back to zero afterward — the same
  enable/observe/disable pattern used for the 2026-08-13 checkpoint
  (evidence/WS-0011/evidence.md:69).
- **P6 — Tooling:** pinned Nix environment (`./bootstrap setup`), Wrangler
  authenticated non-interactively (`wrangler whoami`), no network calls to
  NAV or Cloudflare by the planning agent — all remote effects below are
  operator-triggered.

## Gate sequence

Authorities: **agent** = agent-executable preparation/evidence collection
against staging; **operator** = human-triggered deploy/drill/approval.
`policy/lifecycle.json` defines gate semantics; `policy/risk-tiers.json` R3
requires human release for production mutation.

### Gate 1 — Repaired staging redeploy, schedules disabled

- Authority: operator triggers; agent prepares (P1 clean tree, green gates).
- Command: `just verify` (agent, pre-condition), then `./deploy`
  (= `bootstrap deploy-staging` → `_deploy-staging` → `scripts/deploy.sh
  staging`; justfile:53-58,103-107).
- What it does: fresh web/worker builds (deploy.sh:164-171), Alchemy publish
  with `CRONS=[]` (P2), schema/migration/catalog apply (194-228),
  propagation wait (263-272), non-destructive smoke — `/api/health`,
  `/api/about`, `/api/v1/jobs?limit=1` (`scripts/smoke-production.sh:12-15`)
  — evidence to `.artifacts/deploy/staging/smoke/`, record to
  `.deploy/staging.json` (280-300) including `config_sha256` and now
  `source_code_url`.
- Evidence: `.deploy/staging.json` (new `database_id`, `config_sha256`,
  commit-derived `source_code_url`), smoke JSONs, deploy logs.
- Abort: any pre-publish gate fails → script exits nonzero, nothing shipped.
  Post-publish smoke failure → treat deployment as unaccepted.
- Rollback: redeploy the prior known-good revision (recorded by the previous
  `.deploy/staging.json` `config_sha256`); D1 apply is additive
  (`IF NOT EXISTS` snapshot + marked migrations, deploy.sh:222-228), so
  rollback is a Worker redeploy, not a data operation.

### Gate 2 — Black-box owner journey + bounded NAV checkpoint

- Authority: agent executes against staging (demo mutations enabled,
  `ALLOW_DEMO_MUTATIONS` true outside production, alchemy.run.ts:136);
  operator owns the schedule toggles.
- Commands: repeat the 2026-08-13 browser journey (shortlist → custom label
  assign → draft → assisted prepare → approve → submit → Applied filter →
  history) against the deployed URL; then operator activates the trigger
  once: `JOB_INDEX_ACTIVATE_SCHEDULES=1 ./deploy`, wait ≤ 15 min for the
  quarter-hour tick, confirm exactly one new successful run
  (`ingestion_runs`: `pages ≥ 1`, `stoppedReason NOT LIKE 'failed:%'`,
  cursor advanced), then plain `./deploy` to zero the trigger again.
- Evidence: journey screenshots/transcripts to `.artifacts/ws-0014/`;
  `curl https://<staging>/api/sources/nav/status` returning 200 with
  `data.lag_seconds` finite and small — the first live proof that defect (a)
  is closed in production-like conditions; D1 query outputs.
- Abort: journey step fails → stop, capture, no further gates; checkpoint
  run records `failed:*` → investigate before soak; more than one run fires
  → disable immediately and re-probe (P2).
- Rollback: schedule deactivation is itself the rollback; staging data is
  disposable.

### Gate 3 — Authorized disposable D1 restore drill

- Authority: operator (creates/deletes remote D1; R2/R3 external effect).
- Command: `just d1-restore job-index-staging-typescript-db
  job-index-staging-restore-$(date -u +%Y%m%d)` (justfile:36-37 →
  `restore-d1.py … --confirm`). Preconditions P3/P4/P6.
- Evidence: `.artifacts/d1-restore/report.json` — `"status": "passed"`,
  `expected_tables` length 22 including `occurrences`, per-table
  `digest_equal: true`, `owner_invariants.referential_checks` all-zero on
  both sides, `nav_cursor.cursor_equal: true`, `cleanup.deleted: true`.
- Abort: nonzero exit with redacted `error` in the report. The target is
  deleted automatically even on failure; if `cleanup.error` is set, the
  operator removes the leftover manually with
  `wrangler d1 delete <target> --skip-confirmation`.
- Rollback: none needed — live staging is read-only to this command
  (P3); a failed drill leaves only a report.

### Gate 4 — Seven-day SLO soak

- Authority: operator starts it and owns the schedule window (P5); the
  runner is unattended.
- Command: activate schedules per P5 (`JOB_INDEX_ACTIVATE_SCHEDULES=1
  ./deploy`), then `just soak https://job-index-staging.philib-krogh-d23.workers.dev
  604800 60` (docs/public/how-to/production-qualification.md:33-39).
- Pass criteria (enforced by `scripts/soak.py:103-119` against
  `ops/slo.json`): ≥ 1 check; availability ≥ 0.995; feed-lag p95 present
  and ≤ 1800 s; `max_consecutive_failures == 0`. At 60 s interval ≈ 10,080
  observations.
- Evidence: `.artifacts/soak/observations.jsonl` +
  `observations.summary.json` (append-mode, crash-safe).
- Abort: runner exits `soak failed: …`; mid-window, watch the summary file.
  Consecutive-failure alarms warrant disabling schedules (plain `./deploy`)
  before diagnosis.
- Rollback: after pass or failure, plain `./deploy` reconciles crons to zero
  (P5). No other state changes.

### Gate 5 — Operator-owned items

- **NAV credential rotation** — operator. Obtain replacement private token
  from NAV; `just nav-key-cloudflare` (justfile:17-18,76-79 →
  `configure-nav-key.sh --cloudflare`), which requires a prior successful
  deployment record (configure-nav-key.sh:199-203) and pipes the secret to
  `wrangler secret put NAV_API_TOKEN` over stdin (204-205). Verify the next
  scheduled run succeeds (new `ingestion_runs` row, no new
  `ingestion_failures`). Production-worker rotation repeats after Gate 6
  exists (`NAV_DEPLOY_ENVIRONMENT=production`).
- **Production deployment + non-destructive smoke** — operator.
  `./deploy-production`: private-token JWT preflight (deploy.sh:60-93),
  two-phase publish (cron-less → database upgrade → cron-enabled,
  234-244), automatic smoke (health/about/jobs) to
  `.artifacts/deploy/production/smoke/`. Blocked until Gates 1-4 hold
  staging evidence, rotation evidence exists
  (docs/internal/lifecycle/production-release-checklist.md:7-21), and the
  human release decision is made (risk-tiers R3 `human_release`).
- **Independent G5 review** — independent reviewer + human for material
  risk (lifecycle.json G5B: `review_decision`, `acceptance_mapping`,
  `residual_risk`), opened over the complete bundle (G5A). Reviews
  migration, authorization, repair, and delivery boundaries
  (production-qualification.md:43-51). Needs everything above; blocks
  release/closure.

## Gate-status table

| # | Open item | Authority holder | Blocked by | Blocks |
|---|-----------|------------------|------------|--------|
| 1 | Staging redeploy, schedules disabled (defects fixed) | Operator triggers; agent prepares (P1, `just verify`) | P1 owner integration (clean committed tree, green `imports:check`) | 2, 4, 5 |
| 2 | Black-box journey + bounded NAV checkpoint | Agent executes; operator toggles schedules | 1 | 4 |
| 3 | Disposable D1 restore drill (`restore-d1.py`) | Operator | P3, P4, P6 (formally independent of 1-2; sequenced here per memory-bank order; read-only on staging so overlap is safe) | 5 (G5 evidence) |
| 4 | Seven-day SLO soak | Operator starts/unattended | 1 (status route live), 2 (fresh checkpoint), P5 schedules on | 5 |
| 5a | NAV credential rotation | Operator | 1 (deployed Worker); NAV-issued replacement token | 5b |
| 5b | Production deploy + smoke | Operator (human release, R3) | 1-4 staging evidence, 5a, release decision | 5c |
| 5c | Independent G5 review | Independent reviewer + human (G5B) | Complete bundle: 1-5b evidence | Release, closure |

## Risks and mitigations

- Soak fails on stale lag despite the fixed route → P5 keeps schedules on
  for the window; the runner's own criteria catch it either way.
- Drill touches live data → structurally prevented: SELECT-only source
  access, reserved-name refusal, target auto-delete (verified in code
  above), operator-only invocation.
- Dirty-tree provenance repeats (`source_code_url: null`) → P1 makes the
  commit ref a precondition of Gate 1, not a hope.
- Schedule left on after soak/checkpoint → deactivation is an explicit step
  in Gates 2 and 4 with a D1-count probe; `check_repo.py` keeps the
  gating invariant under continuous test.

## Alternatives considered

- Fixing soak.py to call a different (new) route: rejected — the staged
  candidate instead implements the historical public contract at the same
  path; no client change needed.
- Managed `wrangler d1 export/import` redo with a table whitelist:
  rejected — the staged `restore-d1.py` derives the manifest from
  `db/schema.sql` itself, making omission structurally impossible, and adds
  fingerprint + invariant assertion the export path never had.
- Running the soak with schedules off and sampling lag from manual runs:
  rejected — p95 over seven days of quarter-hour scheduling is the SLO's
  actual meaning (P5).

## Verification plan

Each gate's evidence artifact is named above; together they satisfy RFC
0014's external list (production-qualification.md:43-51). Local re-proof
after P1: `just verify` (includes `test_d1_restore.py`, shellcheck, full
TypeScript coverage) and `just qualification` (50k rows default;
`.artifacts/qualification/report.json`) for the checklist items
(production-release-checklist.md:10-14).

## Documentation impact

Owner updates `memory-bank/activeContext.md` and `progress.md` as gates
close (≤180-line budget enforced by `scripts/check_repo.py:313-316`);
`evidence/WS-0011/evidence.md` gains the soak/drill outcomes; no public docs
change — `docs/public/how-to/*` already describe the exact commands used.

## Rollback or recovery

Per-gate rollback above. Global rule: staging is disposable; production is
never touched before G5B acceptance and a human release decision. D1
rollback is unnecessary anywhere in this plan — no gate mutates live
canonical data except the Worker itself under its normal bounded ingestion.

## Capability request

No new capabilities granted to agents. Agents may: run `just verify`,
`just qualification`, drive the staging UI journey, and read
`.artifacts/`. Operators personally run: `./deploy`,
`JOB_INDEX_ACTIVATE_SCHEDULES=1 ./deploy`, `just d1-restore`, `just soak`
(launch), `just nav-key(-cloudflare)`, `./deploy-production`.

## Termination and retry policy

One authorized attempt per external drill; a failed drill may be retried
once with a fresh target name after the report is read (attempt budget 2,
matching WS-0013 convention). A failed soak ends the window — restarting
the seven-day clock is an operator decision, not an automatic retry.
Stop and escalate per `AGENTS.md` § Stop conditions on any contradicting
evidence.

## Ordering summary

P1 owner integration → `just verify` + `just qualification` (agent) →
`./deploy` schedules-off (operator; Gate 1) → journey + one bounded NAV
checkpoint with temporary schedule activation (Gate 2) → `just d1-restore
…` disposable drill (operator; Gate 3, may run adjacent to Gate 4 start) →
activate schedules and run `just soak … 604800 60` (Gate 4; deactivate
after) → `just nav-key-cloudflare` rotation (5a) → `./deploy-production`
smoke (5b) → independent G5 review (5c) → release decision. Production
acceptance remains blocked until every preceding artifact exists.
