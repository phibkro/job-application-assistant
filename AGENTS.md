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

Use repository commands rather than reproducing their internals manually. Enter the pinned toolchain with `devenv shell` (declared in `devenv.nix`, pinned by `devenv.lock`; the first shell installs `node_modules`), then:

```text
vp run setup              install workspace and infra dependencies, the git hook dispatcher, the pinned Foldkit checkout
vp check                  format (packages/, apps/) and lint
vp run test               both Vitest 4 suites: the Bun-hosted unit suite and the workerd pool
vp run policy             repository, credential, migration and script gates (also the pre-commit hook)
vp run verify             setup + policy + vp check + imports, types, Effect diagnostics, schema, catalog, bundle, coverage-gated tests
vp run dev                the local stack on workerd with a seeded local D1
vp run deploy             verify, then provision, migrate, deploy and smoke staging (deploy-production: production)
```

One command from outside the shell: `devenv shell -- vp run verify`. The deploy tasks refuse to run outside `devenv shell`. In a clone made before WS-0027 (`core.hooksPath` still `.githooks`), run `vp hooks enable` once; `vp config` does not replace another hooks path. Every task is declared in `vite.config.ts` (`run.tasks`). Tests stay on Vitest 4 on purpose (Vite+ bundles Vitest 5; see WS-0027@2), so `vp test` is not used.

A deployment claim is invalid when `vp run verify` did not pass for the same source revision.

## Effect for agents

The workspace is on `effect ~4.1.0` (resolved 4.1.1). Most public Effect material and most model training data describe v3, and mixing the two is a known failure here.

- **Authoritative docs for the 4.x line:** `node_modules/effect/AGENTS.md` and `node_modules/effect/ai-docs/` (shipped with the installed version), and `LLMS.md` in the Effect v4 repository: <https://github.com/Effect-TS/effect-smol/blob/main/LLMS.md> (tracks `main`, so check it against the installed source). `effect.website/llms.txt` was not verified against 4.x; do not prefer it over these.
- **v3 vs v4 drift:** v3 names fail or mislead on 4.x. Example: v3 `Effect.catchAll` is `Effect.catch` in v4. Do not write an Effect API from memory.
- **Read the source first:** before using any Effect API, read it in `node_modules/effect/src` (`packages/effect/src` in the repository) and match the installed version's signature.
- **Diagnostics:** `vp run effect:check` (part of `vp run verify`) runs `@effect/language-service` and fails on errors and warnings, including floating Effects and v3-only APIs (`outdatedApi`). Exceptions live in `tools/quality/effect-exceptions.json`; do not add one without an owner decision.

## Foldkit for agents

Foldkit's official agent skills are installed under `.claude/skills/` (`foldkit`, `generate-program`, `audit-program`); provenance is in `.claude/skills/PROVENANCE.md`. Use them for `apps/index-web`; do not copy their content here.

- The skills read the Foldkit source at `repos/foldkit/`. It is a git-ignored shallow checkout pinned to the tag **`foldkit@0.170.0`**, fetched by `scripts/setup.sh` via `vp run setup` (a no-op when already at the tag, a warning when offline).
- Keep the tag equal to the installed `foldkit` version: when `apps/index-web` bumps `foldkit`, change `FOLDKIT_TAG` in `scripts/setup.sh`, this section, and the skills' provenance together.
- `generate-program` offers to add a git subtree at `repos/foldkit`. Do not: the owner chose the git-ignored checkout (WS-0026).

## Merge delegation (owner, 2026-11-01)

The owner pre-approves merging a PR into `main` when all of these hold:

1. **CI is green on the current head commit.**
2. **An independent review round** (a reviewer that did not author the change) has run on that head.
3. **Severity rule by round:**
   - **Rounds 1–3:** merge only when the latest round finds **nothing at medium or above**.
   - **Rounds 4–5:** merge when **nothing above high** remains. Open medium and high findings are recorded as follow-ups, never dropped.
   - **Critical always blocks.**
4. **Hard cap:** if round 5 still leaves a blocking finding, stop and ask the owner.

A round is one review pass plus any fix pushed in response. The repository allows **squash merges only**, so each merged PR becomes one commit on `main`. Keep one revertible change per PR when separate revertibility matters (e.g. WS-0030 passes). This delegates the **merge** gate only. Deploys, releases, production changes and capability grants keep their own human gates.

## Delegation capability tiers

When delegating to a subagent, choose a capability tier for the task, then bind it to that platform's model explicitly. Do not inherit the parent's model by default.

| Tier | Use for | Examples |
| --- | --- | --- |
| `general` (default) | Research, exploration, bounded implementation, doc drafting | Pattern sweeps, fixtures, evidence write-ups |
| `complex-reasoning` | Architecture and design, multi-file implementation against real harnesses, independent gate review, identity/schema migration | Tracer implementer, WorkScope gate review |
| `bounded` | One lookup, a format check, a single-file summary | Checking a citation, listing or counting files |

When unsure, use `general`. Escalate only when the task needs sustained multi-step judgment.

Platform bindings, kept current here:

| Platform | `general` | `complex-reasoning` | `bounded` |
| --- | --- | --- | --- |
| Claude Code | `sonnet` (Sonnet 5.5) | `opus` | `haiku` |

## Read-only market-index direction (RFC 0016 accepted with amendments, 2026-11-01)

If explicitly assigned the market-index transition, read [lead handoff](docs/internal/product/market-index-lead-handoff.md), [RFC 0016](docs/internal/rfcs/0016-read-only-norwegian-market-index.md), [target architecture](docs/internal/architecture/read-only-market-index.md), and [tracer-bullet program](docs/internal/architecture/market-index-tracers.md) after the six standard context files. The [coding-agent handoff](work/HANDOFF-market-index.md) is the scoped entry point. The first approved WorkScope is [WS-0020@1](work/WS-0020-r1-market-index-baseline.md). Every later tracer needs its own approved WorkScope. RFC acceptance does **not** authorize changing existing features, deleting features, migrating data, changing canonical IDs, adding live sources, or deploying (see RFC 0016 amendments A1–A4).
