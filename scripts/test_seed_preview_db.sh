#!/usr/bin/env bash
# Behavioural tests for scripts/seed-preview-db.sh (WS-0029@2 pass B) against
# a stub wrangler. A PR deploy (`refuse`) must never apply a D1 migration to
# the shared preview D1, and must not write at all when one is pending; only
# the host deploy (`apply`) migrates. Seeding runs only under the lease.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/bin"

cat > "${tmp}/bin/wrangler" <<'WRANGLER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${WRANGLER_CALL_LOG:?}"
case "$*" in
  "d1 migrations list "*)
    case "${STUB_PENDING:-0}" in
      1) printf 'Migrations to be applied:\n| Name |\n| 0007_new.sql |\n' ;;
      0) printf 'No migrations to apply!\n' ;;
      *) printf 'something unexpected\n' ;;
    esac
    ;;
  *"--json --command SELECT holder"*)
    printf '[{"results":[{"holder":"%s"}],"success":true}]\n' "${STUB_LEASE_HOLDER:?}"
    ;;
esac
WRANGLER
chmod +x "${tmp}/bin/wrangler"

db="job-index-pr-previews-typescript-db"
failures=0

# expect EXIT_CODE NEEDLE ENV... -- ARGS...
expect() {
  local want="$1" needle="$2"
  shift 2
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  local code=0
  : > "${tmp}/calls"
  env PATH="${tmp}/bin:$PATH" WRANGLER_CALL_LOG="${tmp}/calls" SEED_PREVIEW_WAIT_SECONDS=0 \
    STUB_LEASE_HOLDER=pr-7 "${envs[@]}" \
    bash "${root}/scripts/seed-preview-db.sh" "$@" > "${tmp}/out" 2>&1 || code=$?
  if [ "$code" -ne "$want" ] || ! grep -qF -- "$needle" "${tmp}/out"; then
    echo "FAIL: [${envs[*]}] $* -> exit ${code}, wanted ${want} and '${needle}'" >&2
    sed 's/^/    /' "${tmp}/out" >&2
    failures=$((failures + 1))
  fi
}
called() { grep -qF -- "$1" "${tmp}/calls"; }
printed() { grep -qF -- "$1" "${tmp}/out"; }
check() {
  if ! eval "$1"; then
    echo "FAIL: $2" >&2
    sed 's/^/    calls: /' "${tmp}/calls" >&2
    failures=$((failures + 1))
  fi
}

# A PR with a pending migration: fail before any write, never migrate.
expect 1 "This PR adds D1 migrations; the owner applies them" STUB_PENDING=1 -- "$db" uuid pr-7 refuse
check '! called "migrations apply"' "a PR deploy applied a migration"
check '! called "--file"' "a PR deploy with a pending migration wrote to the shared D1"
check '! printed "Could not read"' "a pending migration must be refused as such, not as an unreadable listing"
# A PR with no pending migration: schema and additive seed, still no migrate.
expect 0 "shared preview D1 is current" STUB_PENDING=0 -- "$db" uuid pr-7 refuse
check '! called "migrations apply"' "a PR deploy applied a migration"
check 'called "--file db/schema.sql"' "the PR deploy did not apply the snapshot"
check 'called "preview-seed.sql"' "the PR deploy did not apply the additive seed"
# An unreadable migration listing is not "none pending".
expect 1 "Could not read the shared preview D1's pending migrations" STUB_PENDING=x -- "$db" uuid pr-7 refuse
check '! called "--file"' "an unreadable listing still wrote to the shared D1"
# The host deploy migrates.
expect 0 "migrations: apply" STUB_LEASE_HOLDER=host -- "$db" uuid host apply
check 'called "migrations apply"' "the host deploy did not apply migrations"
# Someone else holds the lease: no seeding.
expect 1 "Could not take the shared preview D1 seed lease" STUB_LEASE_HOLDER=pr-9 -- "$db" uuid pr-7 refuse
check '! called "--file"' "seeding ran without the lease"
# Only the shared preview D1, and an explicit migrations mode.
expect 2 "only seeds the shared preview D1" -- job-index-staging-typescript-db uuid pr-7 refuse
expect 2 "must be apply (host deploy) or refuse (PR deploy)" -- "$db" uuid pr-7

if [ "$failures" -ne 0 ]; then
  echo "seed-preview-db tests: ${failures} failure(s)" >&2
  exit 1
fi
echo "seed-preview-db tests passed"
