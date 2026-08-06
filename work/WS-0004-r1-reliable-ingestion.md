# WS-0004@1: Reliable ingestion and backfill

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0007
- Owner: Project maintainer
- Review owner: Independent ingestion reliability reviewer

## Outcome

NAV ingestion can run unattended, make bounded progress toward the feed tail, reject overlapping collectors, recover stale leases, classify failures, and expose operator recovery without direct database edits.

## Acceptance criteria

- A source lease permits one owner and rejects a concurrent owner.
- A stale lease is reclaimable after expiry.
- Paused and retry-deferred sources exit without fetching NAV.
- One invocation processes multiple complete pages within all configured budgets.
- Cursor advancement occurs only after every observation on a page converges.
- A failed page leaves its cursor unchanged and records one deduplicated open failure.
- Retryable failures receive bounded backoff; configuration and malformed-input failures require operator action.
- Pause, resume, retry, restart, stale-lease release, status, and failure inspection APIs are protected remotely.
- Run output contains pages, observations, changes, duration, mode, cursor, stop reason, and lag.
- Migration, static, Rust, Wasm, local D1, bundle, and staging gates pass.

## Exclusions

- Workflows, Queues, Pipelines, Durable Objects, Analytics Engine, and R2.
- Full payload quarantine.
- Second source integration.
- Public user identity and notification delivery.
