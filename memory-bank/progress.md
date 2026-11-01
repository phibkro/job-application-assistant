# Progress

## Done (evidence linked)

| Item | Evidence |
| --- | --- |
| TS/Effect Worker, D1 corpus, NAV adapter, source lease, checkpointed ingestion, monotonic sequence | WS-0012 to WS-0019 on `main` |
| RFC 0016 accepted (A1–A4); decision log | [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md), [handoff](../docs/internal/product/market-index-lead-handoff.md) |
| TB-00 baseline characterization | [`evidence/WS-0020/`](../evidence/WS-0020/README.md) (`b601267`, ACCEPT WITH NITS) |
| JVM stack spike (Clojure + Datomic Local); TS kept | [`evidence/WS-0024/`](../evidence/WS-0024/README.md) (REPRODUCES WITH NITS) |
| Reusable qualification evidence: Gate 1 staging provenance (`dfa0fe3`), Gate 3 complete-table D1 restore drill, the 50k-row query-plan qualification | `work/WS-0014-r1-execution-plan.md`, `.artifacts/` |

## Known gaps

- **Identity:** the title/employer/location key merges distinct requisitions (D05, pinned by WS-0020 T4); TB-02 fixes it.
- **Workload:** not yet modelled (TB-01).
- **Refresh:** no deployed trigger (see techContext); TB-05.
- **Public exposure:** no public API docs or rate limits yet; planned in TB-01/TB-04/WS-0025.
- **OpenAPI:** `openapi/job-index-v1.json` is not generated from `Api.ts`.
- **Administrative routes:** principal administration and corpus maintenance were not ported (WS-0006/0008/0009).

## Superseded

- **The WS-0014 production-qualification path** (seven-day soak, lazy-gate evidence, Cloudflare cron dispatch, the `job-index-preview` cron) is superseded by the TB-05 event loop and the UI retirement (owner, 2026-11-01). A new production gate is defined after TB-05: an event-loop trigger soak plus public-exposure checks.
