# Add a job source

Use the NAV connector as the reference implementation.

1. Confirm the source permits the intended access, storage, update, and display.
2. Add stable source identity and initial cursor policy.
3. Capture fixtures for active, updated, inactive, malformed, and retry cases.
4. Parse source JSON in `job-index-core`; keep Worker and network types out of
   the core crate.
5. Implement the Cloudflare Fetch adapter in `job-index-worker`.
6. Produce active or inactive source observations; never write canonical tables
   from the connector itself.
7. Pass observations through shared normalization and repository transitions.
8. Store cursor, ETag/Last-Modified, attempt, success, failure, and counters in
   `source_state`.
9. Advance the cursor only after every observation in the bounded page has
   converged successfully.
10. Route manual and scheduled triggers through the same sync function.
11. Add deterministic parser, replay, close/reopen, and cursor-failure evidence.
12. Enable the source only after its RFC, scope, and independent review gates.

Prefer official feeds and APIs. Browser automation is a last resort and does
not replace permission.
