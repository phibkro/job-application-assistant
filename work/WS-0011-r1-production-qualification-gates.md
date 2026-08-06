# WS-0011@1: Production qualification gates

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0014
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Define executable performance, restore, soak, SLO, security, and release gates for first production qualification.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, and independent review evidence are attached.

## Exclusions

- claiming live production acceptance without external evidence.


The soak runner evaluates API availability and NAV feed-lag p95 against `ops/slo.json` and fails when the source reports consecutive failures.
