#!/usr/bin/env bash
# Smoke checks for a pull-request Worker Preview behind Cloudflare Access
# (WS-0029@2 pass B). The output is the pass B evidence: status codes, the
# Access redirect host and the seeded row count. It never prints a credential.
#
#   smoke-preview.sh deployed URL STAGE
#     1. Without credentials, /api/health must be refused by Access: 401 or
#        403, or a redirect to https://phibkro.cloudflareaccess.com/. A 200
#        fails the build, so a disabled Access setting cannot go unnoticed.
#     2. With the CI service token, /api/health must answer 200 for STAGE and
#        /api/v1/jobs?limit=1 must answer 200 with at least one seeded job.
#
#   smoke-preview.sh deleted URL
#     After teardown, the service token's request must get a 404.
#
# The token comes from CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET. It is
# written to a private header file, so it is on no command line.
set -euo pipefail

ACCESS_TEAM_HOST="phibkro.cloudflareaccess.com"
ATTEMPTS="${SMOKE_PREVIEW_ATTEMPTS:-12}"
WAIT_SECONDS="${SMOKE_PREVIEW_WAIT_SECONDS:-5}"

mode="${1:-}"
url="${2:-}"
stage="${3:-}"
case "$url" in
  https://*.workers.dev | https://*.workers.dev/) url="${url%/}" ;;
  *)
    echo "smoke-preview needs the Preview's https://...workers.dev URL" >&2
    exit 2
    ;;
esac
if [ -z "${CF_ACCESS_CLIENT_ID:-}" ] || [ -z "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
  echo "smoke-preview needs CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
headers="$work/access-headers"
(
  umask 077
  printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s\n' \
    "$CF_ACCESS_CLIENT_ID" "$CF_ACCESS_CLIENT_SECRET" >"$headers"
)

# Prints "<status> <redirect host>"; the body goes to $work/body.
unauthenticated() {
  curl -sS -o "$work/body" -w '%{http_code} %{redirect_url}' "$1" | python3 -c '
import sys
from urllib.parse import urlsplit

status, _, location = sys.stdin.read().partition(" ")
print(status, urlsplit(location.strip()).hostname or "-")
'
}

authenticated() {
  curl -sS -o "$work/body" -w '%{http_code}' -H @"$headers" "$1"
}

case "$mode" in
  deployed)
    if [ -z "$stage" ]; then
      echo "smoke-preview deployed needs the stage name" >&2
      exit 2
    fi

    # 1. Access refuses an anonymous request. Not-yet-routable answers (404,
    #    5xx) are retried; a 200 fails at once.
    verdict=""
    for _ in $(seq 1 "$ATTEMPTS"); do
      read -r status location_host < <(unauthenticated "$url/api/health")
      echo "access check: unauthenticated GET /api/health -> ${status} (redirect host: ${location_host})"
      case "$status" in
        401 | 403)
          verdict="refused"
          break
          ;;
        301 | 302 | 303 | 307 | 308)
          if [ "$location_host" = "$ACCESS_TEAM_HOST" ]; then
            verdict="redirected"
            break
          fi
          echo "Preview redirected an anonymous request somewhere other than ${ACCESS_TEAM_HOST}." >&2
          exit 1
          ;;
        2*)
          echo "Preview answered an unauthenticated request with ${status}: Cloudflare Access is not protecting it." >&2
          exit 1
          ;;
      esac
      sleep "$WAIT_SECONDS"
    done
    if [ -z "$verdict" ]; then
      echo "Access check did not settle after ${ATTEMPTS} attempts." >&2
      exit 1
    fi
    echo "access check: PASS (${verdict})"

    # 2. The service token reaches the Preview and its seeded data.
    status=""
    for _ in $(seq 1 "$ATTEMPTS"); do
      status="$(authenticated "$url/api/health")"
      [ "$status" = "200" ] && break
      sleep "$WAIT_SECONDS"
    done
    echo "service token: GET /api/health -> ${status}"
    [ "$status" = "200" ] || exit 1
    python3 - "$work/body" "$stage" <<'PY'
import json
import sys

health = json.load(open(sys.argv[1]))
assert health.get("environment") == sys.argv[2], f"health environment {health.get('environment')!r} != {sys.argv[2]!r}"
print(f"service token: health environment = {health['environment']}")
PY

    status="$(authenticated "$url/api/v1/jobs?limit=1")"
    echo "service token: GET /api/v1/jobs?limit=1 -> ${status}"
    [ "$status" = "200" ] || exit 1
    python3 - "$work/body" <<'PY'
import json
import sys

page = json.load(open(sys.argv[1]))
data = page.get("data")
assert isinstance(data, list) and len(data) >= 1, "expected at least one seeded job"
print(f"service token: jobs returned = {len(data)}, first id = {data[0].get('id')}")
PY
    echo "smoke-preview: PASS for ${stage} at ${url}"
    ;;
  deleted)
    status=""
    for _ in $(seq 1 "$ATTEMPTS"); do
      status="$(authenticated "$url/api/health")" || true
      [ "$status" = "404" ] && break
      sleep "$WAIT_SECONDS"
    done
    echo "teardown check: service token GET /api/health -> ${status}"
    if [ "$status" = "200" ]; then
      echo "The Preview still answers after teardown." >&2
      exit 1
    fi
    # Only a not-found proves the Preview is gone (review L3): a 403 is a
    # refused token, a 5xx or 000 an outage, and neither shows deletion.
    if [ "$status" != "404" ]; then
      echo "Teardown not shown: expected 404 from the deleted Preview, got ${status}." >&2
      exit 1
    fi
    echo "smoke-preview: PASS, ${url} no longer serves the Preview"
    ;;
  *)
    echo "Usage: smoke-preview.sh deployed URL STAGE | deleted URL" >&2
    exit 2
    ;;
esac
