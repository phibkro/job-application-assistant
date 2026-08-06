use job_index_core::{
    NormalizedSearchDefinition, SavedSearchDefinition, SearchableJob,
};
use serde::{Deserialize, Serialize};
use worker::{D1Database, Error, Request, Response, Result, RouteContext};

const EVALUATION_BATCH_SIZE: usize = 100;
const SCHEDULED_SEARCH_BATCH_SIZE: i64 = 4;
const MATCH_PAGE_DEFAULT: i64 = 50;
const MATCH_PAGE_MAX: i64 = 100;
const SEARCH_NAME_MAX: usize = 120;
const SEARCH_TERM_MAX: usize = 100;
const SEARCH_TERMS_PER_FIELD_MAX: usize = 20;

#[derive(Debug, Deserialize)]
pub struct CreateSavedSearchRequest {
    pub name: String,
    pub definition: SavedSearchDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSearchView {
    pub id: String,
    pub owner_id: Option<String>,
    pub name: String,
    pub query_signature: String,
    pub definition: NormalizedSearchDefinition,
    pub last_evaluated_sequence: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct SavedSearchRow {
    id: String,
    owner_id: Option<String>,
    name: String,
    query_signature: String,
    definition_json: String,
    last_evaluated_sequence: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ChangedJobRow {
    id: String,
    title: String,
    employer_name: String,
    location: String,
    description: String,
    status: String,
    sequence: i64,
    previously_matches: i64,
}

#[derive(Debug, Deserialize)]
struct SequenceRow {
    sequence: i64,
}

#[derive(Debug, Deserialize)]
struct SearchIdRow {
    id: String,
}

#[derive(Debug, Serialize)]
pub struct ScheduledEvaluationReport {
    pub selected: usize,
    pub completed: usize,
    pub failed: usize,
    pub transitions: usize,
    pub searches_with_more: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatchView {
    pub job_id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub status: String,
    pub sequence: i64,
}

#[derive(Debug, Deserialize)]
struct SearchMatchJoinRow {
    job_id: String,
    title: String,
    employer_name: String,
    location: String,
    status: String,
    sequence: i64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchTransitionKind {
    Added,
    Updated,
    Closed,
    Removed,
}

impl MatchTransitionKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Added => "added",
            Self::Updated => "updated",
            Self::Closed => "closed",
            Self::Removed => "removed",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MatchTransitionView {
    pub kind: MatchTransitionKind,
    pub job: SearchMatchView,
}

#[derive(Debug, Serialize)]
pub struct EvaluationReport {
    pub search_id: String,
    pub evaluated_from_sequence: i64,
    pub evaluated_through_sequence: i64,
    pub corpus_sequence: i64,
    pub jobs_evaluated: usize,
    pub has_more: bool,
    pub added: usize,
    pub updated: usize,
    pub closed: usize,
    pub removed: usize,
    pub transitions: Vec<MatchTransitionView>,
}

#[derive(Debug, Serialize)]
struct SearchListResponse {
    data: Vec<SavedSearchView>,
}

#[derive(Debug, Serialize)]
struct MatchListResponse {
    data: Vec<SearchMatchView>,
}

#[derive(Debug, Serialize)]
struct OwnedMatchListResponse {
    data: Vec<SearchMatchView>,
    meta: MatchPageMeta,
}

#[derive(Debug, Serialize)]
struct MatchPageMeta {
    limit: i64,
    next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

pub async fn create(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    if !legacy_routes_allowed(&context) {
        return json_error("legacy saved-search routes are disabled", 403);
    }
    let payload = request.json::<CreateSavedSearchRequest>().await?;
    let name = payload.name.trim();
    if name.is_empty() {
        return json_error("saved search name cannot be empty", 400);
    }

    let definition = payload.definition.normalize();
    let query_signature = definition.signature();
    let id = query_signature.clone();
    let definition_json = serde_json::to_string(&definition)?;
    let now = now_marker();
    let database = context.env.d1("DB")?;

    worker::query!(
        &database,
        "INSERT INTO saved_searches
         (id, name, query_signature, definition_json, last_evaluated_sequence,
          created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at",
        &id,
        name,
        &query_signature,
        &definition_json,
        &now
    )?
    .run()
    .await?;

    let saved = load_saved_search(&database, &id)
        .await?
        .ok_or_else(|| Error::RustError("D1 did not return the saved search".to_string()))?;
    Ok(Response::from_json(&saved)?.with_status(201))
}

pub async fn list(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !legacy_routes_allowed(&context) {
        return json_error("legacy saved-search routes are disabled", 403);
    }
    let database = context.env.d1("DB")?;
    let rows = database
        .prepare(
            "SELECT id, owner_id, name, query_signature, definition_json,
                    last_evaluated_sequence, created_at, updated_at
             FROM saved_searches
             ORDER BY created_at, id",
        )
        .all()
        .await?
        .results::<SavedSearchRow>()?;
    let data = rows
        .into_iter()
        .map(row_to_view)
        .collect::<Result<Vec<_>>>()?;
    Response::from_json(&SearchListResponse { data })
}

pub async fn get(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !legacy_routes_allowed(&context) {
        return json_error("legacy saved-search routes are disabled", 403);
    }
    let id = route_id(&context)?;
    let database = context.env.d1("DB")?;
    match load_saved_search(&database, &id).await? {
        Some(saved) => Response::from_json(&saved),
        None => json_error("saved search not found", 404),
    }
}

pub async fn evaluate(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !legacy_routes_allowed(&context) {
        return json_error("legacy saved-search routes are disabled", 403);
    }
    let id = route_id(&context)?;
    let database = context.env.d1("DB")?;
    match evaluate_saved_search(&database, &id, &now_marker()).await {
        Ok(report) => Response::from_json(&report),
        Err(Error::RustError(message)) if message == "saved search not found" => {
            json_error(&message, 404)
        }
        Err(error) => Err(error),
    }
}

pub async fn matches(_request: Request, context: RouteContext<()>) -> Result<Response> {
    if !legacy_routes_allowed(&context) {
        return json_error("legacy saved-search routes are disabled", 403);
    }
    let id = route_id(&context)?;
    let database = context.env.d1("DB")?;
    if load_saved_search(&database, &id).await?.is_none() {
        return json_error("saved search not found", 404);
    }

    let data: Vec<SearchMatchView> = worker::query!(
        &database,
        "SELECT
           cj.id AS job_id,
           cj.title,
           cj.employer_name,
           cj.location,
           cj.status,
           cj.sequence
         FROM search_matches sm
         JOIN canonical_jobs cj ON cj.id = sm.canonical_job_id
         WHERE sm.saved_search_id = ?1 AND sm.currently_matches = 1
           AND cj.status = 'active'
         ORDER BY cj.sequence DESC, cj.id",
        &id
    )?
    .all()
    .await?
    .results::<SearchMatchJoinRow>()?
    .into_iter()
    .map(SearchMatchView::from)
    .collect();

    Response::from_json(&MatchListResponse { data })
}

pub async fn evaluate_saved_search(
    database: &D1Database,
    search_id: &str,
    observed_at: &str,
) -> Result<EvaluationReport> {
    let saved = load_saved_search(database, search_id)
        .await?
        .ok_or_else(|| Error::RustError("saved search not found".to_string()))?;
    let cursor_before = saved.last_evaluated_sequence;
    let corpus_sequence = corpus_sequence(database).await?;

    let changed_query = format!(
        "SELECT cj.id, cj.title, cj.employer_name, cj.location, cj.description,\n                cj.status, cj.sequence,\n                COALESCE(sm.currently_matches, 0) AS previously_matches\n         FROM canonical_jobs cj\n         LEFT JOIN search_matches sm\n           ON sm.canonical_job_id = cj.id AND sm.saved_search_id = ?2\n         WHERE cj.sequence > ?1\n         ORDER BY cj.sequence, cj.id\n         LIMIT {EVALUATION_BATCH_SIZE}"
    );
    let changed_jobs = worker::query!(database, changed_query, cursor_before, search_id)?
        .all()
        .await?
        .results::<ChangedJobRow>()?;

    let evaluated_through_sequence = changed_jobs
        .last()
        .map_or(corpus_sequence, |job| job.sequence);
    let mut statements = Vec::new();
    let mut transitions = Vec::new();
    let mut added = 0;
    let mut updated = 0;
    let mut closed = 0;
    let mut removed = 0;

    for job in &changed_jobs {
        let previously_matched = job.previously_matches == 1;
        let matches_now = saved.definition.matches(SearchableJob {
            title: &job.title,
            employer_name: &job.employer_name,
            location: &job.location,
            description: &job.description,
            status: &job.status,
        });

        let transition = if matches_now {
            statements.push(worker::query!(
                database,
                "INSERT INTO search_matches
                 (saved_search_id, canonical_job_id, currently_matches,
                  matched_job_sequence, first_matched_at, last_evaluated_at)
                 VALUES (?1, ?2, 1, ?3, ?4, ?4)
                 ON CONFLICT(saved_search_id, canonical_job_id) DO UPDATE SET
                   currently_matches = 1,
                   matched_job_sequence = excluded.matched_job_sequence,
                   last_evaluated_at = excluded.last_evaluated_at",
                search_id,
                &job.id,
                job.sequence,
                observed_at
            )?);
            if previously_matched {
                updated += 1;
                Some(MatchTransitionKind::Updated)
            } else {
                added += 1;
                Some(MatchTransitionKind::Added)
            }
        } else if previously_matched {
            statements.push(worker::query!(
                database,
                "UPDATE search_matches
                 SET currently_matches = 0,
                     matched_job_sequence = ?1,
                     last_evaluated_at = ?2
                 WHERE saved_search_id = ?3 AND canonical_job_id = ?4",
                job.sequence,
                observed_at,
                search_id,
                &job.id
            )?);
            if job.status == "closed" {
                closed += 1;
                Some(MatchTransitionKind::Closed)
            } else {
                removed += 1;
                Some(MatchTransitionKind::Removed)
            }
        } else {
            None
        };

        if let Some(kind) = transition {
            let job_view = SearchMatchView::from(job);
            let payload_json = serde_json::to_string(&serde_json::json!({
                "event": "saved_search.match_transition",
                "search_id": search_id,
                "kind": kind.as_str(),
                "job": &job_view,
            }))?;
            statements.push(worker::query!(
                database,
                "INSERT OR IGNORE INTO notification_outbox
                 (dedupe_key, subscription_id, saved_search_id, canonical_job_id,
                  transition_kind, job_sequence, payload_json, status,
                  attempts, next_attempt_at, created_at)
                 SELECT
                   ws.id || ':' || ?1 || ':' || ?2 || ':' || ?3,
                   ws.id, ?4, ?1, ?3, ?2, ?5, 'pending', 0, 0, ?6
                 FROM webhook_subscriptions ws
                 WHERE ws.saved_search_id = ?4 AND ws.active = 1",
                &job.id,
                job.sequence,
                kind.as_str(),
                search_id,
                &payload_json,
                observed_at
            )?);
            transitions.push(MatchTransitionView {
                kind,
                job: job_view,
            });
        }
    }

    statements.push(worker::query!(
        database,
        "UPDATE saved_searches
         SET last_evaluated_sequence = ?1, updated_at = ?2
         WHERE id = ?3",
        evaluated_through_sequence,
        observed_at,
        search_id
    )?);
    database.batch(statements).await?;

    Ok(EvaluationReport {
        search_id: search_id.to_string(),
        evaluated_from_sequence: cursor_before,
        evaluated_through_sequence,
        corpus_sequence,
        jobs_evaluated: changed_jobs.len(),
        has_more: evaluated_through_sequence < corpus_sequence,
        added,
        updated,
        closed,
        removed,
        transitions,
    })
}

async fn load_saved_search(
    database: &D1Database,
    search_id: &str,
) -> Result<Option<SavedSearchView>> {
    worker::query!(
        database,
        "SELECT id, owner_id, name, query_signature, definition_json,
                last_evaluated_sequence, created_at, updated_at
         FROM saved_searches WHERE id = ?1",
        search_id
    )?
    .first::<SavedSearchRow>(None)
    .await?
    .map(row_to_view)
    .transpose()
}

async fn corpus_sequence(database: &D1Database) -> Result<i64> {
    database
        .prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM job_changes")
        .first::<SequenceRow>(None)
        .await?
        .map(|row| row.sequence)
        .ok_or_else(|| Error::RustError("D1 did not return the corpus sequence".to_string()))
}

fn row_to_view(row: SavedSearchRow) -> Result<SavedSearchView> {
    let definition = serde_json::from_str(&row.definition_json)
        .map_err(|error| Error::RustError(format!("invalid saved search definition: {error}")))?;
    Ok(SavedSearchView {
        id: row.id,
        owner_id: row.owner_id,
        name: row.name,
        query_signature: row.query_signature,
        definition,
        last_evaluated_sequence: row.last_evaluated_sequence,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn route_id(context: &RouteContext<()>) -> Result<String> {
    context
        .param("id")
        .cloned()
        .ok_or_else(|| Error::RustError("missing saved search id".to_string()))
}

fn legacy_routes_allowed(context: &RouteContext<()>) -> bool {
    context
        .env
        .var("ALLOW_DEMO_MUTATIONS")
        .map(|value| value.to_string() == "true")
        .unwrap_or(false)
}

fn definition_error(definition: &NormalizedSearchDefinition) -> Option<&'static str> {
    for terms in [
        &definition.locations,
        &definition.include_terms,
        &definition.exclude_terms,
    ] {
        if terms.len() > SEARCH_TERMS_PER_FIELD_MAX {
            return Some("each search field may contain at most 20 terms");
        }
        if terms.iter().any(|term| term.len() > SEARCH_TERM_MAX) {
            return Some("search terms must be at most 100 characters");
        }
    }
    None
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

impl From<&ChangedJobRow> for SearchMatchView {
    fn from(row: &ChangedJobRow) -> Self {
        Self {
            job_id: row.id.clone(),
            title: row.title.clone(),
            employer_name: row.employer_name.clone(),
            location: row.location.clone(),
            status: row.status.clone(),
            sequence: row.sequence,
        }
    }
}

impl From<SearchMatchJoinRow> for SearchMatchView {
    fn from(row: SearchMatchJoinRow) -> Self {
        Self {
            job_id: row.job_id,
            title: row.title,
            employer_name: row.employer_name,
            location: row.location,
            status: row.status,
            sequence: row.sequence,
        }
    }
}

pub async fn evaluate_due_endpoint(
    request: Request,
    context: RouteContext<()>,
) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return crate::auth::api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let report = evaluate_due_searches(&database).await?;
    crate::auth::audit(
        &database,
        &request,
        "admin",
        None,
        "saved_search.evaluate_due",
        "saved_search",
        None,
        &serde_json::to_string(&report)?,
    )
    .await?;
    Response::from_json(&report)
}

pub async fn evaluate_due_searches(database: &D1Database) -> Result<ScheduledEvaluationReport> {
    let corpus_sequence = corpus_sequence(database).await?;
    let rows = worker::query!(
        database,
        "SELECT ss.id
         FROM saved_searches ss
         JOIN principals p ON p.id = ss.owner_id AND p.status = 'active'
         WHERE ss.deleted_at IS NULL AND ss.last_evaluated_sequence < ?1
         ORDER BY CAST(ss.updated_at AS INTEGER), ss.id
         LIMIT ?2",
        corpus_sequence,
        SCHEDULED_SEARCH_BATCH_SIZE
    )?
    .all()
    .await?
    .results::<SearchIdRow>()?;
    let mut report = ScheduledEvaluationReport {
        selected: rows.len(),
        completed: 0,
        failed: 0,
        transitions: 0,
        searches_with_more: 0,
    };
    for row in rows {
        match evaluate_saved_search(database, &row.id, &now_marker()).await {
            Ok(evaluation) => {
                report.completed += 1;
                report.transitions = report
                    .transitions
                    .saturating_add(evaluation.transitions.len());
                if evaluation.has_more {
                    report.searches_with_more += 1;
                }
            }
            Err(error) => {
                report.failed += 1;
                worker::console_error!(
                    "scheduled saved-search evaluation failed for {}: {}",
                    row.id,
                    error
                );
            }
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::{
        EVALUATION_BATCH_SIZE, MATCH_PAGE_DEFAULT, MATCH_PAGE_MAX,
        SCHEDULED_SEARCH_BATCH_SIZE, SEARCH_NAME_MAX, SEARCH_TERMS_PER_FIELD_MAX,
        SEARCH_TERM_MAX,
    };

    #[test]
    fn evaluation_batches_are_bounded() {
        assert_eq!(EVALUATION_BATCH_SIZE, 100);
        assert_eq!(SCHEDULED_SEARCH_BATCH_SIZE, 4);
        assert_eq!(MATCH_PAGE_DEFAULT, 50);
        assert_eq!(MATCH_PAGE_MAX, 100);
        assert_eq!(SEARCH_NAME_MAX, 120);
        assert_eq!(SEARCH_TERM_MAX, 100);
        assert_eq!(SEARCH_TERMS_PER_FIELD_MAX, 20);
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateSavedSearchRequest {
    pub name: Option<String>,
    pub definition: Option<SavedSearchDefinition>,
}

#[derive(Debug, Serialize)]
struct OwnedSearchListResponse {
    data: Vec<SavedSearchView>,
}

pub async fn create_owned(mut request: Request, context: RouteContext<()>) -> Result<Response> {
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
    let payload = match request.json::<CreateSavedSearchRequest>().await {
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
    let name = payload.name.trim();
    if name.is_empty() || name.len() > SEARCH_NAME_MAX {
        return crate::auth::api_error(
            &request,
            "invalid_search",
            "name must be 1..120 characters",
            400,
        );
    }
    let definition = payload.definition.normalize();
    if let Some(message) = definition_error(&definition) {
        return crate::auth::api_error(&request, "invalid_search", message, 400);
    }
    let signature = definition.signature();
    let id = format!(
        "search_{}",
        job_index_core::stable_hash_hex(&format!("{}|{}", principal.id, signature))
    );
    let count = worker::query!(
        &database,
        "SELECT COUNT(*) AS sequence FROM saved_searches
         WHERE owner_id = ?1 AND deleted_at IS NULL AND id != ?2",
        &principal.id,
        &id
    )?
    .first::<SequenceRow>(None)
    .await?
    .map_or(0, |row| row.sequence);
    if count >= principal.search_quota {
        return crate::auth::api_error(
            &request,
            "quota_exceeded",
            "saved-search quota reached",
            409,
        );
    }
    let now = now_marker();
    worker::query!(
        &database,
        "INSERT INTO saved_searches
         (id, owner_id, name, query_signature, definition_json,
          last_evaluated_sequence, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           definition_json = excluded.definition_json,
           deleted_at = NULL,
           updated_at = excluded.updated_at",
        &id,
        &principal.id,
        name,
        &signature,
        serde_json::to_string(&definition)?,
        &now
    )?
    .run()
    .await?;
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "saved_search.upsert",
        "saved_search",
        Some(&id),
        "{}",
    )
    .await?;
    let saved = load_owned_search(&database, &id, &principal.id)
        .await?
        .ok_or_else(|| Error::RustError("saved search disappeared".to_string()))?;
    Ok(Response::from_json(&saved)?.with_status(201))
}

pub async fn list_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    let rows = worker::query!(
        &database,
        "SELECT id, owner_id, name, query_signature, definition_json,
                last_evaluated_sequence, created_at, updated_at
         FROM saved_searches
         WHERE owner_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at, id",
        &principal.id
    )?
    .all()
    .await?
    .results::<SavedSearchRow>()?;
    let data = rows.into_iter().map(row_to_view).collect::<Result<Vec<_>>>()?;
    Response::from_json(&OwnedSearchListResponse { data })
}

pub async fn get_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    let id = route_id(&context)?;
    match load_owned_search(&database, &id, &principal.id).await? {
        Some(saved) => Response::from_json(&saved),
        None => crate::auth::api_error(&request, "not_found", "saved search not found", 404),
    }
}

pub async fn update_owned(mut request: Request, context: RouteContext<()>) -> Result<Response> {
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
    let id = route_id(&context)?;
    let Some(current) = load_owned_search(&database, &id, &principal.id).await? else {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    };
    let payload = match request.json::<UpdateSavedSearchRequest>().await {
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
    let name = payload
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&current.name)
        .to_string();
    let definition = payload
        .definition
        .map_or(current.definition, |value| value.normalize());
    if name.len() > SEARCH_NAME_MAX {
        return crate::auth::api_error(
            &request,
            "invalid_search",
            "name must be at most 120 characters",
            400,
        );
    }
    if let Some(message) = definition_error(&definition) {
        return crate::auth::api_error(&request, "invalid_search", message, 400);
    }
    let signature = definition.signature();
    let now = now_marker();
    let definition_json = serde_json::to_string(&definition)?;
    database
        .batch(vec![
            worker::query!(
                &database,
                "UPDATE saved_searches
                 SET name = ?1, query_signature = ?2, definition_json = ?3,
                     last_evaluated_sequence = 0, updated_at = ?4
                 WHERE id = ?5 AND owner_id = ?6 AND deleted_at IS NULL",
                &name,
                &signature,
                &definition_json,
                &now,
                &id,
                &principal.id
            )?,
            worker::query!(
                &database,
                "DELETE FROM search_matches WHERE saved_search_id = ?1",
                &id
            )?,
            worker::query!(
                &database,
                "DELETE FROM notification_outbox
                 WHERE saved_search_id = ?1 AND status != 'delivered'",
                &id
            )?,
        ])
        .await?;
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "saved_search.update",
        "saved_search",
        Some(&id),
        "{}",
    )
    .await?;
    let saved = load_owned_search(&database, &id, &principal.id)
        .await?
        .ok_or_else(|| Error::RustError("saved search disappeared".to_string()))?;
    Response::from_json(&saved)
}

pub async fn delete_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
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
    let id = route_id(&context)?;
    let result = worker::query!(
        &database,
        "DELETE FROM saved_searches WHERE id = ?1 AND owner_id = ?2",
        &id,
        &principal.id
    )?
    .run()
    .await?;
    if result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "saved_search.delete",
        "saved_search",
        Some(&id),
        "{}",
    )
    .await?;
    Ok(Response::empty()?.with_status(204))
}

pub async fn evaluate_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
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
    let id = route_id(&context)?;
    if load_owned_search(&database, &id, &principal.id).await?.is_none() {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    let report = evaluate_saved_search(&database, &id, &now_marker()).await?;
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "saved_search.evaluate",
        "saved_search",
        Some(&id),
        &serde_json::json!({"jobs_evaluated": report.jobs_evaluated}).to_string(),
    )
    .await?;
    Response::from_json(&report)
}

pub async fn matches_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let principal = match crate::auth::principal_from_request(&request, &database).await? {
        Some(value) => value,
        None => return crate::auth::api_error(&request, "unauthorized", "API key required", 401),
    };
    let id = route_id(&context)?;
    if load_owned_search(&database, &id, &principal.id).await?.is_none() {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    let url = request.url()?;
    let mut cursor = None;
    let mut limit = MATCH_PAGE_DEFAULT;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "cursor" => {
                cursor = match value.parse::<i64>().ok().filter(|number| *number >= 0) {
                    Some(number) => Some(number),
                    None => {
                        return crate::auth::api_error(
                            &request,
                            "invalid_cursor",
                            "cursor must be a non-negative integer",
                            400,
                        );
                    }
                };
            }
            "limit" => {
                limit = match value.parse::<i64>() {
                    Ok(number) => number.clamp(1, MATCH_PAGE_MAX),
                    Err(_) => {
                        return crate::auth::api_error(
                            &request,
                            "invalid_limit",
                            "limit must be an integer",
                            400,
                        );
                    }
                };
            }
            _ => {}
        }
    }
    let rows = if let Some(cursor) = cursor {
        worker::query!(
            &database,
            "SELECT cj.id AS job_id, cj.title, cj.employer_name, cj.location,
                    cj.status, cj.sequence
             FROM search_matches sm
             JOIN canonical_jobs cj ON cj.id = sm.canonical_job_id
             WHERE sm.saved_search_id = ?1 AND sm.currently_matches = 1
               AND cj.sequence < ?2
             ORDER BY cj.sequence DESC, cj.id
             LIMIT ?3",
            &id,
            cursor,
            limit
        )?
        .all()
        .await?
        .results::<SearchMatchJoinRow>()?
    } else {
        worker::query!(
            &database,
            "SELECT cj.id AS job_id, cj.title, cj.employer_name, cj.location,
                    cj.status, cj.sequence
             FROM search_matches sm
             JOIN canonical_jobs cj ON cj.id = sm.canonical_job_id
             WHERE sm.saved_search_id = ?1 AND sm.currently_matches = 1
             ORDER BY cj.sequence DESC, cj.id
             LIMIT ?2",
            &id,
            limit
        )?
        .all()
        .await?
        .results::<SearchMatchJoinRow>()?
    };
    let data: Vec<SearchMatchView> = rows
        .into_iter()
        .map(SearchMatchView::from)
        .collect();
    let next_cursor = if data.len() == limit as usize {
        data.last().map(|job| job.sequence.to_string())
    } else {
        None
    };
    Response::from_json(&OwnedMatchListResponse {
        data,
        meta: MatchPageMeta { limit, next_cursor },
    })
}

pub async fn reset_owned(request: Request, context: RouteContext<()>) -> Result<Response> {
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
    let id = route_id(&context)?;
    if load_owned_search(&database, &id, &principal.id).await?.is_none() {
        return crate::auth::api_error(&request, "not_found", "saved search not found", 404);
    }
    database
        .batch(vec![
            worker::query!(
                &database,
                "UPDATE saved_searches SET last_evaluated_sequence = 0, updated_at = ?1
                 WHERE id = ?2 AND owner_id = ?3",
                now_marker(),
                &id,
                &principal.id
            )?,
            worker::query!(
                &database,
                "DELETE FROM search_matches WHERE saved_search_id = ?1",
                &id
            )?,
            worker::query!(
                &database,
                "DELETE FROM notification_outbox
                 WHERE saved_search_id = ?1 AND status != 'delivered'",
                &id
            )?,
        ])
        .await?;
    crate::auth::audit(
        &database,
        &request,
        "principal",
        Some(&principal.id),
        "saved_search.reset",
        "saved_search",
        Some(&id),
        "{}",
    )
    .await?;
    Response::from_json(&serde_json::json!({"search_id": id, "reset": true}))
}

async fn load_owned_search(
    database: &D1Database,
    search_id: &str,
    owner_id: &str,
) -> Result<Option<SavedSearchView>> {
    worker::query!(
        database,
        "SELECT id, owner_id, name, query_signature, definition_json,
                last_evaluated_sequence, created_at, updated_at
         FROM saved_searches
         WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        search_id,
        owner_id
    )?
    .first::<SavedSearchRow>(None)
    .await?
    .map(row_to_view)
    .transpose()
}
