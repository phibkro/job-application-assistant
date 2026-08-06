use serde::{Deserialize, Serialize};
use worker::{Request, Response, Result, RouteContext, wasm_bindgen::JsValue};

const DEFAULT_LIMIT: i32 = 25;
const MAX_LIMIT: i32 = 100;
const MAX_FILTER_LENGTH: usize = 200;

#[derive(Debug, Serialize, Deserialize)]
pub struct JobSummary {
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
    pub changed_at: String,
    pub source_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct JobSummaryRow {
    id: String,
    title: String,
    employer_name: String,
    location: String,
    description: String,
    application_url: String,
    published_at: String,
    deadline: Option<String>,
    status: String,
    sequence: i64,
    changed_at: String,
    source_ids: Option<String>,
}

#[derive(Debug, Serialize)]
struct PageMeta {
    limit: i32,
    next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
struct JobPage {
    data: Vec<JobSummary>,
    meta: PageMeta,
}

#[derive(Debug, Serialize)]
struct JobDetailResponse {
    data: JobSummary,
}

#[derive(Debug, Serialize)]
struct ChangePage {
    data: Vec<ChangeView>,
    meta: PageMeta,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChangeView {
    sequence: i64,
    change_type: String,
    changed_at: String,
    job: JobSummary,
}

#[derive(Debug, Deserialize)]
struct ChangeRow {
    change_sequence: i64,
    change_type: String,
    change_changed_at: String,
    id: String,
    title: String,
    employer_name: String,
    location: String,
    description: String,
    application_url: String,
    published_at: String,
    deadline: Option<String>,
    status: String,
    sequence: i64,
    changed_at: String,
    source_ids: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SourceView {
    id: String,
    name: String,
    total_occurrences: i64,
    active_occurrences: i64,
    cursor: Option<String>,
    mode: Option<String>,
    last_success_at: Option<String>,
    consecutive_failures: i64,
}

#[derive(Debug, Deserialize)]
struct SourceRow {
    id: String,
    name: String,
    total_occurrences: i64,
    active_occurrences: i64,
    cursor: Option<String>,
    mode: Option<String>,
    last_success_at: Option<String>,
    consecutive_failures: i64,
}

#[derive(Debug, Serialize)]
struct SourceList {
    data: Vec<SourceView>,
}

pub async fn jobs(request: Request, context: RouteContext<()>) -> Result<Response> {
    let url = request.url()?;
    let query = match Query::from_url(&url) {
        Ok(value) => value,
        Err(message) => return crate::auth::api_error(&request, "invalid_query", message, 400),
    };
    let limit = query.limit();
    let database = context.env.d1("DB")?;
    let (sql, bindings) = build_jobs_query(&query, limit);
    let js_bindings = into_js_bindings(bindings);
    let rows = database
        .prepare(sql)
        .bind(&js_bindings)?
        .all()
        .await?
        .results::<JobSummaryRow>()?;
    let data: Vec<JobSummary> = rows.into_iter().map(JobSummary::from).collect();
    let next_cursor = if data.len() == limit as usize {
        data.last().map(|job| job.sequence.to_string())
    } else {
        None
    };
    Response::from_json(&JobPage {
        data,
        meta: PageMeta { limit, next_cursor },
    })
}

fn build_jobs_query(query: &Query, limit: i32) -> (String, Vec<QueryBinding>) {
    let mut clauses = Vec::new();
    let mut bindings = Vec::new();
    if let Some(value) = query.status.as_deref() {
        clauses.push(format!("cj.status = {}", bind_text(&mut bindings, value)));
    }
    if let Some(value) = query.location.as_deref() {
        clauses.push(format!(
            "cj.location = {} COLLATE NOCASE",
            bind_text(&mut bindings, value)
        ));
    }
    if let Some(value) = query.employer.as_deref() {
        clauses.push(format!(
            "cj.employer_name = {} COLLATE NOCASE",
            bind_text(&mut bindings, value)
        ));
    }
    if let Some(value) = query.term.as_deref() {
        clauses.push(format!(
            "lower(cj.title || ' ' || cj.description) LIKE '%' || lower({}) || '%'",
            bind_text(&mut bindings, value)
        ));
    }
    if let Some(value) = query.source.as_deref() {
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM source_listings sx WHERE sx.canonical_job_id = cj.id AND sx.source_id = {})",
            bind_text(&mut bindings, value)
        ));
    }
    if let Some(value) = query.cursor {
        clauses.push(format!("cj.sequence < {}", bind_i64(&mut bindings, value)));
    }
    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    let limit_parameter = bind_i64(&mut bindings, i64::from(limit));
    let sql = format!(
        "SELECT
           cj.id, cj.title, cj.employer_name, cj.location, cj.description,
           cj.application_url, cj.published_at, cj.deadline, cj.status,
           cj.sequence, cj.changed_at,
           GROUP_CONCAT(DISTINCT sl.source_id) AS source_ids
         FROM canonical_jobs cj
         LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
         {where_sql}
         GROUP BY cj.id
         ORDER BY cj.sequence DESC, cj.id
         LIMIT {limit_parameter}"
    );
    (sql, bindings)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum QueryBinding {
    Text(String),
    Integer(i64),
}

fn bind_text(bindings: &mut Vec<QueryBinding>, value: &str) -> String {
    bindings.push(QueryBinding::Text(value.to_string()));
    format!("?{}", bindings.len())
}

fn bind_i64(bindings: &mut Vec<QueryBinding>, value: i64) -> String {
    bindings.push(QueryBinding::Integer(value));
    format!("?{}", bindings.len())
}

fn into_js_bindings(bindings: Vec<QueryBinding>) -> Vec<JsValue> {
    bindings
        .into_iter()
        .map(|binding| match binding {
            QueryBinding::Text(value) => JsValue::from_str(&value),
            QueryBinding::Integer(value) => JsValue::from_f64(value as f64),
        })
        .collect()
}

pub async fn job(request: Request, context: RouteContext<()>) -> Result<Response> {
    let id = context
        .param("id")
        .ok_or_else(|| worker::Error::RustError("missing job id".to_string()))?;
    let database = context.env.d1("DB")?;
    let row = worker::query!(
        &database,
        "SELECT
           cj.id, cj.title, cj.employer_name, cj.location, cj.description,
           cj.application_url, cj.published_at, cj.deadline, cj.status,
           cj.sequence, cj.changed_at,
           GROUP_CONCAT(DISTINCT sl.source_id) AS source_ids
         FROM canonical_jobs cj
         LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
         WHERE cj.id = ?1
         GROUP BY cj.id",
        id
    )?
    .first::<JobSummaryRow>(None)
    .await?;
    match row {
        Some(value) => Response::from_json(&JobDetailResponse { data: value.into() }),
        None => crate::auth::api_error(&request, "not_found", "job not found", 404),
    }
}

pub async fn changes(request: Request, context: RouteContext<()>) -> Result<Response> {
    let url = request.url()?;
    let query = match Query::from_url(&url) {
        Ok(value) => value,
        Err(message) => return crate::auth::api_error(&request, "invalid_query", message, 400),
    };
    let after = query.after_sequence.or(query.cursor).unwrap_or(0);
    let limit = query.limit();
    let database = context.env.d1("DB")?;
    let rows = worker::query!(
        &database,
        "SELECT
           jc.sequence AS change_sequence,
           jc.change_type,
           jc.changed_at AS change_changed_at,
           cj.id, cj.title, cj.employer_name, cj.location, cj.description,
           cj.application_url, cj.published_at, cj.deadline, cj.status,
           cj.sequence, cj.changed_at,
           GROUP_CONCAT(DISTINCT sl.source_id) AS source_ids
         FROM job_changes jc
         JOIN canonical_jobs cj ON cj.id = jc.canonical_job_id
         LEFT JOIN source_listings sl ON sl.canonical_job_id = cj.id
         WHERE jc.sequence > ?1
         GROUP BY jc.sequence, cj.id
         ORDER BY jc.sequence, cj.id
         LIMIT ?2",
        after,
        limit
    )?
    .all()
    .await?
    .results::<ChangeRow>()?;
    let data: Vec<ChangeView> = rows.into_iter().map(ChangeView::from).collect();
    let next_cursor = if data.len() == limit as usize {
        data.last().map(|change| change.sequence.to_string())
    } else {
        None
    };
    Response::from_json(&ChangePage {
        data,
        meta: PageMeta { limit, next_cursor },
    })
}

pub async fn sources(_request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let data = database
        .prepare(
            "SELECT
               s.id, s.name,
               COUNT(sl.id) AS total_occurrences,
               COALESCE(SUM(sl.active), 0) AS active_occurrences,
               ss.cursor, ss.mode, ss.last_success_at,
               COALESCE(ss.consecutive_failures, 0) AS consecutive_failures
             FROM sources s
             LEFT JOIN source_listings sl ON sl.source_id = s.id
             LEFT JOIN source_state ss ON ss.source_id = s.id
             GROUP BY s.id
             ORDER BY s.id
             LIMIT 200",
        )
        .all()
        .await?
        .results::<SourceRow>()?
        .into_iter()
        .map(SourceView::from)
        .collect();
    Response::from_json(&SourceList { data })
}

struct Query {
    status: Option<String>,
    location: Option<String>,
    employer: Option<String>,
    term: Option<String>,
    source: Option<String>,
    cursor: Option<i64>,
    after_sequence: Option<i64>,
    requested_limit: Option<i32>,
}

impl Query {
    fn from_url(url: &worker::Url) -> std::result::Result<Self, &'static str> {
        let mut value = Self {
            status: None,
            location: None,
            employer: None,
            term: None,
            source: None,
            cursor: None,
            after_sequence: None,
            requested_limit: None,
        };
        for (key, item) in url.query_pairs() {
            let item = item.trim();
            if item.is_empty() {
                continue;
            }
            match key.as_ref() {
                "status" => {
                    if !matches!(item, "active" | "closed") {
                        return Err("status must be active or closed");
                    }
                    value.status = Some(item.to_string());
                }
                "location" => value.location = Some(bounded_filter(item)?),
                "employer" => value.employer = Some(bounded_filter(item)?),
                "q" => value.term = Some(bounded_filter(item)?),
                "source" => value.source = Some(bounded_filter(item)?),
                "cursor" => value.cursor = Some(nonnegative_integer(item, "invalid cursor")?),
                "after_sequence" => {
                    value.after_sequence =
                        Some(nonnegative_integer(item, "invalid after_sequence")?);
                }
                "limit" => {
                    value.requested_limit = Some(
                        item.parse::<i32>()
                            .map_err(|_| "limit must be an integer")?,
                    );
                }
                _ => {}
            }
        }
        Ok(value)
    }

    fn limit(&self) -> i32 {
        self.requested_limit
            .unwrap_or(DEFAULT_LIMIT)
            .clamp(1, MAX_LIMIT)
    }
}

fn bounded_filter(value: &str) -> std::result::Result<String, &'static str> {
    if value.len() > MAX_FILTER_LENGTH {
        Err("filter values must be at most 200 characters")
    } else {
        Ok(value.to_string())
    }
}

fn nonnegative_integer(
    value: &str,
    message: &'static str,
) -> std::result::Result<i64, &'static str> {
    value
        .parse::<i64>()
        .ok()
        .filter(|number| *number >= 0)
        .ok_or(message)
}

fn source_ids(value: Option<String>) -> Vec<String> {
    let mut sources: Vec<String> = value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect();
    sources.sort();
    sources.dedup();
    sources
}

impl From<JobSummaryRow> for JobSummary {
    fn from(value: JobSummaryRow) -> Self {
        Self {
            id: value.id,
            title: value.title,
            employer_name: value.employer_name,
            location: value.location,
            description: value.description,
            application_url: value.application_url,
            published_at: value.published_at,
            deadline: value.deadline,
            status: value.status,
            sequence: value.sequence,
            changed_at: value.changed_at,
            source_ids: source_ids(value.source_ids),
        }
    }
}

impl From<ChangeRow> for ChangeView {
    fn from(value: ChangeRow) -> Self {
        Self {
            sequence: value.change_sequence,
            change_type: value.change_type,
            changed_at: value.change_changed_at,
            job: JobSummary {
                id: value.id,
                title: value.title,
                employer_name: value.employer_name,
                location: value.location,
                description: value.description,
                application_url: value.application_url,
                published_at: value.published_at,
                deadline: value.deadline,
                status: value.status,
                sequence: value.sequence,
                changed_at: value.changed_at,
                source_ids: source_ids(value.source_ids),
            },
        }
    }
}

impl From<SourceRow> for SourceView {
    fn from(value: SourceRow) -> Self {
        Self {
            id: value.id,
            name: value.name,
            total_occurrences: value.total_occurrences,
            active_occurrences: value.active_occurrences,
            cursor: value.cursor,
            mode: value.mode,
            last_success_at: value.last_success_at,
            consecutive_failures: value.consecutive_failures,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_LIMIT, Query, QueryBinding, build_jobs_query};

    #[test]
    fn jobs_query_only_emits_requested_filters() {
        let query = Query {
            status: Some("active".to_string()),
            location: Some("Oslo".to_string()),
            employer: None,
            term: None,
            source: None,
            cursor: Some(42),
            after_sequence: None,
            requested_limit: Some(25),
        };
        let (sql, bindings) = build_jobs_query(&query, DEFAULT_LIMIT);
        assert!(sql.contains("cj.status = ?1"));
        assert!(sql.contains("cj.location = ?2 COLLATE NOCASE"));
        assert!(sql.contains("cj.sequence < ?3"));
        assert!(sql.contains("LIMIT ?4"));
        assert!(!sql.contains("IS NULL OR"));
        assert_eq!(
            bindings,
            vec![
                QueryBinding::Text("active".to_string()),
                QueryBinding::Text("Oslo".to_string()),
                QueryBinding::Integer(42),
                QueryBinding::Integer(25),
            ]
        );
    }
}
