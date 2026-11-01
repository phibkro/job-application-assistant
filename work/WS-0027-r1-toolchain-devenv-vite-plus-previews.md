# WorkScope: Toolchain consolidation (devenv + Vite+ + Alchemy Workers Previews)

- ID: WS-0027
- Revision: 1
- Status: **Approved** (owner gate 2026-11-01). Sequenced after WS-0026 (done) and **before** WS-0022 and WS-0025.
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: developer-environment, CI and preview-deployment changes. No runtime behavior change.
- Roles: implementer and independent reviewer at the `complex-reasoning` tier.
- Attempt budget: 2

## Outcome

One adopted toolchain replaces the owned glue. A contributor or agent runs `devenv shell`, then `vp check`, `vp test` and `vp run <task>`. A PR gets a Cloudflare **Workers Preview** provisioned by Alchemy.

## Scope

1. **devenv** (`devenv.nix`/`devenv.yaml`) declares every prerequisite: Bun, Node, Wrangler ≥ 4.135, shellcheck if still needed, sqlite3, just-free tasks. It replaces `flake.nix` and `./bootstrap`, keeping an equivalent one-line entry point documented in `AGENTS.md`. Pin versions.
2. **Vite+** at the root: `vp check` (format + lint + types) and `vp test` (Bun-hosted unit plus the workerd pool) replace the chained `bun run check` scripts. `vp run` tasks replace `justfile` recipes and shell wrappers, with caching where safe. Cite the Vite+ docs for each mapping. If a capability is missing in the beta, record it and stop. Don't paper over it with a new script.
3. **Policy gates as tasks:** each check in `scripts/check_repo.py`, `test_*.py` and `test_*.sh` that has **no** tool equivalent is ported to a small TypeScript `vp run` task, or kept unchanged if porting adds no value, with the reason recorded. Each ported gate keeps its negative control (seen failing).
4. **Previews:** Alchemy declares a Workers Preview per PR branch (Durable Object binding re-declared under previews), bound to one shared, seeded `preview` D1 migrated by Alchemy. `pr-preview.yml` becomes a thin call to Alchemy's preview deploy and its teardown. `deploy-preview.sh` and the per-PR stage scripts are deleted.
5. **Remove the dead glue:** `justfile`, shell wrappers, `bootstrap` and any Python made redundant. Keep `deploy`/`deploy-production` behavior via Alchemy stages. `CLAUDE.md`/`AGENTS.md` "Executable gates" is updated.

## Acceptance

- [ ] On a clean machine (CI), `devenv` then `vp check` and `vp test` reproduce today's counts: Bun 80/664/4 and workerd 22/109, plus the WS-0026 Effect diagnostics gate.
- [ ] Every removed gate has a listed replacement, or a recorded reason it was dropped. Every kept or ported policy gate has a negative control seen failing.
- [ ] A PR on this branch gets a Workers Preview: `GET /api/health` and `GET /api/v1/jobs?limit=1` on the preview URL return 200 with seeded data. Closing the PR tears the preview down. The evidence shows both.
- [ ] Staging and production deploy paths still run `verify`-equivalent gates first. No deploy is performed in this ticket beyond the PR Preview.
- [ ] Evidence is in `evidence/WS-0027/README.md`.

## Exclusions

No application code changes, no `infra/` Effect re-pin (separate ticket), no new runtime features.

## Rollback

Revert the commit. The old `flake.nix`, `justfile` and scripts come back.
