#!/usr/bin/env bash
set -euo pipefail

required=(bun wrangler just curl python3 sqlite3 jq shellcheck)
for command in "${required[@]}"; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Pinned Nix environment is missing '${command}'." >&2
    exit 1
  }
done

bun install --frozen-lockfile

bun install --cwd infra --frozen-lockfile --force

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ./scripts/install-hooks.sh
fi


# Foldkit source for the agent skills in .claude/skills/ (WS-0026). A git-ignored,
# tag-pinned shallow checkout at repos/foldkit/. Keep FOLDKIT_TAG equal to the
# release tag of the installed `foldkit` (AGENTS.md records it). Idempotent;
# an unreachable network warns and continues, it never fails setup.
FOLDKIT_TAG="foldkit@0.170.0"
FOLDKIT_DIR="repos/foldkit"
if git -C "${FOLDKIT_DIR}" tag --points-at HEAD 2>/dev/null | grep -Fxq "${FOLDKIT_TAG}"; then
  echo "Foldkit ${FOLDKIT_TAG} already present at ${FOLDKIT_DIR}."
else
  foldkit_tmp="$(mktemp -d "${TMPDIR:-/tmp}/foldkit.XXXXXX")"
  if git clone --quiet --depth 1 --branch "${FOLDKIT_TAG}" \
    https://github.com/foldkit/foldkit "${foldkit_tmp}/foldkit" 2>/dev/null; then
    mkdir -p repos
    rm -rf "${FOLDKIT_DIR}"
    mv "${foldkit_tmp}/foldkit" "${FOLDKIT_DIR}"
    echo "Fetched Foldkit ${FOLDKIT_TAG} into ${FOLDKIT_DIR}."
  else
    echo "WARNING: could not fetch Foldkit ${FOLDKIT_TAG} (network unavailable?); ${FOLDKIT_DIR} not updated. Re-run setup with network access." >&2
  fi
  rm -rf "${foldkit_tmp}"
fi


printf '%s\n' \
  "Pinned setup ready." \
  "  $(bun --version | sed 's/^/bun /')" \
  "  $(wrangler --version | head -n 1)"
