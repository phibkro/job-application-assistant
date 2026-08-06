# Quality gates

## Gate catalogue

| Gate | Transition | Required evidence | Default authority |
|---|---|---|---|
| G0 Intake | Proposed → Triaged | Problem, beneficiary, urgency, initial risk | Human/product owner |
| G1 Scope | Triaged → Scoped | WorkScope revision, exclusions, acceptance criteria | Human/product owner |
| G2 Plan | Scoped → Planned | Plan, alternatives, risks, test strategy, capability request | Human or configured supervisor |
| G3 Ready | Planned → Ready | Exact refs, clean baseline, dependencies available, grants approved | Policy engine |
| G4 Execution | Executing → EvidenceReady | Diff, checks, tests, traces, attempt summary, docs impact | Implementing actor proposes |
| G5 Review | EvidenceReady → Accepted | Independent review, unresolved-risk statement, acceptance mapping | Independent reviewer; human for material risk |
| G6 Integration | Accepted → Integrated | Clean merge, integration checks, migration and rollback readiness | Human/integration policy |
| G7 Release | Integrated → Released | Reproducible artifact, provenance, release checks, operational plan | Human/release policy |
| G8 Observation | Released → Observed | Health window, telemetry, user outcomes, no critical regression | Policy with human escalation |
| G9 Closure | Observed → Closed | Outcome recorded, memory/docs updated, follow-ups captured | Human or configured supervisor |

## Gate design rules

- A gate is a predicate over evidence and authority, not a meeting.
- Mechanical facts should be checked mechanically.
- Model graders may advise but must not be the sole authority for security, privacy, finance, or irreversible effects.
- Gate evidence is immutable and refers to exact revisions.
- Re-running a gate produces a new decision; it does not overwrite history.
- A failed gate explains which predicate failed and which evidence is missing.
- Risk tier controls which gates may be automated.

## Fast path

Low-risk documentation, tests, and local refactors may pass G1–G3 using pre-approved templates and policy. The fast path does not remove evidence; it reduces manual coordination.

## High-risk path

Security boundaries, personal data, production mutations, dependency trust, authentication, release policy, and irreversible external actions require explicit human gates and narrower capabilities.
