set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

# Public commands transparently enter the pinned Nix development environment.
help:
  @just --list

setup:
  ./scripts/dispatch.sh _setup

build:
  ./scripts/dispatch.sh _build

# Apply Rust formatting.
fmt:
  ./scripts/dispatch.sh _fmt

# Apply safe compiler/Clippy rewrites, then format the result.
fix:
  ./scripts/dispatch.sh _fix

# Refresh the rotating NAV public token used by local Wrangler.
nav-token:
  ./scripts/dispatch.sh _nav-token

# Configure a NAV-issued private consumer bearer token locally.
nav-key:
  ./scripts/dispatch.sh _nav-key

# Rotate the NAV private consumer token on an already deployed Worker.
nav-key-cloudflare:
  ./scripts/dispatch.sh _nav-key-cloudflare

# Configure or rotate the local administrative bearer token.
admin-key:
  ./scripts/dispatch.sh _admin-key

# Provision an API principal and store its key in an ignored 0600 file.
principal-key base_url name="Job Index client" role="member" quota="20":
  ./scripts/dispatch.sh _principal-key {{base_url}} "{{name}}" {{role}} {{quota}}

# Run all Rust unit tests that are safe on the native host.
test:
  ./scripts/dispatch.sh _test

# Run Clippy without changing files.
lint:
  ./scripts/dispatch.sh _lint

# Non-mutating formatting, lint, policy, migration, and bundle checks.
check:
  ./scripts/dispatch.sh _check

# Full unit, integration, query-plan, and restore verification suite.
verify:
  ./scripts/dispatch.sh _verify

# Audit Rust dependencies against the RustSec advisory database.
audit:
  ./scripts/dispatch.sh _audit

# Production qualification checks that do not require a live Cloudflare account.
qualification:
  ./scripts/dispatch.sh _qualification

# Run a bounded staging soak. Use duration=604800 for seven days.
soak base_url duration="300" interval="30":
  ./scripts/dispatch.sh _soak {{base_url}} {{duration}} {{interval}}

# Interactive local D1 Worker at http://localhost:8787.
dev:
  ./scripts/dispatch.sh _dev

# Deploy the disposable staging environment and run destructive smoke tests.
deploy:
  ./scripts/dispatch.sh _deploy-staging

deploy-staging:
  ./scripts/dispatch.sh _deploy-staging

# Deploy production. Requires private NAV/admin secrets and SOURCE_CODE_URL.
deploy-production:
  ./scripts/dispatch.sh _deploy-production

clean:
  ./scripts/dispatch.sh _clean

# Internal recipes. Invoke through a public command or ./bootstrap _<name>.
_setup:
  ./scripts/setup.sh

_nav-token:
  JOB_INDEX_SKIP_NAV_TOKEN_SETUP=1 ./scripts/setup.sh
  ./scripts/refresh-nav-token.sh --force-public

_nav-key:
  JOB_INDEX_SKIP_NAV_TOKEN_SETUP=1 ./scripts/setup.sh
  ./scripts/configure-nav-key.sh

_nav-key-cloudflare:
  JOB_INDEX_SKIP_NAV_TOKEN_SETUP=1 ./scripts/setup.sh
  ./scripts/configure-nav-key.sh --cloudflare

_principal-key base_url name role quota: _setup
  ./scripts/create-principal.sh "{{base_url}}" "{{name}}" "{{role}}" "{{quota}}"

_build: _setup
  cd crates/job-index-worker && worker-build --release

_fmt: _setup
  cargo fmt --all

_fix: _setup
  cargo clippy -p job-index-core --all-targets --fix --allow-dirty --allow-staged --allow-no-vcs
  cargo clippy -p job-index-worker --target wasm32-unknown-unknown --fix --allow-dirty --allow-staged --allow-no-vcs
  cargo fmt --all

_format-check: _setup
  cargo fmt --all --check

_lint: _setup
  cargo clippy -p job-index-core --all-targets -- -D warnings
  cargo clippy -p job-index-worker --target wasm32-unknown-unknown -- -D warnings

_static:
  ./scripts/check.sh

_bundle-check: _build
  rm -rf .artifacts/dry-run
  mkdir -p .artifacts/dry-run
  # Recipe lines reach the shell verbatim, so shell variables take a single `$`.
  # A doubled `$$` is Make escaping and expands to the shell's process id here.
  for config in wrangler.local.jsonc wrangler.test.jsonc; do \
    name="${config%.jsonc}"; \
    wrangler deploy --config "${config}" --dry-run --outdir ".artifacts/dry-run/${name}"; \
  done

_check: _format-check _lint _static _bundle-check

_test: _setup
  cargo test --workspace --lib

_migrate-local: _setup
  WRANGLER_CONFIG=wrangler.local.jsonc ./scripts/migrate-local.sh

_dev: _setup _migrate-local
  wrangler dev --config wrangler.local.jsonc --local --persist-to .wrangler/state

_smoke-local: _setup _build
  ./scripts/verify-local.sh

_audit: _setup
  cargo audit

_qualification: _audit
  python3 scripts/query_plan_test.py
  python3 scripts/restore_drill.py

_soak base_url duration interval: _setup
  python3 scripts/soak.py "{{base_url}}" --duration "{{duration}}" --interval "{{interval}}"

_verify: _check _test _qualification _smoke-local

_deploy-staging: _verify
  ./scripts/deploy.sh staging

_deploy-production: _verify
  ./scripts/deploy.sh production

_clean:
  rm -rf target crates/job-index-worker/build .wrangler .artifacts .deploy wrangler.*.deploy.jsonc
