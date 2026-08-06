# HTTP API reference

The production versioned surface is documented in [API v1](api-v1.md). The unversioned saved-search routes below are demo-only and return `403` when demo mutations are disabled.

## Corpus reads

### `GET /api/health`

Returns process health and the explicit environment identity without querying D1.

```json
{"status":"ok","service":"job-index","environment":"production"}
```

### `GET /api/about`

Returns the AGPL license, environment identity, and configured corresponding-source URL.
Production deployment requires the URL to use HTTPS.

### `GET /api/jobs`

Returns canonical jobs, lifecycle status, corpus sequence, and all source
occurrences with their active state.

### `GET /api/demo/status`

Returns corpus counters.

## Saved searches

### `POST /api/searches`

Creates or reuses a normalized saved search. Equivalent definitions share a stable query signature.

```json
{
  "name": "Oslo support and customer service",
  "definition": {
    "locations": ["Oslo"],
    "include_terms": ["support", "customer"],
    "exclude_terms": ["senior"]
  }
}
```

### `GET /api/searches`

Lists saved searches and their last evaluated corpus sequence.

### `GET /api/searches/{id}`

Returns one normalized saved search.

### `POST /api/searches/{id}/evaluate`

Evaluates at most 200 canonical jobs whose sequence is newer than the search cursor. Returns `added`, `updated`, `closed`, and `removed` transitions, plus `has_more` when another bounded evaluation is required.

### `GET /api/searches/{id}/matches`

Returns current matching canonical jobs. Closed and removed jobs remain in the internal ledger but are not returned.

## NAV ingestion

All remote mutation and operational inspection routes require:

```http
Authorization: Bearer <ADMIN_SYNC_TOKEN>
```

Local development may bypass this when `ALLOW_NAV_SYNC_WITHOUT_TOKEN=true`.

### `GET /api/sources/nav/status`

Returns source cursor and operational state, including:

```json
{
  "data": {
    "source_id": "nav",
    "cursor": "/api/v1/feed?last=true",
    "mode": "tail",
    "paused": 0,
    "lease_owner": null,
    "lease_expires_at": null,
    "retry_after_at": null,
    "last_failure_class": null,
    "consecutive_failures": 0,
    "pages_processed": 12,
    "observations_processed": 1024,
    "last_run_duration_ms": 4180,
    "lag_seconds": 87
  }
}
```

### `POST /api/sources/nav/sync`

Runs the bounded collector. A successful response may have `outcome` equal to
`completed`, `busy`, `paused`, or `deferred`. A completed report includes page,
observation, detail-fetch, lifecycle, duration, mode, cursor, stop-reason, lag,
and corpus counters.

One invocation processes at most the configured page, observation, detail-fetch,
and duration budgets. The default is four pages, 600 observations, 40 detail
requests, and 20 seconds.

### `GET /api/sources/nav/failures`

Returns up to 100 unresolved operational failures. Records include failure class,
page URL, optional item identity, bounded message, retryability, attempt count,
and hashes. Full source payloads and credentials are not stored.

### `POST /api/sources/nav/pause`

Pauses the source and clears its current lease.

### `POST /api/sources/nav/resume`

Resumes the source and clears current retry backoff.

### `POST /api/sources/nav/retry`

Clears retry backoff and immediately executes a bounded retry run.

### `POST /api/sources/nav/restart`

Resets the source cursor and optional `If-Modified-Since` position without
deleting canonical jobs.

```json
{
  "cursor": "/api/v1/feed",
  "if_modified_since": "Sat, 1 Feb 2026 00:00:00 GMT"
}
```

### `POST /api/sources/nav/lease/release`

Clears an expired lease. A live lease is not removed.

Production uses staggered scheduled tasks: NAV ingestion every 15 minutes, saved-search evaluation every five minutes on a two-minute offset, and outbox delivery every five minutes on a four-minute offset. `NAV_SYNC_ENABLED=true` controls only the NAV task.

## Deterministic demo mutations

Available only when `ALLOW_DEMO_MUTATIONS=true`:

- `POST /api/demo/reset`
- `POST /api/demo/collect`
- `POST /api/demo/atomicity`
- `POST /api/demo/nav/active`
- `POST /api/demo/nav/update`
- `POST /api/demo/nav/nonmatching`
- `POST /api/demo/nav/close`
- `POST /api/demo/nav/cursor-failure`
- `POST /api/demo/nav/lease`

The NAV fixture endpoints demonstrate `created`, `updated`, `closed`,
`reopened`, and `unchanged` transitions without external network dependency.
The lease probe demonstrates acquisition, contention, and stale reclamation.

## Error behavior

Administrative authorization failures return `403`. Live source failures return
`502` with a bounded public message while D1 source state retains a sanitized
operational error. Credentials are never returned by the API.

## Production legacy-route policy

`GET /api/jobs` and the fixture-oriented `/api/searches` routes exist only in local/test/staging demo environments. Production returns `403`; use the bounded `/api/v1/*` contract.
