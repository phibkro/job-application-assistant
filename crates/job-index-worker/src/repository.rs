use job_index_core::{NormalizedListing, occurrence_id};
use serde::{Deserialize, Serialize};
use worker::{D1Database, Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObservationOutcome {
    CreatedCanonical,
    AddedDuplicateOccurrence,
    UpdatedCanonical,
    ReopenedCanonical,
    ReactivatedOccurrence,
    ClosedCanonical,
    ClosedOccurrence,
    InactiveUnknown,
    Unchanged,
}

#[derive(Debug, Deserialize)]
struct SourceListingRow {
    canonical_job_id: String,
    content_fingerprint: String,
    active: i64,
    canonical_status: String,
}

#[derive(Debug, Deserialize)]
struct CanonicalIdentityRow {
    id: String,
    status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceOccurrenceView {
    pub id: String,
    pub source_id: String,
    pub source_name: String,
    pub external_id: String,
    pub active: bool,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CanonicalJobView {
    pub id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub description: String,
    pub application_url: String,
    pub published_at: String,
    pub deadline: Option<String>,
    pub status: String,
    pub sequence: i64,
    pub first_seen_at: String,
    pub changed_at: String,
    pub sources: Vec<SourceOccurrenceView>,
}

#[derive(Debug, Deserialize)]
struct JobJoinRow {
    job_id: String,
    title: String,
    employer_name: String,
    location: String,
    description: String,
    application_url: String,
    published_at: String,
    deadline: Option<String>,
    status: String,
    sequence: i64,
    first_seen_at: String,
    changed_at: String,
    occurrence_id: String,
    source_id: String,
    source_name: String,
    external_id: String,
    occurrence_active: i64,
    occurrence_first_seen_at: String,
    occurrence_last_seen_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CorpusCounts {
    pub canonical_jobs: i64,
    pub source_occurrences: i64,
    pub canonical_changes: i64,
    pub collection_runs: i64,
}

#[derive(Debug, Deserialize)]
struct CorpusCountsRow {
    canonical_jobs: i64,
    source_occurrences: i64,
    canonical_changes: i64,
    collection_runs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStateView {
    pub source_id: String,
    pub source_name: String,
    pub cursor: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub consecutive_failures: i64,
    pub pages_processed: i64,
    pub observations_processed: i64,
    pub mode: String,
    pub paused: i64,
    pub lease_owner: Option<String>,
    pub lease_acquired_at: Option<i64>,
    pub lease_expires_at: Option<i64>,
    pub heartbeat_at: Option<i64>,
    pub retry_after_at: Option<i64>,
    pub last_failure_class: Option<String>,
    pub last_feed_modified_at: Option<i64>,
    pub last_run_duration_ms: i64,
    #[serde(default)]
    pub lag_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFailureView {
    pub id: i64,
    pub source_id: String,
    pub run_id: Option<i64>,
    pub page_url: String,
    pub item_id: Option<String>,
    pub failure_class: String,
    pub payload_hash: String,
    pub message: String,
    pub retryable: i64,
    pub attempt_count: i64,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeaseDecision {
    Acquired,
    Busy,
    Paused,
    RetryDeferred,
    Failed,
}

pub async fn begin_collection_run(
    database: &D1Database,
    scenario: &str,
    observed_at: &str,
) -> Result<i64> {
    begin_collection_run_for_source(database, scenario, None, "manual", observed_at).await
}

pub async fn begin_collection_run_for_source(
    database: &D1Database,
    scenario: &str,
    source_id: Option<&str>,
    trigger_type: &str,
    observed_at: &str,
) -> Result<i64> {
    let result = worker::query!(
        database,
        "INSERT INTO collection_runs
         (scenario, source_id, trigger_type, started_at, status)
         VALUES (?1, ?2, ?3, ?4, 'running')",
        scenario,
        source_id,
        trigger_type,
        observed_at
    )?
    .run()
    .await?;

    result
        .meta()?
        .and_then(|meta| meta.last_row_id)
        .ok_or_else(|| Error::RustError("D1 did not return a collection run id".to_string()))
}

pub async fn complete_collection_run(
    database: &D1Database,
    run_id: i64,
    observed_at: &str,
    observations: usize,
    canonical_changes: usize,
) -> Result<()> {
    let observations = count_to_i32(observations, "observations")?;
    let canonical_changes = count_to_i32(canonical_changes, "canonical_changes")?;

    worker::query!(
        database,
        "UPDATE collection_runs
         SET completed_at = ?1,
             status = 'completed',
             observations = ?2,
             canonical_changes = ?3,
             error = NULL
         WHERE id = ?4",
        observed_at,
        observations,
        canonical_changes,
        run_id
    )?
    .run()
    .await?;

    Ok(())
}

pub async fn fail_collection_run(
    database: &D1Database,
    run_id: i64,
    observed_at: &str,
    message: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE collection_runs
         SET completed_at = ?1, status = 'failed', error = ?2
         WHERE id = ?3",
        observed_at,
        message,
        run_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn ensure_source_state(
    database: &D1Database,
    source_id: &str,
    source_name: &str,
    initial_cursor: &str,
    observed_at: &str,
) -> Result<SourceStateView> {
    database
        .batch(vec![
            worker::query!(
                database,
                "INSERT OR IGNORE INTO sources (id, name, created_at) VALUES (?1, ?2, ?3)",
                source_id,
                source_name,
                observed_at
            )?,
            worker::query!(
                database,
                "INSERT OR IGNORE INTO source_state
                 (source_id, cursor, updated_at)
                 VALUES (?1, ?2, ?3)",
                source_id,
                initial_cursor,
                observed_at
            )?,
        ])
        .await?;

    source_state(database, source_id)
        .await?
        .ok_or_else(|| Error::RustError(format!("D1 did not return source state for {source_id}")))
}

pub async fn source_state(
    database: &D1Database,
    source_id: &str,
) -> Result<Option<SourceStateView>> {
    let mut state = worker::query!(
        database,
        "SELECT
           ss.source_id,
           s.name AS source_name,
           ss.cursor,
           ss.etag,
           ss.last_modified,
           ss.last_attempt_at,
           ss.last_success_at,
           ss.last_error,
           ss.consecutive_failures,
           ss.pages_processed,
           ss.observations_processed,
           ss.mode,
           ss.paused,
           ss.lease_owner,
           ss.lease_acquired_at,
           ss.lease_expires_at,
           ss.heartbeat_at,
           ss.retry_after_at,
           ss.last_failure_class,
           ss.last_feed_modified_at,
           ss.last_run_duration_ms
         FROM source_state ss
         JOIN sources s ON s.id = ss.source_id
         WHERE ss.source_id = ?1",
        source_id
    )?
    .first::<SourceStateView>(None)
    .await?;
    if let Some(value) = state.as_mut() {
        value.lag_seconds = value.last_feed_modified_at.map(|modified| {
            let now = js_sys::Date::now() as i64;
            now.saturating_sub(modified) / 1_000
        });
    }
    Ok(state)
}

pub async fn mark_source_attempt(
    database: &D1Database,
    source_id: &str,
    observed_at: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_state
         SET last_attempt_at = ?1, updated_at = ?1
         WHERE source_id = ?2",
        observed_at,
        source_id
    )?
    .run()
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn mark_source_success(
    database: &D1Database,
    source_id: &str,
    lease_owner: &str,
    cursor: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
    feed_modified_at: Option<i64>,
    mode: &str,
    observed_at: &str,
    observations: usize,
    page_processed: bool,
    duration_ms: i64,
) -> Result<()> {
    let observations = count_to_i32(observations, "source observations")?;
    let page_increment = i32::from(page_processed);
    worker::query!(
        database,
        "UPDATE source_state
         SET cursor = ?1,
             etag = ?2,
             last_modified = ?3,
             last_attempt_at = ?4,
             last_success_at = ?4,
             last_error = NULL,
             consecutive_failures = 0,
             pages_processed = pages_processed + ?5,
             observations_processed = observations_processed + ?6,
             updated_at = ?4,
             mode = ?7,
             retry_after_at = NULL,
             last_failure_class = NULL,
             last_feed_modified_at = COALESCE(?8, last_feed_modified_at),
             last_run_duration_ms = ?9
         WHERE source_id = ?10 AND lease_owner = ?11",
        cursor,
        etag,
        last_modified,
        observed_at,
        page_increment,
        observations,
        mode,
        feed_modified_at,
        duration_ms,
        source_id,
        lease_owner
    )?
    .run()
    .await?;

    let state = source_state(database, source_id).await?.ok_or_else(|| {
        Error::RustError(format!("D1 did not return source state for {source_id}"))
    })?;
    if state.lease_owner.as_deref() != Some(lease_owner) || state.cursor != cursor {
        return Err(Error::RustError(
            "ingestion_lease_lost: source page converged but cursor checkpoint was not committed"
                .to_string(),
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn mark_source_failure(
    database: &D1Database,
    source_id: &str,
    lease_owner: Option<&str>,
    observed_at: &str,
    message: &str,
    failure_class: &str,
    retry_after_at: Option<i64>,
    duration_ms: i64,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_state
         SET last_attempt_at = ?1,
             last_error = ?2,
             consecutive_failures = consecutive_failures + 1,
             updated_at = ?1,
             retry_after_at = ?3,
             last_failure_class = ?4,
             last_run_duration_ms = ?5,
             mode = CASE WHEN ?3 IS NULL THEN 'failed' ELSE mode END
         WHERE source_id = ?6 AND (?7 IS NULL OR lease_owner = ?7)",
        observed_at,
        message,
        retry_after_at,
        failure_class,
        duration_ms,
        source_id,
        lease_owner
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn acquire_source_lease(
    database: &D1Database,
    source_id: &str,
    lease_owner: &str,
    now_ms: i64,
    ttl_ms: i64,
) -> Result<LeaseDecision> {
    let expires_at = now_ms.saturating_add(ttl_ms);
    worker::query!(
        database,
        "UPDATE source_state
         SET lease_owner = ?1,
             lease_acquired_at = ?2,
             lease_expires_at = ?3,
             heartbeat_at = ?2,
             updated_at = CAST(?2 AS TEXT)
         WHERE source_id = ?4
           AND paused = 0
           AND mode != 'failed'
           AND (retry_after_at IS NULL OR retry_after_at <= ?2)
           AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?2)",
        lease_owner,
        now_ms,
        expires_at,
        source_id
    )?
    .run()
    .await?;

    let state = source_state(database, source_id).await?.ok_or_else(|| {
        Error::RustError(format!("D1 did not return source state for {source_id}"))
    })?;
    if state.lease_owner.as_deref() == Some(lease_owner) {
        return Ok(LeaseDecision::Acquired);
    }
    if state.paused != 0 {
        return Ok(LeaseDecision::Paused);
    }
    if state.mode == "failed" {
        return Ok(LeaseDecision::Failed);
    }
    if state.retry_after_at.is_some_and(|retry| retry > now_ms) {
        return Ok(LeaseDecision::RetryDeferred);
    }
    Ok(LeaseDecision::Busy)
}

pub async fn renew_source_lease(
    database: &D1Database,
    source_id: &str,
    lease_owner: &str,
    now_ms: i64,
    ttl_ms: i64,
) -> Result<()> {
    let expires_at = now_ms.saturating_add(ttl_ms);
    worker::query!(
        database,
        "UPDATE source_state
         SET heartbeat_at = ?1, lease_expires_at = ?2, updated_at = CAST(?1 AS TEXT)
         WHERE source_id = ?3 AND lease_owner = ?4",
        now_ms,
        expires_at,
        source_id,
        lease_owner
    )?
    .run()
    .await?;
    let state = source_state(database, source_id).await?.ok_or_else(|| {
        Error::RustError(format!("D1 did not return source state for {source_id}"))
    })?;
    if state.lease_owner.as_deref() != Some(lease_owner) {
        return Err(Error::RustError(
            "ingestion_lease_lost: lease heartbeat was rejected".to_string(),
        ));
    }
    Ok(())
}

pub async fn release_source_lease(
    database: &D1Database,
    source_id: &str,
    lease_owner: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_state
         SET lease_owner = NULL,
             lease_acquired_at = NULL,
             lease_expires_at = NULL,
             heartbeat_at = NULL
         WHERE source_id = ?1 AND lease_owner = ?2",
        source_id,
        lease_owner
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn set_source_paused(
    database: &D1Database,
    source_id: &str,
    paused: bool,
    observed_at: &str,
) -> Result<()> {
    let paused = i32::from(paused);
    worker::query!(
        database,
        "UPDATE source_state
         SET paused = ?1,
             updated_at = ?2,
             lease_owner = CASE WHEN ?1 = 1 THEN NULL ELSE lease_owner END,
             lease_acquired_at = CASE WHEN ?1 = 1 THEN NULL ELSE lease_acquired_at END,
             lease_expires_at = CASE WHEN ?1 = 1 THEN NULL ELSE lease_expires_at END,
             heartbeat_at = CASE WHEN ?1 = 1 THEN NULL ELSE heartbeat_at END
         WHERE source_id = ?3",
        paused,
        observed_at,
        source_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn clear_source_retry(
    database: &D1Database,
    source_id: &str,
    observed_at: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_state
         SET retry_after_at = NULL,
             consecutive_failures = 0,
             last_error = NULL,
             last_failure_class = NULL,
             mode = CASE WHEN mode = 'failed' THEN 'backfill' ELSE mode END,
             updated_at = ?1
         WHERE source_id = ?2",
        observed_at,
        source_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn restart_source_from(
    database: &D1Database,
    source_id: &str,
    cursor: &str,
    if_modified_since: Option<&str>,
    observed_at: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_state
         SET cursor = ?1,
             etag = NULL,
             last_modified = ?2,
             mode = 'backfill',
             paused = 0,
             retry_after_at = NULL,
             last_error = NULL,
             last_failure_class = NULL,
             consecutive_failures = 0,
             lease_owner = NULL,
             lease_acquired_at = NULL,
             lease_expires_at = NULL,
             heartbeat_at = NULL,
             updated_at = ?3
         WHERE source_id = ?4",
        cursor,
        if_modified_since,
        observed_at,
        source_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn clear_stale_source_lease(
    database: &D1Database,
    source_id: &str,
    now_ms: i64,
) -> Result<bool> {
    let before = source_state(database, source_id).await?.ok_or_else(|| {
        Error::RustError(format!("D1 did not return source state for {source_id}"))
    })?;
    let was_stale = before.lease_owner.is_some()
        && before
            .lease_expires_at
            .is_some_and(|expires_at| expires_at <= now_ms);
    worker::query!(
        database,
        "UPDATE source_state
         SET lease_owner = NULL,
             lease_acquired_at = NULL,
             lease_expires_at = NULL,
             heartbeat_at = NULL
         WHERE source_id = ?1
           AND lease_owner IS NOT NULL
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at <= ?2",
        source_id,
        now_ms
    )?
    .run()
    .await?;
    let state = source_state(database, source_id).await?.ok_or_else(|| {
        Error::RustError(format!("D1 did not return source state for {source_id}"))
    })?;
    Ok(was_stale && state.lease_owner.is_none())
}

#[allow(clippy::too_many_arguments)]
pub async fn record_source_failure(
    database: &D1Database,
    failure_key: &str,
    source_id: &str,
    run_id: Option<i64>,
    page_url: &str,
    item_id: Option<&str>,
    failure_class: &str,
    payload_hash: &str,
    message: &str,
    retryable: bool,
    observed_at: &str,
) -> Result<()> {
    let retryable = i32::from(retryable);
    worker::query!(
        database,
        "INSERT INTO source_failures
         (failure_key, source_id, run_id, page_url, item_id, failure_class,
          payload_hash, message, retryable, first_seen_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
         ON CONFLICT(failure_key) DO UPDATE SET
           run_id = excluded.run_id,
           message = excluded.message,
           retryable = excluded.retryable,
           attempt_count = source_failures.attempt_count + 1,
           last_seen_at = excluded.last_seen_at,
           resolved_at = NULL",
        failure_key,
        source_id,
        run_id,
        page_url,
        item_id,
        failure_class,
        payload_hash,
        message,
        retryable,
        observed_at
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn resolve_source_failures(
    database: &D1Database,
    source_id: &str,
    page_url: &str,
    observed_at: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE source_failures
         SET resolved_at = ?1
         WHERE source_id = ?2 AND page_url = ?3 AND resolved_at IS NULL",
        observed_at,
        source_id,
        page_url
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn list_source_failures(
    database: &D1Database,
    source_id: &str,
    include_resolved: bool,
) -> Result<Vec<SourceFailureView>> {
    let include_resolved = i32::from(include_resolved);
    worker::query!(
        database,
        "SELECT id, source_id, run_id, page_url, item_id, failure_class,
                payload_hash, message, retryable, attempt_count,
                first_seen_at, last_seen_at, resolved_at
         FROM source_failures
         WHERE source_id = ?1 AND (?2 = 1 OR resolved_at IS NULL)
         ORDER BY last_seen_at DESC
         LIMIT 100",
        source_id,
        include_resolved
    )?
    .all()
    .await?
    .results::<SourceFailureView>()
}

/// Mutable progress counters and cursor window recorded against a collection run.
///
/// The counters and the two cursors are positionally interchangeable when passed
/// as bare arguments, so they travel as named fields instead.
#[derive(Debug, Clone, Copy)]
pub struct CollectionRunProgress<'a> {
    pub pages: usize,
    pub observations: usize,
    pub canonical_changes: usize,
    pub duration_ms: i64,
    pub cursor_before: &'a str,
    pub cursor_after: &'a str,
    pub lease_owner: &'a str,
}

pub async fn update_collection_run_progress(
    database: &D1Database,
    run_id: i64,
    progress: CollectionRunProgress<'_>,
) -> Result<()> {
    let pages = count_to_i32(progress.pages, "collection pages")?;
    let observations = count_to_i32(progress.observations, "collection observations")?;
    let canonical_changes =
        count_to_i32(progress.canonical_changes, "collection canonical changes")?;
    let duration_ms = progress.duration_ms;
    let cursor_before = progress.cursor_before;
    let cursor_after = progress.cursor_after;
    let lease_owner = progress.lease_owner;
    worker::query!(
        database,
        "UPDATE collection_runs
         SET pages = ?1,
             observations = ?2,
             canonical_changes = ?3,
             duration_ms = ?4,
             cursor_before = ?5,
             cursor_after = ?6,
             lease_owner = ?7
         WHERE id = ?8",
        pages,
        observations,
        canonical_changes,
        duration_ms,
        cursor_before,
        cursor_after,
        lease_owner,
        run_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn complete_collection_run_detailed(
    database: &D1Database,
    run_id: i64,
    observed_at: &str,
    progress: CollectionRunProgress<'_>,
) -> Result<()> {
    update_collection_run_progress(database, run_id, progress).await?;
    worker::query!(
        database,
        "UPDATE collection_runs
         SET completed_at = ?1, status = 'completed', error = NULL
         WHERE id = ?2",
        observed_at,
        run_id
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn process_observation(
    database: &D1Database,
    listing: &NormalizedListing,
    observed_at: &str,
) -> Result<ObservationOutcome> {
    process_active_observation(database, listing, observed_at).await
}

pub async fn process_active_observation(
    database: &D1Database,
    listing: &NormalizedListing,
    observed_at: &str,
) -> Result<ObservationOutcome> {
    let existing_occurrence = worker::query!(
        database,
        "SELECT
           sl.canonical_job_id,
           sl.content_fingerprint,
           sl.active,
           cj.status AS canonical_status
         FROM source_listings sl
         JOIN canonical_jobs cj ON cj.id = sl.canonical_job_id
         WHERE sl.id = ?1",
        &listing.occurrence_id
    )?
    .first::<SourceListingRow>(None)
    .await?;

    if let Some(occurrence) = existing_occurrence {
        let was_inactive = occurrence.active == 0;
        let canonical_was_closed = occurrence.canonical_status == "closed";

        if occurrence.content_fingerprint == listing.content_fingerprint {
            if was_inactive && canonical_was_closed {
                database
                    .batch(vec![
                        worker::query!(
                            database,
                            "INSERT INTO job_changes (canonical_job_id, change_type, changed_at)
                             VALUES (?1, 'reopened', ?2)",
                            &occurrence.canonical_job_id,
                            observed_at
                        )?,
                        worker::query!(
                            database,
                            "UPDATE canonical_jobs
                             SET status = 'active',
                                 sequence = (SELECT MAX(sequence) FROM job_changes),
                                 changed_at = ?1
                             WHERE id = ?2",
                            observed_at,
                            &occurrence.canonical_job_id
                        )?,
                        worker::query!(
                            database,
                            "UPDATE source_listings
                             SET last_seen_at = ?1, active = 1
                             WHERE id = ?2",
                            observed_at,
                            &listing.occurrence_id
                        )?,
                    ])
                    .await?;
                return Ok(ObservationOutcome::ReopenedCanonical);
            }

            worker::query!(
                database,
                "UPDATE source_listings SET last_seen_at = ?1, active = 1 WHERE id = ?2",
                observed_at,
                &listing.occurrence_id
            )?
            .run()
            .await?;
            return Ok(if was_inactive {
                ObservationOutcome::ReactivatedOccurrence
            } else {
                ObservationOutcome::Unchanged
            });
        }

        let change_type = if canonical_was_closed {
            "reopened"
        } else {
            "updated"
        };
        let statements = vec![
            worker::query!(
                database,
                "INSERT INTO job_changes (canonical_job_id, change_type, changed_at)
                 VALUES (?1, ?2, ?3)",
                &occurrence.canonical_job_id,
                change_type,
                observed_at
            )?,
            worker::query!(
                database,
                "UPDATE canonical_jobs
                 SET title = ?1,
                     employer_name = ?2,
                     location = ?3,
                     description = ?4,
                     application_url = ?5,
                     published_at = ?6,
                     deadline = ?7,
                     status = 'active',
                     sequence = (SELECT MAX(sequence) FROM job_changes),
                     changed_at = ?8
                 WHERE id = ?9",
                &listing.title,
                &listing.employer_name,
                &listing.location,
                &listing.description,
                &listing.application_url,
                &listing.published_at,
                &listing.deadline,
                observed_at,
                &occurrence.canonical_job_id
            )?,
            worker::query!(
                database,
                "UPDATE source_listings
                 SET content_fingerprint = ?1, last_seen_at = ?2, active = 1
                 WHERE id = ?3",
                &listing.content_fingerprint,
                observed_at,
                &listing.occurrence_id
            )?,
        ];
        database.batch(statements).await?;
        return Ok(if canonical_was_closed {
            ObservationOutcome::ReopenedCanonical
        } else {
            ObservationOutcome::UpdatedCanonical
        });
    }

    let existing_canonical = worker::query!(
        database,
        "SELECT id, status FROM canonical_jobs WHERE canonical_key = ?1",
        &listing.canonical_key
    )?
    .first::<CanonicalIdentityRow>(None)
    .await?;

    if let Some(canonical) = existing_canonical {
        let mut statements = vec![
            worker::query!(
                database,
                "INSERT OR IGNORE INTO sources (id, name, created_at) VALUES (?1, ?2, ?3)",
                &listing.source_id,
                &listing.source_name,
                observed_at
            )?,
            worker::query!(
                database,
                "INSERT INTO source_listings
                 (id, source_id, external_id, canonical_job_id, content_fingerprint,
                  active, first_seen_at, last_seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
                &listing.occurrence_id,
                &listing.source_id,
                &listing.external_id,
                &canonical.id,
                &listing.content_fingerprint,
                observed_at
            )?,
        ];

        if canonical.status == "closed" {
            statements.push(worker::query!(
                database,
                "INSERT INTO job_changes (canonical_job_id, change_type, changed_at)
                 VALUES (?1, 'reopened', ?2)",
                &canonical.id,
                observed_at
            )?);
            statements.push(worker::query!(
                database,
                "UPDATE canonical_jobs
                 SET title = ?1,
                     employer_name = ?2,
                     location = ?3,
                     description = ?4,
                     application_url = ?5,
                     published_at = ?6,
                     deadline = ?7,
                     status = 'active',
                     sequence = (SELECT MAX(sequence) FROM job_changes),
                     changed_at = ?8
                 WHERE id = ?9",
                &listing.title,
                &listing.employer_name,
                &listing.location,
                &listing.description,
                &listing.application_url,
                &listing.published_at,
                &listing.deadline,
                observed_at,
                &canonical.id
            )?);
        }

        database.batch(statements).await?;
        return Ok(if canonical.status == "closed" {
            ObservationOutcome::ReopenedCanonical
        } else {
            ObservationOutcome::AddedDuplicateOccurrence
        });
    }

    let statements = vec![
        worker::query!(
            database,
            "INSERT OR IGNORE INTO sources (id, name, created_at) VALUES (?1, ?2, ?3)",
            &listing.source_id,
            &listing.source_name,
            observed_at
        )?,
        worker::query!(
            database,
            "INSERT INTO job_changes (canonical_job_id, change_type, changed_at)
             VALUES (?1, 'created', ?2)",
            &listing.canonical_job_id,
            observed_at
        )?,
        worker::query!(
            database,
            "INSERT INTO canonical_jobs
             (id, canonical_key, title, employer_name, location, description,
              application_url, published_at, deadline, status, sequence,
              first_seen_at, changed_at)
             VALUES
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active',
              (SELECT MAX(sequence) FROM job_changes), ?10, ?10)",
            &listing.canonical_job_id,
            &listing.canonical_key,
            &listing.title,
            &listing.employer_name,
            &listing.location,
            &listing.description,
            &listing.application_url,
            &listing.published_at,
            &listing.deadline,
            observed_at
        )?,
        worker::query!(
            database,
            "INSERT INTO source_listings
             (id, source_id, external_id, canonical_job_id, content_fingerprint,
              active, first_seen_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
            &listing.occurrence_id,
            &listing.source_id,
            &listing.external_id,
            &listing.canonical_job_id,
            &listing.content_fingerprint,
            observed_at
        )?,
    ];
    database.batch(statements).await?;

    Ok(ObservationOutcome::CreatedCanonical)
}

pub async fn process_inactive_observation(
    database: &D1Database,
    source_id: &str,
    external_id: &str,
    observed_at: &str,
) -> Result<ObservationOutcome> {
    let id = occurrence_id(source_id, external_id);
    let occurrence = worker::query!(
        database,
        "SELECT
           sl.canonical_job_id,
           sl.content_fingerprint,
           sl.active,
           cj.status AS canonical_status
         FROM source_listings sl
         JOIN canonical_jobs cj ON cj.id = sl.canonical_job_id
         WHERE sl.id = ?1",
        &id
    )?
    .first::<SourceListingRow>(None)
    .await?;

    let Some(occurrence) = occurrence else {
        return Ok(ObservationOutcome::InactiveUnknown);
    };
    if occurrence.active == 0 {
        return Ok(ObservationOutcome::Unchanged);
    }

    let other_active = worker::query!(
        database,
        "SELECT COUNT(*) AS count
         FROM source_listings
         WHERE canonical_job_id = ?1 AND id != ?2 AND active = 1",
        &occurrence.canonical_job_id,
        &id
    )?
    .first::<CountRow>(None)
    .await?
    .ok_or_else(|| Error::RustError("D1 did not return active occurrence count".to_string()))?;

    if other_active.count == 0 && occurrence.canonical_status == "active" {
        database
            .batch(vec![
                worker::query!(
                    database,
                    "UPDATE source_listings
                     SET active = 0, last_seen_at = ?1
                     WHERE id = ?2",
                    observed_at,
                    &id
                )?,
                worker::query!(
                    database,
                    "INSERT INTO job_changes (canonical_job_id, change_type, changed_at)
                     VALUES (?1, 'closed', ?2)",
                    &occurrence.canonical_job_id,
                    observed_at
                )?,
                worker::query!(
                    database,
                    "UPDATE canonical_jobs
                     SET status = 'closed',
                         sequence = (SELECT MAX(sequence) FROM job_changes),
                         changed_at = ?1
                     WHERE id = ?2",
                    observed_at,
                    &occurrence.canonical_job_id
                )?,
            ])
            .await?;
        return Ok(ObservationOutcome::ClosedCanonical);
    }

    worker::query!(
        database,
        "UPDATE source_listings SET active = 0, last_seen_at = ?1 WHERE id = ?2",
        observed_at,
        &id
    )?
    .run()
    .await?;
    Ok(ObservationOutcome::ClosedOccurrence)
}

pub async fn list_jobs(database: &D1Database) -> Result<Vec<CanonicalJobView>> {
    let rows = database
        .prepare(
            "SELECT
               cj.id AS job_id,
               cj.title,
               cj.employer_name,
               cj.location,
               cj.description,
               cj.application_url,
               cj.published_at,
               cj.deadline,
               cj.status,
               cj.sequence,
               cj.first_seen_at,
               cj.changed_at,
               sl.id AS occurrence_id,
               sl.source_id,
               s.name AS source_name,
               sl.external_id,
               sl.active AS occurrence_active,
               sl.first_seen_at AS occurrence_first_seen_at,
               sl.last_seen_at AS occurrence_last_seen_at
             FROM canonical_jobs cj
             JOIN source_listings sl ON sl.canonical_job_id = cj.id
             JOIN sources s ON s.id = sl.source_id
             ORDER BY cj.sequence DESC, sl.source_id, sl.external_id",
        )
        .all()
        .await?
        .results::<JobJoinRow>()?;

    let mut jobs: Vec<CanonicalJobView> = Vec::new();
    for row in rows {
        let source = SourceOccurrenceView {
            id: row.occurrence_id,
            source_id: row.source_id,
            source_name: row.source_name,
            external_id: row.external_id,
            active: row.occurrence_active == 1,
            first_seen_at: row.occurrence_first_seen_at,
            last_seen_at: row.occurrence_last_seen_at,
        };

        if let Some(job) = jobs.last_mut().filter(|job| job.id == row.job_id) {
            job.sources.push(source);
            continue;
        }

        jobs.push(CanonicalJobView {
            id: row.job_id,
            title: row.title,
            employer_name: row.employer_name,
            location: row.location,
            description: row.description,
            application_url: row.application_url,
            published_at: row.published_at,
            deadline: row.deadline,
            status: row.status,
            sequence: row.sequence,
            first_seen_at: row.first_seen_at,
            changed_at: row.changed_at,
            sources: vec![source],
        });
    }

    Ok(jobs)
}

pub async fn corpus_counts(database: &D1Database) -> Result<CorpusCounts> {
    let row = database
        .prepare(
            "SELECT
               (SELECT COUNT(*) FROM canonical_jobs) AS canonical_jobs,
               (SELECT COUNT(*) FROM source_listings) AS source_occurrences,
               (SELECT COUNT(*) FROM job_changes) AS canonical_changes,
               (SELECT COUNT(*) FROM collection_runs WHERE status = 'completed') AS collection_runs",
        )
        .first::<CorpusCountsRow>(None)
        .await?
        .ok_or_else(|| Error::RustError("D1 did not return corpus counts".to_string()))?;

    Ok(CorpusCounts {
        canonical_jobs: row.canonical_jobs,
        source_occurrences: row.source_occurrences,
        canonical_changes: row.canonical_changes,
        collection_runs: row.collection_runs,
    })
}

#[derive(Debug, Deserialize)]
struct CountRow {
    count: i64,
}

pub async fn verify_atomic_rollback(database: &D1Database, observed_at: &str) -> Result<bool> {
    let probe_id = "atomicity-probe";
    worker::query!(database, "DELETE FROM sources WHERE id = ?1", probe_id)?
        .run()
        .await?;

    let result = database
        .batch(vec![
            worker::query!(
                database,
                "INSERT INTO sources (id, name, created_at) VALUES (?1, 'Atomicity probe', ?2)",
                probe_id,
                observed_at
            )?,
            database.prepare(
                "INSERT INTO canonical_jobs
                 (id, canonical_key, title, employer_name, location, description,
                  application_url, published_at, status, sequence, first_seen_at, changed_at)
                 VALUES
                 ('atomicity-invalid', 'atomicity-invalid', NULL, 'Probe', 'Oslo', 'Probe',
                  'https://invalid.example', '0', 'active', 999999, '0', '0')",
            ),
        ])
        .await;

    if result.is_ok() {
        return Err(Error::RustError(
            "atomicity probe unexpectedly committed an invalid D1 batch".to_string(),
        ));
    }

    let row = worker::query!(
        database,
        "SELECT COUNT(*) AS count FROM sources WHERE id = ?1",
        probe_id
    )?
    .first::<CountRow>(None)
    .await?
    .ok_or_else(|| Error::RustError("D1 did not return the atomicity probe count".to_string()))?;

    Ok(row.count == 0)
}

pub async fn reset_demo(database: &D1Database) -> Result<()> {
    database
        .batch(vec![
            database.prepare("DELETE FROM notification_outbox"),
            database.prepare("DELETE FROM webhook_subscriptions"),
            database.prepare("DELETE FROM search_matches"),
            database.prepare("DELETE FROM saved_searches"),
            database.prepare("DELETE FROM admin_audit_log"),
            // The application flow hangs off principals, so it is cleared
            // first and in dependency order: drafts and applications before
            // the shortlist, the shortlist and profile before the account,
            // and the account before the principal it is attached to.
            database.prepare("DELETE FROM application_drafts"),
            database.prepare("DELETE FROM applications"),
            database.prepare("DELETE FROM saved_jobs"),
            database.prepare("DELETE FROM user_profiles"),
            database.prepare("DELETE FROM users"),
            database.prepare("DELETE FROM principals"),
            database.prepare("DELETE FROM maintenance_runs"),
            database.prepare("DELETE FROM source_failures"),
            database.prepare("DELETE FROM source_state"),
            database.prepare("DELETE FROM source_listings"),
            database.prepare("DELETE FROM canonical_jobs"),
            database.prepare("DELETE FROM job_changes"),
            database.prepare("DELETE FROM collection_runs"),
            database.prepare("DELETE FROM sources"),
            database.prepare(
                "DELETE FROM sqlite_sequence WHERE name IN ('job_changes', 'collection_runs', 'source_failures', 'maintenance_runs', 'admin_audit_log', 'notification_outbox')",
            ),
        ])
        .await?;
    Ok(())
}

fn count_to_i32(value: usize, label: &str) -> Result<i32> {
    i32::try_from(value)
        .map_err(|_| Error::RustError(format!("{label} exceeds the D1 integer binding range")))
}
