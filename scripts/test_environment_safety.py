#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


# Local and test remain Wrangler configs because they describe how the service
# runs on a developer machine. Staging and production are declared in
# infra/alchemy.run.ts, so the safety properties for those are asserted against
# that file: a second copy here is exactly the drift this test exists to stop.
local = load("wrangler.local.jsonc")
test = load("wrangler.test.jsonc")

assert local["vars"]["ENVIRONMENT"] == "local"
assert test["vars"]["ENVIRONMENT"] == "test"
for config in (local, test):
    assert config["vars"]["ALLOW_DEMO_MUTATIONS"] == "true", config["name"]

assert test["vars"]["NAV_BASE_URL"].startswith("http://127.0.0.1:")
assert "triggers" not in local
assert "triggers" not in test

infra = (ROOT / "infra/alchemy.run.ts").read_text()

# Production must not expose the demo mutations, unauthenticated NAV sync, or
# public-token fallback that the other environments rely on.
for guard in (
    'ALLOW_DEMO_MUTATIONS: PRODUCTION ? "false" : "true"',
    'ALLOW_NAV_SYNC_WITHOUT_TOKEN: PRODUCTION ? "false" : "true"',
    'NAV_USE_PUBLIC_TOKEN: PRODUCTION ? "false" : "true"',
):
    assert guard in infra, guard

# Ingestion and its triggers activate only on the second phase of a production
# deploy, so a cron-enabled version can never run before its credentials exist.
assert 'NAV_SYNC_ENABLED: PRODUCTION && ACTIVATE_SCHEDULES ? "true" : "false"' in infra
assert "PRODUCTION && ACTIVATE_SCHEDULES" in infra
assert 'process.env.JOB_INDEX_ACTIVATE_SCHEDULES === "1"' in infra
for cron in (
    '"0,15,30,45 * * * *"',
    '"2,7,12,17,22,27,32,37,42,47,52,57 * * * *"',
    '"4,9,14,19,24,29,34,39,44,49,54,59 * * * *"',
):
    assert cron in infra, cron

# Migrations are applied by the same step that declares the database, so the
# Worker is never live against an unmigrated schema.
assert 'migrationsDir: "../migrations"' in infra

justfile = (ROOT / "justfile").read_text()
for recipe in ["deploy-staging:", "deploy-production:", "admin-key:", "cargo test --workspace --lib"]:
    assert recipe in justfile, recipe

verify = (ROOT / "scripts/verify-local.sh").read_text()
assert "scripts/nav_stub.py" in verify
assert "wrangler.test.jsonc" in verify
assert "scripts/smoke-nav-stub.sh" in verify

deploy = (ROOT / "scripts/deploy.sh").read_text()
assert 'environment="${1:-staging}"' in deploy
assert "Production requires a NAV-issued private consumer token" in deploy
assert "Production requires ADMIN_SYNC_TOKEN" in deploy
assert "Production requires JOB_INDEX_SOURCE_CODE_URL" in deploy
assert "smoke-production.sh" in deploy
assert "smoke.sh" in deploy
assert "JOB_INDEX_DEV_VARS_FILE" in deploy
assert "bootstrap-publish" in deploy
# The two-phase production publication: schedules off, then on.
assert "deploy_stack 0" in deploy
assert "deploy_stack 1" in deploy
assert "JOB_INDEX_ACTIVATE_SCHEDULES" in deploy
# A freshly published Worker is smoked only once it answers.
assert "/api/health" in deploy

production_smoke = (ROOT / "scripts/smoke-production.sh").read_text()
assert 'demo_status == "403"' in production_smoke
assert 'nav_status == "403"' in production_smoke
assert "source_code_url" in production_smoke

connector = (ROOT / "crates/job-index-worker/src/nav_connector.rs").read_text()
assert 'var("NAV_BASE_URL")' in connector
assert "DEFAULT_NAV_BASE_URL" in connector

print("Environment-safety checks passed: local/test/staging/production boundaries are explicit.")
