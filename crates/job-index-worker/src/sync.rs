use crate::nav_connector::{
    NAV_INITIAL_CURSOR, NavObservation, PageResponse, build_observations, fetch_page,
    next_checkpoint, resolve_token,
};
use crate::repository::{
    CorpusCounts, LeaseDecision, ObservationOutcome, SourceStateView, acquire_source_lease,
    begin_collection_run_for_source, complete_collection_run_detailed, corpus_counts,
    ensure_source_state, fail_collection_run, mark_source_attempt, mark_source_failure,
    mark_source_success, record_source_failure, release_source_lease, renew_source_lease,
    resolve_source_failures, source_state, update_collection_run_progress,
};
use job_index_core::{NAV_SOURCE_ID, NAV_SOURCE_NAME, normalize, stable_hash_hex};
use serde::Serialize;
use worker::{D1Database, Env, Error, Result};

const MAX_FEED_ITEMS_PER_PAGE: usize = 200;
const DEFAULT_MAX_PAGES_PER_RUN: usize = 4;
const HARD_MAX_PAGES_PER_RUN: usize = 10;
const DEFAULT_MAX_OBSERVATIONS_PER_RUN: usize = 600;
const HARD_MAX_OBSERVATIONS_PER_RUN: usize = 1_000;
const DEFAULT_DETAIL_FETCH_LIMIT: usize = 40;
const HARD_MAX_DETAIL_FETCH_LIMIT: usize = 100;
const DEFAULT_MAX_DURATION_MS: i64 = 20_000;
const HARD_MAX_DURATION_MS: i64 = 25_000;
const DEFAULT_LEASE_TTL_MS: i64 = 90_000;
const MIN_LEASE_TTL_MS: i64 = 30_000;
const HARD_MAX_LEASE_TTL_MS: i64 = 300_000;

#[derive(Debug, Clone, Copy)]
pub enum SyncTrigger {
    Manual,
    Scheduled,
    Retry,
}

impl SyncTrigger {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Scheduled => "scheduled",
            Self::Retry => "retry",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SyncReport {
    pub event: &'static str,
    pub source_id: &'static str,
    pub trigger: &'static str,
    pub outcome: &'static str,
    pub run_id: Option<i64>,
    pub mode_before: String,
    pub mode_after: String,
    pub cursor_before: String,
    pub cursor_after: String,
    pub pages: usize,
    pub tail_poll: bool,
    pub not_modified: bool,
    pub stopped_reason: String,
    pub retry_after_at: Option<i64>,
    pub duration_ms: i64,
    pub observations: usize,
    pub active_observations: usize,
    pub inactive_observations: usize,
    pub detail_fetches: usize,
    pub detail_fallbacks: usize,
    pub new_canonical_jobs: usize,
    pub duplicate_occurrences_merged: usize,
    pub updated_canonical_jobs: usize,
    pub reopened_canonical_jobs: usize,
    pub closed_canonical_jobs: usize,
    pub occurrence_state_changes: usize,
    pub inactive_unknown: usize,
    pub unchanged_observations: usize,
    pub canonical_changes: usize,
    pub lag_seconds: Option<i64>,
    pub corpus: CorpusCounts,
}

#[derive(Debug, Clone, Copy)]
struct RunBudget {
    max_pages: usize,
    max_observations: usize,
    max_detail_fetches: usize,
    max_duration_ms: i64,
    lease_ttl_ms: i64,
}

#[derive(Debug, Clone, Copy)]
struct FailurePolicy {
    class: &'static str,
    retryable: bool,
    retry_after_at: Option<i64>,
}

pub async fn sync_nav(environment: &Env, trigger: SyncTrigger) -> Result<SyncReport> {
    let database = environment.d1("DB")?;
    let started_ms = now_ms();
    let observed_at = started_ms.to_string();
    let initial_state = ensure_source_state(
        &database,
        NAV_SOURCE_ID,
        NAV_SOURCE_NAME,
        NAV_INITIAL_CURSOR,
        &observed_at,
    )
    .await?;
    let budget = run_budget(environment);
    let lease_owner = lease_owner(trigger, started_ms);

    match acquire_source_lease(
        &database,
        NAV_SOURCE_ID,
        &lease_owner,
        started_ms,
        budget.lease_ttl_ms,
    )
    .await?
    {
        LeaseDecision::Acquired => {}
        LeaseDecision::Busy => {
            return skipped_report(
                &database,
                trigger,
                initial_state,
                "busy",
                "lease_contended",
                started_ms,
            )
            .await;
        }
        LeaseDecision::Paused => {
            return skipped_report(
                &database,
                trigger,
                initial_state,
                "paused",
                "source_paused",
                started_ms,
            )
            .await;
        }
        LeaseDecision::RetryDeferred => {
            return skipped_report(
                &database,
                trigger,
                initial_state,
                "deferred",
                "retry_backoff",
                started_ms,
            )
            .await;
        }
        LeaseDecision::Failed => {
            return skipped_report(
                &database,
                trigger,
                initial_state,
                "failed",
                "operator_action_required",
                started_ms,
            )
            .await;
        }
    }

    let run_id = match begin_collection_run_for_source(
        &database,
        "nav-bounded-sync",
        Some(NAV_SOURCE_ID),
        trigger.as_str(),
        &observed_at,
    )
    .await
    {
        Ok(run_id) => run_id,
        Err(error) => {
            if let Err(release_error) =
                release_source_lease(&database, NAV_SOURCE_ID, &lease_owner).await
            {
                worker::console_error!(
                    "failed to release NAV source lease after run creation failure: {release_error}"
                );
            }
            return Err(error);
        }
    };
    if let Err(error) = mark_source_attempt(&database, NAV_SOURCE_ID, &observed_at).await {
        if let Err(run_error) = fail_collection_run(
            &database,
            run_id,
            &observed_at,
            "failed to mark NAV source attempt",
        )
        .await
        {
            worker::console_error!("failed to close NAV run after attempt failure: {run_error}");
        }
        if let Err(release_error) =
            release_source_lease(&database, NAV_SOURCE_ID, &lease_owner).await
        {
            worker::console_error!(
                "failed to release NAV source lease after attempt failure: {release_error}"
            );
        }
        return Err(error);
    }

    let result = sync_nav_attempt(
        environment,
        &database,
        trigger,
        &lease_owner,
        run_id,
        initial_state.clone(),
        budget,
        started_ms,
    )
    .await;

    match result {
        Ok(report) => {
            if let Err(error) = release_source_lease(&database, NAV_SOURCE_ID, &lease_owner).await {
                worker::console_error!("failed to release NAV source lease: {error}");
            }
            log_report(&report);
            Ok(report)
        }
        Err(error) => {
            let ended_ms = now_ms();
            let duration_ms = ended_ms.saturating_sub(started_ms);
            let message = sanitized_error(&error.to_string());
            let policy = classify_failure(&message);
            let current = source_state(&database, NAV_SOURCE_ID)
                .await?
                .unwrap_or(initial_state.clone());
            let pages = current
                .pages_processed
                .saturating_sub(initial_state.pages_processed)
                .max(0) as usize;
            let observations = current
                .observations_processed
                .saturating_sub(initial_state.observations_processed)
                .max(0) as usize;
            let retry_after_at = retry_after(
                policy,
                ended_ms,
                current.consecutive_failures.saturating_add(1),
            );
            let failure_key = stable_hash_hex(&format!(
                "{}|{}|{}|{}",
                NAV_SOURCE_ID, current.cursor, policy.class, "page"
            ));
            let payload_hash = stable_hash_hex(&message);

            if let Err(persist_error) = record_source_failure(
                &database,
                &failure_key,
                NAV_SOURCE_ID,
                Some(run_id),
                &current.cursor,
                None,
                policy.class,
                &payload_hash,
                &message,
                policy.retryable,
                &ended_ms.to_string(),
            )
            .await
            {
                worker::console_error!("failed to persist NAV source failure: {persist_error}");
            }
            if let Err(persist_error) = mark_source_failure(
                &database,
                NAV_SOURCE_ID,
                Some(&lease_owner),
                &ended_ms.to_string(),
                &message,
                policy.class,
                retry_after_at,
                duration_ms,
            )
            .await
            {
                worker::console_error!("failed to update NAV source failure state: {persist_error}");
            }
            if let Err(persist_error) = update_collection_run_progress(
                &database,
                run_id,
                pages,
                observations,
                0,
                duration_ms,
                &initial_state.cursor,
                &current.cursor,
                &lease_owner,
            )
            .await
            {
                worker::console_error!("failed to update failed NAV run progress: {persist_error}");
            }
            if let Err(persist_error) =
                fail_collection_run(&database, run_id, &ended_ms.to_string(), &message).await
            {
                worker::console_error!("failed to mark NAV collection run failed: {persist_error}");
            }
            if let Err(release_error) =
                release_source_lease(&database, NAV_SOURCE_ID, &lease_owner).await
            {
                worker::console_error!("failed to release failed NAV source lease: {release_error}");
            }
            log_failure(
                trigger,
                run_id,
                policy,
                &initial_state.cursor,
                &current.cursor,
                pages,
                observations,
                duration_ms,
                retry_after_at,
                &message,
            );
            Err(error)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn sync_nav_attempt(
    environment: &Env,
    database: &D1Database,
    trigger: SyncTrigger,
    lease_owner: &str,
    run_id: i64,
    initial_state: SourceStateView,
    budget: RunBudget,
    started_ms: i64,
) -> Result<SyncReport> {
    let token = resolve_token(environment).await?;
    let mut state = initial_state.clone();
    let mut report = empty_report(
        trigger,
        Some(run_id),
        initial_state.mode.clone(),
        initial_state.cursor.clone(),
        initial_state.cursor.clone(),
        corpus_counts(database).await?,
    );
    let mut detail_remaining = budget.max_detail_fetches;

    loop {
        let elapsed = now_ms().saturating_sub(started_ms);
        if report.pages >= budget.max_pages {
            report.stopped_reason = "page_budget".to_string();
            break;
        }
        if report.observations >= budget.max_observations {
            report.stopped_reason = "observation_budget".to_string();
            break;
        }
        if elapsed >= budget.max_duration_ms {
            report.stopped_reason = "duration_budget".to_string();
            break;
        }

        renew_source_lease(
            database,
            NAV_SOURCE_ID,
            lease_owner,
            now_ms(),
            budget.lease_ttl_ms,
        )
        .await?;

        let requested_cursor = state.cursor.clone();
        let initial_since = if state.cursor == NAV_INITIAL_CURSOR
            && state.etag.is_none()
            && state.last_modified.is_none()
        {
            optional_var(environment, "NAV_INITIAL_IF_MODIFIED_SINCE")
        } else {
            None
        };
        let page_response = fetch_page(
            environment,
            &state.cursor,
            state.etag.as_deref(),
            state.last_modified.as_deref(),
            initial_since.as_deref(),
            &token,
        )
        .await?;

        let (page, etag, last_modified) = match page_response {
            PageResponse::NotModified {
                etag,
                last_modified,
            } => {
                let ended = now_ms();
                let duration_ms = ended.saturating_sub(started_ms);
                mark_source_success(
                    database,
                    NAV_SOURCE_ID,
                    lease_owner,
                    &state.cursor,
                    etag.as_deref(),
                    last_modified.as_deref(),
                    parse_http_date_ms(last_modified.as_deref()),
                    "tail",
                    &ended.to_string(),
                    0,
                    false,
                    duration_ms,
                )
                .await?;
                report.not_modified = true;
                report.tail_poll = true;
                report.mode_after = "tail".to_string();
                report.stopped_reason = "not_modified".to_string();
                report.duration_ms = duration_ms;
                break;
            }
            PageResponse::Page {
                page,
                etag,
                last_modified,
            } => (page, etag, last_modified),
        };

        if page.items.len() > MAX_FEED_ITEMS_PER_PAGE {
            return Err(Error::RustError(format!(
                "ingestion_limit: NAV page contains {} items, exceeding {MAX_FEED_ITEMS_PER_PAGE}",
                page.items.len()
            )));
        }
        if report.observations.saturating_add(page.items.len()) > budget.max_observations {
            report.stopped_reason = "observation_budget_before_page".to_string();
            break;
        }

        let batch = build_observations(environment, &page, &token, detail_remaining).await?;
        detail_remaining = detail_remaining.saturating_sub(batch.detail_fetches);
        let (cursor_after, next_etag, next_last_modified, tail_poll) =
            next_checkpoint(&state.cursor, &page, etag, last_modified.clone());

        for observation in batch.observations {
            let outcome = match observation {
                NavObservation::Active(raw) => {
                    report.active_observations += 1;
                    let external_id = raw.external_id.clone();
                    let listing = normalize(raw).map_err(|error| {
                        Error::RustError(format!(
                            "nav_invalid_item: normalization failed for {external_id}: {error}"
                        ))
                    })?;
                    let observation_at = now_ms().to_string();
                    crate::repository::process_active_observation(
                        database,
                        &listing,
                        &observation_at,
                    )
                    .await?
                }
                NavObservation::Inactive { external_id } => {
                    report.inactive_observations += 1;
                    let observation_at = now_ms().to_string();
                    crate::repository::process_inactive_observation(
                        database,
                        NAV_SOURCE_ID,
                        &external_id,
                        &observation_at,
                    )
                    .await?
                }
            };
            count_outcome(&mut report, outcome);
        }

        let ended = now_ms();
        let duration_ms = ended.saturating_sub(started_ms);
        let mode_after = if tail_poll { "tail" } else { "backfill" };
        let page_observations = report
            .active_observations
            .saturating_add(report.inactive_observations)
            .saturating_sub(report.observations);
        mark_source_success(
            database,
            NAV_SOURCE_ID,
            lease_owner,
            &cursor_after,
            next_etag.as_deref(),
            next_last_modified.as_deref(),
            parse_http_date_ms(last_modified.as_deref()),
            mode_after,
            &ended.to_string(),
            page_observations,
            true,
            duration_ms,
        )
        .await?;
        resolve_source_failures(database, NAV_SOURCE_ID, &requested_cursor, &ended.to_string())
            .await?;

        report.pages += 1;
        report.observations = report
            .active_observations
            .saturating_add(report.inactive_observations);
        report.detail_fetches += batch.detail_fetches;
        report.detail_fallbacks += batch.detail_fallbacks;
        report.cursor_after = cursor_after;
        report.tail_poll = tail_poll;
        report.mode_after = mode_after.to_string();
        report.duration_ms = duration_ms;

        update_collection_run_progress(
            database,
            run_id,
            report.pages,
            report.observations,
            report.canonical_changes,
            report.duration_ms,
            &report.cursor_before,
            &report.cursor_after,
            lease_owner,
        )
        .await?;

        state = source_state(database, NAV_SOURCE_ID)
            .await?
            .ok_or_else(|| Error::RustError("NAV source state disappeared".to_string()))?;
        if tail_poll {
            report.stopped_reason = "reached_tail".to_string();
            break;
        }
    }

    let ended = now_ms();
    report.duration_ms = ended.saturating_sub(started_ms);
    let final_state = source_state(database, NAV_SOURCE_ID)
        .await?
        .ok_or_else(|| Error::RustError("NAV source state disappeared".to_string()))?;
    report.mode_after = final_state.mode;
    report.cursor_after = final_state.cursor;
    report.retry_after_at = final_state.retry_after_at;
    report.lag_seconds = final_state.lag_seconds;
    report.corpus = corpus_counts(database).await?;
    complete_collection_run_detailed(
        database,
        run_id,
        &ended.to_string(),
        report.pages,
        report.observations,
        report.canonical_changes,
        report.duration_ms,
        &report.cursor_before,
        &report.cursor_after,
        lease_owner,
    )
    .await?;
    Ok(report)
}

async fn skipped_report(
    database: &D1Database,
    trigger: SyncTrigger,
    state: SourceStateView,
    outcome: &'static str,
    reason: &str,
    started_ms: i64,
) -> Result<SyncReport> {
    let mut report = empty_report(
        trigger,
        None,
        state.mode.clone(),
        state.cursor.clone(),
        state.cursor.clone(),
        corpus_counts(database).await?,
    );
    report.outcome = outcome;
    report.mode_after = state.mode;
    report.stopped_reason = reason.to_string();
    report.retry_after_at = state.retry_after_at;
    report.lag_seconds = state.lag_seconds;
    report.duration_ms = now_ms().saturating_sub(started_ms);
    log_report(&report);
    Ok(report)
}

fn count_outcome(report: &mut SyncReport, outcome: ObservationOutcome) {
    match outcome {
        ObservationOutcome::CreatedCanonical => {
            report.new_canonical_jobs += 1;
            report.canonical_changes += 1;
        }
        ObservationOutcome::AddedDuplicateOccurrence => {
            report.duplicate_occurrences_merged += 1;
        }
        ObservationOutcome::UpdatedCanonical => {
            report.updated_canonical_jobs += 1;
            report.canonical_changes += 1;
        }
        ObservationOutcome::ReopenedCanonical => {
            report.reopened_canonical_jobs += 1;
            report.canonical_changes += 1;
        }
        ObservationOutcome::ClosedCanonical => {
            report.closed_canonical_jobs += 1;
            report.canonical_changes += 1;
        }
        ObservationOutcome::ReactivatedOccurrence | ObservationOutcome::ClosedOccurrence => {
            report.occurrence_state_changes += 1;
        }
        ObservationOutcome::InactiveUnknown => {
            report.inactive_unknown += 1;
        }
        ObservationOutcome::Unchanged => {
            report.unchanged_observations += 1;
        }
    }
}

fn empty_report(
    trigger: SyncTrigger,
    run_id: Option<i64>,
    mode_before: String,
    cursor_before: String,
    cursor_after: String,
    corpus: CorpusCounts,
) -> SyncReport {
    SyncReport {
        event: "nav_sync_completed",
        source_id: NAV_SOURCE_ID,
        trigger: trigger.as_str(),
        outcome: "completed",
        run_id,
        mode_before: mode_before.clone(),
        mode_after: mode_before,
        cursor_before,
        cursor_after,
        pages: 0,
        tail_poll: false,
        not_modified: false,
        stopped_reason: "completed".to_string(),
        retry_after_at: None,
        duration_ms: 0,
        observations: 0,
        active_observations: 0,
        inactive_observations: 0,
        detail_fetches: 0,
        detail_fallbacks: 0,
        new_canonical_jobs: 0,
        duplicate_occurrences_merged: 0,
        updated_canonical_jobs: 0,
        reopened_canonical_jobs: 0,
        closed_canonical_jobs: 0,
        occurrence_state_changes: 0,
        inactive_unknown: 0,
        unchanged_observations: 0,
        canonical_changes: 0,
        lag_seconds: None,
        corpus,
    }
}

fn run_budget(environment: &Env) -> RunBudget {
    let max_duration_ms = numeric_var(
        environment,
        "NAV_MAX_DURATION_MS",
        DEFAULT_MAX_DURATION_MS,
    )
    .clamp(1_000, HARD_MAX_DURATION_MS);
    let lease_ttl_ms = numeric_var(
        environment,
        "NAV_LEASE_TTL_MS",
        DEFAULT_LEASE_TTL_MS,
    )
    .clamp(MIN_LEASE_TTL_MS, HARD_MAX_LEASE_TTL_MS)
    .max(max_duration_ms.saturating_mul(2));
    RunBudget {
        max_pages: usize_var(
            environment,
            "NAV_MAX_PAGES_PER_RUN",
            DEFAULT_MAX_PAGES_PER_RUN,
        )
        .clamp(1, HARD_MAX_PAGES_PER_RUN),
        max_observations: usize_var(
            environment,
            "NAV_MAX_OBSERVATIONS_PER_RUN",
            DEFAULT_MAX_OBSERVATIONS_PER_RUN,
        )
        .clamp(1, HARD_MAX_OBSERVATIONS_PER_RUN),
        max_detail_fetches: usize_var(
            environment,
            "NAV_DETAIL_FETCH_LIMIT",
            DEFAULT_DETAIL_FETCH_LIMIT,
        )
        .clamp(0, HARD_MAX_DETAIL_FETCH_LIMIT),
        max_duration_ms,
        lease_ttl_ms,
    }
}

fn classify_failure(message: &str) -> FailurePolicy {
    if message.starts_with("nav_authentication:") {
        FailurePolicy {
            class: "authentication",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("nav_rate_limited:") {
        FailurePolicy {
            class: "rate_limited",
            retryable: true,
            retry_after_at: retry_after_hint(message),
        }
    } else if message.starts_with("nav_upstream:") {
        FailurePolicy {
            class: "upstream",
            retryable: true,
            retry_after_at: retry_after_hint(message),
        }
    } else if message.starts_with("nav_network:") {
        FailurePolicy {
            class: "network",
            retryable: true,
            retry_after_at: retry_after_hint(message),
        }
    } else if message.starts_with("nav_not_found:") {
        FailurePolicy {
            class: "not_found",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("nav_http:") {
        FailurePolicy {
            class: "http_request",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("nav_malformed_page:") {
        FailurePolicy {
            class: "malformed_page",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("nav_invalid_item:") {
        FailurePolicy {
            class: "invalid_item",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("ingestion_limit:") {
        FailurePolicy {
            class: "bounded_limit",
            retryable: false,
            retry_after_at: None,
        }
    } else if message.starts_with("ingestion_lease_lost:") {
        FailurePolicy {
            class: "lease_lost",
            retryable: true,
            retry_after_at: retry_after_hint(message),
        }
    } else if message.starts_with("nav_configuration:") {
        FailurePolicy {
            class: "configuration",
            retryable: false,
            retry_after_at: None,
        }
    } else {
        FailurePolicy {
            class: "persistence_or_unknown",
            retryable: true,
            retry_after_at: retry_after_hint(message),
        }
    }
}

fn retry_after(policy: FailurePolicy, now_ms: i64, failures: i64) -> Option<i64> {
    if !policy.retryable {
        return None;
    }
    if let Some(retry_at) = policy.retry_after_at.filter(|retry_at| *retry_at > now_ms) {
        return Some(retry_at);
    }
    let base_seconds = if policy.class == "rate_limited" { 300 } else { 30 };
    let exponent = failures.saturating_sub(1).clamp(0, 5) as u32;
    let delay_seconds = base_seconds * 2_i64.pow(exponent);
    Some(now_ms.saturating_add(delay_seconds.min(1_800).saturating_mul(1_000)))
}

fn retry_after_hint(message: &str) -> Option<i64> {
    if let Some(value) = numeric_marker(message, "retry_after_at=") {
        return Some(value);
    }
    numeric_marker(message, "retry_after_seconds=")
        .map(|seconds| now_ms().saturating_add(seconds.saturating_mul(1_000)))
}

fn numeric_marker(message: &str, marker: &str) -> Option<i64> {
    message
        .split_once(marker)
        .and_then(|(_, suffix)| {
            suffix
                .split(|character: char| !character.is_ascii_digit())
                .next()
        })
        .and_then(|value| value.parse::<i64>().ok())
}

fn parse_http_date_ms(value: Option<&str>) -> Option<i64> {
    value.and_then(|value| {
        let parsed = js_sys::Date::parse(value);
        parsed.is_finite().then_some(parsed as i64)
    })
}

fn optional_var(environment: &Env, name: &str) -> Option<String> {
    environment
        .var(name)
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty())
}

fn usize_var(environment: &Env, name: &str, default: usize) -> usize {
    optional_var(environment, name)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
}

fn numeric_var(environment: &Env, name: &str, default: i64) -> i64 {
    optional_var(environment, name)
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(default)
}

fn sanitized_error(message: &str) -> String {
    let mut sanitized = message.replace('\n', " ").replace('\r', " ");
    sanitized.truncate(500);
    sanitized
}

fn lease_owner(trigger: SyncTrigger, started_ms: i64) -> String {
    let nonce = (js_sys::Math::random() * 1_000_000_000.0) as u64;
    format!("nav-{}-{started_ms}-{nonce}", trigger.as_str())
}

fn log_report(report: &SyncReport) {
    match serde_json::to_string(report) {
        Ok(json) => worker::console_log!("{json}"),
        Err(error) => worker::console_error!("failed to serialize NAV sync report: {error}"),
    }
}

#[allow(clippy::too_many_arguments)]
fn log_failure(
    trigger: SyncTrigger,
    run_id: i64,
    policy: FailurePolicy,
    cursor_before: &str,
    cursor_after: &str,
    pages: usize,
    observations: usize,
    duration_ms: i64,
    retry_after_at: Option<i64>,
    message: &str,
) {
    let event = serde_json::json!({
        "event": "nav_sync_failed",
        "source_id": NAV_SOURCE_ID,
        "trigger": trigger.as_str(),
        "run_id": run_id,
        "failure_class": policy.class,
        "retryable": policy.retryable,
        "retry_after_at": retry_after_at,
        "cursor_before": cursor_before,
        "cursor_after": cursor_after,
        "pages": pages,
        "observations": observations,
        "duration_ms": duration_ms,
        "message": message,
    });
    worker::console_error!("{event}");
}

fn now_ms() -> i64 {
    js_sys::Date::now() as i64
}
