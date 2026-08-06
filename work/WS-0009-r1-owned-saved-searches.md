# WS-0009@1: Owned saved searches

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0012
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Scope saved searches, matches, reset, update, deletion, and exports to authenticated principals.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, and independent review evidence are attached.

## Exclusions

- teams, billing, or shared searches.
