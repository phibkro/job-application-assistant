# Roles and authority

## Default authority matrix

| Action | Agent | Supervisor agent | Human | Policy engine | Pagu/capability system |
|---|---:|---:|---:|---:|---:|
| Propose scope | Yes | Yes | Yes | No | No |
| Approve or revise scope | No | Configurable only when delegated | Default owner | Validate form | No |
| Create plan | Yes | Yes | Yes | Validate requirements | No |
| Start bounded execution | With approved receipt | Yes | Yes | Enforce transition | Grant capabilities |
| Retry infrastructure failure | Within budget | Yes | Yes | Enforce budget | Maintain grants |
| Expand scope | Propose only | Propose only | Approve | Record revision | Re-evaluate grants |
| Accept outcome | No self-approval | Configurable for low risk | Default owner | Verify evidence | No |
| Merge or integrate | No by default | Configurable | Default owner | Verify gate receipt | Enforce repository capability |
| Release | No by default | Configurable for low risk | Default owner | Verify release predicates | Enforce deployment capability |
| Cancel or supersede | Propose | Yes within policy | Yes | Record transition | Revoke grants |
| Grant host capability | No | No | Request/approve by policy | Validate | Sole enforcement authority |

## Separation of duties

For medium- and high-risk work, the implementer, reviewer, and release approver are distinct actors. Distinct model instances are not necessarily independent when they share prompts, context, incentives, or failure modes; independence must be assessed structurally.
