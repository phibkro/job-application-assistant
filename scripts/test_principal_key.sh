#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin"
cat > "${tmp}/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${JOB_INDEX_TEST_CURL_ARGS}"
printf '%s\n' '{"data":{"id":"principal_test"}}'
CURL
chmod +x "${tmp}/bin/curl"

output_file="${tmp}/principal.env"
stdout_file="${tmp}/stdout"
PATH="${tmp}/bin:${PATH}" \
JOB_INDEX_TEST_CURL_ARGS="${tmp}/curl.args" \
JOB_INDEX_PRINCIPAL_FILE="${output_file}" \
  "${root}/scripts/create-principal.sh" \
  "https://job-index.example.invalid" "Test principal" member 20 \
  > "${stdout_file}"

[ "$(stat -c '%a' "${output_file}")" = "600" ]
grep -q '^JOB_INDEX_PRINCIPAL_ID=principal_test$' "${output_file}"
grep -Eq '^JOB_INDEX_API_KEY=ji_[A-Za-z0-9_-]{40,}$' "${output_file}"
# Asserted with an explicit branch: errexit does not apply to a `!`-inverted
# command, so `! grep ...` would report a leaked key by doing nothing.
if grep -q 'JOB_INDEX_API_KEY\|ji_' "${stdout_file}"; then
  echo "create-principal.sh leaked the API key to standard output" >&2
  exit 1
fi
grep -q 'principal_test' "${stdout_file}"
grep -q '"api_key"' "${tmp}/curl.args"

echo "Principal-key generation checks passed."
