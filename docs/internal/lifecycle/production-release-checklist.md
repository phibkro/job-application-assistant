# Production release checklist

- [ ] `just fix`, `just verify`, `just audit`, and `just qualification` pass from a clean checkout.
- [ ] Production account plan and current Workers/D1 limits reviewed against observed staging usage.
- [ ] Pinned Wrangler version and compatibility date reviewed against current Cloudflare releases.
- [ ] `Cargo.lock` is generated, reviewed, and included in the corresponding-source release.
- [ ] Migration plan and additive-schema review complete.
- [ ] Staging deployment evidence attached.
- [ ] Seven-day soak satisfies `ops/slo.json`.
- [ ] Query-plan report uses the expected indexes at realistic corpus size.
- [ ] D1 restore/Time Travel drill completed and timed.
- [ ] NAV, administrator, and API-principal credentials rotated successfully.
- [ ] Demo routes return 403 in production.
- [ ] Owned routes reject missing and cross-principal credentials.
- [ ] Maintenance defaults to dry run and repair results are audited.
- [ ] Scheduled saved-search sweep advances due cursors without a client request.
- [ ] Webhook signature, at-least-once deduplication, retry, dead state, and replay behavior verified.
- [ ] Delivered outbox retention purge is dry-run reviewed and bounded.
- [ ] Independent security review accepts the R3 authentication, ownership, SSRF, and production-mutation boundaries.
- [ ] Independent G5 review accepts the release.
