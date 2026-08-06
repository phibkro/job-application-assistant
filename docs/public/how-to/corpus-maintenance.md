# Audit and reconcile the corpus

Run a read-only integrity audit:

```sh
curl -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  https://<worker>/api/admin/maintenance/audit
```

Preview repairs:

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"dry_run":true}' \
  https://<worker>/api/admin/maintenance/reconcile
```

Apply at most 100 status repairs:

```sh
# Inspect the dry run first.
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"dry_run":false}' \
  https://<worker>/api/admin/maintenance/reconcile
```

Reconciliation only closes jobs with no active source occurrence or reopens jobs with at least one active occurrence. It inserts normal corpus change events, so saved searches can observe repairs incrementally.


## Purge delivered notification history

Preview the default 30-day retention policy:

```sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"dry_run":true,"retention_days":30}' \
  https://<worker>/api/admin/maintenance/purge
```

Apply at most 500 deletions per invocation by setting `dry_run` to `false`. Repeat while `has_more` is true. Only delivered outbox rows are eligible; pending, delivering, and dead events are retained for operator action.
