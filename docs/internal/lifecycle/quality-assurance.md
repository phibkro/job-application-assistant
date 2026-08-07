# Quality assurance strategy

> RFC 0015 retired the Rust worker this document originally described (Nix-
> locked Rust/workers-rs/Clippy, Cargo audit, per-migration tests, and a
> destructive NAV-stub Worker/D1 integration run). The command hierarchy and
> test layers below describe the current TypeScript service; the production
> gates it does not yet carry are listed in `memory-bank/progress.md`'s
> "Known gaps" section rather than repeated here.

## Command hierarchy

```sh
bun run check         # TypeScript workspace: format, lint, typecheck, schema drift, bundle, tests
just check             # repository, credential, and script gates
just verify             # just check + bun run check
just preview             # the whole stack served locally, for a real-journey proof
./deploy                 # verify + destructive staging acceptance
./deploy-production       # verify + non-destructive production acceptance
```

## Test layers

1. **Pinned environment:** Nix locks Bun, Node, Wrangler, Python, SQLite,
   ShellCheck, and operator commands.
2. **Workspace gates (`bun run check`):** Oxfmt, Oxlint, `tsc --noEmit`,
   `db/schema.sql` drift against the domain models, a workerd bundle check,
   and Vitest (unit, decoder, and live-SQLite integration tests per slot).
3. **Script/security tests:** bootstrap isolation, public/private NAV
   credentials, admin-token secrecy, and production deploy preflight.
4. **Repository hygiene (`scripts/check_repo.py`):** RFC structure, JSON
   syntax, memory-bank size budget, documentation links, secret markers, and
   the production-safety invariants declared in `infra/alchemy.run.ts`.
5. **Real local integration (`just preview`):** the built interface and
   bundled Worker served together against a seeded local D1 — the proof that
   deleting or changing a service did not take a working one with it.

## Evidence discipline

Generated responses and logs are retained under `.artifacts/`. Environment
identity, database identity, auth mode, source URL, and config hash are
retained under `.deploy/`. Credentials and full NAV payloads are not stored
as evidence.

## Remaining production gates

See `memory-bank/progress.md`'s "Known gaps left by the cutover": query-plan
regression at scale, a restore drill, and the administrative surface
(principals, webhook delivery, maintenance) all existed only in the retired
Rust worker and are not yet re-established. Beyond those: live staging soak,
credential rotation, and independent G5 review of the production
configuration.
