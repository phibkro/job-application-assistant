#!/usr/bin/env bash
# Destroys one disposable pull-request stage. Shared stages are never accepted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "${1:-}" in
  [1-9]*)
    case "$1" in
      *[!0-9]*)
        echo "destroy-preview requires a positive PR number or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="pr-$1"
    ;;
  pr-[1-9]*)
    case "${1#pr-}" in
      *[!0-9]*)
        echo "destroy-preview requires a positive PR number or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="$1"
    ;;
  *)
    echo "destroy-preview requires a positive PR number or pr-N" >&2
    exit 2
    ;;
esac

(cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy destroy --stage "$STAGE" --yes)
echo "Destroyed preview stage ${STAGE}."
