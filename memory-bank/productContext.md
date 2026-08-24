# Product context

> **Working product name:** Job Application Assistant (`job-index` remains the repository/package identifier).
>
> The approved mission, MVP boundary, and human-control rule are canonical in [`docs/internal/product/vision.md`](../docs/internal/product/vision.md).

Job seekers repeatedly encounter duplicated and stale listings across fragmented platforms. Job Application Assistant assists the full job-application process, not discovery alone: it helps a person find suitable work, understand why it matches, retain reusable profile facts and common answers, organize search and application state, and reduce repetitive application entry.

The user should be able to ask: “What genuinely new or changed opportunities match me since my last check?” The workspace should then support saving, dismissing, prioritizing, tracking, and preparing an application while leaving review and consequential approval with the person.

## MVP boundary

**Included:** permitted-source discovery and canonicalization; matching against credentials, preferences, and constraints; reusable structured worker-profile facts and common application answers; job/application save, dismiss, prioritization, and tracking; preparation for repetitive application entry.

**Outside MVP:** in-app CV writing, in-app application-letter writing, autonomous submission, and automation against unresolved source policy. ATS-friendly document assistance and Cloudflare Agents SDK/browser/computer-control support are future candidates, not committed architecture. The full boundary is maintained once in the [product vision](../docs/internal/product/vision.md).

## Current product posture

The source implements the canonical corpus and browse/save/draft/apply workspace, with TypeScript/Effect Worker infrastructure declared for every Alchemy stage. Scheduled ingestion selects the implemented Feed tier, and production declares only the NAV ingestion cron. A deterministic 50,000-row query-plan and local backup/restore gate covers current schema and owner-scoped workspace state. This is local evidence only: current staging, production, administrative-route, and generated OpenAPI evidence remains open.

Core explanation: [`docs/public/explanation/canonical-corpus.md`](../docs/public/explanation/canonical-corpus.md)
