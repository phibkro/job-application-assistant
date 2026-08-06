# Control-system design

## Controlled variables

- Conformance to scope and acceptance criteria.
- Correctness and regression rate.
- Security and privacy risk.
- Review independence.
- Reproducibility and provenance.
- Cost, latency, and attempt consumption.
- Documentation freshness.
- Operational reliability after release.

## Sensors

- Compiler and linter output.
- Unit, integration, property, end-to-end, and regression tests.
- Agent behaviour evaluations and trace graders.
- Static and dependency analysis.
- Diffs and repository status.
- Tool-call traces and capability receipts.
- Human review decisions.
- Production telemetry and user corrections.

## State estimator

The work graph combines observations into an evidence-backed state estimate. Raw logs are observations, not truth. A claimed success without passing evidence does not advance the lifecycle.

## Actuators

- Enqueue work.
- Allocate or revoke capabilities.
- Approve a plan.
- Start, pause, cancel, retry, or supersede a run.
- Request independent review.
- Merge, deploy, rollback, or quarantine an artifact.
- Promote an incident or correction into a regression evaluation.

## Nested feedback loops

| Loop | Timescale | Controller |
|---|---|---|
| Inner | Seconds to minutes | Agent local checks and bounded repair |
| Integration | Minutes to hours | CI, independent review, merge gate |
| Delivery | Hours to days | Release policy, canary, rollback |
| Learning | Days to months | Postmortems, evaluation growth, policy revision |

## Single- and double-loop learning

- **Single-loop:** fix the implementation so it meets the existing contract.
- **Double-loop:** revise assumptions, acceptance criteria, architecture, evaluation design, or policy when the contract itself was inadequate.

Agents may recommend double-loop changes; humans approve changes to governing policy and product intent.
