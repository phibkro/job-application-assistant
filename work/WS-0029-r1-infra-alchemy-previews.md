# WorkScope: `infra/` upgrade and Alchemy Workers Previews behind Cloudflare Access

- ID: WS-0029
- Revision: 1
- Status: **Superseded by [WS-0029@2](WS-0029-r2-infra-alchemy-previews.md)** (scope refined after WS-0027@2 landed; split into pass A and pass B).
- Owner: Human product owner (phibkro)
- Risk tier: **R2** (infra/deploy configuration). Elevated to R3 for any production credential change, which is WS-0028's domain.
- Roles: implementer and independent reviewer at the `complex-reasoning` tier.
- Attempt budget: 2

## Outcome

A PR gets an **Alchemy-provisioned Cloudflare Workers Preview**:
- its own Durable Object namespace;
- bound to one shared, seeded `preview` D1;
- **behind Cloudflare Access by default**, declared in Alchemy.

Closing the PR deletes the Preview. The whole repo is on one Effect family.

## Scope

1. `infra/`: upgrade `alchemy` to ≥ beta.78, targeting beta.83+ (first with `preview: { of }`, plus `Access/Application` and `WorkerAccess`), and `effect` to `~4.1` to match the root (WS-0021 D-21c retired). Cite each API from the pinned package's types or docs.
2. Declare the Preview (re-declare the `SourceLeaseObject` env binding for Previews, or the Alchemy equivalent; never in production-only settings), the shared preview D1 with migrations and seed, and the Access application protecting Previews.
3. Replace `pr-preview.yml` → `deploy-preview.sh` with the Alchemy Preview deploy and teardown; delete the per-PR stage scripts.
4. Inventory the leftover `job-index-preview` Worker (old manual stage) and recommend deletion. **Deleting it is an owner-approved action.**

## Acceptance

- [ ] On a real PR: the Preview URL **requires Access sign-in** (an unauthenticated request is denied), and an authenticated `GET /api/health` and `GET /api/v1/jobs?limit=1` return 200 with seeded data. Closing the PR deletes the Preview (verified via the Cloudflare connector or the API).
- [ ] Staging and production deploys are unchanged in behavior, and the WS-0020 characterization suite passes on the upgraded `infra/`.
- [ ] Evidence is in `evidence/WS-0029/README.md`.
