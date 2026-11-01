# Review: PR #25 (head 67e9588, base main 085b57d)

Verdict: no finding at medium or above. Nothing blocks auto-merge on correctness or security grounds. Speed merit is out of scope (separate measurement).
Read-only. Checked a `git archive` of 67e9588 in /tmp/pr25 and cachix-action cloned in /tmp/cx/src.

## 1. Pin
- `git ls-remote` shows `refs/tags/v16` = 97e5ff84d02b3b4f9936339f767e17f03c9252ed. `v16^{}` = 3ba601ff5bbb07c7220846facfa2cd81eeee15a1.
- So the pinned SHA is the v16 annotated tag object, not the commit. `git cat-file -t 97e5ff8` returns `tag`.
- This is unchanged from base (the `uses:` line is not in the diff), so it already resolves in the existing CI. See finding N1.

## 2. Inputs
At the pinned SHA (checked out via 3ba601f, which is the tag target), `action.yml` declares both:
- `extraPullNames`: "Comma-separated list of additional Cachix cache names to pull".
- `authToken`: "required for private cache access or to push to any cache".
- `dist/index.js` splits `extraPullNames` on commas and runs `cachix use <name>` for each, so `devenv` stays a pull source.
- `name: phibkro` is used with `cachix use` and is the push target.

## 3. Security
- Secret reference: `CACHIX_AUTH_TOKEN` appears only as `${{ secrets.CACHIX_AUTH_TOKEN }}`, as a `with:` input (3 places, 3 jobs). It is not used in `run:`, `env:` or an echo.
- Empty token (fork PRs): `dist/index.js` runs `cachix authtoken` only if `authToken !== ""`. With no token, `hasPushTokens` is false, push mode is None, and the post step logs "Missing a Cachix auth token..." and returns without failing. The workflow comment is accurate. Fork PRs also get an empty `secrets.*` value, not an error. Dependabot PRs behave the same.
- `pull_request_target`: absent. Triggers are `pull_request` and `push: main` (quality), and `pull_request` (pr-preview). `permissions: contents: read` is kept.
- Fork PRs in pr-preview: the deploy and destroy jobs are already gated on `head.repo.full_name == github.repository`.
- Cache poisoning: the token is available only to same-repo PR branches (writers) and to pushes on main. Fork PRs cannot push. See finding L1.

## 4. Gates
- quality.yml: Verify is still the final step. pr-preview.yml: `vp run verify` still precedes "Deploy isolated seeded preview".
- No `continue-on-error` and no `pull_request_target` anywhere in `.github/`. The diff touches only the cachix step.

## 5. Docs
- `python3 -I scripts/check_repo.py` on the archive: "Repository checks passed: 24 JSON files, documentation links valid." rc=0.
- The AGENTS.md squash-only note and the evidence/WS-0030 additions (README banner, review-pr24.md) contain no credentials. grep for token/secret hits only dependency-cache discussion.

## Findings
- **L1 (low): same-repo PR branches can push to `phibkro`.**
  - A PR branch from a write-access author runs `quality` with the real token. Its Nix store paths are pushed to a cache that main CI and anyone running `cachix use phibkro` will trust.
  - Needs repo write access, so the trust boundary is the same as merging. The pr-preview job already exposes the Cloudflare token to same-repo PR code the same way.
  - Optional hardening: add `skipPush: ${{ github.event_name != 'push' }}` so only main pushes. That would reduce the speed benefit for PR runs, so it is an owner trade-off, not a requirement.
  - Related: the token is also in the `quality` job, which has no environment gate. The PR code can read `~/.config/cachix`. Same trust boundary as above.
- **N1 (nit, pre-existing): the pin is the tag object SHA.** It works today, but Dependabot and pin auditors usually expect the commit SHA `3ba601ff5bbb07c7220846facfa2cd81eeee15a1`. Not introduced by this PR.
- **N2 (nit): the three-line comment is duplicated in 3 jobs.** Harmless.

## Medium-or-above exists?
**No.** Highest severity is low.

---

# Round 2 (head 910eee3)

Read-only. Archive of 910eee3 in /tmp/pr25b; GET-only `gh api` calls; no change to the main checkout.

Round-1 findings L1/N1/N2 concerned the P1 workflow change, which this head removes, so they no longer apply.

## 1. Workflows back to main
- `git diff 085b57d 910eee3 -- .github/` is empty (0 lines).
- The branch is 67e9588 followed by `Revert "ci(ws-0030): P1 ..."`. The whole PR diff vs main touches only `AGENTS.md`, `evidence/WS-0030/README.md` and `evidence/WS-0030/review-pr24.md`.
- No `CACHIX_AUTH_TOKEN` reference and no `phibkro` cache config remain in the workflows.

## 2. Evidence claims vs run data
Recomputed from job and step timestamps, all matching the README table:
- Attempts 1-5 of run 41347235956 (job IDs match the README): wall 187/146/145/148/165 s; devenv install 48/40/38/41/46 s; Verify 102/71/75/75/83 s; Cachix post step 1/2/2/2/2 s. All five concluded `success`.
- P2-only comparison samples: job 124967243883 (run 41346471745) = 181 s; job 124969005495 (run 41347044335) = 138 s. Both match.
- Attempt 1 log: 7 `Pushing` and 7 `Pushed /nix/store/...` lines, and 604 `Skipping /nix/store/...` lines. This matches "7 pushed, 604 skipped". The pushed paths are the small devenv derivations (files-cleanup, container-copy, tasks.json, enterShell, shell, profile, env).
- 0 `copying path ... phibkro` lines in attempt 1. Attempt 2 shows 0 pushes and 0 phibkro fetches. This supports "nothing reused".
- Medians: P1 warm (146,145,148,165) = 147, matching the README; P2-only median of 181 and 138 = 159.5.
- Not independently checked: `bun install` seconds and the "68 paths / 139.6 MiB" figure.
- The "read from source, not exercised on a fork PR" caveat is honest. It agrees with my round-1 reading of `dist/index.js`.
- The revert rationale holds: n=2 baseline with a 43 s spread; the difference sits in the Verify step, not in the cache-affected install step.

## 3. Docs gate
`python3 -I scripts/check_repo.py` in the archive: "Repository checks passed: 24 JSON files, documentation links valid." rc=0.

## Findings
- **N3 (nit):** The README line "Not run: P1, P3, P5 (out of scope)" in the P2/P4 section is now stale next to the new P1 section. This is cosmetic; a pointer sentence would fix it.
- No security concern: the diff is docs only, and the evidence adds no credentials (only run and job IDs, store path names and timings).

## Medium-or-above (round 2)?
**No.** The only finding is a nit. No gate, workflow or secret change remains.

---

# Round 3 (head 6c52f92; delta from 910eee3 = e118548 + 6c52f92)

Read-only. Archive in /tmp/pr25c; plants applied to a scratch copy (/tmp/pl) only.

## Delta
- e118548: README wording only. Fixes the stale "Not run: P1" line (round-2 N3 resolved).
- 6c52f92: a fork-safety loop appended to `scripts/test_environment_safety.py`. It is wired into the gate via `vite.config.ts:112` (`python3 scripts/test_environment_safety.py`), so it runs in `vp run verify`.

## 1. Not vacuous
On the clean tree the script exits 0 ("Environment-safety checks passed"). Planted changes in `quality.yml`:
- `pull_request_target` as a trigger: rc=1, "pull_request_target is forbidden".
- `runs-on: self-hosted`: rc=1, "self-hosted runners are forbidden".
- `runs-on: my-box` (custom label): rc=1, "must be a GitHub-hosted label".
- Also rc=1: array `[ubuntu-latest, linux-big]`, expression `${{ matrix.os }}`, quoted `"my-box"`, `group:` form, trailing `# comment`, and `[Self-Hosted]`. The last is caught by the label regex even though it differs in case.
- A new `x.yaml` file with a bad runner: rc=1. The `*.y*ml` glob covers both extensions.

## 2. No regressions
- Full script on clean tree: rc=0.
- `python3 -I scripts/check_repo.py`: "Repository checks passed: 24 JSON files, documentation links valid." rc=0.

## 3. Evasions the check misses
- **Low (L2): `runs-on` label matching `(ubuntu|windows|macos)-[\w.-]+` but not GitHub-hosted** (e.g. `ubuntu-evil-box`, a self-hosted runner with a crafted label). Planted: rc=0, not caught. It also cannot tell GitHub larger-runner labels apart from self-hosted ones. Needs a reviewed workflow edit and a registered self-hosted runner; mitigate with repo-level runner-group settings (no self-hosted runners registered / fork PR approval). Acceptable.
- **Low (L3): reusable workflow `uses:` outside the repo.** A job with `uses: evil/repo/.github/workflows/x.yml@main` has no `runs-on`; planted: rc=0. The check does not restrict `uses:` sources. The called workflow's runners are not covered. Needs a reviewed workflow edit. Currently all `uses:` are actions/* or cachix/*, SHA-pinned. Acceptable for a public repo, but an allowlist assertion on `uses:` would close it.
- **Low (L4): other secret-bearing triggers, e.g. `workflow_run`.** Planted `workflow_run`: rc=0. It runs in the base-repo context and can have secrets. Needs a reviewed workflow edit. Could be added to the forbidden list.
- **Nit (N4): substring match.** The `self-hosted` and `pull_request_target` checks match anywhere in the file, including comments. A comment mentioning either would fail the script (false positive, safe direction). Dynamic expressions like `${{ matrix.os }}` fail closed, which is the right direction.
- Matrix-driven runners fail closed (rc=1 on the expression). Any matrix would need a different check, a deliberate edit.
- All of the above need a reviewed edit to `.github/workflows/*` on a public repo, and the check lives in a gate that PR code could also edit, so it is a tripwire, not a boundary.

## Medium-or-above (round 3)?
**No.** Highest severity is low (L2, L3, L4).
