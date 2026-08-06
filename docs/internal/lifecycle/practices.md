# SDLC practices translated to ADLC

| SDLC practice | ADLC translation | Additional agent risk controlled |
|---|---|---|
| Requirements | Immutable `WorkScope` revision with observable acceptance criteria | Prompt ambiguity and silent scope expansion |
| Design review | Plan artifact, alternatives, threat model, capability request, RFC impact | Premature mutation and locally plausible design errors |
| Task breakdown | Bounded work units with termination and retry budgets | Unbounded long-horizon loops |
| Implementation | Pinned execution run against exact repository and environment identities | Context and dependency drift |
| Coding standards | Repository rules, compiler/linter policy, generated checks | Inconsistent agent style and unsafe shortcuts |
| Testing | Deterministic tests plus behavioural evals and trace checks | Nondeterminism and tool-use failures |
| Code review | Independent actor reviews evidence and diff; author cannot self-approve | Self-review bias |
| CI | Reproduce checks in a clean environment and emit machine-readable evidence | “Worked in my session” claims |
| Change management | State transition proposals and immutable revisions | Hidden changes to scope or acceptance |
| Release management | Version code, prompts, model/provider, tools, dependencies, and provenance | Runtime behaviour drift |
| Operations | Observe outcomes, traces, incidents, costs, and policy violations | Silent post-release degradation |
| Incident response | Contain, rollback, classify failure, create regression eval | Repeated agent failure patterns |
| Postmortem | Promote evidence into tests, memory, rules, or architecture changes | Ephemeral learning |
| Documentation | Public Diátaxis docs plus concise agent memory projection | Context loss and documentation bloat |
| Access control | Least-capability grants scoped by action, resource, and time | Excessive tool authority |
| Supply chain | Lock dependencies and attest source/build provenance | Compromised or untraceable inputs |

## Agent-specific practices

1. **Plan before act for material changes.** Exploration may remain read-only or sandboxed.
2. **Separate eligibility from ranking and facts from model judgments.** Deterministic systems remain authoritative.
3. **Evaluate trajectories, not only final text.** A correct answer reached through forbidden tools is a failure.
4. **Use representative and adversarial eval sets.** Do not tune only against one happy path.
5. **Record exact prompts, model/provider identifiers, tool versions, and environment.**
6. **Bound recall and retries.** Context retrieval must terminate and attempt budgets must be explicit.
7. **Convert user corrections and incidents into regression cases.** Learning must alter future control behaviour.
8. **Require independent evidence for high-impact changes.** More agent confidence is not more evidence.
