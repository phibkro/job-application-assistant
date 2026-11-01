> Archive note (WS-0021@4): this is a verbatim copy of the reviewer's
> `/tmp/ws-0021-r3-review.md` (sha256 `6909dd79c703bbca669bcabac8a4a797cc2027b837f20e77a2c5dfac12ce0501`), with one edit. In the §2
> grep command, two adjacent single quotes (`''`) are inserted between `[+-]`
> and `(import`. The shell reads the same string, but the link checker in
> `scripts/check_repo.py` no longer sees a Markdown link there.

# WS-0021@3 independent review: commit `5bf0e41` (parent `7f1f009`), branch `ws21-r3`

Reviewer: independent reviewer (complex-reasoning tier). Date: 2026-11-01.
Inputs: `work/WS-0021-r3-effect-4-1-legacy-web-freeze.md` (with Revisions / A1), `AGENTS.md`, `git diff 7f1f009 5bf0e41`. I treated `evidence/WS-0021/README.md` as a claim to check.
Nothing in any checkout was modified. All builds, e2e runs and mutations ran in `/tmp/ws21rev/*` copies made with `git archive`. The only commands run in `/home/user/ws21-r3` were the clean reinstall the brief asked for (`rm -rf node_modules apps/web/node_modules`, then reinstall), `bun run check`, `python3 scripts/check_repo.py` and a read-only vitest JSON run. `git status --porcelain` is empty afterwards and HEAD is `5bf0e41d8074fe712541aa4dde91f42a14067118`.

## Verdict: **REQUEST CHANGES** (one targeted fix to the build scripts; everything else holds)

The dependency change, the import rename, the vendored copies, the lockfiles, the gates and e2e all check out. On a clean install the change does what the contract asks.

One problem blocks it. The new build steps run `bun install --frozen-lockfile` in `apps/web` without `--force`. On an existing checkout that was installed before this commit (the owner's machine, for example), that install leaves stale symlinks into the root `.bun` store. The result is two copies of `effect` in the web bundle. I reproduced the full failure:

- 76 of 143 web tests fail.
- The JS bundle grows to 507 kB.
- `scripts/preview.sh` followed by `bun run e2e` passes **0 of 4**.

`deploy-preview.sh` goes through the same install and build. Its only prerequisite is `_setup`, which does not run `web:check`, so it would publish that broken interface to the Cloudflare preview stage.

Staging and production fail closed. `_verify` runs `bun run check`, and its `web:check` step would fail first. I worked that out from the `justfile`; I did not run `just deploy`.

Adding `--force` fixes it, and I verified the fix. A second, smaller deviation: the built CSS gains two unused utility classes because Tailwind now scans `vendor/`.

## Findings

| # | Severity | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| F1 | **Medium (blocking)** | `scripts/preview.sh:19`, `scripts/deploy-preview.sh:40`, `scripts/deploy.sh:163`, `scripts/setup.sh:17` | On a checkout installed at `7f1f009` (old workspace layout), `cd apps/web && bun install --frozen-lockfile` keeps `apps/web/node_modules/foldkit` and `@foldkit/ui` as symlinks into the root `node_modules/.bun` store. The root install does not prune that store, and its `effect@4.0.0-rc.108` stays there. So foldkit resolves one `effect` copy and the app resolves another. What I reproduced: `bun run check` in `apps/web` gives 6 failed / 2 passed files and 76 failed / 67 passed tests; the build succeeds silently with a 507.01 kB JS bundle (sha `97d9b41b…`, against the clean build's 407.39 kB `642e687a…`); `preview.sh` followed by `bun run e2e` gives **4 failed** (locator timeouts). The evidence README calls this an "install pitfall" that a fresh clone or `just clean` avoids. That is true, but nothing in the build steps protects against it, and `deploy-preview` or `preview` would use the broken bundle. | Use `bun install --frozen-lockfile --force` in `apps/web` in all four places, the same way `setup.sh` already installs `infra`. Verified: after `--force` in the converted copy, foldkit is a real directory, web tests pass 8/143, and the JS bundle is byte-identical to the clean build (`642e687a…`). Removing `apps/web/node_modules` before the install is an alternative. |
| F2 | Low | `apps/web/src/styles.css:9` (no change in the diff; the cause is the new `apps/web/vendor/` tree) | Tailwind v4 detects class names automatically, so it now scans `apps/web/vendor/**` and picks up the words `static` and `table` from the vendored domain. The deployed CSS gains `.static{position:static}` and `.table{display:table}`: sha `1f9e04c4…` (35.46 kB) against `8ded4e08…` (35.41 kB) at `7f1f009`. The JS bundle content is identical. I found no element that uses either class (heuristic grep of the bundle: `table` appears only as an element tag name), and 4 of 6 screenshots are byte-identical, so I see no visible effect. It is still a change to the assets the Worker serves, which Design §4 ("the same static assets") does not allow. | Add `@source not "../vendor";` after `@import "tailwindcss";`. Verified in /tmp: this restores byte-identical CSS (`8ded4e08…`). If the owner prefers not to touch web source, record the asset change in the evidence instead. |
| F3 | Low | `apps/web/package.json` (`"@job-index/domain": "file:./vendor/domain"`) | Bun installs the `file:` dependency as hardlinked copies in `apps/web/node_modules/@job-index/domain`. An edit that replaces the file (as `sed -i`, `git checkout` and most editors do) breaks the hardlink, and `bun run check` keeps passing against the stale copy until someone reinstalls (mutation B below: 8/143 pass). Nothing in the gates checks that the frozen copy still matches `evidence/WS-0021/r3/vendor-sha256.txt`. | Add a hash check of the vendored tree to `web:check`, for example `sha256sum -c` against the evidence list with paths relative to `apps/web/vendor`. That turns "frozen" into a gate. |
| F4 | Nit | `scripts/setup.sh:17`, `package.json:23`, `justfile` `_verify` comment | `bun install` at the root no longer installs the web, so `bun run check` after a plain root install fails at `web:check` with TS2307 errors. It fails closed. The `justfile` comment still says "`bun run check` alone still works exactly as documented". | Document that the web needs its own install, or have `web:check` run `bun install --frozen-lockfile --force` first. |
| F5 | Nit | `work/WS-0021-r3-…md` (A1, and the acceptance criteria) | The contract has two counts that don't match the start commit. A1 says "15 files" import `Api.ts`; at `7f1f009` it is 14 files with 15 specifiers (`studio/Model.ts` has 2). The README states this correctly. The acceptance criteria say "r2 baseline: 7 web test files"; `git ls-tree 7f1f009` shows 8, and the evidence uses 8. | These are errors in the contract, not the implementation. The owner can record them. |
| F6 | Nit | `memory-bank/progress.md` (unchanged) | The work rules in `CLAUDE.md`/`AGENTS.md` say to update `progress.md` when project state changes. The contract only requires `techContext.md` and `activeContext.md`, and both were updated. | Optionally add a progress line when this is integrated. |
| F7 | Info | `apps/worker/src/runtime/Layers.test.ts`, 4 files in `packages/adapters/**/*.test.ts` | These test files also changed, but only in their import lines (the r1 rename). D-21b names only `navToClient.live.test.ts`, but the contract says "no test assertion changes", which this meets. The back-end diff lines are a strict subset of `evidence/WS-0021/r1-trial.patch`. | None. |
| F8 | Info | `apps/web/package.json` (`"typescript": "^5"`) | A range rather than an exact pin. It is locked to 5.9.3 in `apps/web/bun.lock` and matches the root. | Optional: pin it exactly. |

## Checks, commands and results

### 1. Confinement
- `git diff --stat 7f1f009 5bf0e41`: 116 files, +4590/−228.
- Every changed path falls into one of these groups:
  - `apps/web/` (manifest, lock, tsconfig, vitest config, the 14 import edits, `vendor/`)
  - `apps/worker/src/` and `packages/` (imports only, plus the adapter peer dependency)
  - root `package.json`, `bun.lock`, `tsconfig.json`, `vitest.config.ts`
  - `justfile` (the `_clean` line) and `scripts/{preview,deploy-preview,deploy,setup}.sh`
  - `memory-bank/{activeContext,techContext}.md` and `evidence/WS-0021/`
- Filtering out the allowed paths with a regex leaves nothing.
- All changed `.ts` lines outside `vendor/`, grouped with `sort | uniq -c`, are import lines (`effect/unstable/*` → stable paths, `worker/src/Api.ts` → `vendor/worker-api/Api.ts`) or the new `apps/web/vitest.config.ts` and root `vitest.config.ts` exclude.
- `git diff --quiet 7f1f009 5bf0e41 -- infra` passes, and there is no diff under `db/`, `e2e/`, `policy/` or `dev/`. No migration, schema, route or wrangler file changed. `bun run schema:check` reports "schema snapshot matches the domain models".
- Surprises: F2 (a change to the built asset that the file list doesn't show) and F1 (the install behaviour of the build steps).

### 2. Test assertions untouched
- Changed `*.test.ts` files outside vendor: `apps/web/src/saved/update.test.ts`, `navToClient.live.test.ts`, `Layers.test.ts`, `adapters/jsonld/src/index.test.ts`, `adapters/nav/src/{credential,index}.test.ts`, `adapters/src/Registry.test.ts`.
- Mechanical check: `git diff -U0 7f1f009 5bf0e41 -- '*.test.ts' ':!apps/web/vendor' | grep '^[+-]' | grep -v '^(+++|---) ' | grep -vE '^[+-]''(import .* from "…";|\} from "…";)$'` returns **empty output**.
- The web test names from my own vitest JSON run (143) match `evidence/WS-0021/r3/web-test-ids-after.txt`. The before and after evidence lists are byte-identical (`cmp`).

### 3. Vendored copies
- `git rev-parse 7f1f009:packages/domain/src` and `5bf0e41:apps/web/vendor/domain/src` both give **`3bff362729004387fea243b1ff21bed5541f4929`**: the trees are identical.
- I also hashed the copy independently: `sha256sum` of 30 files from `git archive 7f1f009 packages/domain` against the worktree copy shows no diff.
- `package.json`: `f9066ffd…2ace` in both. `Api.ts`: `289ec25e…35bf` in both (`7f1f009:apps/worker/src/Api.ts` and `apps/web/vendor/worker-api/Api.ts`).
- All 32 hashes in `evidence/WS-0021/r3/vendor-sha256.txt` match my values.
- Both `PROVENANCE.md` files are present. Their source path, full commit `7f1f0097…`, method, reason and frozen status are accurate.
  - Nit: they say the SHA-256 list is "in `evidence/WS-0021/README.md`". The list is actually in `r3/vendor-sha256.txt`, which the README links to.

### 4. Versions
- The root resolves **`effect@4.1.1`** (`bun.lock:441`, no dependencies; `node_modules/effect` points to `.bun/effect@4.1.1`). After a clean install, `.bun` holds exactly one `effect@*` entry, so there is no duplicate in the root graph.
- The root lock drops 59 entries (web-only packages, rc.108's transitive dependencies, `@effect/platform-browser` beta.103) and adds only `effect@4.1.1`. This matches the README.
- `apps/web/bun.lock` resolves `effect@4.0.0-rc.108`, `foldkit@0.139.0`, `@foldkit/ui@0.139.0`, `vitest@4.1.10` and `typescript@5.9.3`. Every `name@version` in it appears in the root lock at `7f1f009`, apart from the `file:vendor/domain` entry, so the transitive versions did not drift. The installed `package.json` versions match.
- `infra/package.json` still has `effect`, `@effect/platform-bun` and `@effect/platform-node` at `4.0.0-rc.108`, and nothing under it changed.

### 5. Reproduction in the worktree (after a clean install)
| Command | Result |
| --- | --- |
| `rm -rf node_modules apps/web/node_modules && bun install --frozen-lockfile && bun install --cwd apps/web --frozen-lockfile` | OK: 174 + 99 packages. Single `effect` in each tree (4.1.1 at the root, rc.108 in the web), and `foldkit` is a real directory. The clean install does **not** hit the double-`effect` problem. |
| `PATH=/tmp/ws21/bin:$PATH bun run check` | **exit 0** in 1m21s. fmt (354 files), oxlint, imports (350 files), tsc, `web:check` (tsc 0 errors; **8 files / 143 passed**), schema, catalog (109), bundle, Bun coverage **80 files / 664 passed / 4 skipped**, workerd **22 files / 109 passed**. |
| Bun total against the baseline | 80 + 8 = **88 files**, 664 + 143 = **807 passed**, **4 skipped**: matches 88/807/4. workerd 22/109 matches. |
| `python3 scripts/check_repo.py` | **pass**: "29 JSON files, documentation links valid." |
| Converted-checkout simulation (`/tmp/ws21rev/conv`: install at `7f1f009`, overlay `5bf0e41`, root install, web `--frozen-lockfile`) | **Fails**: stale foldkit symlink, 76/143 web tests fail. This confirms the problem the implementer reported. With `--force`: 143/143. See F1. |

### 6. e2e
- Clean `5bf0e41` copy (`/tmp/ws21rev/head`). I ran `scripts/preview.sh`, with PATH including a wrangler 4.120.0 symlink to that copy's own `node_modules`, then `bun run e2e`. Result: **4/4 passed** (43.8s), Chromium at `/etc/profiles/per-user/nori/bin/chromium` (156.0.8078.79).
- Converted-checkout copy (`/tmp/ws21rev/conv3`), same commands: **0/4** (all locator timeouts), with the 507 kB double-`effect` bundle (F1).
- Screenshots: I did not capture new ones. Using `cmp` on the committed images, `0-signedout`, `feed`, `jobs` and `profile` are byte-identical between `r2-attempt1/shots-before` and `r3/shots-after`. `saved` and `studio` differ. In `cmp-saved.png` and `cmp-studio.png` the only differences I can see are runtime timestamps and the saved_jobs UUID.

### 7. Build glue
- `preview.sh`, `deploy-preview.sh` and `deploy.sh` now run `cd apps/web && bun install --frozen-lockfile && bun run build`. `setup.sh` adds `bun install --cwd apps/web --frozen-lockfile`. `justfile _clean` now also removes `apps/web/node_modules`.
- `dev/preview.wrangler.jsonc:31` and `infra/alchemy.run.ts:209` still serve `../apps/web/dist`, and both are unchanged.
- The deploy path cannot build the web against the root workspace on a clean checkout: `apps/web` is outside `workspaces` and has its own lock. I built the deploy-path steps from a fresh `git archive` and compared with `7f1f009`:
  - JS: content-identical (`642e687a…`).
  - CSS: differs (F2).
  - `index.html`: differs only in the asset file names.
- On an existing checkout, the same steps pick up stale root-store symlinks (F1). Without a clean install, `web:check` also falls back to the root `tsc`/`vitest` and root `effect` 4.1.1, and it fails closed (TS2307).
- The `justfile` dependency chain: `deploy`/`deploy-production` go through `_verify` → `bun run check` → `web:check`, so they are gated. `deploy-preview` and `preview` only go through `_setup`, so they are not.

### 8. Mutation spot-check (in `/tmp/ws21rev/mut*`)
- **A, in-place edit (inode kept):** in `vendor/domain/src/Saved.ts` I changed `"needs-action"` to `"needs-actionX"` in `SavedView`. `bun run check` in `apps/web` fails with `TS2820` in `src/saved/update.test.ts(110,70)` and `src/saved/view.ts(39,5)`. It is caught.
- **B, same edit with `sed -i` (new inode):** the `node_modules` copy is unchanged and `bun run check` **passes 8/143**: not caught. After `bun install --frozen-lockfile`, Bun reinstalls one package and the TS2820 errors appear. This is a gap (F3).
- I did not run a mutation of the vendored `Api.ts`. It is imported by relative path, so the stale-copy issue does not apply to it.

## What I could not verify
- `./bootstrap verify` and `nix develop`/`just` recipes: not run (the cloud environment's proxy blocks `nix develop`). I ran the repository scripts directly, as the implementer did. `nix shell nixpkgs#nodejs`, which the workerd coverage uses, did work.
- `just deploy`, `deploy-preview.sh` and `deploy.sh`: not run (no credentials, out of scope). The claim that staging/production fail closed is from reading the `justfile`, not from running it.
- I did not capture new screenshots of the six screens. I relied on `cmp` of the committed images and looked at the implementer's comparison crops.
- I did not inspect every screen at runtime for the two extra CSS utilities (F2). "Not visible" is based on the identical screenshots and a heuristic grep of the bundle.
- The r2 e2e baseline (`ee423e1`) was not re-run. I did build the `7f1f009` web assets myself for the comparison in §7.
