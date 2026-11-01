# Technical context

| Concern | Choice |
| --- | --- |
| Language/runtime | TypeScript 5, Bun (package manager, test runner) |
| Effects/schema/API | `effect ~4.1.0`, resolved **4.1.1**, across the root workspace (WS-0021@4). `infra/` stays on rc.108 (separate ticket). `HttpApi` in `apps/worker/src/Api.ts` |
| Runtime | Cloudflare Workers + D1 + Durable Objects (`SourceLeaseObject`); Alchemy v2 (`infra/alchemy.run.ts`) |
| Client | **None yet.** The Worker serves `dev/static-placeholder/`. The legacy `apps/web` UI was retired in WS-0021@4 (recoverable at `35e93e1`; `/apps/web/` is git-ignored for leftovers). **Planned:** `apps/index-web` (Foldkit 0.170, `@foldkit/ui`, Tailwind, better-auth anonymous accounts; WS-0025) |
| Quality | oxfmt, oxlint, vitest, fast-check, Playwright + Axe; `@effect/language-service` 0.87.5 in `bun run check` via `effect:check`; exceptions in `tools/quality/effect-exceptions.json` (WS-0026) |
| Agent docs | `AGENTS.md` ("Effect for agents", "Foldkit for agents"); Foldkit skills in `.claude/skills/` with a git-ignored `repos/foldkit` checkout pinned to `foldkit@0.170.0` by `scripts/setup.sh` (WS-0026) |

## Layout

```text
apps/worker/       routes, ingestion, corpus, db (Effect at the edge)
dev/static-placeholder/  served until apps/index-web exists
apps/index-web/    planned market-index client (WS-0025)
packages/domain/   canonical identity, Fact/IR, pure passes
packages/adapters/ source importers (NAV live; JSON-LD fixture-only)
infra/             Alchemy declaration; db/ generated schema + catalog seed
```

## Facts to keep straight

- Only NAV is live. No stage declares a cron (`infra/alchemy.run.ts`, `CRONS = []`).
- The only deployed trigger today is the read-armed lazy gate on `/api/v1/me/feed`. It is path-based and arms even on 401 (WS-0020 T6). Since the legacy UI was retired it has **no caller** (verified in the WS-0021@4 review §8), so the deployed corpus does not refresh until TB-05 replaces the gate with the event loop.
- `GET /api/v1/jobs/:id` fetches NAV detail and writes D1 (WS-0020 T5), a recorded deviation until TB-01's bounded hydration.

Commands: `CLAUDE.md` § Executable gates.
