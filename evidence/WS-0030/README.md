# WS-0030 optimization passes P2 and P4: measurements and controls

Baseline: [baseline.md](baseline.md) (devenv-era verify job 249 s, run 41341703410, n=1; post-merge push run 41342789158 about 226 s; Tests step 53 s; `bun install` 24-27 s). Method: GitHub Actions API jobs data (`started_at`/`completed_at`, 1 s resolution), job `verify` of the `quality` workflow. Not run: P1, P3, P5 (out of scope). Nothing pushed from the `ws30` worktree; commits were cherry-picked to PR #24 (head f6707d5; P2 = c73ffd6, P4 = f6707d5 on the PR branch; local `ws30`: P2 = 904601e, P4 = 27c92fe).

## Samples

Run 41343482438 (`quality`, PR #24, head f6707d5, P2 + P4), attempts 1-6, produced by `POST .../actions/runs/41343482438/rerun` only. The preview workflow was not touched. All six attempts concluded success.

| Attempt | Verify job ID | Wall (s) | devenv install | Cache Bun install (restore) | `bun install` | Verify step | Cache state |
|---|---|---|---|---|---|---|---|
| 1 | 124958249163 | 146 | 37 | 0-1 | 20 | 70 | cold (miss; saved 5 s in post step) |
| 2 | 124958967165 | 206 | 53 | 10 | 27 | 101 | warm |
| 3 | 124959905955 | 170 | 49 | 9 | 19 | 78 | warm |
| 4 | 124960658274 | 194 | 46 | 7 | 22 | 104 | warm |
| 5 | 124961486034 | 185 | 45 | 8 | 21 | 98 | warm |
| 6 | 124962376636 | 170 | 47 | 9 | 19 | 82 | warm |

The Tests step no longer exists in any attempt (baseline 53 s).

## Before / after

| Metric | Baseline (devenv era) | P2+P4, cold (attempt 1) | P2+P4, warm (attempts 2-6) median / p90 | All 6 median / p90 |
|---|---|---|---|---|
| verify job wall | 249 (n=1); 226 (second sample) | 146 | 185 / 201 | 177.5 / 200 |
| Tests step | 53 | removed | removed | removed |
| `bun install` step | 26 (24-27 across jobs) | 20 | 21 / 25 | 20.5 / 24.5 |
| Cache Bun install step (restore) | none | about 1 | 9 / 9.6 | 8.5 / 9.5 |
| `bun install` + restore | 26 | about 21 | 30 | about 29 |
| Verify step | 105 | 70 | 98 / 103 | 90 / 102.5 |

Percentiles use linear interpolation (same as the baseline). The baseline has n=1 or 2 for the devenv era, so its percentiles are not reportable. Per-run variance is large (wall 146-206 s; the devenv install alone ranges 37-53 s and the Verify step 70-104 s), so small differences are within noise.

## Decisions

- **P2 (drop the duplicate test step): KEEP.** Wall time drops from 249 s (and 226 s) to a 177.5 s median (all 6), 185 s warm. The 53 s Tests step is gone. The slowest sample (206 s) is still below the faster baseline sample (226 s). No gate is removed: `verify` ends with the `coverage` task, which runs both Vitest suites with coverage thresholds.
- **P4 (cache Bun install): REVERT (recommend).** Warm `bun install` improves only about 5 s (26 s baseline to a 21 s median) and the `actions/cache` restore step costs 7-10 s (median 9 s), so install plus restore is about 30 s against 26 s before, a net loss of about 4 s. The cold run also pays a 5 s save step. The median does not improve, so per the contract the commit is reverted. The cache cannot affect correctness (`bun install --frozen-lockfile` still runs), so this is purely a speed finding. Bun's own download cache is small and fast to restore from the network mirror; the 20 s mostly goes to linking packages into `node_modules`, which the download cache does not skip.

## L2 (review note)

With the standalone `vp run test` step removed, a failing static gate (policy, `vp check`, types, Effect diagnostics) stops `verify` before the `coverage` task, so test results stay hidden until the static failure is fixed. This is a feedback-loop cost only. It is not a gate weakening: every gate still runs in `verify`, and the PR fails for any of them. Attribution is by `vp run` task name in the log; the `Verify` step comment in `quality.yml` documents it.

## Negative controls

All run locally on the `ws30` worktree (HEAD contains both pass commits; the workflow commits change no test or task config, so one set of controls applies to both passes). Environment: `nix shell nixpkgs#shellcheck` on PATH (so `vp run verify` runs fully), `DEVENV_ROOT=/x`, and a stub `wrangler` first on PATH that answers `--version` and exits 99 for anything else. No Cloudflare credentials were set. Clean control: `vp run verify` with no plant: rc=0, `18/18 successful`. Plants were untracked scratch files or a one-line edit, removed afterwards (`git status` clean).

| # | Plant | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | failing unit test `packages/zz-plant.test.ts` | `vp run verify` | 1 | `FAIL packages/zz-plant.test.ts > planted` |
| 2 | failing workerd test `apps/worker/src/db/repositories/zzplant.test.ts` | `vp run verify` | 1 | `FAIL ... zzplant.test.ts > planted` |
| 3 | policy violation: `"ENVIRONMENT": "local"` changed in `scripts/test_environment_safety.py` | `vp run verify` | 1 | `AssertionError` |
| 4 | unit plant | `vp run deploy` | 1 | fails in verify; `scripts/deploy.sh` never mentioned in the log |
| 5 | unit plant | `vp run deploy-production` | 1 | same |
| 6 | workerd plant | `vp run deploy` | 1 | same |
| 7 | workerd plant | `vp run deploy-production` | 1 | same |
| 8 | policy plant | `vp run deploy` | 1 | same |

The stub `wrangler` log held only `--version` lines (9 in total: one per run, 1 clean run plus 8 controls); no other invocation was recorded, and `scripts/deploy.sh` did not start in any control (0 log mentions). Earlier, before the nix shell was available, controls 1-3 were also run as bare suite commands (rc=1 each), which agrees with these.
