# WorkScope: Toolchain consolidation r2 (devenv + Vite+, tests on Vitest 4)

- ID: WS-0027
- Revision: 2
- Status: **Approved** (owner decisions 2026-11-01 on the r1 stop report)
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: developer-environment and CI tooling. No runtime behavior change.
- Roles: implementer and independent reviewer at the `complex-reasoning` tier.
- Attempt budget: 2
- Supersedes: [WS-0027@1](WS-0027-r1-toolchain-devenv-vite-plus-previews.md). Previews move to [WS-0029](WS-0029-r1-infra-alchemy-previews.md).

## Owner decisions in this revision

- **Tests stay on Vitest 4**, run as `vp run` tasks that invoke the existing suites unchanged (Bun-hosted unit suite and the workerd pool). The reason is recorded: Vite+ 1.x bundles Vitest 5, while `@cloudflare/vitest-pool-workers` (≤ 0.23.0) and `@better-auth/test-utils@1.6.26` require Vitest 4. Revisit when the pool supports Vitest 5. The better-auth 1.7 upgrade is a separate optional ticket.
- **Previews are out of scope here** (WS-0029, after an `infra/` Alchemy and Effect upgrade). `pr-preview.yml` and `deploy-preview.sh` stay until WS-0029 replaces them.

## Scope

1. **devenv** declares prerequisite tooling and replaces `flake.nix` + `./bootstrap`, keeping one documented entry point. Pin versions.
2. **Vite+**: `vp check` is configured to today's scope (format and lint over `packages apps`, plus types and the Effect diagnostics gate). A formatter or linter version bump that reformats files is allowed, but only as a separate, formatting-only commit with no code changes. `vp run` tasks replace the `justfile` recipes and shell wrappers, including `test` (both Vitest 4 suites), `coverage`, `schema:check`, `catalog:check`, `bundle:check` and the preview/deploy entry points (which still call the existing deploy scripts until WS-0029).
3. **Policy gates as tasks:** each check in `scripts/check_repo.py`, `test_*.py` and `test_*.sh` with no tool equivalent is ported to a TypeScript `vp run` task, or kept with a recorded reason. Each keeps a negative control seen failing.
4. **Remove only the glue that is replaced**, with a gate-to-replacement table. Nothing the deploy or preview paths still need is removed.

## Acceptance

- [ ] `vp check` and `vp run test` reproduce Bun 80/664/4, workerd 22/109 and `effect-diagnostics: ok (5 excepted…)`. Checked by exit code, not by piped output.
- [ ] Gate-to-replacement table complete; every ported gate's negative control is seen failing.
- [ ] **devenv is proven in CI**: the cloud sandbox can't evaluate it (proxy 403 on GitHub-pinned inputs). A PR's CI must run `devenv` then `vp check` and `vp run test` green. Opening that PR also triggers the existing `pr-preview.yml` preview deploy.
- [ ] Staging and production deploy paths still run the verify-equivalent gates first.
- [ ] Evidence is in `evidence/WS-0027/README.md` (r2 section).

## Exclusions

No application code or test changes, no Vitest 5, no better-auth upgrade, no `infra/` changes, no Previews.
