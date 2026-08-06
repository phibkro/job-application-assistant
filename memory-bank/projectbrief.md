# Project brief

Build a Norway/Oslo job intelligence service that:

- Collects permitted job-listing sources into a shared corpus.
- Merges duplicate source advertisements into canonical vacancies while retaining provenance.
- Evaluates saved searches incrementally using canonical change sequences.
- Quantifies source overlap, unique contribution, freshness, and search outcomes.
- Exposes a human interface and programmatic API.

## Prototype scope

One Rust Cloudflare Worker, one D1 database from the first executable slice, one live NAV connector, one second-source fixture connector, deterministic deduplication, five API routes, and a three-screen Dioxus demo.

## Success condition

A repeatable three-run demonstration proves initial canonicalization, changed-only search evaluation, and idempotent replay against the D1-backed corpus.

Detailed architecture: [`docs/internal/architecture/mvp.md`](../docs/internal/architecture/mvp.md)
