#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash_bin="$(command -v bash)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

# Public JWT payload: {"exp":4102444800} (2100-01-01 UTC). Signature is
# synthetic because this test exercises local source/expiry handling only.
public_token='eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDB9.signature'
printf 'Current public token for Nav Job Vacancy Feed:\n%s\n' "${public_token}" > "${tmp}/public-token.txt"
printf 'EXISTING=value\n' > "${tmp}/dev.vars"

NAV_PUBLIC_TOKEN_URL="file://${tmp}/public-token.txt" \
NAV_TOKEN_OUTPUT="${tmp}/dev.vars" \
  "${bash_bin}" "${root}/scripts/refresh-nav-token.sh"

grep -Fx 'EXISTING=value' "${tmp}/dev.vars" >/dev/null
grep -Fx 'NAV_TOKEN_SOURCE=public' "${tmp}/dev.vars" >/dev/null
grep -Fx "NAV_API_TOKEN=${public_token}" "${tmp}/dev.vars" >/dev/null
[ "$(stat -c '%a' "${tmp}/dev.vars")" = '600' ]

# A valid cached public token must avoid the endpoint entirely.
NAV_PUBLIC_TOKEN_URL='file:///definitely/missing' \
NAV_TOKEN_OUTPUT="${tmp}/dev.vars" \
  "${bash_bin}" "${root}/scripts/refresh-nav-token.sh"

# A NAV-issued private token may intentionally have no exp claim. Setup must
# treat it as authoritative and never replace it with the experiment token.
private_token='eyJhbGciOiJIUzI1NiJ9.eyJraWQiOiJjb25zdW1lci0xIiwic3ViIjoiam9icy1leGFtcGxlQGV4YW1wbGUubm8ifQ.signature'
printf 'NAV_TOKEN_SOURCE=private\nNAV_API_TOKEN=%s\n' "${private_token}" > "${tmp}/private.vars"
chmod 0600 "${tmp}/private.vars"
NAV_PUBLIC_TOKEN_URL='file:///definitely/missing' \
NAV_TOKEN_OUTPUT="${tmp}/private.vars" \
  "${bash_bin}" "${root}/scripts/refresh-nav-token.sh"
grep -Fx 'NAV_TOKEN_SOURCE=private' "${tmp}/private.vars" >/dev/null
grep -Fx "NAV_API_TOKEN=${private_token}" "${tmp}/private.vars" >/dev/null

# An explicit public refresh is allowed to leave private mode. Setup never uses
# this flag; only the human-facing `just nav-token` command does.
NAV_PUBLIC_TOKEN_URL="file://${tmp}/public-token.txt" \
NAV_TOKEN_OUTPUT="${tmp}/private.vars" \
  "${bash_bin}" "${root}/scripts/refresh-nav-token.sh" --force-public
grep -Fx 'NAV_TOKEN_SOURCE=public' "${tmp}/private.vars" >/dev/null
grep -Fx "NAV_API_TOKEN=${public_token}" "${tmp}/private.vars" >/dev/null

# Optional mode must not block setup when NAV is unreachable and no cache exists.
rm -f "${tmp}/missing.vars"
NAV_PUBLIC_TOKEN_URL='file:///definitely/missing' \
NAV_TOKEN_OUTPUT="${tmp}/missing.vars" \
  "${bash_bin}" "${root}/scripts/refresh-nav-token.sh" --optional

echo "NAV token setup tests passed."
