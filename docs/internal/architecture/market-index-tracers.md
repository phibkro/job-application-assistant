# Market Index: tracer-bullet development program

> **Proposed program, not executable authority.** [RFC 0016](../rfcs/0016-read-only-norwegian-market-index.md) governs the intended boundary; obtain human approval of each WorkScope and relevant RFC changes before modifying implementation. See [target technical architecture](read-only-market-index.md).

## Principle: one narrow user outcome through all phases

A tracer bullet proves **registry → acquisition → ingestion → storage → analysis → query/views → client**, including necessary control-plane behavior. It must be executable, observable, small enough to revert, and independently testable. It does **not** construct an entire layer before other layers are usable.

For every tracer, write down:

1. **Outcome:** What can a human or API client now do?
2. **Falsifier:** What concrete example would prove the architecture or behavior wrong?
3. **Contract delta:** Smallest domain/schema, adapter, storage, API and client changes.
4. **Prior art to consult:** One or two references selected by the actual uncertainty (not a dependency-shopping exercise).
5. **Evidence:** Tests, fixture provenance, query plans, run logs, migration and rollback.
6. **Decision:** Existing mechanism sufficient, adopt a library, adapt a pattern, or defer.

Keep changes within a single approved Ticket/WorkScope revision, with bounded attempts and normal ADLC gates.

## Program / proposed Tickets

| Order | Tracer and client-visible outcome | Primary uncertainty | Patterns to consult | Falsifiable acceptance evidence |
| --- | --- | --- | --- | --- |
| **TB-00** | **Existing NAV vacancy appears in read UI/API with source** (baseline, not rebuild) | What is actually implemented and verified at current HEAD? | Existing Effect/D1/Alchemy source, test fixtures | Real Worker + D1 characterization; identical source replay no duplicate semantic change; document deployment/evidence gaps |
| **TB-01** | **Find advertised 40–60% jobs in Oslo, including explicit unknown/negotiable categories** | Employment extent representation and evidence | schema.org JobPosting, NAV feed semantics, typed relational predicates | 50%, 40–80%, 100%, unknown, negotiable, contradictory sources; API + client parity |
| **TB-02** | **One vacancy from two sources shown with provenance, and two distinct same-title roles remain distinct** | Cross-source entity resolution and safe source coverage | W3C PROV, OpenRefine, source registries | Two source fixture + one policy-permitted live source; zero false merge in labeled adversarial cases; source overlap report |
| **TB-03** | **Changed/closed/reopened vacancy updates query-visible state without a full rescan** | Targeted invalidation and replay correctness | Nix, Salsa, dbt snapshots | Incremental/rebuild equality; idempotence; checkpoint crash/retry; query removal/retraction; bounded recomputation |
| **TB-04** | **One versioned declarative query produces identical web and programmatic results** | JSON query AST and read-only planning | SQL relational algebra, SQLite EXPLAIN, Datasette | Typed AST validation, parameterized plan, bounded cost; API contract tests; rejecting malformed/unsupported queries |
| **TB-05** | **Independent recurring source refresh makes a stale feed current without user traffic** | Operational scheduling and source policy | Cloudflare Cron, dlt/Singer cursor semantics | Source-specific freshness/status, at-least-once safe run, staging scheduling evidence, no query-triggered acquisition |
| **TB-06** | **job-hunting consumes one canonical vacancy/query result as a read-only client** | Ownership and interoperability, not just API availability | Typed SDK/OpenAPI and client-side snapshots | No duplicate NAV poll for that pathway; stable external identity; personal application state remains client-owned |

**Ordering:** TB-00 → TB-01 is the shortest path to immediate value. TB-02 and TB-03 resolve correctness before generalizing the query AST. TB-04/05/06 follow their own approved gates. Dependency order may change when tests reveal a blocker, but no broad horizontal refactor is authorized by this roadmap.

## Cross-cutting constraints

- Source collection and publication rights are independently reviewed; test fixtures do not grant live-site permission.
- The API is read-only. No submission, applicant mutation or arbitrary remote commands in the indexer.
- Data provenance and unknown values are preserved; dedup must be conservative.
- All effectful acquisition/ingestion is bounded and separately coordinated; no read-initiated fetch.
- Physical D1 projections are mutable; append-oriented observational semantics are subject to retention and deletion.
- Public contract and canonical-ID changes require compatibility plans; never silently repurpose stored IDs.
- Personal data stays private. The public repository must not contain personal CVs, authentication secrets or real communications in fixtures.
- A full-system architecture from scratch, a new generic build engine, a vector database, a workflow engine and mass code removal are excluded.

## The test harness to reuse

The existing repository includes a TypeScript/Effect Cloudflare Worker, D1 and Durable Object tests, deterministic fixtures, browser smoke and a representative 50k-row query qualification. Use the actual commands and pinned versions in `README.md` and `memory-bank/activeContext.md`, confirm availability on the checked-out revision, then run only tests relevant to the tracer plus required gates. Production qualification may remain outstanding even when local tests pass.

Minimum reusable tests:

- **Replay:** same observation input twice yields identical state and no new semantic change.
- **Incremental projection:** process deltas and compare against rebuild from retained permitted inputs.
- **Unknown handling:** missing, contradicted and ambiguous source fields remain explicit.
- **Identity adversary:** same company/title/city with two requisitions must not accidentally merge.
- **API equivalence:** same query AST yields same canonical IDs and sort order through programmatic and web clients.
- **Failure:** source unavailable is not no results; interrupted batch does not advance checkpoint.
- **Retention:** withdrawn/expired source content is no longer published per source rules.
- **Operational:** bounded pages, rates, query sizes, and observable source health.

## Agent handoff: execution protocol

At the start of a coding session:

1. Read `AGENTS.md` and its six memory-bank entries, then [RFC 0016](../rfcs/0016-read-only-norwegian-market-index.md), [target architecture](read-only-market-index.md), this document and the **one approved** WorkScope.
2. Resolve current branch/commit and inspect current source implementation. Memory-bank statements can be stale; live code and tests take precedence for implementation facts. Approved work-scope revisions and accepted RFCs retain authority.
3. Restate one user-visible outcome, named contract changes, one falsifier, prohibited changes and capability limits. Ask the owner if the gate is not approved.
4. Execute one tracer only: write a failing characterization/behavior test, make the smallest integrated change, then show evidence through the final client/API.
5. Run mandatory repository checks; capture exact commit, commands, pass/fail output, environmental dependencies, and source-policy evidence. Do not claim deployment success from local tests.
6. Submit a reviewable PR with contracts, migration impact and rollback described; stop at independent/human authority gates.

The first candidate implementation WorkScope is [WS-0020@1](../../../work/WS-0020-r1-market-index-baseline.md). Its [execution plan](../../../work/WS-0020-r1-execution-plan.md) is deliberately limited to characterization; later tracers must be separately scoped.
