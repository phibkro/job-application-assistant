# WS-0003@1: Incremental saved searches

- Status: Executing
- Risk tier: R1
- Governing RFC: RFC 0006
- Owner: Project maintainer
- Review owner: Independent search reviewer

## Outcome

A client can create a structured saved search, evaluate it against the canonical corpus, and later retrieve only transitions caused by canonical jobs changed after the previous evaluation sequence.

## Acceptance criteria

- Equivalent definitions produce the same signature independent of order and case.
- Initial evaluation returns matching existing jobs as `added`.
- Immediate replay evaluates zero jobs and produces no transitions.
- A new matching job produces one `added` transition.
- A changed matching job produces one `updated` transition.
- Closing that job produces one `closed` transition.
- Current matches exclude closed or removed jobs.
- Each evaluation processes at most 100 changed jobs and reports `has_more`.
- D1 migrations, pure-Rust tests, local D1 smoke tests, Wasm build, and bundle validation pass.

## Exclusions

- Accounts, authentication, and private ownership.
- Notifications and scheduled search evaluation.
- Semantic ranking and CV matching.
- Second live source or fuzzy deduplication.
