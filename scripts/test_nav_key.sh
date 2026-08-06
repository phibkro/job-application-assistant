#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash_bin="$(command -v bash)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

# Synthetic NAV-style private JWT with no expiry. The live request is skipped;
# production configuration performs an authenticated feed request.
token='eyJhbGciOiJIUzI1NiJ9.eyJraWQiOiJjb25zdW1lci0xIiwic3ViIjoiam9icy1leGFtcGxlQGV4YW1wbGUubm8iLCJpc3MiOiJwYW0tc3RpbGxpbmctZmVlZCIsImF1ZCI6InB1YmxpYy1mZWVkIn0.signature'
printf 'EXISTING=value\n' > "${tmp}/dev.vars"

output="$(
  NAV_PRIVATE_API_TOKEN="Authorization: Bearer ${token}" \
  NAV_TOKEN_OUTPUT="${tmp}/dev.vars" \
  NAV_KEY_SKIP_REMOTE_VALIDATION=1 \
    "${bash_bin}" "${root}/scripts/configure-nav-key.sh"
)"
if printf '%s' "${output}" | grep -F "${token}" >/dev/null; then
  echo "private token leaked to command output" >&2
  exit 1
fi

grep -Fx 'EXISTING=value' "${tmp}/dev.vars" >/dev/null
grep -Fx 'NAV_TOKEN_SOURCE=private' "${tmp}/dev.vars" >/dev/null
grep -Fx "NAV_API_TOKEN=${token}" "${tmp}/dev.vars" >/dev/null
[ "$(stat -c '%a' "${tmp}/dev.vars")" = '600' ]

# Reuse must not prompt and must leave the private credential unchanged.
NAV_TOKEN_OUTPUT="${tmp}/dev.vars" \
NAV_KEY_SKIP_REMOTE_VALIDATION=1 \
  "${bash_bin}" "${root}/scripts/configure-nav-key.sh" --reuse >/dev/null

grep -Fx "NAV_API_TOKEN=${token}" "${tmp}/dev.vars" >/dev/null

echo "NAV private-key configuration tests passed."
