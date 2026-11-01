# WS-0025@2 independent review: `23a21f5` (contract) + `449e48b` (implementation)

Reviewer: independent (did not author the change). Base `983312a`; `a057878` is the r1 stop record.
Method: read-only toward `/home/user/ws25` and `/home/user/job-application-assistant`. All runs were in a `git archive 449e48b` copy at `/tmp/ws25r` (a local scratch git repo, used only for `git checkout` resets after mutations). Old-guard comparisons ran in `git archive 983312a` at `/tmp/ws25old`. No pushes, no GitHub writes, no git config changes, `VP_GIT_HOOKS=0`.
Shims: `node_modules/.bin` and `node_modules/.bun/wrangler@4.120.0/node_modules/.bin` on PATH; shellcheck 0.11.0 via `nix shell nixpkgs#shellcheck`; Chromium at `/etc/profiles/per-user/nori/bin/chromium` (from the config).

## Verdict

**ACCEPT WITH LOW FINDINGS. Nothing is rated medium or above** (0 critical, 0 high, 0 medium, 3 low, 4 nit). Under the AGENTS.md merge delegation (round 1), the severity rule does not block an auto-merge. CI on the head still has to be green.

## 1. Scope: PASS

- `git diff --stat 983312a 449e48b -- apps/worker db packages` is empty. The Worker, `db/` and `packages/` are untouched.
- The diff adds no lines matching `nodejs_compat`, `better-auth`, `BETTER_AUTH`, `compatibility_flags` or `preset`. The only hits are in the r1 evidence prose. `bun.lock` has 17 lines mentioning better-auth both before and after the change, and the diff changes none of them.
- `infra/alchemy.run.ts`: one line changes, `directory: "../dev/static-placeholder"` becomes `"../apps/index-web/dist"`. `notFoundHandling: "single-page-application"` and `runWorkerFirst: ["/api/*"]` are kept.
- `dev/preview.wrangler.jsonc`: `"directory"` changes, plus its comment. `not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*", "/__scheduled*"]` are kept. `dev/static-placeholder/index.html` is deleted.

## 2. Gate change (`scripts/test_environment_safety.py`): PASS, with one low narrowing

The old guard had `assert "web-build" not in deploy` and `assert "apps/web" not in deploy`. The new one has:

```python
assert "apps/web" not in deploy
assert "run_logged web-build" not in deploy
assert "run_logged index-web-build bash scripts/build-index-web.sh" in deploy
assert deploy.index("run_logged index-web-build") < deploy.index("deploy_stack 0")
```

The `apps/web` ban is unchanged. The verify-before-deploy assertions on the `deploy` / `deploy-production` tasks (`${requireDevenv} && vp run verify && bash scripts/deploy.sh <stage>`, with no `dependsOn`) are unchanged, and they still pass. Planted regressions, each followed by a reset:

| # | Mutation | New guard | Old guard |
|---|---|---|---|
| M1 | add `run_logged legacy bun run --cwd apps/web build` to deploy.sh | **exit 1** | n/a |
| M2 | replace the client step with `run_logged web-build bun run build` | **exit 1** | n/a |
| M3 | delete the client build step | **exit 1** | n/a |
| M4 | move the client build after `deploy_stack 0` | **exit 1** | n/a |
| M5 | drop `vp run verify` from the staging `deploy` task | **exit 1** ("must require devenv, then run verify") | — |
| M6 | drop `vp run verify` from `deploy-production` | **exit 1** | — |
| M7 | add `run_logged legacy-web-build bash scripts/build-web.sh` | exit 0 | **exit 1** |
| M8 | add a bare `bun run web-build` line | exit 0 | **exit 1** |
| M9 | point `build-index-web.sh` at `apps/web` | exit 0 | (file did not exist) |
| M10 | revert the infra asset dir to `../dev/static-placeholder` | exit 0 | exit 0 (never checked) |

The new guard adds two new requirements: the client is built, and it is built before `deploy_stack 0`. In one narrow way it is strictly weaker than before (M7, M8): see L1.

Build-script edits: all three scripts run under `set -euo pipefail` and `cd` to the repo root before calling `bash scripts/build-index-web.sh`, so relative paths resolve. `deploy.sh` calls it through `run_logged` (a `tee` pipe, which is safe under pipefail), immediately before the worker build and before `deploy_stack 0`. `preview.sh` and `deploy-preview.sh` build before bundling. The Vite config sets `emptyOutDir: true`, so each build is clean, and `build-index-web.sh` checks that `dist/index.html` exists. `shellcheck scripts/*.sh` passes inside verify.

## 3. Counts, checked by exit code: PASS (all match)

| Command | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile` | 0 | 274 packages |
| `vp check` | 0 | 293 files formatted; 0 warnings or errors in 294 files |
| `vp run test` | 0 | Bun **84 files, 689 passed, 4 skipped**; workerd **22 files, 109 passed** |
| `vp run verify` | 0 | **19/19 tasks** (setup fetched `foldkit@0.170.0` into `repos/foldkit`; `web:build` ran) |
| `vp run e2e` | 0 | **6 passed**, 7 Axe scans, 0 violations |

Afterwards no `wrangler` or `workerd` process was left (only two defunct zombies, which went away), and `curl :8799/api/health` failed to connect.

## 4. Laws and tests are real: PASS

- **Round-trip law, parse broken.** In the scratch copy I patched Foldkit's `route/parser.js` `query.parse` to trim each value. Result: `parse(print(q)) = q` fails with counterexample `{"term":some(" "),"location":none()}`, exit 1.
- **Round-trip law, print broken.** I patched `query.print` to strip `%`. Result: fails with counterexample `{"term":none(),"location":some("%")}`, exit 1. Restoring the file brings back 4/4 passing.
- **Axe.** I emptied the link text in `page/notFound.ts`. `vp run e2e` exits 1: test 6 fails with Axe `link-name`, and the other 5 pass.
- **Empty suite (F4).** I moved `e2e/index-web.spec.ts` away. `vp run e2e` exits 1 with `Error: No tests found`. Control: the old flag (`playwright test … --pass-with-no-tests`) exits 0 on the same empty suite.
- **Foldkit lint is active.** A planted `commands: []` gives `foldkit(no-empty-commands-array)`. A planted `h.Href("/")` gives `foldkit(no-hardcoded-route-strings)`. Both make `vp check` exit 1.
- Test inventory matches the evidence: 8 Story, 10 Scene, 4 route-law and 3 typed-client tests (25 in total, 664 + 25 = 689). Story and Scene cover the failure paths for both the list and the detail, and the Scene locators are accessible (`role` / `text` / `label`, no CSS or placeholder selectors).

## 5. Single Effect (F5): PASS

`grep -oE '"effect@[^"]*"' bun.lock | sort | uniq -c` gives `1 "effect@4.1.1"`. `node_modules/.bun` holds only `effect@4.1.1`, and `apps/index-web/node_modules/effect` symlinks to it. Foldkit, `@foldkit/ui`, `@foldkit/vite-plugin` and `@effect/platform-browser` all peer on `~4.1.0` / `^4.1.1`.

## 6. Foldkit idioms and PROVENANCE: PASS (one nit)

- The checkout is at `a471adb`, tagged `foldkit@0.170.0`, matching the PROVENANCE claim. The upstream licence is MIT.
- Spot-checks against the checklist found nothing:
  - `({})`: none.
  - `_blank`: only a fixture URL.
  - Constructor `as` casts: none.
  - `Ui.`: none.
  - `HttpClient` is imported from `effect/http`.
  - `h.input`/`h.button` appear only inside `@foldkit/ui` `toView` callbacks.
  - List rows are `h.keyed("li")(job.id, …)`.
  - The external link has `Rel`.
  - Each route has one `h1`, including the pending and failed detail states.
  - Landmarks are present: `header`, `nav`, `main`, `section`, and `form` with `role=search`.
  - Every `focus:outline-none` is paired with `focus-visible:ring`.
  - The `UpdateReturn` alias is reused by helpers, `modifyFields` is used without spread, and the `Got*` wrappers are present.
- PROVENANCE spot-check: 25 of 26 grep-checked claims were found in the named example files:
  - routing `defineRouteUnion` / `parseUrlWithFallback` / `notFoundView` / `Document`;
  - query-sync `OptionFromOptional`, `NavigateInternal`, `LoadExternal`, `UrlRequest.match`, `replaceUrl`, plus `entry.ts` `makeApplication`;
  - api-cache-query `postQuery`, `Query.define`, `lift`, `postDetailView`, `matchData`, fixture `CompletedFetch`, story `Command.resolve`;
  - weather `effect/http`, `Http.layer`, story `HttpClient.make`, `scene.test.ts`, plus routing `scene.test.ts`;
  - form `inputFieldView` + `Input.view`;
  - scaffold `templates/base/vite.config.ts` `optimizeDeps.entries`.
- The exception is N1.
- Route entry uses `loadIfMissing`, the same as api-cache-query's navigation path. The deviation from query-sync (submit plus `pushUrl` instead of per-keystroke `replaceUrl`) is recorded as R1 and is sound.
- Foldkit's `Href` runs `sanitizeUrl`, which neutralises `javascript:` and `vbscript:` (`dist/html/index.js:351-373, 749`). The source-supplied `applicationUrl` is free text from NAV `content.applicationUrl` and from JSON-LD `new URL(...)`, so this matters, and it is not an XSS sink.

## 7. Data exposure: PASS

- `api.ts` builds only `HttpApiClient.group(api, { group: "corpus" })`. It calls `listJobs` (always `status=Active`, `limit=50`) and `getJob`. The `corpus` group has no `Authenticated` middleware ("Unauthenticated reads stay possible", `Api.ts:355-379`).
- The page renders `CanonicalJob` fields only: title, employer, location, status, published date, deadline, description, `sources`, and a link to `applicationUrl`. These are public advert data, not personal data.
- Bundle origins: `grep -ohE 'https?://…' dist` finds `www.w3.org` (SVG/XML namespaces), `tailwindcss.com` (a licence banner) and `example.com`. The last is Effect's feature-detection `new Request("https://example.com", …)` for streaming-body support, which is constructed but never fetched.
- Every request goes to the same origin, under relative `/api/v1/jobs…`. There is no `ws://`, no token, no `NAV_API_TOKEN`, no SQL and no `cloudflare:` import. The only storage use is Foldkit's own `sessionStorage` scroll restoration.

## Findings

### Low

- **L1: The `web-build` ban is narrower than before.** `scripts/test_environment_safety.py:150` now bans only the literal `run_logged web-build`. M7 (`run_logged legacy-web-build …`) and M8 (bare `bun run web-build`) pass the new guard and fail the old one. The substantive `apps/web` ban is unchanged, so the retired interface cannot come back by path. The weakening is in letter, not in effect, but the claim "no weaker than before" is not literally true. Fix, one line: `assert "web-build" not in deploy.replace("index-web-build", "")`.
- **L2: The new build-to-asset coupling is not pinned by a gate.** Nothing asserts that `infra/alchemy.run.ts` and `dev/preview.wrangler.jsonc` point at the directory `build-index-web.sh` produces (M10 passes). Nothing asserts that `scripts/deploy-preview.sh` or `scripts/preview.sh` still build the client. Nothing checks `build-index-web.sh` itself for `apps/web` (M9 passes). The asset-directory gap predates this change; the coupling is new here. Suggested fix: assert `"../apps/index-web/dist"` in both configs, assert the build call in both preview scripts, and assert `"apps/web" not in build-index-web.sh`.
- **L3: The cache comment overstates refresh, and data can go stale for the life of a tab.** `apps/index-web/src/query.ts:9-11` says a revisit "renders from the Model while a refresh runs". The code uses `loadIfMissing`, which Foldkit documents as `staleTime: Infinity`: loaded data is never revalidated. A vacancy that closes after it was first listed stays listed until a reload, and the list has no refresh control. The evidence README describes this correctly ("without refetching"). Either fix the comment or revalidate on route entry (`revalidateOrLoad`).

### Nit

- **N1: One PROVENANCE row over-credits its source.** The `page/status.ts` row credits `examples/weather/src/main.ts` for the error display "with `Role("alert")`". The weather example's failure view is a plain `div` with no role. The `Role("alert")` comes from the checklist.
- **N2: One evidence count does not reproduce.** The README says "`better-auth` lines … 6 before, 6 after". I count 17 lines mentioning better-auth (10 package entries). The substantive claim, 0 changed lines, holds.
- **N3: The client bundle carries the whole Worker API.** Importing `api` from `apps/worker/src/Api.ts` puts every group's route paths and schemas into the client bundle (all `/api/v1/me/*` paths; 420 KB raw, 133 KB gzip). There is no data and no secret in it, only weight and API surface. A corpus-only contract module would trim it.
- **N4: Dev-only dependencies arrive transitively.** `@foldkit/vite-plugin` brings `@effect/platform-node` and its auto-installed `redis` peer into `bun.lock`. These are build tooling only and do not reach the client or the Worker bundle.

## Evidence README cross-check

Every claim I tested reproduced except N2:

- the counts;
- 19/19 tasks;
- 6/6 e2e with 7 Axe scans;
- a single `effect@4.1.1`;
- the Foldkit lint being active;
- the round-trip law and its path-segment characterization;
- `db/` untouched;
- the SPA shape kept;
- no leftover processes.

R5 (no independent audit fan-out) is answered by this review.

---

# Round 2: delta review of `449e48b..7966ec5`

Scratch copy: `git archive 7966ec5` into `/tmp/ws25r2` (a local scratch git repo, used only for `git checkout` resets after each mutation). `VP_GIT_HOOKS=0`. No changes to any real checkout: `git status` in `/home/user/ws25` is clean.

The delta touches four files: `scripts/test_environment_safety.py` (+26/-3), `apps/index-web/src/query.ts` (comment only), `apps/index-web/PROVENANCE.md` (one table row) and `evidence/WS-0025/README.md` (new §7).

## Verdict

**ACCEPT. Nothing is rated medium or above** (0 critical, 0 high, 0 medium, 0 low, 1 nit). L1, L2, L3 and N1 are resolved, and the N2 explanation is confirmed: `grep -c '"better-auth' bun.lock` gives 6 at `983312a` and 6 at `7966ec5`.

## 1. L1: resolved

The new guard:
- requires `deploy.count(INDEX_WEB_BUILD) == 1`;
- requires `"web-build" not in deploy.replace(INDEX_WEB_BUILD, "")`;
- requires `deploy.index(INDEX_WEB_BUILD) < deploy.index("deploy_stack 0")`;
- keeps `"apps/web" not in deploy`.

The clean tree exits 0. Planted mutations:

| Mutation | Exit | Assertion hit |
|---|---|---|
| `run_logged legacy-web-build bash scripts/build-web.sh` added (round-1 M7) | **1** | "only the index-client build may say web-build" |
| bare `bun run web-build` added (round-1 M8) | **1** | same |
| client step duplicated | **1** | "deploy must build the index client exactly once" |
| client step moved after `deploy_stack 0` | **1** | line 156, the `index < deploy_stack 0` ordering |
| `run_logged legacy bun run --cwd apps/web build` | **1** | `apps/web` ban |

The guard is now at least as strong as the `983312a` guard: every `web-build` string the old guard rejected is still rejected, apart from the one exact allowed step.

## 2. L2: resolved

| Mutation | Exit | Assertion hit |
|---|---|---|
| infra assets set to `../dev/static-placeholder` (round-1 M10) | **1** | "infra assets must be the client build" |
| preview assets set to `./static-placeholder` | **1** | "preview assets must be the client build" |
| `build-index-web.sh` changed to `cd "$ROOT/apps/web"` (round-1 M9) | **1** | "build-index-web.sh must not build apps/web" |
| client build removed from `scripts/preview.sh` | **1** | "scripts/preview.sh must build the index client" |
| client build removed from `scripts/deploy-preview.sh` | **1** | "scripts/deploy-preview.sh must build the index client" |
| `preview.sh` client build moved after the Worker bundle | **1** | "… before bundling the Worker" |
| infra `directory:` set to an identifier instead of a literal (fail-closed probe) | **1** | `infra_assets == []` |
| control: `preview.sh` build moved, but still before the bundle | 0 | (correctly allowed) |

The infra and preview checks use `findall(...) == [expected]`, so they fail closed: a second assets directory, a missing one, or one that isn't a string literal all fail.

## 3. N1 and L3: documentation only, no behaviour change

- `git diff 449e48b 7966ec5 -- apps/index-web/src` changes one file (`query.ts`, +4/-2), and every changed line is inside the JSDoc block. The new comment states correctly that route entry uses `loadIfMissing` and that data is not revalidated within a tab session.
- The `PROVENANCE.md` row for `notFound.ts`/`status.ts` now credits the weather example only with "a failure branch rendered in place of the data", which matches its `onFailure` `div`. It now attributes `Role("alert")` / `Role("status")` to the generate-program checklist.

## 4. Counts, checked by exit code: unchanged

| Command | Exit | Result |
|---|---|---|
| `vp check` | 0 | 293 files formatted; 0 warnings or errors in 294 files |
| `vp run policy` (shellcheck via `nix shell`) | 0 | 7/7 tasks |
| `vp run test` | 0 | Bun **84 files, 689 passed, 4 skipped**; workerd **22 files, 109 passed** |

## Findings

- **N5, nit:** `scripts/test_environment_safety.py` re-reads `infra` and `preview_config` under the same names it already bound near the top of the file. In `build_index_web.replace("apps/index-web", "")` the `.replace` is a no-op, because `apps/index-web` does not contain the substring `apps/web`. Both are harmless; this needs no action.

The round-1 nits N3 (the whole Worker `HttpApi` declaration is in the client bundle) and N4 (dev-only `redis` / `@effect/platform-node` in the lockfile) are unchanged. They remain nits.
