# RFC 0005: Live NAV incremental ingestion

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: WS-0002
- Review owners: Human product owner; ingestion reviewer
- Tracking issue: WS-0002@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Add the first production data source by consuming NAV's official vacancy feed from the Rust Cloudflare Worker. Persist source collection state in D1, process only unseen or changed feed entries, represent closure and reopening explicitly, and run the same collection program from both a manual administrative endpoint and a scheduled Worker event.

## Motivation

WS-0001 proves canonical identity, provenance, D1 persistence, and replay idempotency with deterministic fixtures. The service cannot prove real user value or operational freshness until at least one live source continuously updates the shared corpus. NAV is the correct first source because it provides an official structured interface and broad Norwegian coverage without requiring browser automation.

Building saved searches before live ingestion would optimize queries over a static demonstration corpus. The next uncertainty is therefore source correctness and incremental operation, not personal ranking.

## Goals

- Consume one official live source through a dedicated connector.
- Maintain a durable cursor and conditional-request metadata in D1.
- Import created and updated vacancies without rescanning the existing corpus.
- Mark source occurrences and canonical jobs closed or reopened from source status changes.
- Advance collection state only after the corresponding page is processed successfully.
- Share one ingestion implementation between manual and scheduled triggers.
- Preserve deterministic fixtures for parser and transition tests.
- Expose source freshness, cursor, run status, and error information without exposing credentials.

## Non-goals

- A second live platform.
- Fuzzy duplicate detection or employer entity resolution.
- User accounts, CVs, saved searches, notifications, or application tracking.
- Queues, Workflows, R2, Durable Objects, or Vectorize.
- Browser-based scraping.
- Full labour-market analytics.

## Guide-level explanation

An operator deploys the Worker and triggers the NAV sync manually or waits for the configured schedule. The connector requests the next NAV feed page using the stored cursor and conditional headers when supported. Every source record becomes a typed source observation and passes through the existing pure-Rust normalization path.

D1 records the collection run, source state, occurrence changes, canonical changes, and the next cursor. If processing fails, the cursor remains at the last completely committed page. Repeating the same source response produces no new canonical changes.

The demo interface gains a read-only source status panel and an explicitly protected **Sync NAV** action for staging. Production scheduling does not depend on the browser being open.

## Reference-level explanation

Add a source connector contract that returns a page:

```text
SourcePage
├── observations
├── next_cursor
├── etag
├── last_modified
└── exhausted
```

Add D1 state for each configured source:

```text
source_state
├── source_id
├── cursor
├── etag
├── last_modified
├── last_attempt_at
├── last_success_at
├── last_error
└── consecutive_failures
```

The page-level transaction is:

```text
begin run
→ parse page
→ apply occurrence/canonical transitions
→ persist next source state
→ complete run
```

A scheduled handler and an administrative HTTP route both call the same application function. The HTTP route requires an administrative capability and remains disabled by default in public production configuration.

## State transitions

A live source observation can produce:

```text
created
updated
unchanged
closed
reopened
```

A canonical job remains active while at least one source occurrence remains active. It closes only when all known occurrences are inactive. A later active observation reopens it and appends a new canonical change.

## Failure and cursor semantics

- A cursor identifies the next unprocessed source position.
- The cursor advances only with a successful page commit.
- Parser failures do not silently skip records.
- Retrying the same page is safe.
- A bounded page and record budget prevents unbounded scheduled execution.
- Collection errors are persisted as operational state and returned through source status APIs.

## ADLC and operational impact

WS-0002 is an R2 external-integration slice. G2 design evidence includes the accepted feed contract, cursor invariants, failure budgets, and transition table. G3 readiness requires staging-only source capability, D1 migration readiness, pinned fixtures, and a bounded execution budget. G4 evidence includes parser and transition tests, cursor rollback tests, local scheduled-handler execution, and staging collection output. G5 requires an independent reviewer to verify source usage, closure semantics, cursor safety, and the AGPL source link before acceptance.

Operational ownership adds source freshness and connector health. A failed scheduled run must be visible without requiring log archaeology, while a successful run records last success, cursor state, observation count, and canonical changes.

## Security, privacy, and capabilities

Only publicly advertised vacancy data is stored. No applicant data enters this slice. The connector must use NAV's official permitted interface and identify itself according to source requirements.

Administrative collection routes require a separate deployment capability from public read routes. Public deployments under `AGPL-3.0-or-later` must expose the corresponding source for the running modified version.

## Drawbacks

- The Worker becomes dependent on an external source's schema and availability.
- Cursor semantics and closure handling add state-machine complexity.
- A single scheduled Worker has bounded execution time and may later require Queues or Workflows as source volume grows.
- Without raw payload archival, historical parser replay is limited to committed fixtures and normalized state.

## Rationale and alternatives

**Add saved searches next:** rejected for sequencing. A live corpus is required before incremental matching proves meaningful value.

**Use browser automation:** rejected. An official structured source should be preferred.

**Store source state in KV:** rejected. Cursor advancement must be transactional with D1 corpus mutations.

**Introduce Workflows immediately:** postponed. One source and bounded page processing can be proven with a scheduled Worker before adding another durable runtime.

**Archive every raw payload in R2:** postponed. Deterministic fixture capture is sufficient for this slice; R2 becomes valuable when multiple evolving connectors exist.

## Prior art

The design follows incremental feed consumers that separate source cursors from normalized domain state and use at-least-once retry with idempotent application. It retains the existing ports-and-adapters boundary: source-specific Fetch and parsing remain in the Worker crate while normalization and transition semantics stay testable independently.

## Unresolved questions

- Whether source payload retention is required before a second live connector is added.
- Which public source-code URL convention should be enforced for AGPL deployments.
- Whether measured page volume eventually requires Queues or Workflows.

Resolved for this implementation:

- NAV vacancy UUID is the stable source identity.
- `next_url` advances paging; the tail page retains its own cursor and uses ETag/Last-Modified.
- One invocation processes one page, at most 200 observations, and at most 40 detail fetches.
- Production begins at the current tail rather than attempting an unbounded historical backfill.

## Future possibilities

- R2 raw payload archival and parser replay.
- Queues or Workflows for larger or multi-source runs.
- A second source to measure unique contribution and cross-source overlap.
- Saved-search change cursors evaluated against the live canonical stream.

## Implementation plan

1. Finalize the NAV feed contract and allowed usage.
2. Add `SourceConnector` and `SourcePage` types to `job-index-core` where platform-independent.
3. Implement the NAV Fetch adapter in `job-index-worker`.
4. Add D1 migration `0002_source_state.sql`.
5. Extend repository transitions for close and reopen semantics.
6. Implement one bounded `sync_source` application function.
7. Wire manual staging and scheduled Worker triggers to the same function.
8. Add captured NAV parser fixtures and transition tests.
9. Add source status API and demo panel.
10. Record local and staging evidence.

## Verification and evidence

- Connector fixtures parse into expected source observations.
- An initial page creates the expected corpus records.
- An identical page retry creates no new changes.
- An update fixture appends exactly one update.
- A closure fixture deactivates the occurrence and closes the canonical job only when no active occurrence remains.
- A reopened fixture appends exactly one reopen change.
- A deliberately failed page does not advance the cursor.
- Scheduled and manual triggers call the same ingestion path.
- Live staging sync records source freshness and imports real vacancies.
- No personal or secret data appears in logs or responses.

## Rollout and rollback

Roll out behind a disabled-by-default source configuration in staging. Enable one bounded manual page first, then enable the schedule after evidence review. Rollback disables the schedule and administrative trigger while retaining the imported public corpus. Parser/schema rollback restores the previous Worker; cursor state is not advanced when a failed parser version cannot commit.

## Decision record

- Decision: Accepted
- Decision date: 2026-08-05
- Decision owner: Human product owner
- Final rationale: Proceed with the smallest live-source slice before saved searches. Use NAV's official feed, D1 checkpoints, one bounded page per invocation, and shared manual/scheduled execution.
- Dissent or residual concerns: External schema stability, rotating experimental credentials, and future execution-volume limits.
- Required follow-up: Run `just verify`, perform a bounded staging sync, configure a private NAV token for sustained operation, and submit G5 evidence.

## Amendments

### 2026-08-07 — AGPL references are historical

The project is proprietary as of 2026-08-07. Where this RFC requires a
corresponding-source link as acceptance evidence, that requirement lapsed with
the licence; see RFC 0008's amendment. Nothing else here changes.

### 2026-08-05 — first-class NAV private consumer keys

NAV's production credential is a signed bearer JWT issued after consumer registration, not a client-secret exchange performed by this service. The operator configures it with `just nav-key`; the command validates feed access and stores it in ignored local secret state. Public-token refresh must never replace a private credential, including a token with no expiry claim. Verified deployment uploads the same credential as the Worker `NAV_API_TOKEN` secret. The public rotating token remains an experiment and fallback path only.
