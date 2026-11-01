# WS-0027@2 delta review (round 2)

- Reviewed: `3a657b1` on `claude/clever-heisenberg-lwui1b`. The fix commits are `fa1221e` (M1+L1), `dcc642e` (L2/L3/N1/N2) and `3a657b1` (evidence); their originals on `ws27` are `f38f7c2`, `b20b19e` and `c7b66aa`. Round 1 reviewed `2c0dffb`.
- Tree delta from `2c0dffb` to `3a657b1`: the fix commits, plus the `AGENTS.md` "Merge delegation" section from `bf02339`, which this branch is rebased on. `82e4f3f` is an ancestor. Nothing else changed.
- Method: `git archive 3a657b1` into `/tmp/rv27d/head`, a scratch `git init` with `-c` identity only, and `bun install --frozen-lockfile` (exit 0). `VP_GIT_HOOKS=0` throughout. Stubs:
  - `wrangler`: answers `--version`; anything else is logged and exits 99.
  - shellcheck 0.11.0 from a venv.
  - No Cloudflare credentials in the environment (`env | grep -c CLOUDFLARE` gives 0).
- Nothing was run in `/home/user/job-application-assistant` except read-only `git log/diff/archive/merge-base`. `cmp` shows its `.git/config` unchanged, and no processes are left running.

## Verdict: **ACCEPT WITH NITS**. Nothing at medium or above remains.

M1, L1, L2, L3, N1 and N2 are all fixed and verified by my own runs. The counts are unchanged. The fixes introduce no new weakening. There is one new **low** finding: the policy assertion for the guard is string-based, and a `|| true` added after the guard's quoted command passes it while disabling the guard. Round 1's N3 to N6 remain as nits.

Under the AGENTS.md merge delegation (round 2: merge only if nothing at medium or above), this round **does not block merge**. CI must still be green on the head.

## Findings (this round)

| # | Severity | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| D1 | **Low** | `scripts/test_environment_safety.py:107-113` | The guard assertion checks for substrings (`test -n \"$DEVENV_ROOT\" \|\|` and `exit 1`) on the line that defines it. Seen: changing the guard to `bash -c '…exit 1; }' \|\| true` keeps `test_environment_safety.py` at **exit 0**, and the guard as evaluated then exits **0** with `DEVENV_ROOT` unset. Removing the guard, `exit 0`, `test -z`, and `dependsOn` coming back are all caught. Because `exit` leaves the inner bash first, `…; }; true` inside the quotes is **not** a weakening (guard exit 1). | Assert the whole `requireDevenv` string exactly. Better, have the policy test run the guard: extract it, run it with `DEVENV_ROOT` unset (expect non-zero) and set (expect 0). |
| D2 | Nit | `vite.config.ts:19-20` | `DEVENV_ROOT=anything vp run deploy` passes the guard. That is by design: it is a tripwire against accidentally deploying from a host shell, not an enforcement boundary, and `bash scripts/deploy.sh` was always a bypass too. | None. Optionally say "tripwire" in `deployment.md`. |
| D3 | Nit | `vite.config.ts:20` | The guard message always says `devenv shell -- vp run deploy`, including for `deploy-production`. | Make the message neutral ("devenv shell -- vp run <task>"). |
| D4 | Nit | `vitest.workers.config.ts:23-29` | The N1 fix edits a test config. It is comment-only (no non-comment lines in the diff), which is the option round 1 offered, but strictly it is a test-file touch under the contract exclusion. | None, if the coordinator or owner accepts it. |
| N3-N6 | Nit | as in round 1 | Unchanged and left to the coordinator: the unused `oxfmt`/`oxlint` devDependencies; the verify-block assertion and the `pr-preview.yml` step order not asserted; the exact-string brittleness; tests running twice in CI. | As in round 1. |

## Round-1 findings: status

| Finding | Status | Evidence (my runs) |
| --- | --- | --- |
| M1 (deploys outside devenv) | **Fixed** | With `DEVENV_ROOT` unset, `vp run deploy` and `vp run deploy-production` both **exit 1**. Only one task line ran (the guard), with `deploys must run inside the pinned toolchain…`. `DEVENV_ROOT=""` also gives **exit 1**. `deployment.md` now says the deploys refuse to start outside devenv. |
| M1 policy assertion | **Fixed, with gap D1** | Guard removed from `deploy`: exit 1, `deploy must require devenv, then run verify, then deploy`. `exit 1` changed to `exit 0`: exit 1. `test -n` changed to `test -z`: exit 1. `deploy-production` back on `dependsOn: ["verify"]`: exit 1. `\|\| true` appended: **exit 0** (D1). |
| L1 (`--ignore-depends-on`) | **Fixed** | Outside devenv, `vp run --ignore-depends-on deploy-production` gives exit 1 at the guard. Inside (`DEVENV_ROOT` set), the same command ran setup, policy, `vp check`, every gate and both coverage suites (80 and 22 files) **before** `$ bash scripts/deploy.sh production`, which stopped at `Production requires a NAV-issued private consumer token.` (`19/20 successful`). Inside, with a policy failure planted (`justfile`): `vp run deploy` and `vp run --ignore-depends-on deploy` both give **exit 1** (`3/4 successful`), and `deploy.sh` never ran. |
| L2 (setup tool check) | **Fixed** | `bash scripts/setup.sh` without `wrangler`: exit 1, `Missing 'wrangler': run inside the pinned toolchain`. On a PATH without `shellcheck`: exit 1, `Missing 'shellcheck'`. Every required tool (bun, node, wrangler, python3, curl, jq, shellcheck) is in `devenv.nix`, so CI and devenv users are unaffected. `sqlite3` is left off, correctly: the only uses are Python's `sqlite3` module (round-1 grep). |
| L3 (existing clones and hooks) | **Fixed** | `vp hooks enable` is documented in `AGENTS.md`, in `README.md` "Local development", and in the `quality-assurance.md` command list. |
| N1 (stale workers-config comment) | **Fixed** | No `flake.nix` or `nix shell nixpkgs#nodejs` left in `vitest.workers.config.ts`. The diff is comment-only (D4). |
| N2 (`just principal-key`) | **Fixed** | The command is removed from `manage-principals.md` and replaced with an accurate note that no task replaces it. |

## No new weakening

- The deploy chain went from `dependsOn: ["verify"]` to inline `${requireDevenv} && vp run verify && bash scripts/deploy.sh <stage>`, with `cache: false`. Verify still runs in full before `deploy.sh`, and no `vp run` flag can skip it.
- `--cache` cannot re-enable caching: per-task `cache: false` was seen to win in round 1, and the config is unchanged there.
- `pr-preview.yml` and `quality.yml` are unchanged since round 1. CI does not use `vp run deploy`, and its `vp run setup` and `verify` run inside devenv, which provides every newly required tool.
- The production token preflight still fails closed after verify (above).
- `d1-restore --confirm`, the lint block, the fmt scope and the policy list are untouched by the fix commits: the diff touches only the lines shown.

## Counts (clean copy, exit codes read directly)

| Command | Exit | Result |
| --- | --- | --- |
| `vp check` | 0 | `All 269 files are correctly formatted`; `Found no warnings or lint errors in 273 files` |
| `vp run test` | 0 | Bun `80 passed (80)`, `664 passed \| 4 skipped (668)`; workerd `22 passed (22)`, `109 passed (109)` |
| `vp run verify` | 0 | `18/18 successful`; `effect-diagnostics: ok (5 excepted finding(s), 4 registry entries)`; both suites as above, with coverage |

These are the same as round 1 and as the evidence's §8 claims.

## Disclosure: one unplanned deploy-script start (no remote mutation)

Between two planted runs I mistakenly ran one **unplanted** `DEVENV_ROOT=… vp run --ignore-depends-on deploy`. Verify passed, so `scripts/deploy.sh staging` started. Here is why nothing reached Cloudflare:
- No NAV token was set, so the NAV curl was skipped.
- No Cloudflare credentials were in the environment.
- The stub wrangler logged `wrangler whoami`, then `wrangler login`, and exited 99. Under `set -e` the script stopped at `wrangler login` (`deploy.sh:123-126`), which comes before `bun run alchemy deploy` (`deploy.sh:150`) and every `wrangler d1 execute`.
- No `infra/.alchemy` state was created. The only side effect is local `.deploy/` and `.artifacts/` directories in the scratch copy.

## Not verified

The round-1 list still applies:
- devenv evaluation, and the tool versions and PATH/env behaviour inside `devenv shell --`;
- `nix profile add` with the pinned installer;
- `CLOUDFLARE_*` passthrough and a real `pr-preview.yml` deploy;
- hook installation through `vp config`;
- the Bun suite under Node 24.

Two items are specific to this round:
- `DEVENV_ROOT` being exported inside a real `devenv shell` is assumed from devenv's documented behaviour and the owner's hook idiom, not seen. The implementer's probe shows that Vite Task passes the variable to tasks.
- `vp run deploy` succeeding inside devenv, i.e. the guard passing there, was only simulated by setting `DEVENV_ROOT`.

## Commands run

```text
git archive 3a657b1 | tar -x -C /tmp/rv27d/head; bun install --frozen-lockfile          0
vp check / vp run test / vp run verify                                                0 / 0 / 0
vp run deploy, vp run deploy-production   (DEVENV_ROOT unset)                         1 / 1 at the guard
vp run --ignore-depends-on deploy-production (unset)                                  1 at the guard
DEVENV_ROOT="" vp run deploy                                                          1
DEVENV_ROOT=… vp run --ignore-depends-on deploy-production                            1 at the NAV token preflight, after full verify
DEVENV_ROOT=… vp run deploy (+ justfile)                                              1, deploy.sh not run
DEVENV_ROOT=… vp run --ignore-depends-on deploy (+ justfile)                          1, deploy.sh not run
python3 scripts/test_environment_safety.py: guard removed / exit 0 / test -z / prod dependsOn   1 / 1 / 1 / 1
python3 scripts/test_environment_safety.py: '|| true' appended                        0   <- D1
evaluated guard: real / '; true' inside / '|| true' outside (DEVENV_ROOT unset)       1 / 1 / 0
bash scripts/setup.sh without wrangler / without shellcheck                           1 / 1
cmp main .git/config                                                                  unchanged
```
