use crate::fixtures::{InitialFixtureSource, JobSource, NavFixtureScenario, nav_fixture_listing};
use crate::repository::{
    LeaseDecision, ObservationOutcome, acquire_source_lease, begin_collection_run,
    clear_source_retry, clear_stale_source_lease, complete_collection_run, corpus_counts,
    ensure_source_state, list_jobs, list_source_failures, mark_source_attempt, mark_source_failure,
    process_inactive_observation, process_observation, release_source_lease, reset_demo,
    restart_source_from, set_source_paused, source_state, verify_atomic_rollback,
};
use crate::sync::{SyncTrigger, sync_nav};
use job_index_core::{NAV_SOURCE_ID, normalize};
use serde::{Deserialize, Serialize};
use worker::{Request, Response, Result, RouteContext};

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    environment: String,
}

#[derive(Debug, Serialize)]
struct AboutResponse {
    service: &'static str,
    license: &'static str,
    environment: String,
    source_code_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct JobsResponse {
    data: Vec<crate::repository::CanonicalJobView>,
    meta: crate::repository::CorpusCounts,
}

#[derive(Debug, Serialize)]
struct CollectionReport {
    scenario: String,
    observations: usize,
    new_canonical_jobs: usize,
    new_source_occurrences: usize,
    duplicate_occurrences_merged: usize,
    updated_canonical_jobs: usize,
    unchanged_observations: usize,
    canonical_changes: usize,
    corpus: crate::repository::CorpusCounts,
}

#[derive(Debug, Serialize)]
struct SourceStatusResponse {
    data: Option<crate::repository::SourceStateView>,
}

#[derive(Debug, Serialize)]
struct TransitionResponse {
    scenario: &'static str,
    outcome: &'static str,
    corpus: crate::repository::CorpusCounts,
}

#[derive(Debug, Serialize)]
struct CursorFailureProbeResponse {
    cursor_before: String,
    cursor_after: String,
    cursor_unchanged: bool,
    consecutive_failures: i64,
}

#[derive(Debug, Deserialize)]
struct RestartSourceRequest {
    #[serde(default = "default_restart_cursor")]
    cursor: String,
    if_modified_since: Option<String>,
}

#[derive(Debug, Serialize)]
struct SourceFailuresResponse {
    data: Vec<crate::repository::SourceFailureView>,
}

#[derive(Debug, Serialize)]
struct LeaseProbeResponse {
    first_acquired: bool,
    second_contended: bool,
    stale_reclaimed: bool,
}

#[derive(Debug, Serialize)]
struct LeaseReleaseResponse {
    released: bool,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug, Serialize)]
struct AtomicityResponse {
    rolled_back: bool,
}

pub async fn health(_request: Request, context: RouteContext<()>) -> Result<Response> {
    Response::from_json(&HealthResponse {
        status: "ok",
        service: "job-index",
        environment: environment_name(&context),
    })
}

pub async fn about(_request: Request, context: RouteContext<()>) -> Result<Response> {
    Response::from_json(&AboutResponse {
        service: "job-index",
        license: "proprietary",
        environment: environment_name(&context),
        source_code_url: optional_environment_var(&context, "SOURCE_CODE_URL"),
    })
}

pub async fn jobs(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error(
            "legacy unbounded job route is disabled; use /api/v1/jobs",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let data = list_jobs(&database).await?;
    let meta = corpus_counts(&database).await?;
    Response::from_json(&JobsResponse { data, meta })
}

pub async fn status(_request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    Response::from_json(&corpus_counts(&database).await?)
}

pub async fn nav_status(_request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    Response::from_json(&SourceStatusResponse {
        data: source_state(&database, NAV_SOURCE_ID).await?,
    })
}

pub async fn nav_sync(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV sync capability is not authorized", 403);
    }

    match sync_nav(&context.env, SyncTrigger::Manual).await {
        Ok(report) => {
            let database = context.env.d1("DB")?;
            crate::auth::audit(
                &database,
                &request,
                "admin",
                None,
                "nav.sync",
                "source",
                Some(NAV_SOURCE_ID),
                &serde_json::json!({"outcome": &report.outcome, "pages": report.pages}).to_string(),
            )
            .await?;
            Response::from_json(&report)
        }
        Err(error) => json_error(&format!("NAV sync failed: {error}"), 502),
    }
}

pub async fn nav_failures(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV failure inspection is not authorized", 403);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    Response::from_json(&SourceFailuresResponse {
        data: list_source_failures(&database, NAV_SOURCE_ID, false).await?,
    })
}

pub async fn nav_pause(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV pause capability is not authorized", 403);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    set_source_paused(&database, NAV_SOURCE_ID, true, &now_marker()).await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "nav.pause",
        "source",
        Some(NAV_SOURCE_ID),
        "{}",
    )
    .await?;
    Response::from_json(&SourceStatusResponse {
        data: source_state(&database, NAV_SOURCE_ID).await?,
    })
}

pub async fn nav_resume(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV resume capability is not authorized", 403);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    set_source_paused(&database, NAV_SOURCE_ID, false, &now_marker()).await?;
    clear_source_retry(&database, NAV_SOURCE_ID, &now_marker()).await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "nav.resume",
        "source",
        Some(NAV_SOURCE_ID),
        "{}",
    )
    .await?;
    Response::from_json(&SourceStatusResponse {
        data: source_state(&database, NAV_SOURCE_ID).await?,
    })
}

pub async fn nav_retry(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV retry capability is not authorized", 403);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    clear_source_retry(&database, NAV_SOURCE_ID, &now_marker()).await?;
    match sync_nav(&context.env, SyncTrigger::Retry).await {
        Ok(report) => {
            crate::auth::audit(
                &database,
                &request,
                "admin",
                None,
                "nav.retry",
                "source",
                Some(NAV_SOURCE_ID),
                &serde_json::json!({"outcome": &report.outcome}).to_string(),
            )
            .await?;
            Response::from_json(&report)
        }
        Err(error) => json_error(&format!("NAV retry failed: {error}"), 502),
    }
}

pub async fn nav_restart(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV restart capability is not authorized", 403);
    }
    let body = match request.json::<RestartSourceRequest>().await {
        Ok(value) => value,
        Err(_) => return json_error("invalid JSON request body", 400),
    };
    if body.cursor.trim().is_empty() {
        return json_error("cursor must not be empty", 400);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    restart_source_from(
        &database,
        NAV_SOURCE_ID,
        body.cursor.trim(),
        body.if_modified_since.as_deref(),
        &now_marker(),
    )
    .await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "nav.restart",
        "source",
        Some(NAV_SOURCE_ID),
        &serde_json::json!({"cursor": body.cursor}).to_string(),
    )
    .await?;
    Response::from_json(&SourceStatusResponse {
        data: source_state(&database, NAV_SOURCE_ID).await?,
    })
}

pub async fn nav_release_stale_lease(
    request: Request,
    context: RouteContext<()>,
) -> Result<Response> {
    if !admin_allowed(&request, &context)? {
        return json_error("NAV lease recovery is not authorized", 403);
    }
    let database = context.env.d1("DB")?;
    ensure_nav_state(&database).await?;
    let released =
        clear_stale_source_lease(&database, NAV_SOURCE_ID, js_sys::Date::now() as i64).await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "nav.lease.release",
        "source",
        Some(NAV_SOURCE_ID),
        &serde_json::json!({"released": released}).to_string(),
    )
    .await?;
    Response::from_json(&LeaseReleaseResponse { released })
}

pub async fn nav_lease_probe(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }
    const SOURCE_ID: &str = "nav-lease-probe";
    let database = context.env.d1("DB")?;
    let observed_at = now_marker();
    ensure_source_state(
        &database,
        SOURCE_ID,
        "NAV lease probe",
        crate::nav_connector::NAV_INITIAL_CURSOR,
        &observed_at,
    )
    .await?;
    let first = acquire_source_lease(&database, SOURCE_ID, "owner-a", 1_000, 100).await?;
    let second = acquire_source_lease(&database, SOURCE_ID, "owner-b", 1_050, 100).await?;
    let stale = acquire_source_lease(&database, SOURCE_ID, "owner-b", 1_101, 100).await?;
    release_source_lease(&database, SOURCE_ID, "owner-b").await?;
    Response::from_json(&LeaseProbeResponse {
        first_acquired: first == LeaseDecision::Acquired,
        second_contended: second == LeaseDecision::Busy,
        stale_reclaimed: stale == LeaseDecision::Acquired,
    })
}

pub async fn nav_cursor_failure_probe(
    _request: Request,
    context: RouteContext<()>,
) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }

    let database = context.env.d1("DB")?;
    let observed_at = now_marker();
    const PROBE_SOURCE_ID: &str = "nav-failure-probe";
    const PROBE_SOURCE_NAME: &str = "NAV failure probe";
    let before = ensure_source_state(
        &database,
        PROBE_SOURCE_ID,
        PROBE_SOURCE_NAME,
        crate::nav_connector::NAV_INITIAL_CURSOR,
        &observed_at,
    )
    .await?;
    mark_source_attempt(&database, PROBE_SOURCE_ID, &observed_at).await?;
    mark_source_failure(
        &database,
        PROBE_SOURCE_ID,
        None,
        &observed_at,
        "deterministic fixture failure",
        "fixture",
        Some((js_sys::Date::now() as i64).saturating_add(1_000)),
        0,
    )
    .await?;
    let after = source_state(&database, PROBE_SOURCE_ID)
        .await?
        .ok_or_else(|| {
            worker::Error::RustError("failure-probe source state disappeared".to_string())
        })?;

    Response::from_json(&CursorFailureProbeResponse {
        cursor_unchanged: before.cursor == after.cursor,
        cursor_before: before.cursor,
        cursor_after: after.cursor,
        consecutive_failures: after.consecutive_failures,
    })
}

pub async fn nav_fixture_active(_request: Request, context: RouteContext<()>) -> Result<Response> {
    apply_nav_fixture(&context, NavFixtureScenario::Active, "active").await
}

pub async fn nav_fixture_updated(_request: Request, context: RouteContext<()>) -> Result<Response> {
    apply_nav_fixture(&context, NavFixtureScenario::Updated, "updated").await
}

pub async fn nav_fixture_nonmatching(
    _request: Request,
    context: RouteContext<()>,
) -> Result<Response> {
    apply_nav_fixture(&context, NavFixtureScenario::NonMatching, "nonmatching").await
}

pub async fn nav_fixture_closed(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }
    let database = context.env.d1("DB")?;
    let outcome =
        process_inactive_observation(&database, NAV_SOURCE_ID, "active-vacancy-1", &now_marker())
            .await?;
    Response::from_json(&TransitionResponse {
        scenario: "closed",
        outcome: outcome_name(outcome),
        corpus: corpus_counts(&database).await?,
    })
}

async fn apply_nav_fixture(
    context: &RouteContext<()>,
    scenario: NavFixtureScenario,
    scenario_name: &'static str,
) -> Result<Response> {
    if !demo_mutations_allowed(context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }
    let database = context.env.d1("DB")?;
    let raw = nav_fixture_listing(scenario)?;
    let listing = normalize(raw).map_err(|error| {
        worker::Error::RustError(format!("NAV fixture normalization failed: {error}"))
    })?;
    let outcome = process_observation(&database, &listing, &now_marker()).await?;
    Response::from_json(&TransitionResponse {
        scenario: scenario_name,
        outcome: outcome_name(outcome),
        corpus: corpus_counts(&database).await?,
    })
}

fn outcome_name(outcome: ObservationOutcome) -> &'static str {
    match outcome {
        ObservationOutcome::CreatedCanonical => "created",
        ObservationOutcome::AddedDuplicateOccurrence => "duplicate_occurrence",
        ObservationOutcome::UpdatedCanonical => "updated",
        ObservationOutcome::ReopenedCanonical => "reopened",
        ObservationOutcome::ReactivatedOccurrence => "reactivated_occurrence",
        ObservationOutcome::ClosedCanonical => "closed",
        ObservationOutcome::ClosedOccurrence => "closed_occurrence",
        ObservationOutcome::InactiveUnknown => "inactive_unknown",
        ObservationOutcome::Unchanged => "unchanged",
    }
}

pub async fn collect_initial(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }

    let database = context.env.d1("DB")?;
    let observed_at = now_marker();
    let source = InitialFixtureSource;
    let scenario = source.scenario();
    let raw_listings = source.collect()?;
    let run_id = begin_collection_run(&database, scenario, &observed_at).await?;

    let mut report = CollectionReport {
        scenario: scenario.to_string(),
        observations: raw_listings.len(),
        new_canonical_jobs: 0,
        new_source_occurrences: 0,
        duplicate_occurrences_merged: 0,
        updated_canonical_jobs: 0,
        unchanged_observations: 0,
        canonical_changes: 0,
        corpus: corpus_counts(&database).await?,
    };

    for raw in raw_listings {
        let listing = normalize(raw).map_err(|error| {
            worker::Error::RustError(format!("fixture normalization failed: {error}"))
        })?;
        match process_observation(&database, &listing, &observed_at).await? {
            ObservationOutcome::CreatedCanonical => {
                report.new_canonical_jobs += 1;
                report.new_source_occurrences += 1;
                report.canonical_changes += 1;
            }
            ObservationOutcome::AddedDuplicateOccurrence => {
                report.new_source_occurrences += 1;
                report.duplicate_occurrences_merged += 1;
            }
            ObservationOutcome::UpdatedCanonical => {
                report.updated_canonical_jobs += 1;
                report.canonical_changes += 1;
            }
            ObservationOutcome::Unchanged => {
                report.unchanged_observations += 1;
            }
            ObservationOutcome::ReopenedCanonical
            | ObservationOutcome::ReactivatedOccurrence
            | ObservationOutcome::ClosedCanonical
            | ObservationOutcome::ClosedOccurrence
            | ObservationOutcome::InactiveUnknown => {
                return Err(worker::Error::RustError(
                    "fixture source produced an unsupported lifecycle transition".to_string(),
                ));
            }
        }
    }

    complete_collection_run(
        &database,
        run_id,
        &observed_at,
        report.observations,
        report.canonical_changes,
    )
    .await?;
    report.corpus = corpus_counts(&database).await?;

    Response::from_json(&report)
}

pub async fn atomicity(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }

    let database = context.env.d1("DB")?;
    let rolled_back = verify_atomic_rollback(&database, &now_marker()).await?;
    Response::from_json(&AtomicityResponse { rolled_back })
}

pub async fn reset(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !demo_mutations_allowed(&context) {
        return json_error("demo mutation endpoints are disabled", 403);
    }

    let database = context.env.d1("DB")?;
    reset_demo(&database).await?;
    Response::from_json(&corpus_counts(&database).await?)
}

async fn ensure_nav_state(database: &worker::D1Database) -> Result<()> {
    ensure_source_state(
        database,
        NAV_SOURCE_ID,
        job_index_core::NAV_SOURCE_NAME,
        crate::nav_connector::NAV_INITIAL_CURSOR,
        &now_marker(),
    )
    .await?;
    Ok(())
}

fn environment_name(context: &RouteContext<()>) -> String {
    optional_environment_var(context, "ENVIRONMENT").unwrap_or_else(|| "unknown".to_string())
}

fn optional_environment_var(context: &RouteContext<()>, name: &str) -> Option<String> {
    context
        .env
        .var(name)
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty())
}

fn default_restart_cursor() -> String {
    "/api/v1/feed".to_string()
}

fn demo_mutations_allowed(context: &RouteContext<()>) -> bool {
    context
        .env
        .var("ALLOW_DEMO_MUTATIONS")
        .map(|value| value.to_string() == "true")
        .unwrap_or(false)
}

pub(crate) fn admin_allowed(request: &Request, context: &RouteContext<()>) -> Result<bool> {
    let allow_without_token = context
        .env
        .var("ALLOW_NAV_SYNC_WITHOUT_TOKEN")
        .map(|value| value.to_string() == "true")
        .unwrap_or(false);
    if allow_without_token {
        return Ok(true);
    }

    let expected = match context.env.secret("ADMIN_SYNC_TOKEN") {
        Ok(secret) => secret.to_string(),
        Err(_) => return Ok(false),
    };
    let supplied = request.headers().get("authorization")?;
    let expected_header = format!("Bearer {expected}");
    Ok(supplied
        .as_deref()
        .is_some_and(|value| constant_time_eq(value.as_bytes(), expected_header.as_bytes())))
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let length = left.len().max(right.len());
    let mut difference = left.len() ^ right.len();
    for index in 0..length {
        let left_byte = left.get(index).copied().unwrap_or_default();
        let right_byte = right.get(index).copied().unwrap_or_default();
        difference |= usize::from(left_byte ^ right_byte);
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use super::constant_time_eq;

    #[test]
    fn constant_time_comparison_accepts_identical_tokens() {
        assert!(constant_time_eq(b"Bearer secret", b"Bearer secret"));
    }

    #[test]
    fn constant_time_comparison_rejects_different_content_and_length() {
        assert!(!constant_time_eq(b"Bearer secret", b"Bearer secrEt"));
        assert!(!constant_time_eq(b"Bearer secret", b"Bearer secret-extra"));
    }
}

fn now_marker() -> String {
    format!("{:.0}", js_sys::Date::now())
}

fn json_error(message: &str, status: u16) -> Result<Response> {
    Ok(Response::from_json(&ErrorResponse {
        error: message.to_string(),
    })?
    .with_status(status))
}
