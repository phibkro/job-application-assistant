# Cloudflare product fit for Job Index

- Date: 2026-08-05
- Status: Research baseline for the first production design
- Scope: NAV-first job intelligence service deployed on Cloudflare

## Question

Which Cloudflare products are mandatory, optional, or unnecessary for the first production design, and should Cloudflare Pipelines participate in authoritative ingestion?

The classification uses these meanings:

- **Mandatory:** once this architecture is deployed to Cloudflare, the system depends on the capability.
- **Optional:** the capability can replace code or operations that could otherwise be implemented in Workers and D1.
- **Unnecessary:** it does not remove a current problem and should not be integrated speculatively.

## Decision summary

The first production design uses six Cloudflare capabilities deliberately:

1. Workers
2. D1
3. Cron Triggers
4. Worker Secrets
5. Workers Logs and observability
6. Wrangler configuration and deployment

Cloudflare Access and WAF/rate limiting are recommended production-edge controls but remain optional application dependencies. Analytics Engine and Queues are probable later additions when operational metrics and notification delivery justify them.

Pipelines must not sit between NAV and D1. D1 remains the authoritative transactional corpus. Pipelines may later export committed, sanitized events to R2 for analytical history.

## Mandatory capabilities

| Capability | Reason |
| --- | --- |
| Workers | Runs the Rust HTTP API, ingestion, matching, and operator control plane. |
| D1 | Stores the authoritative corpus, source occurrences, feed cursors, leases, failures, and saved-search state. |
| Cron Triggers | Starts unattended NAV synchronization. |
| Worker Secrets | Stores NAV private credentials and administrative credentials. |
| Workers Logs/observability | Makes unattended ingestion diagnosable and supplies invocation/error history. |
| Wrangler/configuration | Declares bindings, migrations, schedules, environments, and deployments. |

Cloudflare's baseline DDoS protection is inherited from the platform. It is a platform property rather than an application integration.

## Recommended but optional

### Cloudflare Access

Protect administrative routes and the operator UI without building a separate administrator identity system in the first release.

Candidate paths:

```text
/admin/*
/api/admin/*
/api/sources/*/sync
/api/sources/*/pause
/api/sources/*/resume
```

### WAF and rate limiting

Use edge rules for coarse abuse protection. Keep semantic quotas, such as saved-search evaluations per account, in the application.

### Analytics Engine

Add when logs become awkward for numerical service indicators such as feed lag, sync duration, failure count, and search-evaluation lag.

## Threshold-based optional products

| Product | Add when |
| --- | --- |
| Workflows | Backfill, retry, pause, and resume logic becomes harder to understand than the ingestion operation itself. |
| Queues | Independent work accumulates faster than it can be processed, especially notification or webhook delivery. |
| Durable Objects | Source coordinators experience meaningful lease contention or need persistent real-time sessions. |
| R2 | The system needs large exports, sanitized snapshots, quarantine artifacts, or analytical history. |
| Pipelines | Committed event volume justifies streaming ETL into R2 Parquet or Iceberg datasets. |
| Workers KV | Public configuration or caches can tolerate eventual consistency. |
| API Shield | External API consumers justify managed schema enforcement and stronger API controls. |
| Turnstile | Public browser forms or expensive anonymous operations appear. |
| Secrets Store | Several Workers need centrally managed shared credentials. |

## Pipelines analysis

Cloudflare Pipelines is a streaming ETL path into R2. It can durably receive events, transform them, and materialize analytical data. It does not provide the transactional invariant required by NAV ingestion:

```text
fetch feed page
→ normalize all accepted observations
→ converge canonical/source state
→ advance exactly one feed cursor
```

The authoritative path therefore remains:

```text
NAV
→ bounded ingestion Worker
→ D1 transaction and idempotent writes
→ D1 source cursor
```

A future analytical path may be:

```text
D1 committed outbox
→ Pipelines
→ sanitized R2 Parquet/Iceberg history
```

Potential uses include corpus-quality research, source coverage, long-term change statistics, and public aggregate exports. Complete historical NAV payloads must not be archived by default because inactive ads may have fields masked or removed and consumers are responsible for keeping exposed data current.

## Explicitly unnecessary for production v1

- R2 Data Catalog and R2 SQL
- Hyperdrive
- Vectorize
- Workers AI
- AI Gateway
- Agents SDK
- Pages
- Containers
- Workers for Platforms
- Browser Rendering
- Images and Stream
- Realtime products and TURN
- Tunnel and Spectrum
- Cache Reserve
- Zaraz
- Smart Placement

These products may become relevant later, but none currently removes a demonstrated problem.

## WS-0004 decision

Implement reliable ingestion with:

```text
Workers
Cron Triggers
D1 lease and source state machine
Worker Secrets
structured Workers Logs
```

Do not add Pipelines, Queues, Workflows, Durable Objects, or Analytics Engine in the first WS-0004 revision. Reconsider them from evidence:

| Observed problem | Candidate product |
| --- | --- |
| Backfill orchestration becomes dominant complexity | Workflows |
| Independent jobs need buffering/retries | Queues |
| Numerical service metrics are hard to query | Analytics Engine |
| Historical events burden D1 | Pipelines + R2 |
| Lease contention becomes material | Durable Objects |
| Public API abuse becomes material | WAF/rate limiting or API Shield |

## References

- Cloudflare D1 database API and transactional batches: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Cloudflare Pipelines: https://developers.cloudflare.com/pipelines/
- Cloudflare Workflows: https://developers.cloudflare.com/workflows/
- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- NAV vacancy-feed usage and retention obligations: https://navikt.github.io/pam-stilling-feed/
