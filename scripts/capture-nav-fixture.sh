#!/usr/bin/env bash
# Captures a live NAV feed entry and its detail payload as contract fixtures.
#
# Hand-written fixtures cannot prove the parser matches the feed: an envelope
# that NAV never serves passed every stub test while live ingestion silently
# fell back to summaries for each vacancy. These files are recorded from the
# real API so the shape is observed rather than assumed.
#
# Re-run after a NAV API change. A failing parse afterwards is the point.
set -euo pipefail

source_dir="${BASH_SOURCE[0]%/*}"
[ "${source_dir}" = "${BASH_SOURCE[0]}" ] && source_dir="."
root="$(cd -- "${source_dir}/.." && pwd)"
cd "${root}"

base_url="${NAV_BASE_URL:-https://pam-stilling-feed.nav.no}"
vars_file="${JOB_INDEX_DEV_VARS_FILE:-.dev.vars}"

[ -f "${vars_file}" ] || {
  echo "No ${vars_file}. Run 'just nav-key' first to configure a private token." >&2
  exit 1
}
token="$(sed -n 's/^NAV_API_TOKEN=//p' "${vars_file}" | tr -d '"')"
[ -n "${token}" ] || {
  echo "No NAV_API_TOKEN in ${vars_file}." >&2
  exit 1
}

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${token}" -H 'Accept: application/json' \
  "${base_url}/api/v1/feed?last=true" > "${work}/feed.json"

detail_path="$(python3 -c '
import json, sys
page = json.load(open(sys.argv[1]))
items = page.get("items") or []
if not items:
    sys.exit("live feed returned no items")
print(items[0]["url"])
' "${work}/feed.json")"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${token}" -H 'Accept: application/json' \
  "${base_url}${detail_path}" > "${work}/detail.json"

python3 - "${work}/detail.json" fixtures/nav/live-detail.json <<'PY'
import json
import sys

source, destination = sys.argv[1], sys.argv[2]
detail = json.load(open(source))

# A vacancy advert is public, but its named contacts are personal data and
# must not enter the repository. Everything else is kept verbatim: the point
# of this file is that its shape was not chosen by us.
content = detail.get("ad_content")
if isinstance(content, dict):
    content.pop("contactList", None)

with open(destination, "w") as handle:
    json.dump(detail, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

print(f"captured {destination}: top-level keys {sorted(detail)}")
PY
