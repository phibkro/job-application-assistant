#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8787}"
OUTPUT_DIR="${SMOKE_OUTPUT_DIR:-.artifacts/smoke}"
mkdir -p "${OUTPUT_DIR}"

curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/reset" > "${OUTPUT_DIR}/reset.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/atomicity" > "${OUTPUT_DIR}/atomicity.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/collect" > "${OUTPUT_DIR}/initial.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/collect" > "${OUTPUT_DIR}/replay.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/jobs" > "${OUTPUT_DIR}/jobs.json"
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/searches" \
  --data '{"name":"Oslo support and customer service","definition":{"locations":["Oslo"],"include_terms":["support","customer"],"exclude_terms":["senior"]}}' \
  > "${OUTPUT_DIR}/search-create.json"
search_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "${OUTPUT_DIR}/search-create.json")"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-initial.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-idle.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/active" > "${OUTPUT_DIR}/search-nav-active.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-nav-added.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/update" > "${OUTPUT_DIR}/search-nav-update.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-nav-updated.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/nonmatching" > "${OUTPUT_DIR}/search-nav-nonmatching.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-nav-removed.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/active" > "${OUTPUT_DIR}/search-nav-reactive.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-nav-readded.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/close" > "${OUTPUT_DIR}/search-nav-close.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-nav-closed.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/searches/${search_id}/evaluate" > "${OUTPUT_DIR}/search-final-idle.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/searches/${search_id}/matches" > "${OUTPUT_DIR}/search-matches.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/reset" > "${OUTPUT_DIR}/lifecycle-reset.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/active" > "${OUTPUT_DIR}/nav-active.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/close" > "${OUTPUT_DIR}/nav-close.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/close" > "${OUTPUT_DIR}/nav-close-replay.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/active" > "${OUTPUT_DIR}/nav-reopen.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/update" > "${OUTPUT_DIR}/nav-update.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/cursor-failure" > "${OUTPUT_DIR}/nav-cursor-failure.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/nav/lease" > "${OUTPUT_DIR}/nav-lease.json"


# Production API and ownership journey. The reset keeps this independent from
# the legacy fixture/lifecycle assertions above.
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/reset" > "${OUTPUT_DIR}/production-reset.json"
curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/demo/collect" > "${OUTPUT_DIR}/production-collect.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/jobs?limit=1" > "${OUTPUT_DIR}/v1-jobs-page-1.json"
v1_cursor="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["meta"]["next_cursor"])' "${OUTPUT_DIR}/v1-jobs-page-1.json")"
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/jobs?limit=1&cursor=${v1_cursor}" > "${OUTPUT_DIR}/v1-jobs-page-2.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/changes?after_sequence=0&limit=2" > "${OUTPUT_DIR}/v1-changes.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/sources" > "${OUTPUT_DIR}/v1-sources.json"

invalid_query_status="$(curl --silent --output "${OUTPUT_DIR}/invalid-query.json" --write-out '%{http_code}' \
  "${BASE_URL}/api/v1/jobs?status=invalid")"
[ "${invalid_query_status}" = "400" ]

member_key="member-key-000000000000000000000000000000000000000000000000"
reader_key="reader-key-000000000000000000000000000000000000000000000000"
other_key="other-key-0000000000000000000000000000000000000000000000000"

curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/principals" \
  --data "{\"name\":\"Smoke member\",\"api_key\":\"${member_key}\",\"role\":\"member\",\"search_quota\":5}" \
  > "${OUTPUT_DIR}/principal-member.json"
curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/principals" \
  --data "{\"name\":\"Smoke reader\",\"api_key\":\"${reader_key}\",\"role\":\"reader\",\"search_quota\":5}" \
  > "${OUTPUT_DIR}/principal-reader.json"
curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/principals" \
  --data "{\"name\":\"Other member\",\"api_key\":\"${other_key}\",\"role\":\"member\",\"search_quota\":5}" \
  > "${OUTPUT_DIR}/principal-other.json"

reader_create_status="$(curl --silent --output "${OUTPUT_DIR}/reader-create.json" --write-out '%{http_code}' \
  -H "x-api-key: ${reader_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/searches" \
  --data '{"name":"Reader cannot write","definition":{}}')"
[ "${reader_create_status}" = "403" ]
malformed_status="$(curl --silent --output "${OUTPUT_DIR}/malformed-owned.json" --write-out '%{http_code}' \
  -H "x-api-key: ${member_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/searches" --data '{')"
[ "${malformed_status}" = "400" ]

curl --fail --silent --show-error \
  -H "x-api-key: ${member_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/searches" \
  --data '{"name":"Owned Oslo support","definition":{"locations":["Oslo"],"include_terms":["support","customer"],"exclude_terms":["senior"]}}' \
  > "${OUTPUT_DIR}/owned-search-create.json"
owned_search_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "${OUTPUT_DIR}/owned-search-create.json")"

cross_owner_status="$(curl --silent --output "${OUTPUT_DIR}/cross-owner.json" --write-out '%{http_code}' \
  -H "x-api-key: ${other_key}" "${BASE_URL}/api/v1/searches/${owned_search_id}")"
[ "${cross_owner_status}" = "404" ]
curl --fail --silent --show-error -H "x-api-key: ${member_key}" \
  "${BASE_URL}/api/v1/searches/${owned_search_id}" > "${OUTPUT_DIR}/owned-search-get.json"

short_secret_status="$(curl --silent --output "${OUTPUT_DIR}/short-secret.json" --write-out '%{http_code}' \
  -H "x-api-key: ${member_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/searches/${owned_search_id}/subscriptions" \
  --data '{"target_url":"https://example.invalid/hook","secret":"short"}')"
[ "${short_secret_status}" = "400" ]

if [ -n "${NAV_STUB_URL:-}" ]; then
  curl --fail --silent --show-error -H 'content-type: application/json' \
    -X POST "${NAV_STUB_URL}/__control" --data '{"scenario":"happy"}' >/dev/null
  webhook_secret="smoke-secret-000000000000"
  curl --fail --silent --show-error \
    -H "x-api-key: ${member_key}" -H 'content-type: application/json' \
    -X POST "${BASE_URL}/api/v1/searches/${owned_search_id}/subscriptions" \
    --data "{\"target_url\":\"${NAV_STUB_URL}/webhook\",\"secret\":\"${webhook_secret}\"}" \
    > "${OUTPUT_DIR}/subscription-create.json"
  curl --fail --silent --show-error -X POST \
    "${BASE_URL}/api/admin/searches/evaluate-due" > "${OUTPUT_DIR}/scheduled-search-sweep.json"
  curl --fail --silent --show-error -X POST \
    "${BASE_URL}/api/admin/outbox/deliver" > "${OUTPUT_DIR}/outbox-deliver.json"
  curl --fail --silent --show-error \
    "${NAV_STUB_URL}/__webhooks" > "${OUTPUT_DIR}/webhooks.json"
  curl --fail --silent --show-error -H "x-api-key: ${member_key}" \
    "${BASE_URL}/api/v1/searches/${owned_search_id}/deliveries?limit=1" > "${OUTPUT_DIR}/deliveries.json"
  invalid_delivery_cursor_status="$(curl --silent --output "${OUTPUT_DIR}/invalid-delivery-cursor.json" --write-out '%{http_code}' \
    -H "x-api-key: ${member_key}" \
    "${BASE_URL}/api/v1/searches/${owned_search_id}/deliveries?cursor=invalid")"
  [ "${invalid_delivery_cursor_status}" = "400" ]
else
  curl --fail --silent --show-error -H "x-api-key: ${member_key}" \
    -X POST "${BASE_URL}/api/v1/searches/${owned_search_id}/evaluate" \
    > "${OUTPUT_DIR}/owned-search-evaluate.json"
fi

# The source catalogue drives which platforms may be read and how, so an empty
# or unseeded catalogue must fail the journey rather than silently leaving the
# application flow with nothing to work from.
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/sources/catalog?limit=5" > "${OUTPUT_DIR}/source-catalog.json"
curl --fail --silent --show-error \
  "${BASE_URL}/api/v1/sources/catalog?tier=agent" > "${OUTPUT_DIR}/source-catalog-agent.json"
invalid_tier_status="$(curl --silent --output "${OUTPUT_DIR}/invalid-tier.json" --write-out '%{http_code}' \
  "${BASE_URL}/api/v1/sources/catalog?tier=telepathy")"
[ "${invalid_tier_status}" = "400" ]
# The browse page is the front door; a 200 with the search container present
# proves the route serves the app rather than an error page.
curl --fail --silent --show-error "${BASE_URL}/browse" > "${OUTPUT_DIR}/browse.html"
grep -q 'id="results"' "${OUTPUT_DIR}/browse.html"
python3 - "${OUTPUT_DIR}" <<'PYCATALOG'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
catalog = json.loads((root / "source-catalog.json").read_text())
agent = json.loads((root / "source-catalog-agent.json").read_text())

assert catalog["meta"]["total"] >= 100, catalog["meta"]
assert catalog["data"], "catalogue returned no platforms"

# Agent acquisition costs a browser run, so it is the paid tier by
# construction: an ungated agent source would give the capability away.
for entry in agent["data"]:
    assert entry["acquisition_tier"] == "agent", entry
    assert entry["requires_premium"] == 1, entry

# A platform is never auto-applied to until someone has reviewed its terms.
for entry in catalog["data"]:
    if entry["acquisition_tier"] == "unknown":
        assert entry["automation_policy"] == "unreviewed", entry

print(f"  source catalogue: {catalog['meta']['total']} platforms, "
      f"{len(agent['data'])} agent-tier all premium-gated")
PYCATALOG

# The application loop, end to end: an account, a CV, a shortlisted vacancy, a
# generated CV and letter, and a submission. Each premium capability is asked
# for by a free account first, because a gate that is never exercised is a gate
# nobody knows is there.
app_key="smoke-app-key-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/users" \
  --data "{\"email\":\"smoke-applicant@example.invalid\",\"api_key\":\"${app_key}\",\"display_name\":\"Smoke Applicant\"}" \
  > "${OUTPUT_DIR}/account.json"

curl --fail --silent --show-error -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X PUT "${BASE_URL}/api/v1/me/profile" \
  --data '{"headline":"Customer support specialist","summary":"Support work in Oslo.","location":"Oslo","skills":["support","customer"],"experience":[{"title":"Customer Service Adviser","employer":"Nordic Retail AS","period":"2022-2026","highlights":["Handled chat and telephone support"]}],"education":["BSc OsloMet"]}' \
  > "${OUTPUT_DIR}/profile.json"

smoke_job_id="$(python3 -c '
import json, sys
page = json.load(open(sys.argv[1]))
print(page["data"][0]["id"])
' "${OUTPUT_DIR}/jobs.json" 2>/dev/null || true)"
if [ -z "${smoke_job_id}" ]; then
  smoke_job_id="$(curl --fail --silent --show-error "${BASE_URL}/api/v1/jobs?limit=1" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')"
fi

curl --fail --silent --show-error -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/saved" --data "{\"job_id\":\"${smoke_job_id}\"}" \
  > "${OUTPUT_DIR}/saved.json"
smoke_saved_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["data"][0]["id"])' "${OUTPUT_DIR}/saved.json")"

curl --fail --silent --show-error -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/saved/${smoke_saved_id}/draft" --data '{}' \
  > "${OUTPUT_DIR}/drafts.json"

# Free accounts must be refused the paid capabilities, with 402 rather than a
# silent downgrade.
model_draft_status="$(curl --silent --output "${OUTPUT_DIR}/model-draft.json" --write-out '%{http_code}' \
  -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/saved/${smoke_saved_id}/draft" --data '{"generator":"model"}')"
[ "${model_draft_status}" = "402" ]
automated_status="$(curl --silent --output "${OUTPUT_DIR}/automated-apply.json" --write-out '%{http_code}' \
  -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/saved/${smoke_saved_id}/apply" --data '{"method":"automated"}')"
[ "${automated_status}" = "402" ]

curl --fail --silent --show-error -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/saved/${smoke_saved_id}/apply" --data '{}' \
  > "${OUTPUT_DIR}/application.json"
curl --fail --silent --show-error -H "x-api-key: ${app_key}" \
  "${BASE_URL}/api/v1/me/applications" > "${OUTPUT_DIR}/applications.json"
smoke_application_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["data"][0]["id"])' "${OUTPUT_DIR}/applications.json")"
curl --fail --silent --show-error -H "x-api-key: ${app_key}" -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/v1/me/applications/${smoke_application_id}/status" \
  --data '{"status":"interview","notes":"first round"}' > "${OUTPUT_DIR}/application-status.json"

python3 - "${OUTPUT_DIR}" <<'PYAPPLY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
drafts = json.loads((root / "drafts.json").read_text())["data"]
package = json.loads((root / "application.json").read_text())["data"]
applications = json.loads((root / "applications.json").read_text())["data"]

kinds = {draft["kind"] for draft in drafts}
assert kinds == {"cv", "letter"}, kinds
for draft in drafts:
    assert draft["generator"] == "template", draft
    assert len(draft["content"]) > 80, draft

# The package must carry what the person submits, not a reference to it.
assert package["cv"].strip(), package
assert package["letter"].strip(), package
assert package["application"]["method"] == "assisted", package
# An unreviewed or restricted platform must never be auto-submitted to.
assert package["application"]["status"] in {"ready", "submitted"}, package
assert applications, "the application should be listed back"

print("  application loop: account, profile, save, draft, assisted apply, status")
PYAPPLY

curl --fail --silent --show-error -H "x-api-key: ${member_key}" \
  "${BASE_URL}/api/v1/searches/${owned_search_id}/matches?limit=1" \
  > "${OUTPUT_DIR}/owned-matches.json"
invalid_match_cursor_status="$(curl --silent --output "${OUTPUT_DIR}/invalid-match-cursor.json" --write-out '%{http_code}' \
  -H "x-api-key: ${member_key}" \
  "${BASE_URL}/api/v1/searches/${owned_search_id}/matches?cursor=invalid")"
[ "${invalid_match_cursor_status}" = "400" ]
invalid_match_limit_status="$(curl --silent --output "${OUTPUT_DIR}/invalid-match-limit.json" --write-out '%{http_code}' \
  -H "x-api-key: ${member_key}" \
  "${BASE_URL}/api/v1/searches/${owned_search_id}/matches?limit=invalid")"
[ "${invalid_match_limit_status}" = "400" ]
curl --fail --silent --show-error \
  "${BASE_URL}/api/admin/maintenance/audit" > "${OUTPUT_DIR}/maintenance-audit.json"
curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/maintenance/reconcile" --data '{"dry_run":true}' \
  > "${OUTPUT_DIR}/maintenance-reconcile.json"
curl --fail --silent --show-error -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/maintenance/purge" \
  --data '{"dry_run":true,"retention_days":30}' \
  > "${OUTPUT_DIR}/maintenance-purge.json"
invalid_reconcile_status="$(curl --silent --output "${OUTPUT_DIR}/maintenance-reconcile-invalid.json" --write-out '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/maintenance/reconcile" --data '{')"
[ "${invalid_reconcile_status}" = "400" ]
invalid_purge_status="$(curl --silent --output "${OUTPUT_DIR}/maintenance-purge-invalid.json" --write-out '%{http_code}' \
  -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/admin/maintenance/purge" --data '{')"
[ "${invalid_purge_status}" = "400" ]

member_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["data"]["id"])' "${OUTPUT_DIR}/principal-member.json")"
curl --fail --silent --show-error -X POST \
  "${BASE_URL}/api/admin/principals/${member_id}/revoke" > "${OUTPUT_DIR}/principal-revoke.json"
revoked_status="$(curl --silent --output "${OUTPUT_DIR}/revoked-key.json" --write-out '%{http_code}' \
  -H "x-api-key: ${member_key}" "${BASE_URL}/api/v1/searches")"
[ "${revoked_status}" = "401" ]

python3 - "${OUTPUT_DIR}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
atomicity = json.loads((root / "atomicity.json").read_text())
initial = json.loads((root / "initial.json").read_text())
replay = json.loads((root / "replay.json").read_text())
jobs = json.loads((root / "jobs.json").read_text())
search_create = json.loads((root / "search-create.json").read_text())
search_initial = json.loads((root / "search-initial.json").read_text())
search_idle = json.loads((root / "search-idle.json").read_text())
search_nav_added = json.loads((root / "search-nav-added.json").read_text())
search_nav_updated = json.loads((root / "search-nav-updated.json").read_text())
search_nav_removed = json.loads((root / "search-nav-removed.json").read_text())
search_nav_readded = json.loads((root / "search-nav-readded.json").read_text())
search_nav_closed = json.loads((root / "search-nav-closed.json").read_text())
search_final_idle = json.loads((root / "search-final-idle.json").read_text())
search_matches = json.loads((root / "search-matches.json").read_text())
nav_active = json.loads((root / "nav-active.json").read_text())
nav_close = json.loads((root / "nav-close.json").read_text())
nav_close_replay = json.loads((root / "nav-close-replay.json").read_text())
nav_reopen = json.loads((root / "nav-reopen.json").read_text())
nav_update = json.loads((root / "nav-update.json").read_text())
nav_cursor_failure = json.loads((root / "nav-cursor-failure.json").read_text())
nav_lease = json.loads((root / "nav-lease.json").read_text())

assert atomicity["rolled_back"] is True, atomicity

assert initial["observations"] == 3, initial
assert initial["new_canonical_jobs"] == 2, initial
assert initial["new_source_occurrences"] == 3, initial
assert initial["duplicate_occurrences_merged"] == 1, initial
assert initial["canonical_changes"] == 2, initial
assert initial["corpus"]["canonical_jobs"] == 2, initial
assert initial["corpus"]["source_occurrences"] == 3, initial

assert replay["new_canonical_jobs"] == 0, replay
assert replay["new_source_occurrences"] == 0, replay
assert replay["canonical_changes"] == 0, replay
assert replay["unchanged_observations"] == 3, replay
assert replay["corpus"]["canonical_changes"] == 2, replay

assert len(jobs["data"]) == 2, jobs
assert jobs["meta"]["canonical_jobs"] == 2, jobs
assert jobs["meta"]["source_occurrences"] == 3, jobs
assert sorted(len(job["sources"]) for job in jobs["data"]) == [1, 2], jobs

assert search_create["query_signature"].startswith("query_"), search_create
assert search_initial["jobs_evaluated"] == 2, search_initial
assert search_initial["added"] == 2, search_initial
assert search_initial["updated"] == 0, search_initial
assert search_idle["jobs_evaluated"] == 0, search_idle
assert search_idle["transitions"] == [], search_idle
assert search_nav_added["jobs_evaluated"] == 1, search_nav_added
assert search_nav_added["added"] == 1, search_nav_added
assert search_nav_updated["jobs_evaluated"] == 1, search_nav_updated
assert search_nav_updated["updated"] == 1, search_nav_updated
assert search_nav_removed["jobs_evaluated"] == 1, search_nav_removed
assert search_nav_removed["removed"] == 1, search_nav_removed
assert search_nav_readded["jobs_evaluated"] == 1, search_nav_readded
assert search_nav_readded["added"] == 1, search_nav_readded
assert search_nav_closed["jobs_evaluated"] == 1, search_nav_closed
assert search_nav_closed["closed"] == 1, search_nav_closed
assert search_final_idle["jobs_evaluated"] == 0, search_final_idle
assert len(search_matches["data"]) == 2, search_matches

assert nav_active["outcome"] == "created", nav_active
assert nav_close["outcome"] == "closed", nav_close
assert nav_close_replay["outcome"] == "unchanged", nav_close_replay
assert nav_reopen["outcome"] == "reopened", nav_reopen
assert nav_update["outcome"] == "updated", nav_update
assert nav_cursor_failure["cursor_unchanged"] is True, nav_cursor_failure
assert nav_cursor_failure["consecutive_failures"] == 1, nav_cursor_failure
assert nav_lease["first_acquired"] is True, nav_lease
assert nav_lease["second_contended"] is True, nav_lease
assert nav_lease["stale_reclaimed"] is True, nav_lease

v1_page_1 = json.loads((root / "v1-jobs-page-1.json").read_text())
v1_page_2 = json.loads((root / "v1-jobs-page-2.json").read_text())
v1_changes = json.loads((root / "v1-changes.json").read_text())
v1_sources = json.loads((root / "v1-sources.json").read_text())
principal_member = json.loads((root / "principal-member.json").read_text())
principal_reader = json.loads((root / "principal-reader.json").read_text())
owned_create = json.loads((root / "owned-search-create.json").read_text())
owned_get = json.loads((root / "owned-search-get.json").read_text())
owned_matches = json.loads((root / "owned-matches.json").read_text())
maintenance_audit = json.loads((root / "maintenance-audit.json").read_text())
maintenance_reconcile = json.loads((root / "maintenance-reconcile.json").read_text())
maintenance_purge = json.loads((root / "maintenance-purge.json").read_text())
principal_revoke = json.loads((root / "principal-revoke.json").read_text())

assert len(v1_page_1["data"]) == 1, v1_page_1
assert v1_page_1["meta"]["next_cursor"], v1_page_1
assert len(v1_page_2["data"]) == 1, v1_page_2
assert v1_page_1["data"][0]["id"] != v1_page_2["data"][0]["id"], (v1_page_1, v1_page_2)
assert v1_page_1["data"][0]["source_ids"], v1_page_1
assert len(v1_changes["data"]) == 2, v1_changes
assert v1_sources["data"], v1_sources
assert principal_member["data"]["role"] == "member", principal_member
assert principal_reader["data"]["role"] == "reader", principal_reader
assert owned_create["owner_id"] == principal_member["data"]["id"], owned_create
assert owned_get["id"] == owned_create["id"], owned_get
assert len(owned_matches["data"]) == 1, owned_matches
assert owned_matches["meta"]["limit"] == 1, owned_matches
assert maintenance_audit["data"]["healthy"] is True, maintenance_audit
assert maintenance_reconcile["dry_run"] is True, maintenance_reconcile
assert maintenance_reconcile["repairs_applied"] == 0, maintenance_reconcile
assert maintenance_purge["dry_run"] is True, maintenance_purge
assert principal_revoke["status"] == "revoked", principal_revoke

webhooks_path = root / "webhooks.json"
if webhooks_path.exists():
    import hashlib
    import hmac

    sweep = json.loads((root / "scheduled-search-sweep.json").read_text())
    delivery = json.loads((root / "outbox-deliver.json").read_text())
    webhooks = json.loads(webhooks_path.read_text())
    deliveries = json.loads((root / "deliveries.json").read_text())
    assert sweep["selected"] >= 1, sweep
    assert sweep["completed"] >= 1, sweep
    assert sweep["transitions"] >= 1, sweep
    assert delivery["delivered"] >= 1, delivery
    assert webhooks["requests"] == delivery["delivered"], (webhooks, delivery)
    assert len(webhooks["raw"]) == webhooks["requests"], webhooks
    assert len(deliveries["data"]) == 1, deliveries
    assert deliveries["meta"]["limit"] == 1, deliveries
    assert all(item["status"] == "delivered" for item in deliveries["data"]), deliveries
    secret = b"smoke-secret-000000000000"
    for raw, headers in zip(webhooks["raw"], webhooks["headers"], strict=True):
        expected = "sha256=" + hmac.new(secret, raw.encode(), hashlib.sha256).hexdigest()
        assert hmac.compare_digest(headers["signature"], expected), headers
        assert headers["event_id"], headers

print("Smoke assertions passed:")
print("  D1 batch rollback verified")
print("  3 source observations")
print("  2 canonical jobs")
print("  1 duplicate occurrence merged")
print("  0 canonical changes on identical replay")
print("  NAV create, close, replay, reopen, and update transitions")
print("  NAV failure leaves the source cursor unchanged")
print("  NAV lease contention and stale-lease reclamation verified")
print("  saved search evaluates only jobs changed after its cursor")
print("  added, updated, removed, closed, and idle search transitions verified")
print("  versioned pagination, principal isolation, maintenance, and revocation verified")
if webhooks_path.exists():
    print("  scheduled evaluation and HMAC-signed outbox delivery verified")
PY
