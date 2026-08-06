use std::{net::IpAddr, time::Duration};

use futures_util::future::{Either, select};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use worker::{
    AbortController, Delay, Fetch, Headers, Method, Request, RequestInit, Response, Result,
    RouteContext,
};

const DELIVERY_BATCH_SIZE: i64 = 20;
const DELIVERY_LEASE_MS: i64 = 300_000;
const WEBHOOK_TIMEOUT_MS: u64 = 10_000;
const MAX_ATTEMPTS: i64 = 10;
const RETRY_BATCH_SIZE: i64 = 100;
const SUBSCRIPTION_QUOTA: i64 = 10;
const WEBHOOK_URL_MAX: usize = 2_048;
const WEBHOOK_SECRET_MIN: usize = 16;
const WEBHOOK_SECRET_MAX: usize = 512;
const DELIVERY_PAGE_DEFAULT: i64 = 50;
const DELIVERY_PAGE_MAX: i64 = 100;

#[derive(Debug, Deserialize)]
struct CreateSubscriptionRequest {
    target_url: String,
    secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubscriptionView {
    id: String,
    saved_search_id: String,
    target_url: String,
    active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct SubscriptionRow {
    id: String,
    saved_search_id: String,
    target_url: String,
    active: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct SubscriptionList {
    data: Vec<SubscriptionView>,
}

#[derive(Debug, Deserialize)]
struct OutboxRow {
    id: i64,
    target_url: String,
    secret: Option<String>,
    payload_json: String,
    attempts: i64,
}

#[derive(Debug, Serialize)]
pub struct DeliveryReport {
    pub selected: usize,
    pub delivered: usize,
    pub deferred: usize,
    pub dead: usize,
}

pub async fn create_subscription(
    mut request: Request,
    context: RouteContext<()>,
) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    if !principal.can_mutate() {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "principal role is read-only",
            403,
        );
    }
    let search_id = route_search_id(&context)?;
    if !owns_search(&database, &principal.id, &search_id).await? {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    let payload = match request.json::<CreateSubscriptionRequest>().await {
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
    let target_url = payload.target_url.trim();
    if target_url.is_empty() || target_url.len() > WEBHOOK_URL_MAX {
        return crate::auth::api_error(
            &request,
            "invalid_webhook",
            "webhook URL must be 1..2048 characters",
            400,
        );
    }
    if payload.secret.as_deref().is_some_and(|secret| {
        !(WEBHOOK_SECRET_MIN..=WEBHOOK_SECRET_MAX).contains(&secret.len())
    }) {
        return crate::auth::api_error(
            &request,
            "invalid_webhook",
            "webhook secret must be 16..512 characters",
            400,
        );
    }
    let allow_http = context
        .env
        .var("ENVIRONMENT")
        .map(|value| matches!(value.to_string().as_str(), "local" | "test"))
        .unwrap_or(false);
    if !webhook_target_allowed(target_url, allow_http) {
        return crate::auth::api_error(
            &request,
            "invalid_webhook",
            "webhook URL must use HTTPS",
            400,
        );
    }
    let id = format!(
        "subscription_{}",
        job_index_core::stable_hash_hex(&format!("{}|{}|{}", principal.id, search_id, target_url))
    );
    #[derive(Deserialize)]
    struct CountRow {
        count: i64,
    }
    let subscription_count = worker::query!(
        &database,
        "SELECT COUNT(*) AS count FROM webhook_subscriptions
         WHERE principal_id = ?1 AND saved_search_id = ?2 AND id != ?3",
        &principal.id,
        &search_id,
        &id
    )?
    .first::<CountRow>(None)
    .await?
    .map_or(0, |row| row.count);
    if subscription_count >= SUBSCRIPTION_QUOTA {
        return crate::auth::api_error(
            &request,
            "quota_exceeded",
            "webhook subscription quota reached",
            409,
        );
    }
    let now = format!("{:.0}", js_sys::Date::now());
    worker::query!(
        &database,
        "INSERT INTO webhook_subscriptions
         (id, principal_id, saved_search_id, target_url, secret, active,
          created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           target_url = excluded.target_url,
           secret = excluded.secret,
           active = 1,
           updated_at = excluded.updated_at",
        &id,
        &principal.id,
        &search_id,
        target_url,
        payload.secret.as_deref(),
        &now
    )?
    .run()
    .await?;
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "webhook_subscription.upsert",
        "webhook_subscription",
        Some(&id),
        "{}",
    )
    .await?;
    Ok(Response::from_json(&SubscriptionView {
        id,
        saved_search_id: search_id,
        target_url: target_url.to_string(),
        active: true,
        created_at: now.clone(),
        updated_at: now,
    })?
    .with_status(201))
}

pub async fn list_subscriptions(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    let search_id = route_search_id(&context)?;
    if !owns_search(&database, &principal.id, &search_id).await? {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    let data = worker::query!(
        &database,
        "SELECT id, saved_search_id, target_url, active, created_at, updated_at
         FROM webhook_subscriptions
         WHERE principal_id = ?1 AND saved_search_id = ?2
         ORDER BY created_at, id LIMIT 100",
        &principal.id,
        &search_id
    )?
    .all()
    .await?
    .results::<SubscriptionRow>()?
    .into_iter()
    .map(SubscriptionView::from)
    .collect();
    Response::from_json(&SubscriptionList { data })
}

pub async fn delete_subscription(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    if !principal.can_mutate() {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "principal role is read-only",
            403,
        );
    }
    let id = context
        .param("subscription_id")
        .cloned()
        .ok_or_else(|| worker::Error::RustError("missing subscription id".to_string()))?;
    let result = worker::query!(
        &database,
        "DELETE FROM webhook_subscriptions WHERE id = ?1 AND principal_id = ?2",
        &id,
        &principal.id
    )?
    .run()
    .await?;
    if result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
        return crate::auth::api_error(&request, "not_found", "subscription not found", 404);
    }
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "webhook_subscription.delete",
        "webhook_subscription",
        Some(&id),
        "{}",
    )
    .await?;
    Ok(Response::empty()?.with_status(204))
}

pub async fn deliver_endpoint(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let report = deliver_pending(&database).await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "outbox.deliver",
        "notification_outbox",
        None,
        &serde_json::to_string(&report)?,
    )
    .await?;
    Response::from_json(&report)
}

pub async fn deliver_pending(database: &worker::D1Database) -> Result<DeliveryReport> {
    let now = js_sys::Date::now() as i64;
    worker::query!(
        database,
        "UPDATE notification_outbox
         SET status = 'pending', last_error = 'delivery lease expired'
         WHERE status = 'delivering' AND next_attempt_at <= ?1",
        now
    )?
    .run()
    .await?;
    let rows = worker::query!(
        database,
        "SELECT o.id, ws.target_url, ws.secret, o.payload_json, o.attempts
         FROM notification_outbox o
         JOIN webhook_subscriptions ws ON ws.id = o.subscription_id
         WHERE o.status = 'pending' AND o.next_attempt_at <= ?1 AND ws.active = 1
         ORDER BY o.id
         LIMIT ?2",
        now,
        DELIVERY_BATCH_SIZE
    )?
    .all()
    .await?
    .results::<OutboxRow>()?;
    let mut report = DeliveryReport {
        selected: 0,
        delivered: 0,
        deferred: 0,
        dead: 0,
    };
    for row in rows {
        let claim = worker::query!(
            database,
            "UPDATE notification_outbox
             SET status = 'delivering', next_attempt_at = ?1
             WHERE id = ?2 AND status = 'pending'",
            now.saturating_add(DELIVERY_LEASE_MS),
            row.id
        )?
        .run()
        .await?;
        if claim.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
            continue;
        }
        report.selected += 1;
        match send_webhook(&row).await {
            Ok(()) => {
                worker::query!(
                    database,
                    "UPDATE notification_outbox
                     SET status = 'delivered', attempts = attempts + 1,
                         delivered_at = ?1, last_error = NULL
                     WHERE id = ?2",
                    now.to_string(),
                    row.id
                )?
                .run()
                .await?;
                report.delivered += 1;
            }
            Err(error) => {
                let attempts = row.attempts.saturating_add(1);
                let dead = attempts >= MAX_ATTEMPTS;
                let exponent = u32::try_from(attempts.min(8)).unwrap_or(8);
                let delay = 30_000_i64.saturating_mul(1_i64 << exponent);
                worker::query!(
                    database,
                    "UPDATE notification_outbox
                     SET status = ?1, attempts = ?2, next_attempt_at = ?3,
                         last_error = ?4
                     WHERE id = ?5",
                    if dead { "dead" } else { "pending" },
                    attempts,
                    now.saturating_add(delay),
                    truncate(&error.to_string(), 500),
                    row.id
                )?
                .run()
                .await?;
                if dead {
                    report.dead += 1;
                } else {
                    report.deferred += 1;
                }
            }
        }
    }
    Ok(report)
}

async fn send_webhook(row: &OutboxRow) -> Result<()> {
    let headers = Headers::new();
    headers.set("content-type", "application/json")?;
    headers.set("user-agent", "job-index-webhook/1")?;
    headers.set("x-job-index-event-id", &row.id.to_string())?;
    if let Some(secret) = row.secret.as_deref() {
        headers.set("x-job-index-signature", &signature(secret, &row.payload_json)?)?;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(worker::wasm_bindgen::JsValue::from_str(
            &row.payload_json,
        )));
    let request = Request::new_with_init(&row.target_url, &init)?;
    let controller = AbortController::default();
    let signal = controller.signal();
    let fetch = Fetch::Request(request);
    let fetch_future = async { fetch.send_with_signal(&signal).await };
    let timeout_future = async {
        Delay::from(Duration::from_millis(WEBHOOK_TIMEOUT_MS)).await;
        controller.abort();
    };
    futures_util::pin_mut!(fetch_future);
    futures_util::pin_mut!(timeout_future);
    let response = match select(timeout_future, fetch_future).await {
        Either::Left((_timeout, _fetch)) => {
            return Err(worker::Error::RustError(format!(
                "webhook timed out after {WEBHOOK_TIMEOUT_MS}ms"
            )));
        }
        Either::Right((response, _timeout)) => response?,
    };
    if (200..300).contains(&response.status_code()) {
        Ok(())
    } else {
        Err(worker::Error::RustError(format!(
            "webhook returned HTTP {}",
            response.status_code()
        )))
    }
}


fn webhook_target_allowed(value: &str, allow_local: bool) -> bool {
    let Ok(url) = worker::Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https" && !(allow_local && url.scheme() == "http") {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if allow_local {
        return true;
    }
    if host.eq_ignore_ascii_case("localhost") || host.to_ascii_lowercase().ends_with(".localhost") {
        return false;
    }
    host.parse::<IpAddr>().map_or(true, |address| match address {
        IpAddr::V4(value) => {
            !(value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_unspecified()
                || value.is_broadcast())
        }
        IpAddr::V6(value) => {
            !(value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local()
                || value.to_ipv4_mapped().is_some_and(|mapped| {
                    mapped.is_private()
                        || mapped.is_loopback()
                        || mapped.is_link_local()
                        || mapped.is_unspecified()
                        || mapped.is_broadcast()
                }))
        }
    })
}

fn signature(secret: &str, payload: &str) -> Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|_| worker::Error::RustError("invalid webhook signing key".to_string()))?;
    mac.update(payload.as_bytes());
    let digest = mac.finalize().into_bytes();
    Ok(format!("sha256={}", crate::auth::hex_encode(digest)))
}

async fn owns_search(
    database: &worker::D1Database,
    principal_id: &str,
    search_id: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Count {
        count: i64,
    }
    Ok(worker::query!(
        database,
        "SELECT COUNT(*) AS count FROM saved_searches
         WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        search_id,
        principal_id
    )?
    .first::<Count>(None)
    .await?
    .is_some_and(|row| row.count == 1))
}

fn route_search_id(context: &RouteContext<()>) -> Result<String> {
    context
        .param("id")
        .cloned()
        .ok_or_else(|| worker::Error::RustError("missing saved search id".to_string()))
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

impl From<SubscriptionRow> for SubscriptionView {
    fn from(value: SubscriptionRow) -> Self {
        Self {
            id: value.id,
            saved_search_id: value.saved_search_id,
            target_url: value.target_url,
            active: value.active == 1,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DELIVERY_BATCH_SIZE, DELIVERY_LEASE_MS, DELIVERY_PAGE_DEFAULT, DELIVERY_PAGE_MAX,
        RETRY_BATCH_SIZE, SUBSCRIPTION_QUOTA, WEBHOOK_SECRET_MAX,
        WEBHOOK_SECRET_MIN, WEBHOOK_TIMEOUT_MS, WEBHOOK_URL_MAX, signature,
        webhook_target_allowed,
    };

    #[test]
    fn delivery_batches_are_bounded() {
        assert_eq!(DELIVERY_BATCH_SIZE, 20);
        assert_eq!(DELIVERY_LEASE_MS, 300_000);
        assert_eq!(WEBHOOK_TIMEOUT_MS, 10_000);
        assert_eq!(RETRY_BATCH_SIZE, 100);
        assert_eq!(DELIVERY_PAGE_DEFAULT, 50);
        assert_eq!(DELIVERY_PAGE_MAX, 100);
        assert_eq!(SUBSCRIPTION_QUOTA, 10);
        assert_eq!(WEBHOOK_URL_MAX, 2_048);
        assert_eq!(WEBHOOK_SECRET_MIN, 16);
        assert_eq!(WEBHOOK_SECRET_MAX, 512);
    }

    #[test]
    fn production_webhooks_reject_private_literal_targets() {
        assert!(!webhook_target_allowed("https://localhost/hook", false));
        assert!(!webhook_target_allowed("https://127.0.0.1/hook", false));
        assert!(!webhook_target_allowed("https://10.0.0.1/hook", false));
        assert!(!webhook_target_allowed("https://[::1]/hook", false));
        assert!(webhook_target_allowed("https://example.com/hook", false));
        assert!(webhook_target_allowed("http://127.0.0.1:8789/webhook", true));
    }

    #[test]
    fn webhook_signature_is_stable() {
        assert_eq!(
            signature("secret", "{}").ok().as_deref(),
            Some("sha256=77325902caca812dc259733aacd046b73817372c777b8d95b402647474516e13")
        );
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct DeliveryView {
    id: i64,
    transition_kind: String,
    canonical_job_id: String,
    job_sequence: i64,
    status: String,
    attempts: i64,
    next_attempt_at: i64,
    last_error: Option<String>,
    created_at: String,
    delivered_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct DeliveryList {
    data: Vec<DeliveryView>,
    meta: DeliveryPageMeta,
}

#[derive(Debug, Serialize)]
struct DeliveryPageMeta {
    limit: i64,
    next_cursor: Option<i64>,
}

pub async fn list_deliveries(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    let search_id = route_search_id(&context)?;
    if !owns_search(&database, &principal.id, &search_id).await? {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    let (cursor, limit) = match delivery_page_query(&request) {
        Ok(value) => value,
        Err(message) => return crate::auth::api_error(&request, "invalid_query", message, 400),
    };
    let data = if let Some(cursor) = cursor {
        worker::query!(
            &database,
            "SELECT o.id, o.transition_kind, o.canonical_job_id, o.job_sequence,
                    o.status, o.attempts, o.next_attempt_at, o.last_error,
                    o.created_at, o.delivered_at
             FROM notification_outbox o
             JOIN webhook_subscriptions ws ON ws.id = o.subscription_id
             WHERE ws.principal_id = ?1 AND o.saved_search_id = ?2 AND o.id < ?3
             ORDER BY o.id DESC LIMIT ?4",
            &principal.id,
            &search_id,
            cursor,
            limit
        )?
        .all()
        .await?
        .results::<DeliveryView>()?
    } else {
        worker::query!(
            &database,
            "SELECT o.id, o.transition_kind, o.canonical_job_id, o.job_sequence,
                    o.status, o.attempts, o.next_attempt_at, o.last_error,
                    o.created_at, o.delivered_at
             FROM notification_outbox o
             JOIN webhook_subscriptions ws ON ws.id = o.subscription_id
             WHERE ws.principal_id = ?1 AND o.saved_search_id = ?2
             ORDER BY o.id DESC LIMIT ?3",
            &principal.id,
            &search_id,
            limit
        )?
        .all()
        .await?
        .results::<DeliveryView>()?
    };
    let next_cursor = if data.len() == limit as usize {
        data.last().map(|delivery| delivery.id)
    } else {
        None
    };
    Response::from_json(&DeliveryList {
        data,
        meta: DeliveryPageMeta { limit, next_cursor },
    })
}

fn delivery_page_query(request: &Request) -> std::result::Result<(Option<i64>, i64), &'static str> {
    let url = request.url().map_err(|_| "invalid request URL")?;
    let mut cursor = None;
    let mut limit = DELIVERY_PAGE_DEFAULT;
    for (key, value) in url.query_pairs() {
        let value = value.trim();
        match key.as_ref() {
            "cursor" if !value.is_empty() => {
                cursor = Some(
                    value
                        .parse::<i64>()
                        .ok()
                        .filter(|number| *number > 0)
                        .ok_or("cursor must be a positive integer")?,
                );
            }
            "limit" if !value.is_empty() => {
                limit = value
                    .parse::<i64>()
                    .map_err(|_| "limit must be an integer")?
                    .clamp(1, DELIVERY_PAGE_MAX);
            }
            _ => {}
        }
    }
    Ok((cursor, limit))
}

pub async fn retry_dead(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let now = js_sys::Date::now() as i64;
    let result = worker::query!(
        &database,
        "UPDATE notification_outbox
         SET status = 'pending', next_attempt_at = ?1, last_error = NULL
         WHERE id IN (
           SELECT id FROM notification_outbox
           WHERE status = 'dead'
           ORDER BY id
           LIMIT ?2
         )",
        now,
        RETRY_BATCH_SIZE
    )?
    .run()
    .await?;
    let retried = result.meta()?.and_then(|meta| meta.changes).unwrap_or(0);
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "outbox.retry_dead",
        "notification_outbox",
        None,
        &serde_json::json!({"retried": retried}).to_string(),
    )
    .await?;
    Response::from_json(&serde_json::json!({"retried": retried}))
}
