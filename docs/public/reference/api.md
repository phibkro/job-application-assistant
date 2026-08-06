# HTTP API reference

> Status: proposed MVP interface.

## `POST /api/collect`

Runs one configured collection cycle and returns collection and canonicalization metrics.

## `GET /api/jobs`

Lists canonical jobs with cursor pagination.

## `GET /api/jobs/{id}`

Returns one canonical job, source occurrences, provenance, and current state.

## `POST /api/searches`

Creates a structured saved search and evaluates its initial corpus snapshot.

## `GET /api/searches/{id}/changes`

Evaluates jobs changed after the search's stored corpus sequence and returns additions, updates, closures, and removals.

## Stability

This interface is not yet implemented or versioned. OpenAPI becomes authoritative when the Rust service is scaffolded.
