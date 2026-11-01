# Proposed technical architecture: Norwegian Job Market Index

> **Status: Design proposal, not approved implementation authority.** Governed by [RFC 0016](../rfcs/0016-read-only-norwegian-market-index.md). The current shipped product still follows [the accepted vision](../product/vision.md) until an authorized decision and migration.

## Intent and architectural style

Build a small, domain-specific **distributed information index**: independently observe external sources, maintain a versioned canonical market corpus incrementally, and serve safe read-only queries through interchangeable clients.

The design borrows relational database semantics, incremental build systems, and reactive views; it **does not** implement a generic database, build engine, orchestration service, or application-command platform.

```mermaid
flowchart LR
  R["Source registry + policies"] --> A["Acquisition"]
  A --> I["Ingestion"]
  I --> O[("Observation & checkpoints")]
  O --> D["Derivation & identity"]
  D --> C[("Canonical / indexed projections")]
  C --> Q["Query compiler + D1"]
  Q --> V["Views / change feeds"]
  V --> W["Web / CLI / agents / job-hunting"]
```

- **Data plane:** source observations → canonical information → query results.
- **Control plane:** registry review, acquisition schedule, leases, backoff, checkpoints, permission, retention, health.
- **Query plane:** validated query AST, logical plan, SQL execution, projections, changes-since.
- **Effect boundary:** only acquisition, ingestion, persistence, and operator-controlled maintenance perform effects. Queries do not fetch external sources or change authoritative state.

## Model/view traceability

A compact mapping of 4EM concerns to ArchiMate element kinds and engineering contracts:

| 4EM model | Concern | ArchiMate representation (conceptually) | Engineering contract |
| --- | --- | --- | --- |
| Goals | Broad discoverability, accuracy, agency, sustainability | Goals, outcomes, requirements | Query usefulness, evidence, source coverage, costs |
| Business rules | Source permission, retention, no application commands | Constraints, principles | Configured policy gates, read-only HTTP contract |
| Concepts | Employer, ATS, platform, listing, vacancy, observation | Business objects / data objects | JSON/Effect Schema models and identity invariants |
| Processes | Discover, acquire, ingest, derive, query, review | Processes and application services | Tracer-bullet journeys |
| Actors/resources | Employer, publisher, operator, seeker, client | Actors/roles/resources | Independent authority and access boundaries |
| Technical requirements | Incremental, bounded, observable, portable | Application/technology components | Effect, D1, adapters, API and tests |

Use **one canonical domain model** with multiple derived viewpoints; do not maintain divergent diagrams as competing sources of truth.

## Phase contracts and prior art

| Phase | Inputs → outputs | Primary component / implementation seam | Prior art to investigate when needed | Default decision |
| --- | --- | --- | --- | --- |
| Registry | Reviewed source manifests → executable source set | `packages/domain/src/Source.ts`, `scripts/ts/catalog.ts`, `source_catalog` | Airbyte declarative manifests, data catalogs | Typed version-controlled configuration, policy separate from adapters |
| Acquisition | Source endpoint + cursor → bounded page/observation | `packages/adapters/src/SourceAdapter.ts`, NAV adapter | Singer SCHEMA/RECORD/STATE, HTTP conditional fetch | Existing statically registered Effect adapters |
| Ingestion | Source page → committed observations, state, failures | `apps/worker/src/ingestion/`, SourceLease, D1 | dlt incremental loading, at-least-once delivery | Checkpoint-and-data atomicity, bounded retries |
| Storage | Observations + transitions → authoritative ledger and projections | `packages/domain/src/Job.ts`, `apps/worker/src/corpus/`, D1 | Relational databases, dbt snapshots, W3C PROV | D1/SQLite; append-oriented logic, mutable indexes, policy-bound erasure |
| Analysis | Versioned observations → identity and typed facts | Pure domain functions + projection builders | Nix derivations, Salsa red-green algorithm, OpenRefine entity reconciliation | Explicit version/fingerprint invalidation, conservative identity |
| Querying | JSON query AST → validated SQL plan → bounded rows | `apps/worker/src/Api.ts`, corpus SQL | Relational algebra, SQLite query planner, DataFusion logical plans | Parameterized D1 queries; no separate optimizer |
| Views | Query results/changes → client-appropriate projections | Corpus views, typed API, read models | Datasette, SQL views, materialized view maintenance | Virtual SQL views + cursor-based changes first |
| Clients | Read contract → browser, CLI, agent, personal suite | `apps/web/`, typed SDK, external `job-hunting` | OpenAPI, typed clients | One stable read contract; clients own their own mutations |

Materialize, Feldera/DBSP, differential dataflow, orchestration suites, vector indexes and general search engines are **deferred**. Require measured query workloads or correctness failure before introducing them.

## Suggested domain vocabulary and identity

- `Platform`: provider/network such as NAV or an ATS family (Teamtailor/Webcruiter). A board and an ATS are not interchangeable; role/type is explicit.
- `Operator`: entity controlling a platform.
- `Employer`: recruiting legal organization, preferably with organization number and supported aliases.
- `Source`: one concrete permitted feed/endpoint/career site associated with a platform and sometimes an employer.
- `Listing`: advertisement in a specific source, keyed by `sourceId + externalId`.
- `Observation`: at a captured time, this source stated this value/status or had this content hash; records extraction method/version and evidence where permitted.
- `Vacancy`: underlying hiring opportunity to which zero or more listings may be confidently or provisionally linked; its ID must not be inferred only from title/employer/city.
- `DerivedFact`: field value with evidence, extraction/normalization version, and confidence/unknown state. No model-only claims as authoritative facts.
- `CanonicalChange`: ordered creation/update/closure/reopen/merge/split/tombstone transition for incremental consumers.
- `Query`: immutable, versioned typed AST.
- `View`: result/projection of query against a known corpus sequence, potentially materialized.

**Do not silently mutate existing ID semantics.** Today's `deriveCanonicalKey` in `apps/worker/src/corpus/identity.ts` hashes normalized title/employer/location. This is deterministic but not proof of shared requisition. Introduce explicit source identity and reconciliation evidence behind a migration/compatibility map before adjusting canonical IDs.

## Separation of source policy and capability

A platform/endpoint's technical acquisition method and permitted collection/republication must be **independent**. Suggested registry concerns:

- Source identity, platform type, known employer/career-site linkage and source URL.
- Acquisition tier/method, cursor semantics, conditional-fetch support, expected update frequency, cost/budget.
- Access authorization status, redistribution rights, historical retention, takedown/deletion obligations, review evidence/time, required credentials.
- Health: latest attempt, latest successful observation, freshness gap, last failure, parser/adapter version.
- Coverage statistics: unique relevant opportunities, overlap with other sources and data availability.

Unknown permission is not permission. FINN's prior personal watcher in job-hunting is **not** a blanket authorization for shared indexing/republishing.

## State model

| State | Authority | Write behavior | Rebuildable? |
| --- | --- | --- | --- |
| Versioned registry configuration | Operator review | Explicit config change only | Yes, from reviewed source |
| External source observations | Publisher evidence, access policy | Append/deduplicate within lawful retention; tombstone/purge when required | Not always; upstream may disappear |
| Ingestion cursor/lease/failure log | Local runtime | Controlled internal commits | Partially |
| Canonical vacancies, relationships and search indexes | Versioned derivation logic | Internal upsert/remove/rebuild | Yes, **if** underlying permitted evidence retained |
| Query AST and logical plan | Caller input + compiler | No durable write required | Yes |
| Per-query cached projection | Index engine | Optional cache | Yes |
| CV, applications, private judgments | Personal client | Entirely outside shared index | Client-owned |

Do not conflate append-only history with append-only physical tables. Operational purge is essential, and view updates may retract earlier results.

## Incremental semantics

1. Fetch emits bounded observations. The observation's semantic fingerprint excludes inconsequential fetch metadata.
2. Ingest checks deterministic source identity and fingerprint; if unchanged, no new canonical change sequence.
3. Changed input invalidates relevant derived entities; derivation identity includes **relevant input versions + transform version + configuration version**.
4. Apply resulting projection changes and append a semantic change record in one safe commit, with any related cursor.
5. Rebuild or re-evaluate downstream affected views on demand; read clients may poll a monotonic change cursor.
6. A change to the derivation algorithm requires explicit version bump, migrations/rebuild strategy and comparison against the old result, not silent reinterpretation.

Correctness requirement (on permitted retained inputs and a fixed transform version):

```
incremental(projected(D), ΔD) == rebuild(D ⊕ ΔD)
```

Test repeated identical pages, modified vacancy, closure, reopening, old page arriving late, competing workers, and ambiguous cross-source equivalence. Track when the authoritative evidence set is incomplete because of retention or data deletion; do not assert arbitrary historical replay is possible.

### Freshness strategy

Production ingestion must be driven independently of user traffic. The current `apps/worker/src/ingestion/lazy.ts` has a six-hour floor triggered by authenticated reads and `scheduled.ts` survives mainly for local testing. Proposed migration: periodic or scheduled bounded checkpoint runs, with source-specific policies and a measured deployment gate; do not enable cron based solely on configuration because prior evidence reported Cloudflare dispatch issues. Client read paths remain latency-bounded and may expose last-known data plus `asOf` / source-freshness metadata.

## Query semantics

Canonical JSON/Effect Schema AST is the public query contract; different clients are consumers. Planner is an executable **pure** compiler from validated AST, catalog metadata, and permitted statistics to a logical/SQL plan. SQLite/D1 remains the physical optimizer.

Initial operators: `filter` (AND/OR/NOT + typed predicates), `project`, bounded `join`, `group`, `order`, `limit`/cursor, and `changesSince`. Restrict accepted operators, max depth, cardinality and response size; all SQL is parameterized. Query POST is read-only, not a mutation. Reject unsupported operators explicitly.

Example **illustrative AST** (not yet an API contract; schema acceptance is a separate tracer):

```json
{
  "version": 1,
  "dataset": "vacancies",
  "where": {
    "all": [
      {"field": "location.municipality", "op": "eq", "value": "0301"},
      {"field": "workload.percentRange", "op": "overlaps", "value": [40, 60]},
      {"field": "status", "op": "eq", "value": "active"}
    ]
  },
  "unknownPolicy": "separate",
  "orderBy": [{"field": "publishedAt", "direction": "desc"}],
  "limit": 50
}
```

**Workload semantics:** a known 50% matches; known 40–80% overlaps; known 100% does not; negotiable is not a guaranteed match; unknown is reported distinctly when requested. Preserve distinction between full-time, part-time, appointment type and numeric extent. Capture extraction evidence and report conflict between sources rather than guessing.

**Change semantics:** a query projection can lose matching entries when records close or stop satisfying its predicate. Change cursors must represent removed/nonmatching results or supply sufficient canonical changes for a client to derive removals; merely returning new matches is not reactive correctness.

**API evolution:** reuse `apps/worker/src/Api.ts` as the schema-driven contract; add a versioned read surface without silently removing existing endpoints. OpenAPI generation currently needs qualification. Proposed read resources: vacancies, employers, sources/health, query execution and changes. Query planner must not control fetch or source mutation.

## Views

- Current vacancy detail with authoritative and conflicting fields, sources, timestamps and confidence.
- Search result list with explicit unknown/workload states and source freshness.
- Source coverage and overlap: measurable unique listings per active source and recent failures, **not** estimated total national coverage without independent data.
- Employer/ATS relationships, e.g. which employers publish via a recruitment platform.
- Changes since a sequence for polling/agent clients.

Materialize only views whose evaluation is expensive or whose subscription fanout is justified. Favor SQL read views and sequence cursors first.

## Client boundary and migration notes

The indexer owns public market observations and canonical facts. `job-hunting` owns the personal decision/application process and can cache/snapshot vacancy evidence according to source policy. Existing personal workspace features already shipped in `job-application-assistant` are not removed by this document; use approved migration scopes and compatibility tests, with one authoritative owner per application state.

No private documents, contact details, applicant profile or subjective suitability opinion belongs in public market query results. Personal relevance analysis can happen in a private consuming client; general public query facets stay objective and evidence-based.

## Evidence and measurement

- Current integration baseline: `just preview`, `bun run check`, `just verify`, `just qualification` **as applicable to the pinned revision**; distinguish local tests from production evidence.
- Data fidelity: lossless source provenance where permitted, correct handling of updated and retracted fields, stable identity across fetch replay, explicit unknown.
- Incremental correctness: compare targeted projection with rebuild across generated and hand-labeled cases.
- Coverage: per-source unique relevant listings and marginal value, confidence and freshness.
- Performance: D1 indexes and EXPLAIN QUERY PLAN on representative 50,000-row fixture, real request/cost timings; set numeric budgets after baseline.
- Contract portability: equivalent queries yield same semantics through web and at least one programmatic client.

## Open design decisions

Identity migration, source policy and retention per platform, which existing private features remain in the shared service during transition, exact initial query AST shape, source refresh schedule, and query-result access/privacy boundaries. Resolve via individual tracer evidence and owner decision, not by assumption.
