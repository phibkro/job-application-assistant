# System patterns

## Data

- Source occurrence `(sourceId, externalId)` and vacancy are separate identities; never merge within one source.
- **Homogeneous shape, heterogeneous content:** every source fills the same closed `Fact<T>` attribute set (schema.org names); variance lives in `state`, evidence and authority.
- Observations (WS-0022) are append-only (D1 triggers reject UPDATE/DELETE/REPLACE; purge leaves a tombstone; `recordedSeq` strictly monotone) and content-addressed, carrying valid and recorded time; projections are rebuildable.
- Canonical changes get a monotonic sequence; replaying identical input is a no-op.

## Code (adopted design; enforcement lands per ticket)

- **Effect at the edge, pure core.** Domain, passes and query algebra are plain functions, enforced by a boundary test and scoped immutability lint.
- **Event-driven ingestion:** `Triggered` → pure `decide(state, event) → {state, commands}` → thin Effect interpreter.
- Explicit state machines via `TransitionSystem`; XState v6 + `@xstate/effect` only per machine, with a recorded reason.
- Adapters are importers onto one port; a shared conformance suite has broken twins; source quirks are kept as data.
- Contracts start **experimental** and are promoted on evidence (fitness functions).

## Lifecycle

- WorkScope → immutable revision → bounded attempts → evidence → independent review → human gate.
- Agents propose; humans approve scope, integration and release.
- Delegate by capability tier (`AGENTS.md`).

Detail: [ADLC](../docs/internal/lifecycle/adlc.md), [lead handoff](../docs/internal/product/market-index-lead-handoff.md).
