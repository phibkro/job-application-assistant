# WS-0027 evidence: toolchain consolidation (STOPPED at the gate)

Contract: `work/WS-0027-r1-toolchain-devenv-vite-plus-previews.md` (R1, R2, attempt budget 2). Base `d62d5ba`, branch `ws27`.

**Outcome: stopped before any tooling change, and a gate decision is requested.** Two acceptance criteria cannot be met within the contract's exclusions and the brief's constraints. One is "`vp test` reproduces Bun 80/664/4 and workerd 22/109". The other is "a PR gets an Alchemy Workers Preview". Migrating only part of the toolchain would delete glue (`bootstrap`, `justfile`, `scripts/*.sh`) that the deploy and preview paths still need. It would also leave a hybrid that the contract does not describe. So this commit holds only this evidence and the memory-bank state. All exploratory changes (`bun add -d vite-plus@1.4.0`, a temporary `@cloudflare/vitest-pool-workers@0.23.0`) were reverted. `package.json` and `bun.lock` are identical to `d62d5ba`.

Network: `alchemy.run`, `developers.cloudflare.com`, `viteplus.dev` and `devenv.sh` all return `CONNECT tunnel failed, response 403` from the agent proxy. Only `registry.npmjs.org` is reachable. The citations below are therefore the packages' own shipped docs and types, read from installed or `npm pack`-ed tarballs. Cloudflare Previews facts come from the lead's connector excerpt (2026-11-01).

## 1. Baseline (unmodified `d62d5ba`)

| Command | Exit | Result |
| --- | --- | --- |
| `bun node_modules/vitest/vitest.mjs run` | 0 | `Test Files 80 passed (80)`, `Tests 664 passed \| 4 skipped (668)` |
| `node node_modules/.bin/vitest run -c vitest.workers.config.ts` (Node 22.23.4) | 0 | `Test Files 22 passed (22)`, `Tests 109 passed (109)` |

The baseline counts reproduce. The effect-diagnostics line was not re-run here, because it is unchanged since WS-0026.

## 2. Blocker A: `vp test` cannot host the workerd pool (Vite+ gap)

- Every Vite+ release bundles Vitest 5: `npm view vite-plus@<v> dependencies.vitest` gives 1.0.0 → 5.0.1, 1.1.0 → 5.0.3, 1.2.0 → 5.0.4, 1.3.0 and 1.4.0 → 5.0.5. Source: `node_modules/vite-plus/docs/guide/test.md` ("Vite+ depends on Vitest `5.0.5`"; "`vp test` resolves Vitest from `vite-plus`'s dependencies first"). Also `docs/guide/vitest-v5.md` ("Keep coverage providers … at the bundled runner's exact version, `5.0.5`").
- `@cloudflare/vitest-pool-workers` peers on `vitest ^4.1.0` in both 0.20.3 (installed) and 0.23.0 (npm `latest`).
- Attempt 1, `vp test run -c vitest.workers.config.ts` with vite-plus 1.4.0 and pool 0.20.3: **exit 1**. Each of the 22 files reports `(0 test)`, followed by `No test files found, exiting with code 1`, and the pool prints `[vpw:warn] You're running vitest@5.0.5, but this version of @cloudflare/vitest-pool-workers only officially supports vitest ^4.1.0`.
- Attempt 2, the same run with pool 0.23.0: **exit 1**, the same `No test files found`, and 22 `vpw:warn` lines.
- Stopped on this item, as the brief requires. The owner's `vektorprogrammet-reimagined` avoids the pool and drives Miniflare from test support code (`apps/web/test/support/workerRuntime.ts`). Adopting that would rewrite 11 workerd test files, which is outside this contract.

## 3. Blocker B: `vp test` on the Bun suite needs out-of-scope upgrades

- `vp test run` launched by Node: **exit 1**, `9 failed | 71 passed (80)`, `Cannot find package 'bun:sqlite'`. These tests need the Bun runtime (see `vitest.config.ts` and `flake.nix` comments).
- `bun node_modules/vite-plus/bin/vp test run` (Bun as launcher, which the docs do not describe): **exit 1**, `1 failed | 79 passed (80)`, `Tests 539 passed (539)`. The failing file is `packages/better-auth-effect-adapter/src/Adapter.conformance.test.ts`, with `TypeError: undefined is not an object (evaluating 'runner.config')` in `@better-auth/test-utils@1.6.26/dist/test-adapter.mjs:82`. That file holds the missing 125 tests and the 4 skipped ones.
- `@better-auth/test-utils@1.6.26` peers on `vitest ^4.1.10`. The first release that accepts `^5.0.0` is 1.7.15, which requires `better-auth ^1.7.15`. `better-auth` is a dependency of `packages/better-auth-effect-adapter`, so that upgrade is a runtime and application dependency change, which the contract excludes. Coverage would also need `@vitest/coverage-istanbul@5.0.5`.

## 4. Blocker C: Alchemy Workers Previews need an `infra/` Effect re-pin

- `infra/` pins `alchemy@2.0.0-beta.72` and `effect@4.0.0-rc.108`.
- In beta.72, `node_modules/alchemy/lib/Cloudflare/Workers/Worker.d.ts` offers only `version.parent` (`WorkerVersionOptions`). That is a zero-traffic *version* reachable at its version preview URL, and it rejects "locally-hosted Durable Object … classes". That is the mechanism the owner ruled out: preview URLs are not generated for a DO-hosting Worker, and `SourceLeaseObject` lives in this Worker.
- `WorkerPreviewOptions` (`preview: { of, name, message, tag }`; "Locally-hosted Durable Object and Workflow classes *are* allowed: each Preview gets its own isolated namespace") first appears in **beta.78**. Probed with `npm pack` on beta.73, .75, .78, .80 and .83: it is absent in 73 and 75 and present from 78 on.
- `npm view alchemy@<v> peerDependencies.effect`: beta.72 `>=4.0.0-beta.105 || >=4.0.0`; beta.73 and .74 `>=4.0.0-rc.110`; beta.75 to .77 `>=4.0.0-rc.112`; beta.78 and .79 `>=4.0.0-rc.115`; beta.80 to .83 `^4.0.0`; beta.84 `^4.0.5`. Every release with Previews therefore requires moving `infra/` off rc.108. The contract and brief exclude that ("No `infra/` Effect re-pin").
- With an upgrade (beta.83), Alchemy also ships `Cloudflare/Access/Application` and `Workers/WorkerAccess`. That would let the lead's "Previews behind Cloudflare Access by default" constraint be declared in Alchemy, without a dashboard step.
- `wrangler preview` (Wrangler ≥ 4.135, a `previews` block in a wrangler config, plus `wrangler.preview-migrations.jsonc`) would bypass Alchemy. That contradicts the owner decision "Alchemy provisions infra **and** Workers Previews", so it was not used.

## 5. Other findings (not blocking)

- `vp check` with no `vite.config.ts` exits 1: "Found formatting issues in 95 files". This is because it formats the whole tree, while today's `oxfmt` runs on `packages apps` only. Vite+ bundles `oxfmt =0.74.0` and `oxlint =1.89.0`, against the repo's 0.62.0 and ^1.77.0. That is configuration work (`fmt.ignorePatterns`, `lint` from `.oxlintrc.json`), not a capability gap. It was not pursued once A to C were established.
- devenv: not evaluated. The proxy blocks GitHub-pinned Nix inputs (403), the same wall as `nix develop`, and `devenv.sh` is unreachable.

## 6. Gate decision requested (owner)

Choose one or more:

1. **Previews:** approve a revision that allows the `infra/` re-pin. That means `alchemy ≥ 2.0.0-beta.78` and `effect ≥ 4.0.0-rc.115` in `infra/`, or `alchemy 2.0.0-beta.83/84` with `effect 4.x` GA, possibly merged with the existing "`infra/` Effect pin" follow-up ticket. Alternatively, approve `wrangler preview` as a recorded deviation from "Alchemy provisions Previews".
2. **Tests:** accept that `vp test` covers neither suite for now, so both stay on Vitest 4 (`bun … vitest run` and `node … vitest run -c vitest.workers.config.ts`), each with this reason recorded. Alternatively, approve the `better-auth`/`@better-auth/test-utils` 1.7 upgrade and a Miniflare-driven rewrite of the 11 workerd tests as separate tickets.
3. **Scope:** with (2) accepted, a revision R2 could still land devenv, `vp check`, `vp run` tasks and the policy-gate ports, and leave Previews to (1).

---

# r2: devenv + Vite+, tests on Vitest 4

Contract: [`work/WS-0027-r2-toolchain-devenv-vite-plus.md`](../../work/WS-0027-r2-toolchain-devenv-vite-plus.md). Base `82e4f3f`, branch `ws27`. Commits: `1c4a0da` (toolchain), `69cfcd9` (no caching for Bun-run tasks), and the docs/evidence commit that holds this section. No application code, test, `infra/` or preview script changed. No formatter-only commit was needed: Vite+'s bundled `oxfmt =0.74.0` and `oxlint =1.89.0` report today's 269/272 files clean under the ported configs.

Environment for the local runs: Node 22.23.4, Bun 1.4.4, shellcheck 0.11.0 (from the `shellcheck-py` wheel in a scratch venv, used only for these runs). `VP_GIT_HOOKS=0` was set so that `vp config` would not write `core.hooksPath` into `.git/config`, which this worktree shares with the main checkout. Before and after `cmp` of that file: unchanged.

## 1. Sources (the doc sites return proxy 403)

- Vite+ 1.4.0, the shipped docs in `node_modules/vite-plus/docs/`:
  - `guide/check.md`, `config/check.md`, `config/fmt.md`, `config/lint.md` for `vp check`, `fmt`, `lint` and `check`.
  - `config/run.md` for `run.tasks`, `command`, `dependsOn`, `cache`, `cache.input`, and the rule that a name lives in `vite.config.ts` or `package.json`, not both.
  - `guide/run.md` for compound `&&`, nested `vp run` inlined, "Arguments after the task name are passed through", and built-in commands versus tasks.
  - `guide/commit-hooks.md` for `vp config`, `.vite-hooks`, `VP_GIT_HOOKS=0`, and the skip when `core.hooksPath` points elsewhere.
  - `guide/test.md` and `guide/vitest-v5.md` for the bundled Vitest 5.0.5, which is why `vp test` is not used.
- devenv: `devenv.sh` is unreachable. The idiom and the lock come from the owner's `phibkro/pg-outbox` and `phibkro/vektorprogrammet-reimagined` (identical `devenv.yaml` and `devenv.lock`), and so does the pinned CI CLI `github:cachix/devenv/b904dcb51fe48c30db250038241507f60752f222` with `cachix/install-nix-action` v31 and `cachix-action` v16 at the same SHAs.

## 2. Counts (exit codes checked directly, not through pipes)

| Command | Exit | Result |
| --- | --- | --- |
| `vp check` | 0 | `All 269 files are correctly formatted`, `no warnings or lint errors in 273 files` (today's 272 plus `vite.config.ts`) |
| `vp run test` | 0 | Bun `80 passed (80)`, `664 passed \| 4 skipped (668)`; workerd `22 passed (22)`, `109 passed (109)` |
| `vp run verify` (cold) | 0 | 18/18 tasks; `effect-diagnostics: ok (5 excepted finding(s), 4 registry entries)`; both suites as above, with coverage thresholds |
| `vp run verify` (warm) | 0 | before `69cfcd9`: 3/5 cache hits (schema, catalog, bundle). That is the unsafe replay in §4 |

Node was on PATH during every Bun-suite run (`/opt/node22`). The old `flake.nix` claim, that Node on PATH breaks the `bun:sqlite` tests, did not reproduce. `devenv.nix` therefore declares `nodejs_24`, which Vite+ (Node ^22.18 or ^24.11) and the workerd pool both need.

## 3. Gate-to-replacement table

| Old gate / glue | Replacement, or reason |
| --- | --- |
| `flake.nix`, `flake.lock` | `devenv.nix` (bun, nodejs_24, wrangler, python3, sqlite, jq, curl, git, shellcheck, cacert), `devenv.yaml`, `devenv.lock` (devenv-nixpkgs `760b852…`, every input locked) |
| `./bootstrap` | `devenv shell` or `devenv shell -- <cmd>`. The first shell runs `bun install --frozen-lockfile` when `vp` is missing |
| `scripts/dispatch.sh` | Dropped: one entry point (devenv) needs no Nix-or-just dispatch |
| `justfile` `setup` | `vp run setup` (`scripts/setup.sh` + `vp config --no-agent`) |
| `just check` = `scripts/check.sh` | `vp run policy` |
| `just verify` (`_check` + `bun run check`) | `vp run verify` (setup, policy, `vp check`, imports, typecheck, effect, schema, catalog, bundle, coverage), in the old order |
| `just preview` | `vp run dev` (`scripts/preview.sh`, unchanged) |
| `just deploy-preview` | `vp run deploy-preview` (`scripts/deploy-preview.sh`, unchanged) |
| `just deploy` / `deploy-staging`, `./deploy` | `vp run deploy`: `dependsOn: ["verify"]`, then `scripts/deploy.sh staging` |
| `just deploy-production`, `./deploy-production` | `vp run deploy-production`: `dependsOn: ["verify"]`, then `scripts/deploy.sh production` |
| `just nav-key`, `nav-key-cloudflare` | `vp run nav-key`, `vp run nav-key-cloudflare` |
| `just qualification rows` | `vp run qualification --rows N` (pass-through seen: `$ python3 scripts/qualify.py --help`) |
| `just d1-restore source target` | `vp run d1-restore <source> <target>` (`--confirm` is in the task) |
| `just soak url duration interval` | `vp run soak <url> --duration D --interval I` |
| `just clean`, `just help` | `vp run clean`; `vp run` with no task (the interactive list) |
| `.githooks/pre-commit` + `scripts/install-hooks.sh` | `.vite-hooks/pre-commit` (re-enters devenv, runs `vp run policy`) installed by `vp config`. The dispatcher was seen blocking a commit in a scratch repo: `VITE+ - pre-commit script failed (code 1)` |
| `.oxlintrc.json` | `vite.config.ts` `lint`, the same categories, rules, overrides, ignores and Effect plugin |
| `oxfmt --check packages apps` | `vite.config.ts` `fmt.ignorePatterns: ["/*", "!/packages/", "!/apps/"]` (269 files, the same as today) |
| `package.json` scripts | `vite.config.ts` `run.tasks` with the same names (`typecheck`, `effect:check`, `schema[:check]`, `catalog[:check]`, `bundle:check`, `imports:check`, `test`, `test:watch`, `test:workers`, `coverage`, `e2e`, `qualification`); `fmt`, `lint` and `check` are the built-ins `vp fmt`, `vp lint`, `vp check` |
| `test:workers` via `nix shell nixpkgs#nodejs` | `node node_modules/vitest/vitest.mjs run -c vitest.workers.config.ts`, with Node from devenv |
| `scripts/check_repo.py` | **Kept (Python)**. Checks of deleted files (flake, bootstrap, justfile, dispatch, the "no nodejs" rule) were replaced by assertions that the retired glue stays deleted, that `devenv.nix` declares the toolchain, that `devenv.lock` is fully pinned, and that `vite.config.ts` declares the public tasks |
| `scripts/test_environment_safety.py` | **Kept**. The justfile recipe assertion now asserts that the deploy tasks `dependsOn: ["verify"]` and that `verify` chains policy, `vp check`, typecheck, effect and coverage |
| `scripts/test_d1_restore.py` | **Kept**. The justfile assertion now targets the `d1-restore` task |
| `scripts/test_d1_migrations.py` | **Kept unchanged** (stdlib `sqlite3` against the SQL files) |
| `scripts/test_nav_key.sh`, `scripts/test_deploy_preflight.sh` | **Kept unchanged**: bash tests of kept bash scripts |
| `scripts/test_bootstrap.sh` | **Dropped**: it tested only `bootstrap`, `dispatch.sh` and the root wrappers, all deleted. Its "deploy delegates to the gated pipeline" property is now in `test_environment_safety.py`, and its "no profile writes" property belongs to devenv |
| `shellcheck deploy bootstrap scripts/*.sh` | `bash -c 'shellcheck scripts/*.sh .vite-hooks/pre-commit'` (the wrappers are deleted) |
| `quality.yml` `./bootstrap verify` | devenv CLI, then `vp check`, `vp run test`, `vp run verify` |
| `pr-preview.yml` | **Kept** (WS-0029). Only the environment steps changed, from Nix + bootstrap to devenv + `vp run setup`/`verify`. The `./scripts/deploy-preview.sh` and `destroy-preview.sh` invocations are byte-identical |

Why the Python and bash gates were kept rather than ported to TypeScript: Python stays a prerequisite whatever happens, because `scripts/deploy.sh` embeds Python and `qualify.py`, `restore-d1.py` and `soak.py` are operator tools. A port would therefore remove no toolchain item and add owned TypeScript. The only check with an adoptable tool equivalent is the narrow secret-marker scan, where gitleaks would apply, and that is WS-0028's acceptance item. It is left as is.

## 4. Vite+ findings

1. **Vitest 5 only** (r1 §2 and §3). Tests are run as `vp run` tasks on the installed Vitest 4.
2. **Cache tracking misses Bun's reads.** With caching on, `schema:check` replayed `◉ cache hit` after `packages/domain/src/Answer.ts` (an import of `scripts/ts/schema.ts`) changed. `bundle:check` replayed a pass with `import "./doesNotExist"` planted in `apps/worker/src/index.ts` (exit 0). Edits to files the task reads directly, such as `db/schema.sql`, did invalidate. Fixed in `69cfcd9`: every Bun-run task is `cache: false`, and only `typecheck` (tsc on Node) stays cached, with a planted type error after a warm cache giving `cache miss: 'packages/domain/src/Access.ts' modified`. After the fix the bundle control fails: `error: Could not resolve: "./doesNotExist"`, exit 1.
3. **No glob expansion** in task commands, although `config/run.md` says commands are "interpreted by a shell". `shellcheck scripts/*.sh` failed with `scripts/*.sh: openBinaryFile: does not exist`, so it is now wrapped in `bash -c`.

## 5. Negative controls (planted, run, reverted; `git status` was clean after each)

| Gate | Plant | Exit | Seen |
| --- | --- | --- | --- |
| `vp check` fmt | misformatted line in `packages/domain/src/Access.ts` | 1 | `error: Formatting issues found` |
| `vp check` lint | `console.log(1)` | 1 | `error: Lint issues found` |
| `vp check` Effect plugin | `Date.now()` in `packages/domain` | 1 | `error: Lint issues found` (`effect/no-ambient-authority`) |
| `typecheck` (warm cache) | `const n: number = "s"` | 2 | `error TS2322` |
| `effect:check` | floating `Effect.log` in a new `apps/worker/src` file | 1 | `effect-diagnostics: FAILED` |
| `schema:check` | drift in `db/schema.sql` | 1 | `db/schema.sql disagrees with the domain models` |
| `catalog:check` | drift in `db/catalog-seed.sql` | 1 | `db/catalog-seed.sql disagrees with the researched index` |
| `bundle:check` (after `69cfcd9`) | unresolved import in `index.ts` | 1 | `Could not resolve: "./doesNotExist"` |
| `imports:check` | a tracked file importing an untracked one | 1 | `imports that a clean checkout could not resolve` |
| `vp run test` (Bun suite) | failing `planted.test.ts` | 1 | `planted.test.ts (1 test \| 1 failed)` |
| `vp run test:workers` | failing assertion in `SourceLeaseObject.test.ts` | 1 | `(5 tests \| 1 failed)` |
| `check_repo.py` via `vp run policy` | `justfile` recreated | 1 | `retired toolchain glue is back: justfile` |
| `check_repo.py` | `pkgs.nodejs_24` removed from `devenv.nix` | 1 | `devenv.nix missing declared development dependency: pkgs.nodejs_24` |
| `test_environment_safety.py` via `vp run policy` | `deploy` depends on `setup` instead of `verify` | 1 | `deploy must run verify first` |
| `test_d1_restore.py` | `--confirm` removed from the task | 1 | the `d1-restore` task assertion |
| `test_d1_migrations.py` | the snapshot pre-marks a renamed migration | 1 | `assert migration_names(new_database) == …` |
| `test_nav_key.sh` | `chmod 0600` changed to `0644` in `configure-nav-key.sh` | 1 | `[ 644 = 600 ]` (bash `-x`) |
| `test_deploy_preflight.sh` | production token preflight disabled | 1 | `production preflight did not report: Production requires a NAV-issued private consumer token.` |
| shellcheck via `vp run policy` | unquoted `$1` in `scripts/migrate-d1.sh` | 1 | `SC2086` |
| `.vite-hooks/pre-commit` | `justfile` recreated | 1 | `Repository checks failed` |
| `vp run deploy` gating | fmt failure, with a stub `wrangler` on PATH | 1 | `9/10 successful`; `scripts/deploy.sh staging` never started (0 occurrences in the log) |

## 6. Open gates for CI (not verifiable here)

1. **devenv evaluation.** `nix flake metadata github:cachix/devenv-nixpkgs/760b852…` is refused here ("GitHub access to this repository is not enabled for this session"). What was checked statically: `nix-instantiate --parse devenv.nix` succeeds, `devenv.nix` evaluates with stub `pkgs` (10 packages plus `enterShell`), the rendered `enterShell` passes `bash -n`, the YAML files parse, and `check_repo.py` asserts that the lock is pinned. **CI must run `quality.yml` green.** That is the acceptance item "devenv is proven in CI".
2. **Toolchain versions inside devenv are unknown.** CI should record `bun --version`, `node --version` and `wrangler --version`; `vp run setup` prints Bun and Wrangler. For that reason `RELEASE-MANIFEST.json` dropped its `wrangler_version` field rather than guess one.
3. **`pr-preview.yml` under devenv.** The PR that carries this branch triggers it. It needs the `pr-preview` environment secrets, and `devenv shell --` must pass `CLOUDFLARE_*` through to the scripts.
4. **Existing clones.** Where `core.hooksPath` is still `.githooks`, `vp config` deliberately skips the dispatcher, so run `vp hooks enable` once.

## 7. Left stale (out of scope)

Some comments mention the old commands. Application files (`apps/worker/src/**`, e.g. `bun run check`) are excluded by "no application code changes". `infra/alchemy.run.ts` (`just build`) is excluded by "no `infra/` changes". `dev/test.wrangler.jsonc` (`just preview`) is left alone. RFCs, `work/`, `evidence/` and `design-specs/` are historical records and were not rewritten.
