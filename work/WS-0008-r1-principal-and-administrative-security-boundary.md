# WS-0008@1: Principal and administrative security boundary

- Status: Executing
- Risk tier: R3
- Governing RFC: RFC 0011
- Owner: Project maintainer
- Review owner: Independent production-readiness reviewer

## Outcome

Introduce hashed API keys, quotas, request identifiers on structured failures and audit records while retaining the existing administrator secret for operator control.

## Acceptance criteria

- Schema and indexes apply from a clean database.
- All operations are bounded and idempotent where replay is expected.
- Authorization and ownership boundaries are covered by integration tests.
- Public contracts are documented and production smoke remains non-destructive.
- `just fix`, `just verify`, staging deployment, credential-rotation, independent security review, and human release evidence are attached.

## Exclusions

- end-user passwords, OAuth provider, or Cloudflare Access automation.
