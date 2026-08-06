# Cybernetic Agent Development Life Cycle

## Purpose

The ADLC governs software work performed partly or wholly by agents. It extends normal SDLC controls to address nondeterminism, context loss, tool side effects, authority ambiguity, self-review bias, provider drift, and long-horizon execution failure.

The lifecycle is not a linear checklist. It is a closed-loop control system.

```mermaid
flowchart LR
    R[Reference: approved WorkScope] --> C[Controller: policy and gates]
    C --> A[Actuators: grant, enqueue, retry, stop, merge, release]
    A --> P[Plant: agents, tools, codebase, environments]
    P --> S[Sensors: tests, evals, traces, reviews, user outcomes]
    S --> E[State estimator: work graph and evidence]
    E --> C
```

## Fundamental model

- **Workgraph** is canonical work and outcome truth.
- **Flow** coordinates execution, attempts, supervision, and gates.
- **Chatlog** retains transcripts and derives bounded, evidence-linked memory.
- **Pagu** grants and enforces host capabilities and security policy.
- **Workbench** composes these concerns into a human control surface.

These names describe future integration boundaries; the repository policy can operate independently until those systems exist.

## Lifecycle states

```mermaid
stateDiagram-v2
    [*] --> Proposed
    Proposed --> Triaged
    Triaged --> Scoped
    Scoped --> Planned
    Planned --> Ready
    Ready --> Executing
    Executing --> EvidenceReady
    EvidenceReady --> Reviewing
    Reviewing --> Accepted
    Reviewing --> NeedsWork
    NeedsWork --> Planned
    Accepted --> Integrated
    Integrated --> Released
    Released --> Observed
    Observed --> Closed

    Proposed --> Rejected
    Scoped --> Superseded
    Executing --> Blocked
    Executing --> Cancelled
    Blocked --> Planned
```

## Transition rule

An agent does not set the state directly. It submits a transition proposal containing:

- Exact work-scope revision.
- Current repository and environment identities.
- Evidence bundle.
- Requested transition.
- Known uncertainty and residual risk.
- Actor identity and capability receipt.

The configured gate evaluates the proposal. Outcomes are `pass`, `fail`, `needs_work`, or `waived`. Waivers are explicit, time-bounded, and human-owned.
