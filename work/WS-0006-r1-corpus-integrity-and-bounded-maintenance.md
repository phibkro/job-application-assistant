# WS-0006@1: Corpus integrity and bounded maintenance

- Status: Executing
- Risk tier: R2
- Governing RFC: RFC 0009
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Audit canonical/source consistency, provide dry-run reconciliation, and record maintenance evidence.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, and independent review evidence are attached.

## Exclusions

- semantic deduplication or automatic deletion.
