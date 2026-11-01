# WS-0026 evidence: agent development tooling

Contract: `work/WS-0026-r1-agent-dev-tooling.md` (R1; item 4 superseded and skipped). Base `0771ed7`, branch `ws26`.

## 1. Effect language service

- Package: `@effect/language-service` **0.87.5**, pinned exactly in `devDependencies` (`bun add -d --exact`). It is the npm `latest`; its README diagnostics table has a v4 column and lists `outdatedApi` ("APIs removed or renamed in Effect v4"), so it covers effect 4.1.x. Checked against installed `effect` 4.1.1.
- Plugin: `tsconfig.json` `compilerOptions.plugins: [{ "name": "@effect/language-service" }]` plus the package `$schema`, as in the README setup section ("Inside your tsconfig.json ... plugins", monorepo advice: install and configure at the root).
- Integration method: the README's CLI, `effect-language-service diagnostics --project tsconfig.json` (section "effect-language-service diagnostics"). The README's other route, `effect-language-service patch`, rewrites `node_modules/typescript` and needs a `prepare` hook; it was not used because it mutates installed dependencies and bun's frozen install would silently drop it. The wrapper `scripts/ts/effect-diagnostics.ts` (`bun run effect:check`, wired into `check` after `typecheck`) runs the CLI with `--format json --severity error,warning`, and fails on any finding not in the registry. Suggestion-severity diagnostics are advisory and not gated. The CLI itself exits 1 on errors, 0 on warnings unless `--strict`; the wrapper makes warnings fail too.
- Cost: about 33 s added to `bun run check`.

## 2. Planted failure

Scratch file `apps/worker/src/scratch-floating.ts` (not committed):

```ts
import { Effect } from "effect";
export const planted = () => {
  Effect.log("floating");
};
```

`bun run check` with it present (exit 1; fmt, lint, imports and `tsc --noEmit` all passed first):

```text
$ bun run scripts/ts/effect-diagnostics.ts
effect-diagnostics: FAILED
  apps/worker/src/scratch-floating.ts:4:3 error effect(floatingEffect): This Effect value is neither yielded nor used in an assignment.
error: script "check" exited with code 1
```

After deleting the file, `bun run check` exited 0:

```text
effect-diagnostics: ok (5 excepted finding(s), 4 registry entries)
Test Files  80 passed (80)   Tests  664 passed | 4 skipped (668)     (Bun)
Test Files  22 passed (22)   Tests  109 passed (109)                (workerd)
```

## 3. Existing findings

264 files checked: 0 errors, 5 warnings, 64 suggestions.

- **Suggestions (not gated, not changed):** 53 `unnecessaryFailYieldableError`, 10 `effectSucceedWithVoid`, 1 `unnecessaryEffectGen`. Style hints; left alone to stay within R1.
- **Warnings (gated):** 5 `multipleEffectProvide`, registered in `tools/quality/effect-exceptions.json` as EFX-001 (`apps/worker/src/index.ts`, 2) and EFX-002..004 (three `apps/worker/src/accounts/*.test.ts`, 1 each). The tool's own message says merging the provides "can break service lifecycle behavior", and the call site in `index.ts` documents that error recovery wraps the provided effect. Fixing them changes layer construction, i.e. behavior, so they were **not fixed** and are flagged for the owner. The check fails if an entry goes stale or its count differs.

## 4. Docs and skills

- `AGENTS.md`: new "Effect for agents" and "Foldkit for agents" sections.
- Effect docs located: `node_modules/effect/AGENTS.md` and `ai-docs/` ship with 4.1.1; `LLMS.md` exists at `Effect-TS/effect-smol` `main` (HTTP 200 via raw.githubusercontent.com). `effect.website/llms.txt` was unreachable from this sandbox (proxy 403), so it is not cited. Effect repo tag `effect@4.1.1` exists (`git ls-remote`).
- Foldkit tag: `git ls-remote --tags https://github.com/foldkit/foldkit` lists `refs/tags/foldkit@0.170.0` at `a471adb24d750ab9e8d8312edad53ff6f26d961b`. A `--depth 1 --branch foldkit@0.170.0` clone returned that HEAD.
- Skills copied unmodified (`diff -r` clean) to `.claude/skills/{foldkit,generate-program,audit-program}`, the project-skill location; `.claude/skills/PROVENANCE.md` records source, tag, commit, date, license.
- `scripts/setup.sh`: guarded fetch of `repos/foldkit` at `FOLDKIT_TAG`. Exercised: absent with network (fetched), present at tag (no-op message), absent with an unreachable proxy (warning on stderr, exit 0, no directory left). `/repos/` added to `.gitignore`.
- `scripts/check_repo.py`: excludes `repos/` and `.claude/skills/` from its file walks (upstream content; it otherwise reported many broken links from the checkout and two from the skills).

## 5. Gates

- `bun run check`: exit 0. Counts: Bun 80 files / 664 passed / 4 skipped; workerd 22 files / 109 passed (unchanged).
- `python3 scripts/check_repo.py`: passed.
- `scripts/check.sh` with shellcheck 0.11.0 from `nix shell nixpkgs#shellcheck`: exit 0.

## Not done / open

- The foldkit package is not installed yet, so the tag is pinned to 0.170.0 by contract rather than read from `node_modules`; re-pin when `apps/index-web` lands.
- `bun run check` has no Foldkit-skill sync check; provenance is manual.
