#![forbid(unsafe_code)]

mod api;
mod auth;
mod fixtures;
mod maintenance;
mod nav_connector;
mod outbox;
mod public_api;
mod repository;
mod searches;
mod sync;
mod ui;

use worker::{Context, Env, Request, Response, Result, Router, ScheduleContext, ScheduledEvent};

#[worker::event(fetch)]
async fn main(request: Request, environment: Env, _context: Context) -> Result<Response> {
    Router::new()
        .get("/", |_request, context| {
            let production = context
                .env
                .var("ENVIRONMENT")
                .map(|value| value.to_string() == "production")
                .unwrap_or(false);
            Response::from_html(if production {
                ui::PRODUCTION_INDEX_HTML
            } else {
                ui::INDEX_HTML
            })
        })
        .get_async("/api/health", api::health)
        .get_async("/api/about", api::about)
        .get_async("/api/jobs", api::jobs)
        .get_async("/api/v1/jobs", public_api::jobs)
        .get_async("/api/v1/jobs/:id", public_api::job)
        .get_async("/api/v1/changes", public_api::changes)
        .get_async("/api/v1/sources", public_api::sources)
        .post_async("/api/v1/searches", searches::create_owned)
        .get_async("/api/v1/searches", searches::list_owned)
        .get_async("/api/v1/searches/:id", searches::get_owned)
        .patch_async("/api/v1/searches/:id", searches::update_owned)
        .delete_async("/api/v1/searches/:id", searches::delete_owned)
        .post_async("/api/v1/searches/:id/evaluate", searches::evaluate_owned)
        .get_async("/api/v1/searches/:id/matches", searches::matches_owned)
        .post_async("/api/v1/searches/:id/reset", searches::reset_owned)
        .post_async(
            "/api/v1/searches/:id/subscriptions",
            outbox::create_subscription,
        )
        .get_async(
            "/api/v1/searches/:id/subscriptions",
            outbox::list_subscriptions,
        )
        .delete_async(
            "/api/v1/searches/:id/subscriptions/:subscription_id",
            outbox::delete_subscription,
        )
        .get_async("/api/v1/searches/:id/deliveries", outbox::list_deliveries)
        .post_async(
            "/api/admin/searches/evaluate-due",
            searches::evaluate_due_endpoint,
        )
        .post_async("/api/admin/outbox/deliver", outbox::deliver_endpoint)
        .post_async("/api/admin/outbox/retry-dead", outbox::retry_dead)
        .get_async("/api/demo/status", api::status)
        .post_async("/api/admin/principals", auth::create_principal)
        .get_async("/api/admin/principals", auth::list_principals)
        .post_async("/api/admin/principals/:id/revoke", auth::revoke_principal)
        .get_async("/api/admin/audit", auth::list_audit)
        .get_async("/api/admin/maintenance/audit", maintenance::audit_endpoint)
        .post_async("/api/admin/maintenance/reconcile", maintenance::reconcile)
        .post_async("/api/admin/maintenance/purge", maintenance::purge)
        .post_async("/api/searches", searches::create)
        .get_async("/api/searches", searches::list)
        .get_async("/api/searches/:id", searches::get)
        .post_async("/api/searches/:id/evaluate", searches::evaluate)
        .get_async("/api/searches/:id/matches", searches::matches)
        .get_async("/api/sources/nav/status", api::nav_status)
        .get_async("/api/sources/nav/failures", api::nav_failures)
        .post_async("/api/sources/nav/sync", api::nav_sync)
        .post_async("/api/sources/nav/pause", api::nav_pause)
        .post_async("/api/sources/nav/resume", api::nav_resume)
        .post_async("/api/sources/nav/retry", api::nav_retry)
        .post_async("/api/sources/nav/restart", api::nav_restart)
        .post_async(
            "/api/sources/nav/lease/release",
            api::nav_release_stale_lease,
        )
        .post_async("/api/demo/nav/active", api::nav_fixture_active)
        .post_async("/api/demo/nav/update", api::nav_fixture_updated)
        .post_async("/api/demo/nav/nonmatching", api::nav_fixture_nonmatching)
        .post_async("/api/demo/nav/close", api::nav_fixture_closed)
        .post_async(
            "/api/demo/nav/cursor-failure",
            api::nav_cursor_failure_probe,
        )
        .post_async("/api/demo/nav/lease", api::nav_lease_probe)
        .post_async("/api/demo/collect", api::collect_initial)
        .post_async("/api/demo/atomicity", api::atomicity)
        .post_async("/api/demo/reset", api::reset)
        .run(request, environment)
        .await
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScheduledTask {
    NavSync,
    SearchEvaluation,
    OutboxDelivery,
}

impl ScheduledTask {
    fn from_cron(cron: &str) -> Option<Self> {
        match cron {
            "0,15,30,45 * * * *" => Some(Self::NavSync),
            "2,7,12,17,22,27,32,37,42,47,52,57 * * * *" => Some(Self::SearchEvaluation),
            "4,9,14,19,24,29,34,39,44,49,54,59 * * * *" => Some(Self::OutboxDelivery),
            _ => None,
        }
    }
}

#[worker::event(scheduled)]
async fn scheduled(event: ScheduledEvent, environment: Env, _context: ScheduleContext) {
    let cron = event.cron();
    match ScheduledTask::from_cron(&cron) {
        Some(ScheduledTask::NavSync) => run_scheduled_nav(&environment).await,
        Some(ScheduledTask::SearchEvaluation) => run_scheduled_searches(&environment).await,
        Some(ScheduledTask::OutboxDelivery) => run_scheduled_outbox(&environment).await,
        None => worker::console_error!("unknown scheduled trigger: {cron}"),
    }
}

async fn run_scheduled_nav(environment: &Env) {
    let enabled = environment
        .var("NAV_SYNC_ENABLED")
        .map(|value| value.to_string() == "true")
        .unwrap_or(false);
    if !enabled {
        worker::console_log!("scheduled NAV sync skipped: NAV_SYNC_ENABLED is false");
        return;
    }
    match sync::sync_nav(environment, sync::SyncTrigger::Scheduled).await {
        Ok(report) => worker::console_log!(
            "scheduled NAV sync outcome={}, pages={}, observations={}, changes={}, cursor={}",
            report.outcome,
            report.pages,
            report.observations,
            report.canonical_changes,
            report.cursor_after
        ),
        Err(error) => worker::console_error!("scheduled NAV sync failed: {error}"),
    }
}

async fn run_scheduled_searches(environment: &Env) {
    let database = match environment.d1("DB") {
        Ok(value) => value,
        Err(error) => {
            worker::console_error!("scheduled D1 binding unavailable: {error}");
            return;
        }
    };
    match searches::evaluate_due_searches(&database).await {
        Ok(report) => worker::console_log!(
            "saved-search sweep selected={}, completed={}, failed={}, transitions={}, more={}",
            report.selected,
            report.completed,
            report.failed,
            report.transitions,
            report.searches_with_more
        ),
        Err(error) => worker::console_error!("saved-search sweep failed: {error}"),
    }
}

async fn run_scheduled_outbox(environment: &Env) {
    let database = match environment.d1("DB") {
        Ok(value) => value,
        Err(error) => {
            worker::console_error!("scheduled D1 binding unavailable: {error}");
            return;
        }
    };
    match outbox::deliver_pending(&database).await {
        Ok(report) => worker::console_log!(
            "outbox delivery selected={}, delivered={}, deferred={}, dead={}",
            report.selected,
            report.delivered,
            report.deferred,
            report.dead
        ),
        Err(error) => worker::console_error!("outbox delivery failed: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::ScheduledTask;

    #[test]
    fn production_crons_map_to_one_bounded_task_each() {
        assert_eq!(
            ScheduledTask::from_cron("0,15,30,45 * * * *"),
            Some(ScheduledTask::NavSync)
        );
        assert_eq!(
            ScheduledTask::from_cron("2,7,12,17,22,27,32,37,42,47,52,57 * * * *"),
            Some(ScheduledTask::SearchEvaluation)
        );
        assert_eq!(
            ScheduledTask::from_cron("4,9,14,19,24,29,34,39,44,49,54,59 * * * *"),
            Some(ScheduledTask::OutboxDelivery)
        );
        assert_eq!(ScheduledTask::from_cron("* * * * *"), None);
    }
}
