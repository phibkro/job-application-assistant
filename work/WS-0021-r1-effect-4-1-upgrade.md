# WorkScope: Upgrade Effect from 4.0.0-rc.108 to 4.1.0

- ID: WS-0021
- Revision: 1
- Status: **Superseded by [WS-0021@2](WS-0021-r2-effect-4-1-and-foldkit.md).** Execution stopped correctly at its stop condition: foldkit 0.139.0 is incompatible with effect 4.1.0, and the characterization test imports moved modules. Nothing was committed.
- Owner: Human product owner (phibkro)
- Risk tier: **R2**: a dependency change (`policy/risk-tiers.json`). It requires plan review, independent review, a rollback plan and provenance, plus the human gates `scope` and `acceptance_or_integration`.
- Repository/ref: `phibkro/job-application-assistant`, branch `claude/clever-heisenberg-lwui1b`, starting after WS-0020's independent review is recorded. The implementer pins the exact starting commit.
- Roles: the implementer works at the `complex-reasoning` tier, and a separate independent reviewer works at the `complex-reasoning` tier (`AGENTS.md`, "Delegation capability tiers").
- Attempt budget: 2

## Goal

Align this repository with the Effect version used across the owner's other Effect v4 repositories (`effect` 4.1.0, stable) **before** the market-index IR is built on Effect Schema. Building the IR on the RC and upgrading later would rework fresh code.

## User or system outcome

Nothing changes for users, API clients or stored data. The workspace builds, typechecks and passes the same tests on `effect@4.1.0`.

## Acceptance criteria

- [ ] Both `effect` pins (root `package.json` and `packages/better-auth-effect-adapter/package.json`) are exactly `4.1.0`, and `bun.lock` is regenerated from them. No other dependency changes unless 4.1.0 forces one; any such change is listed with its reason.
- [ ] Every source change is the minimum needed to compile and keep semantics under 4.1.0. Each change is listed with the API it replaces and a citation to the 4.1.0 source in `node_modules/effect/src` or its changelog. Do not write Effect APIs from memory.
- [ ] `bun run check` passes, including format, lint, imports, typecheck, schema/catalog drift, bundle and both coverage runs (Bun + workerd). The WS-0020 characterization test (`apps/worker/src/handlers/navToClient.live.test.ts`) passes unchanged, since it is the behavior safety net.
- [ ] Test counts before and after are recorded. Any test whose assertion had to change is listed with its justification; a changed assertion counts as a behavior change and blocks acceptance unless the owner accepts it.
- [ ] `python3 scripts/check_repo.py` passes.
- [ ] `memory-bank/techContext.md` and `activeContext.md` state the new pin. This also corrects WS-0020 gap G16 for the version line.
- [ ] Evidence is in `evidence/WS-0021/README.md`: pinned commits, commands, before/after counts, the list of API changes, and the environment limits (`nix develop` is unavailable in cloud sessions; proxy 403).

## Exclusions

- No behavior, schema, migration, route, canonical-ID or `infra/` changes.
- No adoption of new Effect features or idioms beyond what compilation requires.
- No other dependency upgrades, and no IR or market-index work.

## Constraints and invariants

- Rollback is reverting the single commit, because the lockfile and source move together.
- If 4.1.0 forces a semantic change (e.g. different error or Schema decoding behavior visible in a test), stop and report it rather than adapting tests to pass.
- No deployment. Staging and production evidence are out of scope.

## Required capabilities

Local install from the package registry (`bun install`), local tests, and edits limited to dependency manifests, the lockfile, the minimal source changes, memory-bank version lines and evidence. A reviewable commit on the branch. No credentials, deploys or external sources.

## Supersedes

None.
