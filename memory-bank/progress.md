# Progress

## Done (evidence linked)

| Item | Evidence |
| --- | --- |
| TS/Effect Worker, D1 corpus, NAV adapter, source lease, checkpointed ingestion, monotonic sequence | WS-0012 to WS-0019 on `main` |
| RFC 0016 accepted (A1–A4); decision log | [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md), [handoff](../docs/internal/product/market-index-lead-handoff.md) |
| TB-00 baseline characterization | [`evidence/WS-0020/`](../evidence/WS-0020/README.md) (`b601267`, ACCEPT WITH NITS) |
| Effect `~4.1` (4.1.1) across the workspace; legacy Foldkit UI retired (54 files, recoverable at `35e93e1`) | [`evidence/WS-0021/`](../evidence/WS-0021/README.md) (delta review ACCEPT WITH NITS) |
| Agent tooling: Effect language service gate, Effect/Foldkit agent docs, Foldkit skills (merged in PR #23, review ACCEPT WITH NITS) | [`evidence/WS-0026/`](../evidence/WS-0026/README.md) |
| Toolchain: devenv + Vite+ (`vp check`, `vp run`); Vitest 4 kept; policy gates with negative controls (merged in PR #23, `1f53f33`; devenv proven in CI) | [`evidence/WS-0027/`](../evidence/WS-0027/README.md) (r2) |
| WS-0025@2 index-web: browse, detail, URL-synced filters; Worker serves `apps/index-web/dist`; e2e 6/6 + Axe 0 violations; single Effect; F4 closed (two independent review rounds clean; merging under delegation). r1 stopped on better-auth's `nodejs_compat` need | [`evidence/WS-0025/`](../evidence/WS-0025/README.md) |
| JVM stack spike (Clojure + Datomic Local); TS kept | [`evidence/WS-0024/`](../evidence/WS-0024/README.md) (REPRODUCES WITH NITS) |
| TB-01 workload facts: IR v0 (experimental), append-only observation store with triggers, workload pass @1, projection, experimental API filter, `decide` ingestion loop, bounded hydration (round 1 medium R1 fixed with R2/R6; round 2 found nothing at medium or above; R3–R5, R7, R12–R16 follow-ups) | [`evidence/WS-0022/`](../evidence/WS-0022/README.md) (F1, F2, F3, F5, F6 pass in TS on D1; 7/7 controls fail) |
| Reusable qualification evidence: Gate 1 staging provenance (`dfa0fe3`), Gate 3 complete-table D1 restore drill, the 50k-row query-plan qualification | `work/WS-0014-r1-execution-plan.md`, `.artifacts/` |

## Known gaps

- **Identity:** the title/employer/location key merges distinct requisitions (D05, pinned by WS-0020 T4); TB-02 fixes it.
- **Workload:** modelled (WS-0022, reviewed); the hydration default is provisional and the on-open `getJob` hydration still fetches on the read path (G2).
- **Refresh:** no deployed trigger (see techContext); TB-05.
- **Public exposure:** no public API docs or rate limits yet; planned in TB-01/TB-04.
- **Presets:** anonymous owner-scoped presets were split out of WS-0025 (after WS-0029/WS-0028).
- **`infra/` upgrade (WS-0029@4 pass A):** merged in #28 (`f00ccb5`).
- **PR previews (WS-0029@2 pass B):** Worker Previews behind Access, implemented in `f9a0c3b`. verify and e2e pass; 15 new controls fail as intended. Waiting on the owner's host deploy and Access toggle, then the CI run on a real PR ([evidence](../evidence/WS-0029/README.md#pass-b-ws-00292-worker-previews-behind-access)). The leftover `job-index-preview` Worker and `job-index-preview-db` are inventoried; deleting them needs the owner's approval.
- **OpenAPI:** `openapi/job-index-v1.json` is not generated from `Api.ts`.
- **Administrative routes:** principal administration and corpus maintenance were not ported (WS-0006/0008/0009).

## Superseded

- **The WS-0014 production-qualification path** (seven-day soak, lazy-gate evidence, Cloudflare cron dispatch, the `job-index-preview` cron) is superseded by the TB-05 event loop and the UI retirement (owner, 2026-11-01). A new production gate is defined after TB-05: an event-loop trigger soak plus public-exposure checks.
