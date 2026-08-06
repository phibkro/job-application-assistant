# WS-0008 evidence

## Implemented

- Introduce hashed API keys, quotas, request identifiers on structured failures, and audit records while retaining the existing administrator secret for operator control.
- Additive schema and policy checks.
- Deterministic local test coverage and public/operator documentation.
- Explicit R3 threat model covering credential theft, IDOR, admin access, log leakage, SSRF, replay, brute force, and production mutation.

## Local executable gate

```sh
just fix
just verify
```

## External acceptance gate

Attach staging deployment, production-safe smoke, credential-rotation evidence, independent security review, and human release approval. For WS-0011 also attach the seven-day soak, live D1 restore/Time Travel drill, credential rotation, and production deployment record.
