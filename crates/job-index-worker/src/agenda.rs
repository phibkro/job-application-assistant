//! Scheduled assisted applications for subscribers.
//!
//! A schedule points a cadence at one of the person's saved searches. When it
//! falls due, whatever that search has newly matched is shortlisted, drafted
//! for, and prepared as an assisted application.
//!
//! Two bounds are structural rather than advisory. A run prepares at most
//! `max_per_run` applications, because each one costs drafting work and an
//! unbounded run is an unbounded bill. And a schedule cannot widen what a
//! platform permits: `automated` is honoured only where the catalogue records
//! the platform as allowing it, so a subscription buys convenience, never
//! permission.

use serde::{Deserialize, Serialize};
use worker::{D1Database, Env, Request, Response, Result, RouteContext};

const DAY_MS: i64 = 86_400_000;
const MAX_SCHEDULES_PER_SWEEP: i32 = 25;

#[derive(Debug, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub saved_search_id: String,
    pub cadence: String,
    pub max_per_run: i64,
    pub method: String,
    pub enabled: i64,
    pub next_run_at: i64,
    pub last_run_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ScheduleRow {
    id: String,
    saved_search_id: String,
    cadence: String,
    max_per_run: i64,
    method: String,
    enabled: i64,
    next_run_at: i64,
    last_run_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct DueRow {
    id: String,
    user_id: String,
    saved_search_id: String,
    cadence: String,
    max_per_run: i64,
    method: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateScheduleRequest {
    pub saved_search_id: String,
    pub cadence: String,
    #[serde(default)]
    pub max_per_run: Option<i64>,
    #[serde(default)]
    pub method: Option<String>,
}

#[derive(Debug, Serialize)]
struct Envelope<T> {
    data: T,
}

#[derive(Debug, Default, Serialize)]
pub struct SweepReport {
    pub schedules_due: usize,
    pub schedules_run: usize,
    pub applications_prepared: usize,
    pub skipped_not_premium: usize,
}

fn now_ms() -> i64 {
    worker::Date::now().as_millis() as i64
}

fn cadence_interval(cadence: &str) -> i64 {
    match cadence {
        "weekly" => DAY_MS * 7,
        // A calendar month varies; 30 days is the honest approximation for a
        // cadence whose contract is "about monthly", and it never drifts
        // earlier than the subscriber agreed to.
        "monthly" => DAY_MS * 30,
        _ => DAY_MS,
    }
}

/// `POST /api/v1/me/schedules` — subscribe a saved search to a cadence.
pub async fn create(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let Some(user) = crate::application::caller_account(&request, &database).await? else {
        return crate::auth::api_error(&request, "unauthorized", "API key required", 401);
    };
    if !crate::application::account_is_premium(&user) {
        return crate::auth::api_error(
            &request,
            "premium_required",
            "scheduled applications are a premium capability",
            402,
        );
    }
    let payload: CreateScheduleRequest = match request.json().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(
                &request,
                "invalid_body",
                "expected saved_search_id and cadence",
                400,
            );
        }
    };
    if !matches!(payload.cadence.as_str(), "daily" | "weekly" | "monthly") {
        return crate::auth::api_error(
            &request,
            "invalid_cadence",
            "cadence must be daily, weekly, or monthly",
            400,
        );
    }
    let method = payload.method.unwrap_or_else(|| "assisted".to_string());
    if !matches!(method.as_str(), "assisted" | "automated") {
        return crate::auth::api_error(
            &request,
            "invalid_method",
            "method must be assisted or automated",
            400,
        );
    }
    let max_per_run = payload.max_per_run.unwrap_or(5).clamp(1, 25);

    // The search must belong to this person: a schedule is otherwise a way to
    // read another account's search results.
    let owned = worker::query!(
        &database,
        "SELECT ss.id FROM saved_searches ss
         JOIN users u ON u.principal_id = ss.owner_id
         WHERE ss.id = ?1 AND u.id = ?2 AND ss.deleted_at IS NULL",
        payload.saved_search_id,
        user.id
    )?
    .first::<serde_json::Value>(None)
    .await?;
    if owned.is_none() {
        return crate::auth::api_error(&request, "not_found", "no such saved search", 404);
    }

    let observed_at = now_ms();
    let schedule_id = format!(
        "schedule_{}",
        job_index_core::stable_hash_hex(&format!("{}|{}", user.id, payload.saved_search_id))
    );
    database
        .prepare(
            "INSERT INTO application_schedules (id, user_id, saved_search_id, cadence, max_per_run,
                                                method, enabled, next_run_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?8)
             ON CONFLICT(user_id, saved_search_id) DO UPDATE SET
               cadence = excluded.cadence, max_per_run = excluded.max_per_run,
               method = excluded.method, enabled = 1, updated_at = excluded.updated_at",
        )
        .bind(&[
            schedule_id.as_str().into(),
            user.id.as_str().into(),
            payload.saved_search_id.as_str().into(),
            payload.cadence.as_str().into(),
            worker::wasm_bindgen::JsValue::from_f64(max_per_run as f64),
            method.as_str().into(),
            worker::wasm_bindgen::JsValue::from_f64(observed_at as f64),
            observed_at.to_string().as_str().into(),
        ])?
        .run()
        .await?;

    Response::from_json(&Envelope {
        data: load_schedules(&database, &user.id).await?,
    })
    .map(|response| response.with_status(201))
}

/// `GET /api/v1/me/schedules`
pub async fn list(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let Some(user) = crate::application::caller_account(&request, &database).await? else {
        return crate::auth::api_error(&request, "unauthorized", "API key required", 401);
    };
    Response::from_json(&Envelope {
        data: load_schedules(&database, &user.id).await?,
    })
}

/// `DELETE /api/v1/me/schedules/:id`
pub async fn cancel(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let Some(user) = crate::application::caller_account(&request, &database).await? else {
        return crate::auth::api_error(&request, "unauthorized", "API key required", 401);
    };
    let Some(schedule_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "schedule id required", 400);
    };
    database
        .prepare("UPDATE application_schedules SET enabled = 0 WHERE id = ?1 AND user_id = ?2")
        .bind(&[schedule_id.as_str().into(), user.id.as_str().into()])?
        .run()
        .await?;
    Response::from_json(&serde_json::json!({ "data": { "cancelled": schedule_id } }))
}

async fn load_schedules(database: &D1Database, user_id: &str) -> Result<Vec<Schedule>> {
    let rows = worker::query!(
        database,
        "SELECT id, saved_search_id, cadence, max_per_run, method, enabled, next_run_at, last_run_at
         FROM application_schedules WHERE user_id = ?1 ORDER BY next_run_at",
        user_id
    )?
    .all()
    .await?
    .results::<ScheduleRow>()?;
    Ok(rows
        .into_iter()
        .map(|row| Schedule {
            id: row.id,
            saved_search_id: row.saved_search_id,
            cadence: row.cadence,
            max_per_run: row.max_per_run,
            method: row.method,
            enabled: row.enabled,
            next_run_at: row.next_run_at,
            last_run_at: row.last_run_at,
        })
        .collect())
}

/// The cron entry point: prepares applications for every schedule now due.
///
/// A lapsed subscription stops the work rather than accruing it — the tier is
/// re-checked at run time, not just when the schedule was created.
pub async fn run_due_schedules(environment: &Env) -> Result<SweepReport> {
    let database = environment.d1("DB")?;
    let observed_at = now_ms();
    let due = worker::query!(
        &database,
        "SELECT s.id, s.user_id, s.saved_search_id, s.cadence, s.max_per_run, s.method
         FROM application_schedules s
         JOIN users u ON u.id = s.user_id
         WHERE s.enabled = 1
           AND s.next_run_at <= ?1
           AND u.erasure_requested_at IS NULL
         ORDER BY s.next_run_at
         LIMIT ?2",
        observed_at,
        MAX_SCHEDULES_PER_SWEEP
    )?
    .all()
    .await?
    .results::<DueRow>()?;

    let mut report = SweepReport {
        schedules_due: due.len(),
        ..SweepReport::default()
    };

    for schedule in due {
        let premium = crate::application::user_is_premium(&database, &schedule.user_id).await?;
        if !premium {
            // Do not silently keep working for a lapsed subscription, and do
            // not spin on it either: push the schedule out one interval.
            report.skipped_not_premium += 1;
            record_run(
                &database,
                &schedule,
                "skipped",
                0,
                0,
                "subscription is not active",
            )
            .await?;
            reschedule(&database, &schedule, observed_at).await?;
            continue;
        }

        let prepared = crate::application::prepare_for_schedule(
            &database,
            &schedule.user_id,
            &schedule.saved_search_id,
            schedule.max_per_run,
            &schedule.method,
        )
        .await;
        match prepared {
            Ok(outcome) => {
                report.schedules_run += 1;
                report.applications_prepared += outcome.prepared;
                record_run(
                    &database,
                    &schedule,
                    "completed",
                    outcome.considered as i64,
                    outcome.prepared as i64,
                    &outcome.stopped_reason,
                )
                .await?;
            }
            Err(error) => {
                worker::console_error!("scheduled applications failed: {error}");
                record_run(&database, &schedule, "failed", 0, 0, &error.to_string()).await?;
            }
        }
        reschedule(&database, &schedule, observed_at).await?;
    }

    Ok(report)
}

async fn reschedule(database: &D1Database, schedule: &DueRow, observed_at: i64) -> Result<()> {
    let next = observed_at.saturating_add(cadence_interval(&schedule.cadence));
    database
        .prepare(
            "UPDATE application_schedules
             SET next_run_at = ?1, last_run_at = ?2, updated_at = ?3
             WHERE id = ?4",
        )
        .bind(&[
            worker::wasm_bindgen::JsValue::from_f64(next as f64),
            worker::wasm_bindgen::JsValue::from_f64(observed_at as f64),
            observed_at.to_string().as_str().into(),
            schedule.id.as_str().into(),
        ])?
        .run()
        .await?;
    Ok(())
}

async fn record_run(
    database: &D1Database,
    schedule: &DueRow,
    status: &str,
    considered: i64,
    prepared: i64,
    stopped_reason: &str,
) -> Result<()> {
    let observed_at = now_ms().to_string();
    database
        .prepare(
            "INSERT INTO application_runs (schedule_id, user_id, started_at, completed_at, status,
                                           matches_considered, applications_prepared, stopped_reason)
             VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&[
            schedule.id.as_str().into(),
            schedule.user_id.as_str().into(),
            observed_at.as_str().into(),
            status.into(),
            worker::wasm_bindgen::JsValue::from_f64(considered as f64),
            worker::wasm_bindgen::JsValue::from_f64(prepared as f64),
            stopped_reason.chars().take(500).collect::<String>().as_str().into(),
        ])?
        .run()
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{DAY_MS, cadence_interval};

    #[test]
    fn cadence_never_fires_earlier_than_agreed() {
        assert_eq!(cadence_interval("daily"), DAY_MS);
        assert_eq!(cadence_interval("weekly"), DAY_MS * 7);
        assert_eq!(cadence_interval("monthly"), DAY_MS * 30);
        // An unrecognised cadence must not collapse to "immediately"; daily is
        // the most frequent cadence a subscriber can actually choose.
        assert_eq!(cadence_interval("hourly"), DAY_MS);
        assert_eq!(cadence_interval(""), DAY_MS);
    }
}

/// `POST /api/admin/schedules/run` — run every due schedule now.
///
/// The same work the cron performs, exposed as an operator entry point so a
/// run can be triggered and inspected without waiting for the next trigger.
/// Mirrors the manual/scheduled pairing the NAV connector already has.
pub async fn run_now(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "running schedules is an administrative capability",
            403,
        );
    }
    let report = run_due_schedules(&context.env).await?;
    Response::from_json(&Envelope { data: report })
}
