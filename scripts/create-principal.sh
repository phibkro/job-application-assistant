#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: create-principal.sh BASE_URL [NAME] [ROLE] [QUOTA]}"
name="${2:-Job Index client}"
role="${3:-member}"
quota="${4:-20}"
output="${JOB_INDEX_PRINCIPAL_FILE:-.principal.env}"
api_key="$(python3 - <<'PY'
import secrets
print("ji_" + secrets.token_urlsafe(32))
PY
)"
headers=(-H 'content-type: application/json')
if [ -n "${ADMIN_SYNC_TOKEN:-}" ]; then
  headers+=(-H "authorization: Bearer ${ADMIN_SYNC_TOKEN}")
fi
response="$(curl --fail --silent --show-error \
  "${headers[@]}" \
  -X POST "${base_url%/}/api/admin/principals" \
  --data "$(python3 - "$name" "$role" "$quota" "$api_key" <<'PY'
import json,sys
print(json.dumps({"name":sys.argv[1],"role":sys.argv[2],"search_quota":int(sys.argv[3]),"api_key":sys.argv[4]}))
PY
)")"
principal_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["id"])' <<<"${response}")"
umask 077
cat > "${output}" <<EOF
JOB_INDEX_PRINCIPAL_ID=${principal_id}
JOB_INDEX_API_KEY=${api_key}
EOF
chmod 600 "${output}"
echo "Principal ${principal_id} created; API key stored in ${output}."
