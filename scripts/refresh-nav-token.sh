#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

endpoint="${NAV_PUBLIC_TOKEN_URL:-https://pam-stilling-feed.nav.no/api/publicToken}"
output="${NAV_TOKEN_OUTPUT:-.dev.vars}"
minimum_ttl="${NAV_PUBLIC_TOKEN_MIN_TTL_SECONDS:-86400}"
optional=0
force_public=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --optional)
      optional=1
      ;;
    --force-public)
      force_public=1
      ;;
    *)
      echo "usage: $0 [--optional] [--force-public]" >&2
      exit 2
      ;;
  esac
  shift
done

read_existing_credentials() {
  if [ -n "${NAV_API_TOKEN:-}" ]; then
    printf '%s\t%s\n' "${NAV_TOKEN_SOURCE:-private}" "${NAV_API_TOKEN}"
    return
  fi
  if [ -f "${output}" ]; then
    python3 - "${output}" <<'PY'
import pathlib, sys
values = {}
for raw in pathlib.Path(sys.argv[1]).read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
token = values.get("NAV_API_TOKEN", "")
if token:
    # Files created before source metadata existed contained public tokens.
    print(values.get("NAV_TOKEN_SOURCE", "public"), token, sep="\t")
PY
  fi
}

token_state() {
  python3 - "$1" "$2" "${minimum_ttl}" <<'PY'
import base64, json, sys, time
source, token, minimum_ttl = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("not a JWT")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    exp = claims.get("exp")
    if source == "private":
        if exp is None or int(exp) > int(time.time()) + minimum_ttl:
            print("fresh")
        else:
            print("expired-private")
    elif exp is not None and int(exp) > int(time.time()) + minimum_ttl:
        print("fresh")
    else:
        print("stale-public")
except Exception:
    print("invalid-private" if source == "private" else "stale-public")
PY
}

write_token() {
  local token="$1"
  local source="$2"
  local temporary
  mkdir -p "$(dirname "${output}")"
  temporary="$(mktemp "${output}.tmp.XXXXXX")"
  python3 - "${output}" "${temporary}" "${token}" "${source}" <<'PY'
import pathlib, sys
source_path = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
token = sys.argv[3]
source_kind = sys.argv[4]
lines = source_path.read_text().splitlines() if source_path.exists() else []
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
comment = (
    "# NAV-issued private consumer token; managed by just nav-key."
    if source_kind == "private"
    else "# Rotating NAV public experiment token; managed by just nav-token."
)
kept.extend([
    comment,
    f"NAV_TOKEN_SOURCE={source_kind}",
    f"NAV_API_TOKEN={token}",
])
target.write_text("\n".join(kept) + "\n")
PY
  chmod 0600 "${temporary}"
  mv "${temporary}" "${output}"
}

existing_record=""
if [ "${force_public}" -eq 0 ]; then
  existing_record="$(read_existing_credentials || true)"
fi
existing_source="${existing_record%%$'\t'*}"
existing_token=""
if [[ "${existing_record}" == *$'\t'* ]]; then
  existing_token="${existing_record#*$'\t'}"
fi

if [ -n "${existing_token}" ]; then
  state="$(token_state "${existing_source}" "${existing_token}")"
  case "${state}" in
    fresh)
      write_token "${existing_token}" "${existing_source}"
      echo "NAV ${existing_source} token ready in ${output}."
      exit 0
      ;;
    expired-private|invalid-private)
      message="Configured NAV private token is expired or invalid; obtain a replacement from NAV and run just nav-key."
      if [ "${optional}" -eq 1 ]; then
        echo "Warning: ${message}" >&2
        exit 0
      fi
      echo "${message}" >&2
      exit 1
      ;;
  esac
fi

if ! response="$(curl --fail --silent --show-error --location "${endpoint}")"; then
  if [ "${optional}" -eq 1 ]; then
    echo "Warning: NAV public token could not be refreshed; live NAV sync may be unavailable." >&2
    exit 0
  fi
  exit 1
fi

token="$(python3 -c 'import re,sys; matches=re.findall(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", sys.stdin.read()); print(matches[-1] if matches else "")' <<<"${response}")"
if [ -z "${token}" ] || [ "$(token_state public "${token}")" != "fresh" ]; then
  echo "NAV public token endpoint did not return a usable JWT." >&2
  if [ "${optional}" -eq 1 ]; then
    exit 0
  fi
  exit 1
fi

write_token "${token}" public
expiry="$(python3 - "${token}" <<'PY'
import base64, datetime, json, sys
payload = sys.argv[1].split(".")[1]
payload += "=" * (-len(payload) % 4)
exp = int(json.loads(base64.urlsafe_b64decode(payload))["exp"])
print(datetime.datetime.fromtimestamp(exp, datetime.timezone.utc).isoformat())
PY
)"
echo "NAV public token refreshed in ${output}; expires ${expiry}."
