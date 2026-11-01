# WorkScope: `apps/index-web`, first slice of the market-index web client

- ID: WS-0025
- Revision: 1
- Status: **Proposed**. Needs owner approval. It may run **in parallel with WS-0022** (owner decision), after WS-0021@4 and WS-0026 land, in its own worktree.
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: a new app, a new owner-scoped table (presets: personal data), and anonymous auth configuration.
- Roles: implementer at the `complex-reasoning` tier (Foldkit skills loaded); reviewer at the `complex-reasoning` tier.
- Attempt budget: 2
- Governing decisions: "Web client (decided)" and "Legacy UI (decided)" in `docs/internal/product/market-index-lead-handoff.md`.

## User-visible outcome

A person opens the index client and can:
- browse current vacancies;
- open a detail page showing the source reference;
- filter by text and location;
- save the current query as a named **preset** under an anonymous account (no sign-up), and see it again after reload and after clearing the browser cache while the session cookie remains.

## Falsifier

A preset saved in one anonymous session is visible to another anonymous user. Or a preset ever appears in the shared corpus, or in any public read endpoint.

## Approach (decided)

- `apps/index-web` in the **root workspace**: Foldkit **0.170.x**, `@foldkit/ui`, Tailwind, `effect ~4.1`. Start from Foldkit's official examples (routing, query-sync for URL ↔ query state, api-cache / api-cache-query for the read API, form for preset naming, auth for session state) rather than writing the architecture from scratch. Record which example each module derives from (a `PROVENANCE.md` for copied code).
- A typed client to the existing read API (`/api/v1/jobs`, `/api/v1/jobs/:id`), using the worker's `HttpApi` contract directly (same workspace, same Effect version).
- **Anonymous auth:** enable better-auth's `anonymous` plugin (`better-auth@1.6.26`, already pinned) on the existing auth setup, with the account-linking hook prepared but not exposed.
- **Presets:** a new additive, owner-scoped D1 table (`query_presets`: owner, name, query JSON, created/updated, with optimistic concurrency like Saved). Authenticated `/api/v1/me/presets` CRUD. It is never joined into corpus tables and never readable unauthenticated.
- Rendering mode: SPA for this slice. SSG/SSR is decided later (the examples exist).
- The Worker serves `apps/index-web/dist`, replacing the WS-0021@4 placeholder.

## Acceptance

- [ ] Browse, detail (showing the source), filters and preset save/list/delete work end to end in Playwright against the local preview, with Axe checks.
- [ ] Owner isolation is tested at the API (a workerd test) and in e2e: user A's presets are invisible to user B and to unauthenticated reads. A broken twin (a missing owner filter) is seen failing.
- [ ] URL ↔ query state round-trips (query-sync law: parse(print(q)) = q).
- [ ] `bun run check`, the e2e suite and `check_repo.py` pass. Foldkit's `audit-program` skill runs over the app, and its findings are fixed or recorded.
- [ ] Evidence is in `evidence/WS-0025/README.md`.

## Exclusions

No workload filter UI until WS-0022 lands (then it's a follow-up slice). No query-algebra client (TB-04). No public deployment: NAV redistribution is unresolved. No account linking UI. No personal-feature screens (profile/studio).

## Rollback

Revert the commit. The presets table is additive; drop it.
