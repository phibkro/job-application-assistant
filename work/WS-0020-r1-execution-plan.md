# Execution plan: WS-0020@1

> **Approved 2026-11-01** together with [WS-0020@1](WS-0020-r1-market-index-baseline.md) and its lead amendments L1–L4. Governing RFC 0016 is accepted with amendments A1–A4.

## Baseline

- Repository/ref: `phibkro/job-application-assistant` `main`; resolve exact commit at execution time.
- Environment: Nix/Bun as pinned by repository; Cloudflare Worker local preview with isolated local D1 and fixtures.
- Known evidence limit: README/memory-bank describe local test success, staging evidence of an older revision and incomplete production qualification. Verify these claims against current revision, do not reuse as proof.
- Read first: `AGENTS.md` six memory files, [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md), [architecture](../docs/internal/architecture/read-only-market-index.md), [tracer roadmap](../docs/internal/architecture/market-index-tracers.md), and [WorkScope](WS-0020-r1-market-index-baseline.md).

## Proposed changes

1. Inspect source mapping, paying attention to:
   - `packages/domain/src/Source.ts`, `Job.ts`, `Match.ts`
   - `packages/adapters/src/SourceAdapter.ts`, NAV connector
   - `apps/worker/src/runtime/Layers.ts`, `ingestion/lazy.ts`, `ingestion/collect.ts`
   - `apps/worker/src/corpus/identity.ts`, `observe.ts`, `search.ts`, D1 schema
   - `apps/worker/src/Api.ts`, `handlers/corpus.ts`, `apps/web/`
2. Discover the smallest existing deterministic integration test path rather than recreating one. Extend characterization only for genuinely uncovered behavior.
3. Run replay/closure cases and note which properties existing code proves; quantify gaps rather than inventing passing claims.
4. Write `evidence/WS-0020/` overview with source-to-client path, baseline command output summaries, false-merge example, current ingestion activation, public/private API boundary, and next tracer dependency decisions.
5. Submit PR limited to characterization tests/evidence/docs. If a failing test reveals a correctness defect requiring behavior change, record it as a separate Ticket.

## Alternatives considered

- Rewrite indexer now: rejected; destroys traceability to existing working code.
- Adopt new incremental engine first: rejected; not justified by measured data.
- Prove live deployment before local characterization: not necessary for TB-00; production remains an independent later gate.

## Risks and mitigations

- Network/source credentials may be unavailable: use authorized deterministic fixtures and say live freshness is unverified.
- Old documentation conflicts: trust pinned source/tests for implementation truth; maintain governance authority for decisions.
- Automated checks may be long-running: keep attempts bounded; report exact failing checks.
- Personal information may appear in existing fixtures: do not publish new sensitive evidence.

## Verification plan

- Inspect repository scripts before executing; use current `bun run check`, `just verify`, `just qualification` or narrower equivalent according to available local environment.
- Verify deterministic NAV adapter decode and Worker+D1 end-to-end read.
- Verify no-op replay and one status-change or closure case.
- Validate that new tests do not alter or leak production state.
- Read the git diff; check no unexpected API, schema, policy or runtime changes.

## Documentation impact

Update only applicable characterization evidence and a bounded gap report; do not replace approved `docs/internal/product/vision.md`, `memory-bank/projectbrief.md` or accepted RFCs until owner approval.

## Rollback or recovery

Revert characterization tests/docs PR. No database migration or production resources should be touched.

## Capability request

Local code/test/doc access only. Escalate before credential access, external collection, server writes, production changes or changes to behavior/contracts.

## Termination and retry policy

Stop after two meaningful failed attempts or a conflict with approved architecture; present evidence, cause, and a next-action recommendation. No unattended looping or scope expansion.
