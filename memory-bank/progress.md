# Progress

## Complete

- Proprietary licensing (see RFC 0005/0008 amendments and `LICENSE`).
- Cybernetic ADLC, RFC process, policy, quality gates, and memory bank.
- RFC 0015 strangler migration (WS-0012): `packages/domain/` reproduces canonical identity in Effect Schema; `apps/worker/src/Api.ts` declares and serves every route group; `apps/web/` is the interface; the retired Rust implementation and its obsolete build/test/smoke tooling are historical only.
- TypeScript/Effect service capabilities for canonicalization, provenance, deduplication, replay idempotency, NAV ingestion, incremental saved searches, profiles, drafting, applications, and the browse/save/prepare workflow.
- Generated D1 schema snapshot (`db/schema.sql`) checked by `bun run schema:check`.
- Generated source-catalog seed (`db/catalog-seed.sql`) checked by `bun run catalog:check`, from `scripts/ts/catalog.ts` and the researched platform index/observations.
- Local preview (`just preview`) serving the TypeScript stack with a seeded local D1 and a Wrangler scheduled-event endpoint for bounded real NAV ingestion.
- The approved Job Application Assistant mission and MVP boundary are recorded canonically in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md); context docs link there instead of copying the full decision.
- Scheduled ingestion targets only the Feed tier. NAV requests 5-entry pages, and each scheduled invocation attempts one checkpointable page.
- Runtime NAV credentials use a cached public token or a private secret. A 401 refreshes only the failed token.
- Saved application workspace: durable snapshots, owner-scoped custom labels, presets, compare-and-swap lifecycle events, current/prior attempts, note-preserving event updates, session-epoch isolation for late owner-scoped responses, and the `/saved` interface.
- Ordered D1 migration support: generated snapshots mark current shapes, existing databases apply `migrations/*.sql`, and the runner records only successful migrations.
- TypeScript D1 isolation: staging/production retain the legacy database resource unbound and use a separately identified `TypeScriptDb`, preventing the RFC 0015 cutover from adopting the Rust schema.
- Staging and production deployments build the web and Worker artifacts immediately before Alchemy publishes them. A deploy cannot reuse an artifact from an earlier preview or checkout.
- Local full-stack evidence: real NAV ingestion → checkpoint → browse pagination → search → detail hydration, plus save → draft → assisted preparation → approval → label filter → submission confirmation → Applied preset → history.
- Explainable personal shortlist: explicit role/location/exclusion preferences, deterministic assessment and stable ranking, evidence/concerns on feed and detail, and save/dismiss continuity.
- Seeded browser journey: Playwright exercises profile → ranked feed → detail parity → save/dismiss and runs Axe on the changed screens.
- PR preview lifecycle source: same-repository PRs use isolated `pr-N` Worker/D1/Durable Object stages with deterministic seed data; close events run guarded Alchemy teardown.
- TypeScript local production qualification: `just qualification` seeds 50,000 current-schema vacancies and representative owner-scoped workspace history, asserts current feed/detail/label/history indexes, records timings, and proves backup/restore fingerprints, integrity, foreign keys, and repeated plans.
- WS-0013 design-system port: semantic Material You tokens, theme preference
  module with Profile appearance section, and the responsive
  sidebar/bottom-bar shell in `apps/web`, ported from course-data-platform
  with provenance headers and integrated in `d56f5e2`; evidence is in
  `.artifacts/ws-0013/`.
- WS-0016 S1 document-to-profile inference is implementation-complete but
  UNCOMMITTED/UNTRACKED pending owner integration. Pasted text and PDFs through
  `unpdf@1.8.1` produce deterministic heuristic proposals behind a
  model-inference capability seam; the AI binding is deliberately unprovisioned
  until prompt review. It uses no Firecrawl and performs transient parsing with
  no raw-document retention.
- WS-0016 has owner-scoped pending proposals with evidence/confidence,
  per-field edit/accept/discard UI, atomic D1 profile-first CAS with bounded
  retries, and optimistic revisions for every whole-profile write. `bun run
  check` passed with 681 unit tests passed, 4 skipped, and 84 workerd tests;
  full Playwright passed 2/2 with Axe, responsive, and keyboard journey
  coverage; actual independent R2 review passed. Evidence is in
  `.artifacts/ws-0016/`; scope is
  `work/WS-0016-r1-document-profile-inference.md`. Exactly 18 new paths remain
  untracked, with the empty index restored.
- The approved closed-loop roadmap is WS-0015. S1 is delivered source; S2
  document studio is the next value slice after owner integration of S1.
  Firecrawl Parse is a future escalation tier requiring operator data-processor
  approval and Zero Data Retention. Workers AI provisioning waits for prompt
  review.

## Known gaps and evidence status

These gaps are current boundaries or evidence limits, not claims that source code is absent where it is implemented:

- **Administrative surface.** API-key principal administration (quotas, revocation, audit log), owned saved-search webhook subscriptions/delivery, and corpus maintenance (audit/dry-run reconcile/purge) are not implemented in the TypeScript service. The unused `ADMIN_SYNC_TOKEN` production gate and secret binding have been removed rather than pretending that a credential protects absent routes.
- **Scheduled ingestion.** Gate 2's authenticated owner journey passed, but its bounded NAV checkpoint is blocked by Cloudflare platform cron non-dispatch. The trigger installs and is API-visible, yet this Worker receives no ticks while control Workers on the same account do. Operator escalation to Cloudflare support is required. Staging schedules are off.
- **Production qualification.** Local P1 integration and Gate 1 staging redeploy passed at commit `dfa0fe3` with immutable source provenance. Gate 2's authenticated owner journey passed. Gate 3's authorized disposable complete-table D1 restore drill passed across 22 tables with equal source/target digests, owner invariants, and NAV cursor; the target was deleted. The seven-day soak depends on the dispatch fix. NAV private-token rotation, production smoke/deploy, and independent G5 remain operator/human gates. Production stays blocked.
- **Staging evidence.** The Gate 1 redeploy at `dfa0fe3` has immutable source provenance, and staging schedules are off. Local `main` is four qualification commits ahead of `origin` and unpushed: `d4e10e6`, `d56f5e2`, `ed3c1eb`, and `dfa0fe3`.
- **OpenAPI contract.** `openapi/job-index-v1.json` is not a current generated artifact; nothing currently generates a replacement from `apps/worker/src/Api.ts`.
- **PR preview evidence.** Source, policy checks, local seeded E2E, and the full repository gate pass at `b5c23c9`. The repository now has a configured `origin`; provider provisioning and teardown evidence remains a separate lifecycle gate.

## Current stabilization focus

Local P1 integration, Gate 1's immutable-provenance staging redeploy, Gate 2's
authenticated owner journey, and Gate 3's disposable complete-table D1 restore
drill are established. WS-0017 retires cron-driven ingestion by owner decision
2026-08-25, superseding the bounded NAV checkpoint; the seven-day soak re-points
at lazy-ingestion gate evidence. Production remains blocked on the soak,
NAV private-token rotation, production smoke/deploy, and independent G5 review.
WS-0016 S1 source is complete but awaits owner integration.

## Next work

- **OWNER:** integrate and commit WS-0016, then push the accumulated local commits. After that, S2 document studio is the next WS-0015 value slice.
- **OPERATOR:** open the Cloudflare cron support ticket, rotate the NAV private token, and decide on and remove the leftover active `job-index-preview` cron.
- After platform dispatch works, rerun one bounded checkpoint and begin the seven-day soak. Keep production blocked until all remaining operator/human gates pass.
- Decide separately whether to port administrative capabilities and generate a replacement OpenAPI contract.
