# Active context

## Now

- **Merged to `main`** in PR #22 (`7b850d7`): RFC 0016, the TB-00 baseline, effect ~4.1, legacy UI retired, the G14 flaky-test fix.
- **WS-0026 integrated** on the designated branch: Effect language-service gate (now `vp run effect:check` in `vp run verify`), agent docs, Foldkit skills. Review ACCEPT WITH NITS (`evidence/WS-0026/review.md`); five `multipleEffectProvide` findings are registered as exceptions.
- **WS-0027@2 implemented** on branch `ws27` (pending review and a CI run): devenv + Vite+ replace `flake.nix`, `./bootstrap`, the `justfile` and the shell wrappers. Tests stay on Vitest 4 via `vp run test`. Open CI gate: devenv cannot evaluate in the sandbox (`evidence/WS-0027/README.md`, r2 §6).

## Next

1. **WS-0027@2**: independent review, then a PR whose CI proves devenv (`quality.yml`).
2. **WS-0029**: `infra/` upgrade and Alchemy Previews behind Access; then **WS-0028** (secrets).
3. **WS-0022 (TB-01)** in parallel with **WS-0025** (index-web). Both are approved and start after WS-0027@2.
4. Then TB-02 (identity, R3), TB-05 (event-loop triggers, which also retire the lazy gate), and the WS-0023 query-algebra spike.

## Blocked / open

| Item | Owner |
| --- | --- |
| NAV's written redistribution answer (planning assumes acceptance) | Owner |
| NAV private-token rotation | Operator |
| Deployed corpus has no refresh trigger (since WS-0021@4) until TB-05 | TB-05 |
| `infra/` Effect pin (rc.108) | Follow-up ticket |
| Production qualification | Superseded; a new gate is defined after TB-05 |

## Recent decisions

See the [lead handoff](../docs/internal/product/market-index-lead-handoff.md) design-decision table (2026-11-01).
