# Evidence model

## Evidence bundle

Every transition proposal should carry a typed bundle:

```text
identity
scope
inputs
changes
verification
behavioural-evals
security
documentation
provenance
residual-risk
attempt-history
```

## Evidence classes

| Class | Examples | Trust |
|---|---|---|
| Deterministic | Compiler, tests, schema validation, hashes | Strong for the property measured |
| Reproduced | Clean-environment CI, independent replay | Stronger than local evidence |
| Independent review | Reviewer diff analysis, threat review | Necessary for judgment and blind spots |
| Model evaluation | Rubric or trajectory grader | Probabilistic; calibrate against humans |
| Operational | Telemetry, user outcomes, incident absence | Strong but delayed and incomplete |
| Assertion | Agent narrative or confidence | Context only; never sufficient alone |

## Provenance

Evidence records should include:

- Repository URL and exact commit.
- Dirty-tree status.
- Work-scope revision.
- Actor, model, provider, prompt/rules revision.
- Tool and dependency versions.
- Environment identity.
- Commands executed and exit statuses.
- Artifact hashes.
- Reviewer and gate-decision identities.

This follows the same general principle as software supply-chain provenance: an artifact is more trustworthy when where, when, how, and from which inputs it was produced are inspectable.

## Promotion

Raw evidence is not automatically durable knowledge. Promotion requires classification:

```text
trace or correction
→ candidate insight
→ verified pattern
→ regression test / rule / RFC / memory summary
```

The original evidence remains linked so the promoted claim can be challenged.
