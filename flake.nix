{
  description = "Pinned development and deployment environment for Job Index";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/9e57802f3e12163dde815353165ae89e14a585f0";
    rust-overlay = {
      url = "github:oxalica/rust-overlay/c5cb13481d718fac906aa9cfd85f9b60e1a546cb";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, rust-overlay, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };
          rustToolchain = pkgs.rust-bin.stable."1.97.1".default.override {
            extensions = [ "rust-src" "rustfmt" "clippy" ];
            targets = [ "wasm32-unknown-unknown" ];
          };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              rustToolchain
              worker-build
              wrangler
              just
              stdenv.cc
              pkg-config
              openssl
              cacert
              binaryen
              cargo-audit
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
              export CC="${pkgs.stdenv.cc}/bin/cc"
              export CXX="${pkgs.stdenv.cc}/bin/c++"
            '';
          };
        });
    };
}
