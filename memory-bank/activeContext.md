# Active context

## Now

- **Merged to `main` under the delegation:** #23–#27. The latest is #27 `bbd9b4c` (WS-0022 TB-01: IR v0, append-only observation store, workload pass). #26 `9565d91` was WS-0025@2 (the index-web client).
- **WS-0029 done:** #28 `f00ccb5` (infra on Alchemy beta.84) and #29 `4c08a97` (Worker Previews behind Access; real-PR evidence: 302 unauthenticated, 200 with token, 404 after teardown).
- **WS-0031 approved** (production path + TB-05): P2 (6 h scheduled refresh, staging first) is not started (the cloud attempt was stopped with nothing committed; its budget is intact); P1 (production secrets) is waiting on the owner's keys. Launch proceeds on the NAV-acceptance assumption.
- **Fork safety:** PRs from external contributors need the owner's approval to run CI. The policy gate and the preview same-repo guard also apply.

## Next

Start from [`work/HANDOFF-local-2026-11-02.md`](../work/HANDOFF-local-2026-11-02.md).

1. WS-0031 P2 (TB-05 6-hour refresh; retires the lazy gate). The brief is in the handoff.
2. WS-0031 P1 (production secrets), once the owner's three public age keys exist.
3. WS-0031 P3–P5: first production deploy, domain cutover, retire the legacy `preview` stage.
4. Later: TB-02 (identity, R3), the presets ticket, and the WS-0023 query-algebra spike.

## Blocked / open

| Item | Owner |
| --- | --- |
| NAV's written redistribution answer (planning assumes acceptance) | Owner |
| NAV private-token rotation | Operator |
| Deployed corpus has no refresh trigger (since WS-0021@4) until TB-05 | TB-05 |
| `infra/` Effect pin (rc.108) | Follow-up ticket |
| Production qualification | Superseded; a new gate is defined after TB-05 |
| Anonymous presets (better-auth): needs `nodejs_compat`: deployed Workers already receive it from Alchemy's defaults (per the beta.72 source; not yet checked on the live Worker); the gap is in local/test Wrangler configs and `BETTER_AUTH_SECRET` (WS-0028) | Later ticket |
| `infra/` to effect ~4.1: waits for an Alchemy release on the 4.1 module layout | Follow-up |

## Recent decisions

See the [lead handoff](../docs/internal/product/market-index-lead-handoff.md) design-decision table (2026-11-01).
