# Active context

## Current focus

Freeze and externally verify the WS-0006 through WS-0011 first-production design: corpus trust, versioned API, principal ownership, webhook delivery, and qualification.

## Current decisions

- Rust Cloudflare Worker with D1 as the system of record.
- `workers-rs` and `worker-build` pinned to 0.8.5; Rust pinned to 1.97.1.
- RFC 0005/WS-0002 owns live NAV ingestion.
- RFC 0006/WS-0003 owns incremental saved searches.
- RFC 0007/WS-0004 owns reliable bounded ingestion control.
- RFC 0008/WS-0005 owns environment isolation and executable QA boundaries.
- RFC 0009 through RFC 0014 own maintenance, API v1, principals, owned searches, outbox delivery, and qualification.
- `./deploy` always targets disposable staging; production requires `./deploy-production`.
- Production disables demo mutations, unauthenticated NAV operations, and public token fallback.
- Production requires private NAV/admin credentials and HTTPS corresponding-source URL.
- Production uses staggered cron triggers so ingestion, search evaluation, and outbox delivery have isolated budgets.
- `just verify` uses a loopback NAV stub and the real Worker Fetch/D1 path.
- Local/test/staging/production use distinct Wrangler templates and D1 identities.
- Project license is `AGPL-3.0-or-later`.

## Current command surface

```text
just nav-key          # configure NAV private consumer key
just admin-key        # generate/configure protected operator token
just principal-key     # provision an API principal against a running environment
just fix              # safe Clippy fixes + formatting
just test             # workspace library tests
just verify           # all checks + Worker/D1/NAV-stub/API/outbox integration
just qualification    # indexed 50k corpus + local restore drill
just soak             # bounded staging soak; use seven days for acceptance
just dev              # disposable local UI
./deploy              # verified destructive staging acceptance
./deploy-production   # explicit non-destructive production deployment
```

## Next action

Generate and review `Cargo.lock`, run `just fix && just verify`, repair any compiler or local integration failures, deploy staging, and begin the seven-day soak. Production remains gated on live restore/rotation/deployment evidence and independent review.

## Open decisions

- Public repository/source URL for AGPL network deployment.
- Custom production hostname and whether to disable `workers.dev`.
- Cloudflare Access replacement for the temporary admin bearer token.
- Raw source retention and sanitization policy.
- Whether observed notification volume justifies Cloudflare Queues after production evidence.
