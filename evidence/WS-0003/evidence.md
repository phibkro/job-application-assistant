# WS-0003 evidence

## Implemented evidence

- Pure Rust normalization and matching semantics in `job-index-core`.
- D1 migration `0003_saved_searches.sql`.
- Saved-search HTTP API and bounded evaluator in `job-index-worker`.
- Browser journey and local D1 smoke assertions.
- RFC 0006 and WS-0003 scope/plan.

## Required executable evidence

Run:

```sh
just fix
just verify
```

Expected smoke evidence:

- initial evaluation: two jobs evaluated and two added;
- immediate replay: zero jobs evaluated;
- new matching NAV fixture: one job evaluated and one added;
- updated matching NAV fixture: one job evaluated and one updated;
- closed matching NAV fixture: one job evaluated and one closed;
- final replay: zero jobs evaluated;
- two original active matches remain.

## Remaining review

- Rust/Clippy/Wasm compilation on the pinned Nix environment.
- Local D1 smoke output attached from the verifier.
- Independent G5 review of cursor advancement, match transitions, and bounded evaluation.
