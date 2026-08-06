#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};

pub const NAV_SOURCE_ID: &str = "nav";
pub const NAV_SOURCE_NAME: &str = "Arbeidsplassen (NAV)";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawListing {
    pub source_id: String,
    pub source_name: String,
    pub external_id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub description: String,
    pub application_url: String,
    pub published_at: String,
    pub deadline: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedListing {
    pub occurrence_id: String,
    pub canonical_job_id: String,
    pub canonical_key: String,
    pub content_fingerprint: String,
    pub source_id: String,
    pub source_name: String,
    pub external_id: String,
    pub title: String,
    pub employer_name: String,
    pub location: String,
    pub description: String,
    pub application_url: String,
    pub published_at: String,
    pub deadline: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NormalizeError {
    MissingField(&'static str),
}

impl Display for NormalizeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingField(field) => write!(formatter, "required field is empty: {field}"),
        }
    }
}

impl Error for NormalizeError {}

pub fn normalize(raw: RawListing) -> Result<NormalizedListing, NormalizeError> {
    let source_id = required("source_id", &raw.source_id)?;
    let source_name = required("source_name", &raw.source_name)?;
    let external_id = required("external_id", &raw.external_id)?;
    let title = required("title", &raw.title)?;
    let employer_name = required("employer_name", &raw.employer_name)?;
    let location = required("location", &raw.location)?;
    let description = required("description", &raw.description)?;
    let application_url = required("application_url", &raw.application_url)?;
    let published_at = required("published_at", &raw.published_at)?;

    let canonical_url = canonicalize_url(&application_url);
    let canonical_key = if canonical_url.is_empty() {
        format!(
            "job|{}|{}|{}",
            identity_text(&employer_name),
            identity_text(&title),
            identity_text(&location)
        )
    } else {
        format!("url|{canonical_url}")
    };

    let occurrence_key = format!("{source_id}|{external_id}");
    let fingerprint_input = format!(
        "{}|{}|{}|{}|{}|{}|{}",
        identity_text(&title),
        identity_text(&employer_name),
        identity_text(&location),
        identity_text(&description),
        canonical_url,
        published_at,
        raw.deadline.as_deref().unwrap_or_default()
    );

    Ok(NormalizedListing {
        occurrence_id: format!("occ_{}", stable_hash_hex(&occurrence_key)),
        canonical_job_id: format!("job_{}", stable_hash_hex(&canonical_key)),
        canonical_key,
        content_fingerprint: stable_hash_hex(&fingerprint_input),
        source_id,
        source_name,
        external_id,
        title,
        employer_name,
        location,
        description,
        application_url: canonical_url,
        published_at,
        deadline: raw.deadline.map(|value| collapse_whitespace(&value)),
    })
}

pub fn occurrence_id(source_id: &str, external_id: &str) -> String {
    format!(
        "occ_{}",
        stable_hash_hex(&format!("{source_id}|{external_id}"))
    )
}

pub fn canonicalize_url(value: &str) -> String {
    let without_fragment = value.trim().split('#').next().unwrap_or_default();
    let Some((base, query)) = without_fragment.split_once('?') else {
        return without_fragment.trim_end_matches('/').to_string();
    };

    let mut retained = query
        .split('&')
        .filter_map(|pair| {
            let key = pair
                .split_once('=')
                .map_or(pair, |(key, _value)| key)
                .trim()
                .to_ascii_lowercase();
            let tracking = key.starts_with("utm_")
                || matches!(
                    key.as_str(),
                    "source" | "ref" | "referrer" | "tracking" | "tracking_id"
                );
            (!tracking && !pair.trim().is_empty()).then_some(pair.trim().to_string())
        })
        .collect::<Vec<_>>();
    retained.sort();

    let base = base.trim_end_matches('/');
    if retained.is_empty() {
        base.to_string()
    } else {
        format!("{base}?{}", retained.join("&"))
    }
}

pub fn stable_hash_hex(value: &str) -> String {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;

    let mut hash = OFFSET;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    format!("{hash:016x}")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedSearchDefinition {
    #[serde(default)]
    pub locations: Vec<String>,
    #[serde(default)]
    pub include_terms: Vec<String>,
    #[serde(default)]
    pub exclude_terms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NormalizedSearchDefinition {
    pub locations: Vec<String>,
    pub include_terms: Vec<String>,
    pub exclude_terms: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct SearchableJob<'a> {
    pub title: &'a str,
    pub employer_name: &'a str,
    pub location: &'a str,
    pub description: &'a str,
    pub status: &'a str,
}

impl SavedSearchDefinition {
    #[must_use]
    pub fn normalize(&self) -> NormalizedSearchDefinition {
        NormalizedSearchDefinition {
            locations: normalize_terms(&self.locations),
            include_terms: normalize_terms(&self.include_terms),
            exclude_terms: normalize_terms(&self.exclude_terms),
        }
    }
}

impl NormalizedSearchDefinition {
    #[must_use]
    pub fn signature(&self) -> String {
        let canonical = format!(
            "locations:{}|include:{}|exclude:{}",
            self.locations.join("\u{1f}"),
            self.include_terms.join("\u{1f}"),
            self.exclude_terms.join("\u{1f}")
        );
        format!("query_{}", stable_hash_hex(&canonical))
    }

    #[must_use]
    pub fn matches(&self, job: SearchableJob<'_>) -> bool {
        if job.status != "active" {
            return false;
        }

        let location = identity_text(job.location);
        if !self.locations.is_empty()
            && !self
                .locations
                .iter()
                .any(|required| location.contains(required))
        {
            return false;
        }

        let searchable = identity_text(&format!(
            "{} {} {} {}",
            job.title, job.employer_name, job.location, job.description
        ));

        if self
            .exclude_terms
            .iter()
            .any(|excluded| searchable.contains(excluded))
        {
            return false;
        }

        self.include_terms.is_empty()
            || self
                .include_terms
                .iter()
                .any(|included| searchable.contains(included))
    }
}

fn normalize_terms(values: &[String]) -> Vec<String> {
    let mut values = values
        .iter()
        .map(|value| identity_text(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

pub mod nav {
    use super::{NAV_SOURCE_ID, NAV_SOURCE_NAME, RawListing};
    use serde::Deserialize;
    use serde_json::Value;
    use std::error::Error;
    use std::fmt::{Display, Formatter};

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct FeedPage {
        pub feed_url: String,
        pub next_url: Option<String>,
        pub items: Vec<FeedItem>,
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct FeedItem {
        pub external_id: String,
        pub detail_url: String,
        pub active: bool,
        pub title: Option<String>,
        pub employer_name: Option<String>,
        pub municipal: Option<String>,
        pub modified_at: String,
        pub content_text: Option<String>,
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum ParseError {
        InvalidJson(String),
        MissingField(&'static str),
        InactiveDetail,
    }

    impl Display for ParseError {
        fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
            match self {
                Self::InvalidJson(message) => write!(formatter, "invalid NAV JSON: {message}"),
                Self::MissingField(field) => write!(formatter, "NAV response is missing {field}"),
                Self::InactiveDetail => {
                    write!(formatter, "inactive NAV entry has no active detail")
                }
            }
        }
    }

    impl Error for ParseError {}

    #[derive(Debug, Deserialize)]
    struct FeedPageDto {
        #[serde(default)]
        feed_url: String,
        #[serde(default)]
        next_url: Option<String>,
        #[serde(default)]
        items: Vec<FeedItemDto>,
    }

    #[derive(Debug, Deserialize)]
    struct FeedItemDto {
        #[serde(default)]
        url: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        content_text: Option<String>,
        #[serde(default)]
        date_modified: String,
        #[serde(rename = "_feed_entry")]
        feed_entry: FeedEntrySummaryDto,
    }

    #[derive(Debug, Deserialize)]
    struct FeedEntrySummaryDto {
        uuid: String,
        status: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(rename = "businessName", default)]
        business_name: Option<String>,
        #[serde(default)]
        municipal: Option<String>,
        #[serde(rename = "sistEndret", default)]
        modified_at: String,
    }

    /// A NAV feed-entry detail response.
    ///
    /// The identity and lifecycle fields sit at the top level and the advert
    /// itself is nested under `ad_content`, which is the shape the live feed
    /// serves. Do not reintroduce a fallback that parses this from an inner
    /// object: an envelope mismatch has to fail loudly, because the summary
    /// fallback that catches the error is indistinguishable from healthy
    /// ingestion in every counter the run reports.
    #[derive(Debug, Deserialize)]
    struct DetailDto {
        uuid: String,
        status: String,
        #[serde(rename = "ad_content", default)]
        ad_content: Option<DetailContentDto>,
    }

    #[derive(Debug, Deserialize)]
    struct DetailContentDto {
        #[serde(default, deserialize_with = "nullable_string")]
        published: String,
        #[serde(default, deserialize_with = "nullable_string")]
        expires: String,
        #[serde(default, deserialize_with = "nullable_string")]
        updated: String,
        #[serde(rename = "workLocations", default)]
        work_locations: Vec<WorkLocationDto>,
        #[serde(default, deserialize_with = "nullable_string")]
        title: String,
        #[serde(default, deserialize_with = "nullable_string")]
        description: String,
        #[serde(default, deserialize_with = "nullable_string")]
        sourceurl: String,
        #[serde(default, deserialize_with = "nullable_string")]
        application_url: String,
        #[serde(
            rename = "applicationUrl",
            default,
            deserialize_with = "nullable_string"
        )]
        application_url_camel: String,
        #[serde(
            rename = "applicationDue",
            default,
            deserialize_with = "nullable_string"
        )]
        application_due: String,
        #[serde(default, deserialize_with = "nullable_string")]
        jobtitle: String,
        #[serde(default, deserialize_with = "nullable_string")]
        link: String,
        #[serde(default)]
        employer: EmployerDto,
    }

    #[derive(Debug, Default, Deserialize)]
    struct EmployerDto {
        #[serde(default, deserialize_with = "nullable_string")]
        name: String,
    }

    #[derive(Debug, Deserialize)]
    struct WorkLocationDto {
        #[serde(default, deserialize_with = "nullable_string")]
        city: String,
        #[serde(default, deserialize_with = "nullable_string")]
        county: String,
        #[serde(default, deserialize_with = "nullable_string")]
        municipal: String,
    }

    /// Treats an explicit `null` exactly like an absent key.
    ///
    /// `#[serde(default)]` alone only covers absence, and the live feed sends
    /// both: a recorded entry had `city`, `address`, and `postalCode` set to
    /// null. Without this the whole detail fails to parse and every vacancy
    /// silently degrades to summary data.
    fn nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
    }

    pub fn parse_feed_page(text: &str) -> Result<FeedPage, ParseError> {
        let dto: FeedPageDto = serde_json::from_str(text)
            .map_err(|error| ParseError::InvalidJson(error.to_string()))?;

        let items = dto
            .items
            .into_iter()
            .map(|item| {
                let modified_at =
                    first_non_empty([item.date_modified, item.feed_entry.modified_at])
                        .ok_or(ParseError::MissingField("feed item modified timestamp"))?;
                Ok(FeedItem {
                    external_id: non_empty(item.feed_entry.uuid)
                        .ok_or(ParseError::MissingField("_feed_entry.uuid"))?,
                    detail_url: item.url,
                    active: item.feed_entry.status.eq_ignore_ascii_case("ACTIVE"),
                    title: item.feed_entry.title.or(item.title).and_then(non_empty),
                    employer_name: item.feed_entry.business_name.and_then(non_empty),
                    municipal: item.feed_entry.municipal.and_then(non_empty),
                    modified_at,
                    content_text: item.content_text.and_then(non_empty),
                })
            })
            .collect::<Result<Vec<_>, ParseError>>()?;

        Ok(FeedPage {
            feed_url: if dto.feed_url.trim().is_empty() {
                "/api/v1/feed".to_string()
            } else {
                dto.feed_url
            },
            next_url: dto.next_url.and_then(non_empty),
            items,
        })
    }

    pub fn active_summary_listing(summary: &FeedItem) -> Result<RawListing, ParseError> {
        if !summary.active {
            return Err(ParseError::InactiveDetail);
        }
        let title = summary
            .title
            .clone()
            .ok_or(ParseError::MissingField("feed item title"))?;
        let employer_name = summary
            .employer_name
            .clone()
            .unwrap_or_else(|| "Unknown employer".to_string());
        let location = summary
            .municipal
            .clone()
            .unwrap_or_else(|| "Norway".to_string());
        let description = summary
            .content_text
            .clone()
            .unwrap_or_else(|| "See source listing for details.".to_string());

        Ok(RawListing {
            source_id: NAV_SOURCE_ID.to_string(),
            source_name: NAV_SOURCE_NAME.to_string(),
            external_id: summary.external_id.clone(),
            title,
            employer_name,
            location,
            description,
            application_url: format!(
                "https://arbeidsplassen.nav.no/stillinger/stilling/{}",
                summary.external_id
            ),
            published_at: summary.modified_at.clone(),
            deadline: None,
        })
    }

    pub fn parse_active_detail(text: &str, summary: &FeedItem) -> Result<RawListing, ParseError> {
        let value: Value = serde_json::from_str(text)
            .map_err(|error| ParseError::InvalidJson(error.to_string()))?;
        let detail: DetailDto = serde_json::from_value(value)
            .map_err(|error| ParseError::InvalidJson(error.to_string()))?;

        if !detail.status.eq_ignore_ascii_case("ACTIVE") {
            return Err(ParseError::InactiveDetail);
        }

        let content = detail
            .ad_content
            .ok_or(ParseError::MissingField("detail.ad_content"))?;
        let title = first_non_empty([
            content.title,
            content.jobtitle,
            summary.title.clone().unwrap_or_default(),
        ])
        .ok_or(ParseError::MissingField("detail title"))?;
        let employer_name = first_non_empty([
            content.employer.name,
            summary.employer_name.clone().unwrap_or_default(),
            "Unknown employer".to_string(),
        ])
        .ok_or(ParseError::MissingField("employer name"))?;
        let location = content
            .work_locations
            .first()
            .map(format_location)
            .filter(|value| !value.is_empty())
            .or_else(|| summary.municipal.clone())
            .unwrap_or_else(|| "Norway".to_string());
        let description = first_non_empty([
            html_to_text(&content.description),
            summary.content_text.clone().unwrap_or_default(),
            "See source listing for details.".to_string(),
        ])
        .ok_or(ParseError::MissingField("description"))?;
        let application_url = first_non_empty([
            content.application_url_camel,
            content.application_url,
            content.link,
            content.sourceurl,
            format!(
                "https://arbeidsplassen.nav.no/stillinger/stilling/{}",
                detail.uuid
            ),
        ])
        .ok_or(ParseError::MissingField("application URL"))?;
        let published_at = first_non_empty([
            content.published,
            content.updated,
            summary.modified_at.clone(),
        ])
        .ok_or(ParseError::MissingField("published timestamp"))?;
        // NAV accepts free text here, and real adverts use it: "Snarest"
        // ("as soon as possible") is common. Only a calendar date may become a
        // deadline, otherwise the advert's expiry is the honest answer.
        let deadline = first_non_empty([
            iso_date_prefix(&content.application_due),
            iso_date_prefix(&content.expires),
        ]);

        Ok(RawListing {
            source_id: NAV_SOURCE_ID.to_string(),
            source_name: NAV_SOURCE_NAME.to_string(),
            external_id: detail.uuid,
            title,
            employer_name,
            location,
            description,
            application_url,
            published_at,
            deadline,
        })
    }

    /// Reduces a NAV advert body to plain text.
    ///
    /// Live adverts carry HTML. The demo UI escapes what it renders, so the
    /// markup is not an injection risk, but storing it means every consumer
    /// of the corpus — search terms, notifications, any future client —
    /// matches against tag names.
    fn html_to_text(input: &str) -> String {
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

        let text = text
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");

        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Returns the leading `YYYY-MM-DD` of a timestamp, or nothing when the
    /// value is not a calendar date at all.
    fn iso_date_prefix(value: &str) -> String {
        let value = value.trim();
        let candidate: String = value.chars().take(10).collect();
        let shaped = candidate.len() == 10
            && candidate
                .chars()
                .enumerate()
                .all(|(index, character)| match index {
                    4 | 7 => character == '-',
                    _ => character.is_ascii_digit(),
                });
        if shaped { candidate } else { String::new() }
    }

    fn format_location(location: &WorkLocationDto) -> String {
        let mut fields = Vec::new();
        for value in [&location.city, &location.municipal, &location.county] {
            let value = value.trim();
            if !value.is_empty() && !fields.contains(&value) {
                fields.push(value);
            }
        }
        fields.join(", ")
    }

    fn first_non_empty<const N: usize>(values: [String; N]) -> Option<String> {
        values.into_iter().find_map(non_empty)
    }

    fn non_empty(value: String) -> Option<String> {
        let value = value.trim().to_string();
        (!value.is_empty()).then_some(value)
    }
}

fn required(field: &'static str, value: &str) -> Result<String, NormalizeError> {
    let normalized = collapse_whitespace(value);
    if normalized.is_empty() {
        Err(NormalizeError::MissingField(field))
    } else {
        Ok(normalized)
    }
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn identity_text(value: &str) -> String {
    collapse_whitespace(value).to_ascii_lowercase()
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::{
        RawListing, SavedSearchDefinition, SearchableJob, canonicalize_url, nav, normalize,
        occurrence_id, stable_hash_hex,
    };

    const NAV_FEED_PAGE: &str = include_str!("../../../fixtures/nav/feed-page.json");
    const NAV_ACTIVE_DETAIL: &str = include_str!("../../../fixtures/nav/detail-active.json");
    /// Recorded from the live API by `scripts/capture-nav-fixture.sh`, so its
    /// shape is observed rather than chosen. Refresh it with that script.
    const NAV_LIVE_DETAIL: &str = include_str!("../../../fixtures/nav/live-detail.json");

    fn listing(source_id: &str, external_id: &str, url: &str) -> RawListing {
        RawListing {
            source_id: source_id.to_string(),
            source_name: source_id.to_string(),
            external_id: external_id.to_string(),
            title: " Technical   Support Specialist ".to_string(),
            employer_name: "Example AS".to_string(),
            location: "Oslo".to_string(),
            description: "Help customers use technical products.".to_string(),
            application_url: url.to_string(),
            published_at: "2026-08-05T08:00:00Z".to_string(),
            deadline: Some("2026-08-25".to_string()),
        }
    }

    #[test]
    fn removes_tracking_parameters_but_preserves_identity_parameters() {
        assert_eq!(
            canonicalize_url(
                "https://careers.example/jobs/100/?utm_source=board&department=support#apply"
            ),
            "https://careers.example/jobs/100?department=support"
        );
    }

    #[test]
    fn duplicate_sources_produce_one_canonical_identity() {
        let first = normalize(listing(
            "source-a",
            "a-100",
            "https://careers.example/jobs/100?utm_source=a",
        ))
        .expect("fixture should normalize");
        let second = normalize(listing(
            "source-b",
            "b-900",
            "https://careers.example/jobs/100?utm_source=b",
        ))
        .expect("fixture should normalize");

        assert_eq!(first.canonical_job_id, second.canonical_job_id);
        assert_ne!(first.occurrence_id, second.occurrence_id);
    }

    #[test]
    fn normalization_collapses_display_whitespace() {
        let normalized = normalize(listing(
            "source-a",
            "a-100",
            "https://careers.example/jobs/100",
        ))
        .expect("fixture should normalize");

        assert_eq!(normalized.title, "Technical Support Specialist");
    }

    #[test]
    fn stable_hash_is_deterministic() {
        assert_eq!(stable_hash_hex("job"), stable_hash_hex("job"));
        assert_ne!(stable_hash_hex("job"), stable_hash_hex("jobs"));
        assert_eq!(occurrence_id("nav", "abc"), occurrence_id("nav", "abc"));
    }

    #[test]
    fn nav_feed_parser_preserves_vacancy_identity_and_activity() {
        let page = nav::parse_feed_page(NAV_FEED_PAGE).expect("feed fixture should parse");

        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].external_id, "active-vacancy-1");
        assert!(page.items[0].active);
        assert_eq!(page.items[1].external_id, "inactive-vacancy-2");
        assert!(!page.items[1].active);
        assert_eq!(page.next_url.as_deref(), Some("/api/v1/feed/page-2"));
    }

    #[test]
    fn nav_detail_parser_maps_active_vacancy_to_raw_listing() {
        let page = nav::parse_feed_page(NAV_FEED_PAGE).expect("feed fixture should parse");
        let listing = nav::parse_active_detail(NAV_ACTIVE_DETAIL, &page.items[0])
            .expect("detail fixture should parse");

        assert_eq!(listing.external_id, "active-vacancy-1");
        assert_eq!(listing.title, "Technical Support Specialist");
        assert_eq!(listing.employer_name, "Example Technology AS");
        assert_eq!(listing.location, "Oslo");
        assert_eq!(listing.deadline.as_deref(), Some("2026-08-25"));
        // The advert body arrives as HTML and must reach the corpus as text.
        assert_eq!(
            listing.description,
            "Help customers use technical products."
        );
    }

    /// The crafted fixtures assert journey behaviour, which needs controlled
    /// content. This one asserts that the parser still fits what NAV actually
    /// serves, which is the failure the crafted fixtures could not see: every
    /// live detail fetch fell back to the summary while they stayed green.
    ///
    /// The assertions deliberately avoid the advert's wording, which changes
    /// with each capture, and check that real content arrived at all.
    #[test]
    fn nav_detail_parser_fits_a_recorded_live_payload() {
        let page = nav::parse_feed_page(NAV_FEED_PAGE).expect("feed fixture should parse");
        let listing = nav::parse_active_detail(NAV_LIVE_DETAIL, &page.items[0])
            .expect("the recorded live payload must parse; re-run scripts/capture-nav-fixture.sh");

        assert!(!listing.title.trim().is_empty(), "title should be present");
        assert!(
            !listing.employer_name.trim().is_empty() && listing.employer_name != "Unknown employer",
            "employer should come from the advert, got {:?}",
            listing.employer_name
        );
        assert!(
            listing.description.len() > 40
                && listing.description != "See source listing for details.",
            "description should be the advert body, got {:?}",
            listing.description
        );
        assert!(
            !listing.description.contains('<'),
            "description should be plain text, got {:?}",
            listing.description
        );
        // Not every advert carries its own application URL — one registered
        // through NAV directly applies via the NAV page — so only the presence
        // of an absolute URL holds for an arbitrary capture.
        assert!(
            listing.application_url.starts_with("https://"),
            "application URL should be absolute, got {:?}",
            listing.application_url
        );
        assert!(
            listing.published_at.starts_with("20"),
            "published timestamp should come from the advert, got {:?}",
            listing.published_at
        );
    }

    /// The envelope the live feed serves. Parsing this from the inner object
    /// instead loses every detail field, and the summary fallback hides that:
    /// ingestion still reports success while the corpus fills with
    /// placeholders. Fail loudly instead.
    #[test]
    fn nav_detail_rejects_a_payload_without_the_outer_envelope() {
        let page = nav::parse_feed_page(NAV_FEED_PAGE).expect("feed fixture should parse");
        let inner_only = r#"{"description":"Body","jobtitle":"Title"}"#;

        let error = nav::parse_active_detail(inner_only, &page.items[0])
            .expect_err("a detail payload without uuid/status must not parse");

        assert!(
            matches!(error, nav::ParseError::InvalidJson(_)),
            "expected an envelope error, got {error:?}"
        );
    }

    /// Real adverts put free text where a date is expected — "Snarest"
    /// ("as soon as possible") is common — so a deadline is only taken when
    /// it is genuinely a calendar date.
    #[test]
    fn nav_detail_ignores_a_free_text_application_deadline() {
        let page = nav::parse_feed_page(NAV_FEED_PAGE).expect("feed fixture should parse");
        let payload = r#"{
            "uuid": "active-vacancy-1",
            "status": "ACTIVE",
            "sistEndret": "2026-08-05T08:00:00Z",
            "ad_content": {
                "published": "2026-08-05T07:45:00Z",
                "expires": "2026-08-26T00:00:00+02:00",
                "title": "Technical Support Specialist",
                "description": "<p>Body &amp; more</p>",
                "applicationUrl": "https://careers.example/jobs/100",
                "applicationDue": "Snarest",
                "employer": { "name": "Example Technology AS" }
            }
        }"#;

        let listing = nav::parse_active_detail(payload, &page.items[0])
            .expect("live-shaped detail should parse");

        assert_eq!(listing.deadline.as_deref(), Some("2026-08-26"));
        assert_eq!(listing.description, "Body & more");
    }

    #[test]
    fn saved_search_normalization_is_order_independent() {
        let first = SavedSearchDefinition {
            locations: vec![" Oslo ".to_string(), "Bærum".to_string()],
            include_terms: vec!["Support".to_string(), "Kundeservice".to_string()],
            exclude_terms: vec!["Senior".to_string()],
        }
        .normalize();
        let second = SavedSearchDefinition {
            locations: vec!["bærum".to_string(), "oslo".to_string()],
            include_terms: vec!["kundeservice".to_string(), "support".to_string()],
            exclude_terms: vec!["senior".to_string()],
        }
        .normalize();

        assert_eq!(first, second);
        assert_eq!(first.signature(), second.signature());
    }

    #[test]
    fn saved_search_matches_active_jobs_and_respects_exclusions() {
        let search = SavedSearchDefinition {
            locations: vec!["Oslo".to_string()],
            include_terms: vec!["support".to_string(), "kundeservice".to_string()],
            exclude_terms: vec!["senior".to_string()],
        }
        .normalize();

        assert!(search.matches(SearchableJob {
            title: "Technical Support Specialist",
            employer_name: "Example AS",
            location: "Oslo",
            description: "Help customers",
            status: "active",
        }));
        assert!(!search.matches(SearchableJob {
            title: "Senior Technical Support Specialist",
            employer_name: "Example AS",
            location: "Oslo",
            description: "Help customers",
            status: "active",
        }));
        assert!(!search.matches(SearchableJob {
            title: "Technical Support Specialist",
            employer_name: "Example AS",
            location: "Oslo",
            description: "Help customers",
            status: "closed",
        }));
    }
}
