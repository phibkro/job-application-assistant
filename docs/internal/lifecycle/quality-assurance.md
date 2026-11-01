# Quality assurance strategy

> RFC 0015 retired the Rust worker this document originally described (Nix-
> locked Rust/workers-rs/Clippy, Cargo audit, per-migration tests, and a
> destructive NAV-stub Worker/D1 integration run). The command hierarchy and
> test layers below describe the current TypeScript service; the production
> gates it does not yet carry are listed in `memory-bank/progress.md`'s
> "Known gaps" section rather than repeated here.

## Command hierarchy

```sh
vp check                  # format (packages/, apps/) and lint
vp run test               # both Vitest 4 suites (Bun-hosted unit, workerd pool)
vp run policy             # repository, credential, and script gates
vp run verify             # setup + policy + vp check + types, Effect diagnostics, schema, catalog, bundle, coverage
vp run qualification      # 50k current-schema plans plus local backup/restore
vp run dev                # the whole stack served locally, for a real-journey proof
vp run deploy             # verify + staging acceptance
vp run deploy-production  # verify + non-destructive production acceptance
vp hooks enable           # once, in a clone made before WS-0027 (old .githooks path)
```

## Test layers

1. **Pinned environment:** Nix locks Bun, Node, Wrangler, Python, SQLite,
   ShellCheck, and operator commands.
2. **Workspace gates (`vp check` and the `vp run verify` chain):** Oxfmt, Oxlint, `tsc --noEmit`,
   `db/schema.sql` drift against the domain models, a workerd bundle check,
   and Vitest (unit, decoder, and live-SQLite integration tests per slot).
3. **Script/security tests (`vp run policy`):** public/private NAV
   credentials, admin-token secrecy, and production deploy preflight.
4. **Repository hygiene (`scripts/check_repo.py`):** RFC structure, JSON
   syntax, memory-bank size budget, documentation links, secret markers, and
   the production-safety invariants declared in `infra/alchemy.run.ts`.
5. **Real local integration (`vp run dev`):** the built interface and
   bundled Worker served together against a seeded local D1 — the proof that
   deleting or changing a service did not take a working one with it.
6. **Realistic-corpus qualification (`vp run qualification`):** 50,000
   deterministic current-schema vacancies plus representative owned workspace
   state, asserted query indexes and timings, then backup/restore integrity,
   foreign-key, fingerprint, and repeated-plan checks.

## Evidence discipline

Generated responses and logs are retained under `.artifacts/`. Environment
identity, database identity, auth mode, source URL, and config hash are
retained under `.deploy/`. Credentials and full NAV payloads are not stored
as evidence.

## Remaining production gates

Realistic query-plan and local backup/restore evidence is re-established by
`vp run qualification`. The administrative surface (principals, webhook
delivery, maintenance) remains absent. Production still requires current
black-box staging evidence, a seven-day soak, Cloudflare D1 restore/Time
Travel, credential rotation, and independent G5 review.
