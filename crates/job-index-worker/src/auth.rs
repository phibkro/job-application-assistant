use job_index_core::stable_hash_hex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use worker::{D1Database, Error, Request, Response, Result, RouteContext};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Principal {
    pub id: String,
    pub name: String,
    pub role: String,
    pub search_quota: i64,
}

impl Principal {
    pub fn can_mutate(&self) -> bool {
        self.role == "member"
    }
}

#[derive(Debug, Deserialize)]
struct PrincipalRow {
    id: String,
    name: String,
    role: String,
    search_quota: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePrincipalRequest {
    pub name: String,
    pub api_key: String,
    #[serde(default = "default_role")]
    pub role: String,
    #[serde(default = "default_search_quota")]
    pub search_quota: i64,
}

#[derive(Debug, Serialize)]
struct PrincipalCreatedResponse {
    data: Principal,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorDetail {
    pub code: String,
    pub message: String,
    pub request_id: String,
}

fn default_role() -> String {
    "member".to_string()
}

const fn default_search_quota() -> i64 {
    20
}

pub(crate) fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let bytes = bytes.as_ref();
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

pub fn sha256_hex(value: &str) -> String {
    hex_encode(Sha256::digest(value.as_bytes()))
}

pub fn request_id(request: &Request) -> String {
    for header in ["x-request-id", "cf-ray"] {
        if let Ok(Some(value)) = request.headers().get(header) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    let path = request
        .url()
        .map(|url| url.path().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    format!(
        "req_{}",
        stable_hash_hex(&format!("{path}|{:.0}", js_sys::Date::now()))
    )
}

pub fn api_error(request: &Request, code: &str, message: &str, status: u16) -> Result<Response> {
    let id = request_id(request);
    let mut response = Response::from_json(&ApiErrorBody {
        error: ApiErrorDetail {
            code: code.to_string(),
            message: message.to_string(),
            request_id: id.clone(),
        },
    })?
    .with_status(status);
    response.headers_mut().set("x-request-id", &id)?;
    Ok(response)
}

pub async fn principal_from_request(
    request: &Request,
    database: &D1Database,
) -> Result<Option<Principal>> {
    let supplied = request
        .headers()
        .get("x-api-key")?
        .or_else(|| {
            request
                .headers()
                .get("authorization")
                .ok()
                .flatten()
                .and_then(|value| value.strip_prefix("ApiKey ").map(str::to_string))
        })
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(api_key) = supplied else {
        return Ok(None);
    };
    let hash = sha256_hex(&api_key);
    let row = worker::query!(
        database,
        "SELECT id, name, role, search_quota
         FROM principals
         WHERE api_key_hash = ?1 AND status = 'active'",
        &hash
    )?
    .first::<PrincipalRow>(None)
    .await?;
    Ok(row.map(|value| Principal {
        id: value.id,
        name: value.name,
        role: value.role,
        search_quota: value.search_quota,
    }))
}

#[allow(clippy::too_many_arguments)]
pub async fn audit(
    database: &D1Database,
    request: &Request,
    actor_type: &str,
    actor_id: Option<&str>,
    action: &str,
    resource_type: &str,
    resource_id: Option<&str>,
    metadata_json: &str,
) -> Result<()> {
    worker::query!(
        database,
        "INSERT INTO admin_audit_log
         (request_id, actor_type, actor_id, action, resource_type, resource_id,
          metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        request_id(request),
        actor_type,
        actor_id,
        action,
        resource_type,
        resource_id,
        metadata_json,
        format!("{:.0}", js_sys::Date::now())
    )?
    .run()
    .await?;
    Ok(())
}

pub async fn create_principal(mut request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let payload = match request.json::<CreatePrincipalRequest>().await {
        Ok(value) => value,
        Err(_) => return api_error(&request, "invalid_json", "invalid JSON request body", 400),
    };
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 120 || !(32..=512).contains(&payload.api_key.len()) {
        return api_error(
            &request,
            "invalid_principal",
            "name must be 1..120 characters and api_key must be 32..512 characters",
            400,
        );
    }
    if !matches!(payload.role.as_str(), "reader" | "member") {
        return api_error(&request, "invalid_role", "unsupported principal role", 400);
    }
    if !(1..=1000).contains(&payload.search_quota) {
        return api_error(
            &request,
            "invalid_quota",
            "search_quota must be 1..1000",
            400,
        );
    }
    let database = context.env.d1("DB")?;
    let hash = sha256_hex(&payload.api_key);
    let normalized_name = name.to_lowercase();
    let id = format!("principal_{}", stable_hash_hex(&normalized_name));
    let now = format!("{:.0}", js_sys::Date::now());
    worker::query!(
        &database,
        "INSERT INTO principals
         (id, name, api_key_hash, role, status, search_quota, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           api_key_hash = excluded.api_key_hash,
           role = excluded.role,
           status = 'active',
           search_quota = excluded.search_quota,
           updated_at = excluded.updated_at",
        &id,
        name,
        &hash,
        &payload.role,
        payload.search_quota,
        &now
    )?
    .run()
    .await?;
    audit(
        &database,
        &request,
        "admin",
        None,
        "principal.upsert",
        "principal",
        Some(&id),
        "{}",
    )
    .await?;
    Ok(Response::from_json(&PrincipalCreatedResponse {
        data: Principal {
            id,
            name: name.to_string(),
            role: payload.role,
            search_quota: payload.search_quota,
        },
    })?
    .with_status(201))
}

#[cfg(test)]
mod tests {
    use super::{Principal, sha256_hex};

    #[test]
    fn sha256_is_stable() {
        assert_eq!(
            sha256_hex("job-index"),
            "d6793fa329f43f3f66783f9339388ae7c224ae440faf9e00074aefbcbb52502d"
        );
    }

    #[test]
    fn only_member_role_can_mutate() {
        for (role, expected) in [("reader", false), ("member", true), ("admin", false)] {
            let principal = Principal {
                id: "principal".to_string(),
                name: "Principal".to_string(),
                role: role.to_string(),
                search_quota: 20,
            };
            assert_eq!(principal.can_mutate(), expected);
        }
    }
}

#[derive(Debug, Deserialize)]
struct PrincipalListRow {
    id: String,
    name: String,
    role: String,
    status: String,
    search_quota: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct PrincipalAdminView {
    id: String,
    name: String,
    role: String,
    status: String,
    search_quota: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct PrincipalListResponse {
    data: Vec<PrincipalAdminView>,
}

#[derive(Debug, Deserialize, Serialize)]
struct AuditRow {
    id: i64,
    request_id: String,
    actor_type: String,
    actor_id: Option<String>,
    action: String,
    resource_type: String,
    resource_id: Option<String>,
    metadata_json: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct AuditListResponse {
    data: Vec<AuditRow>,
}

pub async fn list_principals(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let data = database
        .prepare(
            "SELECT id, name, role, status, search_quota, created_at, updated_at
             FROM principals ORDER BY created_at, id LIMIT 200",
        )
        .all()
        .await?
        .results::<PrincipalListRow>()?
        .into_iter()
        .map(|row| PrincipalAdminView {
            id: row.id,
            name: row.name,
            role: row.role,
            status: row.status,
            search_quota: row.search_quota,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();
    Response::from_json(&PrincipalListResponse { data })
}

pub async fn revoke_principal(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let id = context
        .param("id")
        .cloned()
        .ok_or_else(|| Error::RustError("missing principal id".to_string()))?;
    let database = context.env.d1("DB")?;
    let now = format!("{:.0}", js_sys::Date::now());
    let exists = worker::query!(
        &database,
        "SELECT id, name, role, search_quota FROM principals WHERE id = ?1",
        &id
    )?
    .first::<PrincipalRow>(None)
    .await?
    .is_some();
    if !exists {
        return api_error(&request, "not_found", "principal not found", 404);
    }
    database
        .batch(vec![
            worker::query!(
                &database,
                "UPDATE principals SET status = 'revoked', updated_at = ?1 WHERE id = ?2",
                &now,
                &id
            )?,
            worker::query!(
                &database,
                "UPDATE webhook_subscriptions SET active = 0, updated_at = ?1
                 WHERE principal_id = ?2",
                &now,
                &id
            )?,
            worker::query!(
                &database,
                "UPDATE notification_outbox
                 SET status = 'dead', last_error = 'principal revoked'
                 WHERE status IN ('pending','delivering')
                   AND subscription_id IN (
                     SELECT id FROM webhook_subscriptions WHERE principal_id = ?1
                   )",
                &id
            )?,
        ])
        .await?;
    audit(
        &database,
        &request,
        "admin",
        None,
        "principal.revoke",
        "principal",
        Some(&id),
        "{}",
    )
    .await?;
    Response::from_json(&serde_json::json!({"id": id, "status": "revoked"}))
}

pub async fn list_audit(request: Request, context: RouteContext<()>) -> Result<Response> {
    if !crate::api::admin_allowed(&request, &context)? {
        return api_error(
            &request,
            "forbidden",
            "administrator authorization required",
            403,
        );
    }
    let database = context.env.d1("DB")?;
    let data = database
        .prepare(
            "SELECT id, request_id, actor_type, actor_id, action, resource_type,
                    resource_id, metadata_json, created_at
             FROM admin_audit_log ORDER BY id DESC LIMIT 200",
        )
        .all()
        .await?
        .results::<AuditRow>()?;
    Response::from_json(&AuditListResponse { data })
}
