# System patterns

## Product patterns

- Source occurrence and canonical vacancy are separate identities.
- Canonical changes receive a monotonic sequence.
- Saved searches retain the last evaluated sequence.
- Deduplication is deterministic-first and conservative.
- Provenance accompanies every canonical field and result.
- Raw observations are replayable inputs; derived projections can be rebuilt.

## Lifecycle patterns

- WorkScope → immutable revision → execution run → bounded attempts → evidence proposal → configured gate.
- Agents propose state transitions; gates decide them.
- Human authority is the default for intent, acceptance, capabilities, integration, and release.
- Workgraph is canonical work truth; Flow coordinates; Chatlog retains evidence and curated memory; Pagu enforces capabilities.

Detailed lifecycle: [`docs/internal/lifecycle/adlc.md`](../docs/internal/lifecycle/adlc.md)
