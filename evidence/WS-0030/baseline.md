> Correction (lead, 2026-11-01 19:43Z): run 41342789158 (push, main 1f53f33) was not stuck. It completed **success** at 19:42:45Z (verify job started 19:38:59Z, about 226 s). It is the second devenv-era verify sample.

# WS-0030 step 1: CI baseline (measurement only)

Source: GitHub Actions API for `phibkro/job-application-assistant` via `gh api` (read-only; works through the proxy), collected 2026-11-01. No workflow edits, re-runs or pushes. Durations are seconds from jobs-API `started_at`/`completed_at` (1 s resolution). Raw job JSON and logs were fetched to `/tmp/job_<run>.json` and `/tmp/log_<job>.txt` (ephemeral).

## Headline finding: the sample count is below the contract's n >= 5

| Era | verify (`quality.yml`) complete runs | deploy (`pr-preview.yml`) complete runs |
|---|---|---|
| devenv (merge 1f53f33, PR #23) | **1** | **1** |
| pre-devenv (PR #22) | 3 (2 PR + 1 push) | 1 success (+1 failure at the verify step) |

Median/p90 are therefore **not reportable** for the devenv era (needs >= 3). Every value is listed below instead. The only devenv-era runs that exist are on head 3a657b1 (PR #23 had no other CI runs) plus the post-merge runs on 1f53f33. More samples must come from future PR runs (the tracers), as the contract anticipates.

## Run inventory

Devenv era (workflow files as at 3a657b1: Cachix + `nix profile add github:cachix/devenv/b904dcb`):

| Run ID | Workflow | Event / ref | SHA | Conclusion | Note |
|---|---|---|---|---|---|
| 41341703410 | quality | pull_request (PR #23) | 3a657b1 | success | verify job 124952916179 |
| 41341703440 | pull request preview | pull_request (PR #23) | 3a657b1 | success | deploy job 124952916393; destroy skipped |
| 41342789799 | pull request preview | pull_request (PR #23 closed/merged) | 3a657b1 | success | destroy job 124956164796 ran (109 s); deploy skipped |
| 41342789158 | quality | push main (merge 1f53f33) | 1f53f33 | **no conclusion** | still `in_progress` when queried; `updated_at` 19:38:59Z, verify job stuck at step 8 "Tests", steps 1-7 done. Excluded from stats; reported as an anomaly (stale or hung run, not investigated, cannot re-run per rules). |

Pre-devenv (PR #22, `./bootstrap verify` + DeterminateSystems nix action):

| Run ID | Workflow | Event / ref | SHA | Conclusion |
|---|---|---|---|---|
| 41334586479 | quality | pull_request | 0771ed7 | success |
| 41335160325 | quality | pull_request | de43477 | success |
| 41335530366 | quality | push main (merge 7b850d7) | 7b850d7 | success |
| 41334586518 | pull request preview | pull_request | 0771ed7 | failure (`bootstrap verify` failed at 33 s; deploy skipped) |
| 41335160272 | pull request preview | pull_request | de43477 | success (deploy job) |
| 41335530294 | pull request preview | pull_request (closed) | de43477 | success (destroy only) |
| 41335532769 | pull request preview | pull_request (closed), branch `proposal/read-only-norwegian-market-index-2026-11` | a41b2ef | success (destroy only; PR merge-time event for a different PR branch, listed for completeness) |

Not collected: runs from 2026-08 (branches `chore/effect-4-rc`, `ci/prove-pr-preview`, agent candidates) and 2026-11-01 `proposal/...` runs that predate PR #22 (15:35-15:47Z, mostly failures/cancelled). They are neither devenv era nor PR #22. The repo has 128 runs total (page 1 of 100 and page 2 reviewed for the inventory).

## Job wall time

### verify job (`quality.yml`)

| Era | Run ID | Wall (s) | Queue (created -> started) |
|---|---|---|---|
| devenv | 41341703410 | **249** | 2 |
| pre-devenv | 41334586479 | 98 | 2 |
| pre-devenv | 41335160325 | 105 | 2 |
| pre-devenv | 41335530366 (push) | 115 | 3 |

- devenv: n=1, not enough samples. Value 249 s.
- pre-devenv: n=3, median **105 s**, p90 **113 s** (linear interpolation; nearest-rank gives 115).
- Observation (not a conclusion, n=1): devenv verify is about 2.4x slower than the PR #22 `./bootstrap verify` job. Contributing causes visible in steps: duplicated test execution and the 49 s devenv install (below).

### deploy job (`pr-preview.yml`)

| Era | Run ID | Wall (s) | Result |
|---|---|---|---|
| devenv | 41341703440 | **218** | success (includes verify + 42 s deploy step) |
| pre-devenv | 41335160272 | 167 | success |
| pre-devenv | 41334586518 | 77 | failure (verify step failed at 33 s) |

- devenv: n=1, not enough samples. pre-devenv success: n=1, not enough samples (the 77 s failure is not comparable).
- destroy job (supporting data): devenv 41342789799 = 109 s; pre-devenv 41335530294 = 47 s, 41335532769 = 41 s (n=2 pre, n=1 devenv).
- Whole-run wall (queue to completion, from run `updated_at`): quality 41341703410 = 250 s; preview 41341703440 = 222 s. The two workflows run in parallel (no `needs` between them), so PR feedback latency is the max, about 250 s, but compute is doubled because the deploy job runs `vp run verify` again.

## Per-step durations (seconds)

### devenv verify job, run 41341703410 (wall 249)

| Step | s |
|---|---|
| Set up job | 1 |
| checkout | 1 |
| cachix/install-nix-action | 4 |
| cachix/cachix-action | 3 |
| **Install pinned devenv CLI** (`nix profile add github:cachix/devenv/b904dcb...`) | **49** |
| Install workspace dependencies (`bun install --frozen-lockfile`) | 26 |
| Vite+ static checks (`vp check`) | 1 |
| **Tests (both Vitest 4 suites)** (`vp run test`) | **53** |
| **Verify** (`vp run verify`) | **105** |
| Post/Complete | 1 |

Sum of steps is about 244 s; the rest is runner overhead. Steps in the incomplete run 41342789158 for corroboration: devenv install 42, bun install 22, vp check 2.

### devenv deploy job, run 41341703440 (wall 218)

| Step | s |
|---|---|
| Set up / checkout | 2 |
| install-nix-action | 4 |
| cachix-action | 2 |
| Install pinned devenv CLI | 44 |
| `bun install --frozen-lockfile` | 24 |
| `vp run setup` | 12 |
| `vp run verify` | 84 |
| Deploy isolated seeded preview | 42 |

### devenv destroy job, run 41342789799 (wall 109)

devenv install 47, bun install 27, `vp run setup` 14, destroy script 11, nix/cachix actions 6.

### pre-devenv verify jobs (steps: Set up 1-2, checkout 1-2, determinate-nix-action, `./bootstrap verify`)

| Run | nix action | `./bootstrap verify` | wall |
|---|---|---|---|
| 41334586479 | 6 | 84 | 98 |
| 41335160325 | 7 | 90 | 105 |
| 41335530366 | 11 | 96 | 115 |

Median `./bootstrap verify` step: 90 s (n=3).

### pre-devenv deploy job

| Run | nix action | `./bootstrap setup` | `./bootstrap verify` | Deploy |
|---|---|---|---|---|
| 41335160272 (success, wall 167) | 9 | 28 | 80 | 46 |
| 41334586518 (failure, wall 77) | 9 | 29 | 33 (failed) | skipped |

### Inside `vp run verify` (from the log of run 41341703410, task start timestamps)

18 tasks, all with `cache disabled` or no cache; summary line `vp run: 0/1 cache hit (0%), 18/18 successful`.

| Phase | s (approx., from log timestamps) |
|---|---|
| setup/config/policy/shell/pytest-style scripts, shellcheck, `vp check` | about 12 (19:28:27 to 19:28:40) |
| `tsc --noEmit` | about 6 |
| `effect-diagnostics.ts` | **27** (19:28:46.6 to 19:29:14.1) |
| schema + catalog + worker bundle | under 1 |
| Vitest unit suite (`--coverage`, Bun-hosted) | **14.5** (19:29:14.5 to 19:29:29.0); in-tool duration 11.4 s |
| Vitest workers pool (`--coverage`, workerd) | **43** (19:29:29.0 to 19:30:11.9); in-tool duration 38.0 s, setup 76 s cumulative |

The same phases in the deploy job (run 41341703440, `vp run verify` = 84 s): effect diagnostics 22.8 s, unit vitest 12.8 s, workers vitest started 19:28:25.2. Unit and worker suites are sequential. The "Tests" step (53 s) re-runs these same two suites: the log of 41341703410 shows `Test Files 80 passed (80)` twice and `22 passed (22)` twice, `Duration` lines twice for each suite (41.0/38.0 s workers, 13.9/11.4 s unit).

## Cache signals (from job logs)

| Job (run) | Cachix lines | Nix store fetches | `vp run` cache |
|---|---|---|---|
| verify 124952916179 (41341703410) | "Cachix: using cache devenv"; **`Pushing is disabled.`** (post step, `##[group]Cachix: push`) | 68 paths to fetch (139.6 MiB download, 391.5 MiB unpacked); 78 `copying path` lines: 13 from `devenv.cachix.org`, 65 from `cache.nixos.org`, 0 other; 3 local `building ... user-environment.drv` (profile generation only, no real builds) | `vp run: 0/1 cache hit (0%), 18/18 successful` (verify); `vp run: 2/2 successful` (test) |
| deploy 124952916393 (41341703440) | same; `Pushing is disabled.` | identical (68 paths, 13 devenv / 65 nixos) | `0/1 cache hit (0%), 18/18 successful` |
| destroy 124956164796 (41342789799) | same; `Pushing is disabled.` | identical | `2/2 successful` |
| pre-devenv verify 124931590226 (41334586479), 124934436326 (41335530366) | none (no Cachix in PR #22 workflows) | 66 paths to fetch (74.6 MiB download, 257.1 MiB unpacked); 244 `copying path` lines, all from `cache.nixos.org`; 1 `building nix-shell-env.drv` | no `vp run` summary (bootstrap/just era) |
| pre-devenv deploy 124933322205 (41335160272) | none; `Cache hit for: determinatesystem-nix-installer-x86_64-linux-714b...` (installer cache) | same 66 paths | none |

Reading: every devenv-era job fetches the same 68 store paths from public caches on every run; nothing project-specific has ever been pushed (`Pushing is disabled`), and `vp run` always reports 0% hits because each runner starts with no `vp` cache and the Bun-run tasks are deliberately uncached (`cache disabled` on 17 of the 18 tasks in the log; `tsc --noEmit` is the one task shown without the marker).

## Top 3 time sinks (devenv-era verify job, 41341703410; deploy job mirrors them)

1. **`vp run verify` / Verify step: 105 s (verify job), 84 s (deploy job).** Largest single block. Composition: workers-pool Vitest 43 s, effect diagnostics 27 s, unit Vitest 14.5 s, tsc 6 s, rest about 12 s, all strictly sequential on one 4-core runner.
   - Maps to **P3** (split static gates, unit suite, workers suite into parallel jobs; critical path would fall from about 105 s toward the workers suite, 43 s, plus per-job install overhead of about 80 s, so net gain depends on install cost, which is why P1/P4 matter). Secondary **P5** (affected-only), only for tasks with proven-correct caching; since 17 of 18 tasks are uncached by design, the potential is small until their cache correctness is established. Hypothesis: parallelising pays off only if per-job setup (devenv install 49 s + bun 26 s) is brought down first; otherwise it makes total compute and wall worse.
2. **Tests step: 53 s, pure duplication.** `vp run test` runs both Vitest suites, then `vp run verify` runs both again with `--coverage` (log shows each suite's result twice). Maps to **P2** (drop duplicate test run, WS-0027 review N6). Hypothesis: removing the standalone Tests step saves about 53 s of 249 s (about 21%) with no gate loss, because verify already executes both suites with coverage gates. This is the cheapest, safest pass. (Consideration for P2: keep failures attributable by step name, or document it.)
3. **Install pinned devenv CLI: 49 s (44-47 s in the other jobs; 4 jobs, 42-49 s range).** `nix profile add github:cachix/devenv/<sha>` unpacks the flake and fetches 68 paths (139.6 MiB). It is paid by every job (verify, deploy, destroy), and by every future split job under P3. Maps to **P1** (Cachix push), with a caveat: the logs show only 13 of 78 copied paths come from `devenv.cachix.org` and 65 from `cache.nixos.org`; these are already served from binary caches, so P1 (pushing project closures) may save less than assumed unless the devenv build output itself is what is slow (flake input fetching, `Downloading ...tarball` from api.github.com took 0.4-2.3 s each, store unpack/eval time is unmeasured). The P1 hypothesis must therefore be tested on a run, not assumed. A possible cheaper variant outside P1-P5 as written (a prebuilt/cached devenv binary or caching `/nix/store` via an action) should be flagged to the owner rather than assumed in scope.

Runner-up: **`bun install --frozen-lockfile`: 26 s** (24-27 s across jobs), maps to **P4** (cache Bun install). Deploy step 42 s is inherent work and is not an optimisation target.

Additional structural finding for P3/P2: the deploy job (`pr-preview.yml`) repeats `bun install`, `vp run setup` (12 s) and the whole `vp run verify` (84 s), so each PR commit pays for verify twice in parallel (compute doubled, wall unaffected). Not a contract pass; relevant to "no gate may be weakened" since deploy gating depends on that second verify (the contract's N5 policy coverage item).

## Caveats and gaps

- n=1 per devenv job: one run cannot show variance; pre-devenv n=3 only. The contract wants >= 5 runs; more samples need to come from upcoming PRs (no re-runs permitted in this step).
- Run 41342789158 (push on 1f53f33) was `in_progress` with no conclusion; it may be stuck. Re-query later; if it completes it adds one verify sample, otherwise report it to the owner.
- Step durations are 1 s granularity and exclude queue time (2-3 s on all jobs).
- PR #22 and #23 numbers are one workflow-set apart (nix action, bootstrap vs devenv); they are not like-for-like in the tooling and also differ in lockfile/test contents, so the 105 s vs 249 s comparison is indicative only.
- Log-derived sub-step timings (`vp run verify` phase table) come from task-start timestamps in the single verify-job log and the deploy-job log; no logs were pulled for other runs.
