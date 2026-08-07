# RFC 0015: Implementation language for the application product

- Status: Draft
- Author: engineering
- Created: 2026-08-06

## Summary

The service has changed shape. It began as a corpus prototype — collect,
canonicalize, evaluate saved searches — and it is becoming an application
product: browse, inspect, save, draft, apply, repeat, across many sources, with
a user interface and agent-driven acquisition.

This RFC evaluates whether that product is better served by the current Rust
worker or by TypeScript with Effect v4, and recommends moving the product
surfaces to TypeScript through a strangler migration while leaving the corpus
worker in place until its replacement is proven.

## Motivation

Two observations prompted the evaluation.

The first is the ratio of domain to seam. The pure domain — normalization,
canonical identity, deterministic hashing, saved-search matching — is 911 lines
in `job-index-core`. The Worker around it is 10,390. Rust's advantages
concentrate in the smaller part; its costs concentrate in the larger one.

The second is where defects actually occurred. During one working session the
following were found by running the service, not by reading it:

| Defect | Location |
| --- | --- |
| D1 rejected `i64` bindings as `bigint` | Rust/JS seam |
| D1 rejected `Option::None` as `undefined` rather than null | Rust/JS seam |
| `#[serde(default)]` accepted absent keys but not explicit `null` | Boundary decoding |
| The NAV detail envelope did not match the fixture | Boundary decoding |
| `crypto.randomUUID` required `js_sys::Reflect` indirection | Rust/JS seam |
| No `HTMLRewriter`, so JSON-LD extraction was hand-written | Missing platform API |

Five of six are the language boundary rather than the domain. None would have
occurred in TypeScript, where the values in question are native and
`HTMLRewriter` is a runtime primitive.

## Goals

- Choose one implementation language for the product surfaces that are about
  to be built: the user interface, source adapters, agent acquisition, and
  model-assisted drafting.
- Preserve canonical identity exactly. Any change that alters a canonical job
  id silently re-partitions the corpus.
- Keep the deployment story: pinned, reproducible, and deployed by Alchemy.
- Repay the process debt this evaluation exposed by recording the decision
  where the next agent will find it.

## Non-goals

- Rewriting the corpus worker before its replacement is proven.
- Changing the data model, the API contract, or the deployment topology.
- Adopting a frontend framework in this RFC; that is a separate decision once
  the language is settled.

## Guide-level explanation

Rust is the right tool for a deterministic core: an algorithm with no IO, where
correctness is structural and performance is measurable. `job-index-core` is
exactly that, and it has never been the source of a defect.

The work now queued is the opposite shape. Fifty catalogued platforms need
adapters that parse markup and rendered pages. Agent acquisition drives a
browser. Drafting calls a model. The interface is a user-facing application.
Every one of those is IO orchestration and boundary decoding, and every
Cloudflare product they depend on — Browser Run, Agent memory, Workflows, the
AI bindings — ships a JavaScript API first.

Effect addresses the same category of problem the Worker already solves by
hand. The service currently hand-rolls retry policy, failure classification,
backoff, lease acquisition, and bounded runs. Those are `Schedule`, tagged
errors, and `Effect.timeout` respectively. The failure taxonomy already stored
in `source_failures` maps one-to-one onto tagged errors.

Schema decoding is the more important gain. Both defects in boundary decoding
above are cases where a value was accepted or rejected on the wrong criterion.
A decoder at the seam makes the shape of external data a declared contract that
fails loudly and in one place.

## Reference-level explanation

The proposed target:

```text
apps/web/          user interface (TypeScript)
apps/worker/       routes, adapters, agent acquisition (TypeScript + Effect v4)
packages/domain/   canonical identity, normalization, matching (Effect Schema)
infra/             Alchemy v2 (already TypeScript)
crates/            retained until packages/domain is proven equivalent
```

`packages/domain` must reproduce the current identities byte for byte:

- `stable_hash_hex` is FNV-1a over UTF-8 bytes and ports directly.
- `canonicalize_url` strips tracking parameters and sorts the remainder.
- `occurrence_id` and `canonical_job_id` derive from those two.

Equivalence is a test, not a claim: the same fixture corpus decoded by both
implementations must produce identical ids. Until that test passes, no
migration step ships.

Domain modelling under Effect Schema uses branded identifiers
(`CanonicalJobId`, `SourceId`), tagged unions for lifecycle states rather than
strings, and decoders at every external boundary — the NAV feed, JSON-LD, the
LinkedIn userinfo response. The database remains the same D1 schema.

## ADLC and operational impact

The migration is staged, and each stage is a work scope with its own evidence:

1. Domain package with the equivalence test against the Rust implementation.
2. Interface, served as assets from the Worker.
3. Source adapters and agent acquisition.
4. Route migration behind the existing API contract, one group at a time.
5. Retire the Rust crates once no route depends on them.

The service stays deployable at every stage. Verification gates are unchanged
because they are black-box: the smoke suites assert HTTP behaviour, not the
language behind it.

## Security, privacy, and capabilities

Rust's memory safety is not a differentiator here: the Worker runs in a V8
isolate either way, and `#![forbid(unsafe_code)]` means the current code takes
no advantage of unsafe performance.

Effect v4 is beta. Adopting it means tracking a moving dependency for the
duration, which is a supply-chain and stability cost rather than a security
one. The mitigation is exact version pinning, as the infra package already
does, and `cargo audit`'s equivalent in the JavaScript tree.

Personal data handling is unchanged: the same D1 tables, the same erasure
column, the same boundary at which a CV enters the system.

## Drawbacks

- A working, verified, deployed service is rewritten for no user-visible gain.
  The corpus worker has 28 passing tests and a live deployment.
- Effect v4 is beta, and its stable release date is not published.
- Effect has a genuine learning curve, and a codebase that half-adopts it is
  worse than one that never did.
- Losing Rust removes a compile-time discipline that TypeScript approximates
  but does not equal, particularly exhaustiveness in the domain core.

## Rationale and alternatives

**Stay entirely in Rust.** Defensible if the product stays a corpus service.
It is not: adapters, agents, drafting, and an interface are all queued, and all
are JavaScript-first on this platform. Dioxus would address the interface but
adds a second WebAssembly bundle and does not address adapters or agents.

**Hybrid: keep Rust for the domain, TypeScript for the product.** Superficially
attractive, and it keeps the strongest 8% of the code. It also keeps the seam
that produced five of six defects, in a repository where every contributor must
then know both languages. The seam is the cost, so preserving it preserves the
cost.

**Move entirely to TypeScript with Effect v4.** Recommended. It matches where
the work is going, removes the seam, aligns with Alchemy, which is already
Effect-native and already in this repository, and gives the domain a modelling
tool — Schema — that is stronger than what the current code does by hand.

## Unresolved questions

- Does the interface warrant a framework, or do server-rendered fragments
  suffice for the screens in question?
- Should `packages/domain` remain runtime-agnostic so a future ingestion worker
  can run outside Cloudflare?
- Is Effect v4 stable enough to begin now, or should stage one wait for a
  release candidate?

## Implementation plan

Stage one only, pending a decision on the rest:

1. Create `packages/domain` with Schema definitions for `RawListing`,
   `NormalizedListing`, and the saved-search definition.
2. Port `stable_hash_hex`, `canonicalize_url`, `normalize`, and the matcher.
3. Add an equivalence test that decodes `fixtures/` and
   `fixtures/nav/live-detail.json` through both implementations and asserts
   identical canonical ids and fingerprints.

Nothing is removed in stage one, and nothing deploys from it.

## Verification and evidence

- Identity equivalence across implementations on the committed fixtures.
- The existing smoke suites, unchanged, passing against each migrated stage.
- Bundle size and cold-start measurements before and after, recorded rather
  than assumed.

## Rollout and rollback

Each stage is deployed to staging and smoked before production. Rollback is a
redeploy of the previous stage, because the API contract and database schema do
not change. The Rust crates remain in the repository until the final stage, so
reverting is a routing change rather than a restoration.

## Decision record

Proposed. This RFC records an agent's analysis and recommendation; acceptance
is a human gate under `policy/authority.json`, and no migration work begins
before that gate.

## Amendments

- 2026-08-07: Stage 5 of the implementation plan executed — "Retire the Rust
  crates once no route depends on them" — per `apps/worker/src/Api.ts`
  serving every route group. Deleted: `crates/` (11,301 lines), `migrations/`
  (superseded by the generated `db/schema.sql` snapshot; see
  `work/WS-0012-r1-typescript-migration-plan.md`'s "Identity is no longer a
  constraint"), `Cargo.toml`/`Cargo.lock`/`rust-toolchain.toml`, the legacy
  Wrangler configs (`wrangler.jsonc`, `wrangler.local.jsonc`,
  `wrangler.test.jsonc`), and every script that only built, tested, or
  smoked the Rust worker. `infra/alchemy.run.ts`'s `staging`/`production`
  stages still deploy that (now-deleted) Rust build output — repointing them
  at the TypeScript worker is a deliberately separate decision, not part of
  this stage. Capabilities that existed only in the deleted implementation
  and have not been ported — principal/API-key administration, owned
  saved-search webhook delivery, corpus maintenance, and the query-plan/
  restore-drill production-qualification probes — are recorded in
  `memory-bank/progress.md`.
