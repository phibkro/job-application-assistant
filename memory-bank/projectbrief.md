# Project brief

> Canonical scope: [RFC 0016](../docs/internal/rfcs/0016-read-only-norwegian-market-index.md) (accepted with amendments A1–A4). The decision log is in the [lead handoff](../docs/internal/product/market-index-lead-handoff.md#lead-review-and-gate-decisions-2026-11-01). [`vision.md`](../docs/internal/product/vision.md) (Job Application Assistant) is **superseded** as the product boundary. Repository/package identifiers remain `job-index`.

## Mission

A dependable, provenance-aware, up-to-date **read-only query service for Norwegian job vacancies**, usable by people and by software (web, REST/RPC, MCP, CLI, the `job-hunting` personal client). Success means coverage, correctness, freshness, intelligibility and usable queries. It does not mean maximizing applications or engagement.

## Boundary

- **In:** permitted-source acquisition through thin adapters; append-only observations; versioned pure derivations; conservative identity; typed queries and change feeds; explicit `Fact` states (unknown ≠ full-time).
- **Out:** client-facing mutations of the corpus; application submission; CV/letter workflows; personal data in the shared corpus; arbitrary SQL.
- **Legacy:** the personal-workflow API routes and their stored data are kept, and get no new features. Their UI was retired in WS-0021@4 (recoverable at `35e93e1`). They are destined for `job-hunting`.

## Shape

TypeScript + Effect on Cloudflare Workers, D1 and Durable Objects. `effect ~4.1` (4.1.1). Design: Effect at the edge, pure core. The planned client is `apps/index-web` (Foldkit 0.170, WS-0025). See [techContext](techContext.md).
