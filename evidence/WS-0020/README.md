# WS-0020 evidence: NAV-to-client market-index baseline (TB-00)

Scope: [WS-0020@1](../../work/WS-0020-r1-market-index-baseline.md) with lead
amendments L1–L4, under [RFC 0016](../../docs/internal/rfcs/0016-read-only-norwegian-market-index.md)
(accepted with amendments A1–A4). This is a characterization of current
behaviour only. It contains no runtime, schema, migration, route, identity or
policy change.

Status: **implementation complete, awaiting independent review and the human
gate.** The implementing agent does not approve its own gate.

## Pinned baseline

| Item | Value | How established |
| --- | --- | --- |
| Starting commit | `25bb8e9879034a59388446e78ed9f11c47038397` on `claude/clever-heisenberg-lwui1b` | `git rev-parse HEAD` before any change |
| `main` / `origin/main` | `881eb40` (WS-0019 integration) | `git log`, remote-tracking refs at this checkout |
| Bun | 1.4.4 | `bun --version` |
| Effect | `4.0.0-rc.108` (exact pin, installed version matches) | `package.json`, `node_modules/effect/package.json` |
| Vitest | 4.1.10 | `node_modules/vitest/package.json` |
| `@cloudflare/vitest-pool-workers` | 0.20.3 | `package.json` |
| Wrangler | 4.120.0, transitive through the pool (not a root dependency) | installed package metadata |
| Miniflare / workerd | `5.20260801.1-alpha` / `1.20260801.1` | installed package metadata |
| Worker compatibility date (tests) | `2026-05-25` | `dev/test.wrangler.jsonc` |
| TypeScript | 5.9.3 | installed package metadata |
| Node for the workerd half | 24.21.0 via `nix shell nixpkgs#nodejs` (`bun run check`); 22.23.4 ambient for direct runs | `node --version` in each |

## Evidence levels

- **Source-only:** read in source at the pinned commit, not executed.
- **Local-test-verified:** executed in this session, inside workerd against
  a local D1 built from `db/schema.sql`, with deterministic fixtures.
- **Staging/production:** **none.** This session had no Cloudflare
  credentials, no deployed resources, and no network access to NAV. Nothing
  here says what any deployed stage runs. Memory-bank claims about staging
  gates at `dfa0fe3` were not re-verified.

## Characterization tests added

File: [`apps/worker/src/handlers/navToClient.live.test.ts`](../../apps/worker/src/handlers/navToClient.live.test.ts),
run by the workerd project (`vitest.workers.config.ts`). It is excluded from
the Bun project (`vitest.config.ts`), like every other `*.live.test.ts`.

The tests use real components: the generated catalogue seed
(`db/catalog-seed.sql`), the NAV adapter decoding `fixtures/nav/feed-page.json`
and `detail-active.json`, the adapter registry, `Acquisition`, `Ingestion`,
`Corpus`, `Hydration`, D1, and the real `SourceLeaseObject` Durable Object.
The public list read goes through **the Worker's default export**
(`apps/worker/src/index.ts` `fetch`). The one substitution is the NAV
`HttpClient` and credential. A scripted client answers only the NAV URLs from
fixtures and dies on any other request. Layer wiring mirrors
`runtime/Layers.ts:146-185`, except that no `since` retention boundary is
passed. Fixture variants (second uuid, edited text, INACTIVE status, empty
tail page) are derived in code from the checked-in fixtures. No new fixture
files were added.

| # | Test (abridged) | What it proves |
| --- | --- | --- |
| T1 | ACTIVE NAV entry reaches `GET /api/v1/jobs` through the real Worker | Feed → adapter → ingestion → D1 → public read works. The source reference is `sources: ["nav"]` plus `applicationUrl = https://arbeidsplassen.nav.no/stillinger/stilling/<uuid>`. No occurrence id, `platformId`, `externalId` field or seen-timestamps are exposed. The INACTIVE entry is never observed. Exactly 2 NAV requests (feed root, tail). The public read does not call `waitUntil`. |
| T2 | Replaying the identical observation | Report `canonicalChanges: 0`, `highestSequence: 0`. `MAX(sequence)`, the full `canonical_jobs` row and the public page are unchanged. `?cursor=<seq>` returns `[]`. One occurrence (same id and `firstSeenAt`, `lastSeenAt` may advance). Two `ingestion_runs` rows. |
| T3 | Modification and closure | A feed `content_text` edit yields `UpdatedCanonical` (sequence +1), but **only `sequence`/`changedAt` differ publicly**. NAV marking the entry `INACTIVE` closes it at the tail via `closeAbsent` (sequence +1, occurrence `active=0`). The unfiltered public list still returns it with status `Closed`. |
| T4 | **L1: characterizes known identity risk D05 (not desired behaviour)** | Two NAV adverts with different `externalId` but equal title/employer/location share one `canonicalJobId`: one `canonical_jobs` row, two `occurrences`, one public job, `sources: ["nav"]`, sequence 2. The second uuid is invisible publicly. When NAV drops one of the two, nothing changes publicly (`canonicalChanges: 0`, sequence unchanged, still `Active`). |
| T5 | `GET /api/v1/jobs/:id` is not read-only | Opening an unhydrated vacancy makes **one NAV detail request** and writes D1. It replaces the NAV posting URL with the employer URL (`https://careers.example/jobs/100?utm_source=nav`, tracking parameter kept) and **does not advance `sequence` or `changedAt`**. Change-cursor clients never see the change. A second open makes no request. Driven through `buildHandler` (real API and handlers), not the default export, because the production client would make a real network call. |
| T6 | `armsGate` at the real Worker entry point (L2) | `/api/v1/jobs`, `/api/v1/jobs/:id` and `/api/v1/sources/catalog` call `waitUntil` 0 times. `/api/v1/me/feed` and `/api/v1/me/matches/:id` call it once **even unauthenticated (401)**. A fresh gate marker keeps the armed attempt `WithinFloor`, and the catalogue is empty in this test, so it cannot reach NAV. |

L2 citation. The predicate is `apps/worker/src/index.ts:193-194`, applied by
path only after the response at `index.ts:206-211`. It is already pinned as a
pure function by `apps/worker/src/ingestion/lazy.live.test.ts:239-266`, which
covers `/api/v1/jobs`, catalog, status and health. T6 adds the entry-point
behaviour that test does not cover: the real `fetch`/`waitUntil`,
`/api/v1/jobs/:id`, and arming on 401.

Falsifiability check. Inverting T4's shared-id assertion and T6's arming count
made exactly those 2 tests fail (4 passed). Both were restored before the
commit.

## Source-to-client map (pinned commit)

| Stage | Location | Observed behaviour (level) |
| --- | --- | --- |
| Registry / policy | `db/catalog-seed.sql:10` (generated by `scripts/ts/catalog.ts`); `apps/worker/src/catalog/index.ts` | NAV row: `tierTag Feed`, `policyTag Unreviewed`, `feedUrl https://pam-stilling-feed.nav.no/api/v1/feed`. Ingestion starts from `feedUrl` (`ingestion/collect.ts:97-102`). Acquisition and ingestion never read `policyTag`; the `Policy` service is used by applications (`applications/applications.ts:61`). T1 ingests with `Unreviewed`. (local-test-verified) |
| Adapter registration | `apps/worker/src/runtime/Layers.ts:164-174`; `packages/adapters/src/Registry.ts:39` | Only NAV is registered, on the Feed tier. Tier comes from the catalogue (`acquisition/index.ts:31-55`). (local-test-verified) |
| NAV adapter | `packages/adapters/nav/src/index.ts:114-142` (`page`), `:144-160` (`hydrate`); `decode.ts:37`, `:103` | One request per feed page, `pageSize=5`. Only ACTIVE entries become summary listings, `hydrated: false`, `applicationUrl` = NAV posting URL. Detail only on `hydrate`. (local-test-verified) |
| Acquisition dispatch | `apps/worker/src/acquisition/index.ts:27-58` | Resolves tier → registered adapter. (local-test-verified) |
| Ingestion / checkpoint | `apps/worker/src/ingestion/collect.ts:72` (`makeCollect`), `:225` (per-page checkpoint), `:261` (`closeAbsent` at tail only) | Lease (Durable Object) → walk pages → observe each → checkpoint → close absent only when the sweep reaches the tail → reset cursor. (local-test-verified; multi-run sweep accumulation by existing `ingestion/live.test.ts:313`) |
| Lazy activation | `apps/worker/src/index.ts:193-211`; `ingestion/lazy.ts:21-26` (budget `maxPages: 1`), `:79-90` (floor claim) | The only runtime trigger. It arms after any response on `/api/v1/me/feed` or `/api/v1/me/matches/*`, with a 6-hour attempt floor. (local-test-verified) |
| Scheduling | `infra/alchemy.run.ts:144` (`CRONS = []`); `index.ts:222` (`scheduled`, local preview only) | **No operator-independent scheduling is declared.** (source-only) |
| Storage | `db/schema.sql:151` (`canonical_jobs`), `:178` (`occurrences`), `:288` (`source_state`), `:297` (`ingestion_runs`), `:322` (`ingestion_gate`) | Raw feed payloads are not retained; only derived canonical/occurrence rows and fingerprints. (source-only, plus row reads in T1–T4) |
| Identity / decide | `apps/worker/src/corpus/identity.ts:128` (`deriveCanonicalKey`), `:138`, `:156`; `corpus/decide.ts:85-205`; `corpus/observe.ts:43-84` | Canonical id is a pure function of normalized title + employer + location. The occurrence id is source + externalId. Sequence advances on create, duplicate occurrence, content change, reopen and close. It does not advance on `Unchanged` or hydration. (local-test-verified) |
| Hydration | `apps/worker/src/hydration/index.ts:55-97`; `corpus/hydrate.ts:47-70` | On-demand NAV detail fetch under a Durable Object lease. It writes `applicationUrl`/description/deadline with no sequence change. (local-test-verified) |
| Query API | `apps/worker/src/Api.ts:358-378` (corpus group); `handlers/corpus.ts:26-61`; `handlers/wire.ts:31-38` | `listJobs`: `changedSince` (sequence keyset) or `search` (term/location/status). `getJob`: `Hydration.hydrate`. The wire shape is `CanonicalJob` (`packages/domain/src/Job.ts:120-132`). (local-test-verified) |
| Web | `apps/web/src/Commands.ts:73` (`listJobs`), `:97` and `:121-136` (`getJob`, including hover prefetch); `apps/web/src/view/JobDetail.ts:75-86` | The UI shows `applicationUrl` as "Original listing" and does not render `sources`. **Hover prefetch calls `getJob`, which can trigger a NAV fetch and a D1 write.** (source-only; not executed in a browser in this session) |

## Public versus personal API boundary (`apps/worker/src/Api.ts`)

| Group | Auth | Routes | Writes |
| --- | --- | --- | --- |
| `ingestion` (`:348`) | none | `GET /api/sources/nav/status` | none |
| `corpus` (`:358`) | none | `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `GET /api/v1/sources/catalog` | `getJob` may fetch NAV detail and write `canonical_jobs` (T5) |
| operational (`index.ts:54-74`) | none | `GET /api/health`, `GET /api/about` | none |
| `feed` (`:387`, `Authenticated` `:415`) | bearer | `GET /me/feed`, `GET /me/matches/:id`, `POST /me/feed/:id/dismiss` | dismiss writes judgements. Both GETs arm lazy ingestion even on 401 (T6). `getMatch` hydrates like `getJob`. |
| `profile` (`:448`, `:542`) | bearer | `GET /me`, `/me/profile/export`, `/me/workspace/export`; `PUT /me/privacy/ai-consent`, `/me/profile`, `/me/answers/:question`, `/me/profile/import` | personal profile state |
| `applications` (`:552`, `:647`) | bearer | `POST /me/saved`, `/me/saved/:id/draft`, `/me/saved/:id/apply`, `/me/applications/:id/decision`, `/me/saved/labels`, `/me/applications/:id/events`; `PATCH`/`DELETE /me/saved/labels/:id`; `PUT /me/saved/:id/labels`; GETs | saved jobs, labels, applications |
| `proposals` (`:697`, `:732`) | bearer | `POST /me/profile/proposals`, `/me/profile/proposals/:id/decision`; `GET` list | profile proposals |
| `documents` (`:790`, `:823`) | bearer | `POST`/`GET /me/documents`, `GET`/`PUT .../:id/content`, `DELETE .../:id` | documents |
| `account` (`:834`, `:842`) | bearer | `DELETE /me/account` | erasure |

Under RFC 0016, every `/api/v1/me/*` group is personal application state outside
the read-only index. They are frozen by D02 and were not changed. No
session-issuing route is declared in `Api.ts`.

## Commands and outcomes

| # | Command | Outcome |
| --- | --- | --- |
| 1 | `node node_modules/.bin/vitest run -c vitest.workers.config.ts` (baseline, before changes) | PASS: 21 files, 103 tests |
| 2 | `bun run test` (baseline) | PASS: 88 files, 807 passed, 4 skipped |
| 3 | `nix shell nixpkgs#nodejs -c node --version` | v24.21.0, so the `test:workers` Nix path resolves here |
| 4 | `node node_modules/.bin/vitest run -c vitest.workers.config.ts apps/worker/src/handlers/navToClient.live.test.ts` | PASS: 6/6 |
| 5 | Same, with T4 and T6 key assertions temporarily inverted | 2 failed, 4 passed, as intended; restored |
| 6 | `bun run check` (attempt 1) | FAIL: (a) the new file was collected by the Bun project (6 failures), fixed by adding it to `vitest.config.ts` `exclude`; (b) intermittent `apps/worker/src/drafting/studio/keys.test.ts` property failure (gap G14) |
| 7 | `bun node_modules/vitest/vitest.mjs run apps/worker/src/drafting/studio/keys.test.ts` ×6 | PASS 14/14 each time |
| 8 | `bun run check` (attempt 2) | **PASS**: fmt, lint, imports, typecheck, schema, catalog and bundle checks; Bun coverage 88 files, 807 passed, 4 skipped; workerd coverage 22 files, 109 passed |
| 9 | `python3 scripts/check_repo.py` | **PASS** (JSON files and documentation links); rerun after these docs |
| 10 | `nix develop -c ./scripts/check.sh` | **Could not start**: the flake's pinned nixpkgs tarball returned HTTP 403 through this session's proxy |
| 11 | `nix shell nixpkgs#shellcheck -c ./scripts/check.sh` | PASS with registry shellcheck 0.11.0. This is **not** the flake-pinned toolchain. |
| 12 | `./bootstrap verify` | **Not run**: it needs `nix develop`; see #10 |

No command contacted NAV, Cloudflare or any job source. No logs containing
secrets or personal data were produced or retained.

## Gap table

Level: S = source-only, L = local-test-verified, P = staging/production (none
available in this session).

| ID | Finding | Level | Pointer | Conflict with RFC 0016 boundary | Proposed follow-up (separate ticket) |
| --- | --- | --- | --- | --- | --- |
| G1 | The public source reference is the source id (`"nav"`) plus `applicationUrl`. NAV's uuid is visible only while the job is unhydrated. No occurrence-level provenance is exposed. | L | T1, T5 | "Provenance accompanies every result" is only partially met | Provenance exposure ticket (minimum public source detail, RFC open question 6) |
| G2 | `GET /api/v1/jobs/:id` fetches NAV detail and writes D1. Web hover prefetch calls it. | L (web: S) | T5; `Commands.ts:121-136` | Public queries read-only; "no read-initiated fetch" | Move detail hydration off the public read path |
| G3 | Hydration changes public fields without advancing `sequence`/`changedAt` | L | T5 | Change cursors miss changes (TB-03) | TB-03 |
| G4 | A feed-text edit advances `sequence` while every visible field stays the same | L | T3 | Phantom semantic change | TB-03 (fingerprint versus projected fields) |
| G5 | **D05**: same title/employer/location with different uuid gives one canonical. One requisition closing is invisible. NAV `positioncount` (recorded `fixtures/nav/live-detail.json`: `"3"`) is not decoded. | L (positioncount: S) | T4; `identity.ts:128` | "Ambiguous duplicates do not merge without evidence" | TB-02 identity adversary; needs a canonical-ID migration WorkScope |
| G6 | The lazy gate arms on unauthenticated `/me/feed` and `/me/matches/*` (401). The predicate is path-only, although the comments at `index.ts:186-191` and A2 say "authenticated". Bounded by the 6-hour floor. | L | T6; `index.ts:206-211` | A2 wording; refresh still coupled to client reads | Record with TB-05; do not fix here |
| G7 | No operator-independent schedule: `CRONS = []` | S | `infra/alchemy.run.ts:144` | Invariant 6 (accepted deviation under A2) | TB-05 |
| G8 | The lazy budget is 1 page per attempt, so closure needs a multi-attempt sweep to reach the tail. Closure latency scales with traffic × page count. | S (+ existing L for accumulation) | `lazy.ts:21-26`; `ingestion/live.test.ts:313` | Freshness and retraction semantics | TB-05 |
| G9 | `policyTag` (NAV: `Unreviewed`) does not gate acquisition | L | T1; `catalog-seed.sql:10` | "Reviewed source registry/policy" | Source-policy contract ticket (RFC open question 3) |
| G10 | Closed vacancies stay in the unfiltered public list | L | T3 | Retention/publication rules undefined | Retention ticket |
| G11 | Workload/extent is absent from the feed summary. NAV detail carries categorical `extent` (`"Deltid"` in the recorded live detail), which is not decoded and has no column. | S | `nav/src/schema.ts`; `fixtures/nav/live-detail.json` | Needed for TB-01 | TB-01 (below) |
| G12 | Production passes a retention-boundary `since` to the adapter; these tests pass none. The `If-Modified-Since` path is not characterized here. | S | `Layers.ts:169-173` | none | Covered by the adapter's own tests, if anywhere; not re-verified |
| G13 | No staging or production evidence for the current revision | P: none | — | Live freshness unverified | Separate stage gate |
| G14 | Intermittent property failure in `drafting/studio/keys.test.ts` (WS-0019 b). Seed `-853745973`; counterexample has the same string (`"ring"`) for `headline` and `location`. Passes on rerun. | L | check log, attempt 1 | none (outside the index) | Flaky/defect ticket in WS-0019 scope |
| G15 | `nix develop` and therefore `./bootstrap verify` cannot run in this container (403 on the pinned nixpkgs) | L | commands #10, #12 | The CLAUDE.md deployment-claim rule; no deployment is claimed | Environment/network allowlist |
| G16 | Stale context docs outside L4 scope: `memory-bank/techContext.md:6` says `beta.104` (actual `rc.108`). `projectbrief.md`, `productContext.md` and `techContext.md` say production declares a NAV cron, but `CRONS = []`. | S | files cited | Context drift | Owner-approved doc refresh (not edited here) |

## Proposed next Ticket: TB-01, workload filtering

**Outcome.** A client can ask the public index for Oslo vacancies advertised
at 40–60% workload, through `GET /api/v1/jobs` and the web client, with
identical results. Each result states its workload as evidence: a percentage
or range, a source category (for example NAV `Heltid`/`Deltid`), negotiable,
contradictory, or unknown. Unknown is never treated as full-time.

**Facts from this baseline that shape it.** NAV's feed summary has no extent
(G11). NAV detail has a categorical `extent`, not a percentage, and detail
arrives only through hydration on a public read (G2). A D05 merge can
combine two requisitions with different extents (G5). The ticket must
therefore decide, with owner approval, where workload is acquired (an
ingestion-time detail fetch has a request-budget cost; see
`nav/src/index.ts:107-113`) and what "40–60%" means for categorical-only
evidence. That decision belongs in the TB-01 WorkScope, not here.

**Falsifier.** Any of these fails the ticket: a vacancy with no extent
evidence appears under a percentage filter without an explicit
include-unknown option; a `Deltid` vacancy is reported as 40–60% without
percentage evidence; a 40–80% range is included or excluded contrary to the
documented overlap rule; API and web results differ for the same query.

**Acceptance tests.** Fixture cases for 50%, 40–80%, 100%, Heltid only,
Deltid only, unknown, negotiable, and contradictory (two occurrences). API
filter tests plus a web parity test. Replay of an unchanged observation is
still `Unchanged` (extend T2). A migration test shows the new representation
is additive and nullable. No canonical-ID change.

**Rollback.** Revert the PR. An additive nullable column and an optional query
parameter can stay unused, so no canonical IDs, existing rows or existing
query behaviour change. Risk tier: elevate to R2, because it changes the API
and schema.

## Remaining risks and required gates

- **Independent review:** a separate reviewer should re-run commands 4, 8 and 9
  from a clean checkout of the WS-0020 commit.
- **Human gate:** accept or reject this baseline and decide whether TB-01 is
  scoped next. G2, G5 and G6 are recorded deviations, not fixes.
- **Network-free claim scope:** the scripted client guarantees no NAV request
  from the pipeline under test. T6 additionally relies on the gate floor and
  an empty catalogue; it does not stub `globalThis.fetch`.
