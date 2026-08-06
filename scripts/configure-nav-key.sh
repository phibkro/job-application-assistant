#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

output="${NAV_TOKEN_OUTPUT:-.dev.vars}"
validation_url="${NAV_KEY_VALIDATION_URL:-https://pam-stilling-feed.nav.no/api/v1/feed?last=true}"
deploy_environment="${NAV_DEPLOY_ENVIRONMENT:-staging}"
config="${NAV_WRANGLER_CONFIG:-wrangler.${deploy_environment}.deploy.jsonc}"
evidence=".deploy/${deploy_environment}.json"
cloudflare=0
reuse=0

usage() {
  cat <<'USAGE'
usage: configure-nav-key.sh [--cloudflare] [--reuse]

  --cloudflare  also upload NAV_API_TOKEN to the already deployed Worker
  --reuse       read an existing private token from .dev.vars instead of prompting

Token input precedence:
  NAV_PRIVATE_API_TOKEN, NAV_API_TOKEN, existing private .dev.vars with --reuse,
  then a hidden interactive prompt.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --cloudflare)
      cloudflare=1
      ;;
    --reuse)
      reuse=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

read_private_from_file() {
  [ -f "${output}" ] || return 0
  python3 - "${output}" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
values = {}
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
if values.get("NAV_TOKEN_SOURCE") == "private":
    print(values.get("NAV_API_TOKEN", ""))
PY
}

extract_jwt() {
  python3 -c 'import re,sys; matches=re.findall(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", sys.stdin.read()); print(matches[-1] if matches else "")'
}

raw_token="${NAV_PRIVATE_API_TOKEN:-${NAV_API_TOKEN:-}}"
if [ -z "${raw_token}" ] && [ "${reuse}" -eq 1 ]; then
  raw_token="$(read_private_from_file || true)"
fi

if [ -z "${raw_token}" ]; then
  if [ ! -t 0 ]; then
    echo "No NAV private token supplied. Set NAV_PRIVATE_API_TOKEN or run interactively." >&2
    exit 2
  fi
  echo 'NAV private tokens are issued after consumer registration; see docs/public/how-to/configure-nav-auth.md.' >&2
  printf 'Paste the NAV private bearer token: ' >&2
  IFS= read -r -s raw_token
  printf '\n' >&2
fi

token="$(printf '%s' "${raw_token}" | extract_jwt)"
unset raw_token

if [ -z "${token}" ]; then
  echo "Input did not contain a three-part JWT bearer token." >&2
  exit 1
fi

metadata="$(python3 - "${token}" <<'PY'
import base64, datetime, json, sys, time

def decode(segment: str):
    segment += "=" * (-len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(segment))

try:
    token = sys.argv[1]
    header, payload, _signature = token.split(".")
    header_data = decode(header)
    claims = decode(payload)
except Exception as exc:
    raise SystemExit(f"Unable to decode NAV JWT: {exc}")

exp = claims.get("exp")
if exp is not None and int(exp) <= int(time.time()):
    raise SystemExit("NAV JWT is expired")

expires = "none"
if exp is not None:
    expires = datetime.datetime.fromtimestamp(int(exp), datetime.timezone.utc).isoformat()

print(json.dumps({
    "algorithm": header_data.get("alg", "unknown"),
    "issuer": claims.get("iss", "unknown"),
    "audience": claims.get("aud", "unknown"),
    "consumer_id": claims.get("kid", "unknown"),
    "subject": claims.get("sub", "unknown"),
    "expires": expires,
}, separators=(",", ":")))
PY
)"

if [ "${NAV_KEY_SKIP_REMOTE_VALIDATION:-0}" != "1" ]; then
  status="$(
    curl \
      --silent \
      --show-error \
      --location \
      --output /dev/null \
      --write-out '%{http_code}' \
      --header 'Accept: application/json' \
      --header "Authorization: Bearer ${token}" \
      "${validation_url}"
  )"
  case "${status}" in
    200|304)
      ;;
    *)
      echo "NAV rejected the private token during feed validation (HTTP ${status})." >&2
      exit 1
      ;;
  esac
fi

write_private_token() {
  local temporary
  mkdir -p "$(dirname "${output}")"
  temporary="$(mktemp "${output}.tmp.XXXXXX")"
  python3 - "${output}" "${temporary}" "${token}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
token = sys.argv[3]
lines = source.read_text().splitlines() if source.exists() else []
kept = []
for raw in lines:
    stripped = raw.strip()
    if stripped in {
        "# NAV-issued private consumer token; managed by just nav-key.",
        "# Rotating NAV public experiment token; managed by just nav-token.",
    }:
        continue
    if stripped and not stripped.startswith("#") and "=" in stripped:
        key = stripped.split("=", 1)[0].strip()
        if key in {"NAV_API_TOKEN", "NAV_TOKEN_SOURCE"}:
            continue
    kept.append(raw)
while kept and not kept[-1].strip():
    kept.pop()
if kept:
    kept.append("")
kept.extend([
    "# NAV-issued private consumer token; managed by just nav-key.",
    f"NAV_TOKEN_SOURCE=private",
    f"NAV_API_TOKEN={token}",
])
target.write_text("\n".join(kept) + "\n")
PY
  chmod 0600 "${temporary}"
  mv "${temporary}" "${output}"
}

write_private_token

python3 - "${metadata}" "${output}" <<'PY'
import json, sys
metadata = json.loads(sys.argv[1])
print(f"NAV private consumer token configured in {sys.argv[2]}.")
print(f"  consumer: {metadata['consumer_id']}")
print(f"  subject:  {metadata['subject']}")
print(f"  issuer:   {metadata['issuer']}")
print(f"  expires:  {metadata['expires']}")
PY

if [ "${cloudflare}" -eq 1 ]; then
  if [ ! -f "${config}" ] || [ ! -f "${evidence}" ]; then
    echo "A successful deployment is required before rotating the remote NAV key." >&2
    echo "Deploy ${deploy_environment} first, or omit --cloudflare to configure local development only." >&2
    exit 1
  fi
  printf '%s\n' "${token}" \
    | env CI=1 wrangler secret put NAV_API_TOKEN --config "${config}"
  echo "NAV_API_TOKEN updated on the deployed Worker."
fi

unset token metadata
