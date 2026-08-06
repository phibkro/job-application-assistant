//! Read access to the researched platform index.
//!
//! Ingestion and the application flow both need to know, per platform, how its
//! listings may be read and whether it permits automated submission. Those
//! facts are seeded from the research sheet (see
//! `scripts/import_source_index.py`) and served from here so no caller has to
//! infer them.

use serde::{Deserialize, Serialize};
use worker::{D1Database, Request, Response, Result, RouteContext, wasm_bindgen::JsValue};

const DEFAULT_LIMIT: i32 = 50;
const MAX_LIMIT: i32 = 200;

#[derive(Debug, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub id: String,
    pub platform: String,
    pub category: String,
    pub platform_type: String,
    pub oslo_relevance: String,
    pub language: String,
    pub listings_url: String,
    pub priority: String,
    pub confidence: String,
    pub status: String,
    pub acquisition_tier: String,
    pub automation_policy: String,
    pub requires_premium: i64,
    pub notes: String,
}

#[derive(Debug, Serialize)]
struct CatalogPage {
    data: Vec<CatalogEntry>,
    meta: CatalogMeta,
}

#[derive(Debug, Serialize)]
struct CatalogMeta {
    limit: i32,
    total: i64,
    /// Counts per acquisition tier, so a client can show coverage without
    /// paging the whole catalogue.
    tiers: Vec<TierCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TierCount {
    pub acquisition_tier: String,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
struct CountRow {
    total: i64,
}

/// `GET /api/v1/sources/catalog`
///
/// Optional `category`, `tier`, and `limit` narrow the result. Unfiltered it
/// returns the highest-priority platforms first, which is the order a
/// connector backlog should be worked in.
pub async fn list(request: Request, context: RouteContext<()>) -> Result<Response> {
    let url = request.url()?;
    let mut category: Option<String> = None;
    let mut tier: Option<String> = None;
    let mut limit = DEFAULT_LIMIT;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "category" => category = Some(value.to_string()),
            "tier" => {
                let value = value.to_string();
                if !matches!(value.as_str(), "feed" | "scripted" | "agent" | "unknown") {
                    return crate::auth::api_error(
                        &request,
                        "invalid_query",
                        "tier must be feed, scripted, agent, or unknown",
                        400,
                    );
                }
                tier = Some(value);
            }
            "limit" => {
                let Ok(parsed) = value.parse::<i32>() else {
                    return crate::auth::api_error(
                        &request,
                        "invalid_query",
                        "limit must be an integer",
                        400,
                    );
                };
                if !(1..=MAX_LIMIT).contains(&parsed) {
                    return crate::auth::api_error(
                        &request,
                        "invalid_query",
                        "limit must be between 1 and 200",
                        400,
                    );
                }
                limit = parsed;
            }
            _ => {}
        }
    }

    let database = context.env.d1("DB")?;
    let data = query_entries(&database, category.as_deref(), tier.as_deref(), limit).await?;
    let total = total_entries(&database).await?;
    let tiers = tier_counts(&database).await?;

    Response::from_json(&CatalogPage {
        data,
        meta: CatalogMeta {
            limit,
            total,
            tiers,
        },
    })
}

async fn query_entries(
    database: &D1Database,
    category: Option<&str>,
    tier: Option<&str>,
    limit: i32,
) -> Result<Vec<CatalogEntry>> {
    // Priority sorts as recorded text ("1 Core" before "2 ..."), which is the
    // order the research sheet ranks them in.
    let sql = "SELECT id, platform, category, platform_type, oslo_relevance, language,
                      listings_url, priority, confidence, status, acquisition_tier,
                      automation_policy, requires_premium, notes
               FROM source_catalog
               WHERE (?1 IS NULL OR category = ?1 COLLATE NOCASE)
                 AND (?2 IS NULL OR acquisition_tier = ?2)
               ORDER BY priority, platform
               LIMIT ?3";
    // An absent filter must bind SQL NULL. `Option::into` produces JavaScript
    // `undefined`, which D1 rejects outright rather than treating as null.
    let optional = |value: Option<&str>| value.map_or(JsValue::NULL, JsValue::from);
    database
        .prepare(sql)
        .bind(&[optional(category), optional(tier), limit.into()])?
        .all()
        .await?
        .results::<CatalogEntry>()
}

async fn total_entries(database: &D1Database) -> Result<i64> {
    let row = worker::query!(database, "SELECT COUNT(*) AS total FROM source_catalog")
        .first::<CountRow>(None)
        .await?;
    Ok(row.map_or(0, |value| value.total))
}

async fn tier_counts(database: &D1Database) -> Result<Vec<TierCount>> {
    worker::query!(
        database,
        "SELECT acquisition_tier, COUNT(*) AS count
         FROM source_catalog
         GROUP BY acquisition_tier
         ORDER BY count DESC"
    )
    .all()
    .await?
    .results::<TierCount>()
}
