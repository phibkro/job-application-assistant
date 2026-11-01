# WS-0024 evidence: Clojure + Datalog store spike on the WS-0020 falsifiers

Scope: [WS-0024@1](../../work/WS-0024-r1-jvm-stack-spike.md) (R1 spike, exploration only).
Code: [`spikes/WS-0024-clojure/`](../../spikes/WS-0024-clojure/). Baseline compared against:
[WS-0020](../WS-0020/README.md) at `dd6fe17` (this spike's starting commit on
`claude/clever-heisenberg-lwui1b`).

Status: **implementation complete, awaiting independent review and the owner's decision.**
The recommendation at the end is a proposal. The implementer approves nothing.

## Summary for the owner

- **XTDB v2 could not run in-process here.** Its embedded node (`com.xtdb/xtdb-core`
  2.0.0 and 2.2.0, both on Maven Central) depends on at least six Clojars-only
  artifacts. Clojars is blocked by network policy. I did not work around the
  policy, so the native valid-time, bitemporal store the WorkScope preferred was
  **not tested**. I used the WorkScope's fallback, **Datomic Local 1.0.301**,
  in-process and in-memory. Datomic is uni-temporal: recorded (transaction) time
  is native, and valid time had to be modelled by hand.
- **All 6 falsifiers pass on Datomic Local, and all 10 negative controls fail as
  intended.** That includes the D05 and D06 targets, which TS does not implement
  today. 17 tests, 48 assertions, 0 failures. 7 property laws (test.check) pass
  at 40 trials on the default seed and at 200 trials on seeds 1 and 42.
- **Most of the spike's value is in the model, not the language.** The model is:
  content-addressed immutable observations, a closed `Fact` attribute set with 7
  states, `(source, externalId)` identity, a `sameAs` link table with recursive
  closure, a fusion function with laws, and broken-twin controls. Datalog
  carried the recursive `sameAs` closure and the identity invariant (about 15
  lines). Native `as-of` carried recorded-time reproducibility at zero code. The
  rest was plain functional Clojure: valid-time selection, fusion, the workload
  decision table and the interval algebra.
- **Proposal: keep platform investment on TS/Effect/Cloudflare, and port this
  model and its falsifier and control suite into TB-01/TB-02.** Revisit the JVM
  only if TS cannot pass F6 (as-of) and F4 (closure) at reasonable cost, or if
  the owner allows Clojars so XTDB can be tried. The strongest counter-argument
  is [at the end](#recommendation-proposal).

## Pinned versions and how they were resolved

| Item | Value | How established |
| --- | --- | --- |
| Starting commit | `dd6fe17` | `git log -1` before any change |
| Nix | 2.34.6 | `nix --version` |
| nixpkgs (registry `nixpkgs#`) | `nixpkgs-unstable` rev `d357a2b54f0b6dc4aeb4e993190a52cf151b6f24` | `nix flake metadata nixpkgs --json`. Pinning `github:NixOS/nixpkgs/<rev>` failed: GitHub access is not enabled for this session. |
| Clojure CLI | 1.12.6.1673 | `clojure --version` in `nix shell nixpkgs#clojure nixpkgs#jdk21_headless` |
| JDK | OpenJDK 21.0.12.1 (nixos build) | `java -version` |
| `org.clojure/clojure` | 1.12.3 | `deps.edn` (exact) |
| `com.datomic/local` | 1.0.301 (latest on Maven Central, 2026-07-15) | `deps.edn`; Maven Central `maven-metadata.xml` |
| `org.clojure/data.json` | 2.5.2 | `deps.edn` |
| `org.clojure/test.check` | 1.1.3 (`:test` / `:controls` aliases) | `deps.edn` |
| `clojure.spec.alpha` | 0.5.238 (transitive) | [`deps-tree.txt`](deps-tree.txt) |
| Resolution | 55 jars, **Maven Central only**. `deps.edn` sets `:mvn/repos {"clojars" nil}`. | [`deps-tree.txt`](deps-tree.txt); [`classpath-sha256.txt`](classpath-sha256.txt) |
| Clean-resolve check | Resolving into an empty `:mvn/local-repo` took 4.2 s (23 MB). Every jar's sha256 matched `classpath-sha256.txt`. | command R3 below |

XTDB probe (attempts 1 and 2 for this blocking problem):

1. `clojure -P` on `com.xtdb/xtdb-api` + `com.xtdb/xtdb-core` 2.2.0 failed with
   `Could not transfer artifact integrant:integrant:pom:1.0.1 from/to clojars ... UnknownHostException`.
2. Maven Central returned HTTP 404 for `integrant` 1.0.1, `ring-core` 1.15.3,
   `ring-jetty9-adapter` 0.39.2, `reitit-core` 0.10.1, `muuntaja` 0.6.11 and
   `hato` 1.0.0, all direct `compile` dependencies of `xtdb-core` 2.2.0. The
   `clj-yaml` and `next.jdbc` probes were rate-limited (HTTP 429). The 2.0.0 POM
   declares the same Clojars groups (`integrant`, `clj-commons`, `ring`,
   `info.sunng`, `metosin`). Integrant wires the node itself, so it cannot be
   excluded. Fetching these artifacts by another route would bypass the
   network policy, so I stopped there.

Not tried: XTDB as a separate server reached over pgwire, and other 2.x lines
beyond 2.0.0 and 2.2.0.

Library substitutions the network forced: **Malli → `clojure.spec`** (Malli is
Clojars-only), and Datomic Local in place of XTDB. No HTTP layer was used.

## Commands and outcomes

Run from `spikes/WS-0024-clojure/`. Machine: 4 vCPU Intel Xeon @ 2.10 GHz,
15 GB RAM, in this session's container. Timings are wall clock for the runs
listed, nothing more.

| # | Command | Outcome |
| --- | --- | --- |
| R1 | `nix shell nixpkgs#clojure nixpkgs#jdk21_headless -c clojure -M:test` | **PASS**: 17 tests, 48 assertions, 0 fail, 0 error ([`test-run.log`](test-run.log)). 3 timed runs: end-to-end 12.9 / 13.7 / 13.5 s, of which in-JVM suite 7.3 / 7.8 / 7.1 s. |
| R2 | `nix shell nixpkgs#clojure nixpkgs#jdk21_headless -c clojure -M:controls` | **PASS (exit 0)**: 10/10 controls made their target falsifier fail ([`controls.log`](controls.log), which includes each `FAIL` report). End-to-end 7.3 / 7.5 / 8.1 s. |
| R3 | `clojure -Sforce -Sdeps '{:mvn/local-repo "/tmp/…/m2"}' -Spath -M:test`, then sha256 every jar | Identical to `classpath-sha256.txt` |
| R4 | `clojure -J-Dws24.trials=200 -J-Dws24.seed=1 -M:test`, and the same with seed 42 | PASS both: 17 tests, 0 fail (suite 29.3 s and 30.6 s) |
| R5 | Warm JVM: load once, rerun `ws24.falsifiers-test` 3×, reload `ws24.facts` | load 4.1 s; reruns 1378 / 415 / 293 ms; namespace reload 49 ms |
| R6 | Datomic Local `:storage-dir` on disk: write in process 1, `cp -r` the directory, read the copy in process 2 | Value restored (28 KB store). This was a cold copy after the process exited, not an online backup. |
| T1 | (repo root) `node node_modules/.bin/vitest run -c vitest.workers.config.ts apps/worker/src/handlers/navToClient.live.test.ts` (Node 22.23.4) | PASS 6/6 (WS-0020 baseline). Vitest duration 9.47 / 8.95 / 8.87 s; wall 11.8 / 11.3 / 11.2 s. |
| T2 | (repo root) `bun node_modules/vitest/vitest.mjs run apps/worker/src/corpus/decide.test.ts apps/worker/src/corpus/identity.test.ts packages/adapters/nav/src/decode.test.ts` (Bun 1.4.4) | PASS 29/29. Duration 1.05 / 0.87 s; wall 1.48 / 1.28 s. |

`git status` after T1 and T2 showed no change outside `spikes/` and
`evidence/`. The workers run writes nothing tracked.

Reproducibility notes: the laws use a fixed seed (`20261101`), override it
with `-J-Dws24.seed=N`. `controls.log` text changes between runs because C2
deliberately embeds `System/nanoTime` in observation ids. The outcome
(10/10) does not change. `nixpkgs#` follows the flake registry, so a later
nixpkgs may supply a different CLI or JDK.

## What was built (one paragraph per piece)

- **Observations** (`nav.clj`). An observation is what was received: an
  envelope (source, externalId, kind, status, the source's own modified time)
  plus a flat, sorted bag of raw JSON claims `{path value}`. Its id is
  `sha256` of the full content, so an identical replay upserts to the same
  entity and adds zero datoms. The INACTIVE feed entry is recorded, not
  filtered. A second, fixture-only schema.org-shaped importer (`fixture-board`,
  `fixture-ats`, allowed under D04) fits the same shape unchanged.
- **Facts** (`facts.clj`). Every observation from every source yields exactly
  one `Fact` per closed attribute (`schema/title`, `hiringOrganization`,
  `taxID`, `jobLocation`, `url`, `workHours`). A fact carries a state from the
  7, evidence, a method version, and for workload an FTE interval plus an
  optional schedule. Unconsumed claims are uniform `residue`. NAV
  `positioncount "3"` (WS-0020 G5) survives as residue.
- **Store** (`store.clj`). Datomic Local holds observations, claims, facts
  and `sameAs` links. Recorded time is the transaction `t`, so `d/as-of` and
  `d/since` are native. Valid time is `:obs/source-modified`. "Latest by
  valid time, arrival order only breaks exact ties" is a Clojure sort. Every
  strategy a falsifier depends on is one key of an `impl` map, so each
  control is `(assoc good :key broken-fn)`.

## Falsifiers: result, control, and TS comparison

"TS today" is current behaviour at `dd6fe17`, from WS-0020's executed tests
unless marked *source-read*. The D05 and D06 targets are not implemented in
TS, so for F4–F6 the comparison is "implemented in the spike" against "not
implemented / opposite pinned". That says nothing yet about how hard each
target would be in TS.

| # | Falsifier | Clojure + Datomic Local | Negative control (seen failing) | TS today |
| --- | --- | --- | --- | --- |
| F1 | Ingesting a NAV fixture makes a vacancy queryable, with its source reference | **PASS.** The active vacancy carries `{source "nav", external-id "active-vacancy-1", url <NAV posting URL>, status ACTIVE}` and its stored observation id. The INACTIVE entry is kept, as inactive. | **C1**: external id read from the feed item `id` (`entry-1`) instead of `_feed_entry.uuid`. 2 assertions failed. | PASS (T1). The reference is `sources: ["nav"]` plus `applicationUrl`; the occurrence id is not exposed (G1). The INACTIVE entry is never observed. |
| F2 | Identical replay is a semantic no-op | **PASS.** Replay of feed + detail adds 0 non-transaction datoms, gives an identical view and an empty change cursor (`d/since`). Law L1 holds for random histories with repeats. | **C2**: observation id includes a receipt nonce. 3 assertions failed. | PASS (T2): `canonicalChanges 0`, sequence unchanged. `lastSeenAt` heartbeat may move. |
| F3 | INACTIVE propagates as visible closure (as of T, no longer active) | **PASS.** Closed now. Active as-of the recorded `t` before the closure. Active at valid time 08:30. The change cursor since then names the occurrence. | **C3**: status = "ever seen ACTIVE". 1 assertion failed. | PASS (T3), via `closeAbsent` at the sweep tail. There is no as-of: the prior state is overwritten. |
| F4 | D05: two NAV ads, different `externalId`, equal title/employer/location stay two vacancies; cross-source `sameAs` is a recursive rule | **PASS.** The two NAV requisitions stay separate. nav ~ board (deterministic blocking key + orgnr candidate) and board ~ ats (explicit URL evidence) close transitively into one vacancy. An ambiguous board candidate is not linked. The invariant query "no two same-source occurrences in one vacancy" is empty, and the vacancies partition the occurrences. | **C4a**: identity = title/employer/location, today's TS key (4 failed). **C4b**: rule without its recursive clause (1 failed). **C4c**: candidate generator links ambiguous candidates (4 failed). | **FAIL by design**: T4 pins the merge (one canonical row, two occurrences). There are no `sameAs` links or rules. |
| F5 | D06: 7-state workload `Fact`; a 40–60% query separates the states across 50%, 40–80%, 100%, negotiable, `Deltid` with no %, nothing | **PASS.** 50% → Derived, within. 40–80% → Derived, overlaps. Heltid → Stated, outside. "etter avtale" → Negotiable. Live `Deltid` fixture → Unsupported (part-time). Nothing → Unknown. Feed summary only → TempUnknown. Heltid + "50 %" → Conflicting. Only `wl-50` is within. A 50% (NAV) + 100% (board) pair joined by `sameAs` fuses to Conflicting. | **C5a**: missing workload treated as Stated 100% (4 failed). **C5b**: interval collapsed to its midpoint, so 40–80% becomes 0.6 (1 failed). | Not implemented. Extent is not decoded (G11), and nothing in the schema holds it. |
| F6 | As-of: the result as of an earlier recorded time is reproducible after later observations | **PASS.** The view at `t1` equals the view as-of `t1` after a closure, a detail update and four new adverts. The present did change. Late arrival: an INACTIVE@10:00 delivered before an ACTIVE@09:00 stays closed. Laws L2 (as-of stability) and L3 (arrival-order independence) hold. | **C6a**: as-of ignored (1 failed). **C6b**: status by arrival order, last write wins (1 failed). | Not supported. `canonical_jobs`/`occurrences` hold current state only, and raw payloads are not retained (WS-0020 storage row). *Source-read:* `decide.ts` compares fingerprints in arrival order, not source time. |
| F7 | Each falsifier has a negative control that must fail | **PASS**: 10/10 (`-M:controls`, exit 0) | — | WS-0020 inverted 2 of 6 assertions by hand, once (T4, T6). There is no standing control suite. |

## Cross-cutting comparison

| Dimension | Clojure + Datomic Local (this spike) | TS + Effect v4 + D1 (today) |
| --- | --- | --- |
| **Lines of code** (cloc 2.10, code lines) | src **498** (`store` 231, `facts` 180, `nav` 87); tests 391 (falsifiers 129, laws 82, fixtures 65, controls 55, runner 39, shape 21). cloc counts Clojure docstrings as code. | Comparable src **848** code + 401 comment (`decode` 182, `decide` 161, `rows` 108, `identity` 106, `close` 83, `sql` 79, `observe` 68, `schema` 61); WS-0020 test 427. |
| LOC caveat | No HTTP API, lease, checkpoint, hydration fetch or auth. In memory. Covers F4–F6 targets. | Production-shaped: D1 mapping, sequences, hydration states, checkpoint integration. Covers none of the F4–F6 targets. The two counts are not equivalent. |
| **How the rule reads** | `sameAs` closure as 5 Datalog clauses (`store.clj` `recursive-rules`). The identity invariant is a 3-line query over the same rule. The workload rule is one total decision table (`facts/derive-workload`, documented as a table). Valid-time selection, fusion and classification are short pure functions, **not Datalog**: Datomic Datalog has no aggregation inside rules ("latest per occurrence"). | Identity is `deriveCanonicalKey` (3 fields joined). Change logic is a 5-branch `decideObservation` returning tagged outcomes. A `sameAs` closure would need SQL `WITH RECURSIVE` (SQLite supports it; **untested on D1**) or code. |
| **Type and law coverage** | `clojure.spec` at the decode boundary and on the `Fact` shape (checked inside a law). No static types. Datomic's schema caught a keyword in a string attribute **only at transact time**, a bug `tsc` would have caught at edit time. 7 test.check laws: replay idempotence, as-of stability, arrival-order independence, fuse commutative/idempotent/associative, fact-shape conformance, only-determined-matches, interval overlap symmetry. **The associativity law found a real fusion bug** (a fused Conflicting kept a schedule and lost the disagreement on re-fusion); fixed. | Static types over the whole path, including branded ids and `Schema`-decoded payloads. fast-check is a dependency and is used in corpus and identity tests. No laws yet for the D05/D06 targets, which don't exist. |
| **Effect handling and errors** | Decode failures are `ex-info` carrying a cognitect-style `:anomaly :incorrect` plus a spec explanation. Datomic errors arrive the same way. Nothing in a signature says a function can fail or touches the store: the store-touching boundary (`ingest!`, `link!`, `view`) is a naming convention. | Errors are typed in the signature (`Effect<RawListing, DecodeFailed>`). Services and layers make dependencies explicit and swappable, which is how WS-0020 substituted only the NAV `HttpClient`. That property would be lost on the JVM unless rebuilt by discipline. |
| **Operational needs** | One JVM process. Datomic Local is embedded and single-process. Storage is in-memory or a local directory; R6 showed a cold directory copy restores. 55 jars, including AWS SDK artifacts. Hosting would need a long-running JVM host (VM/container) plus a backup routine. **Not evaluated:** Datomic Pro (transactor + storage), online backup, any hosting. | Workers + D1 + Durable Objects, declared in `infra/alchemy.run.ts`. Restore drill evidence exists (Gate 3, 22 tables). Scale-to-zero and lease objects are in place. Moving the core off Cloudflare means rebuilding hosting, backup, leases, deploy and preview stages. |
| **Developer loop** | Cold full suite: 12.9–13.7 s end to end (about 5.5–6 s of it JVM + Clojure + Datomic load). In a warm REPL, a falsifier rerun took 0.29–0.42 s after the first (1.38 s), and a namespace reload 49 ms. | Workerd characterization (real D1 + DO + Worker fetch): 11.2–11.8 s wall. Pure unit tests under Bun: 1.28–1.48 s wall. |

## Findings from building it (all stacks, not only Clojure)

1. **Transitive `sameAs` can merge two same-source requisitions through a
   cross-source node** even when no link is within a source (C4c). D05 needs
   two things in any stack: an ambiguity guard in candidate generation, and a
   standing invariant query. TB-02 should carry both.
2. **Valid time and recorded time disagree in practice.** A late-arriving
   older observation must not override a newer one (F6 late arrival). Source
   timestamps can also tie (the TS fixtures keep `sistEndret` equal across a
   status change), so a tie-break rule must be declared. Here it is arrival
   order.
3. **Controls found two weak tests on their first run.** C4b passed because
   overlapping, non-partitioning clusters slipped past an id lookup. C4a
   errored instead of failing on a hard-coded id. Both tests were
   strengthened: a partition assertion, and link endpoints derived through
   the impl. A falsifier without a control seen failing is not yet evidence.
4. "Deltid with no %" maps to **Unsupported**: the source's structured schema
   cannot carry an FTE, though it states the category. "Nothing" maps to
   **Unknown**, and "feed summary only" to **TempUnknown**. Heltid → `[1.0 1.0]`
   is a declared category mapping. These are modelling choices for the D06
   field spec, recorded in `facts/derive-workload`'s docstring.

## What could not be tested

- **XTDB v2 in-process** (Clojars dependencies), and therefore native
  bitemporal SQL/XTQL, valid-time corrections and XTDB's own as-of semantics.
  XTDB as a server was not attempted.
- **Malli** (Clojars-only). `clojure.spec` was used instead.
- The **exact nixpkgs pin**: a `github:NixOS/nixpkgs/<rev>` ref is blocked
  in this session, so the toolchain comes from the registry.
- **Datomic beyond Local**: Pro topology, transactor, storage backends, online
  backup, retention or excision for lawful erasure.
- **Any hosting or HTTP surface** for the JVM path, and anything at scale.
  Only fixture-size data was measured.
- Spike omissions: hydration (TB-01 Option A), feed checkpoint and cursor,
  `closeAbsent` tail closure, the lazy gate, and D05 id minting with
  `id_aliases`. Here a vacancy's identity is its occurrence set, which is not
  stable under link changes.
- **TS implementations of the D05, D06 and as-of targets** don't exist, so
  no executed TS-vs-Clojure comparison of F4–F6 was possible. D1 support for
  `WITH RECURSIVE` is assumed from SQLite, not tested.
- `./bootstrap verify` was not run (WS-0020 G15: `nix develop` 403). This
  spike sits outside the workspace gates and makes no deployment claim.
- No live NAV or Cloudflare access was used.

## Recommendation (proposal)

**Proposal: keep further platform investment on TypeScript + Effect +
Cloudflare. Adopt the spike's model and test suite, not its runtime:**

1. Make F1–F7 here, including the 10 broken twins, the acceptance suite for
   WS-0022 (TB-01) and TB-02, as one conformance suite in the shape the owner
   already approved (`defineSourceConformance`, one twin per check).
2. In D1: an append-only, content-addressed `observations` table with
   `recorded_at` (or a monotonic recorded sequence) and `source_modified`. A
   closed-attribute `facts` table with the 7 states. `(source, externalId)`
   occurrence identity. A `same_as` link table with evidence and a method
   version, closed by `WITH RECURSIVE`, plus the within-source invariant
   query. As-of = "observations with recorded seq ≤ t", the same selection
   `store/observations` does.
3. Port the fusion function and the decision table with their fast-check
   laws, including the associativity law that caught a bug here.

Reasons, from this evidence:

- The JVM option's decisive advantage was supposed to be native
  bitemporality, which is XTDB. XTDB is not resolvable under the current
  network policy. On Datomic, valid time was hand-modelled in Clojure, the
  same work TS would need.
- What Datalog carried (recursive closure plus one invariant query, about 15
  lines) is small, and has a direct SQL analogue. Everything else in the
  spike is pure functions that port line for line, and in TS they gain
  compile-time checks. The one type bug here surfaced only at transact time.
- Leaving Cloudflare discards existing, evidenced operations (restore drill,
  leases, preview stages). Nothing measured here pays for that.
- Effect's typed error and dependency channel was a real asset in WS-0020's
  substitution design. The Clojure version has no equivalent beyond
  convention.

Tripwire to revisit: if the TS port cannot pass F4 and F6 with their controls
within one R2 WorkScope, or if the owner chooses to allow Clojars (or an XTDB
server) for a follow-up spike on native valid time, reopen the JVM question
with XTDB specifically.

**Owner decisions that landed during this spike.** These are in
`docs/internal/product/market-index-lead-handoff.md` at `7f1f009`, committed
after this spike started at `dd6fe17`. No code or fixtures changed in between,
so every measurement above still applies. Two of them bear on this proposal:

- *Minimize what we maintain: adopt > adapt > build.* Step 2 above *builds*
  immutability and history in D1, while a Datalog store would *adopt* them.
  The trade is owned code (a few hundred lines of SQL/TS plus their laws, by
  analogy with this spike's ~500 lines) against owned operations (JVM
  hosting, Datomic or XTDB backup and upgrades, a second runtime beside
  Workers). Neither side's maintenance cost was measured here. The owner
  should weigh it explicitly rather than take this proposal's default.
- *Agent writability.* Observed in this session, for one agent: the warm
  REPL loop was fast (0.3–0.4 s reruns). The only type error surfaced at
  transact time, not edit time. A property law found a real algebra bug in
  Clojure, and fast-check could do the same in TS. I needed no paren-repair
  tooling. One session is an anecdote, not a measurement.

**Strongest counter-argument.** The Clojure spike delivered all six target
behaviours in one session and about 500 lines, including D05 and D06, which
TS has not started. Recorded-time as-of (F6) cost zero code, because the store
is immutable and enforces it. In D1, immutability and history are a
discipline: one `UPDATE` in a future change silently breaks as-of, and no
store-level guarantee catches it. "Ports line for line" is a prediction, not a
measurement. If the owner's priority is that the store itself guarantees
immutable facts and time travel, rather than conventions in application code,
then this evidence favours a JVM store. That would justify asking for the
network policy change needed to try XTDB properly.

## Files

- `spikes/WS-0024-clojure/deps.edn`, plus `.gitignore` (`.cpcache/`)
- `spikes/WS-0024-clojure/src/ws24/{nav,facts,store}.clj`
- `spikes/WS-0024-clojure/test/ws24/{fixtures,falsifiers_test,laws_test,shape_test,controls,runner}.clj`
- `evidence/WS-0024/{README.md,test-run.log,controls.log,deps-tree.txt,classpath-sha256.txt}`

Not changed: `apps/`, `packages/`, `infra/`, `db/`, lockfiles, CI, fixtures,
and the memory bank. The WorkScope restricts writes to the two directories
above. The lead should update `memory-bank/activeContext.md` and `progress.md`
when gating this spike.
