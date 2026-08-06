# RFC 0006: Incremental saved searches

- Status: Implementing
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-06
- Work scope: WS-0003
- Review owners: Human product owner; search reviewer
- Tracking issue: WS-0003@1
- Implementation PR: Local implementation slice
- Supersedes: None
- Superseded by: None

## Summary

Add structured saved searches whose evaluation cursor is a canonical corpus sequence. A search is normalized into a stable query signature, persisted in D1, and evaluated against at most 100 canonical jobs changed after its previous cursor. The API reports added, updated, closed, and no-longer-matching transitions.

## Motivation

WS-0001 proved canonical identity and provenance. WS-0002 made the corpus live and incremental. The next product hypothesis is that repeated user searches can reuse the corpus instead of rescanning source platforms or every stored vacancy.

## Goals

- Persist structured location, include-term, and exclude-term filters.
- Give equivalent query definitions the same stable signature.
- Evaluate only canonical jobs with a sequence newer than the saved cursor.
- Bound each evaluation to 100 changed jobs.
- Preserve current match state across evaluations.
- Report `added`, `updated`, `closed`, and `removed` transitions.
- Demonstrate that an immediate replay evaluates zero jobs.

## Non-goals

- User accounts or multi-tenant authorization.
- CV parsing, embeddings, model ranking, or fuzzy matching.
- Notifications, digests, or application tracking.
- Shared query fan-out across multiple users.
- Background evaluation of every saved search after every corpus change.

## Guide-level explanation

A client creates a saved search with structured JSON. The service normalizes case, whitespace, ordering, and duplicates before generating a signature. The first evaluation scans current canonical jobs in sequence order. Later evaluations start after the last processed sequence and therefore inspect only jobs that changed.

The cursor advances through the highest sequence actually processed, not blindly to the corpus head. If more than 100 changed jobs remain, `has_more` is true and the client repeats evaluation.

## Reference-level explanation

D1 adds:

```text
saved_searches
├── id / query_signature
├── definition_json
└── last_evaluated_sequence

search_matches
├── saved_search_id
├── canonical_job_id
├── currently_matches
└── matched_job_sequence
```

Evaluation is:

```text
load definition and cursor
→ read canonical_jobs WHERE sequence > cursor LIMIT 100
→ compare each current job to the structured predicate
→ update match ledger
→ advance through the last processed sequence
→ return transitions
```

## Matching semantics

- Closed jobs never match.
- If locations are provided, at least one must occur in the normalized location.
- If include terms are provided, at least one must occur in title, employer, location, or description.
- If an exclude term occurs, the job does not match.
- An active job that remains a match after changing emits `updated`.
- A closed previous match emits `closed`.
- An active previous match that stops satisfying the predicate emits `removed`.

## Security and privacy

This slice stores search definitions but no identity, CV, or application data. Until user accounts exist, the API is a prototype surface and must not be represented as private per-user storage.

## Drawbacks

- Each evaluation writes one match-ledger statement per changed job; the changed-job read joins prior match state in one query.
- Definitions are deliberately limited to substring predicates.
- Equivalent searches share one row and therefore one cursor; per-user delivery state is postponed.

## Rationale and alternatives

**Evaluate all jobs every time:** rejected because it fails the core incremental-value hypothesis.

**Add a vector database now:** rejected because deterministic structured matching is sufficient to prove cursor reuse.

**Push every corpus event to every search:** postponed until real search volume justifies an inverted routing index or queue.

## Unresolved questions

- Whether query signatures become shared query objects once user accounts are added.
- Which occupation and geography taxonomies replace substring locations.
- When evaluation should move from request-driven batches to asynchronous routing.

## ADLC and operational impact

WS-0003 is an R1 stateful feature slice. G3 requires the D1 migration, bounded batch size, deterministic search fixtures, and explicit cursor invariant. G4 evidence includes pure matching tests, local D1 transition smoke tests, and Wasm/bundle validation. G5 review must verify that cursor advancement cannot skip unprocessed jobs and that current-match state agrees with returned transitions.

Operationally, clients may need to repeat evaluation while `has_more=true`. Search evaluation is request-driven in this slice; no scheduler or queue is added. Metrics should distinguish corpus sequence, search cursor, jobs evaluated, and transition counts.

## Security, privacy, and capabilities

The API stores search criteria but no identity. Public prototype deployments must treat saved searches as shared, non-private state. The slice does not accept CVs, contact details, or application data. Mutation authorization and per-user ownership are explicitly deferred rather than implied.

## Implementation plan

1. Add pure-Rust normalized search definitions and deterministic signatures.
2. Add `saved_searches` and `search_matches` D1 tables.
3. Implement bounded evaluator and transition ledger.
4. Expose create/list/get/evaluate/matches APIs.
5. Add browser and smoke-test journeys.
6. Update public and internal documentation.

## Verification and evidence

Required evidence:

- Query normalization and matching unit tests.
- Migration validation for all eight required tables.
- Local D1 smoke assertions for initial, idle, added, updated, closed, and final-idle evaluations.
- `cargo fmt --check`, strict Clippy, Rust tests, Wasm build, and Wrangler dry-run.
- Independent review of batch bounds, cursor advancement, and match-state transitions.

Evidence is recorded under `evidence/WS-0003/`.

## Rollout and rollback

Rollout applies migration `0003_saved_searches.sql` before deploying routes. Existing corpus and NAV ingestion behavior are unchanged. Rollback removes the new routes and UI while leaving the additive tables in place; destructive table removal requires a later explicit migration. Search data can be deleted independently without modifying canonical jobs.

## Decision record

- 2026-08-05: Accepted sequence-based evaluation over full-corpus rescans.
- 2026-08-05: Set an initial hard batch size of 200 changed canonical jobs.
- 2026-08-06: Reduced the production batch to 100 and scheduled fan-out to four searches per invocation so each cron task remains independently bounded.
- 2026-08-05: Deferred accounts, notifications, vector ranking, and asynchronous fan-out.

## Amendments

- 2026-08-06: Production qualification split NAV ingestion, search evaluation, and outbox delivery into staggered cron invocations. The saved-search batch was reduced from 200 to 100 jobs, and each scheduled sweep selects at most four searches.
