# WS-0002 evidence bundle

- WorkScope: WS-0002@1
- RFC: RFC 0005
- State: implementation complete; executable and staging evidence pending

## Implemented evidence

- NAV feed and detail fixtures under `fixtures/nav/`.
- Pure parser tests in `job-index-core`.
- D1 migration `0002_source_state.sql`.
- Shared manual/scheduled `sync_nav` application function.
- One-page, 200-observation, 40-detail-fetch limits.
- Cursor updates only through the success path.
- Sanitized D1 failure state without credential exposure.
- Source status, manual sync, and deterministic lifecycle APIs.
- Browser source-health panel and live sync control.
- `just nav-key` validates and stores NAV-issued private credentials without logging them.
- Setup preserves private JWTs with or without an expiry claim; deployment uploads them as Worker secrets.

## Commands to capture

```sh
just nav-key
just fix
just verify
./deploy
```

Then:

```sh
curl "$DEPLOYMENT_URL/api/sources/nav/status"
curl -X POST \
  -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
  "$DEPLOYMENT_URL/api/sources/nav/sync"
curl "$DEPLOYMENT_URL/api/sources/nav/status"
curl "$DEPLOYMENT_URL/api/jobs"
```

## Pending gate evidence

- Formatting and strict Clippy output.
- Core unit-test output.
- Local D1 smoke output.
- Staging migration output.
- One bounded live NAV sync report.
- Cursor unchanged after an injected/observed failed page.
- Independent reviewer decision.
