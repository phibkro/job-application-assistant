# Active context

## Current focus

Stabilize the TypeScript/Effect service after the RFC 0015 cutover. The local
Saved journey now works from vacancy save through explicit submission
confirmation and application history. The next focus is remote scheduled NAV
evidence, staging evidence, and production qualification.

The approved product direction is the Job Application Assistant mission and MVP boundary in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md). The corpus is an enabling subsystem; human review and explicit approval remain required for consequential application actions.

## Current decisions

- TypeScript + Effect v4 Cloudflare Worker (`apps/worker/`) with D1 as the system of record; `packages/domain/` owns canonical identity, normalization, and matching.
- `../effect` is the official local Effect source and idiom guide. The project is pinned to `effect@4.0.0-beta.104`; the current checkout reports beta.107, so exact API compatibility must be checked against the pinned dependency before adopting an idiom.
- `db/schema.sql` and `db/catalog-seed.sql` are generated snapshots. `scripts/ts/schema.ts` and `scripts/ts/catalog.ts` provide emit/check commands, and `bun run check` includes both checks.
- `infra/alchemy.run.ts` declares the TypeScript Worker for every Alchemy stage. This is current source configuration, not evidence that a staging or production deployment is current.
- Only NAV is registered in the TypeScript acquisition layer. `apps/worker/src/ingestion/scheduled.ts` selects Feed catalog entries; `scheduled.test.ts` guards that target boundary.
- Production configuration declares one credential-gated ingestion trigger, restrictive demo/NAV settings, and private NAV/admin credentials. Production qualification evidence is still incomplete.
- NAV credentials resolve per request: staging can use the cached public token, while production requires a private NAV secret. A 401 invalidates and refreshes only the token used by that request.
- Saved data is owner-scoped in SQL. D1 stores frozen vacancy snapshots, custom labels, active-attempt pointers, and complete prior attempts. Application updates use optimistic concurrency through `expectedUpdatedAt`, preserve existing notes when an event omits them, and the web model rejects late profile/Saved messages from an earlier session epoch.
- `scripts/migrate-d1.sh` and `d1_migrations` upgrade existing D1 databases. `scripts/preview.sh` starts from a clean local state so schema drift cannot poison the demo.
- A local browser smoke proved save, draft, assisted preparation, approval, custom-label assignment/filtering, explicit submission confirmation, the Applied preset, and history. This is local evidence only.
- Project license is proprietary (see RFC 0005/0008 amendments).

## Current command surface

```text
just nav-key           # configure NAV private consumer key
just admin-key         # generate/configure protected operator token
just check              # repository, credential, and script gates
bun run check           # TypeScript workspace: format, lint, typecheck, schema, catalog, bundle, tests
bun run test:workers    # the workerd-real half of the suite alone (D1 + Durable Object), via Node
bun run coverage:all    # both coverage runs; bun run check already includes this
just verify             # just check + bun run check
just preview            # local TypeScript stack: API + interface + seeded D1
just soak               # bounded staging soak; use seven days for acceptance
./deploy                # staging deployment command; current staging evidence is stale
./deploy-production     # explicit production deployment command; qualification remains open
```

## Next action

Run the corrected NAV credential and scheduled-ingestion paths on a deployed
revision. Then refresh staging evidence and complete production qualification:
realistic-corpus query plans, restore evidence, and a black-box staging smoke.

## Open decisions

- Whether/when to port principal (API-key) administration, owned saved-search webhook subscriptions, and corpus maintenance (audit/reconcile/purge) to the TypeScript service — WS-0008/0009/0006 capabilities that existed only in the retired Rust worker.
- Whether/how to regenerate `openapi/job-index-v1.json` from `apps/worker/src/Api.ts`; nothing currently generates that replacement.
- Custom production hostname and whether to disable `workers.dev`.
- Cloudflare Access replacement for the temporary admin bearer token.
- Raw source retention and sanitization policy.
- Which future direction to evaluate first after MVP: ATS-friendly document assistance or bounded Cloudflare Agents SDK/browser/computer-control support. These are candidates, not committed architecture; submission requires explicit human approval.
