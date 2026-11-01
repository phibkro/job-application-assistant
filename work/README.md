# Work records

Store immutable or versioned work-scope instances here. Do not use ad hoc task notes as substitutes for approved scope revisions.

## Market-index transition

- [Technical lead handoff and decision register](../docs/internal/product/market-index-lead-handoff.md) — proposal completeness and work readiness.
- [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md) is **Accepted with amendments A1–A4** (2026-11-01).
- [Tracer program](../docs/internal/architecture/market-index-tracers.md) is a roadmap, not bulk implementation authority.
- [Coding-agent handoff](HANDOFF-market-index.md) provides a scoped, copyable entry point.
- [WS-0020@1](WS-0020-r1-market-index-baseline.md) and its [execution plan](WS-0020-r1-execution-plan.md) are the **approved** first bounded characterization Ticket (owner gate 2026-11-01, lead amendments L1–L4). Later tracers need their own approved WorkScopes. WS-0020 is done (`b601267`, independent review ACCEPT WITH NITS).
- [WS-0021@4](WS-0021-r4-effect-4-1-retire-legacy-web.md): effect ~4.1 for the whole workspace, with the legacy Foldkit UI retired. **Done** (`810bab8`, `6859df2`; review ACCEPT WITH NITS) (supersedes [r3](WS-0021-r3-effect-4-1-legacy-web-freeze.md), [r2](WS-0021-r2-effect-4-1-and-foldkit.md), [r1](WS-0021-r1-effect-4-1-upgrade.md)).
- [WS-0024@1](WS-0024-r1-jvm-stack-spike.md): Clojure + Datomic Local stack spike, **done** (`450103c`); owner kept TS and ported the model.
- [WS-0022@1](WS-0022-r1-tb01-workload-facts.md): TB-01 workload facts, **approved** with L1–L4, after WS-0021@3.
- [WS-0026@1](WS-0026-r1-agent-dev-tooling.md): agent development tooling (adds Foldkit's official skills), **done** (review ACCEPT WITH NITS).
- [WS-0027@2](WS-0027-r2-toolchain-devenv-vite-plus.md): devenv + Vite+ (tests stay on Vitest 4 via `vp run`), **done** (PR #23, `1f53f33`; reviews in `evidence/WS-0027/r2/`) (supersedes [r1](WS-0027-r1-toolchain-devenv-vite-plus-previews.md)).
- [WS-0030@1](WS-0030-r1-ci-benchmark-optimization.md): CI benchmark and measured optimization passes, GitHub-hosted runners only, **approved**.
- [WS-0029@1](WS-0029-r1-infra-alchemy-previews.md): `infra/` Alchemy + Effect upgrade, Workers Previews behind Access, **approved in principle**, after WS-0027@2.
- [WS-0028@1](WS-0028-r1-secrets-secretspec-sops.md): secrets as code (SecretSpec + SOPS/age + Alchemy), tiered recipients, **approved in principle**, after WS-0029.
- [WS-0025@1](WS-0025-r1-index-web-client.md): `apps/index-web` first slice (browse, detail, filters, anonymous presets), **approved**, parallel to WS-0022.

## Current work

- Approved scope: [`WS-0001@2`](WS-0001-r2-first-vertical-slice.md)
- Execution plan: [`WS-0001@2 plan`](WS-0001-r2-execution-plan.md)
- Governing architecture: [`RFC 0004`](../docs/internal/rfcs/0004-cloudflare-d1-first-rust-mvp.md)

## Proposed next work

- Proposed scope: [`WS-0002@1`](WS-0002-r1-live-nav-ingestion.md)
- Execution plan: [`WS-0002@1 plan`](WS-0002-r1-execution-plan.md)
- Draft governing RFC: [`RFC 0005`](../docs/internal/rfcs/0005-live-nav-incremental-ingestion.md)

## Superseded work

- [`WS-0001@1`](WS-0001-r1-first-vertical-slice.md) and its [execution plan](WS-0001-r1-execution-plan.md) are retained as immutable history and must not be executed.
