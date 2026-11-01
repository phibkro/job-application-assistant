# WorkScope: TB-01, workload facts through an experimental observation IR

- ID: WS-0022
- Revision: 1
- Status: **Proposed**. Needs owner approval. Starts only after WS-0021@3 lands (`effect ~4.1`).
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: additive schema (new tables), a new internal port shape, and an additive public field. No canonical-ID change, which TB-02 handles (R3).
- Roles: implementer at the `complex-reasoning` tier; independent reviewer at the `complex-reasoning` tier.
- Attempt budget: 2
- Governing decisions: `docs/internal/product/market-index-lead-handoff.md` (D06, IR shape, stability, stack, hydration option A); WS-0024 evidence as the reference model (`evidence/WS-0024/`, `spikes/WS-0024-clojure/`).

## User-visible outcome

A client can ask for **Oslo-area roles whose advertised workload overlaps 40–60%** and gets results grouped by fact state: explicit matches (`Stated`/`Derived`), `Negotiable`, `Unknown` (e.g. `Deltid` with no percentage), `TempUnknown`, `Unsupported` and `Conflicting`. Missing workload is never treated as full-time. This is available through the existing read API as an additive, experimental filter. The UI is not in scope.

## Falsifier

An advert with no stated percentage is excluded as full-time, or `40–80%` is reported as exactly 50%. Either means the slice failed.

## Scope (smallest integrated change)

1. **Verify D1 trigger support first** (a short probe in the workerd test harness). If D1 rejects `CREATE TRIGGER`, stop and report, since append-only enforcement is a precondition.
2. **Experimental IR v0** in `packages/domain` as a closed, versioned Effect Schema: `ListingObservation` with schema.org attribute names, `Fact<T>` with the 7 states, evidence, `method@version`, valid time (`datePosted`/`validThrough`) and recorded time (`recordedAt`, run id), plus a uniform `residue`. Mark it experimental.
3. **Append-only observation store**: an additive migration. Observations are content-addressed; SQLite triggers reject `UPDATE`/`DELETE`, and one purge path leaves a tombstone. Existing tables are unchanged.
4. **NAV importer** emits the IR (adds `extent`, `employer.orgnr`, `positioncount`), and `lower()` keeps `RawListing` and the existing corpus unchanged.
5. **Bounded background hydration** (option A): N detail fetches per ingestion run, with N a `Config` value. The default is chosen from a recorded measurement, not invented.
6. **Workload pass @1** (pure, with coded diagnostics as data), plus a rebuildable projection (`workload_min`, `workload_max`, `workload_state`) and the additive read-API filter.
7. **Conformance suite** `defineSourceConformance(adapter, fixtures)` with numbered guarantees, each with a broken twin (pg-outbox/file-transfer pattern). NAV is the first subject.
8. **Pure-core enforcement** (owner decision 2026-11-01): the new IR, the workload pass and the projection logic are plain pure functions, with no Effect services. A boundary test fails if they import Effect services, with a control twin. `oxlint-plugin-immutable` is scoped to those modules. Ingestion run and hydration lifecycles follow the event-driven loop in the handoff's "Ingestion control flow" decision: a pure `decide(state, event) → {state, commands}` with laws, executed by a thin Effect interpreter. Bounded hydration is one more command (`HydrateDetails(n)`). The trigger itself stays as-is until TB-05.
9. **Source-quirk catalogue** as data, seeded from WS-0020 and WS-0024 (`verifiedBy: docs | fixture | unverified`).

## Acceptance

- [ ] WS-0024 falsifiers **F1, F2, F3, F5, F6 (recorded-time as-of), F7** pass in TS against the real Worker + D1. Each control in this slice's scope is seen failing.
- [ ] WS-0020's characterization tests still pass. T4 (the D05 merge) stays pinned, since TB-02 deletes that pin.
- [ ] Property laws: IR round-trip, workload pass idempotent and order-independent, rebuild of the projection equals incremental.
- [ ] Trigger guarantee: an `UPDATE` or `DELETE` on observations fails in a test, and a purge leaves a tombstone.
- [ ] `bun run check`, `bun run e2e` and `python3 scripts/check_repo.py` pass; counts are recorded.
- [ ] The NAV feed-spec check for a workload percentage field (WS-0020 F4 nit) is done if the network allows it; otherwise it is recorded as unverified.
- [ ] Evidence is in `evidence/WS-0022/README.md`.

## Exclusions

No canonical-ID or identity change (TB-02), no second source, no public exposure (NAV redistribution is unresolved), no UI, and no change to existing routes' behavior.

## Rollback

Revert the commit. The additive migration's tables can be dropped, because observations are rebuildable from the source and nothing existing reads them yet.
