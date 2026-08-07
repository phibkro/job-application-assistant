# Effect v4 module specification

Companion to [RFC 0015](../rfcs/0015-implementation-language-for-the-application-product.md),
which decided the language. This specifies the modules, what each owns, and
which Effect capability it rests on.

Pinned against `effect@4.0.0-beta.104`, whose surface was read from the package
rather than from documentation.

## v3 concepts mapped to v4

Existing Effect knowledge is mostly v3. The renames that matter here:

| v3 | v4 | Consequence for this codebase |
| --- | --- | --- |
| `Context.Tag` | `Context.Service` | Service classes take `<Self, Shape>()("Identifier")` |
| `Effect.Service` with generated layer | `Context.Service` + explicit `Layer.effect` | No implicit layer; wiring is written down |
| `Either` | `Result` | Every fallible non-Effect return |
| `FiberRef` | `Context.Reference` | Request-scoped values |
| `@effect/schema` | `effect/Schema` (core) | One import root |
| `@effect/platform/HttpApi` | `effect/unstable/httpapi` | API declaration lives in core |
| `@effect/rpc`, `@effect/cluster` | `effect/unstable/*` | Single version across the ecosystem |
| `Cause<E>` recursive tree | flattened array of reasons | Failure inspection is a list, not a walk |
| Schema `R` | `RD` (decode) and `RE` (encode) | Decoding may require services independently |
| `Runtime<R>` | removed | Use `ManagedRuntime` |

`effect/unstable/*` is explicitly allowed to break in minor releases. The
modules this design depends on there — `http`, `httpapi`, `ai` — are pinned
exactly and treated as a versioned dependency, not a stable contract.

## Why these modules, given what the service does by hand today

| Hand-rolled today | Effect module | What stops being our problem |
| --- | --- | --- |
| Retry policy, backoff, `retry_after_at` | `Schedule` | Composable policies instead of arithmetic |
| `failure_class` string taxonomy | `Data.TaggedError` | The taxonomy becomes the type |
| Source lease with TTL and owner | `Semaphore`, `TxRef` | Contention expressed once |
| Bounded runs (pages, observations, ms) | `Effect.timeout`, `Stream.take` | Budgets as combinators |
| `serde` DTOs and null handling | `Schema` | Decoding declared at the boundary |
| Hand-written routes plus a hand-kept OpenAPI file | `HttpApi` | One declaration; document is generated |
| `JsValue::NULL` / `from_f64` conversions | — | The seam disappears |
| `crypto.randomUUID` via `js_sys::Reflect` | `Crypto` | A primitive, not an escape hatch |
| Cron strings in two config files | `Cron` | Parsed and checked |

## Module map

```text
packages/domain/          pure: schemas, identity, matching, errors
packages/adapters/        per-source acquisition, each behind one interface
apps/worker/              HttpApi declaration, service implementations, entry
apps/web/                 interface
infra/                    Alchemy v2 (exists)
```

### packages/domain

No IO, no Cloudflare, no Effect service dependencies. Everything here is a
schema, a pure function, or an error type.

| Module | Owns |
| --- | --- |
| `Ids` | Branded identifiers and their derivation |
| `Job` | `RawListing`, `NormalizedListing`, `CanonicalJob`, lifecycle |
| `Source` | Catalogue entry, `AcquisitionTier`, `AutomationPolicy` |
| `Search` | Saved-search definition, normalization, matching, transitions |
| `Profile` | CV structure |
| `Application` | Shortlist stage, draft, application, status |
| `Subscription` | Tier and the capabilities it grants |
| `Failure` | Tagged errors mirroring `source_failures.failure_class` |

Identity is the migration's hard constraint. `stableHash` (FNV-1a over UTF-8),
`canonicalizeUrl`, `occurrenceId`, and `canonicalJobId` must produce output
identical to the Rust implementation, and the equivalence test in RFC 0015
stage one is what proves it.

Lifecycle states become tagged unions rather than strings, so an unhandled
state is a type error instead of a silent branch:

```text
JobStatus   = Active | Closed
Stage       = Saved | Drafted | Applied | Closed
Method      = Assisted | Automated
Tier        = Feed | Scripted | Agent | Unknown
Policy      = Allowed | AssistedOnly | Prohibited | Unreviewed
```

### packages/adapters

One interface, many implementations, selected by the catalogue's tier. This is
where "a source without an API gets one" lives.

| Module | Owns |
| --- | --- |
| `SourceAdapter` | The interface every acquisition path satisfies |
| `NavFeed` | The official NAV feed and its detail envelope |
| `JsonLd` | schema.org `JobPosting` extraction |
| `Rendered` | Agent-tier acquisition through Browser Run |
| `Registry` | Tier to adapter resolution |

An adapter returns decoded `RawListing` values or a tagged failure. It never
decides whether it is allowed to run: that is the entitlement and policy
question, answered before it is called.

### apps/worker

| Module | Owns |
| --- | --- |
| `Api` | The `HttpApi` declaration: groups, endpoints, schemas, security |
| `services/*` | Service interfaces (below) |
| `handlers/*` | Endpoint implementations |
| `scheduled` | Cron entry points |

The `HttpApi` declaration replaces three artefacts that must currently agree by
hand: the router, `openapi/job-index-v1.json`, and the smoke suite's
assumptions about routes. The document becomes generated output, and the
typed client is available to tests.

## Services

Sketched as leaf tags first, so orchestration type-checks before any
implementation exists — the approach [Effect Solutions](https://www.effect.solutions/services-and-layers)
calls service-driven development. Interfaces are in `apps/worker/src/services/`;
this table states what each one is responsible for.

| Service | Responsibility | Notes |
| --- | --- | --- |
| `Database` | D1 access | The only module that knows SQL |
| `Corpus` | Canonical jobs, occurrences, changes | Sequence allocation lives here |
| `SourceCatalog` | Catalogue reads, tier and policy | Seeded from the sheet |
| `Acquisition` | Fetch listings for a source | Dispatches to an adapter by tier |
| `Ingestion` | One bounded collection run | Lease, budget, checkpoint, failure ledger |
| `SavedSearches` | Incremental evaluation | Reads the corpus sequence |
| `Accounts` | Registration, principals, sessions | Hashing stays here |
| `Profiles` | The CV | Personal data boundary |
| `Shortlist` | Saved jobs and their stage | Snapshots the advert |
| `Drafting` | Compose CV and letter | Two implementations: template, model |
| `Applications` | Prepare, submit, track | Consults `Policy` before automating |
| `Agenda` | Scheduled preparation | Cadence and run budget |
| `Entitlements` | What a tier permits | Every premium gate asks this |
| `Policy` | What a platform permits | Every automation asks this |
| `Outbox` | Webhook delivery | Transactional with the event |

Two of these deserve emphasis because they are the product's safety
properties, and both are currently expressed as inline conditionals:

- `Entitlements` answers *may this account do this*.
- `Policy` answers *does this platform permit this*.

Automated submission requires both to say yes. Making them services means the
answer is asked for, not remembered, and a test can substitute either one.

## Error model

`Data.TaggedError` per failure class, replacing the string taxonomy:

```text
NavUnavailable · NavRateLimited · NavUnauthorized · NavMalformed
AdapterUnsupported · RenderUnavailable
PolicyProhibited · EntitlementRequired
ProfileIncomplete · DraftMissing
CorpusConflict · LeaseHeld
```

`Cause` is flat in v4, so a run's failure ledger writes a list of reasons
rather than walking a tree. Every one of these maps to an existing
`source_failures.failure_class` value or an HTTP status the API already
returns, so no behaviour changes — only where the fact is written down.

## Deliberate exclusions

- **No layers yet.** RFC 0015 stage one is the domain package and its
  equivalence test. Layers arrive with implementations.
- **No framework decision.** `apps/web` is a directory in this map and nothing
  more.
- **`effect/unstable/sql` is not adopted for D1.** The `Database` service is
  a narrow interface first; whether a SQL layer sits under it is a later
  decision that does not change its callers.
- **`effect/unstable/ai` is named but unscheduled.** Model drafting is a
  premium capability behind an interface that the template implementation
  already satisfies.


## Technology decisions

Recorded so they are not relitigated. Each was checked against the published
package rather than its documentation, which mattered in two cases.

### Data access: `@effect/sql-d1`, Drizzle deferred

`effect/unstable/sql` provides `SqlClient`, `SqlSchema`, `SqlModel`, and
`Migrator`; `@effect/sql-d1` provides the D1 client and publishes a v4 beta
line. `SqlModel` consumes the `Model.Class` definitions directly, so
repositories derive from the domain models rather than restating them.

Drizzle is deferred, not rejected. Two reasons: `drizzle-orm@1.0.0-beta.20`'s
Effect integration targets **v3** APIs, and an AST compiler is being built that
turns Effect Schema and `Model` definitions **into** Drizzle tables. The second
settles the direction of truth — `Model` is the source and Drizzle tables are a
derivation. Hand-writing both would be two copies of the schema free to
disagree, which is the defect class this repository has already removed once,
when the staging and production Wrangler configs were deleted.

Migrations stay as ordered SQL files applied by Alchemy's `migrationsDir`.

### HTTP: `HttpApi`, not Elysia

Elysia runs on Workers through an experimental adapter, and its DX on Bun is
genuinely better. It loses here on three counts: its schemas are TypeBox, so
every request would cross a conversion layer against a domain modelled in
Effect Schema; `HttpApi` generates the OpenAPI document, a typed client, and
test helpers from one declaration, which removes the hand-maintained
`openapi/job-index-v1.json`; and Elysia's Cloudflare adapter has an open issue
about not extending the context, which is where every binding this service uses
arrives.

Elysia remains the better choice if a Bun-hosted service appears — an agent
runner, for instance — where Eden and its plugin ecosystem pay off.

### Frontend: Foldkit

Elm architecture on Effect with schema-first state: one model, one update
function. The interface is command-shaped already — `Save`, `Draft`, `Apply`,
and `Approve | Rework | Decline` on a proposed application — which is a message
union, matched exhaustively, sharing schemas with the API rather than restating
them as DTOs.

Pre-1.0 at 0.139.0 and published within the last day: actively maintained, and
pinned exactly because minor releases may break.

### State machines: `effect-machine`, scoped to the agent session

Effect-native and schema-first — states and events are `Schema.TaggedUnion`, the
vocabulary the domain already speaks — and transitions may read services, so a
guard can consult policy or entitlement natively. XState was the alternative and
would have brought a parallel type system and its own actor model that composes
with neither our schemas nor our layers.

Not installed yet. The decision stands, but an unused dependency is bundle
weight and supply-chain surface for a module that does not exist — it goes in
when the agent session machine does.

Adopted for the agent session only: locate the form, fill what is known, pause
for the person, observe what they type, confirm, persist the mapping. That has
real hierarchy, parallelism, and long pauses.

Not adopted for `Stage`, `DeliveryTier`, or application status. Those are small,
total, and better served by a tagged union with an exhaustive `Match`, where the
compiler enforces totality and there is nothing to keep in sync.

The maturity risk is contained by that scope: the library is in-process
orchestration, not the system of record — durable long-running state belongs to
Cloudflare Workflows. If it stalls, we lose a modelling convenience rather than
persisted state, and with zero runtime dependencies vendoring is a realistic
exit. Its own README describes it as temporary, pending equivalent functionality
in Effect itself.

### Version pinning: exact, and two trees on purpose

Effect v4 betas move quickly — beta.74 and beta.104 were weeks apart. Every
dependency is pinned exactly and bumped deliberately.

The repository holds **two** Effect versions on purpose:

| Tree | Effect | Why |
| --- | --- | --- |
| `packages/*`, `apps/*` | `4.0.0-beta.104` | The application; current |
| `infra/` | `4.0.0-beta.74` | The version Alchemy actually runs on |

Alchemy `2.0.0-beta.45` declares `effect >= 4.0.0-beta.74`, but breaks on
beta.104: `Schema.TaggedErrorClass` no longer exists, and Alchemy calls it while
authenticating. `tsc --noEmit` passed on the bump — Alchemy ships `.ts` sources
that `skipLibCheck` does not check — so only running `alchemy plan` revealed it.
A declared version range is a claim; the deploy path is the evidence. The two
programs never share a runtime, so the split costs nothing but must not be
quietly collapsed.
