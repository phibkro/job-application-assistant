# Execution plan: WS-0002@1

## Baseline

- WS-0001 local browser journey and D1 Worker build are operational.
- Exact deduplication and replay idempotency are implemented.
- Remote deployment evidence and G5 acceptance remain prerequisites for integrating WS-0002.

## Work sequence

1. Accept RFC 0005 and approve WS-0002@1. **Complete.**
2. Add the source connector/page contract without importing Worker types into `job-index-core`. **Complete.**
3. Capture representative NAV feed fixtures before writing the parser. **Complete.**
4. Write parser contract tests and implement the Fetch adapter. **Complete.**
5. Add `0002_source_state.sql` with indexes and migration checks. **Complete.**
6. Refactor corpus transitions to accept explicit source activity state. **Complete.**
7. Implement page-level source synchronization and cursor persistence. **Complete.**
8. Add bounded retry/failure tests and cursor non-advancement evidence. **Partially complete; executable cursor evidence remains.**
9. Add scheduled and staging-manual entry points. **Complete.**
10. Add source status API/UI and documentation. **Complete.**
11. Run local verification, deploy staging, perform one bounded live sync, and submit evidence for independent review. **Pending operator execution.**

## Design constraints

- D1 remains the only authoritative persistent state.
- Source cursor and corpus mutations must converge under retry.
- The core crate remains runtime-independent.
- No user-specific data enters the system.
- The source adapter must not bypass official access requirements.
- Scheduled execution must have explicit page, record, time, and failure budgets.

## Test matrix

| Scenario | Expected result |
|---|---|
| First page | Creates source occurrences and canonical jobs |
| Identical retry | No new canonical changes; cursor remains valid |
| Changed content | One update change |
| Inactive occurrence with another active source | Canonical remains active |
| Last active occurrence closes | Canonical closes once |
| Active observation after closure | Canonical reopens once |
| Parser failure | Cursor unchanged; run marked failed |
| D1 batch failure | Cursor and page effects roll back |
| Scheduled trigger | Same report shape as manual trigger |

## Rollback

Disable the cron and administrative sync capability, restore the previous Worker version, and retain the last successful cursor. Do not run destructive down migrations. Imported public vacancies may remain available read-only or be rebuilt from the source after parser correction.
