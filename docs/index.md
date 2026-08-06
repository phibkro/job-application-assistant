# Documentation map

The repository uses progressive disclosure: start with the smallest document that answers the question, then follow links to deeper material.

## Five-minute orientation

- [Product vision](internal/product/vision.md)
- [Prototype architecture](internal/architecture/mvp.md)
- [ADLC overview](internal/lifecycle/adlc.md)
- [Quality assurance strategy](internal/lifecycle/quality-assurance.md)
- [Current project state](../memory-bank/activeContext.md)

## Public documentation: Diátaxis

Public-facing material is classified by user need:

| Need | Section | Purpose |
|---|---|---|
| Learning | [Tutorials](public/tutorials/) | Guided first success |
| Accomplishing | [How-to guides](public/how-to/) | Task-focused procedures |
| Looking up | [Reference](public/reference/) | Exact interfaces and schemas |
| Understanding | [Explanation](public/explanation/) | Concepts, trade-offs, and rationale |

A page should primarily serve one quadrant. Mixed pages should be split rather than labelled ambiguously.

## Internal engineering documentation

- [Architecture](internal/architecture/)
- [Lifecycle and governance](internal/lifecycle/)
- [Research](internal/research/)
- [Requests for Comments](internal/rfcs/)
  - [RFC process](internal/rfcs/README.md)
  - [Current runtime decision: RFC 0004](internal/rfcs/0004-cloudflare-d1-first-rust-mvp.md)
  - [Live NAV ingestion: RFC 0005](internal/rfcs/0005-live-nav-incremental-ingestion.md)
  - [Incremental saved searches: RFC 0006](internal/rfcs/0006-incremental-saved-searches.md)
  - [Reliable ingestion control: RFC 0007](internal/rfcs/0007-reliable-ingestion-control.md)
  - [Production-safe QA boundaries: RFC 0008](internal/rfcs/0008-production-safe-qa-boundaries.md)
  - [Corpus maintenance: RFC 0009](internal/rfcs/0009-corpus-integrity-and-bounded-maintenance.md)
  - [Production read API: RFC 0010](internal/rfcs/0010-versioned-production-read-api.md)
  - [Principal security: RFC 0011](internal/rfcs/0011-principal-and-administrative-security-boundary.md)
  - [Owned searches: RFC 0012](internal/rfcs/0012-owned-saved-searches.md)
  - [Webhook outbox: RFC 0013](internal/rfcs/0013-transactional-webhook-outbox.md)
  - [Production qualification: RFC 0014](internal/rfcs/0014-production-qualification-gates.md)

## Agent context

The six files under [`memory-bank/`](../memory-bank/) provide the small, always-read context set. They link to internal documents for detail.

## Machine-readable policy

- [`policy/lifecycle.json`](../policy/lifecycle.json)
- [`policy/risk-tiers.json`](../policy/risk-tiers.json)
- [`policy/authority.json`](../policy/authority.json)

## Templates and evidence

- [Work-scope template](../templates/work-scope.md)
- [Execution-plan template](../templates/execution-plan.md)
- [Evidence-bundle template](../templates/evidence-bundle.md)
- [RFC template](../templates/rfc.md)
- [Postmortem template](../templates/postmortem.md)

## Public how-to additions

- [Configure NAV authentication](public/how-to/configure-nav-auth.md)
- [Operate NAV ingestion](public/how-to/operate-nav-ingestion.md)

## Public reference additions

- [Licensing and network-source obligations](public/reference/licensing.md)

- [Incremental saved-search explanation](public/explanation/incremental-saved-searches.md)

## Production documentation additions

- [API v1](public/reference/api-v1.md)
- [Manage principals](public/how-to/manage-principals.md)
- [Corpus maintenance](public/how-to/corpus-maintenance.md)
- [Webhook delivery](public/how-to/webhooks.md)
- [Production qualification](public/how-to/production-qualification.md)
- [Production release checklist](internal/lifecycle/production-release-checklist.md)
