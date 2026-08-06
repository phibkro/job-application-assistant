use job_index_core::nav;
use job_index_core::RawListing;
use worker::{Error, Result};

const INITIAL_FIXTURE: &str = include_str!("../../../fixtures/initial.json");
const NAV_FEED_PAGE: &str = include_str!("../../../fixtures/nav/feed-page.json");
const NAV_ACTIVE_DETAIL: &str = include_str!("../../../fixtures/nav/detail-active.json");
const NAV_UPDATED_DETAIL: &str = include_str!("../../../fixtures/nav/detail-updated.json");
const NAV_NONMATCHING_DETAIL: &str =
    include_str!("../../../fixtures/nav/detail-nonmatching.json");

pub trait JobSource {
    fn scenario(&self) -> &'static str;
    fn collect(&self) -> Result<Vec<RawListing>>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct InitialFixtureSource;

impl JobSource for InitialFixtureSource {
    fn scenario(&self) -> &'static str {
        "initial-fixture"
    }

    fn collect(&self) -> Result<Vec<RawListing>> {
        serde_json::from_str(INITIAL_FIXTURE)
            .map_err(|error| Error::RustError(format!("invalid committed fixture: {error}")))
    }
}

#[derive(Debug, Clone, Copy)]
pub enum NavFixtureScenario {
    Active,
    Updated,
    NonMatching,
}

pub fn nav_fixture_listing(scenario: NavFixtureScenario) -> Result<RawListing> {
    let page = nav::parse_feed_page(NAV_FEED_PAGE)
        .map_err(|error| Error::RustError(format!("invalid NAV feed fixture: {error}")))?;
    let item = page
        .items
        .first()
        .ok_or_else(|| Error::RustError("NAV feed fixture has no active item".to_string()))?;
    let detail = match scenario {
        NavFixtureScenario::Active => NAV_ACTIVE_DETAIL,
        NavFixtureScenario::Updated => NAV_UPDATED_DETAIL,
        NavFixtureScenario::NonMatching => NAV_NONMATCHING_DETAIL,
    };
    nav::parse_active_detail(detail, item)
        .map_err(|error| Error::RustError(format!("invalid NAV detail fixture: {error}")))
}
