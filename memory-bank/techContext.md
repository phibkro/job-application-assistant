# Technical context

| Concern | Choice |
| --- | --- |
| Language/runtime | TypeScript 5, Bun (package manager, test runner) |
| Effects/schema/API | **Current:** `effect 4.0.0-rc.108`. **WS-0021@4 (in progress):** root workspace to `~4.1`. `infra/` stays on rc.108 (separate ticket). `HttpApi` in `apps/worker/src/Api.ts` |
| Runtime | Cloudflare Workers + D1 + Durable Objects (`SourceLeaseObject`); Alchemy v2 (`infra/alchemy.run.ts`) |
| Client | **Current:** legacy `apps/web` (Foldkit 0.139), being retired by WS-0021@4. **Planned:** `apps/index-web` (Foldkit 0.170, `@foldkit/ui`, Tailwind, better-auth anonymous accounts; WS-0025) |
| Quality | oxfmt, oxlint, vitest, fast-check, Playwright + Axe; `@effect/language-service` planned (WS-0026) |
| Agent docs | `AGENTS.md`; planned: Effect `LLMS.md` pointer and Foldkit skills with a git-ignored pinned checkout (WS-0026) |

## Layout

```text
apps/worker/       routes, ingestion, corpus, db (Effect at the edge)
apps/web/          legacy Foldkit 0.139 UI (being retired, WS-0021@4)
apps/index-web/    planned market-index client (WS-0025)
packages/domain/   canonical identity, Fact/IR, pure passes
packages/adapters/ source importers (NAV live; JSON-LD fixture-only)
infra/             Alchemy declaration; db/ generated schema + catalog seed
```

## Facts to keep straight

- Only NAV is live. No stage declares a cron (`infra/alchemy.run.ts`, `CRONS = []`).
- The only deployed trigger today is the read-armed lazy gate on `/api/v1/me/feed`. It is path-based and arms even on 401 (WS-0020 T6). Once the legacy UI is retired it has **no caller**, so the deployed corpus will not refresh until TB-05 replaces the gate with the event loop.
- `GET /api/v1/jobs/:id` fetches NAV detail and writes D1 (WS-0020 T5), a recorded deviation until TB-01's bounded hydration.

Commands: `CLAUDE.md` § Executable gates.
