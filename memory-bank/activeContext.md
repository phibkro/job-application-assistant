# Active context

## Now

- **Merged to `main` under the delegation:** #23–#27. The latest is #27 `bbd9b4c` (WS-0022 TB-01: IR v0, append-only observation store, workload pass). #26 `9565d91` was WS-0025@2 (the index-web client).
- **WS-0029@4 pass A merged** (#28 `f00ccb5`): `infra/` is on Alchemy beta.84 with effect 4.0.7 and the `legacy_module_registry` opt-out. Follow-ups L1–L6 are in `evidence/WS-0029/`. **Next: pass B** (Workers Previews behind Access). Its prerequisites P1–P3 are met.
- **Fork safety:** PRs from external contributors need the owner's approval to run CI. The policy gate and the preview same-repo guard also apply.

## Next

1. WS-0029 (`infra/` upgrade + Alchemy Previews behind Access), then WS-0028 (secrets, R3).
2. Then TB-02 (identity, R3), TB-05 (event-loop triggers, which retire the lazy gate), and the WS-0023 query-algebra spike.

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
