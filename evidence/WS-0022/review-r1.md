# WS-0022 (TB-01) independent review: round 1

- Subject: branch `ws22`, commits `531f73c` (implementation) and `4e81357` (evidence and memory bank), base `983312a`.
- Reviewer: independent, at the `complex-reasoning` tier. Did not author the change.
- Method: `git archive 4e81357` into `/tmp/ws22r` (gates) and `/tmp/ws22m` (mutations and probes), each with `bun install --frozen-lockfile`. Both checkouts stayed read-only (`git status` is clean in both, ws22 HEAD is `4e81357`). No pushes, no GitHub writes, `VP_GIT_HOOKS=0`.
- Toolchain: wrangler from `node_modules/.bun/wrangler@4.120.0/node_modules/.bin`, shellcheck 0.11.0 from `nix build nixpkgs#shellcheck.bin`. `devenv` was not used, same as the implementer.

## Verdict

**There is one finding at medium (R1). Nothing is high or critical.** Under the owner's merge delegation (rounds 1–3: merge only when nothing at medium or above), **this head does not qualify for auto-merge.** R1 has a small fix: about one migration line plus one test. Every other finding is low or nit, and the slice otherwise meets its contract on my own runs.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| R1 | **medium** | Purging the newest observation lets the next insert reuse its `recordedSeq`, which breaks recorded-time as-of and the change cursor |
| R2 | low | `INSERT OR REPLACE` bypasses both triggers: it rewrites an observation, and deletes one that collides on `recordedSeq`, with no tombstone |
| R3 | low | API (a): invalid `workloadMin`/`workloadMax` return 500, and `workloadMin=` (empty) also returns 500 |
| R4 | low | API (b): the filter runs after the page scan, so pages come back short and `excluded`/`groups` are per page |
| R5 | low | API (e): background hydration does not feed `getJob`, so the same NAV detail can be fetched twice |
| R6 | low | `test_d1_migrations.py` never applies 0006 to a database built from the 0005 snapshot (I checked it by hand: it is clean) |
| R7 | low/info | API (c): the projection follows today's merged identity, so merged requisitions fuse into Conflicting |
| R8 | nit | `applySchema`'s line-ending-`;` split is correct today but has no self-check against statement merging |
| R9 | nit | The boundary scan misses bare side-effect imports (`import "effect/Effect"`) |
| R10 | nit | `parseWorkloadQuery` accepts `4e1`, `0x28` and `" 40 "` (via `Number`) |
| R11 | nit | API (d): camelCase columns instead of the contract's `workload_min` spelling |

### R1 (medium): recorded sequence reuse after a purge

`store.ts` assigns `recordedSeq` as `(SELECT COALESCE(MAX(recordedSeq), 0) + 1 FROM observations)`. `purge` deletes the observation row, and the tombstone does not store its sequence. When the purged row was the newest one, the next append gets the **same** `recordedSeq` the purged row had.

Reproduced on D1 inside workerd (a scratch live test, since removed). Insert a (seq 1), b (seq 2), purge b, insert c: rows are `[["a",1],["c",2]]`. Also reproduced in Python `sqlite3` against `db/migrations/0006_observation-store.sql`: purge the max row c (seq 3), insert d, and d gets seq 3.

Consequences:

- The as-of view at `t = 2`, answered before the purge and the next insert, now includes c, which was recorded later. That breaks the "answer at t unchanged by later observations" law, the F6 guarantee and the contract's "recorded-time as-of" item.
- The change cursor (`changedSince(observations, t)` on `recordedSeq`, as the falsifiers define it) skips c for a consumer already at cursor 2.
- Because the table is append-only, rows written with a reused sequence cannot be corrected later.

It is latent: `purge` has no production caller yet (only `store.live.test.ts` calls it). It is still a defect in the one lawful write path the slice delivers, and nothing tests it. The `purge` test purges a row and replays it, but never appends after a purge of the newest row.

Fix options:
- Record `recordedSeq` in `observation_tombstones` and take the max over both tables.
- Or use a monotone counter: a one-row sequence table, or `INTEGER PRIMARY KEY AUTOINCREMENT` semantics via `sqlite_sequence`.

Either way, add a D1 test: purge the newest row, append, and assert the new sequence is greater than the purged one.

### R2 (low): `INSERT OR REPLACE` bypasses the append-only triggers

SQLite runs REPLACE's implicit deletes without delete triggers unless `recursive_triggers` is on. It is off on D1 (asserted in workerd: `PRAGMA recursive_triggers` = 0).

Shown on D1 in workerd and in Python:
- `INSERT OR REPLACE` with an existing `id` rewrites status and payload.
- With a colliding `recordedSeq`, it **deletes a different observation**.
- No tombstone is written in either case (`count(*) = 0`).

No WS-0022 code path uses REPLACE; `store.ts` uses `ON CONFLICT (id) DO NOTHING`. The repo does use `INSERT OR REPLACE` elsewhere (`db/catalog-seed.sql`, `scripts/ts/catalog.ts`), so it is a familiar idiom that someone could reach for later. The literal acceptance item ("an UPDATE or DELETE on observations fails") holds. The README's and `store.ts`'s claim that "append-only is the database's guarantee" is broader than what the triggers enforce.

Fix: a `BEFORE INSERT` trigger that does `RAISE(IGNORE)` when `NEW.id` exists, and `RAISE(ABORT)` when `NEW.recordedSeq` belongs to another id. This keeps replays as no-ops. It is cheap to bundle with R1.

### R3–R7, R11: the implementer's flagged API semantics, rated

- **(a) Invalid parameters → 500 (R3, low).** `Effect.die` follows the existing precedent for an unrecognised `status` (`decodeEnum`, documented in `corpus.ts`), and the endpoint declares no error type. The parameters are new, so no existing client changes behaviour. Two caveats:
  - `?workloadMin=` (empty) also returns 500, while `term`/`location` treat `""` as absent.
  - A client error showing up as a server error pollutes error monitoring.
  - Before promoting the filter beyond experimental, declare a 400.
- **(b) Filter after the page scan (R4, low).** Correct as implemented: `nextCursor` is computed from the unfiltered scan, so paging terminates and skips nothing. Pages can still come back short, even empty with a `nextCursor`. `excluded` and `groups` describe only that page. This is acceptable for an experimental field, and the README documents it.
- **(c) Merged identity fuses into Conflicting (R7, low/info).** Correct given the contract's exclusions: no identity change, D05 stays pinned by T4. Conflicting is honest: it fabricates no value, and `store.live.test.ts` pins it. TB-02 replaces the membership input. No action needed now.
- **(d) camelCase columns (R11, nit).** Matches the repository's column and parameter convention (`canonicalJobId`, `sourceId`). The contract spelling was descriptive. Record it as a deviation and nothing more.
- **(e) Background hydration writes only the observation store and projection; the read-path `getJob` fetch remains (R5, low).** This is required by the contract ("no change to existing routes' behavior"; WS-0020's T5 characterization still passes unchanged). The cost is a possible second NAV fetch of the same detail: once by bounded hydration, once on open. A follow-up for TB-05.

### R6 (low): migration test gap

`test_d1_migrations.py` is a real extension. Every old assert is kept; the expected marked-migration lists only gain 0006; and it adds 0006-equals-snapshot plus trigger checks. But it applies 0006 only to an empty database. I applied it to a database built from the **base** (`983312a`) snapshot, which pre-marks 0001–0005:

- 0006 applies cleanly and is idempotent when re-run.
- No existing object's SQL changed.
- It adds exactly the 9 new objects.
- The upgraded database is object-for-object identical to the new snapshot.

Worth adding to the script.

### R8–R10 (nits)

- **R8:** see "Modified existing tests" below.
- **R9:** a bare `import "effect/Effect"` binds nothing, so the impact is close to zero.
- **R10:** lenient `Number` parsing in `parseWorkloadQuery`.

## Checklist results

### 1. Scope and invariants

- **No canonical-ID or identity change.** The NAV constants moved to `nav/src/ids.ts` with byte-identical values and are re-exported from `decode.ts`. No identity or ID module is in the diff.
- **Existing routes are unchanged without the new parameters.** `listJobs` returns `{ data, meta }` exactly as before when both parameters are absent (`Absent` path; `workload` is `optionalKey`). `getJob` is unchanged. The `collect.ts` rewrite is guarded by unmodified existing ingestion tests plus the `lower(import(x))` = old-decoder law.
- **WS-0020 characterization passes unmodified.** `git diff --quiet 983312a 4e81357 -- apps/worker/src/handlers/navToClient.live.test.ts` shows it unchanged. Run verbosely: 6/6 pass, including T4 (the D05 merge, still pinned).
- **No second source, no UI.** Only `packages/adapters/nav` is touched, and nothing under `apps/index-web`.
- One intended production change: `DEFAULT_RUN_BUDGET.maxDetailFetches = 5`, so lazy runs now make up to 5 more NAV detail fetches. This is scope item 5 and is labelled provisional (L4, NAV-Q9).

### 2. Modified existing tests: all extensions, none weakening

- **`db/Sqlite.test.ts`:** 3 table names added to the pinned list; nothing removed.
- **`nav/src/index.test.ts`:** both `toEqual`s keep every old field and gain `observation: expect.objectContaining({...})`. `ClosedSince` remains the asserted tag.
- **The three accounts tests:** `Effect.provide(layer), Effect.provide(fake)` became `Effect.provide(Layer.provideMerge(layer, fake))`. Only the wiring changed; no assertion changed. This retires EFX-002/003/004: `tools/quality/effect-exceptions.json` drops 3 entries, and diagnostics go from 5 findings / 4 entries to 2 / 1, confirmed below.
- **`scripts/test_d1_migrations.py`:** see R6.
- **`testSupport/applySchema.ts`:** the split changed from every `;` to a `;` that ends a line. The question was whether it could silently drop statements. I simulated it in node:
  - On the **base** schema, old and new splitters give identical output (54 = 54 statements).
  - On the new schema they give 64 statements, matching the 58 `CREATE` and 6 `INSERT` statements. No piece holds more than one `CREATE`.
  - The old splitter would in fact have broken line 385, whose trigger message contains `;` inside a string literal.
  - Residual risk (R8): a future line ending in `);  -- comment`, or a mid-line `;` between two statements, would glue two statements into one `prepare()`. `db/schema.sql` is generator-owned ("Nothing else may edit this file"), the generator emits no trailing comments, and `schema:check` enforces that. An assertion that the statement count equals the number of `CREATE`/`INSERT` keywords would close the gap.

### 3. Append-only guarantee

- **Triggers reject UPDATE and DELETE:** confirmed by the suite and by my own D1 probe.
- **The purge path leaves a tombstone:** confirmed by the suite.
- **Re-derived control, "drop triggers → statements succeed":** done on D1 in workerd. `UPDATE` is rejected with `append-only`. After `DROP TRIGGER observations_no_update` and `DROP TRIGGER observations_no_delete`, the same `UPDATE` and a `DELETE` succeed, and the table is empty.
- **Write paths:**
  - Projection rebuild: `DELETE FROM workload_projection` plus upserts touches only the disposable projection, never `observations`. Fine.
  - Account erasure sweep: does not touch observations.
  - The insert path uses `ON CONFLICT DO NOTHING`. Fine.
  - Purge does not bypass the triggers, but it **does break as-of through sequence reuse (R1)**.
  - REPLACE is a trigger bypass that no current code path uses (R2).

### 4. Pure core

- **Boundary test:** it is real. I planted `import * as Clock from "effect/Clock"` in `Workload.ts`, and the test failed with `Workload.ts: imports effect/Clock`. Its control twins cover direct, transitive, type-only, barrel re-export and dynamic imports, and the real edge modules are reported. Unresolved package specifiers fail closed.
- **`oxlint-plugin-immutable`:** scoped in `vite.config.ts` to exactly the 7 `PURE_CORE` files.
  - Caught: a planted `let n = 0; n += 1` in `Query.ts` made `vp check` exit 1 with `immutable(no-let)`.
  - Scope confirmed: the same plant in `observations/store.ts`, an edge module, left `vp check` at exit 0.
- **Run machine:** `ingestion/run.ts` is pure `decide` over `TransitionSystem`. `collect.ts` is a thin interpreter that runs one command at a time.

### 5. Falsifiers and laws

- **Controls, seen failing directly.** I pointed the main falsifier tests at the control impls; all three failed with assertion errors:
  - **C2** made F2 fail: `expected 3 to be +0`.
  - **C5a** made F5 fail: `bbd5b990-…: expected { state: 'Stated' } to deeply equal { state: 'Unsupported' }`.
  - **C6b** made F6 (late arrival) fail: `expected true to be false`.
- **Production-code mutation, not strategy injection.** In `Workload.ts`, "no category and no claim" was changed to return Stated 100 %: the contract's own falsifier. Six tests failed:
  - G3 conformance;
  - three Workload table and falsifier tests;
  - F5 against D1;
  - the real-Worker API test.
- **`fuse` associativity.** Removing the `Conflicting`-input short-circuit made the commutative/idempotent/associative law fail, and fast-check shrank it to a counterexample.
- **Rebuild = incremental, pure model.** Changing `touchedJobs` to `batch.slice(1)` made the pure law fail.
- **Rebuild = incremental, production edge path.** The edge `projection.refresh` is a separate implementation that does not call `applyBatch` or `touchedJobs`. Making it read only the directly touched occurrences, not all vacancy members, failed "law in D1: the incrementally maintained projection equals a full rebuild". So the production path is guarded too.
- All mutations were reverted. They were made only in `/tmp/ws22m`.

### 6. API semantics

Rated above: (a) R3 low, (b) R4 low, (c) R7 low/info, (d) R11 nit, (e) R5 low. One more behaviour I confirmed: a vacancy with no projection row is reported as `tempUnknown`, never full-time.

### 7. Counts by exit code (`/tmp/ws22r`)

| Gate | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | |
| `vp check` | 0 | 295 formatted, 299 linted, no warnings |
| `vp run test` | 0 | Bun **88 files / 739 passed / 4 skipped**; workerd **25 files / 132 passed** |
| `vp run verify` | 0 | **18/18** tasks; `effect-diagnostics: ok (2 excepted finding(s), 1 registry entries)`; coverage Bun 86.2/78.82/87.4/86.97, workerd 93.82/72.09/96.24/95.14 |
| `vp run schema:check` | 0 | "schema snapshot matches the domain models" |
| `python3 scripts/test_d1_migrations.py` | 0 | Plus my own 0005 → 0006 upgrade check (R6): clean |
| `vp run e2e` | 0 | Passes with no tests; no UI in scope |

Every count matches the expected figures and the README. The first `verify` attempt exited 1 at `setup.sh` ("Missing 'wrangler'") because wrangler was not on PATH. With the shim on PATH it passed.

### 8. The `--no-verify` commits

On the archive:
- `vp run policy` exit 0, 7/7 tasks.
- The hook itself, `DEVENV_ROOT=/x sh .vite-hooks/pre-commit`, exit 0. The hook only runs `vp run policy`.

So skipping the hook hid no policy failure at `4e81357`.

## Evidence README: claims checked

- Confirmed: test, gate and diagnostic counts; WS-0020 file unchanged; T4 pinned; trigger behaviour and drop-trigger control; C2/C5a/C6b failures and their messages; boundary and lint controls; the 0006 objects; mutation-sanity claims, which I re-derived with my own plants.
- **Overstated:** "append-only is the database's guarantee" (R2). The README is also silent on sequence reuse under purge (R1).
- **Not re-checked:** remote D1 (no access), live NAV, devenv.

## To clear for merge (round 2)

1. Fix R1:
   - make `recordedSeq` monotone across purges;
   - add a D1 test that purges the newest row, appends, and asserts the new sequence is greater than the purged one.
2. Recommended alongside, not blocking: an R2 `BEFORE INSERT` guard against REPLACE; R6 (apply 0006 to a 0005 database in the script); an R8 statement-count assertion in `applySchema`.
3. Record R3, R4, R5 and R7 as follow-ups for promoting the filter beyond experimental and for TB-02/TB-05.
