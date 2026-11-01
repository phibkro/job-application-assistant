# WorkScope: `infra/` upgrade (pass A, revised Effect target), then Access previews (pass B)

- ID: WS-0029
- Revision: 3. Supersedes [r2](WS-0029-r2-infra-alchemy-previews.md) for pass A only. Pass B, with its prerequisites P1–P4 and their statuses, is unchanged from r2.
- Status: **Approved** (owner, 2026-11-01: option A).
- Risk tier: R2. Attempt budget: pass A has 1 attempt left (attempt 1 stopped correctly; see below). Pass B has 2.

## Why r3

Pass A attempt 1 stopped before committing anything:

- `alchemy@2.0.0-beta.84` is the latest release; its declared range is `effect ^4.0.5`.
- It imports `effect/Crypto` in `src/Stack.ts`, `src/Util/PlatformServices.ts` and `src/Auth/OAuthFlow.ts`.
- `effect` 4.1.x ships only lower-case `./crypto`, so the program fails at runtime.
- `tsc` does not catch this, because `skipLibCheck` is on.

The lead verified this against the installed `effect@4.1.1` and the packed `alchemy@2.0.0-beta.84`.

`infra/` has its own install and is not a root workspace, so its Effect version cannot reach the app.

## Pass A target (replaces r2 pass A step 1)

1. Pin these exactly:
   - `alchemy` `2.0.0-beta.84`
   - `@alchemy.run/cloudflare` `2.0.0-beta.84` (the Cloudflare provider is now its own package)
   - `effect`, `@effect/platform-bun`, `@effect/platform-node` `4.0.7`
   - an override pinning `@effect/platform-node-shared` to `4.0.7`
2. Change the import in `infra/alchemy.run.ts` from `alchemy/Cloudflare` to `@alchemy.run/cloudflare`. Make any further changes only if compiling *or running* the program requires them, with citations.
3. Prove that the program loads: evaluate the stack module under Bun without credentials, not only a typecheck.
4. Everything else in r2 pass A still applies:
   - no behaviour or resource-identity change;
   - the per-PR stage flow keeps working;
   - acceptance includes the CI `pr-<n>` deploy and the owner's local `alchemy plan` for staging and production (**P0, required before merge**, because no credential-free plan exists).
   - In addition, compare by review the beta.72 and beta.84 provider code that our stack uses (`D1/Database`, `Workers/Worker`, `Workers/DurableObject`, `Workers/Assets`) for changes to physical names, migrations or bindings.

## Follow-up

Move `infra/` to `effect ~4.1`, matching the root, when an Alchemy release imports the 4.1 module layout. Reporting the incompatibility upstream is an outward action and is not authorised.
