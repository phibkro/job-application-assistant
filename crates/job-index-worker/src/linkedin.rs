//! Sign in with LinkedIn (OpenID Connect).
//!
//! Scope is deliberately narrow — `openid profile email` is what LinkedIn's
//! self-serve product grants, and it carries identity only. Work history is
//! not obtainable here, so an account created this way still has an empty CV
//! until the person fills it in.
//!
//! This is an identity integration, not a jobs integration. There is no public
//! LinkedIn jobs API: job data sits behind Talent Solutions partner programmes
//! that are closed to new applicants, and the source catalogue records the
//! platform as prohibited for automated submission. Nothing here reads or
//! submits to LinkedIn on a member's behalf.
//!
//! The authorisation-code exchange is authenticated with the client secret
//! over TLS, and the profile is then read from LinkedIn's userinfo endpoint.
//! Trust therefore comes from that exchange rather than from parsing an
//! unverified token in the Worker.

use serde::{Deserialize, Serialize};
use worker::wasm_bindgen::{JsCast, JsValue};
use worker::{
    D1Database, Error, Fetch, Headers, Method, Request, RequestInit, Response, Result, RouteContext,
};

const AUTHORIZE_URL: &str = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL: &str = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL: &str = "https://api.linkedin.com/v2/userinfo";
const SCOPE: &str = "openid profile email";
const STATE_TTL_MS: i64 = 10 * 60 * 1000;

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// LinkedIn's userinfo claims. Only identity is present by design.
#[derive(Debug, Deserialize)]
struct UserInfo {
    sub: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    picture: String,
}

#[derive(Debug, Serialize)]
struct LinkedResponse {
    data: LinkedAccount,
}

#[derive(Debug, Serialize)]
struct LinkedAccount {
    user_id: String,
    email: String,
    display_name: String,
    subscription_tier: String,
    /// Issued once, on first link. The service stores only its hash, so a lost
    /// key is re-issued by linking again rather than recovered.
    api_key: Option<String>,
    profile_hint: &'static str,
}

fn now_ms() -> i64 {
    worker::Date::now().as_millis() as i64
}

fn configured(context: &RouteContext<()>) -> Option<(String, String, String)> {
    let client_id = context.env.secret("LINKEDIN_CLIENT_ID").ok()?.to_string();
    let client_secret = context
        .env
        .secret("LINKEDIN_CLIENT_SECRET")
        .ok()?
        .to_string();
    let redirect_uri = context
        .env
        .var("LINKEDIN_REDIRECT_URI")
        .ok()
        .map(|value| value.to_string())?;
    (!client_id.is_empty() && !client_secret.is_empty() && !redirect_uri.is_empty()).then_some((
        client_id,
        client_secret,
        redirect_uri,
    ))
}

/// `GET /api/v1/auth/linkedin/start` — begin the authorisation code flow.
pub async fn start(request: Request, context: RouteContext<()>) -> Result<Response> {
    let Some((client_id, _secret, redirect_uri)) = configured(&context) else {
        return crate::auth::api_error(
            &request,
            "linkedin_not_configured",
            "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and LINKEDIN_REDIRECT_URI are not set in this environment",
            503,
        );
    };

    let database = context.env.d1("DB")?;
    let observed_at = now_ms();
    // Unpredictable state, held server-side, so a callback proves it belongs
    // to a flow this service started. Deriving it from the clock would make it
    // guessable, which is the whole attack this parameter exists to stop.
    let state = format!("state_{}", random_token()?);
    database
        .prepare(
            "INSERT INTO oauth_states (state, provider, created_at) VALUES (?1, 'linkedin', ?2)",
        )
        .bind(&[
            state.as_str().into(),
            worker::wasm_bindgen::JsValue::from_f64(observed_at as f64),
        ])?
        .run()
        .await?;

    let authorize = format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={}&redirect_uri={}&state={}&scope={}",
        urlencode(&client_id),
        urlencode(&redirect_uri),
        urlencode(&state),
        urlencode(SCOPE)
    );
    Response::redirect(authorize.parse()?)
}

/// `GET /api/v1/auth/linkedin/callback` — exchange the code and link the account.
pub async fn callback(request: Request, context: RouteContext<()>) -> Result<Response> {
    let Some((client_id, client_secret, redirect_uri)) = configured(&context) else {
        return crate::auth::api_error(
            &request,
            "linkedin_not_configured",
            "this environment has no LinkedIn credentials",
            503,
        );
    };
    let url = request.url()?;
    let mut code = String::new();
    let mut state = String::new();
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = value.to_string(),
            "state" => state = value.to_string(),
            "error_description" => {
                return crate::auth::api_error(&request, "linkedin_denied", &value, 400);
            }
            _ => {}
        }
    }
    if code.is_empty() || state.is_empty() {
        return crate::auth::api_error(
            &request,
            "invalid_callback",
            "code and state required",
            400,
        );
    }

    let database = context.env.d1("DB")?;
    if !consume_state(&database, &state).await? {
        return crate::auth::api_error(
            &request,
            "invalid_state",
            "this authorisation state is unknown, already used, or expired",
            400,
        );
    }

    let token = exchange_code(&code, &client_id, &client_secret, &redirect_uri).await?;
    let info = fetch_userinfo(&token.access_token).await?;
    if info.email.trim().is_empty() {
        return crate::auth::api_error(
            &request,
            "email_required",
            "LinkedIn returned no email address for this member",
            400,
        );
    }

    let linked = crate::application::link_external_identity(
        &database,
        "linkedin",
        &info.sub,
        &info.email,
        &info.name,
        &info.picture,
    )
    .await?;

    Response::from_json(&LinkedResponse {
        data: LinkedAccount {
            user_id: linked.user_id,
            email: linked.email,
            display_name: linked.display_name,
            subscription_tier: linked.subscription_tier,
            api_key: linked.issued_api_key,
            // Said plainly, because a member reasonably expects their LinkedIn
            // history to arrive with the sign-in.
            profile_hint: "LinkedIn's self-serve sign-in provides identity only; add your experience to draft a CV",
        },
    })
}

async fn consume_state(database: &D1Database, state: &str) -> Result<bool> {
    #[derive(Deserialize)]
    struct StateRow {
        created_at: i64,
        consumed_at: Option<i64>,
    }
    let row = worker::query!(
        database,
        "SELECT created_at, consumed_at FROM oauth_states WHERE state = ?1",
        state
    )?
    .first::<StateRow>(None)
    .await?;
    let Some(row) = row else {
        return Ok(false);
    };
    if row.consumed_at.is_some() || now_ms().saturating_sub(row.created_at) > STATE_TTL_MS {
        return Ok(false);
    }
    database
        .prepare("UPDATE oauth_states SET consumed_at = ?1 WHERE state = ?2")
        .bind(&[
            worker::wasm_bindgen::JsValue::from_f64(now_ms() as f64),
            state.into(),
        ])?
        .run()
        .await?;
    Ok(true)
}

async fn exchange_code(
    code: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
) -> Result<TokenResponse> {
    let body = format!(
        "grant_type=authorization_code&code={}&client_id={}&client_secret={}&redirect_uri={}",
        urlencode(code),
        urlencode(client_id),
        urlencode(client_secret),
        urlencode(redirect_uri)
    );
    let headers = Headers::new();
    headers.set("content-type", "application/x-www-form-urlencoded")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(body.into()));
    let request = Request::new_with_init(TOKEN_URL, &init)?;
    let mut response = Fetch::Request(request).send().await?;
    if response.status_code() != 200 {
        return Err(worker::Error::RustError(format!(
            "linkedin token exchange failed with status {}",
            response.status_code()
        )));
    }
    response.json::<TokenResponse>().await
}

async fn fetch_userinfo(access_token: &str) -> Result<UserInfo> {
    let headers = Headers::new();
    headers.set("authorization", &format!("Bearer {access_token}"))?;
    headers.set("accept", "application/json")?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(USERINFO_URL, &init)?;
    let mut response = Fetch::Request(request).send().await?;
    if response.status_code() != 200 {
        return Err(worker::Error::RustError(format!(
            "linkedin userinfo failed with status {}",
            response.status_code()
        )));
    }
    response.json::<UserInfo>().await
}

/// A cryptographically random token from the runtime.
///
/// There is no fallback on purpose: a predictable state is worse than a failed
/// sign-in, because it fails silently and only in the presence of an attacker.
fn random_token() -> Result<String> {
    let global = js_sys::global();
    let crypto = js_sys::Reflect::get(&global, &JsValue::from_str("crypto"))
        .map_err(|_| Error::RustError("crypto global is unavailable".to_string()))?;
    let function = js_sys::Reflect::get(&crypto, &JsValue::from_str("randomUUID"))
        .map_err(|_| Error::RustError("crypto.randomUUID is unavailable".to_string()))?
        .dyn_into::<js_sys::Function>()
        .map_err(|_| Error::RustError("crypto.randomUUID is not callable".to_string()))?;
    function
        .call0(&crypto)
        .map_err(|_| Error::RustError("crypto.randomUUID failed".to_string()))?
        .as_string()
        .ok_or_else(|| Error::RustError("crypto.randomUUID returned a non-string".to_string()))
}

fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::urlencode;

    #[test]
    fn encodes_everything_a_redirect_uri_can_contain() {
        assert_eq!(
            urlencode("openid profile email"),
            "openid%20profile%20email"
        );
        assert_eq!(
            urlencode("https://example.no/cb?a=b&c=d"),
            "https%3A%2F%2Fexample.no%2Fcb%3Fa%3Db%26c%3Dd"
        );
        // An unencoded ampersand or equals would let a crafted value inject an
        // extra parameter into the authorisation request.
        assert!(!urlencode("a&b=c").contains('&'));
        assert!(!urlencode("a&b=c").contains('='));
    }
}
