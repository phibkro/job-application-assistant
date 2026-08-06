//! Gives a platform without an API one.
//!
//! Most job boards already publish schema.org `JobPosting` objects as JSON-LD
//! inside their listing pages, because search engines require it. Reading that
//! is both more robust and more respectful than scraping presentation markup:
//! it is a published contract, it survives redesigns, and it needs no HTML
//! parser in the Worker.
//!
//! A platform whose page carries no JSON-LD falls to the agent tier, which
//! drives a real browser and therefore costs a run — that is the premium
//! capability, and it is refused here for a free account.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use worker::{Fetch, Headers, Method, Request, RequestInit, Response, Result, RouteContext};

const MAX_PAGE_BYTES: usize = 2_000_000;
const MAX_LISTINGS: usize = 100;
const USER_AGENT: &str =
    "job-index/1.0 (+https://github.com/phibkro/job-index) schema.org JobPosting reader";

#[derive(Debug, Serialize, Deserialize)]
pub struct AdapterListing {
    pub external_id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub description: String,
    pub application_url: String,
    pub published_at: String,
    pub deadline: Option<String>,
}

#[derive(Debug, Serialize)]
struct AdapterResponse {
    data: Vec<AdapterListing>,
    meta: AdapterMeta,
}

#[derive(Debug, Serialize)]
struct AdapterMeta {
    source_id: String,
    platform: String,
    strategy: &'static str,
    acquisition_tier: String,
    count: usize,
    /// Set when a page yielded nothing, so a caller can tell "no vacancies"
    /// apart from "this platform needs the agent tier".
    note: String,
}

#[derive(Debug, Deserialize)]
struct CatalogRow {
    id: String,
    platform: String,
    listings_url: String,
    acquisition_tier: String,
    requires_premium: i64,
}

/// `GET /api/v1/sources/:id/listings`
///
/// The programmable read surface for a catalogued platform. Feed and scripted
/// tiers are served directly; the agent tier requires a premium account
/// because it costs a browser run.
pub async fn listings(request: Request, context: RouteContext<()>) -> Result<Response> {
    let Some(source_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "source id required", 400);
    };
    let database = context.env.d1("DB")?;
    let Some(source) = worker::query!(
        &database,
        "SELECT id, platform, listings_url, acquisition_tier, requires_premium
         FROM source_catalog WHERE id = ?1",
        source_id
    )?
    .first::<CatalogRow>(None)
    .await?
    else {
        return crate::auth::api_error(&request, "not_found", "no such catalogued source", 404);
    };

    let agent_tier = source.requires_premium == 1;
    if agent_tier {
        // Agent-tier reads are gated on the account, not on the client.
        let premium = crate::application::caller_is_premium(&request, &database).await?;
        if !premium {
            return crate::auth::api_error(
                &request,
                "premium_required",
                "this source is read by driving a browser, which is a premium capability",
                402,
            );
        }
    }

    if source.listings_url.trim().is_empty() {
        return crate::auth::api_error(
            &request,
            "no_listings_url",
            "this platform has no recorded listings URL",
            409,
        );
    }

    // A plain fetch returns the server response. Most Norwegian boards render
    // their listings in the browser, so that response carries no vacancies at
    // all — which is what the agent tier is for: the page is rendered first,
    // then read the same way.
    let mut strategy = "schema.org/JobPosting (JSON-LD)";
    let mut note = String::new();
    let mut body = if agent_tier {
        String::new()
    } else {
        fetch_page(&source.listings_url).await?
    };
    let mut listings = extract_job_postings(&body);

    if listings.is_empty() {
        match render_with_browser(&context, &source.listings_url).await {
            Ok(Some(rendered)) => {
                body = rendered;
                listings = extract_job_postings(&body);
                strategy = "schema.org/JobPosting after browser rendering";
                if listings.is_empty() {
                    note = "the rendered page still published no JobPosting data; this platform needs a per-source extraction recipe".to_string();
                }
            }
            Ok(None) => {
                note = if agent_tier {
                    "this source needs browser rendering, which is not configured in this environment".to_string()
                } else {
                    "the page published no schema.org JobPosting data".to_string()
                };
            }
            Err(error) => {
                note = format!("browser rendering failed: {error}");
            }
        }
    }

    Response::from_json(&AdapterResponse {
        meta: AdapterMeta {
            source_id: source.id,
            platform: source.platform,
            strategy,
            acquisition_tier: source.acquisition_tier,
            count: listings.len(),
            note,
        },
        data: listings,
    })
}

/// Renders a page with Cloudflare Browser Run and returns its HTML.
///
/// Returns `Ok(None)` when the environment has no Browser Run credentials, so
/// an unconfigured deployment degrades to the plain fetch rather than
/// pretending a platform published nothing.
async fn render_with_browser(context: &RouteContext<()>, url: &str) -> Result<Option<String>> {
    let (Ok(account), Ok(token)) = (
        context.env.secret("CLOUDFLARE_ACCOUNT_ID"),
        context.env.secret("BROWSER_RENDERING_TOKEN"),
    ) else {
        return Ok(None);
    };
    let account = account.to_string();
    let token = token.to_string();
    if account.is_empty() || token.is_empty() {
        return Ok(None);
    }

    let endpoint = format!(
        "https://api.cloudflare.com/client/v4/accounts/{account}/browser-rendering/content"
    );
    let headers = Headers::new();
    headers.set("authorization", &format!("Bearer {token}"))?;
    headers.set("content-type", "application/json")?;
    let payload = serde_json::json!({
        "url": url,
        // The listings are what matters; blocking assets keeps a render inside
        // the Worker's time budget.
        "rejectResourceTypes": ["image", "media", "font"],
        "gotoOptions": { "waitUntil": "networkidle0", "timeout": 20000 }
    })
    .to_string();
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(payload.into()));
    let request = Request::new_with_init(&endpoint, &init)?;
    let mut response = Fetch::Request(request).send().await?;
    if response.status_code() != 200 {
        return Err(worker::Error::RustError(format!(
            "browser rendering returned status {}",
            response.status_code()
        )));
    }

    #[derive(Deserialize)]
    struct RenderEnvelope {
        success: bool,
        #[serde(default)]
        result: String,
    }
    let envelope = response.json::<RenderEnvelope>().await?;
    if !envelope.success {
        return Err(worker::Error::RustError(
            "browser rendering reported failure".to_string(),
        ));
    }
    Ok(Some(envelope.result.chars().take(MAX_PAGE_BYTES).collect()))
}

async fn fetch_page(url: &str) -> Result<String> {
    let headers = Headers::new();
    headers.set("accept", "text/html,application/xhtml+xml")?;
    headers.set("user-agent", USER_AGENT)?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(url, &init)?;
    let mut response = Fetch::Request(request).send().await?;
    let text = response.text().await?;
    Ok(text.chars().take(MAX_PAGE_BYTES).collect())
}

/// Pulls every `application/ld+json` block out of a page and collects the
/// `JobPosting` objects inside it.
///
/// Publishers nest these inconsistently — bare objects, arrays, `@graph`
/// containers, single postings — so the walk is structural rather than
/// positional.
fn extract_job_postings(html: &str) -> Vec<AdapterListing> {
    let mut listings = Vec::new();
    for block in json_ld_blocks(html) {
        let Ok(value) = serde_json::from_str::<Value>(&block) else {
            continue;
        };
        collect_postings(&value, &mut listings);
        if listings.len() >= MAX_LISTINGS {
            break;
        }
    }
    listings.truncate(MAX_LISTINGS);
    listings
}

fn json_ld_blocks(html: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let lowered = html.to_ascii_lowercase();
    let mut cursor = 0;
    while let Some(found) = lowered[cursor..].find("application/ld+json") {
        let marker = cursor + found;
        let Some(open_end) = lowered[marker..].find('>').map(|index| marker + index + 1) else {
            break;
        };
        let Some(close) = lowered[open_end..]
            .find("</script")
            .map(|index| open_end + index)
        else {
            break;
        };
        blocks.push(html[open_end..close].trim().to_string());
        cursor = close;
    }
    blocks
}

fn collect_postings(value: &Value, out: &mut Vec<AdapterListing>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_postings(item, out);
            }
        }
        Value::Object(map) => {
            if let Some(graph) = map.get("@graph") {
                collect_postings(graph, out);
            }
            if type_is_job_posting(map.get("@type"))
                && let Some(listing) = to_listing(map)
            {
                out.push(listing);
            }
        }
        _ => {}
    }
}

fn type_is_job_posting(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(name)) => name.eq_ignore_ascii_case("JobPosting"),
        Some(Value::Array(items)) => items.iter().any(|item| {
            item.as_str()
                .is_some_and(|name| name.eq_ignore_ascii_case("JobPosting"))
        }),
        _ => false,
    }
}

fn text_at(map: &serde_json::Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn to_listing(map: &serde_json::Map<String, Value>) -> Option<AdapterListing> {
    let title = text_at(map, "title");
    if title.is_empty() {
        return None;
    }

    let employer_name = map
        .get("hiringOrganization")
        .and_then(|value| match value {
            Value::Object(org) => Some(text_at(org, "name")),
            Value::String(name) => Some(name.trim().to_string()),
            _ => None,
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown employer".to_string());

    // jobLocation nests address objects; take the most specific place name the
    // publisher gave rather than inventing a hierarchy.
    let location = map
        .get("jobLocation")
        .map(location_text)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Norway".to_string());

    let application_url = [
        text_at(map, "url"),
        text_at(map, "applicationContact"),
        map.get("@id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    ]
    .into_iter()
    .find(|value| value.starts_with("http"))
    .unwrap_or_default();
    if application_url.is_empty() {
        return None;
    }

    let deadline = {
        let value = text_at(map, "validThrough");
        (!value.is_empty()).then(|| value.chars().take(10).collect::<String>())
    };

    Some(AdapterListing {
        external_id: text_at(map, "identifier"),
        title,
        employer_name,
        location,
        description: crate::adapters::plain_text(&text_at(map, "description")),
        application_url,
        published_at: text_at(map, "datePosted"),
        deadline,
    })
}

fn location_text(value: &Value) -> String {
    match value {
        Value::Array(items) => items.first().map(location_text).unwrap_or_default(),
        Value::Object(map) => {
            if let Some(address) = map.get("address") {
                let nested = location_text(address);
                if !nested.is_empty() {
                    return nested;
                }
            }
            for key in ["addressLocality", "addressRegion", "name", "addressCountry"] {
                let value = text_at(map, key);
                if !value.is_empty() {
                    return value;
                }
            }
            String::new()
        }
        Value::String(name) => name.trim().to_string(),
        _ => String::new(),
    }
}

/// JSON-LD descriptions carry HTML, exactly as NAV's detail payloads do.
fn plain_text(input: &str) -> String {
    let mut text = String::with_capacity(input.len());
    let mut in_tag = false;
    for character in input.chars() {
        match character {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::extract_job_postings;

    const PAGE: &str = r##"<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"Example board"},
        {"@type":"JobPosting","title":"Kundeservicemedarbeider",
         "identifier":"abc-1",
         "datePosted":"2026-08-01","validThrough":"2026-09-01T23:59:59+02:00",
         "description":"<p>Hjelpe kunder &amp; svare p&aring; telefon.</p>",
         "hiringOrganization":{"@type":"Organization","name":"Eksempel AS"},
         "jobLocation":{"@type":"Place","address":{"addressLocality":"Oslo","addressCountry":"NO"}},
         "url":"https://example.invalid/jobs/abc-1"}
      ]}
      </script></head><body>irrelevant markup</body></html>"##;

    #[test]
    fn reads_job_postings_from_published_json_ld() {
        let listings = extract_job_postings(PAGE);
        assert_eq!(listings.len(), 1, "{listings:?}");
        let listing = &listings[0];
        assert_eq!(listing.title, "Kundeservicemedarbeider");
        assert_eq!(listing.employer_name, "Eksempel AS");
        assert_eq!(listing.location, "Oslo");
        assert_eq!(
            listing.application_url,
            "https://example.invalid/jobs/abc-1"
        );
        assert_eq!(listing.deadline.as_deref(), Some("2026-09-01"));
        // The advert body is HTML in the wild; the corpus stores text.
        assert!(!listing.description.contains('<'), "{listing:?}");
        assert!(listing.description.contains('&'), "entities should decode");
    }

    /// A page with no published data must yield nothing rather than guessing,
    /// so the caller can route that platform to the agent tier.
    #[test]
    fn a_page_without_job_posting_data_yields_nothing() {
        assert!(extract_job_postings("<html><body>no data here</body></html>").is_empty());
        assert!(
            extract_job_postings(
                r#"<script type="application/ld+json">{"@type":"WebSite"}</script>"#
            )
            .is_empty()
        );
    }
}
