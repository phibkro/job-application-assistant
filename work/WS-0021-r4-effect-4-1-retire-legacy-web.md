# WorkScope: effect ~4.1 for the whole workspace, retiring the legacy Foldkit UI

- ID: WS-0021
- Revision: 4
- Status: **Approved** (owner decisions 2026-11-01: pin `effect ~4.1`; retire `apps/web`; the new client is `apps/index-web` on Foldkit 0.170, a separate ticket)
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: a dependency change, a feature-UI removal (authorized), and a static-asset configuration change. Requires an independent review and the human gates.
- Repository/ref: start from designated branch HEAD `35e93e1` (the last commit containing `apps/web`). Work in a separate worktree on local branch `ws21-r4`.
- Roles: implementer and independent reviewer at the `complex-reasoning` tier.
- Attempt budget: 2
- Supersedes: [WS-0021@3](WS-0021-r3-effect-4-1-legacy-web-freeze.md) and earlier. Reuses r3's back-end hunk from `5bf0e41` (local branch `ws21-r3`): root pins, the `effect/unstable/*` → stable import rename, the adapter peer dependency. **Not** the web island, the vendored copies or the web build glue.

## Scope

1. **Back-end upgrade:** the root workspace moves to `effect ~4.1` (record the resolved version) with r3's import rename. `infra/` stays on rc.108 (D-21c).
2. **Retire the legacy UI:** delete `apps/web/` entirely, and delete the four e2e specs that test only that UI (`e2e/{document-studio,privacy,profile-import,shortlist}.spec.ts`). This is an **authorized** feature removal, not test-skipping. Keep `e2e/playwright.config.ts` and the Playwright dependencies for the new client. Make sure `bun run e2e` with no specs doesn't fail the gate, or record how it is handled.
3. **Static assets:** the Worker currently serves `../apps/web/dist` (`infra/alchemy.run.ts:209`, `dev/preview.wrangler.jsonc:31`). Point both at a minimal committed placeholder (e.g. `dev/static-placeholder/index.html`: "Index client in development; the read API is at /api/v1/jobs"), keeping the SPA asset-config shape from `02ed98c`. This is the **only** `infra/` edit allowed; `infra/`'s Effect pins stay untouched.
4. **Build glue:** remove the web build steps from `scripts/preview.sh`, `deploy-preview.sh`, `deploy.sh` and `setup.sh`, and the `apps/web/dist` path from the `justfile` `_clean`. Any `web:*` scripts go.
5. **Keep everything else:** all API routes, the worker, the schema and the data are unchanged. The read-triggered lazy gate stays (TB-05 replaces it).

## Acceptance

- [ ] `bun run check` passes. Back-end counts equal the r3-verified root numbers (Bun **80 files / 664 passed / 4 skipped**; workerd **22 / 109**). The 8 web test files / 143 tests are gone with `apps/web`, and this is recorded as an authorized removal with the file list.
- [ ] Test diffs outside the deleted files touch import lines only (D-21b). No assertion changes.
- [ ] A clean-install check: `rm -rf node_modules` then install gives a single `effect` in the graph. Also do a converted-checkout check (install at `35e93e1`, move to the new head, reinstall), so the r3 F1 double-install class of bug cannot recur.
- [ ] `scripts/preview.sh` starts, `GET /` serves the placeholder, and `GET /api/v1/jobs` works with the seeded data (curl evidence).
- [ ] `python3 scripts/check_repo.py` passes, and no doc links point into `apps/web` (fix or remove them).
- [ ] The memory bank (`techContext.md`, `activeContext.md`, `progress.md`) records the pin, the UI retirement, the recoverable commit `35e93e1`, and the ingestion-trigger gap.
- [ ] Evidence is in `evidence/WS-0021/README.md` (r4 section).

## Exclusions

No new UI (that is `apps/index-web`, a separate ticket). No route, schema, migration or data changes, no manual ingestion trigger (a separate ticket), and no `infra/` changes beyond the asset directory.

## Rollback

Revert the commit. `apps/web` and its e2e specs come back from git.
