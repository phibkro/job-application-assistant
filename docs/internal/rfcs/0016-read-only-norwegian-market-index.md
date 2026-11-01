# RFC 0016: Read-only Norwegian Job Market Index

- Status: Accepted
- Acceptance scope: Accepted with amendments A1–A4 (owner decision 2026-11-01). Acceptance authorizes individually approved WorkScopes only; it is not implementation authority by itself.
- Authors: Product-owner proposal, prepared for review
- Created: 2026-11-01
- Updated: 2026-11-01
- Work scope: [WS-0020@1 (approved 2026-11-01)](../../../work/WS-0020-r1-market-index-baseline.md); subsequent slices require their own approved scopes
- Review owners: Human product owner; independent architecture and data-policy reviewers
- Tracking issue: Not yet assigned
- Implementation PR: Not yet assigned
- Supersedes: the product boundary in [vision.md](../product/vision.md) (resolved under A3, 2026-11-01). Earlier application-focused RFCs stay in force only for the retained legacy personal API routes.
- Superseded by: None

## Summary

Refocus this repository from an end-to-end job-application product to a **general-purpose, read-only Norwegian job-market information service**. It discovers permitted information sources, acquires observations, incrementally derives canonical vacancies with provenance, and serves declarative, composable queries and views. It provides no public commands for applying to jobs, managing CVs, mutating opportunities, or changing third-party systems.

The existing application-assistant features are implemented assets, not deleted by accepting the concept. They remain operational under current authority until a separately reviewed compatibility, ownership, and migration plan is approved. [job-hunting](https://github.com/phibkro/job-hunting) is the intended personal application-workflow client.

## Motivation and evidence

- Norway's vacancy information is distributed across the NAV feed, job boards, recruiter platforms, and employer career sites. A search user should be able to ask one question without manually checking every distribution channel.
- Source listings and underlying vacancies differ; duplicates, changing job descriptions, closures, and stale sources make provenance and incremental maintenance necessary.
- The repository already has an Effect TS Worker, D1 corpus, source catalog, NAV adapter, source lease/checkpoints, canonical occurrences, typed API, and local tests. Only NAV is registered for live acquisition; the deduplication key derives from title/employer/location.
- Personal application records and drafting are currently implemented in this repository, while a separate job-hunting repository owns Typst documents, Linear Tickets, and intake scripts. These boundaries overlap and have incompatible authority if both are treated as canonical.
- A narrow, testable observation → derivation → query system is preferable to expanding general-purpose agentic write workflows.

## Revised outcome and measures

**Mission:** Provide a trustworthy, up-to-date, provenance-aware, unified **query interface over Norwegian employment opportunities**, usable by humans and other software.

Measure:
1. Unique relevant vacancies contributed per source, overlap and freshness; report observed coverage, never an unsupported percentage of the entire labor market.
2. Fidelity: no silent source-data loss; identities and employment facts carry evidence and uncertainty.
3. Correctness: repeated observations are semantically idempotent; incremental projections equal bounded full recomputation on test datasets.
4. Utility: an Oslo junior-tech 40–60% query separates explicit matches, negotiable terms, unknown workload, and excluded full-time positions.
5. Operability: checkpoint/retry safety, bounded cost, observability, policy and retention compliance, and reproducible local tests.
6. Interoperability: browser, external CLI/agent and job-hunting clients can use one versioned contract.

## Goals

- Stable canonical entities and JSON/Effect Schema contracts for sources, employers, postings, observations, vacancies, query ASTs and result provenance.
- Declarative, client-independent **read operations**, including search, record lookup, source/freshness views and change cursors.
- Permitted connectors and incremental, checkpointed observation ingest, independently scheduled from reads.
- Append-oriented **logical observation history** with lawful retention/deletion; rebuildable, physically mutable SQLite/D1 projections.
- Deterministic transformations with explicit versions and conservative source-to-vacancy identity decisions.
- Tracer-bullet development: each change produces a user-visible result through registry, acquisition, ingest, storage, derivation, query and a client.

## Non-goals

- Generic distributed database, SQL optimizer, build engine, dataflow framework or orchestration platform.
- Arbitrary SQL over the public API, public data mutations, per-user command state machines, autonomous submissions, browser-based application automation, subscription billing or marketing features.
- Moving/deleting all existing personal-workflow code in one change.
- Universal legal authority to scrape sites; technical reachability does not imply permission or redistribution rights.
- Market-wide completeness claims, opaque LLM-derived facts, or generic semantic ranking as an initial requirement.

## Guide-level explanation

An operator registers a verified source with retrieval and display/retention permissions. The independent acquisition scheduler fetches bounded pages and records observations. Changed observations cause deterministic updates of the affected vacancy projections. A client sends a typed read-only query, e.g. junior IT or research roles in Oslo with an advertised workload overlapping 40–60%. The API returns records, occurrence links, sources, freshness, and field-level evidence or an explicit unknown state. A separate personal client may save the vacancy, prepare a CV and manage its application lifecycle; none of those actions change the shared job index.

## Reference-level explanation

### Logical data and control flow

1. **Source registry and policy (control plane):** Platform/ATS, employer, source endpoint, acquisition mechanism, credential reference, permission for fetching, storage/redistribution and retention, review timestamp, source freshness target.
2. **Acquisition (effect):** Source-specific adapter obtains bounded records/pages with source identity, cursor, conditional HTTP information and provenance. Adapter cannot authorize itself.
3. **Ingestion (effect):** Decode/validate, classify failures, persist observations and checkpoints atomically, enforce source lease, budget, idempotence and source-specific closure/deletion policy. No silent skipped pages.
4. **Storage:** D1 persists operational cursors, source occurrences, observations or policy-permitted evidence, canonical projections and monotonic changes. Physical upserts and purges are allowed internally; they are not client mutations.
5. **Analysis (pure where possible):** Versioned transformations normalize fields, resolve employer and vacancy identity conservatively, propagate status and provenance, compute bounded derived records. Transform changes trigger targeted recomputation and controlled rebuilds.
6. **Query engine:** Effect Schema/JSON AST → validation → deterministic logical compilation → parameterized SQLite queries; D1 chooses physical plan. Structured filter, project, join, group, order, page, and changes-since semantics initially; semantic search optional later.
7. **Views and clients:** Current vacancy and employer views, source health/coverage, query results, change streams. Read API, browser, CLI/agent and external job-hunting client.

See [technical architecture proposal](../architecture/read-only-market-index.md) for the phase interfaces and proposed technology/pattern decisions.

### Identity and provenance invariants

- A `Listing` is identified by source + its external listing ID; a `Vacancy` represents a possible underlying hiring opportunity. Neither identity is substituted for the other.
- Employer identity should prefer authoritative identifiers (e.g. Norwegian organization number) over display-name equality.
- The current title/employer/location hash is **not sufficient proof** of same vacancy. Two concurrent identical-title roles may be different. Use strong evidence when available and permit unresolved candidate relationships rather than destructive merges.
- Treat advertised workload as a typed percentage or interval with source-backed evidence; never equate missing to 100%, or negotiable to guaranteed 50%.
- Source observations are not automatically retained forever. Closures, takedown, permitted retention limits and deletion require explicit tombstone/erasure behavior; derived views must stop exposing withdrawn content as required.
- Canonical changes carry monotonic sequence/cursor semantics. Replay of the same semantic input cannot advance the sequence merely because it was fetched again.
- Any AI extraction is an **untrusted proposal** with evidence and versioned method, never an authoritative source fact solely on model assertion.

### State boundaries

**Public read-only contract** means clients cannot mutate corpus, source configuration, third-party systems, or personal application state through this product. POST may be used for a complex read-only query body.

**Internal operational writes** are still required: source cursors, leases, ingestion-run logs, permitted observations, canonical projections, indexes, purge/tombstones and migration metadata. A query planner is a pure function of its query AST, catalog and permitted statistics; its internal cache, if any, is rebuildable optimization state, not domain truth. Retrieval must not implicitly launch acquisition.

**External client work** belongs outside the index: personal CVs, decisions, Linear workflow, communications and application submission.

### Failure and concurrency

- Retry at least once delivery safely; commit cursor with its corresponding observations; a failure leaves the last safe checkpoint unchanged.
- Distinguish no matches, stale corpus, unavailable source, prohibited source, decode failure and unknown fields.
- Bound pages, concurrency, rates, durations, query cost and response size. Record source last-success/last-attempt separately.
- Source-specific time ordering must not overwrite newer state with an older observation. Compare documented update/version semantics and explicitly handle closures and reopens.
- Readers serve last verified data with freshness metadata when permissible; they do not block on external fetch.
- Derived caches can be regenerated; persisted state requiring user authority or external proof cannot be silently reconstructed as if it were authoritative.

### Migration and compatibility

1. Baseline the checked-out revision and characterize existing NAV→D1→web, corpus identity, API, ingestion scheduling and applications tests. Do not assume memory-bank deployment evidence is current.
2. Introduce the new read model/queries additively, with contract tests and legacy API behavior preserved. No destructive D1 migration or silent change to canonical IDs.
3. Validate observed two-source overlap using a policy-permitted source and independent fixtures before changing dedup key semantics.
4. Migrate ingestion from current authenticated-read-driven lazy gate to independently scheduled bounded refresh only after deployment/evidence and rollback plan. Do not assume existing Cloudflare cron delivery works.
5. Move or retire profile/drafting/application modules only under a separate WorkScope after job-hunting has a verified alternative and required data is exported safely. Do not delete any personal history.
6. Production rollout, schema migration, retention changes and published API changes require explicit human gates.

## ADLC and operational impact

This is a substantial product, identity, interface and state-boundary revision; it requires an accepted RFC, then individually approved WorkScopes and evidence. Maintain the current six-document agent read-order in `AGENTS.md`, the accepted architecture in `docs/internal/architecture`, and existing tests. Tracer slices must not self-approve gates, deploy, alter retention, or remove features without explicit approval.

## Security, privacy, and capabilities

- Strictly separate shared public vacancy data from owner-specific private data.
- Preserve source access policy independently from application-submission policy and independently from content reuse/redistribution permissions.
- Use bounded fetches, rate limits, credential isolation and safe logging. Do not ship contested adapters into a shared deployment without review.
- Public read access does not authorize administrative ingestion, source registration, raw observation access, or any write endpoint.
- Support verified takedown and deletion obligations even if the logical processing model is append-oriented.
- Avoid exposing personal applicant data in public repository examples, query results, telemetry or fixtures.

## Drawbacks

- During migration, one Worker serves both the public index and the personal workspace, so the boundary is enforced by route groups and auth middleware, not by deployment isolation.
- Correcting vacancy identity (D05) touches stored canonical IDs and saved snapshots; that is R3 work with its own gate.
- Until TB-05, corpus freshness depends on personal-feed traffic (amendment A2).

## Rationale and alternatives

- **Retain full assistant product:** preserves current scope and integrated UI; rejected as the intended general-purpose boundary due to operational and privacy coupling. Existing implementation is retained during migration.
- **Create a new independent indexer repo immediately:** reduces semantic confusion but duplicates functioning Effect/D1 infrastructure. Defer until measurable ownership or deployment isolation requires it.
- **Adopt Airbyte/Materialize/Feldera/Dagster wholesale:** potentially useful at scale, but adds a second runtime and infrastructure before source coverage or correctness is proven.
- **Use immutable physical storage only:** simple conceptual model but conflicts with efficient indexes and removal obligations. Retain append-oriented logical transformations, mutable rebuildable materializations.
- **Demand globally unique vacancy IDs from all sources:** unrealistic; cross-source identity requires uncertain entity resolution.

## Prior art to investigate at the appropriate tracer

Singer (`SCHEMA/RECORD/STATE`) and dlt (cursor ingestion); schema.org `JobPosting` and Brønnøysundregistrene (vocabulary/entity identity); W3C PROV (lineage); Nix and Salsa (versioned derivations/dependency invalidation); SQLite/D1 and Datasette (query execution and browsable views); Materialize/Feldera (future complex incremental view maintenance). References inform design; none is mandatory installation.

## Unresolved questions

1. ~~Is the indexer-only boundary accepted?~~ Accepted with amendments (2026-11-01). Still open: product naming, and which existing application features migrate to job-hunting.
2. Personal application state: **interim freeze** (D02, 2026-11-01). D1 stays authoritative for existing in-app history, Linear for the job-hunting pipeline, with no new writers. The final owner is decided by the migration WorkScope.
3. Second-source policy: **interim NAV-only** (amendment A4). The per-source permission, redistribution and retention contract is still open; FINN is excluded.
4. Stable-ID migration strategy for already-saved jobs and ambiguity resolution, with compatibility and reversal.
5. Production scheduling design and evidence given historical Cloudflare cron concerns.
6. The minimum publicly exposed source detail and any access controls/quotas required for safe service operation.

## Implementation plan

Use [tracer-bullet program](../architecture/market-index-tracers.md) and the [first proposed WorkScope](../../../work/WS-0020-r1-market-index-baseline.md). Every tracer must cross the full path to a client and produce falsifiable behavior. Sequence research by the uncertainty each tracer actually exposes, not by constructing each infrastructure layer first.

## Verification and evidence

- Local full-stack characterizations against real Worker+D1 and deterministic source fixtures.
- Source replay, retry/cursor atomicity, no-op re-ingest, close/reopen, retention and stale-source tests.
- A labeled duplicate-pair fixture showing distinct same-title roles are not merged and high-confidence cross-source duplicates can be linked.
- Workload query tests for 50%, 40–80%, 100%, negotiable and unknown roles.
- Property/differential tests: `incremental(old, delta)` equals `recompute(old + delta)` for the supported projection.
- Bounded SQLite `EXPLAIN QUERY PLAN` against representative corpus sizes and source coverage measurements; record results instead of fabricating targets.
- Production claims require current committed revision, configured stage, non-destructive smoke, and human review.

## Rollout and rollback

Proposal review → accepted RFC → approved first tracer → additive schema/API and reversible feature flags → validated local/staging journeys → operator-reviewed production cutover. Roll back application/runtime changes without destroying observations, private data or compatibility mapping. Destructive migration needs independently verified backup and restore.

## Decision record

- Decision: Accepted with amendments A1–A4
- Decision date: 2026-11-01
- Decision owner: Human product owner (phibkro), via the technical-lead gate review recorded in the [lead handoff](../product/market-index-lead-handoff.md#lead-review-and-gate-decisions-2026-11-01)
- Final rationale: The boundary fits the existing code. NAV adapter, source lease, checkpointed ingestion, occurrence/canonical split, monotonic `sequence`, and an unauthenticated corpus read group already exist on `main` at `881eb40`. The pivot is therefore an additive refocus rather than a rewrite. The amendments address the one structural conflict found in review (A2) and keep current features authoritative until migration is proven (A1, A3).
- Companion owner decisions recorded at the same gate: **D02**, freeze personal application state with no new writers. **D04**, NAV is the only live source and others are fixture-only; FINN is excluded from the shared index.
- Dissent or residual concerns: Canonical identity merges same-title requisitions by construction (D05, open). Lazy refresh is coupled to personal reads (A2). The memory bank is stale about integrated WorkScopes WS-0016 to WS-0019.

## Amendments

- **A1. Current vision governs existing features.** [`vision.md`](../product/vision.md) and the accepted application-focused RFCs stay authoritative for existing implemented behavior until a migration WorkScope is approved. This RFC governs new market-index work only.
- **A2. Independent refresh precedes personal-route retirement.** On `main`, the only deployed acquisition trigger is `armsGate` in `apps/worker/src/index.ts`. It arms lazy ingestion by path only on the personal read routes (`/api/v1/me/feed`, `/api/v1/me/matches/*`), after the response, via `waitUntil`, **including unauthenticated (401) requests** (WS-0020 T6, `index.ts:206–211`). Separately, the public `GET /api/v1/jobs/:id` fetches NAV detail and writes D1 on unhydrated jobs, without advancing `sequence` (WS-0020 T5). Both are read-initiated acquisition, and both are recorded deviations from invariant 6 until TB-05 and TB-01's bounded hydration replace them. TB-05 (independent refresh) must therefore pass its gate before any personal route is retired or moved. Until then, the read-armed gate is a recorded, accepted deviation from invariant 6.
- **A3 resolution (2026-11-01).** At the legacy-UI retirement, the owner superseded `vision.md`'s product boundary. The retained personal API routes and data are legacy: no new features, destined for `job-hunting`.
- **A3. Supersession is decided at migration time.** The exact list of superseded vision sections and RFCs is set by the migration WorkScope, not by this acceptance.
- **A2 correction (2026-11-01).** Amended after WS-0020 evidence: the gate is path-based, not authentication-based, and the public detail read also acquires.
- **A4. Source policy for the tracer program (D04).** NAV is the only live source for TB-00 to TB-04. A second source is fixture-only until a per-source access, redistribution and retention review is recorded. FINN is excluded from the shared index; job-hunting's personal-scale watcher grants no shared-index permission.
