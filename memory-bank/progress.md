# Progress

## Complete

- AGPL-3.0-or-later licensing, later relicensed to proprietary (see RFC
  0005/0008 amendments and `LICENSE`).
- Cybernetic ADLC, RFC process, policy, quality gates, and memory bank.
- Rust/Cloudflare Worker/D1 vertical slice (WS-0001 through WS-0011):
  canonicalization, provenance, deduplication, replay idempotency, live NAV
  ingestion, incremental saved searches, principals, versioned API, webhook
  outbox, and production qualification gates. **Retired** as of RFC 0015's
  cutover — the historical record lives in `work/`, `evidence/`, and the RFCs
  themselves, not in this file.
- RFC 0015 strangler migration (WS-0012): `packages/domain/` reproduces
  canonical identity in Effect Schema; `apps/worker/src/Api.ts` declares and
  serves every route group the Rust worker used to; `apps/web/` is the
  interface; the Rust crates, its ordered migrations, and every script that
  only built/tested/smoked it are deleted.
- Generated D1 schema snapshot (`db/schema.sql`) checked for drift against
  the domain models by `bun run schema:check`, replacing the deleted
  migration-integrity checks.
- Local preview (`just preview`) serving the whole stack — API, interface,
  and a seeded local D1 — for real-journey verification without a deploy.

## Known gaps left by the cutover

These existed only in the retired Rust worker and have not been ported. Each
is a real product decision, not an oversight to silently patch:

- **Administrative surface.** API-key principals (quotas, revocation, audit
  log), owned saved-search webhook subscriptions and delivery, and corpus
  maintenance (audit/dry-run reconcile/purge) have no TypeScript
  implementation. `ADMIN_SYNC_TOKEN` is still required by production deploy
  gates and `infra/alchemy.run.ts`'s secret bindings, but no TypeScript route
  currently checks it.
- **Production qualification.** The 50,000-job query-plan regression probe
  and the local restore drill were written against the Rust worker's schema
  and are deleted with it; nothing currently proves the TypeScript service's
  indexes hold at scale or that a backup restores cleanly.
- **Source catalog seeding.** `apps/worker/src/catalog`'s `source_catalog`
  table has no generator; the Rust pipeline (`probe_sources.py` →
  `import_source_index.py` → a migration file) targeted a schema and file
  format that no longer exist.
- **OpenAPI contract.** `openapi/job-index-v1.json` was hand-maintained for
  the Rust routes and is deleted rather than left describing a service that
  no longer runs them; nothing currently generates its replacement from
  `Api.ts`.
- **Staging/production cutover.** `infra/alchemy.run.ts` still deploys the
  Rust worker for those two stages; repointing them at the TypeScript worker
  is a deliberately separate decision, held by another writer.

## Remaining WS-0012 acceptance evidence

- Phase 1 slots (persistence, corpus, acquisition, accounts, drafting,
  delivery, applications, agenda, entitlements, handlers, interface, agent
  session) continuing per `work/WS-0012-r1-typescript-migration-plan.md`.
- Decide and execute the gaps above, or explicitly accept them as deferred.
- Repoint `infra/alchemy.run.ts`'s staging/production stages once the above
  is resolved; that is Phase 3 cutover, not this deletion pass.
