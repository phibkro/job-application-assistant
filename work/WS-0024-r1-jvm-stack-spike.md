# WorkScope: Spike, Clojure + bitemporal/Datalog store on the WS-0020 falsifiers

- ID: WS-0024
- Revision: 1
- Status: **Approved** (owner decision 2026-11-01)
- Owner: Human product owner (phibkro)
- Risk tier: **R1 spike**: exploration only. No production code, no change to the existing workspace, no deploy.
- Repository/ref: `phibkro/job-application-assistant`, branch `claude/clever-heisenberg-lwui1b`. All files go under `spikes/WS-0024-clojure/` and `evidence/WS-0024/`.
- Roles: the implementer works at the `complex-reasoning` tier, and a separate reviewer at the `general` tier checks reproducibility.
- Attempt budget: 2, time-boxed to one focused session.

## Question

Does a Clojure stack, with a bitemporal/Datalog store, express the market-index core more clearly and verifiably than the TypeScript/Effect path? Here "core" means observations, identity, the `Fact` states, change/closure and the workload query. The comparison uses the same fixtures and the same falsifiers, and covers the cost of giving up the Cloudflare runtime and Effect's typed effects.

## Approach (decided)

- Clojure 1.12 + JDK 21 via Nix (`nix shell nixpkgs#clojure nixpkgs#jdk21_headless`).
- Store: **XTDB v2** (bitemporal SQL + XTQL) as the primary candidate. **Datomic Local** is the alternative if XTDB can't run embedded or in-process. Both must resolve from **Maven Central**; Clojars is blocked by network policy.
- Verification: `clojure.test` + `test.check` (Maven Central). Malli/Clojars libraries are unavailable, so use `clojure.spec` for schemas and record that as a limitation.
- Inputs: the existing `fixtures/nav/*.json` (read-only), decoded in Clojure.

## Falsifiers to reproduce (the same as WS-0020 plus the D05/D06 targets)

1. Ingesting a NAV fixture makes a vacancy queryable, with its source reference.
2. Replaying an identical observation is a semantic no-op.
3. An INACTIVE/closed entry propagates as a visible closure (as of time T, it is no longer active).
4. **Target D05 behavior:** two NAV ads with different `externalId` and equal title/employer/location stay **two** vacancies; a cross-source `sameAs` link is a recursive rule.
5. **Target D06 behavior:** workload as `Fact` with the 7 states. A 40–60% query separates `Stated` / `Derived` / `Negotiable` / `Unknown` / `TempUnknown` / `Unsupported` / `Conflicting` across fixtures (50%, 40–80%, 100%, negotiable, `Deltid` with no %, nothing).
6. As-of / bitemporal: the query result *as of* an earlier recorded time is reproducible after later observations.
7. Each falsifier has a negative control (a deliberately broken variant) that must fail.

## Deliverable

`evidence/WS-0024/README.md`:
- the pinned tool and library versions, and how they were resolved
- the commands to reproduce, with pass/fail counts
- a side-by-side comparison with the TS path for each falsifier:
  - lines of code
  - how the rule reads
  - type and law coverage
  - effect handling and errors
  - operational needs (process, storage, backup, hosting, versus Workers/D1/DO)
  - developer loop time
- what could not be tested
- a recommendation, which is a proposal: the owner decides

## Exclusions

No change to `apps/`, `packages/`, `infra/`, `db/`, lockfiles or CI. No web/frontend work. No live NAV access. No claims about production readiness or performance at scale beyond what was measured.
