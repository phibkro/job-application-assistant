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
