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

**Current state: pass A attempt 3 (r4 attempt 1) is implemented in `f32ece1`. See "Pass A attempt 3" at the end. P0 is still open.** Attempts 1 and 2, below, are kept as recorded.

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
