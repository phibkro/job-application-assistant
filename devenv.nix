{ pkgs, ... }:
{
  # Prerequisite tooling for job-index (WS-0027@2). It replaces flake.nix and ./bootstrap.
  # Pinned by devenv.lock: devenv-nixpkgs rolling @ 760b85220489f69855e6df78a6d1dad5873f8bf6, the same lock as
  # phibkro/pg-outbox and phibkro/vektorprogrammet-reimagined. Everything else (Vite+, Vitest 4, oxfmt/oxlint,
  # TypeScript, the Effect language service) is a pinned npm devDependency, installed by `vp run setup`.
  #
  # - bun: package manager and runtime of the Bun-hosted Vitest 4 suite (it imports `bun:sqlite`).
  # - nodejs_24: Vite+ needs Node ^22.18 || ^24.11 (vite-plus engines). The workerd Vitest 4 pool must be started
  #   by Node because Bun's `ws` shim cannot hold the pool's WebSocket (vitest.workers.config.ts). The old
  #   flake.nix kept Node off PATH, claiming it broke `bun:sqlite` tests. That was not reproduced under
  #   `bun node_modules/vitest/vitest.mjs run` with Node 22 on PATH (evidence/WS-0027, r2 §2).
  # - wrangler: the local preview and the deploy scripts call it from PATH.
  # - python3, sqlite, jq, curl: the kept deploy/qualification scripts and the Python policy gates.
  # - shellcheck: lints the kept scripts/*.sh (`vp run policy`).
  packages = [
    pkgs.bun
    pkgs.nodejs_24
    pkgs.wrangler
    pkgs.python3
    pkgs.sqlite
    pkgs.jq
    pkgs.curl
    pkgs.git
    pkgs.shellcheck
    pkgs.cacert
  ];

  # The workspace's own binaries (`vp`, `tsc`, `oxlint`) are on PATH inside the shell, so `vp check` and
  # `vp run <task>` work as documented without `bunx`. workerd verifies TLS against SSL_CERT_FILE, which Nix
  # leaves out of the exported environment (the same reason as in vektorprogrammet-reimagined's devenv.nix).
  enterShell = ''
    export PATH="$DEVENV_ROOT/node_modules/.bin:$PATH"
    export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
  '';
}
