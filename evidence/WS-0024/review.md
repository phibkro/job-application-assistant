# WS-0024 reproducibility review (commit 450103c)

Reviewer: independent, read-only. Copy under /tmp/ws24r/a (git archive 450103c). Repo not modified by me.

## Verdict: REPRODUCES WITH NITS

The counts reproduce exactly. F2/F4/F6 tests are real and a mutation of mine failed the intended tests. One shipped
rule guard is not exercised by any test or control (finding 1). Scope and privacy are clean. No finding changes the recommendation.

## Findings

| Sev | File:line | Issue | Fix |
| --- | --- | --- | --- |
| Low | spikes/WS-0024-clojure/src/ws24/store.clj:113 | The `[(not= ?sa ?sb)]` guard in `cross-linked` ("links within one source are ignored by the rule itself", per the docstring at :108-109) is dead under the suite. I deleted it and `-M:test` still passed 17/48/0 (exit 0). No control covers it, because C4b..C4c exercise other paths and candidate links are cross-source by construction. The README's D05 claim that the rule ignores within-source links is therefore not falsified by any test. | Add a test that `link!`s two same-source occurrences and expects them to stay separate, plus a control that drops the guard. Or soften the README claim. |
| Low | evidence/WS-0024/README.md (Pinned versions row for `com.datomic/local`; Summary) | The task asked to record the Datomic Local licence. The README gives the version only. The POM at Maven Central has no `<license>` element, so the licence is not derivable from the evidence. | State the licence with a source link, or say it was not checked. |
| Info | evidence/WS-0024/README.md (Cross-cutting, LOC row) | The TS "comparable src 848" includes `schema` 61 from `packages/adapters/nav/src/schema.ts`. The other TS files are in `apps/worker/src/corpus/` and `packages/adapters/nav/src/`. Counts are right, but the paths are unstated. | Cite full paths. |
| Info | repo working tree | At the end of my review `git status` in /home/user/job-application-assistant showed `M docs/internal/product/market-index-lead-handoff.md` and `M memory-bank/activeContext.md`. It was clean before my commands. I did not touch them (my only repo commands were git read-only, cloc and one vitest run). It is probably the other agent. Not part of 450103c. | None for this spike. Flagging only. |
| Info | evidence/WS-0024/README.md R1 timing | My cold end-to-end was 14.4 s (suite 7.0 s) against the README's 12.9-13.7 s. A 5% variance. Not a discrepancy. | None. |

## Commands and results

1. `git archive 450103c | tar -x -C /tmp/ws24r/a`, then in `spikes/WS-0024-clojure`:
   `nix shell nixpkgs#clojure nixpkgs#jdk21_headless -c clojure -M:test` gave **Ran 17 tests containing 48 assertions. 0 failures, 0 errors.**
   `WS24 SUMMARY tests=17 assertions=48 fail=0 error=0 wall_ms=7026`. Wall 14.4 s. First attempt, no retry needed. **Matches the README.**
2. `... clojure -M:controls` gave exit 0, `controls=10 failed_as_intended=10`, error=0 for all. Per-control fails:
   C1 2, C2 3, C3 1, C4a 4, C4b 1, C4c 4, C5a 4, C5b 1, C6a 1, C6b 1. Wall 8.3 s. **Matches the README and controls.log.**
   The runner counts a control as passing only on `fail>0`. All 10 had error=0, so none "failed" by crashing.
3. Mutation M1, mine, not one of the 10 (in a copy at /tmp/ws24r/m): `store.clj` `before?` replaced by `true`, so the valid-time filter is ignored.
   `-M:test` exit 1, **2 failures**: `f3-inactive-entry-propagates-as-visible-closure` (falsifiers_test.clj:59, the valid-at 08:30 assertion) and
   `f6-late-arriving-older-observation-does-not-override-newer` (falsifiers_test.clj:145, the valid-at 09:30 assertion). 17 tests/48 assertions, 2 failures.
   The copy under /tmp is discarded, and nothing in the repo needed restoring.
4. Mutation M2, mine (/tmp/ws24r/m2): the `not= ?sa ?sb` guard removed gave **0 failures, exit 0**. See finding 1.
5. `git diff --stat 7f1f009 450103c`: 16 files, 1692 insertions, all `A` (added). Every path is under `spikes/WS-0024-clojure/` or `evidence/WS-0024/`.
   A filter for any other path returned nothing. **Scope confirmed.**
6. Privacy: no `fixtures/` path is in the diff (0 lines). `fixtures.clj` only reads `../../fixtures/nav/*.json` via `io/file`/`read-json`.
   A grep of src and test for spit/writer/delete found nothing. A grep of the added lines for emails, phone numbers and secrets found only sha256 jar hashes in
   classpath-sha256.txt and the word "seed". The only adverts in the fixtures and generated variants are the existing example/fixture ones ("Example Technology AS").
   **Confirmed.**

## Falsifier reading (code, not README)

- **F2** (falsifiers_test.clj:41-52): asserts `datoms-added` of the replay is zero, the view is equal and the `d/since` cursor is empty. `first-run` must add >0. Content-addressed id: an
  upsert in `observation-tx`. Control C2 (nonce in id) fails 3 assertions. It would fail if replay wrote any datom or any new observation entity. Real.
- **F4** (:81-110): asserts the partition of vacancies (`apply distinct?`), that two NAV externalIds stay split, that transitive nav~board~ats yields exactly the 3-set, that the
  ambiguous candidate stays alone, and that the within-source-merge invariant query is empty. The expected values are literal, and C4a/b/c each failed. Real, with the gap in finding 1.
- **F6** (:127-148): `at-t1` is captured before later ingests, and the test requires `not= at-t1 present` (so it is not trivially vacuous) and `= at-t1 (view {:recorded-t t1})`.
  The late-arrival test uses the INACTIVE@10:00-then-ACTIVE@09:00 order. C6a/C6b fail them. M1 also broke the late-arrival valid-at assertion. Real.

## Claims checked (5 of the README's)

| # | Claim | Status | Evidence |
| --- | --- | --- | --- |
| 1 | XTDB 2.x core depends on Clojars-only artifacts; Clojars blocked | **Confirmed (partly)** | Maven Central returns 404 for `integrant/integrant/1.0.1`. The `xtdb-core-2.2.0.pom` lists integrant, ring-core, ring-jetty9-adapter, reitit-ring and hato. `repo.clojars.org:443` was refused by the proxy. Central returned 429 for `ring-core` 1.15.3 on my probe, so that 404 is **unverified**. I did not re-run `clojure -P`. |
| 2 | Datomic Local 1.0.301, latest on Central (2026-07-15) | **Confirmed for version/date** (maven-metadata: latest/release 1.0.301, lastUpdated 20260715). **Licence: unverifiable.** The README states none, and the POM has no licence element. |
| 3 | LOC: src 498 (store 231, facts 180, nav 87), tests 391; TS 848 code + 401 comment (decode 182, decide 161, rows 108, identity 106, close 83, sql 79, observe 68, schema 61) | **Confirmed** | cloc 2.10: Clojure total 889 = 498 + 391. Per file 231/180/87. TS per file 182/161/108/106/83/79/68/61 sum to 848. The comment total of 401 was not summed. "WS-0020 test 427" not checked. |
| 4 | Dev loop: cold suite 12.9-13.7 s, vitest unit tests 1.28-1.48 s | **Confirmed** | My Clojure run was 14.4 s wall (suite 7.0 s), within noise. Bun vitest, 29/29 passed, wall 1.42 s, duration 1.03 s. The workerd run (T1) and the warm REPL figures were not rerun. |
| 5 | TS comparison citations: `deriveCanonicalKey` is a 3-field join; `decideObservation` has 5 branches; the `closeAbsent` sweep | **Confirmed** | identity.ts:128 joins normalized title, employerName and location. decide.ts:85 `decideObservation` returns CreatedCanonical, ReopenedCanonical, AddedDuplicateOccurrence, UpdatedCanonical and Unchanged. close.ts:33 documents `closeAbsent`. The README cites the paths loosely (finding 3). |

## Could not verify

- XTDB end to end (Clojars blocked), the 429-limited Central probes, and the exact nixpkgs rev pin. My `nixpkgs#` followed the registry, so my toolchain may differ from the author's; counts matched anyway.
- Datomic Local licence terms.
- T1 workerd run, R4 (200 trials, seeds 1/42), R5 warm REPL timings, and R6 backup. Not rerun, to stay within the time-box.
- "WS-0020 test 427" and the TS comment total 401.
- Whether D1 supports `WITH RECURSIVE` (the README says untested, and so do I).
