# WorkScope: Upgrade Effect to 4.1.0 together with foldkit 0.170.0

- ID: WS-0021
- Revision: 2
- Status: **Approved** (owner gate 2026-11-01, after r1's stop report)
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: dependency changes across worker, domain and web. Requires plan review, independent review, a rollback plan and provenance, plus the human gates `scope` and `acceptance_or_integration`.
- Repository/ref: `phibkro/job-application-assistant`, branch `claude/clever-heisenberg-lwui1b`. The implementer pins the starting commit.
- Roles: implementer and independent reviewer both work at the `complex-reasoning` tier.
- Attempt budget: 2
- Supersedes: [WS-0021@1](WS-0021-r1-effect-4-1-upgrade.md)

## Why r2

r1's trial (patch archived as `evidence/WS-0021/r1-trial.patch`) showed three things:
1. 4.1.0 moves every `effect/unstable/*` module to a stable path. This is an import-only change across 43 files, and typecheck reaches 0 errors after it.
2. `apps/web` pins `foldkit@0.139.0` / `@foldkit/ui@0.139.0`. These call `SchemaTransformation.transformOrFail`, which 4.1.0 removes, so 7 web test files fail to load.
3. The first foldkit release that declares `effect ~4.1.0` is 0.170.0, which also requires `@effect/platform-browser ~4.1.0`. Upgrading foldkit first is impossible, because 0.165 to 0.169 require exactly 4.0.0.

## Owner decisions in this revision

- **D-21a:** Effect and foldkit move together in one change.
- **D-21b:** The WS-0020 characterization test may change **import specifiers only**. Every assertion must stay byte-identical, and the reviewer verifies that the file's diff touches import lines only.
- **D-21c:** `infra/` (its own `effect` / `@effect/platform-bun` / `@effect/platform-node` rc.108 pins and lockfile) stays out of scope. The split is recorded and gets a separate follow-up ticket, because it touches the deploy path, which can't be exercised without credentials.

## Acceptance criteria

- [ ] `effect` is exactly `4.1.0` in the root and `packages/better-auth-effect-adapter` manifests. `foldkit` and `@foldkit/ui` are exactly `0.170.0`, and `@effect/platform-browser` is added at the version 0.170.0 requires. `bun.lock` is regenerated. Any other forced change is listed with its reason.
- [ ] The `effect/unstable/*` → stable-path rename, plus the **minimum** foldkit API adaptations in `apps/web`. Each adaptation is listed with old → new and a citation to the installed foldkit 0.170.0 source or changelog.
- [ ] `bun run check` passes, including both coverage runs. Before/after counts are recorded against the r1 baseline at `5bb6f71`: Bun 88/807/4 skipped, workerd 22/109.
- [ ] `navToClient.live.test.ts` passes with an import-only diff (D-21b).
- [ ] Any test assertion change anywhere is listed with its justification and **blocks acceptance** unless the owner accepts it.
- [ ] `bun run e2e` (Playwright + Axe, 4 specs) passes against the local preview, with before and after results. If the browser environment can't run it, record exactly why; that becomes an open gate, not a pass.
- [ ] Visible UI behaviour drift caused by foldkit is reported, not silently fixed.
- [ ] `python3 scripts/check_repo.py` passes. `memory-bank/techContext.md` and `activeContext.md` state the new pins and the infra split.
- [ ] Evidence is in `evidence/WS-0021/README.md`.

## Exclusions

No behaviour, schema, migration, route, canonical-ID or `infra/` changes. No adoption of new Effect or foldkit features beyond what compilation and the current UI require. No unrelated dependency upgrades.

## Constraints

- Rollback is reverting the single commit.
- Stop and report on any semantic change visible in a test, or on foldkit API drift that would need more than mechanical adaptation.
- Known flaky test: `drafting/studio/keys.test.ts` (G14). Rerun it once and record the result; don't fix it.
- No credentials, deploys or external sources beyond the package registry.
