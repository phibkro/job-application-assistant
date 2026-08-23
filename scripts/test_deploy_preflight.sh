#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# `env -i` below isolates deployment *variables*, which is what the preflight
# reads. The pinned toolchain PATH is prepended with the stub directory instead
# of being replaced, because deploy.sh legitimately runs inside that toolchain.
bash_bin="$(command -v bash)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin"

cat > "${tmp}/bin/wrangler" <<'WRANGLER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${WRANGLER_CALL_LOG:?}"
case "${1:-}" in
  whoami)
    exit "${WRANGLER_WHOAMI_STATUS:-99}"
    ;;
  login)
    exit "${WRANGLER_LOGIN_STATUS:-99}"
    ;;
esac
exit 99
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
exit "${BUN_STATUS:-23}"
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

create_fixture_repo() {
  local repo="$1"
  mkdir -p "${repo}/scripts" "${repo}/infra"
  cp "${root}/scripts/deploy.sh" "${repo}/scripts/deploy.sh"
  chmod +x "${repo}/scripts/deploy.sh"
}

assert_deploy_paths_absent() {
  local repo="$1"
  [ ! -e "${repo}/.deploy" ] || {
    echo "unexpected deployment state directory: ${repo}/.deploy" >&2
    exit 1
  }
  [ ! -e "${repo}/.artifacts/deploy/production" ] || {
    echo "unexpected deployment log directory: ${repo}/.artifacts/deploy/production" >&2
    exit 1
  }
}

assert_deploy_paths_present() {
  local repo="$1"
  [ -d "${repo}/.deploy" ] || {
    echo "missing deployment state directory: ${repo}/.deploy" >&2
    exit 1
  }
  [ -d "${repo}/.artifacts/deploy/production" ] || {
    echo "missing deployment log directory: ${repo}/.artifacts/deploy/production" >&2
    exit 1
  }
}

run_fixture_deploy() {
  local repo="$1"
  shift
  env -i \
    HOME="${tmp}" \
    PATH="${tmp}/bin:${PATH}" \
    WRANGLER_CALL_LOG="${repo}/wrangler-calls" \
    CURL_CALL_LOG="${repo}/curl-calls" \
    BUN_CALL_LOG="${repo}/bun-calls" \
    JOB_INDEX_DEV_VARS_FILE="${repo}/missing.dev.vars" \
    "$@" \
    "${bash_bin}" "${repo}/scripts/deploy.sh" production
}

assert_preflight_failure() {
  local expected="$1"
  shift
  local repo="${tmp}/repo-preflight-${expected//[^A-Za-z0-9]/_}"
  create_fixture_repo "${repo}"
  : > "${repo}/wrangler-calls"
  : > "${repo}/curl-calls"
  : > "${repo}/bun-calls"
  set +e
  output="$(run_fixture_deploy "${repo}" "$@" 2>&1)"
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
  [ ! -s "${repo}/wrangler-calls" ] || {
    echo "Wrangler was invoked before production preflight completed" >&2
    cat "${repo}/wrangler-calls" >&2
    exit 1
  }
  [ ! -s "${repo}/bun-calls" ] || {
    echo "Dependency install ran before production preflight completed" >&2
    cat "${repo}/bun-calls" >&2
    exit 1
  }
  assert_deploy_paths_absent "${repo}"
}

assert_wrangler_auth_failure() {
  local repo="${tmp}/repo-wrangler-auth-failure"
  create_fixture_repo "${repo}"
  : > "${repo}/wrangler-calls"
  : > "${repo}/curl-calls"
  : > "${repo}/bun-calls"
  set +e
  output="$(
    run_fixture_deploy \
      "${repo}" \
      NAV_PRIVATE_API_TOKEN="${private_token}" \
      ADMIN_SYNC_TOKEN=0123456789abcdef0123456789abcdef \
      WRANGLER_WHOAMI_STATUS=1 \
      WRANGLER_LOGIN_STATUS=1 2>&1
  )"
  status=$?
  set -e
  [ "${status}" -eq 1 ] || {
    echo "rejected Wrangler authentication exited ${status}, expected 1" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  printf '%s\n' "${output}" | grep -F "Cloudflare authentication is required; opening Wrangler login..." >/dev/null || {
    echo "rejected Wrangler authentication did not prompt for login" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  cat > "${repo}/wrangler-expected" <<'EXPECTED'
whoami
login
EXPECTED
  cmp -s "${repo}/wrangler-expected" "${repo}/wrangler-calls" || {
    echo "Wrangler authentication failure did not record whoami then login" >&2
    cat "${repo}/wrangler-calls" >&2
    exit 1
  }
  [ ! -s "${repo}/bun-calls" ] || {
    echo "Dependency install ran after rejected Wrangler authentication" >&2
    cat "${repo}/bun-calls" >&2
    exit 1
  }
  assert_deploy_paths_absent "${repo}"
}

assert_successful_wrangler_auth_then_bounded_failure() {
  local repo="${tmp}/repo-wrangler-auth-success"
  create_fixture_repo "${repo}"
  : > "${repo}/wrangler-calls"
  : > "${repo}/curl-calls"
  : > "${repo}/bun-calls"
  set +e
  output="$(
    run_fixture_deploy \
      "${repo}" \
      NAV_PRIVATE_API_TOKEN="${private_token}" \
      ADMIN_SYNC_TOKEN=0123456789abcdef0123456789abcdef \
      WRANGLER_WHOAMI_STATUS=0 \
      BUN_STATUS=23 2>&1
  )"
  status=$?
  set -e
  [ "${status}" -eq 23 ] || {
    echo "bounded dependency failure exited ${status}, expected 23" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  printf '%s\n' "${output}" | grep -F "Installing infra dependencies..." >/dev/null || {
    echo "bounded dependency failure did not reach infra install" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
  cat > "${repo}/wrangler-expected" <<'EXPECTED'
whoami
EXPECTED
  cmp -s "${repo}/wrangler-expected" "${repo}/wrangler-calls" || {
    echo "successful Wrangler authentication should only record whoami" >&2
    cat "${repo}/wrangler-calls" >&2
    exit 1
  }
  printf '%s\n' "install" > "${repo}/bun-expected"
  cmp -s "${repo}/bun-expected" "${repo}/bun-calls" || {
    echo "bounded dependency failure did not stop at bun install" >&2
    cat "${repo}/bun-calls" >&2
    exit 1
  }
  assert_deploy_paths_present "${repo}"
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

assert_wrangler_auth_failure
assert_successful_wrangler_auth_then_bounded_failure

# The source-URL preflight assertions are gone with the AGPL obligation that
# required them. The credential gates above stay: those protect production,
# not a licence term.

echo "Production deployment preflight tests passed."
