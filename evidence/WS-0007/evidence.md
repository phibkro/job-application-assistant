# WS-0007 evidence

## Implemented

- Expose stable cursor-paginated jobs, changes, and source health through `/api/v1`.
- Additive schema and policy checks.
- Deterministic local test coverage and public/operator documentation.

## Local executable gate

```sh
just fix
just verify
```

## External acceptance gate

Attach staging deployment, production-safe smoke, and independent review evidence. For WS-0011 also attach the seven-day soak, live D1 restore/Time Travel drill, credential rotation, and production deployment record.
