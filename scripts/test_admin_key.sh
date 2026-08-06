#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
output="${work}/dev.vars"
sentinel="admin-token-that-must-never-be-printed-0123456789"
printf 'EXISTING=value\n' > "${output}"

ADMIN_TOKEN_OUTPUT="${output}" ADMIN_SYNC_TOKEN="${sentinel}" \
  "${root}/scripts/configure-admin-key.sh" > "${work}/stdout" 2> "${work}/stderr"

if grep -R --fixed-strings "${sentinel}" "${work}/stdout" "${work}/stderr" >/dev/null; then
  echo "configure-admin-key leaked the token" >&2
  exit 1
fi
python3 - "${output}" "${sentinel}" <<'PY'
import os, pathlib, stat, sys
path = pathlib.Path(sys.argv[1])
token = sys.argv[2]
values = {}
for raw in path.read_text().splitlines():
    if raw.strip() and not raw.lstrip().startswith("#") and "=" in raw:
        key, value = raw.split("=", 1)
        values[key] = value
assert values["EXISTING"] == "value", values
assert values["ADMIN_SYNC_TOKEN"] == token, values
assert stat.S_IMODE(path.stat().st_mode) == 0o600, oct(stat.S_IMODE(path.stat().st_mode))
PY

# The generated path must also produce a strong token without printing it.
generated="${work}/generated.vars"
ADMIN_TOKEN_OUTPUT="${generated}" \
  "${root}/scripts/configure-admin-key.sh" > "${work}/generated.stdout"
python3 - "${generated}" <<'PY'
import pathlib, sys
value = next(
    line.split("=", 1)[1]
    for line in pathlib.Path(sys.argv[1]).read_text().splitlines()
    if line.startswith("ADMIN_SYNC_TOKEN=")
)
assert len(value) >= 32, len(value)
PY

echo "Administrative credential checks passed."
