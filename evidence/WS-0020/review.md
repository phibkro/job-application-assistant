# Independent review: WS-0020@1, commit `b601267` (parent `25bb8e9`)

Reviewer: independent review agent. I worked read-only toward the repository; all scratch work is under `/tmp`. `git status --porcelain` in the repository was empty at the start and is empty at the end (0 lines).

**Revision note.** During the review, another session committed `cbf6efa` ("docs(agents): set durable subagent model selection rule") on top of `b601267` at 16:21:43Z. It touches only `AGENTS.md` (+12 lines). I made no commits. Here is which revision each result applies to:
- The in-repo single-file test run (16:17:58Z) ran at `b601267`.
- In-repo `bun run check` started at about 16:18Z and may have finished at `cbf6efa`. `AGENTS.md` is outside every check step (fmt and lint cover `packages`/`apps`, plus typecheck and tests), so the result applies to the `b601267` code.
- In-repo `check_repo.py` ran at `cbf6efa`. I therefore reran it on a `git archive b601267` copy, and it passed there too.
- All mutation runs and full-suite comparisons used `git archive` copies of exactly `b601267` and `25bb8e9`.

This review covers `b601267` only. `cbf6efa` was not reviewed, and if the owner pushes the branch it goes with it.

## Verdict: ACCEPT WITH NITS

The commit is confined to tests, test configuration, evidence and memory-bank docs. No runtime, schema, migration, canonical-ID, route, `infra/` or policy file changed. The new workerd test file exercises the real Worker + D1 path it claims to, and four source-behavior mutations each failed exactly the intended test. All three prescribed commands pass with the counts the evidence reports. Every evidence citation I checked is correct (25 confirmed, 0 wrong; one also partly unverifiable). Two claims are worded more broadly than what was verified. The memory-bank edits are factual corrections that I confirmed, but one sentence asserts more than the evidence can support, and one edit leaves nearby unedited text inconsistent. None of the findings blocks integration.

## Findings

| # | Severity | File:line | What's wrong | Suggested fix |
|---|---|---|---|---|
| F1 | minor | `memory-bank/progress.md:58` | "No staging or production evidence exists for the current revision" claims that something does not exist. WS-0020 had no staging or production access, so it can only say it *found or produced* none. Same overclaim class the brief warns about, inverted. | Reword: "WS-0020 had no staging/production access and produced no staging or production evidence for the current revision." |
| F2 | minor | `memory-bank/activeContext.md:112-116`, `memory-bank/progress.md:57,77-78` | The edit removes "open the Cloudflare cron support ticket" and calls it moot. This matches the existing WS-0017 text and `CRONS = []`. But the unedited lines right after it still say "After platform dispatch works, rerun one bounded checkpoint…", and `progress.md:57` still says "The seven-day soak depends on the dispatch fix". The section now contradicts itself. This is not a new product decision, but the memory bank no longer reads consistently. | Don't widen L4 scope. Ask the owner to resolve it in the doc refresh G16 already proposes, or add one clause saying the dispatch-dependent soak wording predates WS-0017. |
| F3 | nit | `memory-bank/activeContext.md:67-69` | The WS-0020 `bun run check` counts (807/4 Bun, 109 workerd) sit inside the **WS-0016** bullet, so they read as WS-0016 evidence. "At `25bb8e9` plus WS-0020's test" means `b601267`. | Move the sentence into the WS-0020 bullet and cite `b601267`. |
| F4 | nit | `evidence/WS-0020/README.md:149,165` | "NAV detail has a categorical `extent`, not a percentage" rests on one recorded detail (`fixtures/nav/live-detail.json`). I confirmed it holds for that fixture: `extent: "Deltid"`, `engagementtype: "Fast"`, `positioncount: "3"`, and no percent field or `%` anywhere. Whether NAV ever sends a percentage field cannot be checked offline. TB-01 will rely on this claim. | Qualify: "in the recorded live detail; whether NAV exposes a percentage field elsewhere is unverified." Have TB-01 confirm it against the NAV feed spec. |
| F5 | nit | `apps/worker/src/handlers/navToClient.live.test.ts:296-299` | T1 pins exact request URLs, including `?pageSize=5` (`FEED_PAGE_SIZE`, `nav/src/index.ts:28`). That is an adapter tuning constant, not part of the NAV→client behavior. Changing the page size would fail this characterization test. | Acceptable as is. Optionally assert hosts and paths and leave `pageSize` out. |
| F6 | nit | `navToClient.live.test.ts:514-549`; README `:196-198` | T6 drives the real default export, which uses the production `FetchHttpClient`. In this container workerd reported "Proxy environment variables detected. We'll use your proxy for fetch requests", so it can reach the network. Two guards keep NAV unreachable: the fresh gate marker (`WithinFloor`) and an empty catalogue. Both hold, and the README discloses this, but neither guard is enforced as a network denial. | Optional: add a test-local assertion that the catalogue is empty before driving the paths, or note the reliance in the test header. |
| F7 | nit | `navToClient.live.test.ts:467-512` | T5 drives `getJob` through `buildHandler`, not the Worker's `handlerFor(env)`. It therefore proves the handler + `Hydration` + D1 write, not the production composition. The README and test header disclose this. I confirmed by reading source that production wires the same `Hydration` over the same `Acquisition` (`Layers.ts:164-178`), so the memory-bank claim "Public `GET /api/v1/jobs/:id` can fetch NAV detail and write D1" holds. | None required. Optionally label the claim "local-test (handler) + source (composition)". |
| F8 | nit | `evidence/WS-0020/README.md:89` | The Identity/decide row lists "reopen" under local-test-verified, but none of T1–T6 exercises a reopen. It is covered by existing suites that ran in `bun run check` (`corpus/decide.test.ts`, `corpus/live.test.ts`, both reference `ReopenedCanonical`), so the label holds. | Name those two tests for the reopen case. |

No blocker or major findings.

## 1. Confinement

`git diff --stat 25bb8e9 b601267`: 6 files, +789/−20.

- `A apps/worker/src/handlers/navToClient.live.test.ts` (550 lines, test only)
- `A evidence/WS-0020/README.md`
- `M memory-bank/activeContext.md`, `M memory-bank/progress.md`
- `M vitest.config.ts` (+1), `M vitest.workers.config.ts` (+1)

No file under `apps/*/src` changed apart from the new `*.test.ts`. Nothing changed under `db/`, `infra/`, `policy/`, `packages/`, `openapi/` or migrations. No fixture files were added: fixture variants are built in code from the checked-in `fixtures/nav/*.json`.

**Vitest config edits.** Each one adds exactly the line `"apps/worker/src/handlers/navToClient.live.test.ts"`:
- `vitest.config.ts`: appended to the Bun project's `test.exclude` list.
- `vitest.workers.config.ts`: appended to the workerd project's `test.include` list.

No other include, exclude, coverage, threshold or setup entry changed. Nothing existing was excluded, weakened or skipped. I checked this empirically:
- Bun suite: parent copy 88 files, 807 passed, 4 skipped. `b601267` (in `bun run check`): 88 / 807 / 4. Identical.
- Workerd suite: parent copy 21 files, 103 passed. `b601267` copy: 22 files, 109 passed. Exactly +1 file and +6 tests.
- Coverage thresholds are unchanged and passed.

## 2. Tests are real

**Path exercised (read in source).**
- Per-test D1 is reset and the schema reapplied (`testSupport/workersSetup.ts`, `reset()` + `applySchema` in `beforeEach`).
- The real catalogue seed is loaded, and the real NAV adapter decodes the checked-in fixtures.
- The real `Acquisition`, `Ingestion`, `Corpus`, `Hydration` and `SourceLeaseObject` Durable Object run inside workerd.
- `GET /api/v1/jobs` goes through the Worker's real default export (`worker.fetch`).
- The only mock is the NAV `HttpClient`. It answers 3 scripted URLs and `Effect.die`s on anything else, so it records requests but has no logic. The credential is a dummy (`"fixture-token"`).

**No tautologies found.** Assertions compare D1 rows and the public JSON against fixture-derived constants or against earlier snapshots.

**Mutation checks.** These ran in a `git archive b601267` copy at `/tmp/ws20-copy`, never in the repository. Each mutation was applied, run and restored from backup. Afterwards the copy's `apps/worker/src` md5 matched `git archive b601267` (`cb5e3583…`).

| ID | Mutation | Expected to fail | Result |
|---|---|---|---|
| A1 | Assertion flip: T2 replay `canonicalChanges: 0` → `1` | T2 | 1 failed (T2), 5 passed |
| A2 | Assertion flip: T3 `toEqual(["Closed"])` → `["Active"]` | T3 | 1 failed (T3), 5 passed |
| B1 | Source: `armsGate` drops `/api/v1/me/matches/` (`index.ts:194`) | T6 | 1 failed (T6), 5 passed |
| B2 | Source: `deriveCanonicalKey` also includes `externalId` (D05 "fixed", `identity.ts:128`) | T4 | 1 failed (T4), 5 passed |
| B3 | Source: `hydrateDetail` persists the unhydrated row (getJob becomes read-only, `corpus/hydrate.ts`) | T5 | 1 failed (T5), 5 passed |
| B4 | Source: arm only when `response.status < 400` (auth-gated arming, `index.ts:208`) | T6 | 1 failed (T6), 5 passed |

The B mutations show the tests catch real behavior changes, not just flipped expectations. Each mutation failed only its own test.

## 3. Reproduction (commands run, results)

| Command | Where | Result |
|---|---|---|
| `node node_modules/.bin/vitest run -c vitest.workers.config.ts apps/worker/src/handlers/navToClient.live.test.ts` | repo at `b601267` (Node 22.23.4) | **PASS**: 1 file, 6/6 tests |
| `bun run check` | repo at `b601267` | **PASS**, exit 0. fmt, lint, imports, typecheck, schema, catalog and bundle checks passed. Bun coverage: 88 files, 807 passed, 4 skipped. Workerd coverage via `nix shell nixpkgs#nodejs`: 22 files, 109 passed. |
| `python3 scripts/check_repo.py` | repo (HEAD had moved to `cbf6efa`, AGENTS.md only) | **PASS**: "27 JSON files, documentation links valid." |
| `python3 -I scripts/check_repo.py` | `/tmp/ws20-copy` (exact `b601267`) | **PASS**: "25 JSON files, documentation links valid." The two extra JSON files in the repo are gitignored and untracked; the working tree is clean. |
| Same single-file vitest run | `/tmp/ws20-copy` (`git archive b601267`) | PASS 6/6 (clean-checkout reproduction) |
| Full workerd suite `vitest run -c vitest.workers.config.ts` | `/tmp/ws20-parent` (`25bb8e9`) / `/tmp/ws20-copy` (`b601267`) | 21 files, 103 tests / 22 files, 109 tests, all passing |
| `bun node_modules/vitest/vitest.mjs run` | `/tmp/ws20-parent` | 88 files, 807 passed, 4 skipped |
| 6 mutation runs | `/tmp/ws20-copy` | see the table in section 2 |
| `nix shell nixpkgs#nodejs -c node --version` | repo | v24.21.0 |

I did not attempt `nix develop` or `./bootstrap verify`, per the brief (proxy 403). Each command passed on its first attempt. The flaky `keys.test.ts` failure the evidence reports (G14) did not occur in my run.

## 4. Citations and claims checked (at `b601267`)

| # | Claim (README location) | Status |
|---|---|---|
| 1 | `armsGate` predicate is `index.ts:193-194`: `=== "/api/v1/me/feed" \|\| startsWith("/api/v1/me/matches/")` (L66, map L86) | **Confirmed** |
| 2 | Arming is applied by path only, after the response, at `index.ts:206-211` (`if (armsGate(pathname)) ctx.waitUntil(...)`, with no auth or status check) (L66, G6) | **Confirmed** in source, by T6, and by mutation B4 |
| 3 | The comments at `index.ts:186-191` say "authenticated", and RFC 0016 A2 (`rfcs/0016…:182`) says "only on authenticated personal reads". The behavior also arms on 401 (G6). | **Confirmed** (a real discrepancy between docs and code) |
| 4 | `/api/v1/jobs`, `/api/v1/jobs/:id` and `/api/v1/sources/catalog` never arm (L2) | **Confirmed** by T6 and source |
| 5 | `lazy.ts:21-26` budget `maxPages: 1`; `:79-90` floor claim; 6-hour floor `DEFAULT_ATTEMPT_FLOOR_MS = 21_600_000` | **Confirmed** |
| 6 | `lazy.live.test.ts:239-266` already pins `armsGate` as a pure function for jobs, catalog, status and health | **Confirmed** |
| 7 | `infra/alchemy.run.ts:144` `CRONS = []`; `index.ts:222` `scheduled` is local preview only | **Confirmed** (line 144; used at `:226`) |
| 8 | `GET /api/v1/jobs/:id` calls NAV and writes D1: `handlers/corpus.ts` `getJob` → `Hydration.hydrate` → `acquisition.hydrate` → `corpus.hydrateDetail` → `UPDATE_CANONICAL_JOB` (`corpus/hydrate.ts:47-70`) | **Confirmed** in source, by T5, and by mutation B3 (through `buildHandler`; see F7) |
| 9 | Hydration rewrites `applicationUrl`, description and deadline without changing `sequence`/`changedAt` (G3) | **Confirmed** (`hydrate.ts` spreads `job` and changes only those fields; T5 asserts both stamps are unchanged) |
| 10 | D05: `deriveCanonicalKey` (`identity.ts:128`) is normalized title + employer + location; the occurrence id is source + externalId (`:138`). One canonical row, two occurrences. | **Confirmed** by source, T4 and mutation B2 |
| 11 | Public job wire shape is `CanonicalJob` (`packages/domain/src/Job.ts:120-132`) with exactly 11 fields; no occurrence id, `platformId`, `externalId` or seen-stamps | **Confirmed** (schema fields match `PUBLIC_JOB_FIELDS`; T1 asserts the exact key set) |
| 12 | NAV feed summary has no extent; detail has categorical `extent`, not decoded (G11) | **Confirmed for the fixtures**: `FeedEntry` = uuid/status/title/businessName/municipal/sistEndret; `AdContent` schema does not decode `extent`; `live-detail.json:189-192` has `engagementtype "Fast"`, `extent "Deltid"`, `positioncount "3"`; no percentage key or `%` anywhere. **Unverifiable** for NAV in general (see F4). |
| 13 | `Layers.ts:146-185` `services`; `:164-174` NAV-only Feed registration; `since` = `retentionBoundary` at `:169-173` | **Confirmed** (`:172`) |
| 14 | `db/catalog-seed.sql:10`: NAV row `Feed`, `Unreviewed`, `feedUrl https://pam-stilling-feed.nav.no/api/v1/feed` | **Confirmed** |
| 15 | Acquisition and ingestion never read `policyTag`; `Policy` is used by `applications/applications.ts:61` | **Confirmed** (grep finds no `policyTag`/`Policy` use in `acquisition/` or `ingestion/`; `:61` is `yield* Policy`) |
| 16 | `collect.ts:72` `makeCollect`, `:97-102` start at `feedUrl`, `:225` checkpoint, `:261` `closeAbsent` only at the tail | **Confirmed** |
| 17 | `db/schema.sql` lines 151/178/288/297/322 for the five tables | **Confirmed** |
| 18 | `Api.ts` group lines (348, 358, 387/415, 448/542, 552/647, 697/732, 790/823, 834/842) and routes for the corpus/feed groups | **Confirmed** |
| 19 | Web hover prefetch calls `getJob` (`Commands.ts:121-136`); `JobDetail.ts` shows `applicationUrl` as "Original listing"; views do not render `sources` | **Confirmed** by source (no browser run, as the README states) |
| 20 | `nav/src/index.ts:107-113`: request-budget rationale for no eager detail fetch; `pageSize=5` | **Confirmed** |
| 21 | `acquisition/index.ts:27-58` tier → adapter dispatch; `Registry.ts:39` `resolve`; `decode.ts:37`, `:103` | **Confirmed** |
| 22 | Version table: Effect `4.0.0-rc.108` (package.json and installed), Vitest 4.1.10, pool 0.20.3, Wrangler 4.120.0, Miniflare `5.20260801.1-alpha`, workerd `1.20260801.1`, TS 5.9.3, Bun 1.4.4, Node 22.23.4 / 24.21.0 | **Confirmed** |
| 23 | Baseline command outcomes #1, #2, #4, #8, #9 (21/103, 88/807/4, 6/6, 22/109, check_repo pass) | **Confirmed** by reproduction |
| 24 | `techContext.md:6` says `beta.104`; projectbrief, productContext and techContext still describe a NAV cron (G16) | **Confirmed** |
| 25 | Memory-bank git facts: `f233d75`, `f33348b`, `3b2862a` and `881eb40` are WS-0016…0019 and are in `main`; `main` = `origin/main` = `881eb40`; `d4e10e6`, `d56f5e2`, `ed3c1eb` and `dfa0fe3` are ancestors of `origin/main` | **Confirmed** against local refs. I did not re-fetch the remote, so this matches the README's "remote-tracking refs" caveat. |

Wrong: none. Overbroad: #12 (F4), and the `progress.md` absence claim (F1).

## 5. Memory-bank edits (L4)

These match facts I verified: WS-0016…0019 are integrated (#25), the qualification commits are in `origin/main` (#25), the Effect pin drift (#22, #24), `CRONS = []` (#7), `armsGate` arming including on 401 (#2–#3), and `getJob` writing D1 (#8). The local-only scope is stated: "WS-0020 verified facts (local tests only, no staging or production access)" and "WS-0020 did not re-verify this" for `dfa0fe3`. No accepted product decision is rewritten. Dropping the cron support ticket repeats a WS-0017 decision already recorded in the same file. Flags: F1 (absence overclaim), F2 (left an internal inconsistency), F3 (placement). `techContext.md` was correctly left untouched, since it is outside L4's file list.

## 6. Privacy

- I scanned every added line for email addresses, phone numbers, 8-digit org numbers, tokens, secrets, bearer values, JWT-like strings, home paths and the owner's name. The only hit is the dummy credential `makePrivateNavCredential("fixture-token")`.
- The fixtures used are pre-existing synthetic ones ("Example Technology AS", `careers.example`, `active-vacancy-1`).
- The evidence quotes only `"Deltid"` and `"3"` from `live-detail.json`. That fixture is pre-existing and contains a real employer name and org number, but the evidence does not reproduce them and this commit did not add them.
- No command logs were checked in.

## Could not verify

- Whether NAV's real feed or detail ever carries a workload percentage (for example a `jobpercentage`-style field) beyond the single recorded `live-detail.json`. There was no network access, and the claim matters for TB-01 (F4).
- The intermittent `drafting/studio/keys.test.ts` failure (G14, seed `-853745973`). It did not reproduce in my single `bun run check`, and I did not rerun with that seed.
- The implementer's own falsifiability run (README #5, T4 and T6 inversions). I ran independent mutations instead (section 2), which cover the same tests and more.
- Command #11 (`nix shell nixpkgs#shellcheck -c ./scripts/check.sh`); not run.
- `./bootstrap verify` and `nix develop`; not run, per the brief. As the evidence states, no deployment claim may rest on this revision.
- Freshness of `origin/main`: I read the remote-tracking refs and did not fetch.
- Any staging or production state. The evidence makes no claim about it and I had no access.
