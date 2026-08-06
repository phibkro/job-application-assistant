# Enforcement and friction design

The goal is not maximum friction. It is to make safe, legible behaviour easier than unsafe, opaque behaviour.

## Make good practices cheap

- Generate work scopes, plans, evidence bundles, and RFCs from templates.
- Auto-collect exact commit, diff, tool versions, command results, and test evidence.
- Provide one command that runs the required local gate checks.
- Cache deterministic checks by revision and environment identity.
- Offer pre-approved capability profiles for common low-risk tasks.
- Route agents directly to the smallest relevant context bundle.
- Produce precise failure messages and remediation links.
- Allow sandboxed exploration without production capabilities.

## Add friction to bad practices

| Bad practice | Enforced friction |
|---|---|
| Editing without a work contract | Mutation tools require a work-scope receipt for governed tasks |
| Silent scope expansion | Diff-to-scope check and explicit scope revision |
| Infinite repair loops | Attempt and token/time budgets; exhausted runs become blocked |
| Self-approval | Actor identity cannot satisfy independent-review gates |
| Unreviewed production effect | Capability grant and human release gate |
| Hidden dependency or prompt drift | Lockfiles and provenance check |
| Unsupported success claims | Gate rejects assertions without evidence |
| Stale memory bank | Closure gate requires context projection update when state changed |
| Reading excessive context | Progressive-disclosure index and context budget |
| Reusing secrets or broad tokens | Short-lived, action-scoped capability grants |
| Flaky tests ignored | Quarantine is an explicit governed state, not silent retry |
| Bypassing checks | Protected integration path accepts only gate receipts |

## Enforcement layers

1. **Repository:** templates, hooks, lint, schemas, protected branches.
2. **Execution:** sandbox, capability grants, bounded attempts, exact refs.
3. **Orchestration:** legal state transitions and independent actor constraints.
4. **Integration:** CI receipts and merge policy.
5. **Deployment:** signed artifacts, environment policy, rollback.
6. **Observation:** alerts, incidents, evaluation promotion.

## Escape hatches

Emergency bypasses are explicit waivers containing owner, reason, scope, expiry, compensating controls, and mandatory follow-up. A bypass that leaves no trace is a control failure.
