# WorkScope: `infra/` upgrade, then Alchemy Workers Previews behind Cloudflare Access

- ID: WS-0029
- Revision: 2. Refines [r1](WS-0029-r1-infra-alchemy-previews.md) now that WS-0027@2 has landed. Splits the work into two passes so that pass A needs no new owner capability.
- Status: **Approved** (owner, 2026-11-01: "agree proceed"). Pass B starts only once its prerequisites P1–P4 are met.
- Owner: Human product owner (phibkro)
- Risk tier: **R2** (infra and deploy configuration). It becomes R3 if any production credential changes; that belongs to WS-0028.
- Roles: implementer and independent reviewer, both at the `complex-reasoning` tier.
- Attempt budget: 2 per pass.

## Pass A: upgrade `infra/` with no behaviour change

Facts on 2026-11-01:
- `infra/package.json` pins `alchemy` `2.0.0-beta.72` and `effect` / `@effect/platform-*` `4.0.0-rc.108`. The root pins `effect ~4.1.0`.
- `npm view alchemy dist-tags` reports `latest` as `2.0.0-beta.84`.

Steps:

1. Upgrade `alchemy` to `2.0.0-beta.84`, exact pin. Upgrade `effect` and `@effect/platform-*` to the root's `~4.1`, which retires WS-0021 D-21c. Make the minimum source changes needed to compile. Cite each changed API from the pinned package's types or changelog, never from memory.
2. Keep the existing per-PR stage flow (`deploy-preview.sh` / `destroy-preview.sh`, the `pr-<n>` stages) working on the upgraded `infra/`. Pass A does not switch to Workers Previews.
3. Verify read-only first that the upgrade does not change what Alchemy would do to staging or production, for example a plan or diff with no credentials if Alchemy supports one. If that cannot be shown without credentials, say so. The owner then runs the plan locally (P0 below) before the PR merges.

**Pass A acceptance**
- [ ] `vp run verify` and `vp run e2e` pass, and `infra` typecheck passes.
- [ ] The WS-0020 characterization test still passes.
- [ ] On the pass A PR, the existing `pull request preview` workflow deploys `pr-<n>` with the upgraded `infra/` and passes its smoke test. That CI run is the evidence.
- [ ] Staging and production: either a no-credential plan shows no change, or **P0** is recorded. P0 means the owner runs the plan for `staging` and `production` locally and confirms "no changes".
- [ ] Evidence is in `evidence/WS-0029/README.md`, in a section for pass A.

## Pass B: Workers Previews behind Access

Owner prerequisites. Each is a capability grant or a fact about the Cloudflare account that agents cannot make up:

| # | Prerequisite | Status (2026-11-01) |
| --- | --- | --- |
| P1 | A Zero Trust organisation | **Met.** Team domain `phibkro.cloudflareaccess.com`. |
| P2 | Who may sign in | **Decided:** the *Cloudflare Account Member* selector, using the Cloudflare identity provider. No email address is stored anywhere. The owner checks that the Cloudflare IdP is enabled; organisations created before 2026-06-18 keep their older login methods. |
| P3 | An Access **service token** for the CI smoke test | Owner action: create `ci-pr-preview` and store it as the `pr-preview` environment secrets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. |
| P4 | An API token that can edit Access apps | **Likely not needed.** Since 2026-08-14, Access can attach to the Worker itself, covering every domain and preview URL, with a previews-only option. Prefer that, enabled once by the owner, over declaring an Access app in Alchemy: adopt before build. P4 applies only if the implementer shows that the Worker-level setting can't cover our previews. |

Scope:
1. Declare the Workers Preview (`preview: { of }` or the pinned version's equivalent) and the shared seeded `preview` D1. Access protection comes from the Worker-level setting, previews only, with a Service Auth rule for the CI token. A CI test asserts that an unauthenticated request is denied, so drift in the dashboard setting fails the build. Re-declare the `SourceLeaseObject` binding for previews, never in production-only settings.
2. Replace the per-PR stage scripts with the Alchemy Preview deploy and teardown in `pr-preview.yml`.
3. Inventory the leftover `job-index-preview` Worker and any `pr-<n>` resources, and recommend what to delete. **Deleting them needs the owner's approval.**

**Pass B acceptance**
- [ ] On a real PR, an unauthenticated request to the preview URL is denied.
- [ ] Through the service token, `GET /api/health` and `GET /api/v1/jobs?limit=1` return 200 with seeded data.
- [ ] Closing the PR deletes the preview, verified via the API or the Cloudflare connector.
- [ ] Staging and production behave as before.
- [ ] Evidence is in the same README, in a section for pass B.

## Exclusions

- No production or staging deploy.
- No secret values in the repo or in chat.
- No change to the WS-0028 secrets design.
- No application-code change except what compiling against the upgrade requires.
- `nodejs_compat` (needed for better-auth presets) is **not** added here. It goes with the presets ticket, together with its bundle-size check.

## Rollback

- Pass A: revert the squash commit. The per-PR stages are unchanged.
- Pass B: revert the squash commit and re-run the old destroy for any open PR.
