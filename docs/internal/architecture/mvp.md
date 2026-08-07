# Minimal viable architecture

> **Historical, superseded.** This describes the original Rust/Cloudflare
> Worker prototype (RFC 0001/0004). RFC 0015 strangled it; the Rust crates
> this document refers to are deleted. Current architecture:
> [`effect-module-map.md`](effect-module-map.md). Left as written below —
> it records what was decided at the time.

## Deployment

```text
One Cloudflare Worker written in Rust
One Cloudflare D1 database
One live source connector
One fixture connector
```

The Worker contains the HTTP API, bounded collection coordinator, normalization adapter, deduplication orchestration, saved-search evaluation, and operator controls. D1 stores both canonical state and the source lease/cursor/failure control plane. Pure domain semantics remain in a Worker-independent Rust crate.

## Core proof

Three runs establish the value proposition:

1. **Initial run:** ingest two overlapping datasets and produce fewer canonical jobs than source occurrences.
2. **Changed run:** process additions, modifications, and closures; evaluate only changed canonical jobs against the saved search.
3. **Replay run:** ingest the same snapshot again and produce no canonical changes or repeated matches.

All authoritative state is stored through the D1 binding from the first executable slice.

## Minimum interface

```http
POST /api/collect
GET  /api/jobs
GET  /api/jobs/{id}
POST /api/searches
GET  /api/searches/{id}/changes
```

## Minimum data model

- `source`
- `collection_run`
- `canonical_job`
- `source_listing`
- `job_change`
- `saved_search`
- `search_match`

## Deliberate exclusions

No native SQLite adapter, Queues, Workflows, Pipelines, Durable Objects, OAuth, MCP, email, vector database, CV parsing, automated applications, Kubernetes, or microservices.
