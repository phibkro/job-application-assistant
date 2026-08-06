# WS-0006 evidence

## Implemented

- Audit canonical/source consistency, provide dry-run reconciliation, and record maintenance evidence.
- Additive schema and policy checks.
- Deterministic local test coverage and public/operator documentation.
- Maintenance requests reject malformed JSON, reconciliation records failed runs, and outbox retention is bounded.

## Local executable gate

```sh
just fix
just verify
```

## External acceptance gate

Attach staging deployment, production-safe smoke, and independent review evidence. For WS-0011 also attach the seven-day soak, live D1 restore/Time Travel drill, credential rotation, and production deployment record.
