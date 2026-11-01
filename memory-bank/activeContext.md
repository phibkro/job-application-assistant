# Active context

## Current focus

**WS-0020 (TB-00 market-index characterization) is implementation-complete
and awaits independent review and the human gate**, under RFC 0016 (accepted
with amendments A1–A4). Evidence and gap table:
[`evidence/WS-0020/README.md`](../evidence/WS-0020/README.md). The next tracer,
TB-01 (workload filtering), is proposed there and needs its own WorkScope.

Production qualification remains open. Owner integration of WS-0016 is
complete (`f233d75`). Qualification closeout passed local P1 integration
and the Gate 1 staging redeploy at commit `dfa0fe3` with immutable source
provenance and staging schedules off. Gate 2's authenticated owner journey
passed; its bounded NAV checkpoint is superseded — WS-0017 retires cron-driven
ingestion by owner decision 2026-08-25, so the platform cron non-dispatch
investigation and any operator escalation to Cloudflare support are moot for
ingestion. Gate 3's disposable complete-table D1 restore drill passed across 22
tables with equal digests, owner invariants, and NAV cursor; the target was
deleted. The seven-day soak re-points at lazy-ingestion gate evidence.
Production remains blocked on that soak, NAV private-token rotation, production
smoke/deploy, and independent G5 review.

The approved product direction is the Job Application Assistant mission and MVP boundary in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md). The corpus is an enabling subsystem; human review and explicit approval remain required for consequential application actions.

## Current decisions

- TypeScript + Effect v4 Cloudflare Worker (`apps/worker/`) with D1 as the system of record; `packages/domain/` owns canonical identity, normalization, and matching.
- `../effect` is the official local Effect source and idiom guide. The project is pinned to `effect@4.0.0-rc.108`; check exact API compatibility before adopting an idiom from another revision.
- `db/schema.sql` and `db/catalog-seed.sql` are generated snapshots. `scripts/ts/schema.ts` and `scripts/ts/catalog.ts` provide emit/check commands, and `bun run check` includes both checks.
- `infra/alchemy.run.ts` declares the TypeScript Worker for every Alchemy stage. This is current source configuration, not evidence that a staging or production deployment is current.
- Staging and production preserve the legacy `Db` resource but bind the TypeScript Worker to a distinct `TypeScriptDb` (`job-index-<stage>-typescript-db`), as WS-0012 requires. This prevents Alchemy state recovery from adopting the incompatible Rust D1 by name.
- Only NAV is registered in the TypeScript acquisition layer. Scheduled runs select Feed sources, request 5-entry pages, and attempt one page per run.
- Production configuration declares one credential-gated ingestion trigger, restrictive demo/NAV settings, and private NAV/admin credentials. Production qualification evidence is still incomplete, and production stays blocked.
- NAV credentials resolve per request. Staging can use the cached public token. Production requires a private NAV secret. A 401 refreshes only the failed token. The private token must be rotated before production.
- Qualification closeout passed local P1 integration and the Gate 1 staging redeploy at commit `dfa0fe3` with immutable source provenance; staging schedules are off. Gate 2's authenticated owner journey passed. Its bounded NAV checkpoint is blocked by Cloudflare platform cron non-dispatch: the trigger installs and is API-visible, but this Worker receives no ticks while control Workers on the same account do. This requires operator escalation to Cloudflare support.
- Gate 3's authorized disposable complete-table D1 restore drill passed: all 22 tables were restored, source and target digests, owner invariants, and the NAV cursor were equal, and the target was deleted. The seven-day soak depends on the dispatch fix. NAV private-token rotation, production smoke/deploy, and independent G5 remain operator/human gates.
- The qualification commits `d4e10e6`, `d56f5e2`, `ed3c1eb`, and `dfa0fe3` are contained in `origin/main`. `main` and `origin/main` are both `881eb40`, according to remote-tracking refs checked 2026-11-01 (WS-0020).
- WS-0016 to WS-0019 are integrated on `main`: `f233d75` (WS-0016), `f33348b` (WS-0017), `3b2862a` (WS-0018), and `881eb40` (WS-0019).
- Saved data is owner-scoped in SQL. D1 stores frozen vacancy snapshots, custom labels, active-attempt pointers, and complete prior attempts. Application updates use optimistic concurrency through `expectedUpdatedAt`, preserve existing notes when an event omits them, and the web model rejects late profile/Saved messages from an earlier session epoch.
- `scripts/migrate-d1.sh` and `d1_migrations` upgrade existing D1 databases. `scripts/preview.sh` starts from a clean local state so schema drift cannot poison the demo.
- A local browser smoke proved real NAV ingestion, checkpointed one-page runs, browse pagination, search, detail hydration, save, draft, assisted preparation, approval, custom-label filtering, submission confirmation, and history. This is local evidence only.
- Local Playwright evidence covers profile preference editing, deterministic ranking and explanations, feed/detail parity, save, dismissal, and Axe checks against the seeded preview.
- `.github/workflows/pr-preview.yml` provisions same-repository PR stages as `pr-N`, applies `dev/preview-seed.sql`, and destroys the stage on close. The scripts reject shared-stage teardown and fork PRs receive no Cloudflare authority. The repository has a configured `origin`.
- `just qualification` seeds 50,000 current-schema vacancies plus representative owner-scoped Saved/application state, asserts current query indexes, times reads, and proves local backup/restore fingerprints, integrity, foreign keys, and repeated query plans.
- Project license is proprietary (see RFC 0005/0008 amendments).
- WS-0013's design-system port is integrated in `d56f5e2`: semantic Material
  You tokens in `apps/web` (styles.css `@theme inline`, light+dark palettes,
  Pine default), a theme preference module (storage key
  `job-index-theme-v1`) with a Profile appearance section, and the responsive
  sidebar/bottom-bar shell ported from course-data-platform with provenance
  headers. Evidence lives in `.artifacts/ws-0013/`; work scope is
  `work/WS-0013-r1-design-system-port.md`.
- WS-0016 S1 document-to-profile inference is integrated on `main` in
  `f233d75`. It accepts pasted text and
  PDF through `unpdf@1.8.1`, produces deterministic heuristic proposals, and
  includes a model-inference capability seam. The AI binding is deliberately
  unprovisioned until prompt review. It uses no Firecrawl and parses transiently
  without retaining raw documents.
- WS-0016 stores owner-scoped pending proposals with evidence and confidence,
  provides per-field edit/accept/discard UI, uses atomic D1 profile-first CAS
  with bounded retries, and applies optimistic revisions to all whole-profile
  writes. `bun run check` passed with 681 unit tests passed, 4 skipped, and 84
  workerd tests; full Playwright passed 2/2 with Axe, responsive, and keyboard
  journey coverage; actual independent R2 review passed. Evidence is in
  `.artifacts/ws-0016/`, and scope is
  `work/WS-0016-r1-document-profile-inference.md`.
- WS-0020 (`b601267`): `bun run check` passes with 807 Bun tests passed, 4
  skipped, and 109 workerd tests passed; independent review ACCEPT WITH NITS
  (`evidence/WS-0020/review.md`).
- WS-0017 lazy ingestion retires cron-driven ingestion by owner decision
  2026-08-25: no stage declares a trigger; the freshness gate arms on
  authenticated feed reads after the response resolves, respects a six-hour
  attempt floor, and fails loudly toward migration 0003 when its table is
  missing. The soak re-points at lazy evidence; the Cloudflare dispatch
  ticket is moot for ingestion.
- WS-0020 verified facts (local tests only, no staging or production access).
  The only runtime ingestion trigger is `armsGate`. It is path-only, so it
  also arms on unauthenticated `/api/v1/me/feed` and `/api/v1/me/matches/*`
  requests. Public `GET /api/v1/jobs/:id` can fetch NAV detail and write D1.
  D05 same-title merges are pinned by a test. `techContext.md` still says
  Effect `beta.104`; the actual pin is `4.0.0-rc.108`. See the WS-0020 gap
  table.
- The approved closed-loop roadmap is WS-0015. S1 is now delivered source; S2
  document studio is the next value slice only after the owner integrates S1.
  Firecrawl Parse remains a future escalation tier requiring operator
  data-processor approval and Zero Data Retention. Workers AI provisioning
  waits for prompt review.

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

Proceed on two parallel tracks:

1. **OWNER / REVIEWER:** independent review and gate decision for WS-0020.
   If accepted, scope TB-01 from the evidence's proposed Ticket.
2. **OPERATOR:** rotate the NAV private token, and decide on and remove the
   leftover active `job-index-preview` cron. The cron support ticket is moot
   for ingestion under WS-0017: `infra/alchemy.run.ts:144` declares no crons.

After platform dispatch works, rerun one bounded checkpoint and then begin the
seven-day soak. Production stays blocked. The qualification gate sequence,
authorities, preconditions, and abort criteria remain in
`work/WS-0014-r1-execution-plan.md`.

## Open decisions

- Whether/when to port principal (API-key) administration, owned saved-search webhook subscriptions, and corpus maintenance (audit/reconcile/purge) to the TypeScript service — WS-0008/0009/0006 capabilities that existed only in the retired Rust worker.
- Whether/how to regenerate `openapi/job-index-v1.json` from `apps/worker/src/Api.ts`; nothing currently generates that replacement.
- Custom production hostname and whether to disable `workers.dev`.
- Whether and when to approve Firecrawl Parse as a future escalation tier; use requires operator data-processor approval and Zero Data Retention.
- Prompt review must precede Workers AI provisioning for the model-inference capability seam.
