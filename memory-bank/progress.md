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
  with provenance headers (unstaged pending owner integration; evidence in
  `.artifacts/ws-0013/`).

## Known gaps and evidence status

These gaps are current boundaries or evidence limits, not claims that source code is absent where it is implemented:

- **Administrative surface.** API-key principal administration (quotas, revocation, audit log), owned saved-search webhook subscriptions/delivery, and corpus maintenance (audit/dry-run reconcile/purge) are not implemented in the TypeScript service. The unused `ADMIN_SYNC_TOKEN` production gate and secret binding have been removed rather than pretending that a credential protects absent routes.
- **Scheduled ingestion.** On 2026-08-13 the current dirty candidate passed a new bounded public NAV run: one page, five observations, four canonical changes, one persisted cursor advance, 1,861 ms, no run failures, and no duplicate `(sourceId, externalId)` groups. Staging schedules were disabled immediately afterward. Earlier revision `c00d67d` also has four one-page run reports.
- **Production qualification.** Current evidence covers realistic-corpus local query plans and backup/restore plus current staging deployment, HTTP smoke, a complete authenticated owner-scoped mutation journey, and a bounded NAV checkpoint. The TypeScript status route and a complete-table managed D1 recovery command now exist and pass local/live-D1 tests; their staging soak and managed remote restore remain unexecuted. Seven-day soak, successful Cloudflare D1 recovery, NAV credential rotation, production smoke, and independent G5 review remain open.
- **Staging evidence.** The current dirty candidate serves NAV data from D1 `967bfbad-4577-437c-945e-54c023154b8a`; `.deploy/staging.json` records configuration SHA-256 `ec620f078f963d30dfd1aeeb394a340203fe1aacd931d04afa8131b3f44b8ad9`. Because `source_code_url` is null, this evidence is not tied to an immutable source revision.
- **OpenAPI contract.** `openapi/job-index-v1.json` is not a current generated artifact; nothing currently generates a replacement from `apps/worker/src/Api.ts`.
- **PR preview evidence.** Source, policy checks, local seeded E2E, and the full repository gate pass at `b5c23c9`. Provider provisioning and teardown are not yet proven because this checkout has no configured Git remote, so a PR workflow cannot be triggered.

## Current stabilization focus

Realistic-corpus local and current staging journey evidence are established.
The soak runner now has a tested TypeScript status contract, and the managed
D1 recovery procedure now enumerates and verifies the complete generated
schema. Repaired staging deployment, seven-day soak, and an authorized remote
restore drill are next. Production qualification remains open.

## Next work

- Complete TypeScript production qualification without enabling production schedules before its remaining gates pass.
- Decide separately whether to port administrative capabilities and generate a replacement OpenAPI contract.
- After MVP stabilization, evaluate future candidates from the [product vision](../docs/internal/product/vision.md): ATS-friendly document assistance and bounded Cloudflare Agents SDK/browser/computer-control support. These are not committed architecture, and submission still requires explicit human approval.
