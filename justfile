set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

# Public commands transparently enter the pinned Nix development environment.
help:
  @just --list

setup:
  ./scripts/dispatch.sh _setup


# Configure a NAV-issued private consumer bearer token locally.
nav-key:
  ./scripts/dispatch.sh _nav-key

# Rotate the NAV private consumer token on an already deployed Worker.
nav-key-cloudflare:
  ./scripts/dispatch.sh _nav-key-cloudflare

# Configure or rotate the local administrative bearer token.
admin-key:
  ./scripts/dispatch.sh _admin-key

# Repository, credential, and script gates: format/lint/type-check the
# TypeScript workspace separately with `bun run check`.
check:
  ./scripts/dispatch.sh _check

# Repository gates plus the TypeScript workspace's own check (typecheck,
# lint, format, schema drift, bundle, tests).
verify:
  ./scripts/dispatch.sh _verify

# Run a bounded staging soak. Use duration=604800 for seven days.
soak base_url duration="300" interval="30":
  ./scripts/dispatch.sh _soak {{base_url}} {{duration}} {{interval}}

# Run the TypeScript service locally: API on workerd, interface beside it.
preview:
  ./scripts/dispatch.sh _preview

# Deploy the TypeScript service to an independent Cloudflare preview stage.
deploy-preview:
  ./scripts/dispatch.sh _deploy-preview

# Deploy staging after verification and run a non-destructive HTTP smoke.
deploy:
  ./scripts/dispatch.sh _deploy-staging

deploy-staging:
  ./scripts/dispatch.sh _deploy-staging

# Deploy production. Requires private NAV and administrative secrets.
deploy-production:
  ./scripts/dispatch.sh _deploy-production

clean:
  ./scripts/dispatch.sh _clean

# Internal recipes. Invoke through a public command or ./bootstrap _<name>.
_setup:
  ./scripts/setup.sh


_nav-key:
  ./scripts/setup.sh
  ./scripts/configure-nav-key.sh

_nav-key-cloudflare:
  ./scripts/setup.sh
  ./scripts/configure-nav-key.sh --cloudflare

_admin-key:
  ./scripts/configure-admin-key.sh

_check: _setup
  ./scripts/check.sh

_preview: _setup
  ./scripts/preview.sh

_deploy-preview: _setup
  ./scripts/deploy-preview.sh

_soak base_url duration interval: _setup
  python3 scripts/soak.py "{{base_url}}" --duration "{{duration}}" --interval "{{interval}}"

# The TypeScript workspace's own gates (bun run check: format, lint,
# typecheck, schema drift, bundle, tests) run beside the repository/script
# gates rather than being folded into `_check`, so `bun run check` alone still
# works exactly as documented for anyone working only in apps/ or packages/.
_verify: _check
  bun run check

_deploy-staging: _verify
  ./scripts/deploy.sh staging

_deploy-production: _verify
  ./scripts/deploy.sh production

_clean:
  rm -rf .wrangler .artifacts .deploy .preview node_modules apps/web/dist infra/node_modules infra/.alchemy
