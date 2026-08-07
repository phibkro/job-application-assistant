{
  description = "Pinned development and deployment environment for Job Index";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/9e57802f3e12163dde815353165ae89e14a585f0";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            # Deliberately no separate Node.js package: with one on PATH,
            # Vitest's worker pool resolves to it for tests that import
            # `bun:sqlite`, and every `apps/worker/src/db`-adjacent
            # live/repository test fails with "Cannot find package
            # 'bun:sqlite'" — reproduced with and without it on PATH in this
            # exact shell. Nothing in this repository invokes that runtime
            # directly; everything runs through `bun run`, so Bun alone is
            # sufficient and is what keeps `bun run check` passing
            # identically whether entered via `nix shell nixpkgs#bun` or
            # `nix develop`.
            packages = with pkgs; [
              bun
              wrangler
              just
              cacert
              bashInteractive
              coreutils
              curl
              git
              jq
              python3
              shellcheck
              sqlite
            ];

            shellHook = ''
              export JOB_INDEX_NIX_SHELL=1
              export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            '';
          };
        });
    };
}
