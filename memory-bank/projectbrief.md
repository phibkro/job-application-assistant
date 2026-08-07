# Project brief

Build a Norway/Oslo job intelligence service that:

- Collects permitted job-listing sources into a shared corpus.
- Merges duplicate source advertisements into canonical vacancies while retaining provenance.
- Evaluates saved searches incrementally using canonical change sequences.
- Quantifies source overlap, unique contribution, freshness, and search outcomes.
- Exposes a human interface and programmatic API.

## Current shape

A TypeScript/Effect v4 Cloudflare Worker (`apps/worker/`) serves every route
group over one D1 database. RFC 0015 strangled the original Rust/Cloudflare
Worker prototype; the Rust crates, its ordered migrations, and their
build/test/smoke tooling are retired as of the cutover. `packages/domain/`
owns canonical identity and normalization; `apps/web/` is the interface.

## Success condition

The service canonicalizes source listings into deduplicated jobs with
provenance, evaluates saved state incrementally, and now also carries the
browse/save/draft/apply application loop. `just preview` proves the whole
stack serves locally; `./bootstrap verify` is the deployable-state gate.

Current architecture: [`docs/internal/architecture/effect-module-map.md`](../docs/internal/architecture/effect-module-map.md)
Original prototype design (historical): [`docs/internal/architecture/mvp.md`](../docs/internal/architecture/mvp.md)
