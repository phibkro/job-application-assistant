# Deliver saved-search webhooks

Create a subscription with an authenticated principal:

```sh
curl -X POST \
  -H "X-API-Key: $JOB_INDEX_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"target_url":"https://example.com/job-events","secret":"shared-signing-key"}' \
  https://<worker>/api/v1/searches/<search-id>/subscriptions
```

A configured signing secret must be 16–512 characters. It is stored as sensitive application data in D1 because the Worker must use it for signing; do not expose database exports and rotate it by upserting the subscription. Staging and production require HTTPS and reject localhost, loopback, link-local, and private literal IP destinations. Local and test environments permit loopback HTTP for deterministic contract tests. Search evaluation commits match state, its sequence cursor, and outbox entries in one D1 batch. Scheduled execution is isolated from ingestion and delivery. Each search sweep evaluates at most four due searches, with each search evaluating at most 100 changed jobs. Delivery is separate and bounded to 20 events per invocation. Each webhook request has a 10-second application timeout and a five-minute delivery lease. Failed events use exponential backoff and become `dead` after ten attempts.

Manual operator controls:

```http
POST /api/admin/outbox/deliver
POST /api/admin/outbox/retry-dead
```

Delivery is at least once across process crashes: a receiver can accept a webhook before the Worker records it as delivered. The receiver must therefore deduplicate using `X-Job-Index-Event-Id` and verify `X-Job-Index-Signature` over the exact request body before processing.

Subscriptions are limited to 10 per saved search. Delivered events are retained for 30 days by default and can be purged in bounded batches through the maintenance API.

Delivery history is cursor-paginated with `limit` capped at 100. Follow `meta.next_cursor` until it is null.
