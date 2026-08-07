# Design spec: the source-adapter plugin surface

- Status: Frozen at PR open. Seam implemented; not yet wired into a running deployment (see "What is not here yet").
- Owns: `packages/adapters/src/SourceAdapter.ts`, `packages/adapters/src/Registry.ts`, `apps/worker/src/acquisition/index.ts`, `apps/worker/src/services/Acquisition.ts`.
- Reference implementation: `packages/adapters/nav/` (the live NAV feed).

## The problem, stated plainly

Some job-listing sources sit in a legal grey area for automated collection —
their terms are ambiguous, contested, or the operator has not decided this
project should take on the liability of reading them at all. This project
should not have to host, ship, or take responsibility for an adapter whose
collection is contested. It should still be possible for someone to write
that adapter and run it, without this repository or this deployment carrying
it.

Extensibility is the mechanism. The reason is legal and operational
separation: **an adapter's presence in a build is a deployment's choice, and
its consequence is that deployment's.**

This spec does not decide which sources are grey-area, does not write one, and
does not decide where out-of-tree adapters are actually published from. Those
are named as open questions below.

## User journey

**Priya writes an adapter for a source she is not sure this project's
maintainers want to be seen automating.**

1. She creates a new package — in this repository if the source is
   unambiguous (the way `packages/adapters/nav` is today), or in her own
   repository if it is not. Either way the package depends on
   `@job-index/adapters` (for the `SourceAdapter` interface and `AcquiredPage`
   type) and `@job-index/domain` (for `PlatformId`, `RawListing`, and the
   tagged failures). It depends on nothing else in this repository — not
   `apps/worker`, not D1, not the HTTP layer.
2. She writes one object satisfying `SourceAdapter["Service"]`: `supports`
   (does this adapter read this platform id) and `page` (read one bounded
   page). `packages/adapters/nav/src/index.ts` is the reference to copy —
   it is the smallest complete example, reading a feed that publishes
   machine-readable listings on purpose.
3. She does **not** set a tier, a policy, or an automation stance anywhere in
   her adapter. There is no field for it — see "What the core refuses" below.
   That is decided by research recorded in `source_catalog`, by a person, on a
   platform-by-platform basis, independent of any adapter.
4. **A deployment that wants her adapter** adds her package as a dependency
   (a normal `package.json` entry — a git dependency, a tarball, or a private
   registry entry; see the open question on distribution) and adds one line to
   its adapter registration list: `{ tier: "Scripted", adapter: priyaAdapter }`,
   passed to `apps/worker/src/acquisition/index.ts`'s `layer(registrations)`.
   That list is an ordinary array literal in source under this deployment's
   control — reviewed the way any other code change is reviewed.
5. **A deployment that does not want her adapter** simply never adds the
   dependency and never adds the line. Nothing is disabled or filtered at
   runtime, because nothing runtime-reachable ever existed: the adapter's code
   was never a dependency, so it was never installed, never bundled into the
   Worker, and never reviewed as part of this project's supply chain. Excluding
   an adapter costs nothing and requires no mechanism beyond "don't import it."
6. Priya's platform still needs a `source_catalog` row before anything calls
   her adapter (see below) — writing the adapter and getting it acquisition-ready
   is necessary but not sufficient; a person still has to research and record
   the platform's tier for `Acquisition` to ever route a request to it.

## The interface

Nothing here is new. `SourceAdapter` and `AcquiredPage` already existed in
`apps/worker/src/services/Acquisition.ts` before this change; the only design
decision is that they are now published from `packages/adapters`, a package
with no dependency on the Worker, instead of defined inside it — because an
out-of-tree adapter cannot depend on a file path inside a repository it is not
part of.

```ts
// packages/adapters/src/SourceAdapter.ts
export interface AcquiredPage {
  readonly listings: ReadonlyArray<RawListing>;
  readonly cursor: string;   // opaque; the adapter's resume point
  readonly more: boolean;    // false on the tail page
  readonly via: "feed" | "scripted" | "rendered";
}

export class SourceAdapter extends Context.Service<SourceAdapter, {
  readonly supports: (platform: PlatformId) => Effect.Effect<boolean>;
  readonly page: (platform: PlatformId, cursor: string) =>
    Effect.Effect<AcquiredPage, DecodeFailed | SourceUnavailable>;
}>()("@job-index/SourceAdapter") {}
```

`supports` answers one question only — "can I produce pages for this platform
id" — never "am I allowed to." `page` reads one bounded page and fails with a
tagged error (`DecodeFailed`, `SourceUnavailable`) rather than throwing or
substituting an empty result; a page that half-decodes must fail loudly, the
way `packages/adapters/nav`'s own doc comment already explains ("the failure
that hid for an entire release").

Composition is a second, small piece, also derived from what existed
(`Acquisition`'s doc comment already said adapters are "registered per tier";
there was no code that did the registering):

```ts
// packages/adapters/src/Registry.ts
export interface Registration {
  readonly tier: AcquisitionTier["_tag"];
  readonly adapter: SourceAdapter["Service"];
}

export const resolve = (
  registrations: ReadonlyArray<Registration>,
  tier: AcquisitionTier["_tag"],
  platform: PlatformId,
  cursor: string,
) => /* Effect<AcquiredPage, AdapterUnavailable | DecodeFailed | SourceUnavailable> */
```

`resolve` filters registrations by tier, then asks each candidate's own
`supports` — so a deployment may register more than one adapter at the same
tier (two "Feed" sources, say) and dispatch still lands on the one that
actually claims the platform, rather than "first registered wins."

```ts
// apps/worker/src/acquisition/index.ts
export const layer = (registrations: ReadonlyArray<Registration>) =>
  /* Layer<Acquisition, never, SourceCatalog> */
```

This is the actual composition point: it reads the platform's tier from
`SourceCatalog` (never from the adapter — see below), then calls `resolve`.
It is a plain function from an explicit list to a `Layer`, so a deployment's
registration list is visible as one array literal wherever this is called.

## What the core guarantees, and what it refuses

**Guarantee: tier is a catalogue fact, never an adapter's claim.**
`Acquisition`'s Live layer looks up the platform's tier from `SourceCatalog` —
a read-only service over `source_catalog`, itself populated by research, not
by request-path code (`apps/worker/src/catalog/index.ts`'s own doc comment:
"nothing in the request path writes it"). An adapter is asked to act on a tier
decision it never makes. Registering an adapter under the wrong tier is a
mistake a reviewer can catch in the registration array; it is not something
the adapter's *code* can do to itself at runtime.

**Refusal: `SourceAdapter` cannot express or influence automation policy at
all.** This is not a runtime check — it is structural. `SourceAdapter["Service"]`
has exactly two methods, `supports` and `page`; neither takes nor returns
anything resembling `AutomationPolicy`. `AcquiredPage.listings` is
`RawListing[]`, and `RawListing` (`packages/domain/src/Job.ts`) has no policy
field either. `AutomationPolicy` and its `Unreviewed`-forbids-automation
default live entirely in `source_catalog` and are read only by `Policy`
(`apps/worker/src/services/Policy.ts`), consulted only when `Applications`
prepares a submission — a wholly separate stage, downstream of acquisition,
that no `SourceAdapter` implementation can reach or address. A grey-area
adapter that reads listings perfectly cannot, by that fact alone, cause
anything to be automatically applied to; that requires a second, independent
person to have separately marked the *delivery* platform `Allowed`. This is
the falsifiable form of "an adapter must never be able to grant itself
permission": there is no parameter, return value, or side channel in this
interface through which permission could be granted.

**Refusal: no dynamic loading, so "included" is always a build-time, reviewable
fact.** `Registration.adapter` is a plain, statically-imported object of two
Effect-returning functions. There is no `eval`, no runtime `import()` of a
string, no fetch-then-execute. A Worker bundle is a closed artifact
(`bun build --target=browser`, the same command `./bootstrap check` already
runs) — an adapter that is not imported by the registration list contributes
zero bytes to it and was never fetched, evaluated, or run. "This deployment
ships this adapter" is therefore always a diff someone can read, never a
runtime configuration flag someone could flip without review.

**Not guaranteed, and out of scope for this spec:** `RawListing.applicationUrl`
is adapter-supplied, free-form text, and `Policy` resolves a job's policy by
matching that URL's host against `DeliveryPlatform.hostPattern`
(`packages/domain/src/Delivery.ts`). An adapter that lied about
`applicationUrl` could, in principle, cause a job to be misclassified against
the wrong delivery platform's policy. This is a pre-existing property of how
`Policy` resolves jobs, not something this plugin surface introduces or
changes, and fixing it is out of scope here — flagged under open questions.

## Why out-of-tree

The separation is legal and operational, not a matter of code style:

- **Liability boundary.** If a source's terms are contested, whoever decides
  to read it automatically is the one accountable for that decision. Keeping
  the adapter in a separate package under a separate maintainer keeps that
  accountability where the decision was actually made, instead of attributing
  it to this project by virtue of the code living in this repository.
- **Distribution boundary.** This repository's releases, its `LICENSE`
  (AGPL-3.0-or-later, per `memory-bank/activeContext.md`), and its
  corresponding-source obligations cover what it ships. An adapter this
  project never depends on is never part of what it ships, deploys, or is
  answerable for.
- **Review boundary.** A deployment operator, not this project's maintainers,
  decides what their own build includes. The registration list is that
  decision, expressed as ordinary reviewable source.

## Falsifiers / definition of done

The surface is real if all of the following hold, and false if any do not:

1. `SourceAdapter` and `AcquiredPage` are importable from a package
   (`@job-index/adapters`) with no import, transitive or direct, on anything
   under `apps/worker` — checked by `tsc --noEmit` succeeding with the reverse
   dependency removed (done: `packages/adapters/nav` and
   `packages/adapters/jsonld` no longer import from `apps/worker`).
2. The existing NAV adapter satisfies the interface unchanged in behavior —
   its own test file's assertions pass without modification to what they
   assert (only the import path of `SourceAdapter` changed).
3. `Registry.resolve` correctly dispatches the reference NAV adapter for its
   registered tier and platform, refuses a tier with no registration, and
   refuses a platform no registered adapter at that tier supports — each
   proven by a running test, not by inspection
   (`packages/adapters/src/Registry.test.ts`).
4. `apps/worker/src/acquisition/index.ts`'s `layer` reads tier from
   `SourceCatalog`, not from any adapter, and fails `AdapterUnavailable` for a
   platform the catalogue has no entry for — proven by a running test
   (`apps/worker/src/acquisition/index.test.ts`).
5. No `eval`, dynamic `import()`, or network-fetched code path exists in the
   registry or the Live layer — checked by reading `Registry.ts` and
   `acquisition/index.ts` (both are short enough to read in full) and by
   `bun build apps/worker/src/index.ts --target=browser` succeeding, proving
   the Worker bundle remains a closed, statically-resolved artifact.
6. `nix shell nixpkgs#bun -c bun run check` passes: format, lint, typecheck,
   schema, bundle, and the coverage-gated test suite, with all pre-existing
   tests green and unmodified in what they assert.

## What is not here yet

`Acquisition` is not wired into `runtime/Layers.ts` or into any running route.
This is deliberate, not an oversight: `Ingestion` (`apps/worker/src/services/Ingestion.ts`)
— the only planned consumer of `Acquisition` — has no implementation yet, and
`apps/worker/src/index.ts`'s own comment already states the project's standing
practice on this: "Ingestion has no implementation yet, and an empty cron
handler that silently does nothing is worse than none at all." Wiring
`Acquisition` into the runtime ahead of a real consumer would be exactly that
kind of decoration. The seam this spec describes is complete and independently
tested; the next real registration list — the one an actual deployment
constructs and reviews — belongs to whichever change implements `Ingestion`.

## Open questions (operator-owned)

- **How is an out-of-tree adapter actually distributed?** This spec assumes
  "a normal package.json dependency" but does not decide whether that means a
  private npm registry, a git dependency pinned to a commit, or a vendored
  tarball. Each has different supply-chain and review implications.
- **Where does the list of grey-area sources live, and who decides a source is
  grey-area?** `source_catalog`'s `AutomationPolicy` currently answers "may we
  automate applying here," not "may we automate reading here." Reading-consent
  research (robots.txt, terms of service, rate limits) is not currently
  modeled anywhere in this schema. If it should be, that is new schema work,
  not something this spec's seam can retrofit silently.
- **Does this project want to host any grey-area adapter itself, ever, behind
  a flag, or is out-of-tree the only acceptable place for one?** This spec
  assumes the latter (nothing in `packages/adapters` in this repository is
  itself grey-area, and the seam exists so it never has to be) but that is a
  policy choice, not a technical one.
- **The `applicationUrl`-spoofing gap** noted above (an adapter's free-form
  `applicationUrl` decides which delivery platform's policy a job is judged
  against) predates this change and is not fixed by it. Worth a decision on
  whether it needs hardening before out-of-tree adapters are actually
  connected to a production deployment.
