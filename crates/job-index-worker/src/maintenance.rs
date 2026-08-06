use serde::{Deserialize, Serialize};
use worker::{D1Database, Request, Response, Result, RouteContext};

const MAX_REPAIRS: usize = 100;
const MAX_PURGE_ROWS: i64 = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorpusAudit {
    pub canonical_jobs: i64,
    pub source_occurrences: i64,
    pub canonical_without_occurrences: i64,
    pub active_without_active_occurrences: i64,
    pub closed_with_active_occurrences: i64,
    pub sequence_mismatches: i64,
    pub stale_running_collection_runs: i64,
    pub unresolved_source_failures: i64,
    pub pending_outbox_events: i64,
    pub healthy: bool,
}

#[derive(Debug, Deserialize)]
struct CountRow {
    count: i64,
}

#[derive(Debug, Deserialize)]
struct JobIdRow {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ReconcileRequest {
    #[serde(default = "default_dry_run")]
    dry_run: bool,
}

const fn default_dry_run() -> bool {
    true
}

#[derive(Debug, Deserialize)]
struct PurgeRequest {
    #[serde(default = "default_dry_run")]
    dry_run: bool,
    #[serde(default = "default_retention_days")]
    retention_days: i64,
}

const fn default_retention_days() -> i64 {
    30
}

#[derive(Debug, Serialize)]
struct PurgeResponse {
    dry_run: bool,
    retention_days: i64,
    candidates: i64,
    purged: usize,
    has_more: bool,
}

#[derive(Debug, Serialize)]
struct AuditResponse {
    data: CorpusAudit,
}

#[derive(Debug, Serialize)]
struct ReconcileResponse {
    dry_run: bool,
    repairs_planned: usize,
    repairs_applied: usize,
    before: CorpusAudit,
    after: CorpusAudit,
}

pub async fn audit_endpoint(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    Response::from_json(&AuditResponse {
        data: corpus_audit(&database).await?,
    })
}

pub async fn reconcile(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let payload = match request.json::<ReconcileRequest>().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(
                &request,
                "invalid_json",
                "invalid JSON request body",
                400,
            );
        }
    };
    let database = context.env.d1("DB")?;
    let before = corpus_audit(&database).await?;
    let now = format!("{:.0}", js_sys::Date::now());
    let run_id = begin_run(&database, payload.dry_run, &now).await?;

    let work = reconcile_jobs(&database, payload.dry_run, &now).await;
    let (planned, applied, after) = match work {
        Ok(value) => value,
        Err(error) => {
            let message = truncate(&error.to_string(), 500);
            if let Err(mark_error) = fail_run(&database, run_id, &now, &message).await {
                worker::console_error!(
                    "failed to record maintenance run failure: {mark_error}"
                );
            }
            return Err(error);
        }
    };
    complete_run(
        &database,
        run_id,
        &now,
        &serde_json::to_string(&before)?,
        applied,
    )
    .await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        if payload.dry_run {
            "corpus.reconcile.dry_run"
        } else {
            "corpus.reconcile"
        },
        "corpus",
        None,
        &serde_json::json!({"planned": planned, "applied": applied}).to_string(),
    )
    .await?;
    Response::from_json(&ReconcileResponse {
        dry_run: payload.dry_run,
        repairs_planned: planned,
        repairs_applied: applied,
        before,
        after,
    })
}

pub async fn purge(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let payload = match request.json::<PurgeRequest>().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(
                &request,
                "invalid_json",
                "invalid JSON request body",
                400,
            );
        }
    };
    if !(1..=365).contains(&payload.retention_days) {
        return crate::auth::api_error(
            &request,
            "invalid_retention",
            "retention_days must be between 1 and 365",
            400,
        );
    }
    let database = context.env.d1("DB")?;
    let cutoff = (js_sys::Date::now() as i64)
        .saturating_sub(payload.retention_days.saturating_mul(86_400_000));
    let candidates = worker::query!(
        &database,
        "SELECT COUNT(*) AS count FROM notification_outbox
         WHERE status = 'delivered' AND CAST(delivered_at AS INTEGER) < ?1",
        cutoff
    )?
    .first::<CountRow>(None)
    .await?
    .map_or(0, |row| row.count);
    let mut purged = 0;
    if !payload.dry_run {
        let result = worker::query!(
            &database,
            "DELETE FROM notification_outbox
             WHERE id IN (
               SELECT id FROM notification_outbox
               WHERE status = 'delivered' AND CAST(delivered_at AS INTEGER) < ?1
               ORDER BY id
               LIMIT ?2
             )",
            cutoff,
            MAX_PURGE_ROWS
        )?
        .run()
        .await?;
        purged = result.meta()?.and_then(|meta| meta.changes).unwrap_or(0);
    }
    let response = PurgeResponse {
        dry_run: payload.dry_run,
        retention_days: payload.retention_days,
        candidates,
        purged,
        has_more: candidates > MAX_PURGE_ROWS,
    };
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        if payload.dry_run {
            "maintenance.purge.dry_run"
        } else {
            "maintenance.purge"
        },
        "notification_outbox",
        None,
        &serde_json::to_string(&response)?,
    )
    .await?;
    Response::from_json(&response)
}


async fn reconcile_jobs(
    database: &D1Database,
    dry_run: bool,
    now: &str,
) -> Result<(usize, usize, CorpusAudit)> {
    let close_jobs = query_job_ids(
        database,
        "SELECT cj.id
         FROM canonical_jobs cj
         WHERE cj.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM source_listings sl
             WHERE sl.canonical_job_id = cj.id AND sl.active = 1
           )
         ORDER BY cj.sequence
         LIMIT 100",
    )
    .await?;
    let reopen_jobs = query_job_ids(
        database,
        "SELECT cj.id
         FROM canonical_jobs cj
         WHERE cj.status = 'closed'
           AND EXISTS (
             SELECT 1 FROM source_listings sl
             WHERE sl.canonical_job_id = cj.id AND sl.active = 1
           )
         ORDER BY cj.sequence
         LIMIT 100",
    )
    .await?;
    let planned = close_jobs
        .len()
        .saturating_add(reopen_jobs.len())
        .min(MAX_REPAIRS);
    let mut applied = 0usize;

    if !dry_run {
        for (job_id, status, change_type) in close_jobs
            .iter()
            .map(|id| (id.as_str(), "closed", "closed"))
            .chain(
                reopen_jobs
                    .iter()
                    .map(|id| (id.as_str(), "active", "reopened")),
            )
            .take(MAX_REPAIRS)
        {
            database
                .batch(vec![
                    worker::query!(
                        database,
                        "INSERT INTO job_changes
                         (canonical_job_id, change_type, changed_at)
                         VALUES (?1, ?2, ?3)",
                        job_id,
                        change_type,
                        now
                    )?,
                    worker::query!(
                        database,
                        "UPDATE canonical_jobs
                         SET status = ?1,
                             sequence = (SELECT MAX(sequence) FROM job_changes),
                             changed_at = ?2
                         WHERE id = ?3",
                        status,
                        now,
                        job_id
                    )?,
                ])
                .await?;
            applied = applied.saturating_add(1);
        }
    }

    Ok((planned, applied, corpus_audit(database).await?))
}

pub async fn corpus_audit(database: &D1Database) -> Result<CorpusAudit> {
    let canonical_jobs = count(database, "SELECT COUNT(*) AS count FROM canonical_jobs").await?;
    let source_occurrences = count(database, "SELECT COUNT(*) AS count FROM source_listings").await?;
    let canonical_without_occurrences = count(
        database,
        "SELECT COUNT(*) AS count
         FROM canonical_jobs cj
         WHERE NOT EXISTS (
           SELECT 1 FROM source_listings sl WHERE sl.canonical_job_id = cj.id
         )",
    )
    .await?;
    let active_without_active_occurrences = count(
        database,
        "SELECT COUNT(*) AS count
         FROM canonical_jobs cj
         WHERE cj.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM source_listings sl
             WHERE sl.canonical_job_id = cj.id AND sl.active = 1
           )",
    )
    .await?;
    let closed_with_active_occurrences = count(
        database,
        "SELECT COUNT(*) AS count
         FROM canonical_jobs cj
         WHERE cj.status = 'closed'
           AND EXISTS (
             SELECT 1 FROM source_listings sl
             WHERE sl.canonical_job_id = cj.id AND sl.active = 1
           )",
    )
    .await?;
    let sequence_mismatches = count(
        database,
        "SELECT COUNT(*) AS count
         FROM canonical_jobs cj
         WHERE cj.sequence != COALESCE((
           SELECT MAX(jc.sequence) FROM job_changes jc
           WHERE jc.canonical_job_id = cj.id
         ), -1)",
    )
    .await?;
    let cutoff = (js_sys::Date::now() as i64).saturating_sub(60 * 60 * 1_000);
    let stale_running_collection_runs = worker::query!(
        database,
        "SELECT COUNT(*) AS count
         FROM collection_runs
         WHERE status = 'running' AND CAST(started_at AS INTEGER) < ?1",
        cutoff
    )?
    .first::<CountRow>(None)
    .await?
    .map_or(0, |row| row.count);
    let unresolved_source_failures = count(
        database,
        "SELECT COUNT(*) AS count FROM source_failures WHERE resolved_at IS NULL",
    )
    .await?;
    let pending_outbox_events = count(
        database,
        "SELECT COUNT(*) AS count
         FROM notification_outbox WHERE status IN ('pending','delivering')",
    )
    .await?;
    let healthy = canonical_without_occurrences == 0
        && active_without_active_occurrences == 0
        && closed_with_active_occurrences == 0
        && sequence_mismatches == 0
        && stale_running_collection_runs == 0;
    Ok(CorpusAudit {
        canonical_jobs,
        source_occurrences,
        canonical_without_occurrences,
        active_without_active_occurrences,
        closed_with_active_occurrences,
        sequence_mismatches,
        stale_running_collection_runs,
        unresolved_source_failures,
        pending_outbox_events,
        healthy,
    })
}

async fn count(database: &D1Database, sql: &str) -> Result<i64> {
    Ok(database
        .prepare(sql)
        .first::<CountRow>(None)
        .await?
        .map_or(0, |row| row.count))
}

async fn query_job_ids(database: &D1Database, sql: &str) -> Result<Vec<String>> {
    Ok(database
        .prepare(sql)
        .all()
        .await?
        .results::<JobIdRow>()?
        .into_iter()
        .map(|row| row.id)
        .collect())
}

async fn begin_run(database: &D1Database, dry_run: bool, now: &str) -> Result<i64> {
    let result = worker::query!(
        database,
        "INSERT INTO maintenance_runs (kind, dry_run, started_at, status)
         VALUES ('corpus_reconcile', ?1, ?2, 'running')",
        if dry_run { 1 } else { 0 },
        now
    )?
    .run()
    .await?;
    result
        .meta()?
        .and_then(|meta| meta.last_row_id)
        .ok_or_else(|| worker::Error::RustError("missing maintenance run id".to_string()))
}

async fn complete_run(
    database: &D1Database,
    run_id: i64,
    now: &str,
    findings_json: &str,
    repairs: usize,
) -> Result<()> {
    let repairs = i32::try_from(repairs)
        .map_err(|_| worker::Error::RustError("repair count overflow".to_string()))?;
    worker::query!(
        database,
        "UPDATE maintenance_runs
         SET completed_at = ?1, status = 'completed', findings_json = ?2, repairs = ?3
         WHERE id = ?4",
        now,
        findings_json,
        repairs,
        run_id
    )?
    .run()
    .await?;
    Ok(())
}

async fn fail_run(
    database: &D1Database,
    run_id: i64,
    now: &str,
    error: &str,
) -> Result<()> {
    worker::query!(
        database,
        "UPDATE maintenance_runs
         SET completed_at = ?1, status = 'failed', error = ?2
         WHERE id = ?3",
        now,
        error,
        run_id
    )?
    .run()
    .await?;
    Ok(())
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}
