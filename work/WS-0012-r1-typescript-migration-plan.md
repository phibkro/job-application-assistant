# WS-0012@1 — TypeScript migration, planned for concurrent writers

Executes [RFC 0015](../docs/internal/rfcs/0015-implementation-language-for-the-application-product.md)
against the design in [the module map](../docs/internal/architecture/effect-module-map.md).

## The constraint that shapes everything

Several agents write at once. Two agents editing one file is a conflict; two
agents editing one *directory* is a merge risk; two agents needing the same
decision is a stall. So the plan is organised around a single rule:

> **Freeze the seams first, then every side of every seam is an independent
> writing slot that owns its own files.**

A slot is conflict-free when it owns a directory, imports only frozen
contracts, and touches no shared file. Every shared file is therefore written
before slots open, or owned by exactly one integrator.

## Identity is no longer a constraint

The corpus is a cache: it can be rebuilt from sources. Canonical ids may
therefore differ from the Rust implementation, which removes the equivalence
test from stage one and unblocks parallelism, because no slot has to match a
byte-level output.

The consequence is that the new service starts on a **new database**. Nothing
is back-filled. Saved jobs and applications in the current staging database
reference ids that will not exist; that is acceptable because staging is
disposable and no production deployment exists yet.

Because nothing is back-filled, the ten ordered migrations collapse into **one
snapshot**. Incremental migrations exist to move an existing database from one
shape to another; there is no existing database to move. This also removes a
conflict surface outright: ordered filenames are contended by construction, and
two writers adding `0011_*.sql` in separate worktrees merge cleanly into a
broken sequence.

The snapshot is part of the frozen contracts, derived from the `Model`
definitions. A slot that needs a new table stops and asks, exactly as it would
for any other contract change. Incremental migrations resume after the first
production deployment, when there is finally a database whose shape must be
preserved.

## Phase 0 — contracts, one writer, no parallelism

Small, serial, and blocking. Everything below depends on it, so it is done by
one writer in one pass rather than negotiated between several.

| Artefact | Why it must be frozen first |
| --- | --- |
| `packages/domain/**` schemas and models | The shared vocabulary; every slot imports it |
| `apps/worker/src/services/*.ts` tags | The seams between slots |
| `apps/worker/src/Api.ts` `HttpApi` declaration | The seam between worker and interface |
| `packages/domain/src/Failure.ts` | Error taxonomy every slot returns |
| Workspace, `tsconfig`, test runner, lint | Shared files nobody may edit later |
| A single schema snapshot | Ordered migration files are a conflict surface; one snapshot has none |
| Dependency set, installed once | `package.json` is the worst shared file |

Phase 0 ends when the contracts type-check with no implementations. That is
the point of service-driven development: orchestration compiles before any
leaf is runnable.

## Phase 1 — slots, maximum concurrency

Each slot owns a directory, imports only phase-0 contracts, exports a `layer`
from a fixed path, and writes its own tests. No slot imports another slot.

| # | Slot | Owns | Depends on |
| --- | --- | --- | --- |
| 1 | Persistence | `apps/worker/src/db/**` | contracts, schema snapshot |
| 2 | Corpus and freshness | `apps/worker/src/corpus/**` | contracts, `Database` tag |
| 3 | Acquisition: feeds | `packages/adapters/nav/**`, `packages/adapters/jsonld/**` | contracts |
| 4 | Acquisition: rendered | `packages/adapters/rendered/**` | contracts |
| 5 | Accounts and profiles | `apps/worker/src/accounts/**` | contracts |
| 6 | Answers and drafting | `apps/worker/src/drafting/**` | contracts |
| 7 | Delivery: Webcruiter | `packages/delivery/webcruiter/**` | contracts |
| 8 | Applications and approval | `apps/worker/src/applications/**` | contracts |
| 9 | Agenda and workflows | `apps/worker/src/agenda/**` | contracts |
| 10 | Entitlements and policy | `packages/domain/src/decide/**` | contracts |
| 11 | HTTP handlers | `apps/worker/src/handlers/**` | contracts, `Api` |
| 12 | Interface | `apps/web/**` | contracts, `Api` |
| 13 | Agent session machine | `packages/agent/**` | contracts |

Thirteen slots, one dependency each: the frozen contracts. That is the
maximum concurrency this design admits, and it exists only because the seams
were declared first.

### Slot rules

- **One worktree per writer, without exception.** Not one per *conflicting*
  slot: the isolation is unconditional, because "these domains do not overlap"
  is a prediction, and it is wrong the first time a writer reaches for a shared
  file it did not expect to need. Verify the worktree exists after spawning
  rather than trusting the flag; that check has failed before.
- **A slot never edits a file it does not own.** If a slot needs a contract
  changed, it stops and asks; it does not edit the contract. A changed seam
  invalidates other slots' work in flight.
- **A slot exports `layer` from its directory root.** The composition root
  imports from those fixed paths, so wiring is not a shared edit.
- **Tests live with the slot.** Integration tests belong to the integrator.

## Phase 2 — composition, one writer

Layer composition, the Worker entry point, and the Alchemy binding changes.
Serial because it is the one place every slot converges.

## Phase 3 — cutover, one writer

The Rust worker keeps serving until this phase. Cutover is per route group
behind the same public contract, and rollback is a routing change rather than
a restoration, because the Rust deployment is untouched until the last step.

The Rust crates are deleted only when no route depends on them.

## Verification per slot

Each slot is done when it type-checks, its own tests pass, and its real
journey has been run against something real rather than a stub. A slot with
green stubbed tests and no live run is not done — that failure has already
happened twice in this repository: fixtures encoding an envelope NAV does not
serve, and a deploy path that had never been exercised end to end.

## Blocked before slots open

These are operator decisions, not engineering ones, and a slot that hits one
stalls:

| Blocker | Slot | Needed |
| --- | --- | --- |
| Browser Run credentials | 4, 13 | account id and token; the agent tier cannot be verified live without them |
| A real Webcruiter advert to learn against | 7 | a live application form the first agent run can observe |
| Session model for the interface | 5, 11, 12 | API keys today; a browser interface wants sessions |
| Erasure and retention policy | 1, 5 | what deletion means, and after how long |
| Billing provider | 10 | `subscription_tier` has no payment behind it |

The first two block *verification*, not writing. The last three block design
inside their slots, because each is a contract that other slots read.
