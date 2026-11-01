# WS-0022 (TB-01) independent review: round 2

- Subject: branch `ws22` at head `e27c8ea`. Whole head `4e81357..e27c8ea` (fix `cffc49b`, evidence `e27c8ea`), plus anything in `983312a..e27c8ea` that the fix newly affects.
- Reviewer: independent. I did not author the change or the round-1 report.
- Method: `git archive e27c8ea` into `/tmp/r2` (gates) and `/tmp/r2m` (probes and mutations), each with `bun install --frozen-lockfile` (exit 0). `/tmp/r2` got a scratch `git init && git add -A` because `tracked-imports.ts` runs `git ls-files`. Its tracked set is the same as `git ls-tree e27c8ea` (566 files). The real worktree was not touched: `ws22` HEAD is `e27c8ea` and `git status` is clean. No pushes, no GitHub writes. One read-only REST query showed there is no PR for head `ws22`.
- D1 claims come from the real D1 binding in the workerd Vitest pool, using scratch `*.live.test.ts` files in `/tmp/r2m` only, plus Wrangler 4.120.0 `--local` for the migration path. Python `sqlite3` was used only to corroborate.

## Verdict

**Nothing at medium or above. No high, no critical.** R1 (medium) is fixed, and the database enforces the fix, not only the store. R2 and R6 are fixed. Under the owner's merge delegation (rounds 1–3: merge only when the latest round finds nothing at medium or above), **`e27c8ea` qualifies for merge** once CI is green on that head. The new findings are all low or nit. Every one of them needs either raw SQL that no code path issues, or a future code change.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| R1 | resolved (was medium) | `recordedSeq` reuse after a purge. It is now strictly monotone on D1 under insert, batch insert, purge and replay, and the database enforces it |
| R2 | resolved (was low) | REPLACE, UPSERT and tombstone REPLACE can no longer change or remove an observation or a tombstone |
| R6 | resolved (was low) | 0006 is now tested on the 0005 snapshot. Re-checked through real Wrangler on local D1 |
| R12 | low | `recordedSeq` is not type-checked. A raw insert of a BLOB (`X'31'`), a REAL (`1.5`) or `INT64_MAX` passes `observations_seq_monotone`. A BLOB, or the REAL that `INT64_MAX` overflows into, then blocks every later append for good, and purging the row does not help because the tombstone keeps the value |
| R13 | low | `observations_no_overwrite` compares payload **bytes**, but `id` addresses **canonical** content. A same-content replay whose stored payload was serialised differently now aborts the whole append batch, where it used to be a no-op |
| R14 | low | A tombstone written by raw SQL that takes a live row's `recordedSeq` makes that row impossible to purge lawfully (`UNIQUE(recordedSeq)` plus `observation_tombstones_no_replace`). The delete licence checks `(id, recordedSeq)` but not `sourceId`/`externalId` |
| R15 | nit | `Store.maxRecordedSeq` still reads `observations` only, so after a purge of the newest row it is below the high-water mark. It has no production caller (only F6 uses it), and as-of at that value stays correct |
| R16 | nit | The new `AND recordedSeq = OLD.recordedSeq` clause of `observations_no_delete` is guarded only by the Python test (C8), not by a D1 test |
| R17 | nit/info | A local D1 that applied the pre-fix 0006 keeps the old tombstone shape. It fails closed: every append errors with `no such column: recordedSeq`. The README documents this. No PR exists for `ws22`, so no PR-preview D1 has that shape |

Recorded follow-ups R3, R4, R5 and R7 are not re-raised; the fix does not touch them. R8–R11 are unchanged.

### R1: resolved, monotone on D1

The store assigns `MAX(max over observations, max over tombstones) + 1`. The tombstone keeps the purged sequence (`NOT NULL`, `UNIQUE`). Tombstones cannot be updated, deleted or replaced. `observations_seq_monotone` rejects a new id whose sequence is at or below the high-water mark.

- **Randomized D1 run** (`probe2.live.test.ts`, 160 steps, fixed seed). Steps mix new batches of 1–3 contents (sometimes with a replay inside the batch), purges of random live rows, and replays of live or purged content. After every step:
  - all issued sequences (observations ∪ tombstones) are distinct;
  - every new row's sequence is greater than every sequence issued before it;
  - a replay inserts 0 rows and changes nothing;
  - purged content stays absent.

  It **passes**. **Control:** with the store's formula reverted to `MAX(observations) + 1` and `observations_seq_monotone` dropped, it fails with `expected 1 to be greater than 1`.
- **The database guard is independent of the store.** With the store reverted but the triggers kept, the reviewer's scenario fails loudly: the append is rejected by `observations_seq_monotone`. It does not silently reuse the sequence.

### R2: resolved, every non-DDL path I tried is blocked (D1, `probe.live.test.ts`)

| Attempt | D1 result |
| --- | --- |
| `INSERT OR REPLACE` / `REPLACE INTO`, same id, other content | aborted: `an id names one content` |
| `ON CONFLICT (id) DO UPDATE`, same id, other content | aborted: `an id names one content` |
| `ON CONFLICT DO UPDATE`, same id, same content | silent no-op, row unchanged |
| `ON CONFLICT (recordedSeq) DO UPDATE`, new id, colliding sequence | aborted: `recordedSeq must exceed …` |
| `OR REPLACE`, new id, colliding sequence as integer, `'1'`, `' 1 '`, `CAST('1' AS TEXT)`, `1.0`, `1e0` | all aborted: affinity is applied to `NEW.recordedSeq` before the trigger compares it |
| Multi-row `OR REPLACE VALUES` where both rows have sequence 5 | aborted on the second row; nothing written |
| `INSERT OR REPLACE` into tombstones, by id or by sequence | aborted: `permanent` |
| `UPDATE` / `DELETE` on tombstones | aborted (unchanged) |

**Trigger firing order.** The three new `observations` INSERT guards have disjoint conditions: `seq_monotone` requires that no row has `NEW.id`, and the other two split on content equality. Their order cannot matter.

`no_resurrection` can overlap with the other two only when a live row and a tombstone share an id. That state exists only inside the lawful purge batch, or after a raw-SQL tombstone. In that state, every possible order gives either IGNORE or ABORT. Neither changes a row.

**The known unknown: same-id, same-content REPLACE as a silent no-op.** I judge this acceptable. The stored row is unchanged (`recordedSeq`, `recordedAt` and `runId` included). Nothing is removed, and no row's sequence is taken over: the D1 test shows that `r-2` survives. A lawful replay must not raise, and the two cannot be told apart. The harm REPLACE could do is an overwrite or a deletion, and both are rejected.

### R6: resolved, also through Wrangler's real migration path

- `fixtures/d1/schema-0005.sql` is byte-identical to `git show 983312a:db/schema.sql` (`cmp`).
- **Wrangler 4.120.0 `--local`:**
  1. `d1 execute --file fixtures/d1/schema-0005.sql`: exit 0.
  2. `d1 migrations list`: only `0006_observation-store.sql` is pending.
  3. `d1 migrations apply`: exit 0, ✅.
  4. A second `apply`: "No migrations to apply".
- **Fresh path:** a fresh database built from `db/schema.sql` was then given `apply` and reported "No migrations to apply" (0006 is pre-marked by `observations_seq_monotone`).
- `sqlite_master` (minus `_cf*`) is **identical** between the two databases: 63 = 63 objects. `d1_migrations` lists 0001–0006 in both.
- Python control C8 (the delete-clause revert) re-run by me: it fails as claimed. Restored: exit 0.

### R12 (low): `recordedSeq` type is not enforced

Reproduced on D1 (`probe.live.test.ts`, `probe3.live.test.ts`):

- **BLOB sequence:** `INSERT … recordedSeq = X'31'` is **accepted**. BLOB passes the `>= 1` CHECK, is not coerced by INTEGER affinity, and compares greater than any number, so `NEW.recordedSeq <= max` is false.
  - After that, `Store.append([d])` **fails**. The store computes `MAX(blob, 0) + 1 = 2`, and the trigger rejects it because `2 <= blob`.
  - `Store.purge("blob")` succeeds, but the next `Store.append` **still fails**: the tombstone kept the BLOB, and tombstones are permanent.
  - So one raw insert permanently blocks ingestion, and only DDL can recover.
- **REAL sequence:** a raw `1.5` is accepted (non-integer sequence).
- **Overflow:** a raw `9223372036854775807` is accepted. The next lawful append stores a REAL `9.223372036854776e18`, and every append after that is rejected.

Nothing changes or disappears without a tombstone, and no code path writes these values. This is availability, not append-only integrity. It does make the doc claim "reject a `recordedSeq` that does not exceed every sequence ever issued" (in `store.ts` and `Rows.ts`) slightly broader than what D1 enforces.

Suggested fix: `CHECK (typeof(recordedSeq) = 'integer' AND recordedSeq BETWEEN 1 AND 9007199254740991)` on both tables. The 2^53 bound also keeps the value exact in JS numbers.

### R13 (low): replay identity is byte equality, not content equality

`observations_replay_is_noop` and `observations_no_overwrite` compare `payload IS NEW.payload`. But `id` is `sha256(canonicalJson(encoded))` (sorted keys), while `payload` is `JSON.stringify(encoded)` (Schema field order).

On D1 (`probe3`), I stored the same content under its own id with the canonical serialisation, then ran `Store.append([c])`: it **failed**. Then I ran `Store.append([d_new, c])`: it **failed atomically**, and `d_new` was not recorded (`n = 0`). Before the fix, `ON CONFLICT (id) DO NOTHING` made both of these no-ops.

**Reachability today: none.** I checked `encodeObservationContent` with every object's keys reversed, on a feed and a detail fixture. The payload bytes and the id are identical, so encoding normalises key order. The hazard is a future change that is not semantic but alters the bytes, such as reordering fields in `ObservationContentV0`. After such a change, every routine re-read of an already-recorded NAV entry would abort its whole batch, and ingestion would stall. It fails loudly and loses no data.

Options:
- compare the content columns and let `id` (the content address) stand for the payload;
- or pin "payload bytes are a function of id" with a test that fails on a field reorder.

### R14 (low): raw-SQL tombstones can block a lawful erasure

On D1: insert `('ghost', recordedSeq = 2)` into `observation_tombstones` while live row `b` has sequence 2. Then the lawful purge batch for `b` **fails** with `observation tombstones are permanent`, and `b` cannot be erased without DDL.

Separately, a tombstone `('a', 'zzz', 'zzz', 1)` licenses deleting the live row `a`, which has `sourceId = 'nav'`. The licence checks only `(id, recordedSeq)`. A tombstone is still written, so this is not a removal without a tombstone, but the tombstone's provenance can be wrong.

It needs raw SQL against the tombstone table, so the severity is low. Could be closed by having the tombstone insert guard require a matching live observation (same id, sequence, source and external id).

### R15–R17 (nits)

See the table. For R17, I simulated `db/schema.sql@e27c8ea` applied over `db/schema.sql@4e81357`, the path `preview.sh` and `deploy-preview.sh` take. It applies without error, the tombstone table keeps its 5 columns, and the first observation insert fails with `no such column: recordedSeq`. It fails closed, it is local-only, 0006 was never on `main`, and no PR preview exists. Acceptable.

## Checklist results

### 1. Do the new controls fail when their guard is removed? (D1, `store.live.test.ts` + `falsifiers.live.test.ts`, 27 tests, restored with `cmp` after each)

| Mutation | Result |
| --- | --- |
| baseline | exit 0, 27/27 |
| store formula back to `MAX(observations)+1` | exit 1: R1 test 1 fails (the DB guard rejects it) |
| that, plus `observations_seq_monotone` dropped | exit 1: 4 fail (R1 ×2, R2, twin) |
| `observations_seq_monotone` dropped | exit 1: 3 fail (R1 test 2, R2, twin) |
| `observations_replay_is_noop` dropped | exit 1: R2 and twin fail |
| `observations_no_overwrite` dropped | exit 1: R2 and twin fail |
| `observation_tombstones_no_replace` dropped | exit 1: R2 fails |
| `no_delete` back to id-only | **exit 0 on D1** (R16); Python C8 fails, as claimed |

When a dropped trigger is missing, the twin fails on `no such trigger`, which is expected and documented. The README's C1–C9 table matches what I saw.

### 2. Did the fix break anything round 1 found clean?

- **Falsifiers F1–F7:** all pass verbosely on D1 (F1, F2, F3, F5, F6 ×2, F7 with controls C1, C2, C3, C5a, C5b, C6a, C6b each failing their target).
- **C2 under the new `no_overwrite` trigger:** C2's receipt-nonce ids are distinct, so it is unaffected.
- **WS-0020 characterization:** `git diff --quiet 983312a e27c8ea -- apps/worker/src/handlers/navToClient.live.test.ts` exits 0. Run verbosely: 6/6 pass, T4 (D05) still pinned.
- **Pure core:** only `Rows.ts` changed (a doc comment and one `Schema.Int` field). The boundary and lint tasks pass inside verify. Property laws pass in the Bun suite (739 passed, unchanged).
- **Existing routes:** no route or handler file is in `4e81357..e27c8ea`.
- **`applySchema`'s line split:** it still keeps the new, longer trigger lines whole. The D1 mutation runs prove the triggers are live in the pool.

### 3. Gates (`/tmp/r2`, exit codes read directly)

| Gate | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | |
| `vp run verify` (first attempt, archive without `.git`) | 1 | `tracked-imports.ts`: `git ls-files` failed, "not a git repository". This is the environment, not the head |
| `vp run verify` (scratch `git init` of the same files) | **0** | **18/18** tasks |
| (inside verify) `vp check` | 0 | 295 formatted, 299 linted, no warnings |
| (inside verify) Bun suite | 0 | **88 files / 739 passed / 4 skipped** |
| (inside verify) workerd suite | 0 | **25 files / 137 passed** (132 + 5 new) |
| (inside verify) effect diagnostics | 0 | ok, 2 excepted findings, 1 registry entry |
| (inside verify) coverage | 0 | Bun 86.2/78.82/87.4/86.97; workerd 93.82/72.09/96.24/95.14 |
| (inside verify) `schema:check` | 0 | "schema snapshot matches the domain models" |
| (inside verify) `test_d1_migrations.py` | 0 | "D1 migration checks passed" |
| Wrangler local 0005 → 0006 apply / re-apply / fresh apply | 0 / 0 / 0 | identical `sqlite_master` (63 objects) |

Every count matches the evidence README.

## Evidence README: claims checked

- **Confirmed:**
  - the R1 mechanism, and enforcement in the database;
  - the R2 guards and the claim that their conditions are disjoint;
  - the 13 new 0006 objects, the fixture's byte identity, and the upgrade equivalence;
  - controls C1–C6 and C8;
  - the gate counts;
  - `navToClient` unchanged;
  - the reset residual.
- **Slightly overstated:** "reject a `recordedSeq` that does not exceed every sequence ever issued" (`store.ts`, `Rows.ts`, 0006 comment) does not hold for a BLOB or a non-integer value (R12).
- **Not re-checked:** remote D1 (no access), live NAV, devenv, C7 and C9 (taken as reported; C8 re-derived).

## To clear for merge

Nothing blocks under the round 1–3 rule. Recommended follow-ups, none blocking:

1. R12: an integer-type and range CHECK on `recordedSeq` in both tables.
2. R13: decide whether replay equality means bytes or content, and pin the answer with a test.
3. R14: tombstone provenance guard.
4. R16: a D1 twin for the delete-clause.
5. R15: make `maxRecordedSeq` read the high-water mark, or document it.

Plus the existing R3, R4, R5 and R7.
