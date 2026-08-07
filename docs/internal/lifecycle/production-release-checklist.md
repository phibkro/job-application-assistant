# Production release checklist

> Written against the retired Rust worker's WS-0011 qualification gates.
> Items struck through below have no TypeScript equivalent yet (see
> `memory-bank/progress.md`'s "Known gaps") and must be re-established or
> explicitly waived before this checklist is trusted again.

- [ ] `bun run check` and `just verify` pass from a clean checkout.
- [ ] Production account plan and current Workers/D1 limits reviewed against observed staging usage.
- [ ] Pinned Wrangler version and compatibility date reviewed against current Cloudflare releases.
- [ ] `db/schema.sql` matches the domain models (`bun run schema:check`).
- [ ] Staging deployment evidence attached.
- [ ] Seven-day soak satisfies `ops/slo.json`.
- [ ] ~~Query-plan report uses the expected indexes at realistic corpus size.~~ Gap: no TypeScript port of `query_plan_test.py`.
- [ ] ~~D1 restore/Time Travel drill completed and timed.~~ Gap: no TypeScript port of `restore_drill.py`.
- [ ] NAV and administrator credentials rotated successfully.
- [ ] ~~Owned routes reject missing and cross-principal credentials.~~ Gap: no principal/API-key administration exists.
- [ ] ~~Maintenance defaults to dry run and repair results are audited.~~ Gap: no maintenance surface exists.
- [ ] ~~Webhook signature, at-least-once deduplication, retry, dead state, and replay behavior verified.~~ Gap: no webhook outbox exists.
- [ ] Independent security review accepts the current authentication and production-mutation boundaries.
- [ ] Independent G5 review accepts the release.
