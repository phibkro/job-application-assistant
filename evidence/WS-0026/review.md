# WS-0026 review: commit b6e7000 (parent 0771ed7), branch ws26

**Verdict: ACCEPT WITH NITS**

No blocking findings. The gate fails on planted errors and passes clean. The skills are byte-identical to upstream. Counts match the contract. The nits are below.

## Findings

| # | Sev | Finding |
|---|-----|---------|
| N1 | nit | `check_repo.py` exclusion is broader than needed. `ours()` drops any path with a component named `repos`, at any depth, so `docs/repos/a.md` with a broken link passes. It also drops all of `.claude/skills/`, which hides the repo-owned `PROVENANCE.md` and any future repo-owned skill. I verified both with planted broken links (item 6). Suggested fix: anchor to `parts[0]=="repos"` and exempt `.claude/skills/PROVENANCE.md`. |
| N2 | nit | EFX-002..004 say that merging the provides "changes layer construction ... not a behavior-free edit". That is weakly supported. `Effect.provide(layer), Effect.provide(fakeDatabaseLayer)` is a dependency chain (the service layer needs the DB), not two siblings. A single-array merge would not type-check. `Layer.provide(layer, db)` is probably behavior-equivalent in tests. The honest reason is "needs a chain-style fix and a decision", not "behavior change". The retirement trigger ("a WorkScope that owns the accounts tests") is the vaguest one, with no concrete event. |
| N3 | nit | EFX-001 cites the `catchDefect` recovery boundary. That applies only to `runLazyIngestion` (index.ts:172-173). The `scheduled` handler (index.ts:225) has no `catchDefect`. The count of 2 is right, but the reason is only exact for one of the two sites. The "TB-05 replaces the lazy gate" trigger is concrete for the first site and does not clearly cover the scheduled handler. |
| N4 | nit | The README says `bun run check` needs only the listed steps. In a bare `git archive` copy, `imports:check` fails ("not a git repository"). This is pre-existing and not caused by this commit. I needed `git init && git add -A && commit` in the scratch copy. |
| N5 | info | The "about 33 s added" cost and the `--strict` / exit-code claims were not independently timed or verified. |

## Verification

1. **Confinement.** PASS.
   - `git diff --stat 0771ed7 b6e7000` has 24 files. Nothing is under `apps/worker/src` or `packages/*/src`.
   - Files touched:
     - Skills and `PROVENANCE.md`.
     - `.gitignore` (+`/repos/`), `AGENTS.md`, `bun.lock`, `package.json`, `tsconfig.json`.
     - `scripts/setup.sh`, `scripts/check_repo.py`, `scripts/ts/effect-diagnostics.ts`.
     - `tools/quality/effect-exceptions.json`.
     - Three memory-bank files and `evidence/WS-0026/README.md`.
   - `package.json` changes: the new `effect:check` script, its wiring into `check`, and one devDependency. No other dependency changed in `bun.lock`.

2. **Gate is real.** PASS. This ran in `/tmp/r26/src` from `git archive b6e7000` plus `bun install --frozen-lockfile`, with a throwaway git repo for `imports:check`.
   - Planted `apps/worker/src/x.ts` containing a bare `Effect.log("x")`.
     - `bun run check` exited 1. fmt, lint, imports and tsc passed first.
     - Failure: `effect-diagnostics: FAILED  apps/worker/src/x.ts:3:3 error effect(floatingEffect): This Effect value is neither yielded nor used in an assignment.`
   - Removed it. `bun run check` exited 0 with `effect-diagnostics: ok (5 excepted finding(s), 4 registry entries)`.
   - New `y.ts` with `Effect.provide(a), Effect.provide(b)` (not in the registry) failed: `y.ts:4:35 warning effect(multipleEffectProvide)`.
   - EFX-001 `count` 2 changed to 3 failed: `expected 3 ... found 2`.
   - EFX-004 file changed to a nonexistent path failed with both `stale exception, no multipleEffectProvide finding ... remove it` and the real `profiles.test.ts:19:33` warning surfacing as unregistered.
   - Registry restored afterward.

3. **Exceptions.** Partially honest. See N2 and N3.
   - The five findings are real: index.ts:172-173 and :225 (2 in index.ts), and one each at accounts.test.ts:16, index.test.ts:24 and profiles.test.ts:19.
   - Not fixing them is consistent with the contract ("behavior-affecting findings stop the ticket"). Fixing is probably low-risk for the tests, but it is not a no-op edit.
   - Retirement triggers: EFX-001 is concrete (TB-05, owner decision). EFX-002..004 are loosely worded.

4. **Versions.** PASS.
   - `package.json` and `bun.lock` pin `"@effect/language-service": "0.87.5"` (exact, no caret). The installed `package.json` version is 0.87.5.
   - The README diagnostics table has a v4 column and says: "outdatedApi ... Detects usage of APIs that have been removed or renamed in Effect v4" (`node_modules/@effect/language-service/README.md` line 71; table header at line 55).
   - The project uses effect 4.1.1, and the scan ran clean against it.

5. **Foldkit skills.** PASS.
   - A shallow clone of `foldkit@0.170.0` gave HEAD `a471adb24d750ab9e8d8312edad53ff6f26d961b`, matching `PROVENANCE.md`.
   - `diff -r` of `skills/{foldkit,generate-program,audit-program}` against `.claude/skills/*` was clean for all three.
   - `PROVENANCE.md` is accurate on tag, commit and the `skills/` source directory. I did not independently check the license line or fetch date.
   - `setup.sh` snippet, run in an empty `/tmp` dir:
     - First run fetched the checkout. The second run printed "already present" and exited 0.
     - Offline (proxy pointed at a dead port): warning on stderr, exit 0, no `repos/` directory left, and no temp dir left in `/tmp`.
   - `git check-ignore -v repos/foldkit` matches `.gitignore:60:/repos/`.
   - The real `setup.sh` prelude (`bun install`, hooks) was not run.

6. **`check_repo.py` exclusion.** Partial. See N1.
   - Planted `docs/repos/a.md` with `[x](nope.md)`: the check still passed, so a broken link was hidden.
   - Planted a broken link in `.claude/skills/z.md`: the check passed, so it was also hidden.
   - Real repo-owned docs outside those two locations are still checked.

7. **Counts and gates.** PASS.
   - `bun run check` exit 0 in the scratch copy: Bun 80 files, 664 passed, 4 skipped; workerd 22 files, 109 passed.
   - `python3 scripts/check_repo.py` in ws26: "Repository checks passed: 27 JSON files, documentation links valid."
   - `nix shell nixpkgs#shellcheck -c bash scripts/check.sh` in ws26: exit 0. `git status` was clean afterward.

## Not verified

- The ~33 s timing claim and the `--strict` exit-code behaviour (N5).
- The upstream LICENSE text and the fetch date.
- `LLMS.md` at effect-smol `main` (the sandbox proxy may block it), and the AGENTS.md claim that `effect.website/llms.txt` was unreachable.
- `node_modules/effect/AGENTS.md` and `ai-docs/` existence: I did not check them in the scratch install.
- The full `./bootstrap setup/verify` flow and the D1 smoke run.
- Whether the Nix-wrapped `check` (`./bootstrap check`) picks up `effect:check`. I only ran `bun run check`.

Scratch: `/tmp/r26`. No processes left running. I did not touch `/home/user/job-application-assistant` or any PR.
