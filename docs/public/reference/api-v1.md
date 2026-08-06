# Job Index API v1

The production API uses bounded cursor pagination. Public corpus reads do not require an API key. Owned saved-search and delivery routes require `X-API-Key`.

## Public reads

```http
GET /api/v1/jobs?status=active&location=Oslo&employer=Acme&q=support&source=nav&cursor=42&limit=25
GET /api/v1/jobs/{id}
GET /api/v1/changes?after_sequence=42&limit=100
GET /api/v1/sources
```

`limit` defaults to 25 and is capped at 100. `next_cursor` is the final sequence in a full page. `location` and `employer` are case-insensitive exact filters backed by dedicated indexes; `q` is a bounded title/description substring filter. Filter values are capped at 200 characters. Jobs include `source_ids` provenance.

The changes endpoint is an invalidation stream, not a historical snapshot store: `change_type` and `changed_at` describe the recorded change, while the embedded `job` is the current canonical projection at read time. Consumers should advance the sequence cursor and refresh their local projection idempotently.

## Principal authentication

```http
X-API-Key: <key>
```

API keys are generated outside the Worker and stored in D1 only as SHA-256 hashes.

## Owned searches

```http
POST   /api/v1/searches
GET    /api/v1/searches
GET    /api/v1/searches/{id}
PATCH  /api/v1/searches/{id}
DELETE /api/v1/searches/{id}
POST   /api/v1/searches/{id}/evaluate
GET    /api/v1/searches/{id}/matches?cursor=<sequence>&limit=50
POST   /api/v1/searches/{id}/reset
```

Every lookup is scoped by the authenticated principal. Search quotas are stored on the principal. Match pages default to 50 and are capped at 100. Reader principals may read owned resources but cannot create, update, reset, evaluate, subscribe, or delete them. Member principals may mutate owned resources. The administrator control plane uses a separate bearer credential.

## Webhook delivery

```http
POST   /api/v1/searches/{id}/subscriptions
GET    /api/v1/searches/{id}/subscriptions
DELETE /api/v1/searches/{id}/subscriptions/{subscription_id}
GET    /api/v1/searches/{id}/deliveries?cursor=<outbox_id>&limit=50
```

Production webhook URLs must use HTTPS. Payloads are signed with `X-Job-Index-Signature: sha256=<HMAC>` when a subscription secret is configured.
Delivery pages default to 50 rows and are capped at 100. `next_cursor` is the final outbox ID in a full page.

The machine-readable contract is [openapi/job-index-v1.json](../../../openapi/job-index-v1.json).


## Administrator operations

Administrator bearer authorization protects principal provisioning, scheduled-search sweeps, outbox delivery/retry, audit logs, ingestion recovery, and maintenance. The bounded production operations include:

```http
POST /api/admin/searches/evaluate-due
POST /api/admin/outbox/deliver
POST /api/admin/outbox/retry-dead
GET  /api/admin/maintenance/audit
POST /api/admin/maintenance/reconcile
POST /api/admin/maintenance/purge
```
