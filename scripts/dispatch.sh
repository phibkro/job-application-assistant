#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

if [ "$#" -lt 1 ]; then
  echo "dispatch requires an internal just target" >&2
  exit 2
fi

if [ "${JOB_INDEX_NIX_SHELL:-0}" = "1" ]; then
  exec just "$@"
fi

exec "${root}/bootstrap" "$@"
