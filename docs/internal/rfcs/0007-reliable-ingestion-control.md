# RFC 0007: Reliable ingestion control

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: WS-0004
- Review owners: Human product owner; ingestion reliability reviewer
- Tracking issue: WS-0004@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Turn NAV collection from a one-page prototype into a bounded, recoverable ingestion service. D1 owns a per-source lease, backfill/tail mode, pause and retry state, failure ledger, and run progress. Each invocation processes several complete feed pages within fixed page, observation, detail-fetch, and wall-clock budgets.

## Motivation

WS-0002 proved NAV parsing, lifecycle convergence, and cursor safety for one page. Production requires unattended operation under overlapping cron/manual triggers, transient upstream failures, malformed input, and deployment interruption. The system must expose lag and recovery state without requiring manual SQL edits.

## Goals

- Prevent concurrent collectors from advancing the same source.
- Reclaim abandoned leases automatically after expiry.
- Process several complete pages per invocation without unbounded execution.
- Preserve page-level replay safety: observations may replay, cursors may not skip.
- Distinguish authentication, rate-limit, upstream, network, malformed-page, invalid-item, lease, and persistence failures.
- Apply bounded retry backoff only to retryable failures.
- Persist a deduplicated operational failure ledger without full source payloads.
- Support pause, resume, retry, cursor restart, stale-lease recovery, status, and failure inspection APIs.
- Emit one structured JSON run summary or failure event.

## Non-goals

- Cloudflare Workflows, Queues, Pipelines, Durable Objects, or Analytics Engine.
- Complete source payload archival.
- A second source connector.
- User accounts or notification delivery.
- Guaranteed exactly-once execution of the Worker itself.

## Guide-level explanation

Every NAV synchronization first attempts a conditional D1 lease update. Only the owner recorded in `source_state` may checkpoint pages. If another trigger already owns a live lease, the new invocation exits successfully with `outcome=busy`. If a previous process died, the next invocation can acquire the lease after its expiry.

The owner repeatedly fetches a page, converges every observation, then commits the next cursor. A crash before cursor commit replays the page. A crash after cursor commit starts at the next page. Existing occurrence and canonical writes are idempotent, so replay does not duplicate semantic changes.

## Reference-level explanation

Migration `0004_ingestion_control.sql` extends `source_state` with:

```text
mode / paused
lease_owner / lease_acquired_at / lease_expires_at / heartbeat_at
retry_after_at / last_failure_class
last_feed_modified_at / last_run_duration_ms
```

It adds `source_failures` and detailed collection-run progress.

A run is bounded by configuration with hard caps:

```text
NAV_MAX_PAGES_PER_RUN              default 4, hard maximum 10
NAV_MAX_OBSERVATIONS_PER_RUN       default 600, hard maximum 1000
NAV_DETAIL_FETCH_LIMIT             default 40, hard maximum 100
NAV_MAX_DURATION_MS                default 20000, hard maximum 25000
NAV_LEASE_TTL_MS                   default 90000, bounded 30000..300000
```

The lease TTL is always at least twice the configured run-duration budget.

## Failure policy

| Class | Retry | State |
| --- | --- | --- |
| authentication | no | failed until operator action |
| configuration | no | failed until operator action |
| malformed_page | no | failed; cursor unchanged |
| invalid_item | no | failed; cursor unchanged |
| bounded_limit | no | failed; configuration review required |
| rate_limited | yes | honor `Retry-After`, then bounded backoff |
| upstream | yes | exponential backoff |
| network | yes | exponential backoff |
| lease_lost | yes | short backoff and replay |
| persistence_or_unknown | yes | exponential backoff and replay |

Backoff is bounded to 30 minutes. An explicit NAV `Retry-After` delay takes precedence when it points into the future. A successful page clears retry state and resolves open failures for that page URL.

## ADLC and operational impact

WS-0004 is an R2 operational-control slice because it changes unattended source behavior, recovery, and administrative capabilities. G3 requires explicit lease, budget, and retry invariants. G4 requires migration tests, deterministic lease contention/reclamation smoke evidence, cursor-failure evidence, strict Rust/Wasm gates, and a staging backfill-to-tail run. G5 requires independent review of lease SQL, checkpoint ordering, failure classification, and recovery authorization.

The service now has an operator control plane. Administrative routes remain protected by `ADMIN_SYNC_TOKEN` until Cloudflare Access is introduced.

## Security, privacy, and capabilities

Failure records contain source IDs, page URLs, item IDs when available, hashes, bounded messages, and timing metadata. They do not store full NAV payloads or credentials. Errors are truncated before persistence. Private NAV and admin tokens remain Worker secrets.

Pause, resume, retry, restart, stale-lease release, failure inspection, and manual sync require the same administrative capability. Local demo mode may bypass it for deterministic testing only.

## Drawbacks

- D1 implements coordination that could later move to Durable Objects or Workflows.
- Page observations and the cursor are not one giant D1 transaction; instead, observation operations are idempotent and the cursor is committed last.
- Failure classification uses stable error prefixes at adapter boundaries rather than a larger generic error framework.
- Structured logs are serialized JSON messages because the Rust SDK surface is intentionally kept small.

## Rationale and alternatives

**Cloudflare Workflows now:** rejected for this revision. Bounded cron invocations plus explicit D1 state are simpler and preserve the Rust-only runtime. Reconsider if orchestration becomes dominant complexity.

**Queues for every NAV item:** rejected. At-least-once concurrent item delivery would require a page-completion barrier before cursor advancement.

**Durable Object coordinator:** postponed until actual lease contention justifies another state system.

**Pipelines before D1:** rejected. Pipelines targets analytical delivery to R2, not transactional canonical-state convergence.

## Unresolved questions

- Whether repeated backfills justify a Workflow coordinator.
- Whether source failures need sanitized R2 quarantine artifacts.
- Whether operational numerical metrics should move to Analytics Engine.
- Which production identity layer replaces the temporary admin bearer token.

## Implementation plan

1. Record Cloudflare product-fit research and defer nonessential products.
2. Add D1 lease, mode, retry, lag, failure, and run-progress schema.
3. Add conditional lease acquisition, heartbeat, release, and stale reclamation.
4. Replace one-page sync with a bounded multi-page loop.
5. Add failure classification, deduplicated ledger, and retry timing.
6. Add protected recovery and inspection endpoints.
7. Add deterministic migration and local lease probes.
8. Update operator, API, architecture, release, memory, and evidence documentation.

## Verification and evidence

Required evidence:

- Migration checks for nine required tables.
- Conditional lease probe: first owner acquires, second contends, stale lease is reclaimed.
- Existing cursor-failure probe remains unchanged.
- Local smoke suite passes all canonical, lifecycle, search, lease, and rollback assertions.
- `cargo fmt --check`, strict Clippy, unit tests, Worker Wasm build, and Wrangler dry-run.
- Staging evidence showing bounded multi-page progress and eventual tail mode.
- Structured run/failure log examples with no credentials or complete NAV payloads.

Evidence is recorded under `evidence/WS-0004/`.

## Rollout and rollback

Rollout applies additive migration `0004_ingestion_control.sql`, deploys the new Worker, keeps scheduled sync disabled until migration and status inspection succeed, then enables cron. Existing source cursor and canonical data remain intact.

Rollback deploys the previous Worker. Additive columns and `source_failures` remain unused; no destructive migration is required. Before production rollout, capture a D1 Time Travel bookmark through the Cloudflare operator procedure.

## Decision record

- 2026-08-05: Accepted D1 conditional leases over Durable Objects for the first production design.
- 2026-08-05: Accepted idempotent observation replay with cursor-last checkpointing.
- 2026-08-05: Set bounded multi-page defaults and hard caps.
- 2026-08-05: Deferred Pipelines, Workflows, Queues, Durable Objects, and Analytics Engine pending evidence.

## Amendments

None.
