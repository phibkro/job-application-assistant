# WorkScope: Lazy on-use NAV ingestion (cron retirement)

- ID: WS-0017
- Revision: r1 (frozen contract — implementer executes verbatim; deviations require a new revision)
- Owner: Project maintainer
- Risk tier: **R2** (medium — `policy/risk-tiers.json:36-43`: behavior change (ingestion trigger model swaps from schedule to on-use) plus infrastructure configuration change (cron triggers removed from the deployed Worker declarations); no dependency addition, no personal-data surface change. Triggers plan review, independent review, rollback plan, provenance; human gates `scope` + `acceptance_or_integration`.) It does **not** rise to R3: the gate mutates no owner-owned rows, exposes no new endpoint authority, and the additive table carries platform-scoped timestamps only.
- Repository/ref: `job-index` — executes on the current tree. Local `main` carries four unpushed qualification commits (`d4e10e6`, `d56f5e2`, `ed3c1eb`, `dfa0fe3`); they stay untouched. **No git mutations of any kind.**
- Attempt budget: 2 (one implementation pass + one remediation pass)

## Goal

Retire cron-driven NAV ingestion and replace it with lazy on-use ingestion. Background: staging schedules were switched off and the staging trigger installs but Cloudflare never dispatches it while control Workers on the same account tick normally (operator escalation to Cloudflare support is open — see `memory-bank/activeContext.md`). Production's one credential-gated trigger has never passed its soak. The owner has decided: stop waiting on platform dispatch. The corpus refreshes when someone uses the site and ingestion has not been attempted since the attempt floor expired.

Semantics: **stale-while-revalidate**. Every read path keeps serving stored data immediately; a server-side freshness gate checks a persisted attempt marker after the response is computed and, when due, fires exactly one bounded, checkpointable ingestion run via `ctx.waitUntil`. User latency never includes ingestion work. Single-flight is guaranteed twice over: a D1 compare-and-set claim (via `atomicAffected`) arbitrates the gate, and the existing source-lease Durable Object still admits one collector per platform.

### Why now (context the implementer must not re-litigate)

The seven-day soak and production qualification in `work/WS-0014-r1-execution-plan.md` were gated on cron dispatch. This slice removes that dependency: ingestion liveness becomes a property of owner site usage plus a local gate, observable through the existing status route. It supersedes the *trigger* decisions in WS-0002-r1/WS-0004-r1 (schedule-driven ingestion, lease reliability); it preserves their run semantics verbatim.

## Non-goals

- **No change to `Ingestion.collect` semantics**: one bounded page per invocation (`maxPages: 1`, `maxObservations: 2000`, `maxDurationMs: 25_000`, `leaseRecoveryMs: 5min` — `apps/worker/src/ingestion/scheduled.ts:11-16`), checkpointed cursor, existing failure taxonomy (`IngestionFailure` records, `stoppedReason` strings), existing logging. Nothing in `apps/worker/src/ingestion/collect.ts` or `services/Ingestion.ts` changes behavior.
- **No second ingestion path**: the gate drives the same `SourceCatalog.list({ _tag: "Feed" })` iteration `scheduledIngestion` performs today. No new acquisition tier, no Firecrawl, no new sources.
- **No scheduler replacement** (Queues, Workflows, Durable Object alarms for triggering): the gate is a plain request-time check. Alarm machinery exists only inside `SourceLeaseObject` for lease recovery, unchanged.
- **No unauthenticated trigger surface**: the gate arms only on the authenticated feed read paths (below). Anonymous crawlers hitting `GET /api/v1/jobs` must not be able to drive NAV traffic.
- **No client changes**: `apps/web/**` untouched. The feed/browse UI cannot tell the difference.
- **No schema regeneration beyond the additive marker table**, and no erasure-surface change (the marker table is not profile-scoped; see Schema).
- **No e2e changes**: verified 2026-08-25 — no fixture under `e2e/` references schedules, `/__scheduled`, or cron configuration. `e2e/` is read-only this slice.
- **No telemetry/OpenTelemetry changes** beyond the logs the gate runner already emits through the existing console/telemetry path.

## Design

### Trigger points (exact routes and handlers)

The freshness gate arms on exactly these authenticated browse/feed read paths:

| Route | Handler | Group |
| --- | --- | --- |
| `GET /api/v1/me/feed` | `fresh` (`apps/worker/src/handlers/feed.ts:21-37`) | `feed` |
| `GET /api/v1/me/matches/:id` | `getMatch` (`apps/worker/src/handlers/feed.ts:38-57`) | `feed` |

Both sit behind the `Authenticated` middleware (`apps/worker/src/Api.ts:350-369`), so arming is owner-usage-gated by construction.

Deliberately **excluded**, and why:

- `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `GET /api/v1/sources/catalog` (`corpus` group, `apps/worker/src/Api.ts:321-341`) — unauthenticated by design ("inspectable without an account"); arming the gate on them lets arbitrary bot traffic drive NAV ingestion. The directive's "authenticated browse/feed read paths" is read literally.
- `GET /api/sources/nav/status` — observability must never mutate ingestion state, or reading the dashboard would distort the thing it observes.

Mechanically the gate does **not** live in the handlers at all. The composition root in `apps/worker/src/index.ts` already owns the boundary between platform and program: after `fetch`'s awaited handler resolves (response computed, body ready to stream), it calls `ctx.waitUntil(runLazyIngestion(env))`. This mirrors the existing `scheduled` export's structure (`apps/worker/src/index.ts:135-155`) and keeps every handler, the router, and the service graph ignorant of `ExecutionContext` — no threading of `waitUntil` through `appLayer`, no new request-scoped service, no mutation of the cached-handler pattern. Ordering guarantee: `waitUntil` is invoked strictly after `await handler(request)` resolves, so the gate can never delay or reorder the response; it only extends isolate lifetime for the ingestion work.

### Freshness marker storage — decided: new `ingestion_gate` table

Reuse candidates were evaluated and rejected:

- `source_state.updatedAt` — disqualified twice. First, it is not an attempt stamp: `Ingestion.collect` checkpoints it from an `ensuring` finalizer even when a page fails, and the status repository explicitly documents that it "is not a success boundary" (`apps/worker/src/db/repositories/IngestionStatus.ts:14-15`). Using it would make failed runs look fresh. Second, the row may not exist at all until a platform's first complete page folds (`SourceState.checkpoint` inserts on first checkpoint, `apps/worker/src/db/repositories/SourceState.ts:22-27`), leaving the gate unable to stamp attempts precisely when NAV is down — the moment backoff matters most.
- `ingestion_runs` latest row — an append-only ledger query per request plus a semantic mismatch (a run that lost the lease writes no row; a `LeaseHeld` skip is not an attempt).

So: one additive table, one row per platform.

```sql
CREATE TABLE IF NOT EXISTS ingestion_gate (
  platformId TEXT NOT NULL,
  lastAttemptAt TEXT NOT NULL,
  PRIMARY KEY (platformId)
);
```

Timestamps are the house `DateTime.formatIso` UTC strings, compared lexicographically — the same property `ORDER BY startedAt DESC` already relies on (`apps/worker/src/db/repositories/IngestionStatus.ts:28`). Domain model `IngestionGate` (`platformId: PlatformId`, `lastAttemptAt` text timestamp) joins `packages/domain/src/Ingestion.ts` beside `SourceState`/`IngestionRun`/`IngestionFailure` (`packages/domain/src/Ingestion.ts:37-81`), following the `Model.Class` precedents there.

Erasure: not registered in `Erase.ts`. The purge surface is `profileId`-scoped by construction; `ingestion_gate` carries no `profileId`, exactly like `source_state`, `ingestion_runs`, and `ingestion_failures`, none of which are purged.

### Single-flight claim — `atomicAffected` CAS

New repository `apps/worker/src/db/repositories/IngestionGate.ts` with:

```ts
/**
 * Seeds the row when absent and conditionally stamps this attempt.
 * Returns true only for the one caller whose UPDATE matched.
 */
export const claim = (
  platformId: PlatformId,
  nowIso: string,
  floorCutoffIso: string,
): Effect.Effect<boolean, never, Database>
```

implemented as one `atomicAffected` batch (`apps/worker/src/services/Database.ts:33-41` — "the only reliable way to validate a … compare-and-swap against D1"):

```sql
-- write 1: bootstrap (row absent ⇒ seed with the epoch so the first use wins)
INSERT OR IGNORE INTO ingestion_gate (platformId, lastAttemptAt) VALUES (?, '1970-01-01T00:00:00.000Z')
-- write 2: the claim
UPDATE ingestion_gate SET lastAttemptAt = ? WHERE platformId = ? AND lastAttemptAt <= ?
```

`won ⇔ affected[1] === 1`. D1 `batch()` runs its statements sequentially inside one transaction, so write 2 always observes write 1's row; two isolates racing the same window serialize on SQLite's write lock and exactly one sees `changes() = 1`. Concurrent-isolate safety is inherited from the primitive, not hoped for — and proven by a real-D1 concurrency vector (Acceptance (d)).

Read side: `find(platformId)` returning `lastAttemptAt | undefined` for the status route.

### The gate effect — `apps/worker/src/ingestion/lazy.ts`

Beside `ingestion/scheduled.ts`, same style (plain Effect value requiring service tags, no new `Context.Service` — nothing handler-resolved needs a tag):

```ts
export type LazyOutcome =
  | { readonly _tag: "Claimed"; readonly reportBySource: ReadonlyArray<string> }
  | { readonly _tag: "WithinFloor" }
  | { readonly _tag: "LeaseHeld" };

export const ingestIfDue: Effect.Effect<
  LazyOutcome,
  never,
  Database | SourceCatalog | Ingestion
>
```

Behavior, in order:

1. `now` from `DateTime.now`; cutoff = `now − INGESTION_ATTEMPT_FLOOR_MS`.
2. `claim(NAV_PLATFORM_ID, nowIso, cutoffIso)`. Loser ⇒ `WithinFloor`, done. (One registered Feed source exists today — NAV — and `scheduledIngestion` already loops `catalog.list({ _tag: "Feed" })`; the gate loops the same way and stamps once per gate firing, not per source. With one Feed source the distinction is moot; the loop keeps the future multi-source shape identical to the scheduled path.)
3. Winner ⇒ iterate Feed sources, `ingestion.collect(entry.id, DEFAULT_RUN_BUDGET)` (budget moved from `scheduled.ts` into `lazy.ts`'s shared constant — same numbers, one definition shared by both callers so they cannot drift).
4. `LeaseHeld` from a source ⇒ recorded as `LeaseHeld` outcome contribution, never an error. The attempt stamp is **not** rolled back: a burned window costs at most one floor of delay, and restoring stamps would reintroduce a second racy write for a scenario (another collector holding the lease) that, post-cron, is rare and self-heals. This is the "skip cleanly" requirement, specified.
5. Any other failure ⇒ the existing `collect` error taxonomy handles recording (`ingestion_failures` rows, run ledger); the gate maps whatever escapes into the outcome and **never throws**. Because the claim already wrote `lastAttemptAt = now`, failure backoff falls out of the same floor — no separate failure counter, no jitter knob.

Pure decision logic for unit tests: `attemptDue(nowIso, lastAttemptIso | undefined, floorMs): boolean` — string-clock comparison only, no `Date.now`, no randomness. The Effect wrapper supplies the clock.

### Error containment and fail-loud

The `waitUntil` promise handed to `ctx.waitUntil` in `index.ts` **never rejects**. The runner catches all exits:

- Expected outcomes (`WithinFloor`, `LeaseHeld`, ordinary `collect` failures already recorded by the taxonomy) log at the existing info/warn levels via the current logging path.
- **Configuration defects fail loud.** If the `ingestion_gate` table is missing (migration 0003 not applied) or the claim statement fails for a structural reason, the runner detects it (D1 error text matching `no such table: ingestion_gate`, or any exit of the claim step itself) and logs at **error** level with a remediation-naming message: `"lazy ingestion is the only ingestion path and its gate table is missing — apply db/migrations/0003_ingestion-gate.sql"`. Loud means visible and diagnosable, not response-fatal: the user response has already been computed and is untouched either way. A workerd-real test proves the missing-table case produces the error-level defect log and not a silent skip (Acceptance (f)).
- The status route carries the second fail-loud channel (below): `lastAttemptAt: null` after real authenticated usage is the "gate never fired" smoke signal.

### Config — typed Env with defaults

`apps/worker/src/runtime/Env.ts` gains one optional variable, decoded with a default (same optional-string pattern as `NAV_API_TOKEN`, `runtime/Env.ts:30`, `:93`):

```ts
/**
 * Minimum interval between lazy ingestion *attempts*, in milliseconds.
 * Default 21_600_000 (6 hours): attempt at most once per 6h. The success
 * target — corpus staleness ≲ 24h — is a consequence of this floor plus
 * NAV retention-bounded sweeps, not a second timer; there is deliberately
 * no success-staleness knob.
 */
readonly INGESTION_ATTEMPT_FLOOR_MS: number;
```

`decodeEnv` parses `bag.INGESTION_ATTEMPT_FLOOR_MS` when present (positive finite integer; invalid values throw `EnvironmentIncomplete` naming the variable — a malformed override is a deployment wiring bug, same philosophy as the binding checks above), defaulting to `21_600_000`.

Documented values:

- **Attempt floor: 6 h (default).** Bounds worst-case staleness growth to ≤ ~6 h + sweep duration per usage event, while keeping NAV request volume far below the old 15-minute cron.
- **Success target: ~24 h staleness.** Not separately configured — a stale corpus under 24 h is acceptable by product decision, and any real knob here would be dead config the gate never reads. Recorded as a deliberate rejection of the plural in the brief.
- Infra declares nothing by default; an operator overrides per stage through `environmentVars` in `infra/alchemy.run.ts` only when a stage needs a different cadence. No override ships in this slice.

### Infra — cron removal, preview hook preserved

`infra/alchemy.run.ts`:

- Delete `ACTIVATE_SCHEDULES` (`:81`), `INGESTION_CRON` (`:146`), `SCHEDULES_ALLOWED` (`:147`), and `CRONS` (`:149`).
- Replace the `crons:` ternary (`:227`) with an unconditional, commented `crons: []` — explicit emptiness, so a reader sees "no schedules" as a decision rather than an omission, and Alchemy diffs the deployed trigger set down to empty on the next staging deploy. Update the surrounding comments (including the two-phase publication note at `:75-80`) to say why: lazy on-use ingestion replaced the schedule; production's credential-gated trigger is retired.
- Everything else in the file — bindings, assets, secrets, DO namespace, databases — unchanged.

Repository gates that assert the old shape must move with it:

- `scripts/check_repo.py:365-377` — the `schedule_activation_guard` / `INGESTION_CRON` assertions become: assert `infra/alchemy.run.ts` contains `crons: []`, contains **no** `JOB_INDEX_ACTIVATE_SCHEDULES`, `INGESTION_CRON`, or `SCHEDULES_ALLOWED`, and still contains the inactive-cron prohibition. Keep the check, invert its object.
- `scripts/test_environment_safety.py:18-52` — same inversion; additionally retain (unchanged) the `"/__scheduled*"` and `--test-scheduled` assertions (`:19-20`), which protect the preserved local hook below.
- `scripts/deploy.sh:149-152` — remove the `JOB_INDEX_ACTIVATE_SCHEDULES` plumbing (phase-2 schedule activation activates nothing now). The credentials-first two-phase production flow otherwise stands.

Preserved, explicitly marked local-only:

- The `scheduled` export in `apps/worker/src/index.ts` stays, its docstring amended: *"Local preview/testing only — no stage declares a cron trigger; production ingestion is lazy (see `ingestion/lazy.ts`)."*
- `/_scheduled` test endpoint via wrangler `--test-scheduled` (`scripts/preview.sh:45`), the banner recipe (`:41`), and `dev/preview.wrangler.jsonc:38`'s `run_worker_first` entry stay untouched. `just preview` therefore still runs one bounded real NAV page locally.

### Production tradeoff (must appear verbatim in the deploy evidence)

With the cron triggers removed, **lazy on-use ingestion becomes the only production ingestion path, and it depends on owner site usage.** An owner who does not sign in for a week gets a week-old corpus, silently. The compensating controls are: the status route (below) answers "is the corpus stale" from durable state, and rollback is a config revert (below). This tradeoff is accepted by the owner's decision to retire cron-driven ingestion; it is stated here so no future reader mistakes it for an accident.

### Status route stays authoritative

`GET /api/sources/nav/status` keeps computing `lag_seconds` and `consecutive_failures` from `ingestion_runs`/`ingestion_failures` exactly as today (`apps/worker/src/handlers/status.ts:16-44`, `db/repositories/IngestionStatus.ts:22-42`) — unchanged sources, unchanged math. Additively, the response gains `lastAttemptAt: string | null`, read from `IngestionGate.find(NAV_PLATFORM_ID)`: the age of the last gate attempt. `lag_seconds` answers "how old is the corpus"; `lastAttemptAt` answers "is the lazy path alive". `null` with recent authenticated traffic is the misconfiguration signature. The wire struct `IngestionStatus` in `apps/worker/src/Api.ts:300-304` gains the optional field; no client change is required (additive JSON), and `openapi/job-index-v1.json` stays untouched (its regeneration is a known open decision, `memory-bank/activeContext.md:101`).

## Schema and migration plan

Order fixed, per WS-0016 precedent: domain model first, regenerate snapshot, emit migration.

1. `packages/domain/src/Ingestion.ts` — additive `IngestionGate` `Model.Class` (`platformId: PlatformId`, `lastAttemptAt` timestamp string). Barrel unchanged (module already exported).
2. `scripts/ts/schema.ts` — `columnTypes` entries, `tables` entry `{ model: IngestionGate, primaryKey: ["platformId"] }` (no indexes beyond the PK), and a `migrations` append mirroring the 0002 pattern:
   ```ts
   {
     name: "0003_ingestion-gate.sql",
     currentWhen: "EXISTS (SELECT 1 FROM pragma_table_info('ingestion_gate') WHERE name = 'lastAttemptAt')",
   },
   ```
3. `bun run schema` → regenerates `db/schema.sql` (table joins its siblings at `db/schema.sql:287-319`); `bun run schema:check` and `bun run catalog:check` stay green.
4. New `db/migrations/0003_ingestion-gate.sql` with the `CREATE TABLE IF NOT EXISTS` above, headed by a comment in the voice of `db/migrations/0001_saved-workspace.sql` (fresh databases get the table from the snapshot, which pre-marks the migration via `currentWhen`; existing databases are migrated by Wrangler). `0001`/`0002` untouchable.
5. Deployment ordering requirement: the staging deploy that ships this slice applies migrations via the existing `scripts/migrate-d1.sh` / `d1_migrations` flow **before** the gate can fire; the fail-loud detection above covers the window where it did not.

## Route contracts

No new routes. No changed request/response contracts except the additive `lastAttemptAt` on the ingestion status payload. No new error classes — the gate introduces no wire-facing failure at all, which is the point.

## Files touched (complete list; anything else is a deviation)

- `packages/domain/src/Ingestion.ts` — additive `IngestionGate` model.
- `scripts/ts/schema.ts` + generated `db/schema.sql`; new `db/migrations/0003_ingestion-gate.sql`.
- `apps/worker/src/db/repositories/IngestionGate.ts` (new) + `IngestionGate.test.ts` (new; auto-covered by the workers pool glob `apps/worker/src/db/repositories/*.test.ts`, `vitest.workers.config.ts:79`).
- `apps/worker/src/ingestion/lazy.ts` (new) + `lazy.test.ts` (Bun unit) + `lazy.live.test.ts` (workerd-real).
- `apps/worker/src/ingestion/scheduled.ts` — only: share the `DEFAULT_RUN_BUDGET` constant with `lazy.ts` (move or re-export; values byte-identical) and mark the module local-preview-only in its docstring.
- `apps/worker/src/runtime/Env.ts` — `INGESTION_ATTEMPT_FLOOR_MS` + decode; `Env.test.ts` coverage.
- `apps/worker/src/index.ts` — fetch arms the gate via `ctx.waitUntil` after the response resolves; `scheduled` docstring marked local-only.
- `apps/worker/src/handlers/status.ts` + `apps/worker/src/Api.ts` (`IngestionStatus` struct) — additive `lastAttemptAt`; `status.test.ts` extensions.
- `infra/alchemy.run.ts` — cron declarations removed, `crons: []` explicit, comments updated.
- `scripts/check_repo.py`, `scripts/test_environment_safety.py` — schedule-guard inversions (preserve the `--test-scheduled`/`/__scheduled` protections).
- `scripts/deploy.sh` — remove `JOB_INDEX_ACTIVATE_SCHEDULES` plumbing only.
- `memory-bank/activeContext.md` — one decision-line update recording the trigger-model change (post-integration, during cleanup).

Explicitly forbidden even though adjacent: `apps/web/**`, `apps/worker/src/ingestion/collect.ts` and `budget.ts` and `failureDetail.ts` and `SourceLeaseObject.ts` (semantics frozen), `apps/worker/src/services/Ingestion.ts` and `Acquisition.ts` and `SourceLease.ts`, `packages/adapters/**`, `packages/domain/src/**` beyond the one additive model, `db/migrations/000[12]*`, `docs/**`, `policy/**`, `openapi/**`, `templates/**`, `e2e/**`, `playwright.config.ts`, dot-files, lockfiles, `package.json` manifests (zero dependency changes). Package installation prohibited. **No git mutations** (`git add/reset/commit/stash` included). No network calls to Cloudflare or NAV beyond what the local preview commands already do when the implementer exercises them.

## Acceptance criteria (each independently checkable)

- [ ] **(a) Full gates green:** `bun run check` (fmt, lint, imports, typecheck, `schema:check`, `catalog:check`, bundle, unit + coverage) and `bun run test:workers` pass end to end; `just check` (repository gates incl. the rewritten Python guards) passes.
- [ ] **(b) Marker unit tests (Bun):** `attemptDue` truth table (never-attempted ⇒ due; within floor ⇒ not due; at/past floor ⇒ due; malformed stamp treated as due with an error log, not an exception). `IngestionGate` repository tests on the SQLite TestLayer: bootstrap insert, claim win, claim loss within floor, stamp advance on loss-window expiry.
- [ ] **(c) Floor gating:** within the floor, repeated authenticated `GET /api/v1/me/feed` calls produce exactly one `collect` invocation total (fake `Ingestion` counting calls); after the floor (clock moved past cutoff), the next gated call collects again. Proves "no second attempt within floor".
- [ ] **(d) Claim exclusivity on real D1 (targeted live-D1 vector):** in `lazy.live.test.ts` against the workerd D1 binding, N ≥ 8 concurrent `ingestIfDue` runs race the claim — exactly 1 `Claimed`, N−1 `WithinFloor`, exactly one `collect` batch, one marker row with one stamp. Style follows `db/transactionSemantics.live.test.ts:33-48` (real `atomicAffected` win/loss vectors). This is the targeted live-D1 evidence for the CAS.
- [ ] **(e) Failure updates the attempt stamp:** fake `Ingestion.collect` fails (and records via the existing taxonomy path); `lastAttemptAt` equals the claim time; immediate retry yields `WithinFloor` with no second `collect`. `LeaseHeld` behaves identically from the gate's perspective (outcome surfaced, no throw).
- [ ] **(f) waitUntil isolation:** with a permanently-failing `Ingestion` (and, separately, with the `ingestion_gate` table dropped), the fetch path still returns the normal feed/corpus response — the runner never rejects its `waitUntil` promise; the dropped-table case emits the remediation-naming **error**-level log (asserted), never a silent skip. Handler-level proof via the `handlers/corpus.live.test.ts` full-stack pattern.
- [ ] **(g) Status correctness:** `navStatus` returns unchanged `lag_seconds`/`consecutive_failures` for existing fixtures, plus `lastAttemptAt` reflecting the marker (value after a claim; `null` before any attempt). Existing `handlers/status.test.ts` cases pass unmodified except additive assertions.
- [ ] **(h) Infra/guards:** `infra/alchemy.run.ts` declares `crons: []` unconditionally and contains none of `INGESTION_CRON`/`SCHEDULES_ALLOWED`/`ACTIVATE_SCHEDULES` (transcript grep); the `scheduled` export and `scripts/preview.sh` `--test-scheduled` + `/__scheduled` recipe survive (transcript grep); rewritten Python guards pass and demonstrably fail on a reintroduced trigger (negative check archived).
- [ ] **(i) Config decode:** `INGESTION_ATTEMPT_FLOOR_MS` absent ⇒ 21 600 000; valid override respected; `"0"`, negative, non-numeric ⇒ `EnvironmentIncomplete` naming the variable.
- [ ] **(j) Diff stat confirms touched-path confinement** to the allowed list; no e2e file modified (verified against the verified-empty schedule-reference baseline).

## Rollback

Two independent, composable reversions:

1. **Infra revert (fast path, minutes):** restore the previous `infra/alchemy.run.ts` (git history holds it; the rewrite is confined to the deleted constants + `crons:` line) and redeploy. Cron triggers reinstall and resume driving `scheduledIngestion`. The lazy gate may remain deployed: cron and gate coexist safely — the claim floor throttles gate attempts, the lease DO serializes collection, and a gate attempt losing the lease skips cleanly. Worst case is one redundant bounded page per floor window.
2. **Full revert:** revert the integration commit. The lazy code disappears; `ingestion_gate` and its `d1_migrations` marker stay behind, inert to the reverted code exactly as 0001/0002 residue is tolerated by snapshot regeneration (`IF NOT EXISTS`). No data operation exists to undo — the table holds timestamps only.

**Fail-loud commitment (specified, not optional):** the gate must never degrade to silent no-op on misconfiguration. Missing table ⇒ error-level remediation log on the next gated request (proven by test (f)); missing/malformed env override ⇒ `EnvironmentIncomplete` at first request; `lastAttemptAt: null` on the status route makes "gate never armed" externally visible. An inert-looking gate is a bug, not a fallback.

## Required evidence

- Full-pass logs: `bun run check`, `bun run test:workers`, `just check`.
- Transcripts: criteria (h) greps (absent cron identifiers, present preview hook, `crons: []`), (j) diff stat, and the negative guard check.
- Live-D1 claim-exclusivity vector transcript (criterion d) and floor/failure/isolation transcripts (c–f).
- Staging redeploy evidence: Alchemy output/API-visible trigger list showing **zero** cron triggers post-deploy, plus the applied-migration confirmation for `0003_ingestion-gate.sql`.
- `curl GET /api/sources/nav/status` from the staged deployment showing `lag_seconds` and the new `lastAttemptAt` (non-null after one authenticated feed visit, before-vs-after pair archived).
- The verbatim production-tradeoff paragraph (§ "Production tradeoff") copied into the deployment record.

## Supersedes

Nothing wholesale. Executes the owner's 2026-08-25 decision retiring cron-driven ingestion; supersedes only the *trigger* mechanics of WS-0002-r1/WS-0004-r1 while preserving their run-budget, lease, checkpoint, and failure-recording semantics byte-for-byte. Leaves WS-0014-r1's qualification framework standing; the seven-day-soak gate it defined is hereby decoupled from platform cron dispatch and re-pointed at lazy-ingestion evidence (status route + staged redeploy).

## Deviations from r1

Lead-authorized remediation pass (independent R2 review verdict FAIL: two High,
two Medium, three Low), all within the frozen attempt budget:

1. **Criterion (f) implemented as specified** (review H1): `runLazyIngestion`
   exported from `apps/worker/src/index.ts` and driven directly by two new
   workers-pool cases in `ingestion/lazy.live.test.ts` — case A (permanently
   failing `Ingestion`) resolves without throwing; case B (`DROP TABLE
   ingestion_gate` on the real binding) resolves AND emits the ERROR-level
   remediation line naming migration 0003, asserted through a console
   interception (the runner's own runtime uses the default logger writing via
   `globalThis.console`; injecting a different logger would test something
   production never runs).
2. **Gate arming scoped to the contract routes** (review H2): `fetch` arms via
   an exported `armsGate(pathname)` predicate — `/api/v1/me/feed` exactly, or
   `/api/v1/me/matches/:id` prefix. Corpus, catalog, status, and health paths
   never arm; pinned by tests including marker-untouchedness after excluded
   paths.
3. **Containment order fixed** (review M1): `Effect.provide(services/platform)`
   now precedes `Effect.catchDefect`, so a defect raised while building the
   service graph is logged rather than rejecting the waitUntil promise. The
   NEVER-rejects doc comment is now true of the whole construction.
4. **Guards strengthened** (review M2): both Python gates pin the exact literal
   `const CRONS: ReadonlyArray<string> = [];` and reject any five-field
   cron-looking string literal anywhere in infra's code. Negative evidence now
   demonstrates three failure modes: identifier reintroduction, renamed
   non-empty trigger array, and a bare cron string under an unrelated name.
5. **Accepted notes (L1–L3), no code change**: (L1) `ingestIfDue`'s loop
   short-circuits on the first LeaseHeld/failure instead of contributing and
   continuing — coincident with the contract today because exactly one Feed
   source is registered; revisit if a second Feed source ships. (L2) An
   interrupted `collect` would classify via `Exit.hasDies === false` into the
   LeaseHeld branch; unreachable in practice because nothing interrupts
   `collect` inside waitUntil. (L3) Bookkeeping recorded here rather than left
   "(none recorded)": the `LazyOutcome` union carries payloads beyond the
   sketch's three tags; `lazy.live.test.ts` required one include/exclude line in
   each vitest config; `db/Sqlite.test.ts`'s generated-table list gained
   `ingestion_gate`; `scripts/test_d1_migrations.py` was extended to assert the
   0003 pre-mark probe against its migration file; `attemptDue`'s signature is
   `(lastAttemptIso | undefined, cutoffIso)` rather than the sketch's
   three-argument form (pure property unchanged). Per contract, the
   memory-bank/activeContext.md decision line stays scheduled for integration
   cleanup.

## Open questions

None. Every previously open trigger question (dispatch bug workaround, staging activation flag, soak dependency) is resolved by this slice's decisions; the remaining production blockers (private-token rotation, smoke/deploy, G5 review) are operator gates outside this scope.
