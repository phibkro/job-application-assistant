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
- PR preview lifecycle: same-repository PRs use isolated `pr-N` Worker/D1/Durable Object stages with deterministic seed data. GitHub run `31660070001` attempt 4 provisioned and served the seeded API; close run `31660706629` deleted the Worker and D1 database and verified no matching Durable Object namespace remained.

## Known gaps and evidence status

These gaps are current boundaries or evidence limits, not claims that source code is absent where it is implemented:

- **Administrative surface.** API-key principal administration (quotas, revocation, audit log), owned saved-search webhook subscriptions/delivery, and corpus maintenance (audit/dry-run reconcile/purge) are not implemented in the TypeScript service. `ADMIN_SYNC_TOKEN` is still required by production deploy gates and infrastructure secret bindings, but no TypeScript route currently checks it.
- **Scheduled ingestion.** Revision `c00d67d` passed the full deployment gate and HTTP smoke. Four staged public NAV runs folded one page each, checkpointed the cursor, and wrote run reports in 4.9-7.8 seconds. Staging schedules are disabled after this bounded qualification.
- **Production qualification.** No current TypeScript evidence proves realistic-corpus query-plan capacity, a clean restore drill, or the black-box staging smoke path. Production qualification remains open.
- **Staging evidence.** Revision `c00d67d` passed the full deployment gate and HTTP smoke. The staged corpus API serves NAV data, and scheduled ingestion has current checkpoint and run-report evidence.
- **OpenAPI contract.** `openapi/job-index-v1.json` is not a current generated artifact; nothing currently generates a replacement from `apps/worker/src/Api.ts`.
- **PR preview evidence.** `./bootstrap verify` passes at `f9c7cb9`. GitHub run `31660070001` attempt 4 provisioned PR 2, `/api/health` reported `pr-2`, and `/api/v1/jobs?limit=1` served deterministic seed data. Close run `31660706629` deleted `job-index-pr-2` and `job-index-pr-2-typescript-db`, verified no matching Durable Object namespace remained, and the former endpoint returned HTTP 404.

## Current stabilization focus

Remote staged NAV ingestion is qualified for bounded one-page runs. The current
focus is realistic-corpus query-plan evidence, a clean restore drill, and the
black-box staging smoke path. Production qualification remains open.

## Next work

- Complete TypeScript production qualification without enabling production schedules before its remaining gates pass.
- Decide separately whether to port administrative capabilities and generate a replacement OpenAPI contract.
- After MVP stabilization, evaluate future candidates from the [product vision](../docs/internal/product/vision.md): ATS-friendly document assistance and bounded Cloudflare Agents SDK/browser/computer-control support. These are not committed architecture, and submission still requires explicit human approval.
