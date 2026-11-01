#!/usr/bin/env bash
# Destroys one pull-request Worker Preview. Shared stages are never accepted:
# not `preview`, `staging` or `production`, and not the `pr-previews` host,
# whose parent Worker and shared D1 outlive every pull request.
#
# A `pr-<n>` stage owns only its Preview (it references the host's Worker and
# D1), so `alchemy destroy` deletes the Preview and nothing shared
# (@alchemy.run/cloudflare src/Workers/WorkerProvider.ts: delete of a
# Preview Worker calls `deletePreview` on the parent). A stage deployed by
# the old per-PR flow still destroys its own Worker and D1 the same way.
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

# Read the URL before the state is gone, to prove the Preview stops serving.
# `alchemy state read` prints Redacted secrets (WS-0029 L5): parse, never log.
DEPLOYMENT_URL="$(
  (cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy state read "JobIndex/$STAGE/Api") | python3 -c '
import json
import sys

text = sys.stdin.read()
start = text.find("{")
value = json.loads(text[start:]).get("attr", {}).get("url", "") if start >= 0 else ""
print(value if isinstance(value, str) else "")
'
)" || DEPLOYMENT_URL=""

(cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy destroy --stage "$STAGE" --yes)
echo "Destroyed preview stage ${STAGE}."

if [ -n "$DEPLOYMENT_URL" ]; then
  ./scripts/smoke-preview.sh deleted "$DEPLOYMENT_URL"
else
  echo "No recorded URL for ${STAGE}; nothing to check after teardown."
fi
