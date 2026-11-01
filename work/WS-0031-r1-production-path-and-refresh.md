# WorkScope: production path and recurring NAV refresh (TB-05)

- ID: WS-0031
- Revision: 1
- Status: **Approved** (owner, 2026-11-02: "approve all"). The decisions are recorded below. Each pass still has its own human gate, and **every deploy (staging included) is run by the owner**.
- Owner: Human product owner (phibkro)
- Risk tier: **R3** (the first production deploy, production credentials, and a new scheduled writer).
- Roles: an implementer and an independent reviewer, both at the `complex-reasoning` tier. **The owner runs every production deploy and holds every production key.**
- Attempt budget: 2 per pass.

## Why

- `job-index.phibkro.org` is served by the legacy `preview` stage (`infra/alchemy.run.ts`: `domain: STAGE === "preview" ? PREVIEW_DOMAIN : undefined`).
- That stage has had no ingestion trigger since WS-0021@4, so its corpus is going stale.
- The owner's `alchemy plan` on 2026-11-01 showed that production has never been deployed (`3 to create`).
- Every feature merged since then (TB-01, the index-web client) therefore runs only in staging and in the previews.

## Outcome

`job-index.phibkro.org` is served by the **production** TypeScript stack. A bounded, scheduled NAV refresh keeps that stack current without any user traffic. The legacy `preview` stage is retired.

## Passes (in order; each passes its own gate)

| Pass | What | Gate | Prerequisite |
| --- | --- | --- | --- |
| **P1. Production secrets** (the production tier of WS-0028) | SOPS/age with tiered recipients; production secrets decrypt only on the workstation and in GitHub's protected `production` environment, never in the Claude cloud environment. `NAV_API_TOKEN` and the Alchemy state password are stored as code. | Owner: provides the public age keys, sets up the `production` environment with required reviewers, and **rotates the NAV private token** (an open item). | — |
| **P2. TB-05: scheduled refresh in staging** | A Cloudflare Cron trigger starts the event-driven ingestion loop (`decide` → commands) with bounded hydration. It runs at least once safely, leases per source, and records freshness and status per source. **No acquisition is triggered by a query.** The policy guard "no stage declares a cron" (`scripts/test_environment_safety.py`) is deliberately replaced by "only staging and production declare the approved schedule". It also **retires the read-triggered lazy gate** (RFC 0016 A2, handoff "Ingestion control flow"). Known risk: cron dispatch on staging failed before (handoff TB-05 row), so the first staging tick is the evidence. | Owner: approves the schedule and the NAV request budget. | P1 for production; staging can start without it |
| **P3. First production deploy** | `vp run deploy-production` (verify, provision, migrate, deploy, smoke) with **no custom domain**. Smoke `/api/health` and `/api/about`, then one scheduled refresh observed. Before the first apply: inventory the `job-index-production*` resources (D1 adoption by name, follow-up from the pass A review). | Owner: runs the deploy. This is the human release gate. | P1, P2 green on staging |
| **P4. Domain cutover** | Move `job-index.phibkro.org` from the `preview` stage to `production`. Record the downtime window and the rollback (re-attach the domain to `preview`). | Owner: approves the window and runs the cutover. | P3 |
| **P5. Retire the legacy `preview` stage** | Export or snapshot `job-index-preview-db` (29.7 MB) to durable storage, then `alchemy destroy --stage preview`. | Owner: approves the deletion. | P4 stable for an agreed period |

## Acceptance (whole WorkScope)

- [ ] With no user traffic, the production corpus refreshes on schedule. Evidence: per-source freshness and status before and after two scheduled runs.
- [ ] `job-index.phibkro.org` serves production. `/api/about` reports `environment: production`, and the smoke passes.
- [ ] Production secrets never touch the Claude cloud environment (shown from the recipient lists and the CI environment protection).
- [ ] The legacy stage is destroyed only after its database export is verified readable.
- [ ] `vp run verify` passes on every source revision that is deployed (`AGENTS.md`: a deploy claim is invalid otherwise).

## Exclusions

- No new sources.
- No canonical-ID change (that is TB-02).
- No change to personal or job-hunting data.
- No public API contract change beyond what already exists.
- No deletion before P5's export.

## Owner decisions (2026-11-02)

| # | Decision |
| --- | --- |
| 1 | A public production launch **proceeds on the NAV-acceptance assumption**. NAV's written answer is still tracked; if NAV declines, P4 is reverted. |
| 2 | Refresh **every 6 hours**. The hydration cap comes from the first staging measurement. |
| 3 | A **short gap** on `job-index.phibkro.org` during cutover is acceptable. |
| 4 | **P2 starts in staging now**, in parallel with P1. |

## Original questions

1. **NAV redistribution.** Planning so far assumed acceptance ("act as if NAV accepted"). Does a public **production** launch also proceed on that assumption, or does it wait for NAV's written answer?
2. **Refresh schedule and budget.** Proposed: every 6 hours, with the hydration cap N set from the first staging measurement (WS-0022 L4). Alternatives are hourly or daily.
3. **Cutover window.** Is a short gap on `job-index.phibkro.org` acceptable? The alternative is a zero-downtime swap, if Cloudflare custom domains allow one; P4 must show whether they do.
4. **Order of P1 and P2.** P2 can start in staging now, in parallel with P1. Proposed: yes.

## Rollback

- **P2:** remove the schedule; ingestion goes back to "no trigger".
- **P3:** production has no domain yet, so nothing user-facing is affected. Because of the beta.84 `exports` change, the fix is fix-forward.
- **P4:** re-attach the domain to `preview`. This is why P5 waits.
- **P5:** irreversible except through the export.
