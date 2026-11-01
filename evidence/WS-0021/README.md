# WS-0021 evidence: effect ~4.1, retiring the legacy Foldkit UI

Scope: [WS-0021@4](../../work/WS-0021-r4-effect-4-1-retire-legacy-web.md),
which supersedes r1–r3.

Status: **implementation complete, awaiting independent review and the human
gates.** The implementing agent does not approve its own gate.

## Revision history (short)

| Rev | Outcome | Evidence |
| --- | --- | --- |
| r1 | Stopped before committing. foldkit 0.139.0 is incompatible with effect 4.1 (`SchemaTransformation.transformOrFail` was removed). | `r1-trial.patch` (the import rename) |
| r2 | Stopped. foldkit 0.170.0 changes the update contract from a tuple to a record, which would have changed test assertions. | `r2-attempt1/` (baseline e2e 4/4, screenshots, typecheck errors) |
| r3 | Frozen web island, committed as `5bf0e41` on local `ws21-r3`. The review asked for changes (double-`effect` install on converted checkouts, and a CSS asset change). It was superseded before the fixes were committed, because the owner retired the UI. | `r3/review.md` (verbatim, with one quoting edit explained in its header so `check_repo.py` does not read a grep regex as a link) |
| r4 | This revision. Back-end upgrade plus the authorized removal of `apps/web`. | below |

## r4

### Pinned baseline

| Item | Value | How established |
| --- | --- | --- |
| Start commit | `fcef6be` (the r4 contract), whose parent `35e93e1` is the last commit containing `apps/web` | `git log` |
| Code drift since r3's start `7f1f009` | none outside `work/`, `docs/`, `evidence/`, `research/`, `memory-bank/` and `spikes/` | `git diff --stat 7f1f009 fcef6be -- <code paths>` gives empty output |
| Root `effect` | `4.0.0-rc.108` → `~4.1.0`, **resolved `4.1.1`** | `package.json`, `bun.lock`, `node_modules/effect/package.json` |
| `infra/` Effect pins | unchanged at rc.108 (D-21c) | `infra/package.json` |
| Bun | 1.4.4 | `bun --version` |

### Changes

1. **Back-end hunk reused from `5bf0e41`:**
   - It covers the 39 import-renamed files, `packages/better-auth-effect-adapter/package.json` (peer `~4.1.0`) and the root `bun.lock`. All of these are byte-identical to `5bf0e41`.
   - Root `package.json`: `effect` changes to `~4.1.0`. The workspaces entry stays `apps/*`, which now matches only `apps/worker`.
   - None of r3's island, vendor, web lock or web glue is included.
   - **Rename:**
     - `effect/unstable/http/*` → `effect/http/*`
     - `effect/unstable/httpapi/*` → `effect/http-api/*`
     - `effect/unstable/schema/*` → `effect/schema/*`
     - `effect/unstable/sql/*` → `effect/sql/*`
     - `effect/unstable/observability/*` → `effect/observability/*`
   - **Citation:** the effect 4.1.0 `package.json` `exports` (`./http`, `./http-api`, `./schema`, `./sql`, `./observability`, `"./*": "./dist/*.js"`). There is no `unstable` directory in 4.1.
   - **Lockfile:** the root lock gains only `effect@4.1.1`. It drops effect rc.108's transitive dependencies (`msgpackr*`, `@msgpackr-extract/*`, `node-gyp-build-optional-packages`, `kubernetes-types`, `uuid`, `multipasta`) and every package used only by the web (foldkit, `@foldkit/ui`, `@floating-ui/*`, `@effect/platform-browser`, `clsx`, `@tailwindcss/*`, `tailwindcss` and their transitive packages).
2. **Authorized removal** of 54 files. The list is in `r4/deleted-files.txt`.
   - **`apps/web/` (50 files):** includes 8 test files with 143 tests: `Route`, `profile/ExperienceEntry`, `profile/update`, `saved/update`, `studio/update`, `theme`, `update` and `view/Shared`.
   - **The four legacy e2e specs:** `e2e/{document-studio,privacy,profile-import,shortlist}.spec.ts`.
   - `e2e/playwright.config.ts` and the Playwright dependencies stay.
   - **Recovery:** everything can be restored from `35e93e1`.
3. **Empty e2e suite:** `bun run e2e` now passes `--pass-with-no-tests`.
   - With the flag: exit 0.
   - Without the flag, `playwright test` exits 1 with `Error: No tests found`.
   - e2e is not part of `bun run check`, `just verify` or CI.
4. **Static assets:**
   - Both asset configs now point at the committed placeholder `dev/static-placeholder/index.html` ("Index client in development; the read API is at /api/v1/jobs"):
     - `infra/alchemy.run.ts:209`: `directory: "../dev/static-placeholder"`. This is the only `infra/` edit.
     - `dev/preview.wrangler.jsonc:31`: `"directory": "./static-placeholder"`.
   - The SPA shape from `02ed98c` is kept: `notFoundHandling` / `runWorkerFirst` at the top level for Alchemy, and `not_found_handling` / `run_worker_first` for wrangler.
5. **Build glue:**
   - The web build steps are removed from `scripts/preview.sh`, `scripts/deploy-preview.sh` and `scripts/deploy.sh`. `scripts/setup.sh` had no web step at the start commit.
   - `apps/web/dist` is removed from `justfile _clean`.
   - The dead `apps/web/**` override is removed from `.oxlintrc.json`.
   - The preview comments now name the placeholder.
   - There were no `web:*` scripts at the start commit.
6. **Untouched:** routes, worker logic, schema, migrations, data and the lazy gate.
   - **Doc links:** `check_repo.py` found no broken links, and no markdown link points into `apps/web`.
   - **Stale prose mentions:** remaining text references to `apps/web` are in memory-bank files (left to the lead, see below), in historical work/evidence/research documents, and in one code comment at `apps/worker/src/Api.ts:314`. I left them as they are.

### Commands and results

| Command | Where | Result |
| --- | --- | --- |
| `rm -rf node_modules && bun install --frozen-lockfile` | `ws21-r4` | 174 packages. `node_modules/.bun` holds exactly one `effect@4.1.1` and no foldkit. |
| `bun run check` | `ws21-r4` (clean install) | **pass**. Bun **80 files / 664 passed / 4 skipped**; workerd **22 / 109**. These equal the r3-verified root numbers. |
| Converted checkout | `/tmp` copy: `git archive 35e93e1`, `bun install --frozen-lockfile` (old layout, rc.108 + foldkit), delete the 54 removed files, overlay the new tree, `git init` + commit (so `imports:check` sees tracked files), `bun install --frozen-lockfile` | Installs 8 packages, and the root resolves `effect@4.1.1`. Leftovers that are unreachable from the graph: `apps/web/node_modules` and the old `.bun/effect@4.0.0-rc.108`, used only by orphaned `foldkit` / `@foldkit/ui` / `@effect/platform-browser` entries. `bun run check` **passes, 80/664/4 and 22/109**. |
| Worker bundle | converted vs clean (`bun build apps/worker/src/index.ts …`) | **byte-identical** (sha256 `60481ecdfffe93bf…`), so the leftover rc.108 copy does not reach the shipped bundle. |
| `scripts/preview.sh` + curl | `ws21-r4` | Transcript in `r4/preview-curl.txt`. `GET /` returns 200 `text/html` with the placeholder. A deep link returns 200 with the placeholder (SPA fallback). `GET /api/v1/jobs?limit=2` returns 200 JSON with the seeded `cj_1` "Baker i Østfold", etc. `GET /api/health` returns 200. |
| `bun run e2e` | `ws21-r4` | exit 0 (no specs, `--pass-with-no-tests`) |
| `python3 scripts/check_repo.py` | `ws21-r4` | **pass** ("26 JSON files, documentation links valid"). The first run failed on the archived review, where a grep regex in a code span parsed as a link. It passed after the documented quoting edit in `r3/review.md`. |
| Test diff check | staged diff | The 6 modified test files (`navToClient.live.test.ts`, `Layers.test.ts`, 4 adapter tests) change **import lines only**. The filter for non-`import … from` / `} from` lines returns 0 lines. No assertion changed. The only removed tests are the authorized deletions above. |

Environment limits:
- `nix develop` and `./bootstrap verify` are unavailable here (proxy 403), so the repository scripts ran directly.
- The workerd half used `nix shell nixpkgs#nodejs`.
- The preview used a `wrangler` 4.120.0 PATH shim from the root `node_modules`.
- There was no staging, production, credentials or deploy.

### Review fixes (attempt 2, after the `f986e35` REQUEST CHANGES review)

This follow-up commit on `f986e35` fixes the review's F1 and F3 only. F2
(memory bank) belongs to the lead, and F4–F6 are left as they are.

- **F1, a gate assertion changed by authorization.**
  - `scripts/test_environment_safety.py:125` asserted
    `"run_logged web-build" in deploy`. It now asserts
    `"web-build" not in deploy` and `"apps/web" not in deploy`.
  - The `worker-build` ordering asserts are unchanged.
  - Lead authorization: this change follows directly from the
    owner-authorized removal of `apps/web`. It is not a weakened test.
    It now guards against the web build step coming back.
  - `f986e35` missed this gate because the evidence ran `bun run check`
    but not `scripts/check.sh`.
- **F3, leftover web build output.**
  - The root `.gitignore` now ignores `/apps/web/`, with the comment
    "retired in WS-0021@4; leftovers from older checkouts".
  - `justfile _clean` removes `apps/web`.

Each step of `scripts/check.sh`, run one at a time at the fix commit:

| Step | Result |
| --- | --- |
| `python3 scripts/check_repo.py` | exit 0 |
| `./scripts/test_bootstrap.sh` | exit 0 |
| `./scripts/test_nav_key.sh` | exit 0 |
| `./scripts/test_deploy_preflight.sh` | exit 0 |
| `python3 scripts/test_environment_safety.py` | exit 0 ("Environment-safety checks passed"). The review found exit 1 at `f986e35`. |
| `python3 scripts/test_d1_migrations.py` | exit 0 |
| `python3 scripts/test_d1_restore.py` | exit 0 |
| `shellcheck deploy bootstrap scripts/*.sh`, via `nix shell nixpkgs#shellcheck` | exit 0 |
| `bash scripts/check.sh` end to end, with that shellcheck on PATH | exit 0 |

F3 proof, using the reviewer's scenario:
1. Made a real `git clone`, checked out `fcef6be`, ran
   `bun install --frozen-lockfile`, then `cd apps/web && bun run build`.
   That leaves `apps/web/dist` and `apps/web/node_modules`.
2. Checked out the new head (`f986e35` plus these fixes).
3. Ran the `scripts/setup.sh` install lines: `bun install --frozen-lockfile`
   and `bun install --cwd infra --frozen-lockfile --force`.
4. Ran `bun run check` with no manual `rm`. It **passes** with Bun
   80 / 664 / 4 skipped and workerd 22 / 109. `git status` is clean, and
   `apps/web/` shows as ignored.

Negative control: with only the `/apps/web/` line removed from `.gitignore`,
`bun run fmt:check` exits 1 on the `apps/web/dist` files. With the line
restored it exits 0.

### Memory-bank facts (for the lead to fold in; this ticket did not edit `memory-bank/`)

- **Pin:**
  - The root workspace (`apps/worker`, `packages/*`, including `better-auth-effect-adapter`) is on `effect ~4.1.0`, resolved `4.1.1`.
  - Former `effect/unstable/*` imports are now `effect/{http,http-api,schema,sql,observability}/*`.
  - `infra/` stays on `effect` / `@effect/platform-bun` / `@effect/platform-node` `4.0.0-rc.108` (D-21c, follow-up ticket).
  - This also corrects WS-0020 gap G16 (`techContext.md` still says `beta.104`).
- **UI retired:**
  - `apps/web` (the Foldkit 0.139 interface) and its four e2e specs are deleted by owner decision. That removes 8 test files / 143 unit tests and 4 e2e specs.
  - The last commit containing them is **`35e93e1`**, and they can be recovered from it.
  - The Worker now serves `dev/static-placeholder/` as its static assets, locally and in every Alchemy stage. The new client is `apps/index-web` (separate ticket).
- **Workspace layout:** `apps/` now contains only `worker/`.
  - `just preview` serves the API plus the placeholder.
  - `bun run e2e` passes with no specs.
- **Ingestion-trigger gap:** the only runtime ingestion trigger is still `armsGate` (`apps/worker/src/index.ts`).
  - It arms only on `/api/v1/me/feed` and `/api/v1/me/matches/*`, and the retired UI was what made those requests.
  - Public `/api/v1/jobs` does not arm it, and no manual trigger exists yet (separate ticket; TB-05 replaces the lazy gate).
  - So until a client or the new trigger exists, nothing in normal use triggers NAV ingestion. Only an explicit request to those `me` routes does, or the local `/__scheduled` probe in preview.

### Rollback

Revert both WS-0021@4 commits together, newest first: the review fix (`6859df2` on the designated branch, `6a06273` on `ws21-r4`), then the upgrade (`810bab8`, `f986e35` on `ws21-r4`). Reverting only the upgrade would leave `/apps/web/` ignored and let `just clean` delete the restored source (delta review D1). `apps/web`, the e2e specs, the old asset paths and the rc.108 lockfile all come back from git. Then run `bun install --frozen-lockfile`.
