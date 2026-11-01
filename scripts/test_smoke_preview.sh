#!/usr/bin/env bash
# Behavioural tests for scripts/smoke-preview.sh (WS-0029@2 pass B) against a
# stub curl. The case that matters most: an anonymous 200 must fail the
# smoke, so a Preview left open by a disabled Access setting fails CI.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin"

# The stub answers like the Preview would. Anonymous requests (no -H) get
# UNAUTH_STATUS / UNAUTH_LOCATION; token requests get AUTH_STATUS and a body
# chosen by path.
cat > "${tmp}/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${CURL_CALL_LOG:?}"
out=""; fmt=""; authed=0; url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) fmt="$2"; shift 2 ;;
    -H) authed=1; shift 2 ;;
    -sS) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [ "$authed" -eq 0 ]; then
  : > "$out"
  status="${UNAUTH_STATUS:?}"
  location="${UNAUTH_LOCATION:-}"
else
  status="${AUTH_STATUS:-200}"
  location=""
  case "$url" in
    */api/health) printf '{"status":"ok","environment":"%s"}' "${HEALTH_ENVIRONMENT:-pr-7}" > "$out" ;;
    */api/v1/jobs*)
      body='{"data":[{"id":"cj_1"}],"meta":{}}'
      printf '%s' "${JOBS_BODY:-$body}" > "$out"
      ;;
    *) : > "$out" ;;
  esac
fi
case "$fmt" in
  *redirect_url*) printf '%s %s' "$status" "$location" ;;
  *) printf '%s' "$status" ;;
esac
CURL
chmod +x "${tmp}/bin/curl"

url="https://pr-7-job-index-pr-previews.example.workers.dev"
secret="test-secret-value-not-on-argv"
failures=0

# expect EXIT_CODE NEEDLE ENV... -- ARGS...
expect() {
  local want="$1" needle="$2"
  shift 2
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  local log="${tmp}/out" code=0
  : > "${tmp}/calls"
  env PATH="${tmp}/bin:$PATH" CURL_CALL_LOG="${tmp}/calls" \
    CF_ACCESS_CLIENT_ID=test-id CF_ACCESS_CLIENT_SECRET="$secret" \
    SMOKE_PREVIEW_ATTEMPTS=2 SMOKE_PREVIEW_WAIT_SECONDS=0 "${envs[@]}" \
    bash "${root}/scripts/smoke-preview.sh" "$@" > "$log" 2>&1 || code=$?
  if [ "$code" -ne "$want" ] || ! grep -qF -- "$needle" "$log"; then
    echo "FAIL: [${envs[*]}] $* -> exit ${code}, wanted ${want} and '${needle}'" >&2
    sed 's/^/    /' "$log" >&2
    failures=$((failures + 1))
  fi
  if grep -qF -- "$secret" "${tmp}/calls" "$log"; then
    echo "FAIL: the service-token secret reached curl's argv or the log" >&2
    failures=$((failures + 1))
  fi
}

# Access off: the anonymous request succeeds, so the smoke must fail.
expect 1 "Cloudflare Access is not protecting it" UNAUTH_STATUS=200 -- deployed "$url" pr-7
# Access on, redirecting to the team domain, and seeded data behind it.
expect 0 "smoke-preview: PASS for pr-7" UNAUTH_STATUS=302 UNAUTH_LOCATION=https://phibkro.cloudflareaccess.com/cdn-cgi/access/login/x -- deployed "$url" pr-7
expect 0 "access check: PASS (refused)" UNAUTH_STATUS=403 -- deployed "$url" pr-7
# A redirect anywhere else is not Access.
expect 1 "somewhere other than phibkro.cloudflareaccess.com" UNAUTH_STATUS=302 UNAUTH_LOCATION=https://evil.example/ -- deployed "$url" pr-7
# A Preview that never settles is not a pass.
expect 1 "did not settle" UNAUTH_STATUS=404 -- deployed "$url" pr-7
# The token must reach a seeded Preview of the right stage.
expect 1 "expected at least one seeded job" UNAUTH_STATUS=403 'JOBS_BODY={"data":[],"meta":{}}' -- deployed "$url" pr-7
expect 1 "health environment" UNAUTH_STATUS=403 HEALTH_ENVIRONMENT=staging -- deployed "$url" pr-7
expect 1 "service token: GET /api/health -> 403" UNAUTH_STATUS=403 AUTH_STATUS=403 -- deployed "$url" pr-7
# Teardown: a Preview that still answers fails; a gone one passes.
expect 1 "still answers after teardown" UNAUTH_STATUS=403 AUTH_STATUS=200 -- deleted "$url"
expect 0 "no longer serves the Preview" UNAUTH_STATUS=403 AUTH_STATUS=404 -- deleted "$url"
# Only workers.dev Preview URLs, and only with the token present.
expect 2 "workers.dev URL" UNAUTH_STATUS=403 -- deployed "https://job-index.phibkro.org" pr-7
expect 2 "CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET" UNAUTH_STATUS=403 CF_ACCESS_CLIENT_SECRET= -- deployed "$url" pr-7

if [ "$failures" -ne 0 ]; then
  echo "smoke-preview tests: ${failures} failure(s)" >&2
  exit 1
fi
echo "smoke-preview tests passed"
