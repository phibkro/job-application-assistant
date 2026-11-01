# WorkScope: Agent development tooling for back end and front end

- ID: WS-0026
- Revision: 1
- Status: **Approved** (owner decision 2026-11-01). Starts after WS-0021@3 lands, because it edits the `tsconfig` that r3 restructures.
- Owner: Human product owner (phibkro)
- Risk tier: **R1**: tooling configuration and documentation. No runtime change.
- Roles: implementer at the `general` tier; reviewer at the `general` tier.
- Attempt budget: 2

## Outcome

Agents writing this repo get earlier, more precise feedback and authoritative guidance:

1. **`@effect/language-service`** is configured as a TypeScript plugin for the root workspace, on the Effect `~4.1` line. Its diagnostics (floating or never-yielded effects, missing context, and similar) are surfaced by `bun run check` and fail it, using the service's documented CLI or `tsc` integration. The implementer pins the version and cites the docs.
2. **`AGENTS.md`** gains a short "Effect for agents" section. It points to Effect's `LLMS.md` / `llms.txt` for the pinned line, states the v3-vs-v4 confusion risk (e.g. `Effect.catchAll` vs `Effect.catch`), and says to read `node_modules/effect/src` rather than write APIs from memory.
3. **A Foldkit agent guide** at `apps/web/AGENTS.md` (or `docs/internal/architecture/foldkit-agent-guide.md`), written from the installed foldkit 0.139.0 source and docs. It covers the one-model/one-update/commands rules, the update-tuple contract for 0.139, the `@foldkit/ui` and `cn` conventions, and the Tailwind setup. Each rule cites its source file. It also states that the island is frozen (no new UI work) and says the 0.170 contract differs.

## Acceptance

- [ ] A deliberately planted floating `Effect` in a scratch file makes `bun run check` fail, and removing it passes. Neither change is committed; the evidence shows the run.
- [ ] Existing code passes the new diagnostics, or each finding is listed in an exceptions registry with a reason and a retirement trigger (the owner's `effect-exceptions.json` pattern). No code changes beyond what a finding strictly needs; behavior-affecting findings stop the ticket.
- [ ] `bun run check` and `python3 scripts/check_repo.py` pass; counts are unchanged.
- [ ] Evidence is in `evidence/WS-0026/README.md`.

## Exclusions

No new lint rules beyond the language service (`oxlint-plugin-immutable` arrives with WS-0022's new pure modules), no web code changes, no dependency upgrades other than adding the language service.
