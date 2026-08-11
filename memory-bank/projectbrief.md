# Project brief

> **Working product name:** Job Application Assistant. Repository and package identifiers remain `job-index`.
>
> The approved mission and full MVP boundary are canonical in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md). This brief keeps the orientation short rather than duplicating that record.

## Mission

Assist a person through the full job-application process: discover suitable work, understand why it matches, retain reusable profile facts, organize the search, and reduce repetitive application entry while keeping the person in control.

## MVP in brief

- Discover permitted job sources and canonicalize vacancies with provenance.
- Match vacancies against credentials, preferences, and constraints.
- Store reusable structured worker-profile facts and common application answers.
- Save, dismiss, prioritize, and track jobs and applications.
- Prepare repetitive application entry for human review; do not submit autonomously.

In-app CV and application-letter writing are outside the MVP. ATS-friendly document assistance and Cloudflare Agents SDK/browser/computer-control support are future candidates, not committed architecture; consequential submission always needs explicit human approval. See the [canonical vision](../docs/internal/product/vision.md).

## Current shape

**Implemented source.** `apps/worker/` is a TypeScript/Effect v4 Cloudflare Worker over D1. `packages/domain/` owns canonical identity, normalization, and matching; `apps/web/` is the interface. `infra/alchemy.run.ts` declares that TypeScript Worker for every Alchemy stage. The generated schema snapshot (`db/schema.sql`) and researched source-catalog seed (`db/catalog-seed.sql`) have generator/check commands (`schema:check`, `catalog:check`). Only NAV is currently registered as an ingestion adapter.

**Deployment evidence.** Source declarations are not deployment proof. Staging evidence is stale, and production qualification is not established for the current TypeScript service. Administrative routes and generated OpenAPI coverage remain gaps; see [`memory-bank/progress.md`](progress.md).

**Stabilization status.** Scheduled ingestion now selects the Feed tier implemented by this deployment, and production declares only its NAV ingestion cron. `apps/worker/src/ingestion/scheduled.test.ts` guards target selection. Deployment evidence still must establish that this source is what runs remotely.

## Success condition

A person can use one workspace to discover and understand matching jobs, retain reusable application facts, organize search and application state, and prepare repetitive entry under human control. The canonical corpus remains an enabling subsystem, not the product boundary.

Current architecture: [`docs/internal/architecture/effect-module-map.md`](../docs/internal/architecture/effect-module-map.md)
Original prototype design (historical): [`docs/internal/architecture/mvp.md`](../docs/internal/architecture/mvp.md)
