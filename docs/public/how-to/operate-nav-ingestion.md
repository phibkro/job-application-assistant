# Operate NAV ingestion

## Inspect state

```sh
curl -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/status
```

Important fields include `mode`, `paused`, `lease_owner`, `lease_expires_at`, `retry_after_at`, `consecutive_failures`, `last_failure_class`, and `lag_seconds`.

## Start a bounded run

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/sync
```

The run stops after reaching the tail, receiving `304 Not Modified`, or exhausting a page, observation, detail-fetch, or duration budget.

## Pause and resume

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/pause

curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/resume
```

Pausing clears the current lease. Resuming also clears retry backoff.

## Inspect failures

```sh
curl -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/failures
```

The service stores bounded operational metadata and hashes, not full NAV payloads.
Rate-limit responses honor NAV `Retry-After` when present; otherwise retries use bounded exponential backoff.

## Retry now

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/retry
```

This clears the current retry timer and executes the same bounded synchronization path.

## Restart from a NAV position

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"cursor":"/api/v1/feed","if_modified_since":"Sat, 1 Feb 2026 00:00:00 GMT"}' \
  https://<worker>/api/sources/nav/restart
```

Restart resets conditional request metadata and enters backfill mode. It does not delete existing canonical jobs.

## Release an abandoned lease

Normally, wait for lease expiry. To clear an already expired lease explicitly:

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/sources/nav/lease/release
```

The endpoint never clears a live lease.
