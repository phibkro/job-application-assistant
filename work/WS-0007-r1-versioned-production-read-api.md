# WS-0007@1: Versioned production read API

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0010
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Expose stable cursor-paginated jobs, changes, and source health through `/api/v1`.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, and independent review evidence are attached.

## Exclusions

- ranking, semantic search, or unbounded exports.
