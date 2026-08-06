//! The application loop: account, shortlist, CV, drafts, submission.
//!
//! Identity is the existing principal: a user row attaches a profile and a
//! subscription tier to a principal, so authentication, hashing, and
//! revocation keep one implementation.
//!
//! Premium capability is decided here, server-side, from the stored tier.
//! Anything that costs a browser or model run — agent-tier sources, model
//! drafting, automated submission — is refused for a free account rather than
//! hidden in a client.

use job_index_core::stable_hash_hex;
use serde::{Deserialize, Serialize};
use worker::{D1Database, Request, Response, Result, RouteContext};

const MAX_TEXT: usize = 20_000;
const MAX_NAME: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub subscription_tier: String,
}

impl User {
    /// Whether the account may use capabilities that cost an agent or model
    /// run. The check lives with the data, not with the caller.
    fn is_premium(&self) -> bool {
        self.subscription_tier == "premium"
    }
}

#[derive(Debug, Deserialize)]
struct UserRow {
    id: String,
    email: String,
    display_name: String,
    subscription_tier: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub api_key: String,
    #[serde(default)]
    pub display_name: String,
}

#[derive(Debug, Serialize)]
struct Envelope<T> {
    data: T,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Profile {
    #[serde(default)]
    pub headline: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub languages: String,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub experience: Vec<ExperienceEntry>,
    #[serde(default)]
    pub education: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExperienceEntry {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub employer: String,
    #[serde(default)]
    pub period: String,
    #[serde(default)]
    pub highlights: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ProfileRow {
    headline: String,
    summary: String,
    location: String,
    languages: String,
    skills_json: String,
    experience_json: String,
    education_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedJob {
    pub id: String,
    pub canonical_job_id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub stage: String,
    pub note: String,
    pub saved_at: String,
    pub application_url: String,
    pub deadline: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SavedJobRow {
    id: String,
    canonical_job_id: String,
    title: String,
    employer_name: String,
    location: String,
    stage: String,
    note: String,
    saved_at: String,
    application_url: String,
    deadline: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveJobRequest {
    pub job_id: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Draft {
    pub id: String,
    pub kind: String,
    pub version: i64,
    pub generator: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct DraftRow {
    id: String,
    kind: String,
    version: i64,
    generator: String,
    content: String,
    created_at: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct DraftRequest {
    /// `template` composes from the profile deterministically and is available
    /// to every account. `model` tailors the text with a language model and is
    /// a premium capability.
    #[serde(default)]
    pub generator: Option<String>,
}

#[derive(Debug, Serialize)]
struct ApplicationPackage {
    application: ApplicationRecord,
    /// What the person submits, so an assisted application is a copy-and-paste
    /// away rather than a second drafting session.
    cv: String,
    letter: String,
    /// Present when the platform's terms were the reason automation was
    /// refused, so the caller can say why rather than failing opaquely.
    automation_note: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplicationRecord {
    pub id: String,
    pub saved_job_id: String,
    pub method: String,
    pub status: String,
    pub application_url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApplicationRow {
    id: String,
    saved_job_id: String,
    method: String,
    status: String,
    application_url: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct ApplyRequest {
    /// `assisted` returns the package for the person to submit. `automated`
    /// is accepted only for a platform whose recorded policy allows it, and
    /// only for a premium account.
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub external_reference: String,
}

#[derive(Debug, Deserialize)]
pub struct StatusRequest {
    pub status: String,
    #[serde(default)]
    pub notes: String,
}

/// The advert a draft is composed from, and the snapshot stored alongside a
/// shortlist entry so the record survives the vacancy being pruned.
#[derive(Debug, Deserialize)]
struct JobRow {
    id: String,
    title: String,
    employer_name: String,
    location: String,
    description: String,
    application_url: String,
    deadline: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PolicyRow {
    automation_policy: String,
    platform: String,
}

fn now_ms() -> i64 {
    worker::Date::now().as_millis() as i64
}

fn identifier(prefix: &str, seed: &str) -> String {
    format!("{prefix}_{}", stable_hash_hex(seed))
}

/// `POST /api/v1/users` — register an account against a supplied API key.
///
/// The key is chosen by the caller and stored only as a hash, matching how
/// principals already work; the service never holds a recoverable credential.
pub async fn register(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let payload: RegisterRequest = match request.json().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(&request, "invalid_body", "expected a JSON object", 400);
        }
    };
    let email = payload.email.trim().to_ascii_lowercase();
    if email.is_empty() || !email.contains('@') || email.len() > MAX_NAME {
        return crate::auth::api_error(&request, "invalid_email", "a valid email is required", 400);
    }
    if payload.api_key.trim().len() < 32 {
        return crate::auth::api_error(
            &request,
            "weak_api_key",
            "api_key must contain at least 32 characters",
            400,
        );
    }

    let database = context.env.d1("DB")?;
    let observed_at = now_ms().to_string();
    let principal_id = identifier("principal", &format!("user|{email}"));
    let user_id = identifier("user", &email);
    let key_hash = crate::auth::sha256_hex(payload.api_key.trim());
    let display_name = if payload.display_name.trim().is_empty() {
        email.clone()
    } else {
        payload.display_name.trim().chars().take(MAX_NAME).collect()
    };

    // A person is a member principal: they own their searches and saved jobs.
    let created = database
        .prepare(
            "INSERT INTO principals (id, name, api_key_hash, role, status, search_quota, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'member', 'active', 20, ?4, ?4)
             ON CONFLICT(id) DO NOTHING",
        )
        .bind(&[
            principal_id.as_str().into(),
            display_name.as_str().into(),
            key_hash.as_str().into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;
    if created.error().is_some() {
        return crate::auth::api_error(&request, "registration_failed", "could not register", 409);
    }

    database
        .prepare(
            "INSERT INTO users (id, principal_id, email, display_name, subscription_tier, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'free', ?5, ?5)
             ON CONFLICT(email) DO NOTHING",
        )
        .bind(&[
            user_id.as_str().into(),
            principal_id.as_str().into(),
            email.as_str().into(),
            display_name.as_str().into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;

    let Some(user) = load_user(&database, &principal_id).await? else {
        return crate::auth::api_error(
            &request,
            "email_taken",
            "an account already exists for that email",
            409,
        );
    };
    Response::from_json(&Envelope { data: user }).map(|response| response.with_status(201))
}

/// Resolves the caller to an account, or returns the 401 response to send.
async fn require_user(
    request: &Request,
    database: &D1Database,
) -> Result<std::result::Result<User, Response>> {
    let Some(principal) = crate::auth::principal_from_request(request, database).await? else {
        return Ok(Err(crate::auth::api_error(
            request,
            "unauthorized",
            "API key required",
            401,
        )?));
    };
    match load_user(database, &principal.id).await? {
        Some(user) => Ok(Ok(user)),
        None => Ok(Err(crate::auth::api_error(
            request,
            "not_an_account",
            "this key belongs to an API client, not a user account",
            403,
        )?)),
    }
}

async fn load_user(database: &D1Database, principal_id: &str) -> Result<Option<User>> {
    let row = worker::query!(
        database,
        "SELECT id, email, display_name, subscription_tier
         FROM users
         WHERE principal_id = ?1 AND erasure_requested_at IS NULL",
        principal_id
    )?
    .first::<UserRow>(None)
    .await?;
    Ok(row.map(|value| User {
        id: value.id,
        email: value.email,
        display_name: value.display_name,
        subscription_tier: value.subscription_tier,
    }))
}

/// Whether the caller's account holds paid capabilities, for gates outside
/// this module. Returns false for an unauthenticated caller or an API client
/// that is not a person's account.
pub async fn caller_is_premium(request: &Request, database: &D1Database) -> Result<bool> {
    let Some(principal) = crate::auth::principal_from_request(request, database).await? else {
        return Ok(false);
    };
    Ok(load_user(database, &principal.id)
        .await?
        .is_some_and(|user| user.is_premium()))
}

/// `GET /api/v1/me` — the account and what it may do.
pub async fn me(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let profile = load_profile(&database, &user.id).await?;
    Response::from_json(&serde_json::json!({
        "data": {
            "user": user,
            "profile": profile,
            "capabilities": {
                "agent_sources": user.is_premium(),
                "model_drafting": user.is_premium(),
                "automated_apply": user.is_premium(),
            }
        }
    }))
}

async fn load_profile(database: &D1Database, user_id: &str) -> Result<Profile> {
    let row = worker::query!(
        database,
        "SELECT headline, summary, location, languages, skills_json, experience_json, education_json
         FROM user_profiles WHERE user_id = ?1",
        user_id
    )?
    .first::<ProfileRow>(None)
    .await?;
    Ok(row.map_or_else(Profile::default, |value| Profile {
        headline: value.headline,
        summary: value.summary,
        location: value.location,
        languages: value.languages,
        skills: serde_json::from_str(&value.skills_json).unwrap_or_default(),
        experience: serde_json::from_str(&value.experience_json).unwrap_or_default(),
        education: serde_json::from_str(&value.education_json).unwrap_or_default(),
    }))
}

/// `PUT /api/v1/me/profile` — the CV, as structured data.
pub async fn put_profile(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let profile: Profile = match request.json().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(&request, "invalid_body", "expected a profile", 400);
        }
    };
    if profile.summary.len() > MAX_TEXT || profile.headline.len() > MAX_NAME {
        return crate::auth::api_error(&request, "too_long", "profile text is too long", 400);
    }

    let observed_at = now_ms().to_string();
    let skills = serde_json::to_string(&profile.skills).unwrap_or_else(|_| "[]".to_string());
    let experience =
        serde_json::to_string(&profile.experience).unwrap_or_else(|_| "[]".to_string());
    let education = serde_json::to_string(&profile.education).unwrap_or_else(|_| "[]".to_string());
    database
        .prepare(
            "INSERT INTO user_profiles (user_id, headline, summary, location, languages,
                                        skills_json, experience_json, education_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(user_id) DO UPDATE SET
               headline = excluded.headline, summary = excluded.summary,
               location = excluded.location, languages = excluded.languages,
               skills_json = excluded.skills_json, experience_json = excluded.experience_json,
               education_json = excluded.education_json, updated_at = excluded.updated_at",
        )
        .bind(&[
            user.id.as_str().into(),
            profile.headline.as_str().into(),
            profile.summary.as_str().into(),
            profile.location.as_str().into(),
            profile.languages.as_str().into(),
            skills.as_str().into(),
            experience.as_str().into(),
            education.as_str().into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;
    Response::from_json(&Envelope {
        data: load_profile(&database, &user.id).await?,
    })
}

/// `POST /api/v1/me/saved` — shortlist a vacancy.
pub async fn save_job(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let payload: SaveJobRequest = match request.json().await {
        Ok(value) => value,
        Err(_) => return crate::auth::api_error(&request, "invalid_body", "expected job_id", 400),
    };

    let Some(job) = load_job(&database, &payload.job_id).await? else {
        return crate::auth::api_error(&request, "not_found", "no such job", 404);
    };
    let observed_at = now_ms().to_string();
    let saved_id = identifier("saved", &format!("{}|{}", user.id, job.id));
    database
        .prepare(
            "INSERT INTO saved_jobs (id, user_id, canonical_job_id, job_title, job_employer,
                                     job_location, job_application_url, job_deadline,
                                     stage, note, saved_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'saved', ?9, ?10, ?10)
             ON CONFLICT(user_id, canonical_job_id) DO UPDATE SET
               note = excluded.note, updated_at = excluded.updated_at",
        )
        .bind(&[
            saved_id.as_str().into(),
            user.id.as_str().into(),
            job.id.as_str().into(),
            job.title.as_str().into(),
            job.employer_name.as_str().into(),
            job.location.as_str().into(),
            job.application_url.as_str().into(),
            job.deadline.as_deref().map_or(
                worker::wasm_bindgen::JsValue::NULL,
                worker::wasm_bindgen::JsValue::from,
            ),
            payload
                .note
                .chars()
                .take(MAX_TEXT)
                .collect::<String>()
                .as_str()
                .into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;
    Response::from_json(&Envelope {
        data: list_saved_rows(&database, &user.id, Some(&saved_id)).await?,
    })
    .map(|response| response.with_status(201))
}

/// `GET /api/v1/me/saved` — the shortlist, newest first.
pub async fn list_saved(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    Response::from_json(&Envelope {
        data: list_saved_rows(&database, &user.id, None).await?,
    })
}

async fn list_saved_rows(
    database: &D1Database,
    user_id: &str,
    only: Option<&str>,
) -> Result<Vec<SavedJob>> {
    // LEFT JOIN with the snapshot as fallback: a shortlist entry outlives the
    // advert, so a purged vacancy must still list with what it said when saved.
    let sql = "SELECT sj.id, sj.canonical_job_id,
                      COALESCE(cj.title, sj.job_title) AS title,
                      COALESCE(cj.employer_name, sj.job_employer) AS employer_name,
                      COALESCE(cj.location, sj.job_location) AS location,
                      sj.stage, sj.note, sj.saved_at,
                      COALESCE(cj.application_url, sj.job_application_url) AS application_url,
                      COALESCE(cj.deadline, sj.job_deadline) AS deadline
               FROM saved_jobs sj
               LEFT JOIN canonical_jobs cj ON cj.id = sj.canonical_job_id
               WHERE sj.user_id = ?1 AND (?2 IS NULL OR sj.id = ?2)
               ORDER BY sj.updated_at DESC
               LIMIT 200";
    let only_value = only.map_or(worker::wasm_bindgen::JsValue::NULL, |value| {
        worker::wasm_bindgen::JsValue::from(value)
    });
    let rows = database
        .prepare(sql)
        .bind(&[user_id.into(), only_value])?
        .all()
        .await?
        .results::<SavedJobRow>()?;
    Ok(rows
        .into_iter()
        .map(|row| SavedJob {
            id: row.id,
            canonical_job_id: row.canonical_job_id,
            title: row.title,
            employer_name: row.employer_name,
            location: row.location,
            stage: row.stage,
            note: row.note,
            saved_at: row.saved_at,
            application_url: row.application_url,
            deadline: row.deadline,
        })
        .collect())
}

/// `DELETE /api/v1/me/saved/:id`
pub async fn unsave_job(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let Some(saved_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "saved job id required", 400);
    };
    // Scoped by user so one account cannot remove another's shortlist entry.
    database
        .prepare("DELETE FROM saved_jobs WHERE id = ?1 AND user_id = ?2")
        .bind(&[saved_id.as_str().into(), user.id.as_str().into()])?
        .run()
        .await?;
    Response::from_json(&serde_json::json!({ "data": { "removed": saved_id } }))
}

async fn load_job(database: &D1Database, job_id: &str) -> Result<Option<JobRow>> {
    worker::query!(
        database,
        "SELECT id, title, employer_name, location, description, application_url, deadline
         FROM canonical_jobs WHERE id = ?1",
        job_id
    )?
    .first::<JobRow>(None)
    .await
}

/// `POST /api/v1/me/saved/:id/draft` — compose a CV and a letter for this vacancy.
///
/// The template generator is deterministic and available to every account: it
/// selects the profile's most relevant experience for the advert and lays it
/// out. The model generator tailors the prose and costs a model run, so it is
/// refused for a free account.
pub async fn draft(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let Some(saved_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "saved job id required", 400);
    };
    let payload: DraftRequest = request.json().await.unwrap_or_default();
    let generator = payload.generator.unwrap_or_else(|| "template".to_string());
    if !matches!(generator.as_str(), "template" | "model") {
        return crate::auth::api_error(
            &request,
            "invalid_generator",
            "generator must be template or model",
            400,
        );
    }
    if generator == "model" && !user.is_premium() {
        return crate::auth::api_error(
            &request,
            "premium_required",
            "model drafting is a premium capability; template drafting is available on every account",
            402,
        );
    }

    let Some(saved) = list_saved_rows(&database, &user.id, Some(&saved_id))
        .await?
        .into_iter()
        .next()
    else {
        return crate::auth::api_error(&request, "not_found", "no such saved job", 404);
    };
    let Some(job) = load_job(&database, &saved.canonical_job_id).await? else {
        return crate::auth::api_error(&request, "not_found", "the vacancy has gone", 404);
    };
    let profile = load_profile(&database, &user.id).await?;
    if profile.headline.trim().is_empty() && profile.experience.is_empty() {
        return crate::auth::api_error(
            &request,
            "profile_incomplete",
            "add a headline or some experience before drafting",
            409,
        );
    }

    let cv = compose_cv(&user, &profile, &job);
    let letter = compose_letter(&user, &profile, &job);
    let observed_at = now_ms().to_string();
    let mut drafts = Vec::new();
    for (kind, content) in [("cv", cv), ("letter", letter)] {
        let version = next_version(&database, &saved.id, kind).await?;
        let draft_id = identifier("draft", &format!("{}|{kind}|{version}", saved.id));
        database
            .prepare(
                "INSERT INTO application_drafts (id, saved_job_id, kind, version, generator, content, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(&[
                draft_id.as_str().into(),
                saved.id.as_str().into(),
                kind.into(),
                // D1 bindings are JavaScript numbers; an i64 crosses as a bigint,
                // which it rejects outright.
                worker::wasm_bindgen::JsValue::from_f64(version as f64),
                generator.as_str().into(),
                content.as_str().into(),
                observed_at.as_str().into(),
            ])?
            .run()
            .await?;
        drafts.push(Draft {
            id: draft_id,
            kind: kind.to_string(),
            version,
            generator: generator.clone(),
            content,
            created_at: observed_at.clone(),
        });
    }

    advance_stage(&database, &saved.id, "drafted", &observed_at).await?;
    Response::from_json(&Envelope { data: drafts }).map(|response| response.with_status(201))
}

async fn next_version(database: &D1Database, saved_job_id: &str, kind: &str) -> Result<i64> {
    #[derive(Deserialize)]
    struct MaxRow {
        next: i64,
    }
    let row = worker::query!(
        database,
        "SELECT COALESCE(MAX(version), 0) + 1 AS next
         FROM application_drafts WHERE saved_job_id = ?1 AND kind = ?2",
        saved_job_id,
        kind
    )?
    .first::<MaxRow>(None)
    .await?;
    Ok(row.map_or(1, |value| value.next))
}

async fn advance_stage(
    database: &D1Database,
    saved_job_id: &str,
    stage: &str,
    observed_at: &str,
) -> Result<()> {
    database
        .prepare("UPDATE saved_jobs SET stage = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(&[stage.into(), observed_at.into(), saved_job_id.into()])?
        .run()
        .await?;
    Ok(())
}

/// Ranks the profile's experience against the advert so the strongest match
/// leads. Deterministic by design: the same profile and advert always compose
/// the same document, which is what makes the output reviewable.
fn relevance(entry: &ExperienceEntry, advert: &str) -> usize {
    let haystack = advert.to_ascii_lowercase();
    let mut score = 0;
    for token in entry.title.split_whitespace().chain(
        entry
            .highlights
            .iter()
            .flat_map(|line| line.split_whitespace()),
    ) {
        let token = token
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_ascii_lowercase();
        if token.len() > 3 && haystack.contains(&token) {
            score += 1;
        }
    }
    score
}

fn compose_cv(user: &User, profile: &Profile, job: &JobRow) -> String {
    let advert = format!("{} {} {}", job.title, job.description, job.employer_name);
    let mut experience = profile.experience.clone();
    experience.sort_by_key(|entry| std::cmp::Reverse(relevance(entry, &advert)));

    let mut out = String::new();
    out.push_str(&format!("{}\n", user.display_name));
    if !profile.headline.trim().is_empty() {
        out.push_str(&format!("{}\n", profile.headline.trim()));
    }
    if !profile.location.trim().is_empty() {
        out.push_str(&format!("{}\n", profile.location.trim()));
    }
    out.push_str(&format!("{}\n\n", user.email));

    if !profile.summary.trim().is_empty() {
        out.push_str("PROFILE\n");
        out.push_str(profile.summary.trim());
        out.push_str("\n\n");
    }
    if !experience.is_empty() {
        out.push_str("EXPERIENCE\n");
        for entry in experience.iter().take(8) {
            out.push_str(&format!(
                "{} — {} ({})\n",
                entry.title.trim(),
                entry.employer.trim(),
                entry.period.trim()
            ));
            for highlight in entry.highlights.iter().take(4) {
                out.push_str(&format!("  · {}\n", highlight.trim()));
            }
        }
        out.push('\n');
    }
    if !profile.skills.is_empty() {
        out.push_str(&format!("SKILLS\n{}\n\n", profile.skills.join(", ")));
    }
    if !profile.education.is_empty() {
        out.push_str(&format!("EDUCATION\n{}\n\n", profile.education.join("\n")));
    }
    if !profile.languages.trim().is_empty() {
        out.push_str(&format!("LANGUAGES\n{}\n", profile.languages.trim()));
    }
    out
}

fn compose_letter(user: &User, profile: &Profile, job: &JobRow) -> String {
    let advert = format!("{} {} {}", job.title, job.description, job.employer_name);
    let mut experience = profile.experience.clone();
    experience.sort_by_key(|entry| std::cmp::Reverse(relevance(entry, &advert)));

    let opening = if profile.headline.trim().is_empty() {
        format!("I am applying for {} at {}.", job.title, job.employer_name)
    } else {
        format!(
            "I am applying for {} at {}. I am {}.",
            job.title,
            job.employer_name,
            profile.headline.trim()
        )
    };

    let mut body = String::new();
    if let Some(best) = experience.first() {
        body.push_str(&format!(
            "Most recently I worked as {} at {} ({}).",
            best.title.trim(),
            best.employer.trim(),
            best.period.trim()
        ));
        if let Some(highlight) = best.highlights.first() {
            body.push_str(&format!(" {}", highlight.trim()));
        }
        body.push('\n');
    }

    // Name the overlap explicitly rather than asserting a vague fit: the advert
    // either mentions these skills or it does not.
    let advert_lower = advert.to_ascii_lowercase();
    let matched: Vec<&String> = profile
        .skills
        .iter()
        .filter(|skill| advert_lower.contains(&skill.to_ascii_lowercase()))
        .take(6)
        .collect();
    if !matched.is_empty() {
        let names: Vec<&str> = matched.iter().map(|skill| skill.as_str()).collect();
        body.push_str(&format!(
            "\nThe advert asks for {}, which is what I have been doing.\n",
            names.join(", ")
        ));
    }

    format!(
        "{opening}\n\n{body}\n{}\n\nKind regards,\n{}\n{}\n",
        if job.location.trim().is_empty() {
            "I am available to start by agreement.".to_string()
        } else {
            format!("I am based for work in {}.", job.location.trim())
        },
        user.display_name,
        user.email
    )
}

/// `POST /api/v1/me/saved/:id/apply` — produce the submission.
///
/// Assisted is the default and always available: the person receives the
/// finished CV and letter plus the advert URL and submits it themselves.
/// Automated submission is refused unless the account is premium *and* the
/// platform's recorded policy allows it — a platform that forbids automation
/// is never submitted to on the user's behalf, whatever they have paid.
pub async fn apply(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let Some(saved_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "saved job id required", 400);
    };
    let payload: ApplyRequest = request.json().await.unwrap_or_default();
    let requested = payload.method.unwrap_or_else(|| "assisted".to_string());
    if !matches!(requested.as_str(), "assisted" | "automated") {
        return crate::auth::api_error(
            &request,
            "invalid_method",
            "method must be assisted or automated",
            400,
        );
    }

    let Some(saved) = list_saved_rows(&database, &user.id, Some(&saved_id))
        .await?
        .into_iter()
        .next()
    else {
        return crate::auth::api_error(&request, "not_found", "no such saved job", 404);
    };

    let cv = latest_draft(&database, &saved.id, "cv").await?;
    let letter = latest_draft(&database, &saved.id, "letter").await?;
    let (Some(cv), Some(letter)) = (cv, letter) else {
        return crate::auth::api_error(
            &request,
            "draft_required",
            "draft a CV and letter before applying",
            409,
        );
    };

    // Which platform is this advert from, and what does its policy permit?
    let policy = source_policy(&database, &saved.canonical_job_id).await?;
    let mut automation_note = String::new();
    let method = if requested == "automated" {
        if !user.is_premium() {
            return crate::auth::api_error(
                &request,
                "premium_required",
                "automated submission is a premium capability",
                402,
            );
        }
        match policy.as_ref().map(|row| row.automation_policy.as_str()) {
            Some("allowed") => "automated",
            Some(other) => {
                let platform = policy
                    .as_ref()
                    .map_or("this platform", |row| row.platform.as_str());
                automation_note = format!(
                    "{platform} is recorded as '{other}' for automated submission, so this application was prepared for you to submit."
                );
                "assisted"
            }
            None => {
                automation_note =
                    "The advert's platform has no reviewed automation policy, so this application was prepared for you to submit."
                        .to_string();
                "assisted"
            }
        }
    } else {
        "assisted"
    };

    let observed_at = now_ms().to_string();
    let application_id = identifier("application", &saved.id);
    database
        .prepare(
            "INSERT INTO applications (id, saved_job_id, user_id, method, status, application_url,
                                       external_reference, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT(saved_job_id) DO UPDATE SET
               method = excluded.method, status = excluded.status,
               external_reference = excluded.external_reference, updated_at = excluded.updated_at",
        )
        .bind(&[
            application_id.as_str().into(),
            saved.id.as_str().into(),
            user.id.as_str().into(),
            method.into(),
            if method == "automated" {
                "submitted"
            } else {
                "ready"
            }
            .into(),
            saved.application_url.as_str().into(),
            payload.external_reference.as_str().into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;
    advance_stage(&database, &saved.id, "applied", &observed_at).await?;

    let Some(record) = load_application(&database, &saved.id).await? else {
        return crate::auth::api_error(
            &request,
            "apply_failed",
            "could not record the application",
            500,
        );
    };
    Response::from_json(&Envelope {
        data: ApplicationPackage {
            application: record,
            cv: cv.content,
            letter: letter.content,
            automation_note,
        },
    })
    .map(|response| response.with_status(201))
}

/// `GET /api/v1/me/applications` — the loop's state: what has been sent and
/// what came back.
pub async fn list_applications(request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let rows = worker::query!(
        &database,
        "SELECT id, saved_job_id, method, status, application_url, created_at, updated_at
         FROM applications WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 200",
        user.id
    )?
    .all()
    .await?
    .results::<ApplicationRow>()?;
    let data: Vec<ApplicationRecord> = rows.into_iter().map(Into::into).collect();
    Response::from_json(&Envelope { data })
}

/// `POST /api/v1/me/applications/:id/status` — record what the employer said.
pub async fn set_status(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    let database = context.env.d1("DB")?;
    let user = match require_user(&request, &database).await? {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };
    let Some(application_id) = context.param("id").cloned() else {
        return crate::auth::api_error(&request, "invalid_path", "application id required", 400);
    };
    let payload: StatusRequest = match request.json().await {
        Ok(value) => value,
        Err(_) => {
            return crate::auth::api_error(&request, "invalid_body", "expected a status", 400);
        }
    };
    if !matches!(
        payload.status.as_str(),
        "ready" | "submitted" | "rejected" | "interview" | "offer" | "withdrawn"
    ) {
        return crate::auth::api_error(&request, "invalid_status", "unknown status", 400);
    }

    let observed_at = now_ms().to_string();
    database
        .prepare(
            "UPDATE applications SET status = ?1, notes = ?2, updated_at = ?3
             WHERE id = ?4 AND user_id = ?5",
        )
        .bind(&[
            payload.status.as_str().into(),
            payload
                .notes
                .chars()
                .take(MAX_TEXT)
                .collect::<String>()
                .as_str()
                .into(),
            observed_at.as_str().into(),
            application_id.as_str().into(),
            user.id.as_str().into(),
        ])?
        .run()
        .await?;
    Response::from_json(&serde_json::json!({
        "data": { "id": application_id, "status": payload.status }
    }))
}

impl From<ApplicationRow> for ApplicationRecord {
    fn from(row: ApplicationRow) -> Self {
        Self {
            id: row.id,
            saved_job_id: row.saved_job_id,
            method: row.method,
            status: row.status,
            application_url: row.application_url,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

async fn load_application(
    database: &D1Database,
    saved_job_id: &str,
) -> Result<Option<ApplicationRecord>> {
    let row = worker::query!(
        database,
        "SELECT id, saved_job_id, method, status, application_url, created_at, updated_at
         FROM applications WHERE saved_job_id = ?1",
        saved_job_id
    )?
    .first::<ApplicationRow>(None)
    .await?;
    Ok(row.map(Into::into))
}

async fn latest_draft(
    database: &D1Database,
    saved_job_id: &str,
    kind: &str,
) -> Result<Option<Draft>> {
    let row = worker::query!(
        database,
        "SELECT id, kind, version, generator, content, created_at
         FROM application_drafts
         WHERE saved_job_id = ?1 AND kind = ?2
         ORDER BY version DESC LIMIT 1",
        saved_job_id,
        kind
    )?
    .first::<DraftRow>(None)
    .await?;
    Ok(row.map(|value| Draft {
        id: value.id,
        kind: value.kind,
        version: value.version,
        generator: value.generator,
        content: value.content,
        created_at: value.created_at,
    }))
}

/// Finds the automation policy for whichever catalogued platform this vacancy
/// came from. Absent a match the caller treats it as unreviewed, which forbids
/// automation.
async fn source_policy(database: &D1Database, canonical_job_id: &str) -> Result<Option<PolicyRow>> {
    worker::query!(
        database,
        "SELECT sc.automation_policy, sc.platform
         FROM source_listings sl
         JOIN sources s ON s.id = sl.source_id
         JOIN source_catalog sc ON sc.platform = s.name COLLATE NOCASE
         WHERE sl.canonical_job_id = ?1
         ORDER BY sc.automation_policy = 'allowed' DESC
         LIMIT 1",
        canonical_job_id
    )?
    .first::<PolicyRow>(None)
    .await
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::{ExperienceEntry, JobRow, Profile, User, compose_letter, relevance};

    fn user() -> User {
        User {
            id: "user_1".to_string(),
            email: "nora@example.no".to_string(),
            display_name: "Nora Berg".to_string(),
            subscription_tier: "free".to_string(),
        }
    }

    fn advert() -> JobRow {
        JobRow {
            id: "job_1".to_string(),
            title: "Customer Service Adviser".to_string(),
            employer_name: "Oslo Service Group AS".to_string(),
            location: "Oslo".to_string(),
            description: "Answer customer questions through chat and telephone support."
                .to_string(),
            application_url: "https://jobs.example.invalid/advert".to_string(),
            deadline: Some("2026-09-01".to_string()),
        }
    }

    #[test]
    fn only_premium_accounts_hold_paid_capabilities() {
        let mut account = user();
        assert!(!account.is_premium());
        account.subscription_tier = "premium".to_string();
        assert!(account.is_premium());
    }

    /// The advert decides which experience leads, so the same profile produces
    /// a different document for a different vacancy.
    #[test]
    fn experience_is_ranked_against_the_advert() {
        let support = ExperienceEntry {
            title: "Customer Service Adviser".to_string(),
            employer: "Nordic Retail AS".to_string(),
            period: "2022-2026".to_string(),
            highlights: vec!["Handled chat and telephone support".to_string()],
        };
        let barista = ExperienceEntry {
            title: "Barista".to_string(),
            employer: "Kaffebrenneriet".to_string(),
            period: "2019-2022".to_string(),
            highlights: vec!["Trained new staff".to_string()],
        };
        let job = advert();
        let text = format!("{} {} {}", job.title, job.description, job.employer_name);

        assert!(
            relevance(&support, &text) > relevance(&barista, &text),
            "support experience should outrank unrelated experience for a support advert"
        );
    }

    /// A letter that claims skills the advert never mentions is the failure
    /// mode worth guarding: the overlap is stated only when it is real.
    #[test]
    fn letter_names_only_skills_the_advert_asks_for() {
        let profile = Profile {
            headline: "Customer support specialist".to_string(),
            skills: vec!["support".to_string(), "underwater welding".to_string()],
            experience: vec![ExperienceEntry {
                title: "Customer Service Adviser".to_string(),
                employer: "Nordic Retail AS".to_string(),
                period: "2022-2026".to_string(),
                highlights: vec!["Handled chat and telephone support".to_string()],
            }],
            ..Profile::default()
        };

        let letter = compose_letter(&user(), &profile, &advert());

        assert!(
            letter.contains("support"),
            "the matched skill should appear"
        );
        assert!(
            !letter.contains("underwater welding"),
            "a skill the advert never mentions must not be claimed: {letter}"
        );
        assert!(letter.contains("Customer Service Adviser"));
        assert!(letter.contains("Nora Berg"));
    }
}

/// What a scheduled run did, so the agenda can record why it stopped.
#[derive(Debug, Default)]
pub struct ScheduleOutcome {
    pub considered: usize,
    pub prepared: usize,
    pub stopped_reason: String,
}

/// Resolves the caller to an account without deciding what to do about it.
pub async fn caller_account(request: &Request, database: &D1Database) -> Result<Option<User>> {
    let Some(principal) = crate::auth::principal_from_request(request, database).await? else {
        return Ok(None);
    };
    load_user(database, &principal.id).await
}

pub fn account_is_premium(user: &User) -> bool {
    user.is_premium()
}

/// Re-checks the tier at run time: a lapsed subscription must stop the work,
/// not keep it running because the schedule was created while it was active.
pub async fn user_is_premium(database: &D1Database, user_id: &str) -> Result<bool> {
    #[derive(Deserialize)]
    struct TierRow {
        subscription_tier: String,
    }
    let row = worker::query!(
        database,
        "SELECT subscription_tier FROM users WHERE id = ?1 AND erasure_requested_at IS NULL",
        user_id
    )?
    .first::<TierRow>(None)
    .await?;
    Ok(row.is_some_and(|value| value.subscription_tier == "premium"))
}

/// Shortlists, drafts for, and prepares an application for each vacancy the
/// saved search has newly matched, up to the schedule's budget.
///
/// This is the same composition the manual path uses, so a scheduled letter is
/// the letter the person would have got by pressing the button — there is no
/// second, lower-quality generator hiding behind the subscription.
pub async fn prepare_for_schedule(
    database: &D1Database,
    user_id: &str,
    saved_search_id: &str,
    max_per_run: i64,
    method: &str,
) -> Result<ScheduleOutcome> {
    #[derive(Deserialize)]
    struct MatchRow {
        canonical_job_id: String,
    }

    // Currently-matching vacancies this person has not already shortlisted.
    // Excluding the shortlist is what stops a daily schedule re-applying to
    // the same advert every day.
    let matches = database
        .prepare(
            "SELECT sm.canonical_job_id
             FROM search_matches sm
             JOIN canonical_jobs cj ON cj.id = sm.canonical_job_id
             WHERE sm.saved_search_id = ?1
               AND sm.currently_matches = 1
               AND cj.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM saved_jobs sj
                 WHERE sj.user_id = ?2 AND sj.canonical_job_id = sm.canonical_job_id
               )
             ORDER BY cj.sequence DESC
             LIMIT ?3",
        )
        .bind(&[
            saved_search_id.into(),
            user_id.into(),
            worker::wasm_bindgen::JsValue::from_f64(max_per_run as f64),
        ])?
        .all()
        .await?
        .results::<MatchRow>()?;

    let mut outcome = ScheduleOutcome {
        considered: matches.len(),
        ..ScheduleOutcome::default()
    };
    if matches.is_empty() {
        outcome.stopped_reason = "no new matches".to_string();
        return Ok(outcome);
    }

    let Some(user) = load_user_by_id(database, user_id).await? else {
        outcome.stopped_reason = "account not found".to_string();
        return Ok(outcome);
    };
    let profile = load_profile(database, user_id).await?;
    if profile.headline.trim().is_empty() && profile.experience.is_empty() {
        outcome.stopped_reason = "profile has nothing to draft from".to_string();
        return Ok(outcome);
    }

    for entry in matches {
        let Some(job) = load_job(database, &entry.canonical_job_id).await? else {
            continue;
        };
        let observed_at = now_ms().to_string();
        let saved_id = identifier("saved", &format!("{user_id}|{}", job.id));
        database
            .prepare(
                "INSERT INTO saved_jobs (id, user_id, canonical_job_id, job_title, job_employer,
                                         job_location, job_application_url, job_deadline,
                                         stage, note, saved_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'saved', ?9, ?10, ?10)
                 ON CONFLICT(user_id, canonical_job_id) DO NOTHING",
            )
            .bind(&[
                saved_id.as_str().into(),
                user_id.into(),
                job.id.as_str().into(),
                job.title.as_str().into(),
                job.employer_name.as_str().into(),
                job.location.as_str().into(),
                job.application_url.as_str().into(),
                job.deadline.as_deref().map_or(
                    worker::wasm_bindgen::JsValue::NULL,
                    worker::wasm_bindgen::JsValue::from,
                ),
                "prepared by a schedule".into(),
                observed_at.as_str().into(),
            ])?
            .run()
            .await?;

        let cv = compose_cv(&user, &profile, &job);
        let letter = compose_letter(&user, &profile, &job);
        for (kind, content) in [("cv", cv), ("letter", letter)] {
            let version = next_version(database, &saved_id, kind).await?;
            let draft_id = identifier("draft", &format!("{saved_id}|{kind}|{version}"));
            database
                .prepare(
                    "INSERT INTO application_drafts (id, saved_job_id, kind, version, generator, content, created_at)
                     VALUES (?1, ?2, ?3, ?4, 'template', ?5, ?6)",
                )
                .bind(&[
                    draft_id.as_str().into(),
                    saved_id.as_str().into(),
                    kind.into(),
                    worker::wasm_bindgen::JsValue::from_f64(version as f64),
                    content.as_str().into(),
                    observed_at.as_str().into(),
                ])?
                .run()
                .await?;
        }

        // A schedule cannot widen what the platform permits: automated is
        // honoured only where the catalogue records it as allowed.
        let policy = source_policy(database, &job.id).await?;
        let effective = if method == "automated"
            && policy
                .as_ref()
                .is_some_and(|row| row.automation_policy == "allowed")
        {
            "automated"
        } else {
            "assisted"
        };
        let application_id = identifier("application", &saved_id);
        database
            .prepare(
                "INSERT INTO applications (id, saved_job_id, user_id, method, status,
                                           application_url, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                 ON CONFLICT(saved_job_id) DO NOTHING",
            )
            .bind(&[
                application_id.as_str().into(),
                saved_id.as_str().into(),
                user_id.into(),
                effective.into(),
                if effective == "automated" {
                    "submitted"
                } else {
                    "ready"
                }
                .into(),
                job.application_url.as_str().into(),
                "prepared by a scheduled run".into(),
                observed_at.as_str().into(),
            ])?
            .run()
            .await?;
        advance_stage(database, &saved_id, "applied", &observed_at).await?;
        outcome.prepared += 1;
    }

    if outcome.prepared as i64 >= max_per_run {
        outcome.stopped_reason = "reached the run budget".to_string();
    }
    Ok(outcome)
}

async fn load_user_by_id(database: &D1Database, user_id: &str) -> Result<Option<User>> {
    let row = worker::query!(
        database,
        "SELECT id, email, display_name, subscription_tier
         FROM users WHERE id = ?1 AND erasure_requested_at IS NULL",
        user_id
    )?
    .first::<UserRow>(None)
    .await?;
    Ok(row.map(|value| User {
        id: value.id,
        email: value.email,
        display_name: value.display_name,
        subscription_tier: value.subscription_tier,
    }))
}

/// The result of linking an external identity to an account.
pub struct LinkedIdentity {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub subscription_tier: String,
    /// Present only when the account was created by this link, because the key
    /// is stored as a hash and cannot be shown again.
    pub issued_api_key: Option<String>,
}

/// Links an external sign-in to an account, creating one on first use.
///
/// Matching is by provider subject first and email second: a member who
/// changes their email keeps their account, and a member who signed up
/// directly keeps theirs when they later link.
pub async fn link_external_identity(
    database: &D1Database,
    provider: &str,
    subject: &str,
    email: &str,
    display_name: &str,
    avatar_url: &str,
) -> Result<LinkedIdentity> {
    let email = email.trim().to_ascii_lowercase();
    let observed_at = now_ms().to_string();

    #[derive(Deserialize)]
    struct ExistingRow {
        id: String,
        email: String,
        display_name: String,
        subscription_tier: String,
    }
    let existing = database
        .prepare(
            "SELECT id, email, display_name, subscription_tier FROM users
             WHERE (linkedin_subject = ?1 OR email = ?2) AND erasure_requested_at IS NULL
             ORDER BY linkedin_subject IS NULL
             LIMIT 1",
        )
        .bind(&[subject.into(), email.as_str().into()])?
        .first::<ExistingRow>(None)
        .await?;

    if let Some(found) = existing {
        database
            .prepare(
                "UPDATE users SET linkedin_subject = ?1, avatar_url = ?2, updated_at = ?3
                 WHERE id = ?4",
            )
            .bind(&[
                subject.into(),
                avatar_url.into(),
                observed_at.as_str().into(),
                found.id.as_str().into(),
            ])?
            .run()
            .await?;
        return Ok(LinkedIdentity {
            user_id: found.id,
            email: found.email,
            display_name: found.display_name,
            subscription_tier: found.subscription_tier,
            issued_api_key: None,
        });
    }

    // First sign-in: mint an API key so the account has a credential for the
    // API surface. It is returned once and stored only as a hash.
    let api_key = format!(
        "ji_{}{}",
        stable_hash_hex(&format!("{provider}|{subject}|{observed_at}")),
        stable_hash_hex(&format!("{email}|{observed_at}|key"))
    );
    let principal_id = identifier("principal", &format!("{provider}|{subject}"));
    let user_id = identifier("user", &email);
    let name = if display_name.trim().is_empty() {
        email.clone()
    } else {
        display_name.trim().chars().take(MAX_NAME).collect()
    };

    database
        .prepare(
            "INSERT INTO principals (id, name, api_key_hash, role, status, search_quota, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'member', 'active', 20, ?4, ?4)
             ON CONFLICT(id) DO NOTHING",
        )
        .bind(&[
            principal_id.as_str().into(),
            name.as_str().into(),
            crate::auth::sha256_hex(&api_key).as_str().into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;
    database
        .prepare(
            "INSERT INTO users (id, principal_id, email, display_name, subscription_tier,
                                linkedin_subject, avatar_url, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'free', ?5, ?6, ?7, ?7)
             ON CONFLICT(email) DO NOTHING",
        )
        .bind(&[
            user_id.as_str().into(),
            principal_id.as_str().into(),
            email.as_str().into(),
            name.as_str().into(),
            subject.into(),
            avatar_url.into(),
            observed_at.as_str().into(),
        ])?
        .run()
        .await?;

    Ok(LinkedIdentity {
        user_id,
        email,
        display_name: name,
        subscription_tier: "free".to_string(),
        issued_api_key: Some(api_key),
    })
}
