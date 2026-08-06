#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

output="${ADMIN_TOKEN_OUTPUT:-.dev.vars}"
provided="${ADMIN_SYNC_TOKEN:-}"

if [ -z "${provided}" ]; then
  provided="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
)"
fi

if [ "${#provided}" -lt 32 ]; then
  echo "ADMIN_SYNC_TOKEN must contain at least 32 characters." >&2
  exit 1
fi

mkdir -p "$(dirname "${output}")"
temporary="$(mktemp "${output}.tmp.XXXXXX")"
python3 - "${output}" "${temporary}" "${provided}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
token = sys.argv[3]
lines = source.read_text().splitlines() if source.exists() else []
kept = []
for raw in lines:
    stripped = raw.strip()
    if stripped == "# Administrative bearer token; managed by just admin-key.":
        continue
    if stripped and not stripped.startswith("#") and "=" in stripped:
        key = stripped.split("=", 1)[0].strip()
        if key == "ADMIN_SYNC_TOKEN":
            continue
    kept.append(raw)
while kept and not kept[-1].strip():
    kept.pop()
if kept:
    kept.append("")
kept.extend([
    "# Administrative bearer token; managed by just admin-key.",
    f"ADMIN_SYNC_TOKEN={token}",
])
target.write_text("\n".join(kept) + "\n")
PY
chmod 0600 "${temporary}"
mv "${temporary}" "${output}"
unset provided

echo "Administrative sync token configured in ${output}."
echo "The value was not printed. Preserve ${output} or provide ADMIN_SYNC_TOKEN during deployment."
