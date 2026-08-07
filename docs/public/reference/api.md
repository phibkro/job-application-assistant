# HTTP API reference

> Status: proposed MVP interface — historical. This predates the implemented
> API entirely (routes like `POST /api/collect` were never built as
> written). The current contract is declared in `apps/worker/src/Api.ts`
> (an Effect `HttpApi` declaration); `docs/public/reference/api-v1.md`
> documents the versioned production routes the Rust worker shipped, which
> only partially overlap with `Api.ts`'s current TypeScript routes.

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

This interface was never implemented as written. `apps/worker/src/Api.ts` is
now the authoritative, generative source of the contract — see its doc
comment for why a hand-kept OpenAPI document is no longer how this service
publishes its API.
