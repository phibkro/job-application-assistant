# Active context

## Now

- **Merged to `main` (under the delegation from #23):**
  - #22 `7b850d7`
  - #23 `1f53f33`
  - #24 `085b57d` (WS-0030 P2: CI verify ~177 s median, vs 249/226 s before)
  - #25 `07084e1` (P1 measured and reverted; fork-safety gate)
  - #26 `9565d91` (WS-0025@2: the index-web client)
- **Integrating WS-0022 (TB-01):**
  - Contents: IR v0, an append-only observation store, the workload pass, and an experimental filter.
  - Independent review: round 1 found medium R1 (seq reuse after purge), fixed. Round 2 found nothing at medium or above.
  - Follow-ups: R3/R4/R5/R7 and R12–R16.
  - Evidence: [`evidence/WS-0022/`](../evidence/WS-0022/README.md).
- **Fork safety:** fork PRs need approval for all external contributors (owner confirmed), plus the policy gate and the preview same-repo guard.

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
| Anonymous presets (better-auth): needs `nodejs_compat` (WS-0029) and `BETTER_AUTH_SECRET` (WS-0028) | Later ticket |

## Recent decisions

See the [lead handoff](../docs/internal/product/market-index-lead-handoff.md) design-decision table (2026-11-01).
