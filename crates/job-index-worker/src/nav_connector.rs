use job_index_core::nav::{self, FeedPage, ParseError};
use job_index_core::RawListing;
use worker::{Env, Error, Fetch, Headers, Method, Request, RequestInit, Response, Result};

const DEFAULT_NAV_BASE_URL: &str = "https://pam-stilling-feed.nav.no";
pub const NAV_INITIAL_CURSOR: &str = "/api/v1/feed?last=true";

#[derive(Debug)]
pub enum PageResponse {
    NotModified {
        etag: Option<String>,
        last_modified: Option<String>,
    },
    Page {
        page: FeedPage,
        etag: Option<String>,
        last_modified: Option<String>,
    },
}

#[derive(Debug)]
pub enum NavObservation {
    Active(RawListing),
    Inactive { external_id: String },
}

#[derive(Debug)]
pub struct ObservationBatch {
    pub observations: Vec<NavObservation>,
    pub detail_fetches: usize,
    pub detail_fallbacks: usize,
}

pub async fn resolve_token(environment: &Env) -> Result<String> {
    if let Ok(secret) = environment.secret("NAV_API_TOKEN") {
        let token = secret.to_string();
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }

    let use_public = environment
        .var("NAV_USE_PUBLIC_TOKEN")
        .map(|value| value.to_string() == "true")
        .unwrap_or(false);
    if !use_public {
        return Err(Error::RustError(
            "nav_configuration: NAV_API_TOKEN is not configured and NAV_USE_PUBLIC_TOKEN is disabled"
                .to_string(),
        ));
    }

    let token_url_string = format!("{}/api/publicToken", nav_base_url(environment));
    let token_url = worker::Url::parse(&token_url_string)
        .map_err(|error| Error::RustError(format!("nav_configuration: {error}")))?;
    let mut response = Fetch::Url(token_url)
        .send()
        .await
        .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;
    if response.status_code() != 200 {
        let retry_after = response.headers().get("retry-after")?;
        return Err(http_error(
            "public token endpoint",
            response.status_code(),
            &token_url_string,
            retry_after.as_deref(),
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;
    body.lines()
        .rev()
        .map(str::trim)
        .find(|line| line.matches('.').count() == 2 && !line.contains(' '))
        .map(str::to_string)
        .ok_or_else(|| {
            Error::RustError(
                "nav_authentication: NAV public token response did not contain a JWT".to_string(),
            )
        })
}

pub async fn fetch_page(
    environment: &Env,
    cursor: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
    initial_if_modified_since: Option<&str>,
    token: &str,
) -> Result<PageResponse> {
    let url = absolute_url(environment, cursor);
    let headers = Headers::new();
    headers.set("Accept", "application/json")?;
    headers.set("Authorization", &format!("Bearer {token}"))?;
    if let Some(value) = etag {
        headers.set("If-None-Match", value)?;
    }
    if let Some(value) = last_modified.or(initial_if_modified_since) {
        headers.set("If-Modified-Since", value)?;
    }

    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(&url, &init)
        .map_err(|error| Error::RustError(format!("nav_configuration: {error}")))?;
    let mut response = Fetch::Request(request)
        .send()
        .await
        .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;
    let response_etag = response.headers().get("etag")?;
    let response_last_modified = response.headers().get("last-modified")?;
    let response_retry_after = response.headers().get("retry-after")?;

    match response.status_code() {
        304 => Ok(PageResponse::NotModified {
            etag: response_etag.or_else(|| etag.map(str::to_string)),
            last_modified: response_last_modified
                .or_else(|| last_modified.map(str::to_string)),
        }),
        200 => {
            let body = response
                .text()
                .await
                .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;
            let page = nav::parse_feed_page(&body).map_err(|error| {
                Error::RustError(format!("nav_malformed_page: feed page parse failed: {error}"))
            })?;
            Ok(PageResponse::Page {
                page,
                etag: response_etag,
                last_modified: response_last_modified,
            })
        }
        status => Err(http_error(
            "feed",
            status,
            &url,
            response_retry_after.as_deref(),
        )),
    }
}

pub async fn build_observations(
    environment: &Env,
    page: &FeedPage,
    token: &str,
    detail_fetch_limit: usize,
) -> Result<ObservationBatch> {
    let mut observations = Vec::with_capacity(page.items.len());
    let mut detail_fallbacks = 0;
    let mut detail_fetches = 0;

    for item in &page.items {
        if !item.active {
            observations.push(NavObservation::Inactive {
                external_id: item.external_id.clone(),
            });
            continue;
        }

        let summary = nav::active_summary_listing(item).map_err(|error| {
            Error::RustError(format!(
                "nav_invalid_item: active summary parse failed for {}: {error}",
                item.external_id
            ))
        })?;

        if detail_fetches >= detail_fetch_limit || item.detail_url.trim().is_empty() {
            observations.push(NavObservation::Active(summary));
            continue;
        }
        detail_fetches += 1;

        match fetch_detail(environment, item, token).await {
            Ok(DetailResponse::Active(listing)) => observations.push(NavObservation::Active(listing)),
            Ok(DetailResponse::Inactive) => observations.push(NavObservation::Inactive {
                external_id: item.external_id.clone(),
            }),
            Err(error) if fatal_detail_error(&error.to_string()) => return Err(error),
            Err(error) => {
                worker::console_warn!(
                    "NAV detail fallback for vacancy {}: {}",
                    item.external_id,
                    error
                );
                detail_fallbacks += 1;
                observations.push(NavObservation::Active(summary));
            }
        }
    }

    Ok(ObservationBatch {
        observations,
        detail_fetches,
        detail_fallbacks,
    })
}

enum DetailResponse {
    Active(RawListing),
    Inactive,
}

async fn fetch_detail(
    environment: &Env,
    item: &nav::FeedItem,
    token: &str,
) -> Result<DetailResponse> {
    let url = absolute_url(environment, &item.detail_url);
    let headers = Headers::new();
    headers.set("Accept", "application/json")?;
    headers.set("Authorization", &format!("Bearer {token}"))?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(&url, &init)
        .map_err(|error| Error::RustError(format!("nav_configuration: {error}")))?;
    let mut response = Fetch::Request(request)
        .send()
        .await
        .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;
    if response.status_code() != 200 {
        let retry_after = response.headers().get("retry-after")?;
        return Err(http_error(
            "detail",
            response.status_code(),
            &url,
            retry_after.as_deref(),
        ));
    }
    let body = response
        .text()
        .await
        .map_err(|error| Error::RustError(format!("nav_network: {error}")))?;

    match nav::parse_active_detail(&body, item) {
        Ok(listing) => Ok(DetailResponse::Active(listing)),
        Err(ParseError::InactiveDetail) => Ok(DetailResponse::Inactive),
        Err(error) => Err(Error::RustError(format!(
            "nav_invalid_item: detail parse failed: {error}"
        ))),
    }
}

pub fn next_checkpoint(
    requested_cursor: &str,
    page: &FeedPage,
    etag: Option<String>,
    last_modified: Option<String>,
) -> (String, Option<String>, Option<String>, bool) {
    if let Some(next_url) = &page.next_url {
        (next_url.clone(), None, None, false)
    } else {
        let cursor = if page.feed_url.trim().is_empty() {
            requested_cursor.to_string()
        } else {
            page.feed_url.clone()
        };
        (cursor, etag, last_modified, true)
    }
}

fn absolute_url(environment: &Env, path: &str) -> String {
    if path.starts_with("https://") || path.starts_with("http://") {
        path.to_string()
    } else {
        let base = nav_base_url(environment);
        if path.starts_with('/') {
            format!("{base}{path}")
        } else {
            format!("{base}/{path}")
        }
    }
}

fn nav_base_url(environment: &Env) -> String {
    environment
        .var("NAV_BASE_URL")
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim_end_matches('/').to_string())
        .unwrap_or_else(|| DEFAULT_NAV_BASE_URL.to_string())
}

fn fatal_detail_error(message: &str) -> bool {
    message.starts_with("nav_authentication:")
        || message.starts_with("nav_rate_limited:")
        || message.starts_with("nav_upstream:")
        || message.starts_with("nav_network:")
}

fn http_error(operation: &str, status: u16, url: &str, retry_after: Option<&str>) -> Error {
    let class = match status {
        401 | 403 => "nav_authentication",
        429 => "nav_rate_limited",
        500..=599 => "nav_upstream",
        404 => "nav_not_found",
        _ => "nav_http",
    };
    let retry_hint = if status == 429 {
        retry_after_hint(retry_after)
    } else {
        String::new()
    };
    Error::RustError(format!(
        "{class}: NAV {operation} returned HTTP {status} for {url}{retry_hint}"
    ))
}

fn retry_after_hint(value: Option<&str>) -> String {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return String::new();
    };
    if let Ok(seconds) = value.parse::<i64>() {
        return format!("; retry_after_seconds={}", seconds.max(0));
    }
    let parsed = js_sys::Date::parse(value);
    if parsed.is_finite() {
        return format!("; retry_after_at={}", parsed as i64);
    }
    String::new()
}
