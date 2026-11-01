# WorkScope: CI benchmark and measured optimization passes

- ID: WS-0030
- Revision: 1
- Status: **Approved** (owner decision 2026-11-01). It can run alongside the tracers; their PR runs add baseline samples.
- Owner: Human product owner (phibkro)
- Risk tier: **R1–R2**: CI configuration only. No gate may be weakened.
- Roles: implementer at the `general` tier; reviewer at the `complex-reasoning` tier (gate-weakening risk).
- Attempt budget: 2 per pass

## Owner decisions

- **Measure first.** Custom runners are decided only from this ticket's data.
- **GitHub-hosted runners only for now.** The repo is **public**, so a fork PR can execute code on a self-hosted runner. Your workstation will hold the production decryption key (WS-0028), and Cloudflare Containers top out at 4 vCPU / 12 GiB / 20 GB with no documented runner integration. The fast local loop is `vp run verify` on the workstation.

## Method (eval loop)

1. **Baseline:** per-job and per-step wall time for `quality.yml` (verify) and `pr-preview.yml` (deploy), median and p90 over ≥ 5 runs, from the GitHub Actions API, with run IDs recorded. Report cache hit rates (Cachix, `vp run`).
2. **Passes, one change each, re-measured with the same method:**
   - P1: enable Cachix push (needs an owner-provided `CACHIX_AUTH_TOKEN`; the PR #23 log shows "Pushing is disabled");
   - P2: drop the duplicate test run (WS-0027 review N6);
   - P3: split static gates and the two test suites into parallel jobs;
   - P4: cache Bun install and Vitest;
   - P5: `vp run` affected-only for PRs, **only** for tasks whose cache is proven correct (WS-0027 found stale replays for Bun-run tasks; those stay uncached).
3. **Keep a pass only if** the median improves **and** the gates still catch planted failures. Re-run at least 3 negative controls per pass, including one deploy-gating one.
4. Stop when the owner's target is met, or the passes are exhausted. The target is proposed from the baseline, never invented beforehand.

## Acceptance

- [ ] The baseline and every pass are recorded with run IDs, medians and p90s in `evidence/WS-0030/README.md`.
- [ ] No gate is weakened: verify still runs the same 18 tasks (or a documented equivalent split), and the controls still fail.
- [ ] Each kept pass is a separate commit, so it can be reverted independently.

## Follow-ups folded in (low/nit, from the WS-0027 reviews)

- D1 (low): `test_environment_safety.py` guard check is substring-only (`|| true` bypasses it). Make it execute the guard with `DEVENV_ROOT` unset and set.
- D3: the guard message names `deploy` for `deploy-production`.
- N3: unused `oxfmt`/`oxlint` devDependencies.
- N4/N5: policy test coverage of every verify gate, and that `pr-preview.yml` runs verify before deploy.
