# Active context

## Now

- **WS-0021@4**: effect `~4.1` for the whole workspace and retiring the legacy Foldkit UI. Implementation is in progress in a separate worktree; an independent review follows.

## Next

1. **WS-0026**: agent tooling (Effect language service in `check`, `LLMS.md`, Foldkit skills).
2. **WS-0022 (TB-01)**: workload facts through the experimental observation IR (approved, L1–L4), **in parallel with**
3. **WS-0025**: `apps/index-web` first slice: browse, detail, filters, anonymous presets (approved).
4. Then TB-02 (identity, R3), TB-05 (event-loop triggers, which also retire the lazy gate), and the WS-0023 query-algebra spike.

## Blocked / open

| Item | Owner |
| --- | --- |
| NAV's written redistribution answer (planning assumes acceptance) | Owner |
| NAV private-token rotation | Operator |
| Deployed corpus loses its only refresh trigger when WS-0021@4 lands, until TB-05 | TB-05 |
| `infra/` Effect pin (rc.108) | Follow-up ticket |
| Production qualification | Superseded; a new gate is defined after TB-05 |

## Recent decisions

See the [lead handoff](../docs/internal/product/market-index-lead-handoff.md) design-decision table (2026-11-01).
