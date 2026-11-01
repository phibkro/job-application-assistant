# WorkScope: `apps/index-web` first slice, r2 (no auth: browse, detail, filters, URL sync)

- ID: WS-0025
- Revision: 2
- Status: **Approved** (owner decision 2026-11-01 on the r1 stop report)
- Owner: Human product owner (phibkro)
- Risk tier: **R2** (new app; no auth, no new tables)
- Roles: implementer at the `complex-reasoning` tier (Foldkit skills loaded); reviewer at the `complex-reasoning` tier.
- Attempt budget: 2
- Supersedes: [WS-0025@1](WS-0025-r1-index-web-client.md). r1 stopped correctly (`a057878`; `evidence/WS-0025/README.md`): no better-auth instance exists, and better-auth 1.6.26 on workerd needs the Worker-wide `nodejs_compat` flag.

## Owner decision

**Split the slice.** This revision ships the client without auth. **Anonymous better-auth presets move to a later ticket** after WS-0029 (`nodejs_compat` belongs with the `infra/` upgrade, plus a staging smoke test, because the workerd test pool silently adds `nodejs_compat` and can't catch a missing flag) and WS-0028 (`BETTER_AUTH_SECRET`).

## Outcome

A person opens the index client and can:
- browse current vacancies;
- open a detail page showing the source reference;
- filter by text and location, with the filter state reflected in the URL (shareable, back/forward-safe).

## Scope

- `apps/index-web` in the root workspace: Foldkit 0.170.x, `@foldkit/ui`, Tailwind, `effect ~4.1`. Built from the official examples (routing, query-sync, api-cache / api-cache-query), each module's derivation recorded in `PROVENANCE.md`.
- A typed client to the existing read API (`/api/v1/jobs`, `/api/v1/jobs/:id`) via the worker's `HttpApi` contract.
- The Worker serves `apps/index-web/dist` instead of `dev/static-placeholder/` (the only asset-config change; SPA shape kept).

## Acceptance

- [ ] Browse, detail (showing the source) and filters work end to end in Playwright against the local preview, with Axe checks.
- [ ] URL ↔ query round-trip law: `parse(print(q)) = q` (property test).
- [ ] **Single Effect:** `bun.lock` resolves exactly one `effect` (F5).
- [ ] **`--pass-with-no-tests` removed** from the `e2e` task (F4).
- [ ] `vp check`, `vp run test`, `vp run verify` and the e2e task pass, checked by exit code. Foldkit `audit-program` findings are fixed or recorded.
- [ ] Evidence goes in `evidence/WS-0025/README.md` (r2 section).

## Exclusions

No auth, no presets, no migrations, no `nodejs_compat`, no better-auth in the Worker, no workload filter UI (a follow-up after WS-0022), and no public deployment.
