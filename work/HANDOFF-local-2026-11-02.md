# Handoff to local agents: 2026-11-02

This replaces the cloud lead session (claude.ai, 2026-11-01 to 02). Read `AGENTS.md`, then the six memory-bank files, then this file.

## State

- `main` includes PRs #22–#29. Every merge followed the AGENTS.md merge delegation: CI was green on the head and an independent review was clean.
- What is live:
  - **Staging** runs the TypeScript stack (`job-index-staging`).
  - **PR previews** are Cloudflare Worker Previews of `job-index-pr-previews`, behind Access. They share the D1 database `job-index-pr-previews-typescript-db`.
  - **`job-index.phibkro.org`** is still served by the legacy `preview` stage (Worker `job-index-preview`, D1 `job-index-preview-db`). It has no ingestion trigger, so its data is going stale.
  - **Production has never been deployed.** The owner's `alchemy plan` on 2026-11-01 showed `3 to create`.
- `infra/` runs Alchemy `2.0.0-beta.84` on effect `4.0.7`, with the `legacy_module_registry` opt-out. Moving to `~4.1` waits for an Alchemy release that contains alchemy-run/alchemy#2754.

## Active WorkScope: WS-0031 (approved 2026-11-02)

[`WS-0031-r1-production-path-and-refresh.md`](WS-0031-r1-production-path-and-refresh.md). The owner decided:
- launch on the NAV-acceptance assumption;
- refresh every 6 hours;
- a short cutover gap is acceptable;
- P2 runs in parallel with P1.

| Pass | State | Next action |
| --- | --- | --- |
| P1 production secrets (WS-0028 prod tier) | Waiting on the owner | The owner generates three age keys (workstation, ci-prod, claude-cloud; steps below), creates the GitHub `production` environment with required reviewers and the `SOPS_AGE_KEY` secret, and rotates the NAV token. An agent then builds SOPS + SecretSpec around the **public** keys only. |
| P2 TB-05 scheduled refresh | **Not started.** A cloud attempt was stopped with nothing committed; its budget of 2 is intact. | Delegate it using the brief below. |
| P3–P5 | Blocked on P1 and P2 | — |

### P2 brief (paste to a `complex-reasoning` implementer)

Implement TB-05, pass P2 of WS-0031.

**Read first:**
- `AGENTS.md` (Effect v4: read `node_modules/effect/src` before using any API);
- the WS-0031 contract;
- the handoff's "Ingestion control flow" and TB-05 rows;
- `market-index-tracers.md` TB-05;
- WS-0022 and its `decide` loop under `apps/worker/src`;
- `scripts/test_environment_safety.py`, for the cron guard and the `/__scheduled` hook;
- `infra/alchemy.run.ts`.

**End state:**
1. **One schedule.** Staging and production declare exactly one 6-hour Cron trigger, using the beta.84 prop (cite file:line). Previews and the preview host declare none.
2. **The `scheduled` handler emits one `Triggered` event into the `decide` loop.** The laws hold: no concurrent runs (lease), the checkpoint advances only on `Committed`, a failure keeps the last cursor, and runs stay within budget. There are workerd tests for overlapping ticks and for a failure mid-run.
3. **The read-triggered lazy gate is removed.** A test proves that no request path starts a NAV fetch; check `GET /api/v1/jobs/:id`, which currently fetches and writes. If a public response contract would change, stop and report.
4. **Per-source freshness and status are recorded and readable,** additively.
5. **The cron policy guard becomes:** "only staging and production declare the approved schedule". Each new assertion has a control seen failing.
6. **Evidence** goes in `evidence/WS-0031/README.md`. It includes a local `wrangler dev --test-scheduled` loop with NAV stubbed (no live NAV), plus the owner's staging verification steps.

**Constraints:**
- no deploys and no live NAV;
- no canonical-ID or public-contract change;
- prefer no migration (a new one needs `vp run deploy-preview-host` before PR previews pass);
- the pure core stays pure;
- `vp run verify` and `vp run e2e` must pass, and `navToClient.live.test.ts` must stay unmodified and passing;
- attempt budget 2.

**No-gos:**
- no manual admin trigger route;
- no P1 work;
- no unrelated refactors.

**Known unknowns:**
- why staging cron dispatch failed before;
- how beta.84 declares crons;
- whether hydration N should change for a 6-hour cadence.

## Owner-only actions outstanding

1. **`*.home` DNS resolves to the owner's public home IP: highest risk.** The addresses are in the workstation hardening agent's local evidence (`cf-dns-tunnel-details.md`), not in this public repo.
   - Test from mobile data whether `media.home.phibkro.org` or `audio.home.phibkro.org` answer.
   - Close any router port forwards to the LAN host behind those names.
   - Delete the four records and use Tailscale MagicDNS (recommended), or repoint them to the server's `100.x` address.
2. **Cloudflare cleanup (approved by the owner in the cloud lead session on 2026-11-02 as "ok to delete"; owner-run, outside any WorkScope):** delete the `home` tunnel; delete `ACORN` if it has no routes; retire `projects-origin` and `projects-mcp` (DNS records plus their `nori-station` local-config routes, with a backup first and a restart check of the other routes). **Do not** delete `job-index-preview` or `job-index-preview-db`: they serve `job-index.phibkro.org` until WS-0031 P4/P5.
3. **Account-wide "Access for all Workers" (previews only) is optional.**
   - If enabled, keep only the "Cloudflare account" Allow rule.
   - Do not add `ci-pr-preview` there; it already has its own app policy.
   - First check that no other project runs CI against its preview URLs.
4. **Stale bot PRs #5, #7, #16, #17 and #20** ("Acceptance 0019/0020 G1 hosted source change", from August, based on `df2739a`, touching `scripts/deploy.sh`) predate the TypeScript cutover. Recommendation: close them unmerged.
5. NAV written redistribution answer, and NAV token rotation (part of P1).

### P1 key commands (owner, on the workstation)

Workstation key, then print its public key:

```bash
mkdir -p ~/.config/sops/age && nix shell nixpkgs#age -c age-keygen -o ~/.config/sops/age/keys.txt
```

```bash
nix shell nixpkgs#age -c age-keygen -y ~/.config/sops/age/keys.txt
```

CI production key: generate it in a private temporary directory. `age-keygen` prints the public key on stderr, and the file also holds it as a `# public key:` comment. Put the file's contents in the GitHub `production` environment secret `SOPS_AGE_KEY`, then shred it.

```bash
d=$(mktemp -d) && (umask 077 && nix shell nixpkgs#age -c age-keygen -o "$d/ci-prod.key") && grep 'public key' "$d/ci-prod.key"
```

```bash
shred -u "$d/ci-prod.key" && rmdir "$d"
```

Claude cloud key (preview and staging only): same pattern. Put its contents in the cloud environment's settings as `SOPS_AGE_KEY`, then shred it.

```bash
d=$(mktemp -d) && (umask 077 && nix shell nixpkgs#age -c age-keygen -o "$d/claude-cloud.key") && grep 'public key' "$d/claude-cloud.key"
```

```bash
shred -u "$d/claude-cloud.key" && rmdir "$d"
```

Give the implementer **only the three public keys** (`age1…`). Back up `keys.txt`.

## Working conventions learned this session

- Run `vp config` only from the repo root. A run from a subdirectory is remembered (`vp.hooks.prefix`); see `AGENTS.md`.
- **Preview host:** after a migration merges, run `vp run deploy-preview-host` from `main` (inside `devenv shell`, with no staging or production secrets exported), or PR previews fail with "This PR adds D1 migrations".
- **Never log `alchemy state read` output;** it prints Redacted secrets in plain text.
- **Rollback after any beta.84 deploy is fix-forward,** because Durable Objects now use `exports` rather than migrations.
- **Pass A/B follow-ups** (all low) are listed in `evidence/WS-0029/README.md`: L1–L6, L1/L4, R2-L1..L3, I1/I2/I4/I5.
