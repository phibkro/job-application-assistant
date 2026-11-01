# WorkScope: `infra/` upgrade (pass A, flag opt-out), then Access previews (pass B)

- ID: WS-0029
- Revision: 4. Supersedes [r3](WS-0029-r3-infra-alchemy-previews.md) for pass A. Pass B, and its prerequisites P1–P4, are unchanged from [r2](WS-0029-r2-infra-alchemy-previews.md).
- Status: **Approved** (owner, 2026-11-01: option 1, opt out of the new flag).
- Risk tier: R2. Attempt budget: pass A gets a **fresh 2** (r3 used up its budget, as recorded in `evidence/WS-0029/README.md`). Pass B has 2.

## Why r4

Pass A attempt 2 (r3) proved the upgrade works:
- install, frozen install, typecheck and loading the stack under Bun without credentials all pass;
- the declared resources match beta.72 byte for byte for `staging`, `production`, `pr-42` and `preview`.

It stopped because `@alchemy.run/cloudflare-runtime@2.0.0-beta.84` (`src/core/internal/constants.ts:37-38`) adds `new_module_registry` to every JS Worker unless `legacy_module_registry` is set. I found no Cloudflare documentation for `new_module_registry`.

## Pass A change (in addition to r3's list)

- On the `Api` Worker in `infra/alchemy.run.ts`, set `compatibility.flags: ["legacy_module_registry"]`, keeping today's date. Use whatever form the pinned provider's types give for this prop.
- Add an assertion to `scripts/test_environment_safety.py` that pins the opt-out, with a control that is seen failing.
- Acceptance adds one check: the computed compatibility for every stage equals beta.72's, apart from the explicit opt-out flag. Both `nodejs_compat` and the flag set must be shown from the provider's own `getCompatibility` or the stack dump.
- Everything else from r3 still applies:
  - `vp run verify`, `vp run e2e` and the WS-0020 test pass;
  - the CI `pr-<n>` deploy succeeds;
  - **P0: the owner runs `alchemy plan` locally for staging and production before merge.**

## Rollback (changed)

beta.84 uploads Durable Objects as an `exports` map instead of tagged migrations. After any beta.84 deploy, nobody has shown that a rollback to beta.72 works. Rollback is therefore **fix-forward**: revert the code, then redeploy with beta.84 and the previous app code. `pr-<n>` stages are disposable, so this matters only for staging and production, which pass A does not deploy.

## Follow-ups

- Adopt `new_module_registry` deliberately, in its own ticket, with tests.
- Move `infra/` to effect ~4.1 once an Alchemy release includes alchemy-run/alchemy#2754.
