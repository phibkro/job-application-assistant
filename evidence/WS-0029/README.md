# WS-0029 evidence

Contracts: [WS-0029@2](../../work/WS-0029-r2-infra-alchemy-previews.md), then [WS-0029@3](../../work/WS-0029-r3-infra-alchemy-previews.md), then [WS-0029@4](../../work/WS-0029-r4-infra-alchemy-previews.md) for pass A. Branch `ws29`.

> **Integration note (lead).** PR #28 carries this work on `claude/clever-heisenberg-lwui1b`:
> - `ws29` `f32ece1` became `21b4709` (same tree, per review round 1);
> - `287cc81` became `81baf42`;
> - `a242f8e` became `db2d3d7`.
>
> Follow-up commits: `c696e21` (`alchemy state read`, CI-found), plus the round-1 M1 fix that guards the `migrations:` prop.
>
> P0 was run by the owner on `db2d3d7`:
> - staging: `1 to update · 2 no change`; only `Api` updates, and its bindings are unchanged;
> - production: `3 to create`; production has not been deployed.
>
> The first CI pr-28 deploy (run 41357548035) created the Worker and the D1 database with `legacy_module_registry` accepted. It then failed at the removed `alchemy state get`.
>
> The review is archived in [review-pass-a-r1.md](review-pass-a-r1.md). Follow-ups:
> - L1: the guard should check computed flags, not one literal (a second Worker, `bundle: false`);
> - L2: override `@effect/sql-d1` to 4.0.7;
> - L3: check that the staging token can list DO namespaces;
> - L4: the first staging apply is the first migrations-to-exports conversion;
> - L5: never log `state read` output (it prints Redacted secrets);
> - production: check which `job-index-production*` resources already exist before the first apply.

**Current state: pass A merged in PR #28 (`f00ccb5`). Pass B (WS-0029@2) is on PR #29: attempt 1 is `bb608c0` and `6fd2d9b` (cherry-picks of `f9a0c3b` and `1ce8107`), and attempt 2, the review round 1 fixes, is `9c0fa48`. See "Pass B" and "Pass B attempt 2" at the end. Its real-PR checks run in CI on PR #29, after the owner's first host deploy from that branch.** The pass A attempts are kept as recorded.

## Pass A

**Attempt 2 outcome (historical): STOPPED after attempt 2 of 2. No change to `infra/` was committed at that point.** `infra/package.json`, `infra/bun.lock` and `infra/alchemy.run.ts` are identical to `031ffb6`. This commit holds only this evidence and the memory-bank state. A gate decision is requested (see "Decision needed").

Network: only `registry.npmjs.org` was used. Citations below are the installed or `npm pack`-ed package sources. No Cloudflare credentials were present or used. No deploy was attempted.

### Attempt 1 (WS-0029@2: `alchemy 2.0.0-beta.84` on `effect ~4.1`)

Stopped before committing anything.

- `alchemy@2.0.0-beta.84` imports `effect/Crypto` in three places: `src/Auth/OAuthFlow.ts:3` (also `lib/Auth/OAuthFlow.js:3`), `src/Stack.ts:4` and `src/Util/PlatformServices.ts:1`.
- `effect@4.0.7` ships `src/Crypto.ts`. `effect@4.1.0` and `4.1.1` ship only lower-case `./crypto` (`src/crypto/*`).
- With effect 4.1.1, `tsc --noEmit` in `infra` exits 0, because `skipLibCheck` is on. Under Bun the stack module fails at load: `Cannot find module 'effect/Crypto' from .../alchemy/src/Auth/OAuthFlow.ts`. Of the 117 distinct `effect/*` specifiers the Alchemy packages import, this is the only one that does not resolve on 4.1.1.
- Timeline from `npm view time`: beta.84 was published 2026-10-24, and `effect@4.1.0` on 2026-10-29. The declared range `effect ^4.0.5` is wider than the versions beta.84 actually runs on.
- Found as well: beta.84 moved the Cloudflare provider out of `alchemy` (its `package.json` has no `./Cloudflare` export) into `@alchemy.run/cloudflare@2.0.0-beta.84`.

The owner chose option A, which became WS-0029@3: Alchemy beta.84 on effect 4.0.7.

### Attempt 2 (WS-0029@3)

The change set, applied and later reverted (see "Why reverted"):

| Change | Replaces | Citation |
| --- | --- | --- |
| `alchemy` `2.0.0-beta.84` (exact) | `2.0.0-beta.72` | contract |
| add `@alchemy.run/cloudflare` `2.0.0-beta.84` (exact) | `alchemy/Cloudflare` subpath | `alchemy@2.0.0-beta.84/package.json` exports (no `./Cloudflare`); `README.md` imports `@alchemy.run/cloudflare` |
| `effect`, `@effect/platform-bun`, `@effect/platform-node` `4.0.7` | `4.0.0-rc.108` | contract |
| `overrides`: `@effect/platform-node-shared` `4.0.7` | resolved transitively to `4.1.1` | without it, loading fails with `Cannot find module 'effect/process/CommandLine'` from `platform-node-shared/dist/NodeChildProcessSpawner.js` |
| `infra/alchemy.run.ts`: `import * as Cloudflare from "@alchemy.run/cloudflare"` | `from "alchemy/Cloudflare"` | as above |

Resolved lock entries: `alchemy@2.0.0-beta.84` (`sha512-GAcfT/fvolC5C4t6…`), `@alchemy.run/cloudflare@2.0.0-beta.84` (`sha512-8AEp0664arL1BLPI…`), `@alchemy.run/cloudflare-runtime@2.0.0-beta.84` (`sha512-wmlfbJHBEpyKpKos…`), `effect@4.0.7` (`sha512-47CiUzNAmeLr40pD…`), `@effect/platform-node-shared@4.0.7` (`sha512-uCeBJ00hliKQsb7g…`). Exactly one `effect` version is in the lock.

| Command (in `infra/`) | Exit |
| --- | --- |
| `bun install` (regenerates `bun.lock`) | 0 |
| `bun install --frozen-lockfile` | 0 |
| `npx tsc --noEmit` | 0 |
| offline stack evaluation, all four stages (below) | 0 |

#### The stack module loads (no credentials)

A scratch harness, kept outside the repository, imports `infra/alchemy.run.ts` under Bun and evaluates the default export. That builds the `Cloudflare.providers()` and `Cloudflare.state()` layers and runs the stack body. It never calls `Plan.make` or apply. The harness provides the services that `alchemy/src/Stack.ts` `evalStack` provides, minus the file logger: `evalStack`'s `platform` layer includes `fileLogger`, which needs `AlchemyContext` before that layer provides it (`Service not found: alchemy/Context`, `src/Util/FileLogger.ts:7` via `src/Stack.ts:339`). It then serialises `stack.resources` (Type, LogicalId, FQN, RemovalPolicy, Props) and `stack.bindings`. Runs used `HTTPS_PROXY`/`HTTP_PROXY` pointed at a dead port, `CLOUDFLARE_*` unset and an empty `HOME`, so no network call could succeed.

The same harness ran on beta.72/rc.108 (the base install) and on beta.84/4.0.7, for stages `staging`, `production`, `pr-42` and `preview`. **All four pairs of dumps are byte-identical** (`diff` exit 0):

| Stage | Resources (Type → physical `name`) | Worker bindings |
| --- | --- | --- |
| staging | `Api` Worker → `job-index-staging`; `Db` D1 → `job-index-staging-db`; `TypeScriptDb` D1 → `job-index-staging-typescript-db` | DB, EMAIL, SOURCE_LEASE, ENVIRONMENT, ALLOW_DEMO_MUTATIONS, MAIL_FROM |
| production | the same with `production` | the same |
| pr-42 | `Api` → `job-index-pr-42`; `TypeScriptDb` → `job-index-pr-42-typescript-db` (no `Db`) | DB, SOURCE_LEASE, ENVIRONMENT, ALLOW_DEMO_MUTATIONS, MAIL_FROM (no EMAIL) |
| preview | the same as staging with `preview`, plus `domain` | the same as staging |

Every stage declares `compatibility: { date: "2026-05-25" }`, `crons: []`, `workersDev: true`, `isExternal: true`, the same `assets` and the same `observability`. Secret bindings are absent because no secret env vars were set. This proves the *declared* graph is unchanged. It does not prove what the providers send to Cloudflare, which is covered next.

#### Static review of the provider code our stack uses (beta.72 `alchemy/src/Cloudflare` vs beta.84 `@alchemy.run/cloudflare/src`)

- **D1 (`D1/Database.ts`).** The name is still `news.name ?? createPhysicalName({ id })`, and `diff` still replaces only on a name or jurisdiction change. New in beta.84: a replace with an explicit, unchanged name gets `deleteFirst: true`. That does not apply, because our names do not change. `migrationsDir` became `migrations`, handled by `@alchemy.run/sql/src/Migrations/Registry.ts` `classifyMigrationHistory`, which returns `none` when there is no input. We declare none (`test_environment_safety.py` asserts there is no `migrationsDir`). **No change for us.**
- **Worker name (`Workers/WorkerName.ts`, `alchemy/src/PhysicalName.ts`).** Formatting and import paths changed. The derivation is the same, and an explicit `name` wins in both. **No change.**
- **Assets (`Workers/Assets.ts`).** The `AssetsConfig` fields we use (`notFoundHandling`, `runWorkerFirst`) are still top-level and still forwarded. **No change found.**
- **Durable Object (`Workers/WorkerProvider.ts`, `Workers/DurableObject.ts`).** The tag encoding (`alchemy:stack|stage|id`, `encodeDurableObjectTags`) and `bumpMigrationTagVersion` are unchanged. The logical-id → class mapping for `SourceLease` → `SourceLeaseObject` resolves to "no new, renamed or deleted class". **But the upload protocol changes.** beta.84 sends an `exports` map (`buildDurableObjectExports`, `WorkerProvider.ts:5517`) that re-declares live classes with their observed storage, instead of beta.72's tagged `migrations`. The comments at `WorkerProvider.ts:3484–3489` and `:3773` say a Worker "moves from `migrations` to `exports`", and Cloudflare then requires `exports`. The namespace identity (script + class) is unchanged, but the move is one-way. A rollback to beta.72 after a beta.84 deploy is not shown to work.
- **Compatibility flags (`Workers/Compatibility.ts`). This is the blocker.** Evaluating each version's `getCompatibility` on our props (`main: "../.preview/worker.js"`, `isExternal: true`, `compatibility.date: "2026-05-25"`, no `flags`, no `bundle`) gives:
  - beta.72: `{"date":"2026-05-25","flags":["nodejs_compat"]}`
  - beta.84: `{"date":"2026-05-25","flags":["new_module_registry","nodejs_compat"]}`

  The source is `@alchemy.run/cloudflare-runtime/src/core/internal/constants.ts` `withDefaultFlags`. It adds `new_module_registry` to every non-Python Worker unless `legacy_module_registry` is passed. Its only verbatim path is `isExternal && !bundle && flags !== undefined`. The Worker upload uses this result as `compatibilityFlags`. So the upgrade **adds a compatibility flag** to staging, production and `pr-<n>`. WS-0029 forbids that, so I stopped.

### Why reverted

The brief says: "Don't add … any other compatibility flag … If the upgrade forces any of these changes, stop and report." beta.84 forces `new_module_registry` unless the stack's props change. Both opt-outs change behaviour themselves or need a decision:
- `flags: ["legacy_module_registry"]` sends a different flag set.
- `bundle: false` plus explicit `flags: ["nodejs_compat"]` changes how Alchemy treats the artifact.

The diff of attempt 2 is reproducible from the change table above.

### Finding beyond the scope

beta.72, the version deployed today, **already sends `nodejs_compat`** to every stage. It adds it by default for external Workers dated on or after its `NODEJS_COMPAT_V2_DATE` (`alchemy@2.0.0-beta.72/src/Cloudflare/Workers/Compatibility.ts:56–80`), even though `alchemy.run.ts` declares no flags. The memory bank and WS-0029 treat `nodejs_compat` as "not added yet; it goes with the presets ticket". That assumption should be checked against the live Worker settings.

### Verified vs not verified

**Verified:**
- the effect 4.1 incompatibility;
- with the r3 pins: install, frozen install, typecheck and loading the stack under Bun all succeed (exit 0);
- the declared resource graph is byte-identical across beta.72 and beta.84 for staging, production, pr-42 and preview;
- the D1, Worker-name and Assets provider logic is unchanged for our props;
- the compatibility flag set changes;
- the Durable Object upload moves from `migrations` to `exports`.

**Not run (stopped before them):** `vp run verify` and `vp run e2e` on the upgraded tree. The WS-0020 characterization test was not re-run either, because no app code changed.

**Not verifiable here:** what a plan against live state would show. `alchemy plan` is `deploy --dry-run`, which runs `Plan.make` against the state store; `Cloudflare.state()` keeps that store remotely, so it needs credentials. The CI `pr-<n>` deploy did not run.

### Open items

- **P0 (required before any pass A merge):** the owner runs the plan locally for staging and production and confirms "no changes". From the repository root, inside `devenv shell`, after `vp run setup` and with the upgraded `infra/`:

  ```sh
  cd infra
  ALCHEMY_STAGE=staging    bun run alchemy plan --stage staging
  ALCHEMY_STAGE=production bun run alchemy plan --stage production
  ```

  Environment variables, by name only:
  - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or an `alchemy login` profile.
  - The optional secret bindings: `NAV_API_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `OTLP_ENDPOINT`, `OTLP_AUTH_HEADER`. Set the same ones the last deploy carried; leaving one unset omits it from the plan.

  `ALCHEMY_STAGE` must match `--stage`, because `alchemy.run.ts` reads it to choose names. With beta.84 the plan is expected to show at least the compatibility-flag change and the Durable Object `exports` change on `Api`. Expected is not observed.
- **Decision needed:**
  - accept `new_module_registry`, which is a runtime behaviour change, with its own validation;
  - or opt out (`legacy_module_registry`, or `bundle: false` with explicit flags), which needs an owner decision and its own evidence;
  - or stay on beta.72 until Alchemy offers a no-default-flags mode.
- **Follow-up (r3):** move `infra/` to effect `~4.1` once an Alchemy release imports the 4.1 module layout.

## Pass A attempt 3 (WS-0029@4, attempt 1 of a fresh 2)

Base `cfa1fd5`. Upgrade commit `f32ece1`. Owner option 1: opt out of `new_module_registry`.

### Changes (`f32ece1`)

| Change | Replaces | Citation |
| --- | --- | --- |
| r3 list: `alchemy` and `@alchemy.run/cloudflare` `2.0.0-beta.84`; `effect`, `@effect/platform-bun`, `@effect/platform-node` `4.0.7`; `overrides` `@effect/platform-node-shared` `4.0.7`; import from `@alchemy.run/cloudflare` | see "Attempt 2" | see "Attempt 2" |
| `Api`: `compatibility: { date: "2026-05-25", flags: ["legacy_module_registry"] }` | `compatibility: { date: "2026-05-25" }` | `@alchemy.run/cloudflare@2.0.0-beta.84/src/Workers/Worker.ts:728-740`: the `compatibility.flags` type is `string[]`. For bundled Workers, supplied flags extend the defaults, and "`new_module_registry` is added unless `legacy_module_registry` is set". The same rule is in `@alchemy.run/cloudflare-runtime/src/core/internal/constants.ts` `withDefaultFlags` |
| `scripts/test_environment_safety.py`: the exact compatibility literal occurs once in comment-stripped infra code, and `new_module_registry` does not occur there | none | new |

`infra/bun.lock` holds exactly one `effect` entry (`effect@4.0.7`). Nothing else in `infra/` changed: no rename, no new resource, no cron, no binding.

### Safety control

| Run | Exit | Output |
| --- | --- | --- |
| `python3 scripts/test_environment_safety.py` (committed tree) | 0 | `Environment-safety checks passed` |
| control 1: opt-out removed (`compatibility: { date: "2026-05-25" }`) | 1 | `AssertionError: infra must declare exactly compatibility: { date: "2026-05-25", flags: ["legacy_module_registry"] },` |
| control 2: a `new_module_registry` literal added to the code | 1 | `AssertionError: new_module_registry must not be opted into in infra` |
| restored | 0 | passed |

### Computed compatibility per stage (from the provider's own `getCompatibility`)

The offline harness from attempt 2 dumped every stage on beta.72 (base tree) and on beta.84 (`f32ece1` tree). Exit codes were 0 for all eight runs, with no credentials and the network blocked. Each dumped `Api` props (`main`, `isExternal`, `bundle`, `compatibility`) were then passed to that version's own `Workers/Compatibility.ts` `getCompatibility`:

| Stage | beta.72 (deployed today) | beta.84 + opt-out |
| --- | --- | --- |
| staging | `{"date":"2026-05-25","flags":["nodejs_compat"]}` | `{"date":"2026-05-25","flags":["legacy_module_registry","nodejs_compat"]}` |
| production | same | same |
| pr-42 | same | same |
| preview | same | same |

That is beta.72's flags plus only `legacy_module_registry`. `nodejs_compat` is present in both, added by the providers' defaults, not by `alchemy.run.ts`. `new_module_registry` is absent.

Resource dump, beta.72 vs beta.84, for all four stages: the only `diff` hunk is at line 19, where `"date": "2026-05-25"` becomes `"date": "2026-05-25", "flags": ["legacy_module_registry"]`. Resource kinds, logical IDs, FQNs, physical names, removal policies, bindings, `crons: []`, assets, observability and outputs are otherwise byte-identical.

### Gates (on the `f32ece1` tree, exit codes checked directly)

| Command | Exit | Result |
| --- | --- | --- |
| `nix shell nixpkgs#shellcheck -c bash -c 'DEVENV_ROOT=/x PATH="/tmp/stubbin:$PWD/node_modules/.bin:$PATH" vp run verify'` | 0 | `19/19 successful`. Bun suite `Test Files 92 passed (92)`, `Tests 764 passed \| 4 skipped (768)`. workerd suite `Test Files 25 passed (25)`, `Tests 137 passed (137)`. `effect-diagnostics: ok (2 excepted finding(s), 1 registry entries)`, so no new exception |
| `vp run e2e` with `node_modules/.bun/wrangler@4.120.0/node_modules/.bin` on PATH | 0 | `6 passed` |
| `node node_modules/vitest/vitest.mjs run -c vitest.workers.config.ts apps/worker/src/handlers/navToClient.live.test.ts` (WS-0020, file unmodified) | 0 | `Tests 6 passed (6)` |
| `cd infra && npx tsc --noEmit` | 0 | |
| `cd infra && bun install --frozen-lockfile` | 0 | |
| pre-commit hook (`vp run policy`) on `f32ece1` | 0 | `7/7 successful` |

### Still changed relative to beta.72 (reviewed, not avoidable by props)

- **Durable Object upload.** beta.84 sends an `exports` map instead of tagged `migrations` (`WorkerProvider.ts:5517`, comments at `:3484-3489` and `:3773`). The `SourceLease` → `SourceLeaseObject` namespace identity is unchanged.
- **D1 replace.** It gains `deleteFirst` for an explicit, unchanged name. That is inert for us, because no name changes.

### Rollback: fix-forward

After any beta.84 deploy, nobody has shown that a rollback to beta.72 works, because the Durable Object upload has moved to `exports`. To roll back: revert the code, then redeploy with beta.84 and the previous app code. `pr-<n>` stages are disposable. Pass A deploys neither staging nor production.

### Open items

- **P0 (required before merge):** the owner runs, from the repository root inside `devenv shell`, after `vp run setup` on this branch:

  ```sh
  cd infra
  ALCHEMY_STAGE=staging    bun run alchemy plan --stage staging
  ALCHEMY_STAGE=production bun run alchemy plan --stage production
  ```

  Environment variables, by name only:
  - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or an `alchemy login` profile.
  - The same optional secret bindings the last deploy carried: `NAV_API_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `OTLP_ENDPOINT`, `OTLP_AUTH_HEADER`. An unset one is omitted from the plan.

  `ALCHEMY_STAGE` must equal `--stage`. Accept only changes to `Api`: the added `legacy_module_registry` flag and the Durable Object `exports` declaration. Any replace or delete, a name change, or a change to `Db`, `TypeScriptDb` or the email binding means stop.
- **CI:** the `pull request preview` workflow must deploy `pr-<n>` with this `infra/` and pass its smoke test on the PR.
- **Unverified here:** what a plan against live state shows, the live Worker's current flags, and whether Cloudflare accepts `legacy_module_registry` on date 2026-05-25. The CI preview deploy is the first real upload.
- **Follow-ups (r4):** adopt `new_module_registry` deliberately in its own ticket. Move `infra/` to effect ~4.1 once an Alchemy release includes alchemy-run/alchemy#2754. Check the assumption that "`nodejs_compat` is not enabled" against the live Worker (both versions send it).

## Pass B (WS-0029@2: Worker Previews behind Access)

Base `f00ccb5` (main after PR #28). Implementation commit `f9a0c3b` on `ws29b`. Attempt 1 of 2. No Cloudflare credentials were used, and nothing was deployed. Network use: `registry.npmjs.org` (install) and the Cloudflare documentation search. The inventory below came from the read-only Cloudflare connector.

### Design

**How previews are declared.** Every API below is from the pinned `@alchemy.run/cloudflare@2.0.0-beta.84` (`infra/node_modules/@alchemy.run/cloudflare/src`) or `alchemy@2.0.0-beta.84` (`infra/node_modules/alchemy/src`).

| Stage | Declares | API (file:line) |
| --- | --- | --- |
| `pr-previews` (host; new) | `Api` Worker `job-index-pr-previews` with `workersDev: { enabled: false, previewsEnabled: true }`, no domain, no email, `crons: []`. Its own stable URL is off, so it serves nothing publicly. `TypeScriptDb` D1 `job-index-pr-previews-typescript-db`: the shared preview D1. No legacy `Db`. | `Workers/Worker.ts:576` (`workersDev?: boolean \| WorkersDevConfig`), `:184` (`previewsEnabled`). `Workers/WorkerProvider.ts:467` `resolveWorkersDev` and `:1207` `setWorkerSubdomain`: the two toggles are independent on the API |
| `pr-<n>` | Only `Api`, with `preview: { of: yield* Cloudflare.Worker.ref("Api", { stage: "pr-previews" }), name: "pr-<n>" }`, the same `main`, assets and compatibility, and the same `env` as before: `DB` bound to `Cloudflare.D1.Database.ref("TypeScriptDb", { stage: "pr-previews" })`, plus `SOURCE_LEASE`. It sets no `name`, `workersDev`, `domain` or `crons`. | `Workers/Worker.ts:469-512` (`WorkerPreviewOptions`), `:563` (`preview?`), `:2054` (the `Worker.ref` PR example). `alchemy/src/Resource.ts:533` (`ref`, on every resource class, D1 included). `Plan.ts:1013` resolves a ref from the other stage's state and fails with "Have you deployed …" if it is missing |

What the provider does with `preview.of` (`Workers/WorkerProvider.ts` `putWorkerPreview`, `:2871`):
- It rejects `name`, `namespace`, `crons`, `tailConsumers`, `domain`, `routes`, `workersDev` and `access` on a Preview (`:2892-2911`). This is why the PR branch omits them and `crons: []` sits only on the non-PR branch.
- The Preview name must match `^[a-z][a-z0-9-]*$` and `<name>-<parent>` must fit in 63 characters (`:2918-2934`). `pr-<n>` plus `job-index-pr-previews` (21 characters) leaves 41.
- `createPreview` is called with `ignoreBaseConfig: true` (`:2974`), so a Preview inherits no bindings. Its `env` is uploaded explicitly (`bindingsToPreviewEnv`, `:238`).
- **Durable Objects:** a DO binding with no `scriptName` counts as hosted by the Preview (`getDurableObjectBindings`, `:5803`; the binding is lowered at `WorkerAsyncBindings.ts:594`). The first deployment sends `new_sqlite_classes: ["SourceLeaseObject"]` to that Preview (`:3057-3076`). Cloudflare's Previews docs say "Cloudflare automatically provisions a new Durable Object namespace … for each Preview". So each PR has its own `SourceLease` namespace. The binding is declared in the one unconditional `env`, never only for production.
- **URL:** `previewResource.urls[0]`, falling back to `https://<slug>-job-index-pr-previews.<account-subdomain>.workers.dev` (`:3008-3010`). That is the `<preview>-<worker>.<subdomain>.workers.dev` shape. The deploy reads the real value from state.
- **Changing the type:** a stage that was a normal Worker and becomes a Preview is a `replace` (`:4487-4490`). An open PR deployed by the old flow therefore converges on its next push. The Preview is created, the old `job-index-pr-<n>` Worker is replaced, and its owned `TypeScriptDb` is no longer declared, so it is deleted.

**Access.** Nothing is declared in Alchemy. The Worker-level setting covers this case. Cloudflare's Workers Access docs (`/workers/configuration/cloudflare-access/`) describe selecting the Worker, then **Access** tab → **Protect this Worker behind Access** → **Previews only**. This creates a `preview_worker` destination for that Worker. The Previews docs (`/workers/previews/`) say "You can protect all Previews on an account, one Worker's Previews, or specific hostnames". The 2026-08-14 changelog says the Worker-level policy keeps "every associated domain and preview URL" protected. I found nothing in the docs or the provider showing that the setting does not cover Worker Previews, so there was no reason to stop. P4 stays unneeded.

**Shared D1 seeding (`scripts/seed-preview-db.sh`).** Two entry points use it: the owner's host deploy (`apply`), and every PR deploy (`refuse`), which runs it before the Preview upload so a Preview never starts against an older schema. *Attempt 2 (M1): only `apply` runs migrations; see "Pass B attempt 2".*
- It refuses any database except `job-index-pr-previews-typescript-db`, so it can never touch staging or production.
- **Writers are serialised** by a one-row lease table in the shared D1 (`preview_seed_lease`). A run takes the lease with one atomic upsert, which succeeds only when the row is free or older than 600 s, then reads the holder back. It retries 66 × 10 s (attempt 1 had 30 × 10 s; review L2), then fails. An EXIT trap releases the lease. GitHub `concurrency` is not used for this: in one group it cancels every pending run but the newest.
- **Readers never see an empty corpus.** Against the shared D1, `dev/preview-seed.sql` is applied with its `DELETE FROM` lines removed and `INSERT INTO` turned into `INSERT OR IGNORE INTO`. A re-seed only adds missing fixture rows and never wipes another PR's rows. `db/schema.sql` (`IF NOT EXISTS`, `INSERT OR IGNORE`) and `db/catalog-seed.sql` (`INSERT OR REPLACE`) were already idempotent. Wrangler records each applied migration (`wrangler@4.120.0` `cli.js:304820`: the migration file and its `d1_migrations` insert are sent as one command).
- **Migrations (corrected in attempt 2, review M1).** Attempt 1 said that destructive migrations "keep the existing migration gate". That was wrong. No such gate exists on this path: `scripts/test_d1_migrations.py` only checks that a PR's snapshot and migrations compose on a fresh database, and the lead handoff line states an intent. As of attempt 2, a PR deploy never applies a migration to the shared D1. It fails when one is pending, and the owner applies it with `vp run deploy-preview-host` from that branch.

**Teardown.** `destroy-preview.sh pr-<n>` runs `alchemy destroy`. `Plan.destroy` plans an empty graph (`alchemy/src/Plan.ts:2276`), so only resources in the PR stage's state are deleted. For a Preview that means `deletePreview` on the parent (`WorkerProvider.ts:5303-5313`). References are not state, so the shared D1 and the parent Worker are never deleted. The script then calls `smoke-preview.sh deleted <url>`, which requires a 404 for the service token's request (attempt 2, review L3; attempt 1 accepted any non-200). The last Preview's teardown deliberately leaves the host in place: it is the shared fixture. Removing it is an owner action (`ALCHEMY_STAGE=pr-previews bun run alchemy destroy --stage pr-previews` in `infra/`). `destroy-preview.sh` cannot target it, because only numeric stages are accepted.

**Order of first use (owner):**
1. **The first host deploy runs from the pass B PR branch** (PR #29), inside `devenv shell`: `vp run deploy-preview-host`. This creates `job-index-pr-previews` and the shared D1, applies the migrations and seeds it. It must happen before merge, because PR #29's own preview CI needs the host (review G1). Later host deploys run from `main`. The exception is a PR that adds a D1 migration: after reviewing it, the owner deploys the host from that branch.
2. Enable Access on that Worker (below).
3. Re-run PR #29's `pull request preview` workflow, or push to any open PR. If step 1 has not run, the PR deploy fails with "The preview host is not deployed". If step 2 has not run, the smoke fails on the anonymous request.

### For the owner to toggle

- **Worker:** `job-index-pr-previews`, which exists only after step 1.
- **Where:** Workers & Pages → `job-index-pr-previews` → **Access** → **Protect this Worker behind Access** → **Previews only**.
- **Policy:**
  - **Allow**, include the *Cloudflare account members* selector (P2);
  - **Service Auth**, include the service token `ci-pr-preview` (P3).

  If the dialog offers only the account-member choice, finish it, then add the Service Auth policy to the created application under Zero Trust → Access → Applications.

### Staging and production unchanged (offline dump, pass A method)

The pass A harness (scratch, outside the repository) evaluated `infra/alchemy.run.ts` under Bun with no credentials, `HTTPS_PROXY`/`HTTP_PROXY` pointed at a dead port and an empty `HOME`. It ran on `f00ccb5` ("before") and on `f9a0c3b` ("after"). All runs exited 0.

| Stage | sha256 before | sha256 after | `diff` |
| --- | --- | --- | --- |
| staging | `b697ba3b…6792` | `b697ba3b…6792` | identical (exit 0) |
| production | `b16b980f…b8` | `b16b980f…b8` | identical (exit 0) |
| preview (old shared) | `d157a579…66` | `d157a579…66` | identical (exit 0) |
| pr-42 | `cdcc5dd1…ae` | `3556767d…23` | intended: `TypeScriptDb` resource gone; `Api` loses `name`, `workersDev`, `crons`, gains `preview: { name: "pr-42", of: <ref> }`; `DB` becomes a ref. Bindings DB, SOURCE_LEASE (`durable_object_namespace`, no `scriptName`), ENVIRONMENT=`pr-42`, ALLOW_DEMO_MUTATIONS=`true`, MAIL_FROM |
| pr-previews | (new) | `8c1b5555…1b` | `Api` `job-index-pr-previews`, `workersDev {enabled:false, previewsEnabled:true}`, `crons: []`; `TypeScriptDb` `job-index-pr-previews-typescript-db`; no `Db`, no `Mail` |

`cd infra && npx tsc --noEmit`: exit 0.

### New assertions and their controls

`scripts/test_environment_safety.py` pins the flow, and the new `scripts/test_smoke_preview.sh` tests the smoke's behaviour against a stub `curl`. It runs in `vp run policy`, and it also checks that the token secret never reaches curl's argv or the log. Each control was applied to the committed tree, run, and restored. The base and restored runs exit 0.

| Control | Gate | Exit | Message |
| --- | --- | --- | --- |
| C1 host stage literal → `staging` | env-safety | 1 | `infra must declare exactly const PREVIEW_HOST_STAGE = "pr-previews";` |
| C2 Preview of the staging Worker | env-safety | 1 | `a PR stage must be a Worker Preview of the pr-previews host's Api Worker` |
| C3 PR binds the production D1 | env-safety | 1 | `a PR stage must bind the host's shared preview D1 by reference, never own a database` |
| C4 `SOURCE_LEASE` only under `PRODUCTION` | env-safety | 1 | `SOURCE_LEASE must be bound unconditionally in the Worker env, Previews included` |
| C5 `access:` declared in Alchemy | env-safety | 1 | `infra must not declare Worker Access (owner's dashboard setting)` |
| C6 seed accepts the staging D1 | env-safety | 1 | `seed-preview-db.sh must accept only the shared preview D1` |
| C7 shared seed runs the resetting fixture | env-safety | 1 | `the shared seed must be insert-only (no DELETE)` |
| C8 seed lease removed | env-safety | 1 | `shared seeding must take the lease` |
| C9 deploy without the Access smoke | env-safety | 1 | `deploy-preview.sh must end with the Access smoke` |
| C10 teardown without the deleted check | env-safety | 1 | `AssertionError` (the `smoke-preview.sh deleted` assertion) |
| C11 an unparsed `alchemy state read` | env-safety | 1 | `scripts/destroy-preview.sh:55: pipe \`alchemy state read\` into the parser` |
| C12 destroy job loses the fork guard | env-safety | 1 | `every pr-preview job must carry the same-repository guard` |
| C13 an extra secret in the workflow | env-safety | 1 | `pr-preview.yml may use only the Cloudflare and Access service-token secrets` |
| C14 smoke tests dropped from policy | env-safety | 1 | `policy must run the smoke-preview tests` |
| C15 smoke accepts an anonymous 200 (Access off) | smoke tests | 1 | `smoke-preview tests: 1 failure(s)` |
| K1 kept guard: a cron literal | env-safety | 1 | `infra must declare exactly const CRONS: ReadonlyArray<string> = [];` |
| K2 kept guard: a `migrations:` prop on the D1 | env-safety | 1 | ``Alchemy must not apply migrations (`migrations:` prop)…`` |
| K3 kept guard: `legacy_module_registry` removed | env-safety | 1 | `infra must declare exactly compatibility: { date: "2026-05-25", flags: ["legacy_module_registry"] },` |

The smoke tests cover these cases:
- an anonymous 200 fails;
- a 302 to `phibkro.cloudflareaccess.com` passes, and so do 401 and 403;
- a redirect elsewhere fails;
- a 404 that never settles fails;
- an empty jobs page fails;
- the wrong `environment` fails;
- a token refused with 403 fails;
- after teardown, a 200 fails and a 404 passes;
- a non-workers.dev URL is refused, and so is a missing secret.

### Gates (on `f9a0c3b`, exit codes checked directly)

| Command | Exit | Result |
| --- | --- | --- |
| `nix shell nixpkgs#shellcheck -c bash -c 'DEVENV_ROOT=/x PATH="/tmp/stubbin:$PWD/node_modules/.bin:$PATH" vp run verify'` | 0 | `20/20 successful`. Bun suite `Test Files 92 passed (92)`, `Tests 764 passed \| 4 skipped (768)`. workerd suite `Test Files 25 passed (25)`, `Tests 137 passed (137)`. `effect-diagnostics: ok (2 excepted finding(s), 1 registry entries)`. Policy includes `smoke-preview tests passed` and the environment-safety pass |
| `vp run e2e`, with `node_modules/.bun/wrangler@4.120.0/node_modules/.bin` on PATH | 0 | `6 passed` |
| `cd infra && npx tsc --noEmit` | 0 | |
| pre-commit hook (`vp run policy`) on `f9a0c3b` | 0 | `8/8 successful` |

### Inventory of leftovers (read-only Cloudflare connector, 2026-11-01). Nothing was deleted.

| Resource | Facts | Recommendation (owner approval required) |
| --- | --- | --- |
| Worker `job-index-preview` | created 2026-08-07, last modified 2026-08-08. The old shared `preview` stage, with the custom domain `job-index.phibkro.org` in `alchemy.run.ts` | Delete once nobody uses `job-index.phibkro.org`, with `ALCHEMY_STAGE=preview bun run alchemy destroy --stage preview`, so that state goes too. Its declaration is unchanged by pass B |
| D1 `job-index-preview-db` | 29.7 MB, created 2026-08-07. The legacy `Db` of the `preview` stage | Goes with the stage above. Export first if the corpus matters |
| D1 `job-index-preview-typescript-db` | **not present** in the account, although `alchemy.run.ts` declares it for `preview` | The `preview` stage has not been deployed since that declaration. Its next deploy would create it |
| `job-index-pr-<n>` Workers / `job-index-pr-<n>-typescript-db` | **none present**. PR #28's stage was removed by its close-time destroy | nothing to do |

### Only the real PR can verify

- The host deploy and the Access toggle, which come first (owner).
- That beta.84's `createPreview` / `createPreviewDeployment` calls succeed on this account. Previews are "private beta" in the provider's own doc comment (`Worker.ts:555`).
- That the parent's `previews_enabled` with `enabled: false` serves Preview `workers.dev` URLs. The Previews docs configure Preview `workers.dev` URLs separately from production; this was not observed here.
- **End state 1:** the anonymous request is refused or redirected to `phibkro.cloudflareaccess.com`. The smoke prints `access check: … -> <status> (redirect host: …)`.
- **End state 2:** the service token gets 200 from `/api/health` (environment `pr-<n>`) and from `/api/v1/jobs?limit=1` with at least one seeded job. The smoke prints the status lines and `jobs returned = …, first id = …`.
- **End state 3:** closing the PR deletes the Preview. The destroy job prints `teardown check: … -> <status>`. A dashboard or API check that the Preview list is empty is still worth doing once.
- **End state 5:** the build fails if Access is off. The smoke's behaviour is tested offline (C15); the live drift case would show as `Cloudflare Access is not protecting it`.
- The `wrangler d1 execute --json --command` output shape that the lease read parses, and the lease under two truly concurrent PR deploys.
- That each Preview gets its own `SourceLeaseObject` namespace. That rests on Cloudflare's docs and the provider's `new_sqlite_classes`; it was not observed.

### Follow-ups touched

None of L1–L6 was fixed. L5 (never log `state read` output) is now asserted for every preview script, as part of this pass (C11).

## Pass B attempt 2 (review round 1 fixes)

Review: `/tmp/ws-0029-pass-b-review.md`, round 1 of PR #29. Base `6fd2d9b` (`claude/clever-heisenberg-lwui1b`). Fix commit `9c0fa48`. No push, no deploy, no credentials.

### Fixes

| Finding | Fix |
| --- | --- |
| **M1** PR migrations reach the shared D1 | `seed-preview-db.sh` takes a fourth argument, `apply` or `refuse`. The host deploy passes `apply`, and only that mode calls `migrate-d1.sh`. A PR deploy passes `refuse`: under the lease and before any write, it runs `wrangler d1 migrations list <db> --remote` with the shared D1's `migrations_dir`. If one is pending, it prints the listing and fails with "This PR adds D1 migrations; the owner applies them to the shared preview D1 with `vp run deploy-preview-host` from this branch." An unrecognised listing also fails. Source: `wrangler@4.120.0` `wrangler-dist/cli.js:305265` `d1MigrationsListCommand`. It has no `--json` flag; it logs "No migrations to apply!" or "Migrations to be applied:" and a table. Snapshot, catalogue and the additive seed run as before, under the lease. The README sentence claiming a gate is corrected above |
| **I3** host and PR stages bind shell secrets | `secretBindings()` returns `{}` when `PR_STAGE \|\| PREVIEW_HOST` (`infra/alchemy.run.ts`). Staging and production are unchanged (dumps below) |
| **G1** host needed before this PR can go green | `deploy-preview-host.sh` header, "Order of first use" and the memory bank now say that the first host deploy runs from the PR branch and later ones from `main` |
| **L2** (optional) | `WAIT_ATTEMPTS = LEASE_SECONDS/10 + 6` = 66 × 10 s = 660 s, which is longer than the 600 s lease |
| **L3** (optional) | `smoke-preview.sh deleted` passes only on a 404 for the token request; 403, 5xx and `000` fail |

New `scripts/test_seed_preview_db.sh` runs in `vp run policy` against a stub wrangler. It checks:
- a PR deploy with a pending migration fails before any `--file` write and never calls `migrations apply`;
- with none pending, the PR deploy applies the snapshot and the additive seed, still without migrating;
- an unreadable listing fails;
- the host deploy migrates;
- a lease held by someone else means no seeding (this covers review L4 G-d);
- other databases and a missing mode are refused.

### Offline dump (pass A method), `f00ccb5` vs `9c0fa48`

Two runs:
- **(a) clean shell:** no secrets exported;
- **(b) secrets shell:** `NAV_API_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `OTLP_ENDPOINT`, `OTLP_AUTH_HEADER` and `CLOUDFLARE_ACCOUNT_ID` set to dummy values.

All runs exited 0.

| Stage | (a) `diff` vs base | (b) `diff` vs base | (b) `Api` env keys after |
| --- | --- | --- | --- |
| staging | identical | identical | ALLOW_DEMO_MUTATIONS, CLOUDFLARE_ACCOUNT_ID, DB, EMAIL, ENVIRONMENT, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, MAIL_FROM, NAV_API_TOKEN, OTLP_AUTH_HEADER, OTLP_ENDPOINT, SOURCE_LEASE |
| production | identical | identical | same as staging |
| preview (old shared) | identical | identical | unchanged |
| pr-42 | intended Preview change | intended | ALLOW_DEMO_MUTATIONS, DB, ENVIRONMENT, MAIL_FROM, SOURCE_LEASE. On base, the same shell bound all six secrets to `pr-42` |
| pr-previews | new | new | ALLOW_DEMO_MUTATIONS, DB, ENVIRONMENT, MAIL_FROM, SOURCE_LEASE |

`CLOUDFLARE_ACCOUNT_ID`, which CI exports, used to reach every `pr-<n>` Worker as a secret. Previews no longer get it. `apps/worker/src` does not read it.

### Controls (each applied to `9c0fa48`, run, restored; base and restored exit 0)

All 18 attempt-1 controls (C1–C15, K1–K3) still fail as before. New:

| Control | Gate | Exit | Message |
| --- | --- | --- | --- |
| R1 PR path calls `migrate-d1.sh` | env-safety | 1 | `the PR deploy path must never call migrate-d1.sh` |
| R2 PR deploy seeds with `apply` | env-safety | 1 | `the PR deploy must seed with migrations refused` |
| R3 seed migrates in every mode | env-safety | 1 | `seed-preview-db.sh may migrate only in apply mode` |
| R3b same mutation | seed tests | 1 | `seed-preview-db tests: 1 failure(s)` |
| R4 pending migration no longer refused | seed tests | 1 | `seed-preview-db tests: 1 failure(s)` (the first version of the test passed this because the "unreadable listing" guard still stopped the run. I tightened it to pin the refusal message.) |
| R5 `secretBindings()` early return removed | env-safety | 1 | `secretBindings() must return {} for the PR Preview host and every PR stage` |
| R6 teardown accepts any non-200 | smoke tests | 1 | `smoke-preview tests: 2 failure(s)` |
| R7 seed tests dropped from policy | env-safety | 1 | `policy must run the seed-preview-db tests` |
| R8 lease read-back bypassed (review G-d) | seed tests | 1 | `seed-preview-db tests: 2 failure(s)` |

### Gates (on `9c0fa48`, exit codes checked directly)

| Command | Exit | Result |
| --- | --- | --- |
| `nix shell nixpkgs#shellcheck -c bash -c 'DEVENV_ROOT=/x PATH="/tmp/stubbin:$PWD/node_modules/.bin:$PATH" vp run verify'` | 0 | `21/21 successful`. Bun suite `Test Files 92 passed (92)`, `Tests 764 passed \| 4 skipped (768)`. workerd suite `Test Files 25 passed (25)`, `Tests 137 passed (137)`. `effect-diagnostics: ok (2 excepted finding(s), 1 registry entries)` |
| `vp run e2e`, with `node_modules/.bun/wrangler@4.120.0/node_modules/.bin` on PATH | 0 | `6 passed` |
| `cd infra && npx tsc --noEmit` | 0 | |
| pre-commit hook on `9c0fa48` | 0 | `9/9 successful` |

The first verify run on this attempt exited 1: shellcheck SC2016 in the new test, on an `eval`'d check string. I fixed it with a helper and re-ran it to exit 0 before committing.

### Still only verifiable on the real PR

Everything in "Only the real PR can verify" above, plus:
- that CI's nixpkgs `wrangler` prints the same `migrations list` messages as 4.120.0 (review gate note);
- what a deleted Preview's URL returns for the token request. Attempt 2 requires 404; if Cloudflare answers otherwise, the destroy job fails and shows the status.

### Recorded follow-ups (not fixed here)

- **L1:** the seed's name guard does not bind the database id. Resolve the id by name and compare.
- **L4:** textual guards that valid edits can bypass:
  - G-a: a DB ref in `env`;
  - G-b: `|| true` in the job guard;
  - G-c: `toJSON(secrets)`.

  G-d is now covered by R8.
- **I1:** the smoke detects drift; it is not an adversarial control.
- **I2:** the shared D1 is the new `job-index-pr-previews-typescript-db`, not the `preview` stage's. The owner should acknowledge this deviation.
- **I4:** remote `--file` imports briefly make the shared D1 unavailable to every Preview.
- **I5:** `ALLOW_DEMO_MUTATIONS` is unread. Demo-principal writes are shared across Previews, and `INSERT OR IGNORE` never restores a mutated row.

## Pass B: real-PR results (PR #29, merged as `4c08a97`)

Before the CI re-run, the owner:
- deployed the preview host with `vp run deploy-preview-host` from the PR branch: Worker `job-index-pr-previews`, D1 `job-index-pr-previews-typescript-db`, no secret bindings, wrangler 4.148.0 printing `No migrations to apply!`;
- enabled Worker-level Access ("Previews only") with two policies: Allow for *Cloudflare Workers Preview URLs* (account members) and Service Auth for `ci-pr-preview`.

The results are from these runs, on head `9838290`:
- **Deploy:** run 41362769750, job 125018731141.
- **Teardown:** run 41363906100, job 125019905429.

| End state | Log line | Result |
| --- | --- | --- |
| 1. unauthenticated refused | `unauthenticated GET /api/health -> 302 (redirect host: phibkro.cloudflareaccess.com)` | ✅ |
| 2. token gets seeded data | `GET /api/health -> 200`, environment `pr-29`; `GET /api/v1/jobs?limit=1 -> 200`, 1 job (`cj_1`) | ✅ |
| 3. deleted on close | `[Api] deleted`; `teardown check: service token GET /api/health -> 404` | ✅ |
| 4. staging/production unchanged | offline dumps (above) | ✅ |
| 5. CI fails if Access is off | the smoke requires a non-2xx unauthenticated response; control C15 | ✅ |

The PR path also logged `migrations: refuse`, with nothing pending.

Questions answered by these runs:
- Worker Previews are available on this account.
- Preview URLs serve while the parent URL is off: `pr-29-job-index-pr-previews.philib-krogh-d23.workers.dev`.
- A deleted preview returns 404, so review finding R2-L3 does not occur.

Still not observed: a separate Durable Object namespace per preview, and the lease under truly concurrent deploys.
