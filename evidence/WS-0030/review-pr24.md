# PR #24 independent review (round 1)

- Reviewed: head `f6707d5` against base `main` at `1f53f33`. Commits are `983312a` (docs: close WS-0027, add WS-0030), `2c6c426` (baseline evidence), `c73ffd6` (P2) and `f6707d5` (P4).
- Method: read-only. I used `git diff/show/log` on the main checkout and ran everything else in a `git archive f6707d5` copy at `/tmp/pr24`. I ran nothing in the main checkout, pushed nothing, posted nothing on GitHub and re-ran no workflows. The only network call was `git ls-remote` against `actions/cache`.

## Verdict: **ACCEPT WITH ONE MEDIUM (process)**. Technically, no gate is weakened.

- **P2 and P4 are technically safe.** I found nothing at medium or above in the workflow changes.
- **One medium finding (M1)** is about the approved work scope, not the code. The WS-0030@1 contract says a pass is kept only with per-pass measurements and negative controls, recorded in `evidence/WS-0030/README.md`. That evidence is not on this head. Merging makes P2 and P4 kept passes without it.
- **Under the AGENTS.md merge delegation (round 1: merge only if nothing is at medium or above), this round does not clear auto-merge.** It clears in either of two ways:
  - Add the P2/P4 evidence, then run a new review round on the new head.
  - Get the owner to waive the keep criterion explicitly for these two passes, for example by marking them provisional until measured.

## 1. P2: no test execution is lost

Trace at `f6707d5`. `vite.config.ts` and `package.json` are unchanged from base.

- `bunSuite = "bun node_modules/vitest/vitest.mjs run"`. This uses `vitest.config.ts`: include `packages/**/*.test.ts`, `apps/**/*.test.ts`, the `includeSource` doctests, and the explicit workerd-file excludes.
- `workerdSuite = "node node_modules/vitest/vitest.mjs run -c vitest.workers.config.ts"`. This uses its 11 explicit include paths and `setupFiles`.
- The removed step ran `vp run test`, which is `${bunSuite} && ${workerdSuite}`.
- The kept `vp run verify` ends `... && vp run bundle:check && vp run coverage`. `coverage` is `${bunSuite} --coverage && ${workerdSuite} --coverage`. That is the same two binaries, runtimes and config files, with the same include/exclude and setup. The only added flag is `--coverage`.
- `--coverage` changes no test selection. It turns on the istanbul provider and the thresholds in each config:
  - unit: lines 80, functions 80, branches 70, statements 80;
  - workers: lines 80, functions 80, branches 58, statements 80.
- The baseline log (run 41341703410) corroborates this: each suite reported the same file count in both executions (80 and 22 files).
- `vp run test` had no extra globs, flags, env or setup that `coverage` lacks. Nothing that only `vp run test` ran is dropped.
- The job name `verify` is unchanged, so required-check names are unaffected. `python3 scripts/check_repo.py` has no assertion on the removed step (it passes, below).

**Result:** both suites, every test file and both threshold sets still run in `quality.yml`. No gate is weakened.

## 2. P4: the Bun cache is safe

- **SHA pin verified.** `git ls-remote https://github.com/actions/cache` returns `0057852bfaa89a56745cba8c7296529d2fc39830` for both `refs/tags/v4.3.0` and `refs/tags/v4`. These are lightweight tags with no `^{}` entry, so the SHA is the commit. The `# v4.3.0` comment is accurate. The same pin and the same block appear in all three jobs.
- **Key and staleness.**
  - Key: `bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}`, with restore-key prefix `bun-${{ runner.os }}-`.
  - `~/.bun/install/cache` is a package download store. It does not decide resolution. `bun.lock` pins each version and integrity hash, and `node_modules` is not cached.
  - `bun install --frozen-lockfile` still runs right after the restore, in every job. It fails when `package.json` and `bun.lock` disagree, however full or empty the cache is.
  - A prefix-only restore from an older lockfile can only supply extra or older tarballs that the current lockfile does not reference. Missing packages are fetched.
  - Restore errors are non-fatal in `actions/cache`, so a cache-service outage cannot block verify, deploy or destroy.
- **Cache paths hold no secrets.**
  - The path is `~/.bun/install/cache` only.
  - `devenv.nix`, `devenv.yaml` and `scripts/setup.sh` set no `BUN_INSTALL*` override, and there is no `bunfig.toml`, so the path is Bun's default and is the one actually used.
  - Cloudflare credentials appear only as step `env:` in the deploy and destroy steps. Wrangler and Alchemy keep their state outside this directory. The cache is saved in the post step after the deploy step, but nothing in this path takes credentials.
- **Public repo and fork PRs.**
  - All triggers are `pull_request` or `push`. There is no `pull_request_target`.
  - Under GitHub's cache scoping, a PR run can restore from its own `refs/pull/N/merge` scope and from the base and default branch. It saves only into its own PR scope.
  - So a fork PR (in `quality.yml`; `pr-preview.yml` jobs skip forks through the `head.repo.full_name` guard) can poison only its own PR's cache. It cannot poison `main`'s cache or another PR's.
  - The default-branch cache is written only by `push` to `main`, which is trusted code.
  - The secrets-bearing `pr-preview` deploy job therefore restores only from its own same-repo PR scope or from `main`.

**Result:** no stale, poisoned or secret-bearing dependency path that I can find.

## 3. pr-preview.yml

- **deploy:** the order is checkout, nix, cachix, devenv CLI, cache restore, `bun install --frozen-lockfile`, `vp run setup`, `vp run verify`, then `Deploy isolated seeded preview`. No step has `continue-on-error` and there is no `if:` on the deploy step, so a verify failure still stops the deploy. The fork guard and `environment: pr-preview` are unchanged.
- **destroy:** the only change is the added cache step before `bun install`. The `always() && closed && same-repo` condition, the environment and the destroy step are unchanged. The destroy job still runs no verify, as on base. It is unaffected.

## 4. Docs and evidence

- `python3 -I scripts/check_repo.py` in the archive passes: `Repository checks passed: 24 JSON files, documentation links valid.` (rc=0).
- `yaml.safe_load` parses both `quality.yml` and `pr-preview.yml`.
- `evidence/WS-0030/baseline.md` keeps its claims within its data:
  - It reports n per era, declines to compute a devenv median or p90 for n < 3, and lists run IDs.
  - It labels hypotheses as hypotheses, for example the P2 saving of about 53 s and the uncertain value of P1.
  - The step and phase numbers match the run and job IDs given.
- `983312a`:
  - Decision-log row: "measure first; GitHub-hosted only". This matches the WS-0030 owner decisions.
  - `work/README.md`: WS-0027 marked done with PR #23, `1f53f33`.
  - `activeContext.md`: PR #23 merged.
  - These are consistent with the archived review round 2 ("Nothing at medium or above remains").
  - The archived WS-0027 reviews contain no credentials or personal data. They contain only scratch paths and the token-preflight messages.

## Findings

### M1 (medium, process): P2 and P4 land as kept passes without the WS-0030 keep evidence

`work/WS-0030-r1-ci-benchmark-optimization.md` (approved, top of the authority order) says:

- Method 3: "Keep a pass only if the median improves and the gates still catch planted failures. Re-run at least 3 negative controls per pass, including one deploy-gating one."
- Acceptance: the baseline and every pass are recorded with run IDs, medians and p90s in `evidence/WS-0030/README.md`.

On this head, `evidence/WS-0030/` contains only `baseline.md`. There is no README and no post-pass measurement. There are also no negative-control runs for P2 or P4.

The PR has two pass commits, each separately revertible as the contract requires. Merging them to `main` keeps them. Technically I expect both to pass the controls, because neither touches gate logic, and §1 and §2 show why. Still, the contract's evidence criterion is unmet, and a review is not a substitute for the measurement the contract asks for.

**Fix:** either

- add `evidence/WS-0030/README.md` with the P2 and P4 run IDs, median and p90 against the baseline, and at least 3 negative controls per pass (one deploy-gating, for example a planted test failure that must stop `pr-preview` deploy), then run a new review round; or
- get an explicit owner waiver recording P2 and P4 as provisional until measured.

### L1 (low): `memory-bank/progress.md` is stale for WS-0027

`progress.md` still says WS-0027 is "implemented, pending review and CI". Meanwhile `activeContext.md` and `work/README.md` in this PR say it is merged and done (PR #23, `1f53f33`). WS-0026 likewise still reads "pending review", although `work/README.md` says done. CLAUDE.md asks for both files to be updated when project state changes.

### L2 (low): on a failing PR, less diagnostic signal

Before P2, the Tests step ran both suites before Verify, so a PR that broke both a static gate and a test showed the test result. Now `coverage` is last in the `&&` chain of `verify`, so a failure in `policy`, `typecheck` or `effect:check` hides the test outcome until that gate is fixed. This is not a weakening, because the job still fails and the tests still gate. The new YAML comment documents how to attribute failures. It is a feedback-loop cost to note in the WS-0030 evidence. P3 (parallel jobs) would remove it.

### N1 (nit): the cache grows without bound

With a prefix-only restore after a lockfile change, the post step saves a new key that holds the old tarballs plus the new ones. Over many lockfile changes the cache grows until GitHub's 10 GB per-repo LRU eviction. It is harmless for correctness. If it becomes a problem, consider dropping `restore-keys` or adding a periodic cache prune.

### N2 (nit): the P4 commit message overstates slightly

"a stale cache cannot change resolved dependencies" is true for resolution, which the lockfile and `--frozen-lockfile` decide. The integrity protection against a tampered cache entry comes from GitHub's cache scoping (§2), not from `--frozen-lockfile`. I did not rely on Bun re-verifying integrity on cache hits. The commit message is history only, so no change is needed.

### N3 (nit): the baseline body contradicts its correction header

The correction at the top of `baseline.md` says run 41342789158 completed successfully (about 226 s). The run inventory table and the Caveats section below it still say "no conclusion" and "may be stuck". The `2c6c426` commit message uses the corrected n=2. Consider updating the table row and the caveat in the README pass.

## Severity summary

| ID | Severity | Blocks auto-merge (round 1)? |
| --- | --- | --- |
| M1 | medium (process: WS-0030 keep evidence missing) | **Yes** |
| L1 | low | No |
| L2 | low | No |
| N1 to N3 | nit | No |

**Medium or above:** yes, exactly one (M1). There is nothing at high or critical, and no technical gate weakening.

## Commands

```text
git -C /home/user/job-application-assistant log/diff/show 1f53f33..f6707d5
git -C /home/user/job-application-assistant archive f6707d5 | tar -x -C /tmp/pr24
cd /tmp/pr24 && python3 -I scripts/check_repo.py            -> passed, rc=0
python3 -I -c 'yaml.safe_load(...)' on both workflow files  -> ok
git ls-remote https://github.com/actions/cache 'refs/tags/v4.3.0*' 'refs/tags/v4'
  -> 0057852bfaa89a56745cba8c7296529d2fc39830 refs/tags/v4, refs/tags/v4.3.0
```

---

# Round 2 (delta `f6707d5..ddeffc5`)

- Reviewed: head `ddeffc5`. The delta is `82753da`, which reverts P4, and `ddeffc5`, which adds `evidence/WS-0030/README.md` and fixes L1 and N3.
- Method: read-only.
  - `git diff/show` on the main checkout, and a `git archive ddeffc5` copy at `/tmp/pr24r2`.
  - `gh api` GET only, on `actions/runs/41343482438/attempts/{1..6}/jobs`.
  - shellcheck 0.11.0 from a scratch venv at `/tmp/scvenv`.
  - No GitHub writes, no re-runs, and nothing run in the main checkout.

## Verdict: **ACCEPT WITH NITS**. Nothing at medium or above remains.

M1 is cleared, and L1 and N3 are fixed. The P4 revert is exact. Every policy gate passes on the `--no-verify` commit. Under the AGENTS.md merge delegation (round 2: merge only if nothing is at medium or above), this round **does not block merge**. CI must still be green on `ddeffc5`.

## 1. M1 is cleared: the evidence README checks out against the run data

**Run data matches.** I fetched all six attempts of run 41343482438. Each one is job `verify`, conclusion `success`, head `f6707d5`. The job IDs, wall times and step durations match the README table exactly:

| Attempt | Job ID | Wall (API) | devenv | Cache restore | bun install | Verify | Post-cache save |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 124958249163 | 146 | 37 | 1 | 20 | 70 | 5 |
| 2 | 124958967165 | 206 | 53 | 10 | 27 | 101 | 1 |
| 3 | 124959905955 | 170 | 49 | 9 | 19 | 78 | 0 |
| 4 | 124960658274 | 194 | 46 | 7 | 22 | 104 | 1 |
| 5 | 124961486034 | 185 | 45 | 8 | 21 | 98 | 0 |
| 6 | 124962376636 | 170 | 47 | 9 | 19 | 82 | 0 |

No attempt has a Tests step.

**Statistics recomputed.** I used linear interpolation, the same method as the baseline:

- Wall time: warm median 185 and p90 201.2; all-6 median 177.5 and p90 200.
- `bun install`: warm 21 / 25; all-6 20.5 / 24.5.
- Cache restore: warm 9 / 9.6; all-6 8.5 / 9.5.
- Verify step: warm median 98 and p90 102.8 (the README rounds this to 103); all-6 90 / 102.5.

All of these match the README.

**Decisions follow the data.**

- **P2 is KEEP.** Even the slowest sample (206 s) is below both baseline samples (249 and 226 s). The 53 s Tests step is removed by construction, and round 1 §1 showed that no test execution is lost.
- **P4 is REVERT.** On warm runs, restore plus install takes about 30 s against 26 s at baseline, and the cold run adds a 5 s save. Reverting is the conservative choice, and the contract's "keep only if the median improves" requires it.

**Negative controls.** There are 8, all exit 1, against a clean control at rc=0 with `18/18 successful`.

- Three cover verify gates: a unit test plant, a workerd test plant, and a policy plant.
- Five are deploy-gating: `vp run deploy` ×3 and `vp run deploy-production` ×2.
- They ran with a stubbed `wrangler` and no Cloudflare credentials. `deploy.sh` never started, and the stub log holds only `--version` lines.
- This meets the contract: at least 3 per pass, one of them deploy-gating, and "verify still runs the same 18 tasks".
- These are the author's local runs. I did not re-run them, so I treat them as recorded evidence, not reproduced evidence. They are consistent with the round 1 code trace, and with the WS-0027 r2 controls that used the same task graph.

## 2. The P4 revert is exact

- `git diff c73ffd6 ddeffc5 -- .github/` is empty. The workflows are exactly the P2-only state.
- Outside `evidence/` and `memory-bank/`, the diff `c73ffd6..ddeffc5` is also empty. The head therefore equals P2 plus documentation, with no stray code or config.

## 3. L1 and N3 are fixed

- **L1 is fixed.** `progress.md` now records WS-0026 as "merged in PR #23, review ACCEPT WITH NITS" and WS-0027 as "merged in PR #23, `1f53f33`; devenv proven in CI". This matches `work/README.md` and `activeContext.md`.
- **N3 is fixed.** In `baseline.md`, the row for run 41342789158 now reads `success`, about 226 s, and so does the caveat. The body no longer contradicts the correction header.
- **L2 is addressed in the evidence.** The README records the feedback-loop cost as a known cost, not a weakening.

## 4. Gates on the `--no-verify` commit

In the archive copy of `ddeffc5`, I ran every command in the `policy` task:

| Command | Result |
| --- | --- |
| `python3 -I scripts/check_repo.py` | rc=0, "Repository checks passed: 24 JSON files, documentation links valid." |
| `bash scripts/test_nav_key.sh` | rc=0 |
| `bash scripts/test_deploy_preflight.sh` | rc=0, "passed without invoking Wrangler" |
| `python3 -I scripts/test_environment_safety.py` | rc=0 |
| `python3 -I scripts/test_d1_migrations.py` | rc=0 |
| `python3 -I scripts/test_d1_restore.py` | rc=0 |
| `shellcheck scripts/*.sh .vite-hooks/pre-commit` (0.11.0) | rc=0 |
| `yaml.safe_load` on both workflow files | ok |

I did not run the devenv-dependent parts of `vp run verify` (`vp check`, typecheck, Effect diagnostics, coverage). `ddeffc5` touches no code or config, so the CI run on `ddeffc5` is the authority for those.

## Round 2 findings (all below medium)

- **R2-L1 (low): the baseline has only n=2, below the contract's n ≥ 5.** The README discloses this. The P2 keep decision does not depend on it, because every P2 sample beats both baseline samples and the 53 s step removal is deterministic. P4 was reverted anyway. Future passes (P1, P3, P5) should not reuse an n=2 baseline for close calls.
- **R2-N1 (nit): P2 was measured only together with P4.** No P2-only sample exists. P4's measured contribution is a net cost of about 4 s, so P2 alone should be at least as fast, and the keep decision stands. A P2-only number on the post-merge `main` push run would close this cleanly.
- **R2-N2 (nit): one explanation is stated as fact without a measurement.** The README says the remaining 20 s of `bun install` "mostly goes to linking packages into `node_modules`". No measurement shows this, so it should be labelled a hypothesis. This matters if P4 is revisited, for example by caching `node_modules`.
- **R2-N3 (nit): the deploy-gating controls do not run the workflow itself.** They exercise the local `vp run deploy` and `vp run deploy-production` gates. The `pr-preview.yml` deploy gating rests on step order, which is unchanged from base and checked structurally in round 1 §3. That is acceptable for this PR. A workflow-level policy assertion is still open as WS-0027 follow-up N5.
- **Round 1 N1 and N2 are moot,** because P4 is reverted.

## Round 2 severity summary

| ID | Severity | Status |
| --- | --- | --- |
| M1 | medium | **Cleared** (evidence README matches the API data) |
| L1, N3 | low, nit | Fixed |
| L2 | low | Recorded in the evidence as a known cost |
| R2-L1 | low | Open, non-blocking |
| R2-N1 to R2-N3 | nit | Open, non-blocking |

**Medium or above remaining: none.** There are no high or critical findings. This round permits auto-merge under the delegation, provided CI is green on `ddeffc5`.
