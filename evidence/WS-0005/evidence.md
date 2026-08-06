# WS-0005 evidence

## Implemented evidence

- Explicit local, test, staging, and production Wrangler templates.
- Separate staging and production deployment commands and D1 identities.
- Two-phase production publication that keeps cron disabled until secrets exist.
- Production private NAV/admin/source-code prerequisites and preflight tests that prove Wrangler is not invoked on invalid input.
- Non-destructive production smoke suite.
- Runtime-configurable NAV base URL with official default.
- Dependency-free deterministic NAV contract server.
- NAV stub self-test and environment-safety policy test.
- Integrated local HTTP contract scenarios including actual concurrent synchronization.
- `/api/about` AGPL source offer and browser link.
- Workspace library unit-test command, including constant-time administrator-token comparison tests.

## Required executable evidence

Run:

```sh
just fix
just verify
```

Expected:

- all compiler, Clippy, policy, migration, and bundle checks pass;
- core and Worker library tests pass;
- deterministic fixture smoke passes;
- NAV contract smoke reaches tail, receives 304, classifies rate-limit/upstream/bounded/authentication/malformed failures, and proves lease contention;
- no real NAV availability is required.

## Required staging evidence

```sh
./deploy
```

Attach:

- `.deploy/staging.json`;
- destructive staging smoke output;
- staging D1 identity;
- deployed revision and config hash.

## Required production evidence

Configure:

```sh
just nav-key
just admin-key
export JOB_INDEX_SOURCE_CODE_URL=https://<public-source-location>
```

Then:

```sh
./deploy-production
```

Attach:

- `.deploy/production.json`;
- non-destructive production smoke output;
- proof that demo mutations and unauthenticated admin routes return 403;
- visible AGPL corresponding-source URL;
- independent G5 review.

## Remaining review

- Rust/Clippy/Wasm/local integration execution on the pinned Nix machine.
- Staging and production deployment evidence.
- Independent review of deployment scripts and mutation boundaries.
