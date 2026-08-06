# Rust technology stack

## Product language

The product remains Rust across the Worker backend, browser UI, domain model, tests, and generated API schema.

Supporting formats remain SQL, JSONC/TOML, Markdown, CSS, and generated WebAssembly glue. Infrastructure may later use Alchemy's TypeScript/Effect interface without changing product implementation language.

## Proposed packages and tools

| Concern | Package or tool |
|---|---|
| Serialization | `serde`, `serde_json` |
| Cloudflare runtime and D1 | `worker` from `workers-rs` |
| Browser UI | `dioxus` |
| URLs | `url` |
| Content hashes | `blake3` |
| String similarity | `strsim` |
| Domain errors | `thiserror` |
| Telemetry | Worker-compatible structured logging/tracing adapter |
| OpenAPI | `utoipa` where Wasm compatibility permits, otherwise schema generation from shared contracts |
| Snapshot tests | `insta` for native pure-domain tests |
| Property tests | `proptest` for native pure-domain tests |
| Deployment and local D1 | pinned Wrangler tooling |
| Dependency policy | Clippy, rustfmt, `cargo-deny` |

Native-only runtime packages such as Axum, Tokio, SQLx, and Reqwest are not part of the first Worker application.

## Workspace shape

Start with two crates:

```text
crates/
  job-index-core/    # pure domain logic; no runtime, database, or platform bindings
  job-index-worker/  # workers-rs routes, Fetch, D1 adapter, and fixture collection
```

Additional repository assets:

```text
migrations/          # D1 SQL migrations
fixtures/            # deterministic source snapshots
wrangler.jsonc       # Worker and D1 binding configuration
```

The Worker adapter is deliberately thin. Normalization, identity, matching, and metric semantics must remain testable outside the Cloudflare runtime.
