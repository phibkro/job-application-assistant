# WS-0010@1: Transactional webhook outbox

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0013
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Create webhook subscriptions and commit delivery events atomically with search match transitions.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, and independent review evidence are attached.

## Exclusions

- email, SMS, or Cloudflare Queues.


Delivery semantics are at least once across crash boundaries. Receivers must deduplicate by event ID. Delivery, retry, subscription counts, and delivered-history retention are all bounded.
