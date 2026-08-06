# WS-0004 evidence

## Implemented evidence

- Cloudflare product-fit research under `research/decisions/`.
- D1 migration `0004_ingestion_control.sql`.
- Conditional source lease, heartbeat, release, pause, retry, restart, failure ledger, and detailed run progress.
- Bounded multi-page NAV sync with explicit page, observation, detail-fetch, duration, and lease budgets.
- Stable failure classification and bounded backoff.
- Protected source-control and failure-inspection APIs.
- Deterministic migration and HTTP lease contention/reclamation probes.
- Structured JSON run and failure logs.

## Required executable evidence

Run:

```sh
just fix
just verify
```

Expected local evidence:

- all previous canonical, lifecycle, and saved-search assertions pass;
- first lease owner acquires;
- concurrent owner reports contention;
- owner after expiry reclaims the lease;
- failed source probe preserves its cursor;
- four migrations and nine required tables validate.

## Required staging evidence

- deployment revision and D1 identity;
- source state before and after sync;
- bounded run report showing pages and stop reason;
- repeated invocations reaching `mode=tail`;
- one overlap attempt returning `outcome=busy`;
- one pause/resume cycle;
- one redacted retryable failure and recovery;
- structured log query screenshots or exported records;
- independent G5 review.

## Remaining review

- Rust/Clippy/Wasm compilation on the pinned Nix environment.
- Local D1 smoke output attached from the verifier.
- Staging backfill-to-tail and failure-recovery evidence.
- Independent review of lease and cursor invariants.
