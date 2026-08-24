# Production release checklist

> The checklist covers the current TypeScript service. Administrative,
> maintenance, and webhook items remain explicit gaps rather than being
> inferred from unrelated qualification evidence.

- [ ] `bun run check` and `just verify` pass from a clean checkout.
- [ ] Production account plan and current Workers/D1 limits reviewed against observed staging usage.
- [ ] Pinned Wrangler version and compatibility date reviewed against current Cloudflare releases.
- [ ] `db/schema.sql` matches the domain models (`bun run schema:check`).
- [ ] Staging deployment evidence attached.
- [ ] Seven-day soak satisfies `ops/slo.json`.
- [ ] `just qualification` report uses the expected indexes at 50,000 vacancies.
- [ ] Local backup/restore report preserves fingerprints, integrity, foreign keys, and query plans.
- [ ] NAV credential rotated successfully.
- [x] The retired `ADMIN_SYNC_TOKEN` deployment requirement is removed; the current TypeScript service has no administrator route.
- [ ] ~~Owned routes reject missing and cross-principal credentials.~~ Gap: no principal/API-key administration exists.
- [ ] ~~Maintenance defaults to dry run and repair results are audited.~~ Gap: no maintenance surface exists.
- [ ] ~~Webhook signature, at-least-once deduplication, retry, dead state, and replay behavior verified.~~ Gap: no webhook outbox exists.
- [ ] Independent security review accepts the current authentication and production-mutation boundaries.
- [ ] Independent G5 review accepts the release.
