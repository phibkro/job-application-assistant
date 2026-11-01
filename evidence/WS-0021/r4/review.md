> Archived by the lead from `/tmp/ws-0021-r4-review.md` (sha256 `8171ebc96d12c0ac0b3ff09cd59270b406d8bb136a80175c6e0d158dd6f69bc2`). There is one quoting edit on the §7 line, splitting the bracket-then-parenthesis grep pattern so `check_repo.py` does not parse it as a Markdown link; the meaning is unchanged.

# WS-0021@4 independent review: commit `f986e35` (parent `fcef6be`), branch `ws21-r4`

Reviewer: independent reviewer (complex-reasoning tier). Date: 2026-11-01.
Inputs: contract `work/WS-0021-r4-effect-4-1-retire-legacy-web.md` read at `fcef6be`, and `git diff fcef6be f986e35`. I treated `evidence/WS-0021/README.md` as a claim to check.

What I did in each checkout:
- **`/home/user/ws21-r4`:** I ran `rm -rf node_modules && bun install --frozen-lockfile`, `bun run check`, `python3 scripts/check_repo.py`, `python3 scripts/test_*.py` and a `bun build` written to `/tmp`. Afterwards `git status --porcelain` is empty and HEAD is `f986e35`.
- **Main checkout:** read-only. I made one `git clone`/`fetch` from it into `/tmp`.
- **Everything else** (preview, e2e, shell tests, shellcheck, the converted-checkout scenario) ran in `/tmp/ws21rev/r4head` (a `git archive f986e35`) and `/tmp/ws21rev/r4conv` (a clone).

## Verdict: **REQUEST CHANGES**

The core change is sound and matches the contract:
- The back-end hunk is byte-identical to `5bf0e41`.
- Exactly the 54 listed files are deleted.
- The only `infra/` change is the asset directory.
- The test diffs touch imports only.
- A clean install gives a single `effect@4.1.1`.
- `bun run check` gives 80/664/4 and 22/109.
- The preview serves the placeholder and the API.

Two problems block acceptance:

1. **The repository's own gate fails.** `scripts/test_environment_safety.py:125` asserts `"run_logged web-build" in deploy`, and this commit removed that line from `deploy.sh`. The test fails with `AssertionError`, so `scripts/check.sh`, and with it `just check`, `just verify` / `./bootstrap verify` and every `just deploy*`, now fails. At `fcef6be` the same test passes. The evidence only ran `bun run check` and `check_repo.py`, so it missed this.
2. **One acceptance criterion is not met.** The contract says the memory bank (`techContext.md`, `activeContext.md`, `progress.md`) must record the pin, the UI retirement, the recovery commit `35e93e1` and the ingestion gap. `memory-bank/` is not in the diff; the README hands the facts "to the lead to fold in".

A third finding (F3) fails closed but will hit the owner's machine. Its fix is one line.

## Findings

| # | Severity | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| F1 | **High (blocking)** | `scripts/test_environment_safety.py:125` against `scripts/deploy.sh:162` | The assertion `"run_logged web-build" in deploy` now fails. `scripts/check.sh` line 7 runs this script, and `_check` → `_verify` → `_deploy-*` depend on `check.sh`. So `./bootstrap verify` cannot pass at `f986e35`, and under AGENTS.md no deployment claim is valid. Confirmed: `python3 scripts/test_environment_safety.py` exits 1 at `f986e35` (`AssertionError` at line 125) and passes at `fcef6be` ("Environment-safety checks passed"). | Replace the line with a guard that fits the retirement, such as `assert "web-build" not in deploy` and `assert "apps/web" not in deploy`, keeping the `worker-build` ordering asserts. This changes a gate assertion, so record it as following from the authorized removal (owner or lead note). Re-run `scripts/check.sh` in full. |
| F2 | **Medium (blocking acceptance)** | `memory-bank/{techContext,activeContext,progress}.md` (unchanged) | This acceptance criterion is unmet. `techContext.md` still says `effect@4.0.0-beta.104` (G16), and the memory bank still describes `apps/web` as the UI. The README's "Memory-bank facts" section is accurate (I checked it against the code; see §8), but it is not in the memory bank. AGENTS.md also requires `activeContext.md`/`progress.md` updates when state changes. | Add the README's facts to the three files, either in this commit or in a lead commit before acceptance. |
| F3 | Medium (fails closed) | `.gitignore` (no change), `justfile:113` | Converted checkout where the web was ever built: anyone who ran `just preview` before this commit has `apps/web/dist`. Deleting `apps/web/.gitignore` (which listed `/dist/` and `/node_modules/`) makes `apps/web/dist` untracked but **not ignored**. `_clean` no longer removes it. `oxfmt --check packages apps` then flags `apps/web/dist/{index.html,assets/*.js,*.css}`, and `bun run check` fails at `fmt:check`. Reproduced in `/tmp/ws21rev/r4conv` (exit 1). After `rm -rf apps/web/dist` the same tree passes. A `git add -A` there would also commit the build output. The implementer's converted-checkout run used `git archive` without a built `dist`, so it could not see this. | Add `/apps/web/` to the root `.gitignore` with a comment ("retired in WS-0021@4; leftovers from older checkouts"). Optionally keep `apps/web` in `_clean`. Or document `rm -rf apps/web` as a step when moving to this commit. |
| F4 | Low | `package.json:21` (`e2e … --pass-with-no-tests`) | This is honest today: e2e is not in `bun run check`, `check.sh`, the `justfile` or CI (grep), and the README says so. The risk is later: if the new client's specs are skipped (wrong `testDir`/`testMatch`, a separate config, a renamed suffix), `bun run e2e` still exits 0 with no output. | Remove the flag in the ticket that adds the first `apps/index-web` spec, and make that an acceptance item of that ticket. Or keep the flag only behind an env var (`E2E_ALLOW_EMPTY=1`). Or add a guard to `check.sh` that fails if no `e2e/**/*.spec.ts` exists once `apps/index-web/` exists. |
| F5 | Low (next ticket) | `package.json:5-8` (`"workspaces": ["packages/*", "apps/*"]`) | `apps/*` now matches only `apps/worker`, but a future `apps/index-web` joins the root workspace automatically. The new client is on Foldkit 0.170. If that release declares a different `effect` peer than root `~4.1`, the r3 F1 double-`effect` class of bug comes back in the root graph. | Record this in the `apps/index-web` WorkScope: check foldkit 0.170's `effect` peer against `~4.1` and confirm a single `effect` in `bun.lock`. |
| F6 | Nit | `infra/alchemy.run.ts:196-199`, `dev/preview.wrangler.jsonc:32-33`, `apps/worker/src/Api.ts:314` | Comments still describe "the interface" that "routes client-side" / "ships beside the API", and `Api.ts:314` mentions `apps/web`. They are harmless but stale. The README acknowledges `Api.ts:314`. | Reword them when the next ticket touches these files. |
| F7 | Info | `evidence/WS-0021/r3/review.md` | Verified as accurate (§7). One gap in the trail: the README cites r3 review findings, but `5bf0e41`'s `r3/` evidence (hash list, screenshots) lives only on the local branch `ws21-r3`. | None needed, because r3 is superseded. |

## Checks, commands and results

### 1. Confinement
- `git diff --stat fcef6be f986e35`: 108 files, +404/−12726.
  - Added (5): `dev/static-placeholder/index.html`, `evidence/WS-0021/README.md`, `r3/review.md`, `r4/deleted-files.txt`, `r4/preview-curl.txt`.
  - The rest are modifications or the 54 deletions.
- **Back-end hunk:** `diff <(git diff 7f1f009 5bf0e41 -- apps/worker packages) <(git diff fcef6be f986e35 -- apps/worker packages)` is identical. `git diff --stat 5bf0e41 f986e35 -- apps/worker packages bun.lock` is empty, so the lockfile is also byte-identical to r3's. `git diff --stat 7f1f009 fcef6be` over the code, config, infra, db and policy paths is empty, so the base did not drift.
- **Root `package.json`:** compared with `5bf0e41`, the only differences are `workspaces` kept as `apps/*`, no `web:check`, and the `e2e` flag. `effect` is `~4.1.0`.
- **Deletions:** `git diff --name-status … | awk '$1=="D"'` lists 54 paths, and `diff` against the sorted `evidence/WS-0021/r4/deleted-files.txt` is identical. That is all 50 tracked `apps/web` files at `fcef6be` (0 remain) plus the 4 e2e specs. `e2e/playwright.config.ts` stays.
- **infra:** `git diff --name-only -- infra` lists only `infra/alchemy.run.ts`. The only non-import `.ts` change in the whole diff is `directory: "../apps/web/dist"` → `"../dev/static-placeholder"`. `infra/package.json` and `infra/bun.lock` are unchanged, and the pins are still `effect`/`@effect/platform-bun`/`@effect/platform-node` `4.0.0-rc.108`. The SPA shape (`notFoundHandling`, `runWorkerFirst`) is kept.
- **Script, justfile and oxlint edits** (all as the contract allows):
  - The `web-build` lines are removed from `preview.sh`, `deploy-preview.sh` and `deploy.sh`.
  - `apps/web/dist` is removed from `_clean`.
  - The dead `apps/web/**` override is removed from `.oxlintrc.json`.
  - The preview comments are updated.
  - `setup.sh` is unchanged; it had no web step at `fcef6be`.
- No route, schema, migration or worker-behaviour change. `schema:check` reports "schema snapshot matches the domain models". There is no diff under `db/` or `policy/`.

### 2. Assertions
- The modified test files (status M) are `navToClient.live.test.ts`, `Layers.test.ts`, `adapters/jsonld/src/index.test.ts`, `adapters/nav/src/{credential,index}.test.ts` and `adapters/src/Registry.test.ts`.
- `git diff -U0 --diff-filter=M fcef6be f986e35 -- '*.test.ts' '*.spec.ts'`, filtered for anything other than `import … from "…";` / `} from "…";` lines, gives **empty output**.
- Running the same filter over all modified `.ts` files leaves only the `infra` directory line.
- Caveat (F1): a Python gate assertion was not updated, and it now fails.

### 3. Single `effect`
- **Clean install (worktree):** `rm -rf node_modules && bun install --frozen-lockfile` installs 174 packages.
  - `node_modules/.bun` has exactly one `effect@4.1.1` and no foldkit, `@foldkit` or `@effect/*`.
  - Every `*/node_modules/effect/package.json` reachable from `node_modules` reports `4.1.1`.
- **Converted checkout (`/tmp/ws21rev/r4conv`, a real git clone):**
  1. `git checkout fcef6be`, then `bun install --frozen-lockfile` (201 packages: `effect@4.0.0-rc.108`, foldkit, `@foldkit/ui`, `@effect/platform-browser`), then `cd apps/web && bun run build` (as an earlier `just preview` would have).
  2. `git checkout f986e35`, then the install lines from `scripts/setup.sh`: `bun install --frozen-lockfile` (8 packages) and `bun install --cwd infra --frozen-lockfile --force` (362 packages). I could not run `setup.sh` itself because `just`, `sqlite3`, `shellcheck` and `wrangler` are not on PATH.
  3. Result: `bun run check` **fails** at `fmt:check` on the leftover `apps/web/dist` (F3).
  4. After `rm -rf apps/web/dist`: `bun run check` **passes**: 80 files / 664 passed / 4 skipped, and 22 / 109.
- **Checking the "leftovers are unreachable" claim:**
  - `node_modules/effect` points to `.bun/effect@4.1.1`, and `packages/better-auth-effect-adapter/node_modules/effect` points to `.bun/effect@4.1.1` (relinked).
  - The only store entries whose `node_modules/effect` points to rc.108 are the orphaned `foldkit@0.139.0+…`, `@foldkit+ui@0.139.0+…` and `@effect+platform-browser@4.0.0-beta.103+…`, plus the rc.108 entry itself.
  - No symlink under `node_modules/` (depth 2) points to any of them.
  - `bun.lock` mentions neither `rc.108` nor `foldkit` (0 matches).
  - `apps/web/node_modules` still links to them, but `apps/web` has no package.json and no source, so nothing imports through it.
  - The worker bundle (`bun build apps/worker/src/index.ts --target=browser --format=esm --conditions=workerd --conditions=worker --external 'cloudflare:*'`) is **byte-identical** between the converted and clean trees: sha256 `60481ecdfffe93bf6e9637ef7922af822fd64bc0f1c802f7effafb42dee7b28c`, which matches the README.
  - **The claim holds.** The only caveat is F3, which concerns `dist`, not `effect`.

### 4. Reproduction (worktree, clean install)
| Command | Result |
| --- | --- |
| `PATH=/tmp/ws21/bin:$PATH bun run check` | **exit 0**. fmt (269 files), oxlint, imports (268 tracked files), tsc, schema, catalog (109), bundle, Bun **80 files / 664 passed / 4 skipped**, workerd **22 files / 109 passed**. This matches the expected numbers. |
| `python3 scripts/check_repo.py` | **pass**: "26 JSON files, documentation links valid." No Markdown link points into `apps/web` outside `work/` and `evidence/` (`git grep '](…apps/web'`). |
| `python3 scripts/test_environment_safety.py` | **FAIL** (`AssertionError`, line 125). At `fcef6be`: pass. See F1. |
| `python3 scripts/test_d1_migrations.py`, `test_d1_restore.py` | pass |
| `scripts/test_bootstrap.sh`, `test_nav_key.sh`, `test_deploy_preflight.sh` (in the /tmp copy) | all pass |
| `nix shell nixpkgs#shellcheck -c shellcheck deploy bootstrap scripts/*.sh` (in the /tmp copy) | pass (exit 0) |
| So `scripts/check.sh` as a whole | would **fail**, at step 5 (F1). I ran its steps one by one. |

### 5. Preview and the deploy path
- I ran `scripts/preview.sh` in `/tmp/ws21rev/r4head`, with PATH including that copy's own wrangler 4.120.0. It came up in about 16 seconds.
  - `GET /`: 200 `text/html`. The body's sha256 is `a3d16755…`, identical to `dev/static-placeholder/index.html`.
  - `GET /some/deep/link` and `GET /saved`: 200 `text/html`, the placeholder (SPA fallback; the log shows "using `not_found_handling` behavior").
  - `GET /api/v1/jobs?limit=2`: 200 `application/json` with the seeded `cj_1` "Baker i Østfold" and `cj_2` "Frontendutvikler", `meta.limit` 2.
  - `GET /api/health`: 200 `{"status":"ok","service":"job-index","environment":"local"}`.
  - `GET /api/v1/does-not-exist`: 404, so the Worker still runs first for `/api/*`.
  - `GET /index.html`: 307, the normal asset canonicalisation.
- I also requested `GET /__scheduled` once by mistake. It hit the local preview only and returned 200 in 5 ms, with no deploy and no credentials involved.
- **Deploy path:**
  - `deploy.sh` and `deploy-preview.sh` both publish through `cd infra && bun run alchemy deploy`.
  - The Alchemy stack's `assets.directory` is `../dev/static-placeholder`, which is `dev/static-placeholder/` relative to `infra/` (a single `index.html`).
  - Neither script, nor anything else outside history docs and `scripts/preview.sh:4`, refers to `apps/web` (`git grep` over all paths except `evidence`, `work`, `research`, `docs`, `memory-bank` and `spikes`; the other hit is the `Api.ts:314` comment).
  - `scripts/smoke-production.sh` checks only `/api/health`, `/api/about` and `/api/v1/jobs?limit=1`, so the placeholder does not break the smoke check.
  - The deploy chain is still blocked by F1.

### 6. The empty e2e suite
- `bun run e2e` (with `--pass-with-no-tests`) exits 0 and prints nothing. `npx playwright test --config e2e/playwright.config.ts` without the flag exits 1 with "Error: No tests found". The README states both correctly.
- `e2e` is not referenced by `check.sh`, the `justfile`, any script or `.github` (grep), so the flag does not weaken any current gate. It is honest now.
- It could hide the new client's tests later. Guard proposal in F4.

### 7. Archived r3 review
- `sha256sum /tmp/ws-0021-r3-review.md` gives `6909dd79c703bbca669bcabac8a4a797cc2027b837f20e77a2c5dfac12ce0501`, which matches the hash quoted in the archive header.
- `diff /tmp/ws-0021-r3-review.md evidence/WS-0021/r3/review.md` shows exactly two differences:
  1. the added 5-line archive note at the top;
  2. in the §2 grep, `'^[+-]` + `(import` became `'^[+-]''(import`.
- That is the documented quoting edit. In the shell, the two strings are the same.

### 8. Ingestion-trigger gap
- `armsGate` (`apps/worker/src/index.ts:193-194`) is `pathname === "/api/v1/me/feed" || startsWith("/api/v1/me/matches/")`, and it is used only at `index.ts:208`.
- `infra/alchemy.run.ts:144` has `const CRONS = []` (passed as `crons` at line 226), so nothing schedules ingestion in a deployed stage. `scheduled()` runs only through the local `--test-scheduled` probe.
- Callers of `/api/v1/me/feed` or `/me/matches` at `f986e35`, outside history docs: only the route declarations in `Api.ts:389/394/408` and `armsGate` itself, plus tests (`lazy.live.test.ts`, `navToClient.live.test.ts`). There are none in `scripts/`, `dev/`, `e2e/` or the smoke check.
- At `fcef6be` the caller was `apps/web/src/Commands.ts:147` (`client.feed.fresh(...)`), which is now deleted.
- **The gap the evidence records is accurate:** in normal use, nothing triggers NAV ingestion any more.

## What I could not verify
- I did not run `./bootstrap verify`, `just …` or `scripts/setup.sh` as wholes. `nix develop` is blocked here, and `just`, `sqlite3` and `shellcheck` are not on PATH. I ran every `check.sh` step on its own instead, shellcheck through `nix shell`. F1 shows the full `check.sh` would fail.
- I did not run any real deploy (`deploy.sh`, `deploy-preview.sh`; no credentials, out of scope). The claim that the deploy publishes the placeholder rests on reading the Alchemy config and scripts.
- I did not verify that Alchemy resolves `assets.directory` relative to `infra/` by running it. I inferred it from the scripts running `cd infra` and from the previous `../apps/web/dist` using the same convention.
- F5 (the foldkit 0.170 `effect` peer) is a forward-looking risk. I did not look at foldkit 0.170's manifest.

---

## Delta re-review: `6a06273` (parent `f986e35`)

Scope: verify the fixes for F1 and F3. The lead owns F2 (done at integration), and F4/F5 are now WS-0025 acceptance items, so I did not re-check them. I stayed read-only: the worktree is still at `6a06273` and `git status --porcelain` is empty. Scratch work was in `/tmp/ws21rev/d6`, a real `git clone` of the main repo with `ws21-r4` fetched.

### Verdict: **ACCEPT WITH NITS** (the delta fixes F1 and F3; F2 is still the lead's to do before integration)

| Check | Command | Result |
| --- | --- | --- |
| Delta confinement | `git diff --stat f986e35 6a06273` | 4 files only: `.gitignore` (+4), `justfile` (1 line), `scripts/test_environment_safety.py` (+4/−1), `evidence/WS-0021/README.md` (+49). |
| F1 test edit | `git diff f986e35 6a06273 -- scripts/test_environment_safety.py` | The one line `assert "run_logged web-build" in deploy` is replaced by `assert "web-build" not in deploy` and `assert "apps/web" not in deploy`, with a comment saying the owner authorized it. The `worker-build` build assert and `deploy.index("run_logged worker-build") < deploy.index("deploy_stack 0")` are unchanged, and nothing else in the file changed. No other check is weakened, and the new lines are stricter than the old one. |
| F3 edit | same diff for `.gitignore` and `justfile` | `.gitignore` adds `/apps/web/`, with the comment "retired in WS-0021@4; leftovers from older checkouts". `_clean` now runs `rm -rf … node_modules apps/web …`. |
| Full gate, end to end | clone at `6a06273`, with `nix shell nixpkgs#shellcheck` (0.11.0) symlinked onto PATH: `./scripts/check.sh` | **exit 0**. check_repo, test_bootstrap, test_nav_key, test_deploy_preflight, test_environment_safety ("Environment-safety checks passed"), test_d1_migrations, test_d1_restore and shellcheck all pass. |
| F3 scenario | clone: `checkout fcef6be`, `bun install --frozen-lockfile` (201 packages), `cd apps/web && bun run build` (leaves `dist/` + `node_modules/`), then `checkout 6a06273`, then `bun install --frozen-lockfile` (8) and `bun install --cwd infra --frozen-lockfile --force` (362), with no `rm` | `git status --porcelain` is **empty**. `git check-ignore -v` shows `.gitignore:7:/apps/web/` matching `apps/web/dist` and `apps/web/node_modules`. `bun run check` **exit 0**: fmt 269 files, imports 268 tracked files, Bun **80 / 664 / 4 skipped**, workerd **22 / 109**. `node_modules/effect` points to `.bun/effect@4.1.1`. The orphaned rc.108 store entry is still present, but nothing reaches it (as I verified on `f986e35`). |
| Full gate in the converted state | same clone: `./scripts/check.sh` with shellcheck on PATH | **exit 0**; `git status` still clean. |
| Counts in the worktree | `/home/user/ws21-r4` at `6a06273`: `bun run check` | **exit 0**. Bun **80 files / 664 passed / 4 skipped**, workerd **22 / 109**. `python3 scripts/check_repo.py` passes (26 JSON files). |
| Evidence | `git diff f986e35 6a06273 -- evidence/WS-0021/README.md` | The new "Review fixes" section matches what I reproduced. I did not re-run its negative control (removing the `.gitignore` line makes `fmt:check` fail), but on `f986e35` I saw the same failure for the same reason. |

### Remaining nits (non-blocking)

| # | Severity | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| D1 | Nit | `evidence/WS-0021/README.md:155-157` ("Rollback") | It still says "Revert the single commit", but the change is now two commits (`f986e35` + `6a06273`). If only `f986e35` is reverted, the restored `apps/web` source is still tracked, but `/apps/web/` in `.gitignore` hides new files there. `just clean` (`rm -rf apps/web`) would also delete the restored tracked source. | Change it to "revert `6a06273` and `f986e35` together, newest first", or squash the two commits at integration. |
| D2 | Info | `scripts/check_repo.py` output | It reports "24 JSON files" in a fresh clone without `node_modules`, and 26 after an install or in the worktree. The count apparently depends on untracked state. Both runs pass. | None needed. |

Not verified in this delta: `./bootstrap verify` and `just` recipes as wholes (`nix develop` is blocked here). I ran `scripts/check.sh` itself, end to end, which is what `_check` runs; `_verify` then adds `bun run check`, which I ran separately. I did not run any deploy.
