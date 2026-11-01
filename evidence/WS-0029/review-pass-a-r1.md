# WS-0029@4 pass A: independent review, round 1

Reviewer: independent (not the author). Range: `origin/main` (`bbd9b4c`) to `db2d3d7`, plus `c696e21` (head moved during review, at the coordinator's request). Infra commit: `21b4709`. Its `infra/` and `scripts/` tree is identical to `f32ece1`, the SHA the evidence README cites.

Method: `git archive` copies under the scratchpad (`base` = origin/main with beta.72/rc.108 installed, `new` = db2d3d7 with beta.84/4.0.7 installed, `head` = c696e21). Every finding below cites the installed package sources. No credentials were used, nothing was deployed, and no git writes were made.

## Verdict

**Not mergeable under the round-1 rule. One MEDIUM finding (M1). Nothing high or critical.** The upgrade itself is safe for staging and production on the evidence below. M1 is a stale safety guard, and the fix is one line.

| # | Severity | Finding |
| --- | --- | --- |
| M1 | **medium** | The `migrationsDir` guard in `test_environment_safety.py` is dead under beta.84. The live prop `migrations:` is now unguarded. |
| L1 | low | The opt-out guard pins one literal, not the `Api` Worker's computed flags. A second Worker, or `bundle: false`, gets past it. |
| L2 | low | `@effect/sql-d1@4.1.1` (peer `effect ^4.1.1`) sits beside `effect@4.0.7` with no override. It resolves today, and the deploy path does not load it. |
| L3 | low | beta.84 lists Durable Object namespaces on every deploy of `Api`. beta.72 did not. This adds an API dependency that `alchemy plan` does not exercise. |
| L4 | low | The first staging deploy is the first real migrations→exports conversion of an existing namespace. pr-28 was a fresh create, so it did not cover this. |
| L5 | low | `alchemy state read …/Api` decodes Redacted secrets onto stdout (`StateEncoding.ts:81-84`). Today they stay inside the pipe. |
| N1 | nit | The evidence README cites `f32ece1`, base `cfa1fd5` and branch `ws29`. The PR branch has `21b4709` (same tree) and `claude/clever-heisenberg-lwui1b`. |

## Findings

### M1 (medium): the D1 migrations guard checks a prop name beta.84 no longer has

`scripts/test_environment_safety.py:81` asserts `"migrationsDir" not in infra_code`. It is there so that Alchemy can never apply D1 migrations before the deploy script establishes the snapshot. In beta.84 the D1 prop is `migrations?: MigrationsInput` (`@alchemy.run/cloudflare/src/D1/Database.ts:80-95`: "Pending migrations are detected on each deploy and applied in order as part of `update`"). `migrationsDir` is no longer accepted.

Reproduction on the beta.84 install:
- Added `migrationsDir: "../db/migrations"` to `TypeScriptDb`: `tsc` exits 2 with TS2769, "'migrationsDir' does not exist … Did you mean to write 'migrations'?". The guarded name cannot be written any more.
- Added `migrations: "../db/migrations"` instead: `tsc` exits **0**, and `python3 scripts/test_environment_safety.py` exits **0**. The invariant is now unprotected, and this upgrade is what caused it.

There is no behaviour change today, because no `migrations` prop is declared. Fix: also forbid `migrations:` in the comment-stripped infra code (for example `re.search(r"\bmigrations\s*:", infra_code)`), and add a control that is seen failing.

### L1 (low): the opt-out guard is literal-based

Controls behave as claimed. Removing the opt-out gives exit 1, adding `new_module_registry` gives exit 1, and the c696e21 `state get` control gives exit 1. But these mutations pass (exit 0):
- A second `Cloudflare.Worker` with `compatibility: { date: "2026-05-25" }`. It would get `new_module_registry` from `withDefaultFlags` (`cloudflare-runtime/src/core/internal/constants.ts:37-38`), and the string never appears in source.
- `bundle: false` on `Api`, with the literal intact. Through the verbatim path (`constants.ts:30-31`) the computed flags become `["legacy_module_registry"]`, so **`nodejs_compat` is dropped**. I confirmed this by calling beta.84 `getCompatibility` directly.

This is acceptable for one Worker. A stronger gate would assert the computed `getCompatibility` result for `Api`.

### L2 (low): `@effect/sql-d1` peer mismatch

`infra/bun.lock:68` has `@effect/sql-d1@4.1.1` with peer `effect ^4.1.1`, pulled in by `@alchemy.run/cloudflare` (`^4.0.5`). Every `effect/*` specifier it imports resolves to a file in effect 4.0.7, checked file by file. Its only importer is `src/D1/SQL.ts`, a runtime helper our stack does not import. It is the same class of drift as `platform-node-shared`. Consider an override pinning it to `4.0.7`.

### L3 (low): new namespace listing on every deploy

beta.72 calls `listDurableObjectNamespaces` only when there are delete candidates or transfers (`alchemy/src/Cloudflare/Workers/WorkerProvider.ts:3218-3222`). beta.84 calls it whenever the Worker has DO bindings (`@alchemy.run/cloudflare/src/Workers/WorkerProvider.ts:3435-3441`). The deploy token therefore needs read access to that endpoint. pr-28 succeeding shows the CI token has it, and the owner's staging token should be checked for it too. The call is in the apply path, not in `plan`.

### L4 (low): migrations→exports on an existing namespace

pr-28 created a fresh Worker, so the upload it exercised was the `exports` create path. The conversion for staging's existing `SourceLeaseObject` happens on the first staging deploy. The analysis is under Q2. Source and Cloudflare's docs both say no data migration is needed. Only the live deploy can prove it.

### L5 (low): secrets through `state read`

`alchemy/src/State/StateEncoding.ts:81-84` encodes Redacted values as their plaintext. `state read JobIndex/production/Api` therefore prints the secret bindings in props to stdout. In `deploy.sh` that stdout goes only to the Python filter, so nothing leaks today. Don't add `tee` or logging to `read_resource_attribute`. Whether beta.72 `state get` did the same was not checked.

## Answers to the questions

**Q1: names, D1 identity, DO identity, bindings, assets, observability.**
- **Worker.** beta.84's diff adds replace triggers for namespace, version-parent and preview-of (`WorkerProvider.ts:4467-4497`). All three are undefined/false for our props and for beta.72 state (`resolveNamespaceName(undefined) → undefined`, `:135-139`). The name still replaces only on an explicit name change (`:4499-4507`). No replace.
- **D1.** The replace condition is identical between versions: name, jurisdiction, or a `primaryLocationHint` change (beta.72 `D1/Database.ts:265-286`, beta.84 `:276-302`). `deleteFirst` only changes ordering inside a replace, and no replace triggers. With no `migrations` input, `classifyMigrationHistory` returns `none` (`@alchemy.run/sql/src/Migrations/Registry.ts:214-215`). Create/reconcile adopts by exact name only (`D1/Database.ts:418-424`). `Db` → `job-index-<stage>-db` and `TypeScriptDb` → `job-index-<stage>-typescript-db` cannot cross-adopt.
- **Durable Object.** The tag helpers `encodeDurableObjectTags`/`getDurableObjectTagMap` differ only in formatting (diff of beta.72 `:5315-5400` vs beta.84 `:5889-5975`). `getDurableObjectBindings` is the same apart from the added `storage` field. If tag decoding misses, the binding-name fallback (`:3563-3590`) and `deployedDoClasses` (`:3542-3555`) still classify `SourceLeaseObject` as existing. Nothing goes into `newSqliteClasses`, `renamedClasses` or `deletedClasses`.
- **State store.** Same script name `alchemy-state-store` (`Token.ts:15`), same `STATE_STORE_VERSION = 7` (beta.72 `Api.ts:34`, beta.84 `:38`), and the same route set. No store upgrade is triggered.
- **Observability.** The explicit props pass through `resolveObservability` (`WorkerAsyncBindings.ts:831-841`). Only `Telemetry.ts` bindings inject traces, and we use none.
- **Assets.** The top-level `notFoundHandling`/`runWorkerFirst` are unchanged. beta.84 folds `_headers`/`_redirects` from the dist dir into config (`Assets.ts:263-280`). The app ships neither file.
- The owner's staging plan agrees: `1 to update · 2 no change`, with `Api`'s bindings and both D1 resources unchanged.

**Q2: what exports does to an existing namespace.** beta.84 `buildDurableObjectExports` (`WorkerProvider.ts:5517-5561`) declares every namespace Cloudflare lists for the script as live, using the observed storage (`observedStorage`, `:5495-5507`). It then adds hosted classes. Tombstones (`deleted`/`renamed`) are emitted only from `deletedClasses`/`renamedClasses`, which are empty for us (see Q1). The upload sends `exports` and no `migrations` (`:3714-3727`). beta.72 created the class with `new_sqlite_classes` (beta.72 `:3371`), so the observed `useSqlite` is true and the map sends `storage: "sqlite"`, which matches. Cloudflare's docs ("Migrate from the legacy migrations flow", developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) say: "can move to `exports` without any data migration. The provisioned namespaces remain in place". **No path in the source deletes or resets `SourceLeaseObject` state.** Residual: L4.

**Q3: `legacy_module_registry` with date 2026-05-25.** I tested this in the `workerd 2026-10-12` binary pinned by beta.84 (`@cloudflare/workerd-linux-64`), with no `--experimental`:
- `["legacy_module_registry","nodejs_compat"]` serves `ok`.
- `["nodejs_compat"]` serves `ok`.
- `["new_module_registry","nodejs_compat"]` is a fatal error: "The new ModuleRegistry implementation is an experimental feature. You must run workerd with `--experimental`".
- A made-up flag gives "No such compatibility flag".

The schema strings pair `newModuleRegistry` with `new_module_registry`/`legacy_module_registry` and no default-on date. So the legacy registry is already the default, and the opt-out is behaviourally a no-op. The coordinator reports Cloudflare accepted it on pr-28. I computed the flags directly: beta.72 `{"date":"2026-05-25","flags":["nodejs_compat"]}`, beta.84 with the opt-out `["legacy_module_registry","nodejs_compat"]`, and beta.84 without it `["new_module_registry","nodejs_compat"]`.

**Q4: `platform-node-shared` override.** It holds. `bun.lock:20-22` has `overrides`, `:66` resolves `@effect/platform-node-shared@4.0.7`, and there is exactly one `effect` (`effect@4.0.7`, `:194`). `bun install --frozen-lockfile` exits 0. The installed versions are effect, platform-node-shared, platform-node and platform-bun at 4.0.7, and alchemy, cloudflare and cloudflare-runtime at beta.84. The only remaining drift is L2.

**Q5: do the new assertions guard the opt-out?** For `Api`'s literal, yes: the controls fail as claimed. The limits are in L1. Separately, an existing guard was weakened (M1).

**Q6: the fix-forward rollback note.** It is accurate. Cloudflare's docs say: "Once a Worker has been deployed with `exports`, subsequent deploys cannot return to the legacy `migrations` array." beta.72 always sends tagged `migrations` (beta.72 `WorkerProvider.ts:3410-3418`). After a beta.84 deploy, a beta.72 redeploy would be rejected, so rollback has to be code-revert on beta.84. One refinement: the rejection should fail closed at upload rather than damage state, but that is not verified.

**c696e21 (`state get` → `state read`).** beta.84 `state read <path>` (`alchemy/src/Cli/commands/state.ts:135-155`) resolves `stack/stage/fqn` to the single resource file (`State/Tree.ts:115-124, 173-175`). It prints `entries[0].value` as JSON. The record has `attr` (`State/ResourceState.ts:92`, among others). The `attr` keys exist:
- D1 `databaseId`/`databaseName` (`D1/Database.ts:118-131`, returned at `:527-529`);
- Worker `url: string | undefined` (`Workers/Worker.ts:1182`, set because `workersDev: true`).

The backend defaults to `configured` with `alchemy.run.ts` (`state.ts:22-40`), so `ALCHEMY_STAGE` must be set, and it is. A missing path, a directory or a parse failure all give empty output, so the scripts stop with "did not report" (fail closed). The other CLI calls (`deploy|destroy --stage --yes`) still exist in beta.84 (`Cli/main.ts:65-83`, `commands/flags.ts:42,120`). The new policy assertions fail on a restored `state get` (exit 1).

**Production plan `3 to create`.** This matches "Production is not deployed" (`docs/internal/product/market-index-lead-handoff.md:60`). On create, D1 adopts an existing database of the *same* name (`D1/Database.ts:418-458`). If a wrangler-era `job-index-production-db` exists, `Db` adopts it, which is the intended legacy retention. `TypeScriptDb`'s distinct name cannot adopt it. Before the first production deploy, the owner should confirm in the dashboard which of `job-index-production`, `job-index-production-db` and `job-index-production-typescript-db` already exist.

## What only the owner's live state can settle

- Done: the staging plan (no replace, bindings unchanged).
- Still open:
  - the first staging apply, which is the real migrations→exports conversion (L4);
  - the staging token's DO namespace read access (L3);
  - whether the existing `job-index-production*` resources exist before the first production apply.

## Gate exit codes (c696e21 copy, scratch `git init`)

| Command | Exit |
| --- | --- |
| `python3 scripts/test_environment_safety.py` | 0 |
| `cd infra && bun install --frozen-lockfile` | 0 |
| `cd infra && npx tsc --noEmit` | 0 |
| root `bun install --frozen-lockfile` | 0 |
| `nix shell nixpkgs#shellcheck -c bash -c 'DEVENV_ROOT=/x PATH="/tmp/stubbin:$PWD/node_modules/.bin:$PATH" vp run verify'` | **0** (`19/19 successful`; Bun suite 92 files / 764 passed, 4 skipped; workerd suite 25 files / 137 passed) |
| M1 reproduction: `migrations:` prop, then the safety script / `tsc` | 0 / 0 (the guard misses it) |
| `migrationsDir:` prop, `tsc` | 2 (the guarded name cannot be written) |
| L1: second Worker / `bundle: false`, safety script | 0 / 0 |
| controls: opt-out removed / `new_module_registry` added / `state get` restored | 1 / 1 / 1 |
| workerd: legacy + nodejs_compat / new_module_registry | serves / fatal (experimental) |
