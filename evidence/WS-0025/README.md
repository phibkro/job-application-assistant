# WS-0025 evidence: `apps/index-web`, first slice (STOPPED at the gate)

Contract: [`work/WS-0025-r1-index-web-client.md`](../../work/WS-0025-r1-index-web-client.md) (R2, attempt budget 2). Base `983312a`, branch `ws25`, worktree `/home/user/ws25`.

**Outcome: I stopped before changing any application code, and I'm asking for a gate decision.** The contract's anonymous-auth step ("enable better-auth's `anonymous` plugin on the existing auth setup") can't be done on this Worker without a change the brief excludes. better-auth 1.6.26 needs the `nodejs_compat` compatibility flag in workerd. Adding that flag means editing `infra/alchemy.run.ts`, `dev/preview.wrangler.jsonc` and `dev/test.wrangler.jsonc` beyond the asset swap, which the brief names as the only allowed change, and also changing the bundle commands. Presets, owner isolation and the e2e acceptance all depend on the anonymous session, so a partial slice would build on an unsettled decision. This commit therefore contains only this evidence and the memory-bank state. The exploratory changes were reverted: `apps/index-web/package.json`, the worker dependency additions, the probe files and the temporary entry in `vitest.workers.config.ts`. `bun.lock` is byte-identical to `983312a` (checked with `cmp`).

## 1. Baseline (unmodified `983312a`)

Outside devenv, with `wrangler` 4.120.0 (`node_modules/.bun/wrangler@4.120.0`) and `shellcheck` 0.11.0 (`nix shell nixpkgs#shellcheck`) on PATH:

| Command | Exit | Result |
| --- | --- | --- |
| `vp check` | 0 | format and lint clean |
| `vp run test` | 0 | Bun `Test Files 80 passed (80)`, `Tests 664 passed \| 4 skipped (668)`; workerd `Test Files 22 passed (22)`, `Tests 109 passed (109)` |
| `vp run verify` | 0 | `18/18 successful`; `Repository checks passed: 24 JSON files`; the same 80/664/4 and 22/109 counts under coverage |
| `vp run e2e` | 0 | no spec files; passes only because of `--pass-with-no-tests` (F4 still open) |

These are the "before" counts. There are no "after" counts, because nothing was implemented.

## 2. Blocker A: better-auth needs `nodejs_compat` on workerd

- **The premise "existing auth setup" doesn't hold for better-auth.** The Worker authenticates with bearer tokens only: the `Authenticated` middleware (`apps/worker/src/Api.ts`) calls `Accounts.authenticate` in `handlers/auth.ts` against the `principals`/`sessions` tables. better-auth appears only as `packages/better-auth-effect-adapter`, where it is a `devDependency`. No `betterAuth(...)` instance exists anywhere in the repository (`git log --all -S "betterAuth("` finds only the adapter's own commit `2623ef7`), and `db/schema.sql` has no better-auth tables. The adapter's README calls wiring into a project's schema "a follow-up for that project". Enabling the plugin therefore means introducing better-auth into the Worker for the first time: four auth tables plus `user.isAnonymous`, a `/api/auth/*` route and a session secret.
- **It doesn't bundle with the repository's bundle command.** `bun build <probe importing better-auth/minimal + plugins/anonymous> --target=browser --conditions=workerd --conditions=worker --external "cloudflare:*"` (the `bundle:check` and `scripts/preview.sh` shape) exits **1** with `Browser polyfill for module "node:crypto" doesn't have a matching export named "scrypt"` (`@better-auth/utils@0.4.2/dist/password.node.mjs`). Under the `workerd` condition, `@better-auth/utils/password` and `@better-auth/core/async_hooks` both resolve to their Node variants on purpose (their `package.json` `exports` maps `workerd` to `password.node.mjs` and `async_hooks/index.mjs`, which imports `node:async_hooks`).
- **It doesn't start without the flag.** A probe Worker (better-auth + `anonymous()`), bundled by Wrangler 4.120.0 and run with `wrangler dev --local` with `compatibility_date` 2026-05-25 and no flags, fails to start: `Uncaught Error: No such module "node:crypto". imported from "probeWorker.js"` / `The Workers runtime failed to start`. Wrangler's dry-run bundle warns that `node:async_hooks` and `node:crypto` need `nodejs_compat`. In this repository that failure would take down the whole Worker, corpus reads included, not just the auth routes.
- **It works with the flag.** The same probe with `"compatibility_flags": ["nodejs_compat"]`, a local D1 and this repository's `effectAdapter` (tables from `getAuthTables` + `renderSchema`) answers `POST /api/auth/sign-in/anonymous` with **`HTTP/1.1 200 OK`** and `Set-Cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`. The user row comes back with `name: "Anonymous"`.
- **Test-vs-production gap to watch:** `@cloudflare/vitest-pool-workers` 0.20.3 adds `nodejs_compat` to its runner on its own (`dist/pool/index.mjs`: `compatibilityFlags: ["nodejs_compat"]`). A workerd probe test passed without any flag in `dev/test.wrangler.jsonc` (`Test Files 1 passed`). The workerd suite alone would therefore not catch a deployed config that lacks the flag. Only a `wrangler dev` or staging smoke run would.
- All probe processes were started in their own process group and stopped. Nothing is listening on port 8798.

## 3. What the excluded change would be

If you approve option 1 below, the minimum change is:

1. `compatibility_flags: ["nodejs_compat"]` (or `compatibility: { date, flags }` in Alchemy) on the Worker in `infra/alchemy.run.ts`, `dev/preview.wrangler.jsonc` and `dev/test.wrangler.jsonc`. That is a runtime change for every stage.
2. The `bundle` command in `vite.config.ts` and `scripts/preview.sh` keeps `node:*` external (or targets a node-capable build), because `--target=browser` can't polyfill `node:crypto`.
3. A `BETTER_AUTH_SECRET` Worker secret for staging/production. That overlaps WS-0028 (secrets, R3). Local and test runs can use a labelled non-secret fixture, like `demo-token`.
4. Migration `0007` carries `auth_user`, `auth_session`, `auth_account`, `auth_verification` (including `isAnonymous`) as well as `query_presets`, rendered from better-auth's own `getAuthTables(options)` so there is one column authority.

## 4. Options for the gate decision

1. **Approve the runtime flag** (section 3) as a WS-0025 revision, with a staging smoke run as acceptance. This keeps the decided better-auth anonymous plugin and has the widest blast radius: the whole Worker in every stage.
2. **Use the existing bearer-token accounts for anonymous visitors.** Mint a principal, profile and session token for each visitor, and key presets by `profileId`. No runtime flag and no new auth stack are needed. This deviates from the "better-auth anonymous" decision, and account linking would need a different design.
3. **Split the slice.** Ship browse, detail, filters and URL ↔ query sync now, with no auth and no presets table, and move presets and isolation into a later revision once options 1 or 2 and WS-0028 are settled.

## 5. Findings reusable on resumption

- **F5 (single Effect) holds.** I added `foldkit@0.170.0`, `@foldkit/ui@0.170.0`, `@foldkit/vite-plugin@0.29.0`, `@foldkit/oxlint-plugin@0.15.4`, `@effect/platform-browser@4.1.1`, `@tailwindcss/vite@4.3.3`, `tailwindcss@4.3.3`, `vite@8.3.5` and `happy-dom@20.14.6` as a root-workspace package, with `better-auth@1.6.26` in `apps/worker`. `bun install` then resolved exactly one Effect: `grep -oE '"effect@[^"]+"' bun.lock` gives `1 "effect@4.1.1"`, and `node_modules/.bun` has a single `effect@4.1.1`. That change was reverted.
- **Foldkit checkout:** `scripts/setup.sh`'s fetch block put `repos/foldkit` at `a471adb` (tag `foldkit@0.170.0`). It is git-ignored.
- **Skill gap:** `generate-program`'s Phase 6 review loop expects a subagent tool. This implementer session has none, so on resumption the review rounds and `audit-program` must run in the implementer's own context, or be delegated by the lead.
- **Foldkit versus root tooling:** the 0.170.0 examples use `vitest ^5`, `vite ^8` and `typescript ^7`. The root stays on Vitest 4 (WS-0027@2), so Story and Scene tests would run in the Bun suite with a per-file `happy-dom` environment. This was not exercised, because the stop came first.

---

# WS-0025@2: the client without auth (IMPLEMENTED, pending independent review)

Contract: [`work/WS-0025-r2-index-web-client.md`](../../work/WS-0025-r2-index-web-client.md), approved after the r1 stop (owner decision: split the slice). Base `23a21f5` on `ws25`. No auth, presets, migrations, `nodejs_compat` or better-auth: `bun.lock`'s `better-auth` lines are unchanged from `983312a` (6 before, 6 after, 0 changed), and `db/` is untouched.

Environment as in r1: outside devenv, with `wrangler` 4.120.0 and `shellcheck` 0.11.0 shims on PATH. The pre-commit hook was run with `DEVENV_ROOT` set so that it executes `vp run policy`.

## 1. What was built

- **`apps/index-web`** (root workspace): Foldkit 0.170.0, `@foldkit/ui` 0.170.0, Tailwind 4.3.3, `@foldkit/vite-plugin` 0.29.0, Vite 8.3.5, `@effect/platform-browser` 4.1.1, `effect ~4.1.0`. Routes: `/` (list, with `?term=&location=`), `/jobs/:jobId` (detail) and a `NotFound` fallback. Per-module derivation from the official examples is in [`apps/index-web/PROVENANCE.md`](../../apps/index-web/PROVENANCE.md): routing, query-sync, api-cache-query, weather, form and the create-foldkit-app scaffold.
- **Typed client** (`src/api.ts`): `HttpApiClient.group(api, { group: "corpus" })` over the Worker's own `HttpApi` (`apps/worker/src/Api.ts`). The list always asks for `status=Active` and `limit=50`, so it shows current vacancies only. Detail failures map `NotFound` to "No vacancy has this id.", and any other failure to a generic message.
- **Read cache:** two keyed `Query.define`s (`foldkit/experimental`, from api-cache-query). Revisiting a filter or a vacancy renders from the Model without refetching (Story test "the URL change loads the filtered list…": `Command.expectNone()` on going back).
- **Asset swap:** the Worker's assets directory moved from `dev/static-placeholder` (deleted) to `apps/index-web/dist` in `infra/alchemy.run.ts` and `dev/preview.wrangler.jsonc`. The SPA shape is kept: `single-page-application`, and `/api/*` runs the Worker first. That is the only change in either file.
- **Build wiring** (needed so the asset directory exists wherever the Worker is bundled):
  - new `scripts/build-index-web.sh`;
  - called from `scripts/preview.sh`, `scripts/deploy-preview.sh` and `scripts/deploy.sh` (`run_logged index-web-build`, before `deploy_stack 0`);
  - a new `web:build` task inside `vp run verify`;
  - `/apps/index-web/dist/` is git-ignored.
  - `scripts/test_environment_safety.py` banned the substring `web-build`, which guarded against the retired `apps/web` artifact. I updated it rather than renaming my step around it: it still bans `apps/web` and `run_logged web-build`, and now requires the index-client build before `deploy_stack 0`.
- **Lint:** `@foldkit/oxlint-plugin` 0.15.4 (a root devDependency) applies its `recommended.json` rules and overrides to `apps/index-web/**` from the root `vite.config.ts`. To show it is active: a planted `commands: []` gives `foldkit(no-empty-commands-array)`, exit 1.
- **F4:** `--pass-with-no-tests` is removed from the `e2e` task.
- **Coverage:** `apps/index-web/src/**` was added to the Bun suite's coverage, keeping Vitest's default excludes (except `entry.ts`, which only boots in a browser and is covered by e2e). App lines 89.47%.

## 2. Single Effect (F5)

`grep -oE '"effect@[^"]+"' bun.lock | sort | uniq -c` gives `1 "effect@4.1.1"`, and `node_modules/.bun` holds exactly one `effect@4.1.1`. Foldkit 0.170.0, `@foldkit/ui`, `@foldkit/vite-plugin` and `@effect/platform-browser` all resolve to it.

## 3. URL ↔ query round-trip law

`apps/index-web/src/route.test.ts` (fast-check, 1000 runs each):

- **`parse(print(q)) = q`** for every filter state `q = { term, location }`, where each field is `Option<string>`. The generator covers well-formed Unicode, empty strings, absent filters, and strings built from `& = + % %20 # ? / space ø Å 😀`. `print` is `jobsRouter(q)` and `parse` is `urlToAppRoute(fromString(origin + path))`. **Holds.**
- **`parse(print(id)) = id`** for detail ids over the URL-unreserved alphabet `[A-Za-z0-9-._~]+`, excluding the dot segments `.` and `..`. **Holds.** Corpus ids are `cj_` plus an FNV-1a hex digest (`apps/worker/src/corpus/identity.ts`), so they fall inside this domain.
- **Foldkit finding (recorded, not worked around):** fast-check found that Foldkit 0.170's `string` path segment neither percent-encodes when printing nor decodes when parsing. The shrunk counterexamples were `" "`, and then `"."` (resolved away as a dot segment). A characterization test pins the current behaviour: `"a b"` parses back as `"a%20b"`, `"a?b"` as `"a"`, and `"a/b"` and `"."` as `NotFound`. If Foldkit starts encoding, that test fails and the id law can widen.

## 4. e2e and Axe

`vp run e2e` starts the real local stack through Playwright's `webServer` (`bash scripts/preview.sh`: client build, Worker bundle, fresh seeded local D1, `wrangler dev` on :8799), and stops it afterwards. `e2e/index-web.spec.ts`: **6 passed, 0 failed** (exit 0).

| Spec | What it checks |
| --- | --- |
| browse | "3 vacancies" in sequence order; the closed seed `cj_4` is absent |
| filters in the URL | Search pushes `/?term=utvikler&location=Oslo` and shows "1 vacancy"; reload, back and forward restore both the form and the results; Clear returns to `/` |
| shared no-match link | the empty-result message |
| detail | `cj_3` facts; the Source region with "Reported by: nav" and the original-listing `href`; Back returns to `/?location=Bergen` with the form refilled |
| deep links | to the closed `cj_4` ("Closed 2026-08-04T10:00:00Z"); to `cj_missing` (alert "No vacancy has this id.") |
| unknown path | the client's not-found page, reached through the SPA fallback |

- **Axe:** 7 scans (WCAG 2.0/2.1 A and AA) over every page state above, **0 violations**.
- **Axe negative control:** a page with an unlabelled input, an image without `alt` and no title gives `document-title`, `image-alt` and `label`, exit 1. The scans can therefore fail.
- **F4 negative control:** `playwright test --grep no-such-spec-title` gives `Error: No tests found`, exit 1.
- **Visual check:** I screenshotted the list (`?location=Oslo`) and the detail (`/jobs/cj_2`) pages from the running preview and looked at them. Layout, contrast and focus styles are as intended.
- After each run no `wrangler` or `workerd` process from this worktree remained.

## 5. `audit-program` (run inline: this session has no subagent tool)

- **Linter wiring:** Active (see section 1).
- **Mechanical scans** (checklist.md): the only hits were legitimate.
  - `h.input` and `h.button` appear only inside `@foldkit/ui` `toView` callbacks, spreading the component's attributes.
  - The one `h.label` uses `attributes.label`.
  - The `UpdateReturn` alias is reused by helpers.
  - The `_blank` hit is a fixture URL.
- **Blind spots:** all 26 slugs were walked. Clean except for the items below.

Fixed:

| Where | Finding | Fix |
| --- | --- | --- |
| `main.fixture.ts` | `foldkit(no-child-message-construction-in-root)` ×2 | The fact is applied through the Query's own `update`, importing the Queries through `main.ts`, as in `examples/api-cache-query/src/main.fixture.ts` |
| `update.ts` | repo lint `no-shadow` on `({ message })` | Renamed to `({ message: jobsMessage })`; the repo rule overrides Foldkit's spelling |
| `page/jobs.ts`, `page/job.ts` | QUALITY `repeated-scaffolding`: identical `onIdle`/`onLoading` | `AsyncData.matchData` with `onEmpty` |
| page modules | QUALITY `view-named-after-namespace` | They export `view`/`title`, imported as `JobsPage`/`JobPage`/`NotFoundPage` |
| `api.ts` | QUALITY: error mapping re-tested `typeof error === "string"` after a `catchTag` | One `mapError` on `Predicate.isTagged(error, "NotFound")` |
| `api.ts` | Testability: an inner `Effect.provide(Http.layer)` shadowed the test's stub client | The layer moved to the Query boundary (`query.ts`), so `api.ts` requires `HttpClient` |
| `main.ts` | NICE `dead-variants`: a placeholder `NotFound` route in `init` | `init` builds the Model on the parsed route |

Recorded, not fixed:

- **R1, deliberate deviation from query-sync:** filters apply on submit through `pushUrl`, not on every keystroke through `replaceUrl`. Each applied filter is a history entry, which makes back/forward work, and typing doesn't fetch on every key.
- **R2, NICE:** no pagination. The list shows the first 50 and, when `nextCursor` is set, says "narrow the filters to see others".
- **R3, NICE:** the page title names only the first filter. Dates are shown as raw ISO strings.
- **R4:** the Foldkit path-segment encoding gap in section 3.
- **R5:** the `generate-program` Phase 6 review loop and the audit's subagent fan-out were not run, because no subagent tool is available. This was a single inline pass by the implementer, so the contract's independent review is still needed.
- **Skill vs live source:** the skill's scaffold runs Scene tests under `happy-dom`. With foldkit 0.170 they run on VNodes in the Bun suite with no DOM, so `happy-dom` was dropped.

Self-assessed verdict after fixes: PASS with the recorded NICE items. This is not an independent verdict.

## 6. Gates and counts (by exit code)

| Gate | Before (`983312a`) | After (this commit's tree) |
| --- | --- | --- |
| `vp check` | 0 | 0 (formatting clean; no warnings or lint errors, Foldkit rules active) |
| `vp run test` | 0; Bun 80 files, 664 passed, 4 skipped; workerd 22 files, 109 passed | 0; Bun **84** files, **689** passed, 4 skipped; workerd 22 files, 109 passed |
| `vp run verify` | 0; 18/18 tasks | 0; **19/19** tasks (adds `web:build`); Bun coverage lines 86.57% (app 89.47%) |
| `vp run e2e` | 0, but with **no specs** (`--pass-with-no-tests`) | 0; **6 passed**, 7 Axe scans, 0 violations |

The 25 new unit tests are 8 Story, 10 Scene, 4 route-law and 3 typed-client tests.
