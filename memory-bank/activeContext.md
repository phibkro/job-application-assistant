# Active context

## Now

- **Merged to `main`:** PR #22 (`7b850d7`: RFC 0016, TB-00, effect ~4.1, legacy UI retired) and PR #23 (`1f53f33`: devenv + Vite+, the Effect diagnostics gate, Foldkit skills, merge delegation). PR #23 merged automatically under the delegation.
- **Starting:** WS-0022 (TB-01) in parallel with WS-0025; WS-0030 (CI benchmark) alongside.
- **WS-0025@2 implemented on `ws25`, pending independent review:** `apps/index-web` (browse, detail, URL-synced filters) is served by the Worker; e2e + Axe green. r1 stopped because better-auth needs `nodejs_compat`; presets were split out to follow WS-0029/WS-0028. Evidence: [`evidence/WS-0025/`](../evidence/WS-0025/README.md).

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
