# WorkScope: effect ~4.1 for the back end, with the Foldkit app frozen as a legacy island

- ID: WS-0021
- Revision: 3
- Status: **Approved** (owner decisions 2026-11-01: pin `effect ~4.1`; Astro + islands is the target frontend; freeze the Foldkit app as a legacy island)
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: dependency changes plus a workspace restructure. Requires plan review, independent review, a rollback plan and provenance, plus the human gates `scope` and `acceptance_or_integration`.
- Repository/ref: `phibkro/job-application-assistant`. The implementer pins the starting commit.
- Roles: implementer and independent reviewer both work at the `complex-reasoning` tier.
- Attempt budget: 2
- Supersedes: [WS-0021@2](WS-0021-r2-effect-4-1-and-foldkit.md), [WS-0021@1](WS-0021-r1-effect-4-1-upgrade.md)
- Prior evidence: `evidence/WS-0021/r1-trial.patch` (the import rename) and `evidence/WS-0021/r2-attempt1/` (baseline e2e 4/4 and screenshots)

## Goal

Move the back end (`apps/worker`, `packages/*`) to `effect ~4.1` **without** migrating or removing the Foldkit web app. The app keeps serving the personal features until it retires (RFC 0016 A1/A3). A2 still applies: independent refresh must exist before any personal route is retired.

## Design (decided)

1. **Legacy island.** `apps/web` leaves the root Bun workspace and becomes its own package root with its own lockfile, pinned at `effect@4.0.0-rc.108`, `foldkit@0.139.0`, `@foldkit/ui@0.139.0`. Existing behavior is unchanged.
2. **Vendored domain.** `apps/web` uses a **vendored, read-only copy** of `packages/domain` taken at the pinned start commit, placed under `apps/web/vendor/domain/`. A `PROVENANCE.md` records the source path, commit and the reason, following the owner's convention for copied code. The domain types used by the web are wire-compatible with the unchanged API. There is no automated sync; the copy is frozen.
3. **Back-end upgrade.** The root workspace (worker, domain, adapters, `better-auth-effect-adapter`) moves to `effect ~4.1` (resolved version recorded), using the r1 import rename (`effect/unstable/*` → stable paths). `infra/` stays on rc.108 (D-21c).
4. **Build glue.** Preview, bundle and deploy scripts build the web from its own package root, so the Worker still serves the same static assets.

## Acceptance criteria

- [ ] The root workspace resolves `effect` ~4.1, with the exact resolved version recorded; `apps/web` resolves rc.108 + foldkit 0.139.0 from its own lockfile. No other dependency changes unless forced, each listed with its reason.
- [ ] `apps/web/vendor/domain/` is a byte-identical copy of `packages/domain/src` at the start commit (verified by a hash list in evidence). `PROVENANCE.md` exists.
- [ ] `bun run check` passes for the root workspace, including Bun + workerd coverage, with counts recorded against the baseline (Bun 88/807/4 skipped; workerd 22/109). Web tests move with the web package. They run there and pass unchanged, and their counts are recorded (r2 baseline: 7 web test files loaded under rc.108).
- [ ] `navToClient.live.test.ts`: import-specifier-only diff (D-21b).
- [ ] No test assertion changes anywhere; any change blocks acceptance.
- [ ] `bun run e2e` passes 4/4 before and after, and screenshots of the same six screens show no visible drift (compare with `evidence/WS-0021/r2-attempt1/shots-before/`).
- [ ] `python3 scripts/check_repo.py` passes. `memory-bank/techContext.md` and `activeContext.md` record the back-end pin, the frozen web island and the infra split.
- [ ] Evidence is in `evidence/WS-0021/README.md`.

## Exclusions

No behaviour, schema, migration, route, canonical-ID or `infra/` changes. No Astro work (a separate WorkScope). No foldkit upgrade. No deletion of web features.

## Rollback

Revert the single commit; the lockfiles and the vendored copy move with it.

## Revisions

### 2026-11-01: A1, vendor the worker API contract (owner decision)

Execution stopped before any edit. `apps/web` also imports `apps/worker/src/Api.ts` from 15 files, which the original design missed. Owner decision:

- Copy `apps/worker/src/Api.ts` **byte-identically** at the start commit to `apps/web/vendor/worker-api/Api.ts` (with `PROVENANCE.md`).
- Lay out the vendored domain as `apps/web/vendor/domain/src/` (byte-identical) plus a copied `package.json`. The web resolves `@job-index/domain` to it (e.g. `"@job-index/domain": "file:./vendor/domain"`), so the vendored `Api.ts` needs no edits.
- **D-21b extended:** import-specifier-only edits are allowed in the 15 web files that import `Api.ts`, including the test `apps/web/src/saved/update.test.ts`. Every assertion stays byte-identical, and the reviewer verifies that those diffs touch import lines only.
- Web tests move to the web package's own runner (the root `vitest.config.ts` excludes `apps/web`). Use the same `vitest` version as the root (4.1.10) in the web lockfile.
- The hash list in evidence covers both vendored trees.
