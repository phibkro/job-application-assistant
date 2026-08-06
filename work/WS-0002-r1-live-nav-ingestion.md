# WS-0002@1: Live NAV incremental ingestion

- Status: Executing
- Risk tier: R2 — external integration and persistent source state
- Governing RFC: RFC 0005 (Implementing)
- Owner: Human product owner
- Implementer: GPT-5.6 Thinking under human-approved scope
- Independent reviewer: Unassigned

## Problem

The corpus is currently fixture-only. It proves internal semantics but cannot demonstrate fresh Norwegian vacancies, operational cursor reuse, or source-driven closure and reopening.

## Observable outcome

A deployed Worker can incrementally synchronize the official NAV vacancy feed into D1. Repeated synchronization processes only new or changed source records, retains provenance, records source freshness, and correctly represents active, closed, and reopened vacancies.

## In scope

- Official NAV feed connector.
- D1-backed source cursor and conditional-request state.
- Bounded manual staging sync.
- Scheduled Worker sync using the same application function.
- Created, updated, unchanged, closed, and reopened transitions.
- Source status and collection-run reporting.
- Deterministic captured fixtures for parsing and state-transition tests.
- Visible corresponding-source configuration requirement for AGPL deployments.

## Out of scope

- Any second live job platform.
- Saved searches or applicant profiles.
- Notifications or digests.
- Fuzzy deduplication.
- R2 raw archive, Queues, Workflows, Durable Objects, or Vectorize.
- Production browser mutation controls beyond the explicit sync capability.

## Acceptance criteria

1. A clean staging D1 sync imports real NAV vacancies through the official source interface.
2. The stored source cursor advances only after a successful page commit.
3. Replaying the same page produces zero new canonical changes.
4. A changed listing produces one canonical update and preserves its source occurrence identity.
5. An inactive observation deactivates the occurrence; the canonical job closes only when all occurrences are inactive.
6. A later active observation reopens the canonical job with one `reopened` change.
7. A parser or persistence failure leaves the prior cursor available for safe retry.
8. Manual and scheduled triggers execute the same bounded application function.
9. Source status exposes last attempt, last success, cursor presence, failure count, and sanitized error state.
10. `just fix`, `just verify`, local D1 smoke tests, and staging sync evidence pass.
11. Public deployment documentation records a source-code URL matching the deployed revision.

## Required evidence

- Accepted RFC 0005.
- Exact source API/usage reference.
- D1 migration output.
- Parser fixture snapshots.
- Transition test output for create/update/close/reopen/retry.
- Local scheduled-handler smoke output.
- Staging collection report with redacted operational metadata.
- Before/after corpus counts and cursor evidence.
- AGPL source-link verification.

## Required capabilities

- Read the official NAV feed documentation and source endpoint.
- Make outbound HTTPS requests from local/staging Worker environments.
- Modify and migrate isolated staging D1.
- Configure a staging-only administrative sync capability and schedule.
- No applicant data, email, browser automation, or unrelated Cloudflare resources.

## Termination conditions

Stop and return to RFC/design review when:

- NAV usage terms do not permit the intended storage or display.
- The feed cannot provide stable incremental or status semantics.
- One bounded Worker execution cannot safely process a page.
- Correct cursor advancement cannot be atomic with corpus changes.
- The scope would require a second runtime such as Queues or Workflows.
