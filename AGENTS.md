# Agent operating contract

This file is the minimum entry point for any coding or documentation agent.

## Read order

Read these six concise files at the beginning of every task:

1. `memory-bank/projectbrief.md`
2. `memory-bank/productContext.md`
3. `memory-bank/activeContext.md`
4. `memory-bank/systemPatterns.md`
5. `memory-bank/techContext.md`
6. `memory-bank/progress.md`

Then follow links relevant to the task. Do not load the whole repository by default.

## Authority order

When documents disagree, use this order:

1. Approved work-scope revision and gate decision.
2. Machine-readable policy under `policy/`.
3. Accepted Requests for Comments (RFCs).
4. Internal architecture and lifecycle documentation.
5. Public documentation.
6. Memory-bank summaries.
7. Raw traces, transcripts, and historical evidence.

The memory bank is a context projection. It must not silently override an approved decision or policy.

## Work rules

- Human ownership is the default for scope, acceptance, integration, release, and capability grants.
- An agent may propose lifecycle transitions but must not self-approve a gate that requires independent or human authority.
- Mutating work must reference an explicit work scope or be marked as bounded exploration.
- Attempts are bounded. Do not loop indefinitely, repeatedly retry the same failure, or expand scope without a new revision.
- Record claims as evidence, not confidence language. Link tests, diffs, traces, sources, and exact revisions.
- Keep implementation deterministic where possible; isolate model-dependent judgments behind explicit interfaces and evaluations.
- Never place secrets, credentials, personal data, raw private transcripts, or mutable runtime state in documentation.
- Update `activeContext.md` and `progress.md` when a task changes project state.

## Stop conditions

Stop and request a gate decision when:

- Scope or acceptance criteria are ambiguous in a way that changes the implementation.
- A required capability is not granted.
- Tests or evidence contradict the proposed outcome.
- A security or privacy boundary would be crossed.
- The attempt budget is exhausted.
- The exact repository revision or dependency state cannot be established.

## Executable gates

Use repository commands rather than reproducing their internals manually:

```text
./bootstrap setup   enter the Nix flake and install project-local tooling/hooks
./bootstrap check   format, lint, policy, migration, Wasm, and Wrangler bundle gates
./bootstrap verify  check plus unit tests and a clean local D1 HTTP smoke run
./bootstrap dev     run the interactive local D1 demo
./bootstrap deploy  verify, provision, migrate, deploy, and remote-smoke the Worker
```

Inside `nix develop`, the equivalent `just ...` commands are permitted.

A deployment claim is invalid when `./bootstrap verify` did not pass for the same source revision.
