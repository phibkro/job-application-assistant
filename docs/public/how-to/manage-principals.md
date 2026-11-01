# Manage API principals

> **Historical.** Principal (API-key) administration existed only in the
> Rust worker retired by RFC 0015's cutover. The TypeScript service has no
> principal system; see `memory-bank/progress.md` for the current gap list.

The Rust-era command that generated and registered a principal no longer
exists (no current task replaces it). It wrote the generated API key to
ignored `.principal.env` with mode `0600`; the Worker stored only its SHA-256
hash.

Administrative routes:

```http
POST /api/admin/principals
GET  /api/admin/principals
POST /api/admin/principals/{id}/revoke
GET  /api/admin/audit
```

Revocation is preferred to deleting a principal because historical ownership and audit records remain attributable. Revocation also disables its webhook subscriptions and dead-letters pending deliveries.

Roles are deliberately limited to:

- `reader`: read owned searches, matches, subscriptions, and deliveries.
- `member`: the same read access plus owned-resource mutation.

The administrator control plane uses the separate `ADMIN_SYNC_TOKEN`; API principals do not inherit administrator routes.



Principal names are stable identifiers. Provisioning the same normalized name rotates its key and updates its role or quota.
