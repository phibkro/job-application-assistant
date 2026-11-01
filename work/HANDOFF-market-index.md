# Coding-agent handoff: Norwegian Job Market Index

> This handoff contains **proposed** product and architectural direction, not approval to implement it. Before executing code changes, the human owner must accept/authorize the governing RFC and the specific WorkScope. Do not self-approve a gate.

## Task brief

**Strategic goal:** Refocus the reusable core of this repository into a general-purpose, provenance-aware, read-only query service for the Norwegian job market. Preserve existing implementation until a separate migration proves feature and data safety. The personal [job-hunting](https://github.com/phibkro/job-hunting) suite is a downstream client, not a dependency.

**Conceptual pipeline:** reviewed source registry/policy → acquisition → ingestion/checkpoint → persisted observations → versioned derivations/canonical index → query engine → views/change cursors → clients. Storage spans raw/evidence and derived projections. Scheduled acquisition is independent of client reads.

**Non-negotiables:** public queries are read-only; operational ingest writes are internal and bounded; append-oriented logical observations allow legally required purge; no blanket source-scraping permission; source occurrences and vacancies have different identities; ambiguous duplicates do not merge without evidence; unknown employment workload is not full-time; no public personal profile data; no arbitrary SQL or autonomous applications.

## Read in order

1. `AGENTS.md` and the six memory-bank files listed there. They describe **currently approved** product/code, not the proposed pivot.
2. [Technical product/project lead brief](../docs/internal/product/market-index-lead-handoff.md) — decision register and readiness gates; confirm human acceptance before execution.
3. [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md) — proposed goal, invariants, exclusions and approval gates.
4. [Target technical architecture](../docs/internal/architecture/read-only-market-index.md) — phase contracts and data/query semantics.
5. [Tracer-bullet roadmap](../docs/internal/architecture/market-index-tracers.md) — incremental, user-visible test program.
6. [WS-0020@1](WS-0020-r1-market-index-baseline.md) and [execution plan](WS-0020-r1-execution-plan.md) — first **proposed** bounded Ticket.
7. Current `packages/domain/`, `packages/adapters/`, `apps/worker/`, `apps/web/`, `infra/alchemy.run.ts`, `db/schema.sql`, and relevant tests. Confirm implementation from source at pinned commit rather than a stale summary.

## Before owner approval

Allowed: inspect source, list inconsistencies, review the RFC, propose acceptance criteria, outline exact tests and prerequisites. **Not authorized:** broad feature implementation, schema/identity migration, production changes, deletion/move of application features, new external collection or integration of contested source adapters.

## After owner authorizes WS-0020

Use one bounded vertical **characterization** slice:

- Pin repository commit and current toolchain versions.
- Trace a deterministic NAV observation through real Worker+D1 into a read API and UI.
- Verify identical replay does not create a new semantic change; characterize update/closure where supported.
- Inspect duplicate semantics, query surfaces, lazy acquisition activation and stage evidence.
- Record a brief gap report plus local command/test evidence, distinguishing source tests from live deployment proof.
- Produce a reviewable PR with characterization tests/docs only. Propose TB-01 (40–60% workload semantics) as the next separate Ticket.

**Do not fix uncovered defects through unapproved behavior changes.** Record a falsifier and request a new WorkScope.

## Handoff output contract

At session end, leave:
1. Pinned commit and branch, exact scope revision and allowed capabilities.
2. Files changed and demonstrated end-to-end behavior.
3. Tests executed with pass/fail and environment requirements; no unsupported claims of production success.
4. Remaining risks, failed hypotheses and source-policy questions.
5. One small, testable next Ticket with rationale, acceptance tests and rollback.
6. Any required human/independent gate decision.

Use the repository's ADLC and submit artifacts through a PR. A tracer is complete only when the output can be observed through a client and checked against its stated falsifier.
