# WS-0027 evidence: toolchain consolidation (STOPPED at the gate)

Contract: `work/WS-0027-r1-toolchain-devenv-vite-plus-previews.md` (R1, R2, attempt budget 2). Base `d62d5ba`, branch `ws27`.

**Outcome: stopped before any tooling change, and a gate decision is requested.** Two acceptance criteria cannot be met within the contract's exclusions and the brief's constraints. One is "`vp test` reproduces Bun 80/664/4 and workerd 22/109". The other is "a PR gets an Alchemy Workers Preview". Migrating only part of the toolchain would delete glue (`bootstrap`, `justfile`, `scripts/*.sh`) that the deploy and preview paths still need. It would also leave a hybrid that the contract does not describe. So this commit holds only this evidence and the memory-bank state. All exploratory changes (`bun add -d vite-plus@1.4.0`, a temporary `@cloudflare/vitest-pool-workers@0.23.0`) were reverted. `package.json` and `bun.lock` are identical to `d62d5ba`.

Network: `alchemy.run`, `developers.cloudflare.com`, `viteplus.dev` and `devenv.sh` all return `CONNECT tunnel failed, response 403` from the agent proxy. Only `registry.npmjs.org` is reachable. The citations below are therefore the packages' own shipped docs and types, read from installed or `npm pack`-ed tarballs. Cloudflare Previews facts come from the lead's connector excerpt (2026-11-01).

## 1. Baseline (unmodified `d62d5ba`)

| Command | Exit | Result |
| --- | --- | --- |
| `bun node_modules/vitest/vitest.mjs run` | 0 | `Test Files 80 passed (80)`, `Tests 664 passed \| 4 skipped (668)` |
| `node node_modules/.bin/vitest run -c vitest.workers.config.ts` (Node 22.23.4) | 0 | `Test Files 22 passed (22)`, `Tests 109 passed (109)` |

The baseline counts reproduce. The effect-diagnostics line was not re-run here, because it is unchanged since WS-0026.

## 2. Blocker A: `vp test` cannot host the workerd pool (Vite+ gap)

- Every Vite+ release bundles Vitest 5: `npm view vite-plus@<v> dependencies.vitest` gives 1.0.0 → 5.0.1, 1.1.0 → 5.0.3, 1.2.0 → 5.0.4, 1.3.0 and 1.4.0 → 5.0.5. Source: `node_modules/vite-plus/docs/guide/test.md` ("Vite+ depends on Vitest `5.0.5`"; "`vp test` resolves Vitest from `vite-plus`'s dependencies first"). Also `docs/guide/vitest-v5.md` ("Keep coverage providers … at the bundled runner's exact version, `5.0.5`").
- `@cloudflare/vitest-pool-workers` peers on `vitest ^4.1.0` in both 0.20.3 (installed) and 0.23.0 (npm `latest`).
- Attempt 1, `vp test run -c vitest.workers.config.ts` with vite-plus 1.4.0 and pool 0.20.3: **exit 1**. Each of the 22 files reports `(0 test)`, followed by `No test files found, exiting with code 1`, and the pool prints `[vpw:warn] You're running vitest@5.0.5, but this version of @cloudflare/vitest-pool-workers only officially supports vitest ^4.1.0`.
- Attempt 2, the same run with pool 0.23.0: **exit 1**, the same `No test files found`, and 22 `vpw:warn` lines.
- Stopped on this item, as the brief requires. The owner's `vektorprogrammet-reimagined` avoids the pool and drives Miniflare from test support code (`apps/web/test/support/workerRuntime.ts`). Adopting that would rewrite 11 workerd test files, which is outside this contract.

## 3. Blocker B: `vp test` on the Bun suite needs out-of-scope upgrades

- `vp test run` launched by Node: **exit 1**, `9 failed | 71 passed (80)`, `Cannot find package 'bun:sqlite'`. These tests need the Bun runtime (see `vitest.config.ts` and `flake.nix` comments).
- `bun node_modules/vite-plus/bin/vp test run` (Bun as launcher, which the docs do not describe): **exit 1**, `1 failed | 79 passed (80)`, `Tests 539 passed (539)`. The failing file is `packages/better-auth-effect-adapter/src/Adapter.conformance.test.ts`, with `TypeError: undefined is not an object (evaluating 'runner.config')` in `@better-auth/test-utils@1.6.26/dist/test-adapter.mjs:82`. That file holds the missing 125 tests and the 4 skipped ones.
- `@better-auth/test-utils@1.6.26` peers on `vitest ^4.1.10`. The first release that accepts `^5.0.0` is 1.7.15, which requires `better-auth ^1.7.15`. `better-auth` is a dependency of `packages/better-auth-effect-adapter`, so that upgrade is a runtime and application dependency change, which the contract excludes. Coverage would also need `@vitest/coverage-istanbul@5.0.5`.

## 4. Blocker C: Alchemy Workers Previews need an `infra/` Effect re-pin

- `infra/` pins `alchemy@2.0.0-beta.72` and `effect@4.0.0-rc.108`.
- In beta.72, `node_modules/alchemy/lib/Cloudflare/Workers/Worker.d.ts` offers only `version.parent` (`WorkerVersionOptions`). That is a zero-traffic *version* reachable at its version preview URL, and it rejects "locally-hosted Durable Object … classes". That is the mechanism the owner ruled out: preview URLs are not generated for a DO-hosting Worker, and `SourceLeaseObject` lives in this Worker.
- `WorkerPreviewOptions` (`preview: { of, name, message, tag }`; "Locally-hosted Durable Object and Workflow classes *are* allowed: each Preview gets its own isolated namespace") first appears in **beta.78**. Probed with `npm pack` on beta.73, .75, .78, .80 and .83: it is absent in 73 and 75 and present from 78 on.
- `npm view alchemy@<v> peerDependencies.effect`: beta.72 `>=4.0.0-beta.105 || >=4.0.0`; beta.73 and .74 `>=4.0.0-rc.110`; beta.75 to .77 `>=4.0.0-rc.112`; beta.78 and .79 `>=4.0.0-rc.115`; beta.80 to .83 `^4.0.0`; beta.84 `^4.0.5`. Every release with Previews therefore requires moving `infra/` off rc.108. The contract and brief exclude that ("No `infra/` Effect re-pin").
- With an upgrade (beta.83), Alchemy also ships `Cloudflare/Access/Application` and `Workers/WorkerAccess`. That would let the lead's "Previews behind Cloudflare Access by default" constraint be declared in Alchemy, without a dashboard step.
- `wrangler preview` (Wrangler ≥ 4.135, a `previews` block in a wrangler config, plus `wrangler.preview-migrations.jsonc`) would bypass Alchemy. That contradicts the owner decision "Alchemy provisions infra **and** Workers Previews", so it was not used.

## 5. Other findings (not blocking)

- `vp check` with no `vite.config.ts` exits 1: "Found formatting issues in 95 files". This is because it formats the whole tree, while today's `oxfmt` runs on `packages apps` only. Vite+ bundles `oxfmt =0.74.0` and `oxlint =1.89.0`, against the repo's 0.62.0 and ^1.77.0. That is configuration work (`fmt.ignorePatterns`, `lint` from `.oxlintrc.json`), not a capability gap. It was not pursued once A to C were established.
- devenv: not evaluated. The proxy blocks GitHub-pinned Nix inputs (403), the same wall as `nix develop`, and `devenv.sh` is unreachable.

## 6. Gate decision requested (owner)

Choose one or more:

1. **Previews:** approve a revision that allows the `infra/` re-pin. That means `alchemy ≥ 2.0.0-beta.78` and `effect ≥ 4.0.0-rc.115` in `infra/`, or `alchemy 2.0.0-beta.83/84` with `effect 4.x` GA, possibly merged with the existing "`infra/` Effect pin" follow-up ticket. Alternatively, approve `wrangler preview` as a recorded deviation from "Alchemy provisions Previews".
2. **Tests:** accept that `vp test` covers neither suite for now, so both stay on Vitest 4 (`bun … vitest run` and `node … vitest run -c vitest.workers.config.ts`), each with this reason recorded. Alternatively, approve the `better-auth`/`@better-auth/test-utils` 1.7 upgrade and a Miniflare-driven rewrite of the 11 workerd tests as separate tickets.
3. **Scope:** with (2) accepted, a revision R2 could still land devenv, `vp check`, `vp run` tasks and the policy-gate ports, and leave Previews to (1).
