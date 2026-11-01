# WS-0027@2 independent review

- Reviewed: branch `ws27` @ `2c0dffb56a4a48c830aa0e46b2806f236fe6f146` (commits `1c4a0da`, `69cfcd9`, `2c0dffb`), base `82e4f3f`.
- Contract: `work/WS-0027-r2-toolchain-devenv-vite-plus.md`; `AGENTS.md` read.
- Method: read the diff. Ran everything in a `git archive` copy at `/tmp/rv27/head`, a scratch `git init` with `-c` identity only. The base was archived to `/tmp/rv27/base` for comparisons. Nothing was run in `/home/user/job-application-assistant` or `/home/user/ws27` except read-only `git show/diff/status/config --get`. `VP_GIT_HOOKS=0` was set for all runs. `cmp` shows the main `.git/config` unchanged afterwards, and no processes are left running.
- Local toolchain (not devenv): Bun 1.4.4, Node 22.23.4, Python 3 (system), shellcheck 0.11.0 from a `shellcheck-py` venv in `/tmp/rv27/venv`. There is no wrangler: a stub that logs its calls and exits 1 was used for the deploy-gating runs.

## Verdict: **ACCEPT WITH NITS**

Go ahead with the PR. I found no weakened quality gate.
- The lint config is byte-identical to `.oxlintrc.json`.
- Format scope (269 files) and lint scope (273 files, including `infra/`, `e2e/` and `scripts/ts`) are unchanged.
- The verify chain runs the old `just verify` gates in the old order.
- Both deploy tasks are blocked by any failing verify gate. I saw this with a policy failure and with a test failure.
- `d1-restore` still always passes `--confirm`. The production token preflight still runs after verify and still fails closed.
- The cache decision in `69cfcd9` is correct, and I reproduced the stale pass.

One property did weaken: the deploy entry points no longer force the pinned environment (M1). The fix is cheap, and I recommend making it on the PR branch before merge. The owner may instead accept the risk explicitly. Everything else is low or a nit.

## Findings

| # | Severity | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| M1 | Medium | `vite.config.ts:126-127`; `docs/internal/architecture/deployment.md:32` | The old `./deploy` and `./deploy-production` always entered the pinned flake. `bootstrap` did this through `nix develop`, and `test_bootstrap.sh` and the `check_repo.py` bootstrap fragments enforced it. The new `vp run deploy[-production]` runs with whatever `bun`/`wrangler`/`python3` is on PATH, for example via `bunx vp run deploy` from a host shell. Nothing checks for devenv, yet `deployment.md` says "Both run inside the pinned devenv shell". The quality gates themselves still run first; what is lost is the pinned-toolchain guarantee for remote mutation. | Re-enter or require devenv in the deploy tasks, the same idiom as `.vite-hooks/pre-commit`. For example, `command: "test -n \"$DEVENV_ROOT\" \|\| { echo 'run inside devenv shell' >&2; exit 1; }; bash scripts/deploy.sh staging"`, or a guard at the top of `scripts/deploy.sh`. Add an assertion in `test_environment_safety.py` with a negative control. Or soften the doc sentence and record the owner's acceptance. |
| L1 | Low | `vite.config.ts:126-127` | `vp run --ignore-depends-on deploy-production` skips verify. I saw this: `deploy.sh production` started straight away. It has the same strength as `just --no-deps`, and `bash scripts/deploy.sh` was always a bypass. Even so, it is a documented one-flag way past the gate. | Put the gate in the command instead of `dependsOn` (`vp run verify && bash scripts/deploy.sh staging`) so no `vp run` flag can drop it. Update the `test_environment_safety.py` assertion to match. |
| L2 | Low | `scripts/setup.sh:1-8,34-37` | The required-tool check (`bun wrangler … sqlite3 jq shellcheck`) was deleted and nothing replaced it. Outside devenv, `vp run setup` now prints "Pinned setup ready." even when `wrangler` is missing (seen: the `$(wrangler --version)` failure is swallowed). The scripts then fail later, at deploy time. | Keep a short `command -v` loop (bun, wrangler, python3, jq, curl, shellcheck), or rely on M1's devenv guard and drop the "Pinned" wording. |
| L3 | Low | `README.md`, `docs/internal/lifecycle/quality-assurance.md` | Existing clones with `core.hooksPath=.githooks` now point at a directory that was deleted, so git silently runs no pre-commit hook. `vp config` deliberately skips installing when `core.hooksPath` points elsewhere (`guide/commit-hooks.md`). This is recorded only in `evidence/WS-0027/README.md` §6.4. | Add a one-line migration note to the maintained docs: run `vp hooks enable` once in an existing clone. |
| N1 | Nit | `vitest.workers.config.ts:20-32` | The comment says Node is kept out of the shared shell "because `flake.nix` documents…". Both halves are now false: `flake.nix` is gone and `devenv.nix` adds `nodejs_24`. It also names `package.json` `test:workers` scripts that no longer exist. It was left alone because the contract excludes test changes. | Follow-up ticket, or a comment-only edit if the owner allows it. |
| N2 | Nit | `docs/public/how-to/manage-principals.md:11` | `just principal-key …` refers to a command that did not exist in the base justfile either, so it was already stale. It is still a deleted-toolchain reference in a maintained public doc. | Replace it with the real invocation, or open a follow-up. |
| N3 | Nit | `package.json:22-23` | The `oxfmt 0.62.0` and `oxlint ^1.77.0` devDependencies are no longer what the gates run: `vp check` uses Vite+'s bundled `oxfmt 0.74.0` and `oxlint 1.89.0`. Keeping two versions of each tool is extra maintenance. The output is the same today: 269 files clean, 0 lint findings. | Remove them if the Effect oxlint plugin does not need `oxlint` as a peer, or record why they stay. |
| N4 | Nit | `scripts/test_environment_safety.py:112-114` | The verify-chain assertion checks policy, `vp check`, typecheck, effect and coverage, but not `imports:check`, `schema:check`, `catalog:check`, `bundle:check` or `setup`. Nothing asserts that `pr-preview.yml` runs verify before the deploy step. That ordering is correct today but unguarded, and the base had no such check either. | Add the missing gate names and a step-order assertion for `pr-preview.yml`. |
| N5 | Nit | `scripts/test_d1_restore.py:35`, `test_environment_safety.py:106-110` | The new assertions match exact one-line strings in `vite.config.ts`. They fail closed when the file is reformatted, so they are safe but brittle. `vite.config.ts` is outside the fmt scope, so `vp fmt` will not reflow it. | Optional: parse `vite.config.ts` instead, as `/tmp/rv27/cmp.mjs` does by importing it with Node. |
| N6 | Nit | `.github/workflows/quality.yml` | The tests run twice (`vp run test`, then coverage inside `vp run verify`). The contract asks for this; runtime is about 2.5 min locally, well inside the 30 min timeout. | None needed. |

## 1. Gate-by-gate replacement check

| Deleted | What it enforced | Replacement (verified how) |
| --- | --- | --- |
| `flake.nix`/`flake.lock` | Pinned toolchain: bun, wrangler, just, python3, shellcheck, sqlite, jq, curl, git, cacert. Rule: no nodejs. | `devenv.nix` and `devenv.lock`. The lock is identical to `ref/phibkro_vektorprogrammet-reimagined/devenv.lock` and `ref/phibkro_pg-outbox/devenv.lock` (`diff`: no output). `check_repo.py` asserts the packages and that every root input is pinned. The no-nodejs rule was dropped on purpose: my Bun suite passed 80/664/4 with Node 22 on PATH. **Not evaluated** (see below). |
| `bootstrap`, `deploy`, `deploy-production`, `dispatch.sh` | They entered the pinned shell and dispatched to `just` (deploy goes to `deploy-staging`, which goes to `_verify`). | `devenv shell --` plus `vp run deploy[-production]` with `dependsOn: ["verify"]`. Gating was verified (§3). **Lost: the forced pinned environment (M1).** |
| `justfile` | Recipe deps: `_check: _setup`, `_verify: _check` plus `bun run check`, `_deploy-*: _verify`, `_d1-restore … --confirm`. Arguments for qualification, soak and d1-restore. | `run.tasks`. Arguments pass through (python3 stub): `restore-d1.py --confirm srcdb tgtdb`, `soak.py https://x.example --duration 5 --interval 1`, `qualify.py` (default rows are still 50_000). |
| `scripts/check.sh` | `check_repo`, `test_bootstrap`, `test_nav_key`, `test_deploy_preflight`, `test_environment_safety`, `test_d1_migrations`, `test_d1_restore`, `shellcheck deploy bootstrap scripts/*.sh`. | `policy` runs the same list minus `test_bootstrap`, which tested only deleted files. shellcheck now covers `scripts/*.sh .vite-hooks/pre-commit` through `bash -c`. All 9 policy steps were seen running in verify. |
| `install-hooks.sh`, `.githooks/pre-commit` | `core.hooksPath=.githooks`; pre-commit ran `check.sh`. | `.vite-hooks/pre-commit` runs `vp run policy` and is installed by `vp config` in `setup`. A blocked commit was seen (§6). See L3 for existing clones. |
| `test_bootstrap.sh` | Bootstrap enters Nix and does not touch the profile; the wrappers delegate to `deploy-staging`/`deploy-production`. | Delegation is now asserted in `test_environment_safety.py`, and its negative control fails (§4). Entering the pinned environment is not replaced (M1). |
| `.oxlintrc.json` | Categories, rules, overrides, ignores, Effect plugin. | `vite.config.ts` `lint`. `JSON.stringify(old minus $schema) === JSON.stringify(cfg.lint)` printed **LINT BLOCK IDENTICAL** (`/tmp/rv27/cmp.mjs`). Scope check: I planted `console.log` in `infra/alchemy.run.ts` and `e2e/playwright.config.ts`. Base `oxlint` 1.77 and new `vp lint` 1.89 flagged both. `git ls-files` shows 273 TS/JS files tracked, which matches "273 files". |
| `package.json` scripts | `fmt:check` (`oxfmt --check packages apps`), the `check` chain, and the `test`/`coverage` `:workers` variants via `nix shell nixpkgs#nodejs`. | `fmt.ignorePatterns ["/*","!/packages/","!/apps/"]`. Base `oxfmt 0.62 --check packages apps` covers 269 files and new `vp check` reports "All 269 files are correctly formatted", the same count. Verify order matches the old `check` chain. The workerd suite now runs under the shell's `node`. |

## 2. Cache decision (`69cfcd9`)

- **Stale replay reproduced.** In scratch I set `bundle:check` back to cacheable, warmed it twice (`cache hit`), then appended `import "./doesNotExist";` to `apps/worker/src/index.ts`. Result: `vp run bundle:check` **exit 0, "cache hit, 240ms saved"**. `--last-details`: "Cache hit - output replayed". The changed file is the entry point named on the command line, so Vite Task's file tracking sees none of what `bun build` reads. This is stronger than the evidence's import-graph example.
- **The fix is right.** Under the shipped config the same plant exits 1 (`⊘ cache disabled`). `vp run --cache bundle:check` still shows `⊘ cache disabled`, so the global `--cache` flag does not override a task's `cache: false`. CI keeps no Vite Task cache between runs (there is no `actions/cache`).
- **Declared inputs work, but are not the better fix.** With `cache: { input: [{auto:true}, "apps/**/*.ts", "packages/**/*.ts", "!**/node_modules/**"] }` the plant gave `cache miss: 'apps/worker/src/index.ts' modified`, exit 1. A correct input set for Bun tasks would also have to list `node_modules` (dependency bumps), `bun.lock`, the tsconfig paths, `db/*.sql`, `bunfig` and the scripts themselves, and keep that list current by hand. Leaving one out gives a silent false green, which defeats the owner's goal of less owned maintenance. These gates take about a second each, so `cache: false` is the right trade.
- **The one cached task (`typecheck`, tsc on Node) is sound in my controls.** I warmed it, then made three changes:
  - A new file `apps/worker/src/zzPlanted.ts` with a type error gave `cache miss: 'zzPlanted.ts' added`, exit 2, TS2322.
  - Editing `packages/domain/src/Access.ts` gave `cache miss: … modified`, exit 2.
  - Editing `node_modules/effect/dist/Effect.d.ts` gave `cache miss: '…/Effect.d.ts' modified`. That run exited 0 because of `skipLibCheck`, but it re-ran.

  Remaining theoretical risk: tsc reads no env vars that matter. A tsc flag change is part of the command fingerprint. I see no false-green path.
- `vp check`, policy, the tests and the deploy tasks all show `⊘ cache disabled` in the verify log.

## 3. Counts in a clean copy (exit codes read directly, no pipes)

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 236 packages |
| `vp check` | 0 | `All 269 files are correctly formatted`; `Found no warnings or lint errors in 273 files` |
| `vp run test` | 0 | Bun `Test Files 80 passed (80)`, `Tests 664 passed \| 4 skipped (668)`; workerd `22 passed (22)`, `109 passed (109)` |
| `vp run verify` (cold) | 0 | `18/18 successful`; `effect-diagnostics: ok (5 excepted finding(s), 4 registry entries)`; both suites as above, with coverage; `tsc --noEmit` ran; Foldkit fetched |
| `vp run deploy-production` (all green, no NAV token, stub wrangler) | 1 | Verify passed, then `$ bash scripts/deploy.sh production` printed `Production requires a NAV-issued private consumer token.` (`18/19 successful`). The token check runs after verify and fails closed. |

Both deploy tasks are gated (the negative controls are in §4). The claimed counts match.

## 4. Negative controls I re-ran (planted, run, reverted; `git status` clean after each)

| Control | Plant | Command | Exit | Seen |
| --- | --- | --- | --- | --- |
| Deploy gating, staging (policy) | `touch justfile` | `vp run deploy` | 1 | `retired toolchain glue is back: justfile`; `2/3 successful`; `deploy.sh` never started |
| Deploy gating, production (tests) | formatted failing `packages/domain/src/planted.test.ts` | `vp run deploy-production` | 1 | `Test Files 1 failed \| 80 passed (81)`; `16/17 successful`; no `deploy.sh` line. An earlier attempt failed sooner, at `vp check` fmt, and was also gated. |
| Policy: `test_environment_safety.py` | `deploy` `dependsOn: ["setup"]` | `vp run policy` | 1 | `AssertionError: deploy must run verify first` |
| Policy: `test_d1_restore.py` | `--confirm` removed from the task | `python3 scripts/test_d1_restore.py` | 1 | `AssertionError` |
| Policy: `test_deploy_preflight.sh` | production token `if` changed to `if false` in `deploy.sh` | `vp run policy` | 1 | `production preflight did not report: Production requires a NAV-issued private consumer token.` |
| Policy: shellcheck glob | unquoted `$1` appended to `scripts/migrate-d1.sh` | `vp run policy` | 1 | `SC2086` |
| Lint, Effect plugin | `Date.now()` in `packages/domain/src/Access.ts` | `vp check` | 1 | `effect(no-ambient-authority)… Date.now()`; `Lint issues found` |
| Lint scope | `console.log` in `infra/` and `e2e/` | base `oxlint` / `vp lint` | n/a | both flag both files |
| `schema:check` | table appended to `db/schema.sql` | `vp run schema:check` | 1 | `db/schema.sql disagrees with the domain models` |
| `bundle:check` (shipped config) | unresolved import in `index.ts` after a warm run | `vp run bundle:check` | 1 | runs (`cache disabled`), fails |
| `typecheck` (warm cache) | new file / edited file with TS2322 | `vp run typecheck` | 2 / 2 | cache miss, TS2322 |
| Pre-commit hook | `justfile` staged | `git -c core.hooksPath=.vite-hooks commit` (`DEVENV_ROOT` set) | 1 | `retired toolchain glue is back: justfile`; HEAD unchanged. A harmless commit passed (exit 0). |

One side observation: a planted `Answer.ts` literal (`"planted"` added to `origin`) did not fail `schema:check`, even with cache off. That literal does not map to `db/schema.sql`. It is not a cache problem, and the drift control above fails as expected.

## 5. CI workflows

- **Installer and caching.**
  - `cachix/install-nix-action@3c6342b…` (v31), `cachix/cachix-action@97e5ff8…` (v16, `name: devenv`, pull-only, no token), `nix profile add github:cachix/devenv/b904dcb…` and `actions/checkout@08c6903…`: all byte-identical to the owner's `vektorprogrammet-reimagined` `checks.yml` and `preview.yml`.
  - `nix profile add` needs a recent Nix. It is the same action SHA the owner already uses, so I accept it, but CI must show it.
  - There is no Bun or Vite Task cache in CI. That is slower but cannot give a false green.
- **Secrets through `devenv shell --`.** `devenv shell` is impure by default and inherits the step's `env:`. The owner's `preview.yml` uses the same pattern with `NEON_API_KEY` and others in step env and `devenv shell -- bash -c '… $NEON_API_KEY'`. This is strong evidence by analogy, but I did not run it. Likewise `enterShell` adds `node_modules/.bin` to PATH so a bare `vp` resolves. The owner's repos call `bunx vp`/`bun run` instead, but they rely on `enterShell` exports (`SSL_CERT_FILE`) in CI the same way. If `vp: command not found` appears in CI, switch to `bunx vp`.
- **`pr-preview.yml` cannot deploy without verify.** In the same job, `devenv shell -- vp run verify` runs before the deploy step, there is no `continue-on-error`, and steps stop at the first failure. The fork guard, `pull_request` (not `_target`), `contents: read` and `cancel-in-progress: false` are unchanged, and `test_environment_safety.py` still asserts them. The deploy and destroy script invocations are byte-identical. Nothing asserts the verify-before-deploy step order (N4). The `destroy` job runs `setup` only, as before.
- `quality.yml` runs `vp check`, then `vp run test`, then `vp run verify`. This is what the contract asks for: "devenv then `vp check` and `vp run test`".

## 6. Contract fit

- **No application code, test or `infra/` changes:** `git diff --stat 82e4f3f ws27 -- apps packages infra db e2e '*.test.ts' vitest.config.ts vitest.workers.config.ts tsconfig.json` is empty. Root `node_modules/vitest` is 4.1.10; Vitest 5.0.5 exists only nested under `vite-plus`. No formatting-only commit was needed: 0.74 formats the same 269 files clean.
- **"Python gates kept":** the reason is recorded in evidence §3, and I find it sound. Python stays a hard prerequisite either way (`deploy.sh` embeds Python; `qualify.py`, `restore-d1.py` and `soak.py` are operator tools). Porting the gates to TypeScript would swap one owned script for another without removing a tool. That does not serve "avoid custom scripts", which is about adopting tools rather than rewriting owned glue. The one gate with a real tool equivalent (the secret-marker scan, which gitleaks covers) is correctly deferred to WS-0028. The `check_repo.py` diff is a net reduction: 107 lines changed, about 30 fewer.
- **Docs:** `README.md`, `AGENTS.md`/`CLAUDE.md` (a symlink), `deploy.md`, `deployment.md`, `production-qualification.md`, `configure-nav-auth.md`, `run-first-demo.md`, the QA docs, the release checklist, `RELEASE-MANIFEST.json` and the memory bank are consistent with `vp run …`. A `git grep` for deleted commands in maintained docs found only `manage-principals.md` (N2, already stale before this change). The other hits are comments in app, test or `infra/` files that the contract excludes, and they are recorded in evidence §7. Historical `work/`, `evidence/` and RFCs are untouched.
- **Pre-commit hook:** it blocks a policy failure (§4). I invoked the hook with `git -c core.hooksPath=.vite-hooks`, not through the `vp config` dispatcher, so that no git config was written. The dispatcher path itself is the implementer's claim (evidence §3).

## Not verified

1. **devenv evaluation and the toolchain versions inside it** (bun, nodejs_24, wrangler, and shellcheck from devenv-nixpkgs `760b852`). No `devenv` CLI is available here, and GitHub-pinned flake inputs are refused through the proxy. A newer nixpkgs shellcheck could add warnings. The PR's `quality.yml` run is the acceptance evidence.
2. The `nix profile add` CLI syntax with that installer SHA, `enterShell` PATH and export behaviour under `devenv shell --`, and `CLOUDFLARE_*` passthrough. All match the owner's working repos but were not run.
3. A real `pr-preview.yml` deploy and destroy, which need secrets and Cloudflare.
4. Hook installation through `vp config`, and its dispatcher. I avoided writing git config.
5. The Bun suite with Node **24** on PATH. I tested Node 22 only.
6. A real remote `deploy`/`d1-restore`. Only gating, argument passthrough and the token preflight were exercised, with stubs.

## Commands run (main ones)

```text
git -C /home/user/ws27 archive ws27 | tar -x -C /tmp/rv27/head   (and 82e4f3f into /tmp/rv27/base)
bun install --frozen-lockfile                       head 0, base 0
vp check                                            0
vp run test                                         0
vp run verify                                       0 (18/18)
node /tmp/rv27/cmp.mjs                              LINT BLOCK IDENTICAL
base: oxfmt --check packages apps                   269 files; oxlint 0 findings
vp run bundle:check (cache on, planted)             0  <- stale replay reproduced
vp run bundle:check (declared inputs, planted)      1  cache miss
vp run bundle:check (shipped, planted)              1
vp run --cache bundle:check                         cache disabled (flag does not override)
vp run typecheck (warm; add/edit/node_modules)      2 / 2 / miss
vp run deploy (justfile planted)                    1, deploy.sh not run
vp run deploy-production (failing test)             1, deploy.sh not run
vp run deploy-production (green, no token)          1 at the production token preflight
vp run --ignore-depends-on deploy-production        deploy.sh ran immediately (L1)
vp run d1-restore srcdb tgtdb / soak / qualification   argv passthrough with --confirm (stub)
git -c core.hooksPath=.vite-hooks commit            1 with a policy failure, 0 clean
cmp main .git/config before/after                   unchanged
```
