#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash_bin="$(command -v bash)"
bash_dir="$(dirname "${bash_bin}")"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

mkdir -p "${tmp}/bin" "${tmp}/home"
printf 'managed outside bootstrap\n' > "${tmp}/home/.profile"
chmod 0444 "${tmp}/home/.profile"
profile_before="$(cksum "${tmp}/home/.profile")"

cat > "${tmp}/bin/nix" <<'NIX'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$HOME/nix-args"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--command" ]; then
    shift
    JOB_INDEX_NIX_SHELL=1 exec "$@"
  fi
  shift
done
echo "fake nix did not receive --command" >&2
exit 1
NIX

cat > "${tmp}/bin/just" <<'JUST'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$HOME/just-args"
JUST
chmod +x "${tmp}/bin/nix" "${tmp}/bin/just"

env -i \
  HOME="${tmp}/home" \
  PATH="${tmp}/bin:${bash_dir}:/usr/bin:/bin" \
  "${bash_bin}" "${root}/bootstrap" deploy

grep -Fx -- '--extra-experimental-features' "${tmp}/home/nix-args" >/dev/null
grep -Fx -- 'nix-command flakes' "${tmp}/home/nix-args" >/dev/null
grep -Fx -- 'develop' "${tmp}/home/nix-args" >/dev/null
grep -Fx -- '--no-write-lock-file' "${tmp}/home/nix-args" >/dev/null
grep -Fx -- '--command' "${tmp}/home/nix-args" >/dev/null
grep -Fx -- 'deploy' "${tmp}/home/just-args" >/dev/null

profile_after="$(cksum "${tmp}/home/.profile")"
[ "${profile_before}" = "${profile_after}" ] || {
  echo "bootstrap modified the shell profile" >&2
  exit 1
}

[ ! -e "${tmp}/home/.cargo" ] && [ ! -e "${tmp}/home/.rustup" ] || {
  echo "bootstrap created user-level tool state" >&2
  exit 1
}

# The top-level deployment command must delegate to the same pipeline.
rm -f "${tmp}/home/just-args" "${tmp}/home/nix-args"
env -i \
  HOME="${tmp}/home" \
  PATH="${tmp}/bin:${bash_dir}:/usr/bin:/bin" \
  "${bash_bin}" "${root}/deploy"
grep -Fx -- 'deploy-staging' "${tmp}/home/just-args" >/dev/null

# The explicit production wrapper must remain distinct from staging.
rm -f "${tmp}/home/just-args" "${tmp}/home/nix-args"
env -i \
  HOME="${tmp}/home" \
  PATH="${tmp}/bin:${bash_dir}:/usr/bin:/bin" \
  "${bash_bin}" "${root}/deploy-production"
grep -Fx -- 'deploy-production' "${tmp}/home/just-args" >/dev/null

# Public just recipes delegate through this dispatcher. Outside the Nix shell it
# must enter bootstrap; inside the shell it must invoke the private recipe
# directly.
rm -f "${tmp}/home/just-args" "${tmp}/home/nix-args"
env -i \
  HOME="${tmp}/home" \
  PATH="${tmp}/bin:${bash_dir}:/usr/bin:/bin" \
  "${bash_bin}" "${root}/scripts/dispatch.sh" _verify
grep -Fx -- '_verify' "${tmp}/home/just-args" >/dev/null
grep -Fx -- '--command' "${tmp}/home/nix-args" >/dev/null

rm -f "${tmp}/home/just-args"
env -i \
  HOME="${tmp}/home" \
  PATH="${tmp}/bin:${bash_dir}:/usr/bin:/bin" \
  JOB_INDEX_NIX_SHELL=1 \
  "${bash_bin}" "${root}/scripts/dispatch.sh" _check
grep -Fx -- '_check' "${tmp}/home/just-args" >/dev/null

echo "Nix bootstrap and direct-just dispatch tests passed."
