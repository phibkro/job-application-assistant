# Active context

## Current focus

Production qualification is the current focus. The local Saved journey,
explainable shortlist, PR-preview lifecycle, realistic-corpus query-plan gate,
and local backup/restore gate are complete. The current dirty candidate passed
staging deployment, HTTP smoke, a complete authenticated owner-scoped mutation
journey, and one bounded NAV checkpoint. The remaining external production
acceptance gates stay open.

The approved product direction is the Job Application Assistant mission and MVP boundary in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md). The corpus is an enabling subsystem; human review and explicit approval remain required for consequential application actions.

## Current decisions

- TypeScript + Effect v4 Cloudflare Worker (`apps/worker/`) with D1 as the system of record; `packages/domain/` owns canonical identity, normalization, and matching.
- `../effect` is the official local Effect source and idiom guide. The project is pinned to `effect@4.0.0-rc.108`; check exact API compatibility before adopting an idiom from another revision.
- `db/schema.sql` and `db/catalog-seed.sql` are generated snapshots. `scripts/ts/schema.ts` and `scripts/ts/catalog.ts` provide emit/check commands, and `bun run check` includes both checks.
- `infra/alchemy.run.ts` declares the TypeScript Worker for every Alchemy stage. This is current source configuration, not evidence that a staging or production deployment is current.
- Staging and production preserve the legacy `Db` resource but bind the TypeScript Worker to a distinct `TypeScriptDb` (`job-index-<stage>-typescript-db`), as WS-0012 requires. This prevents Alchemy state recovery from adopting the incompatible Rust D1 by name.
- Only NAV is registered in the TypeScript acquisition layer. Scheduled runs select Feed sources, request 5-entry pages, and attempt one page per run.
- Production configuration declares one credential-gated ingestion trigger, restrictive demo/NAV settings, and private NAV/admin credentials. Production qualification evidence is still incomplete.
- NAV credentials resolve per request. Staging can use the cached public token. Production requires a private NAV secret. A 401 refreshes only the failed token.
- On 2026-08-13 the current dirty candidate passed `./bootstrap verify`, staging deployment with schedules disabled, public HTTP smoke, browser authentication into the owner-scoped Saved/Profile surfaces, and one explicitly enabled public NAV run. That run read one page, observed five entries, made four canonical changes, advanced the cursor once, recorded zero duplicate external IDs and no failures, and stopped after 1,861 ms. The schedule was disabled immediately afterward. `.deploy/staging.json` records D1 `967bfbad-4577-437c-945e-54c023154b8a` and configuration SHA-256 `ec620f078f963d30dfd1aeeb394a340203fe1aacd931d04afa8131b3f44b8ad9`; it has no immutable source revision because the checkout was dirty.
- The same staging candidate completed a browser-driven owner journey against a narrowly seeded hydrated qualification vacancy: shortlist, custom-label creation and assignment, template draft, assisted preparation, approval to `ready`, separate submission confirmation to `submitted`, Applied filtering, and current-attempt history. D1 retained one frozen saved snapshot, one label assignment, and an active submitted assisted application for `profile-qualification`.
- A five-minute soak diagnostic failed because `scripts/soak.py` still requests the retired `/api/sources/nav/status` contract; ten observations recorded HTTP 403, direct access returns 404, and no lag samples were available. A managed D1 export/import drill also failed: the 22-table staging source imported as 11 tables and omitted `occurrences`. The disposable restore database was deleted; live staging was not changed. Both gates remain open and now have concrete defects to fix.
- Saved data is owner-scoped in SQL. D1 stores frozen vacancy snapshots, custom labels, active-attempt pointers, and complete prior attempts. Application updates use optimistic concurrency through `expectedUpdatedAt`, preserve existing notes when an event omits them, and the web model rejects late profile/Saved messages from an earlier session epoch.
- `scripts/migrate-d1.sh` and `d1_migrations` upgrade existing D1 databases. `scripts/preview.sh` starts from a clean local state so schema drift cannot poison the demo.
- A local browser smoke proved real NAV ingestion, checkpointed one-page runs, browse pagination, search, detail hydration, save, draft, assisted preparation, approval, custom-label filtering, submission confirmation, and history. This is local evidence only.
- Local Playwright evidence covers profile preference editing, deterministic ranking and explanations, feed/detail parity, save, dismissal, and Axe checks against the seeded preview.
- `.github/workflows/pr-preview.yml` provisions same-repository PR stages as `pr-N`, applies `dev/preview-seed.sql`, and destroys the stage on close. The scripts reject shared-stage teardown and fork PRs receive no Cloudflare authority. Provider lifecycle evidence is blocked because this repository has no configured Git remote.
- `just qualification` seeds 50,000 current-schema vacancies plus representative owner-scoped Saved/application state, asserts current query indexes, times reads, and proves local backup/restore fingerprints, integrity, foreign keys, and repeated query plans.
- Project license is proprietary (see RFC 0005/0008 amendments).
- WS-0013 completed the design-system port: semantic Material You tokens in
  `apps/web` (styles.css `@theme inline`, light+dark palettes, Pine default),
  a theme preference module (`apps/web/src/theme.ts`, storage key
  `job-index-theme-v1`) with a Profile appearance section, and the responsive
  sidebar/bottom-bar shell ported from course-data-platform with provenance
  headers. Evidence lives in `.artifacts/ws-0013/`; work scope is
  `work/WS-0013-r1-design-system-port.md`. The apps/web changes are UNSTAGED
  pending owner integration, and `bun run check`'s imports:check stays red
  until the owner stages `apps/web/src/theme.ts`,
  `apps/web/src/theme.test.ts`, and `apps/web/src/view/icons.ts` alongside it.

## Current command surface

```text
just nav-key           # configure NAV private consumer key
just check              # repository, credential, and script gates
bun run check           # TypeScript workspace: format, lint, typecheck, schema, catalog, bundle, tests
bun run test:workers    # the workerd-real half of the suite alone (D1 + Durable Object), via Node
bun run coverage:all    # both coverage runs; bun run check already includes this
just verify             # just check + bun run check
just qualification      # 50k current-schema query plans plus backup/restore
just preview            # local stack; /__scheduled runs one bounded real NAV ingestion page
just soak               # bounded staging soak; use seven days for acceptance
./deploy                # deploy staging with schedules disabled
./deploy-production     # explicit production deployment command; qualification remains open
```

## Next action

Deploy the repaired candidate to staging with schedules disabled, verify its
black-box journey and bounded NAV checkpoint, run the authorized disposable
D1 restore drill, then start the seven-day SLO soak. Production remains blocked
on those gates, NAV credential rotation, production smoke, and independent G5 review.
The complete gate sequence with commands, authorities, preconditions, and abort
criteria is frozen in `work/WS-0014-r1-execution-plan.md`; execute it in that order.

## Open decisions

- Whether/when to port principal (API-key) administration, owned saved-search webhook subscriptions, and corpus maintenance (audit/reconcile/purge) to the TypeScript service — WS-0008/0009/0006 capabilities that existed only in the retired Rust worker.
- Whether/how to regenerate `openapi/job-index-v1.json` from `apps/worker/src/Api.ts`; nothing currently generates that replacement.
- Custom production hostname and whether to disable `workers.dev`.
- Raw source retention and sanitization policy.
- Which future direction to evaluate first after MVP: ATS-friendly document assistance or bounded Cloudflare Agents SDK/browser/computer-control support. These are candidates, not committed architecture; submission requires explicit human approval.
