# WorkScope: Characterize the existing NAV-to-client market-index path

- ID: WS-0020
- Revision: 1
- Status: **Proposed — not approved for execution**
- Owner: Human product owner
- Risk tier: R1 (characterization and tests; elevate before API/schema/production changes)
- Repository/ref: `phibkro/job-application-assistant` / `main`; agent must pin the exact starting commit
- Attempt budget: 2 bounded implementation attempts; stop and report unresolved failures

## Goal

Establish an evidence-backed baseline for the proposed [read-only Norwegian market index](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md). Prove which parts of registry → acquisition → ingestion → storage → derivation → query → web/API currently work, and where the proposed boundary disagrees with deployed/implemented behavior.

## User or system outcome

An engineer can run a deterministic, end-to-end NAV→D1→API/client journey, demonstrate replay idempotence and source provenance, and produce a small gap inventory that grounds subsequent tracer Tickets. This is an existing-behavior characterization, not a product rewrite.

## Acceptance criteria

- [ ] Record exact checked-out commit and current pinned runtime/dependency versions; distinguish source, local-test, staging and production evidence.
- [ ] Locate actual source-registry, NAV adapter, acquisition dispatch, ingestion checkpoint, observation/canonical storage, query API, and UI code. Produce a concise mapping with file paths and observed behavior.
- [ ] Run a minimal integrated Worker+D1 path with deterministic source fixture from acquisition to query result; demonstrate the source reference in returned data or explicitly document a verified deficiency.
- [ ] Assert that replaying the same source observation does not create a second semantic vacancy change.
- [ ] Exercise one modification/closure if existing fixture infrastructure permits; characterize the observed resulting view/change behavior, without changing semantics to make it pass.
- [ ] Record dedup risk: same employer/title/location may refer to two requisitions; show current semantics in a focused unit test or report the missing fixture.
- [ ] Record how lazy ingestion is activated in current runtime, what operator-independent scheduling exists, and what current stage evidence actually proves.
- [ ] Identify public API operations and private/application data that conflict with the proposed read-only product boundary; do not delete or expose them.
- [ ] Publish a concise gap report and proposed next bounded Ticket (TB-01: workload filtering) linked to the evidence.
- [ ] Run relevant repository verification, record commands and outcomes, and request human gate review.

## Exclusions

- No new external source, no FINN automation, no profile/application code removal.
- No schema or canonical-ID migration, API route removal, production deployment, scheduler change, new technology or new architecture framework.
- No changes to source-policy interpretation or retention rules.

## Constraints and invariants

- Reuse current Effect TS/Cloudflare Worker/D1 test harness and fixtures.
- Preserve all existing public and private behavior; characterize rather than refactor.
- Do not infer a current production deployment from the presence of IaC or historical memory-bank claims.
- Do not include personal CVs, credentials, contact details or private communications in checked-in test evidence.
- A failure is an outcome to document, not permission to expand scope.

## Required capabilities

Read source/tests; run local deterministic tests and preview; write characterization tests and documentation in a feature branch; create a reviewable PR. Production access, deployed resources, external source polling beyond existing permitted fixtures and destructive operations are not granted.

## Required evidence

Exact commit; executed commands, test logs and any new fixture/test paths; source-to-client map; gap table; explicit production-evidence status; next Ticket candidate. Independent reviewer should be able to reproduce local behavior.

## Supersedes

None. Guided by proposed RFC 0016 only **after owner approval**; existing accepted decisions remain in force until then.
