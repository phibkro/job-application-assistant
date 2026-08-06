# Tutorial: run the first incremental-search demonstration

> Status: design placeholder. Commands will be finalized when product code is scaffolded and Cloudflare tool versions are pinned.

In this tutorial you will apply migrations to D1, load two overlapping snapshots, create a saved search, process a changed snapshot, and confirm that replaying it performs no additional work.

## Outcome

You will observe:

- Source occurrences merged into fewer canonical jobs.
- Source provenance retained on each canonical job.
- A saved search initially evaluating the full corpus.
- A later run evaluating only changed jobs.
- An identical replay producing zero changes.
- The same behaviour in local D1 and an isolated staging D1 database.

## Planned steps

1. Install the pinned Rust, Wasm, Workers Rust, and Wrangler toolchains.
2. Apply committed migrations to a clean local D1 database.
3. Start the Rust Worker locally.
4. Collect the first deterministic fixture snapshot.
5. Replay the overlapping second-source fixture.
6. Create the sample Oslo technology/customer-service search.
7. Record baseline metrics.
8. Replay the changed fixture and compare incremental metrics.
9. Replay the same fixture again and confirm idempotency.
10. Deploy the tested revision to staging D1 and repeat the smoke assertions.
