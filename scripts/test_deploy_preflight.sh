#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# `env -i` below isolates deployment *variables*, which is what the preflight
# reads. The pinned toolchain PATH is prepended with the stub directory instead
# of being replaced, because deploy.sh legitimately runs inside that toolchain.
bash_bin="$(command -v bash)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
fixture="${tmp}/repository"
mkdir -p "${tmp}/bin" "${fixture}/scripts" "${fixture}/infra"
cp "${root}/scripts/deploy.sh" "${fixture}/scripts/deploy.sh"

cat > "${tmp}/bin/wrangler" <<'WRANGLER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${WRANGLER_CALL_LOG:?}"
case "${1:-}" in
  whoami) exit "${WRANGLER_WHOAMI_STATUS:-1}" ;;
  login) exit "${WRANGLER_LOGIN_STATUS:-1}" ;;
  *) exit 99 ;;
esac
WRANGLER
chmod +x "${tmp}/bin/wrangler"

cat > "${tmp}/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${CURL_CALL_LOG:?}"
printf '%s' "${CURL_STATUS:-200}"
CURL
chmod +x "${tmp}/bin/curl"

cat > "${tmp}/bin/bun" <<'BUN'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${BUN_CALL_LOG:?}"
exit "${BUN_STATUS:-42}"
BUN
chmod +x "${tmp}/bin/bun"

make_jwt() {
  python3 - <<'PYJWT'
import base64
import json

encode = lambda value: base64.urlsafe_b64encode(
    json.dumps(value, separators=(",", ":")).encode()
).decode().rstrip("=")
print(f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode({'sub': 'test-private'})}.signature")
PYJWT
}

private_token="$(make_jwt)"

assert_preflight_failure() {
  local expected="$1"
  shift
  : > "${tmp}/wrangler-calls"
  : > "${tmp}/curl-calls"
  : > "${tmp}/bun-calls"
  set +e
  output="$(
    env -i \
      HOME="${tmp}" \
      PATH="${tmp}/bin:${PATH}" \
      WRANGLER_CALL_LOG="${tmp}/wrangler-calls" \
      CURL_CALL_LOG="${tmp}/curl-calls" \
      BUN_CALL_LOG="${tmp}/bun-calls" \
      JOB_INDEX_DEV_VARS_FILE="${tmp}/missing.dev.vars" \
      "$@" \
      "${bash_bin}" "${fixture}/scripts/deploy.sh" production 2>&1
  )"
  status=$?
  set -e
  [ "${status}" -eq 1 ] || {
    echo "production preflight exited ${status}, expected 1" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  printf '%s\n' "${output}" | grep -F "${expected}" >/dev/null || {
    echo "production preflight did not report: ${expected}" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  [ ! -e "${fixture}/.deploy" ] || {
    echo "rejected preflight created ${fixture}/.deploy" >&2
    exit 1
  }
  [ ! -e "${fixture}/.artifacts/deploy/production" ] || {
    echo "rejected preflight created ${fixture}/.artifacts/deploy/production" >&2
    exit 1
  }
  [ ! -s "${tmp}/wrangler-calls" ] || {
    echo "Wrangler was invoked before production preflight completed" >&2
    cat "${tmp}/wrangler-calls" >&2
    exit 1
  }
}

assert_preflight_failure \
  "Production requires a NAV-issued private consumer token." \
  env

assert_preflight_failure \
  "Production NAV token is not a usable JWT" \
  env NAV_PRIVATE_API_TOKEN=not-a-jwt

assert_preflight_failure \
  "Production requires ADMIN_SYNC_TOKEN." \
  env NAV_PRIVATE_API_TOKEN="${private_token}"

assert_preflight_failure \
  "Production ADMIN_SYNC_TOKEN must contain at least 32 characters." \
  env NAV_PRIVATE_API_TOKEN="${private_token}" ADMIN_SYNC_TOKEN=too-short

assert_preflight_failure \
  "NAV rejected the configured private token during feed validation (HTTP 401)." \
  env NAV_PRIVATE_API_TOKEN="${private_token}" ADMIN_SYNC_TOKEN=0123456789abcdef0123456789abcdef CURL_STATUS=401

# Authentication is itself part of the side-effect-free preflight. A rejected
# session records the attempted whoami and login without creating deploy paths.
: > "${tmp}/wrangler-calls"
set +e
auth_output="$(
  env -i \
    HOME="${tmp}" \
    PATH="${tmp}/bin:${PATH}" \
    WRANGLER_CALL_LOG="${tmp}/wrangler-calls" \
    WRANGLER_WHOAMI_STATUS=1 \
    WRANGLER_LOGIN_STATUS=1 \
    CURL_CALL_LOG="${tmp}/curl-calls" \
    BUN_CALL_LOG="${tmp}/bun-calls" \
    JOB_INDEX_DEV_VARS_FILE="${tmp}/missing.dev.vars" \
    NAV_PRIVATE_API_TOKEN="${private_token}" \
    ADMIN_SYNC_TOKEN=0123456789abcdef0123456789abcdef \
    "${bash_bin}" "${fixture}/scripts/deploy.sh" production 2>&1
)"
auth_status=$?
set -e
[ "${auth_status}" -eq 1 ] || {
  echo "rejected Wrangler authentication exited ${auth_status}, expected 1" >&2
  printf '%s\n' "${auth_output}" >&2
  exit 1
}
[ "$(sed -n '1p' "${tmp}/wrangler-calls")" = "whoami" ]
[ "$(sed -n '2p' "${tmp}/wrangler-calls")" = "login" ]
[ "$(wc -l < "${tmp}/wrangler-calls")" -eq 2 ]
[ ! -e "${fixture}/.deploy" ]
[ ! -e "${fixture}/.artifacts/deploy/production" ]

# Once Wrangler authentication succeeds, deploy paths must exist before the
# next bounded failure (the deliberately failing dependency install).
: > "${tmp}/wrangler-calls"
: > "${tmp}/bun-calls"
set +e
success_output="$(
  env -i \
    HOME="${tmp}" \
    PATH="${tmp}/bin:${PATH}" \
    WRANGLER_CALL_LOG="${tmp}/wrangler-calls" \
    WRANGLER_WHOAMI_STATUS=0 \
    CURL_CALL_LOG="${tmp}/curl-calls" \
    BUN_CALL_LOG="${tmp}/bun-calls" \
    JOB_INDEX_DEV_VARS_FILE="${tmp}/missing.dev.vars" \
    NAV_PRIVATE_API_TOKEN="${private_token}" \
    ADMIN_SYNC_TOKEN=0123456789abcdef0123456789abcdef \
    "${bash_bin}" "${fixture}/scripts/deploy.sh" production 2>&1
)"
success_status=$?
set -e
[ "${success_status}" -eq 42 ] || {
  echo "authenticated fixture exited ${success_status}, expected 42" >&2
  printf '%s\n' "${success_output}" >&2
  exit 1
}
[ "$(cat "${tmp}/wrangler-calls")" = "whoami" ]
[ "$(cat "${tmp}/bun-calls")" = "install" ]
[ -d "${fixture}/.deploy" ]
[ -d "${fixture}/.artifacts/deploy/production" ]

# The source-URL preflight assertions are gone with the AGPL obligation that
# required them. The credential gates above stay: those protect production,
# not a licence term.

echo "Production deployment preflight tests passed with side effects bounded to the fixture."
