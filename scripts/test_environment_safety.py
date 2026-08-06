#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


local = load("wrangler.local.jsonc")
test = load("wrangler.test.jsonc")
staging = load("wrangler.staging.jsonc")
production = load("wrangler.production.jsonc")

assert local["vars"]["ENVIRONMENT"] == "local"
assert test["vars"]["ENVIRONMENT"] == "test"
assert staging["vars"]["ENVIRONMENT"] == "staging"
assert production["vars"]["ENVIRONMENT"] == "production"

for config in (local, test, staging):
    assert config["vars"]["ALLOW_DEMO_MUTATIONS"] == "true", config["name"]
assert production["vars"]["ALLOW_DEMO_MUTATIONS"] == "false"
assert production["vars"]["ALLOW_NAV_SYNC_WITHOUT_TOKEN"] == "false"
assert production["vars"]["NAV_USE_PUBLIC_TOKEN"] == "false"
assert production["vars"]["NAV_SYNC_ENABLED"] == "true"
assert production["vars"]["SOURCE_CODE_URL"] == ""
assert production["triggers"]["crons"] == [
    "0,15,30,45 * * * *",
    "2,7,12,17,22,27,32,37,42,47,52,57 * * * *",
    "4,9,14,19,24,29,34,39,44,49,54,59 * * * *",
]

assert test["vars"]["NAV_BASE_URL"].startswith("http://127.0.0.1:")
assert "triggers" not in local
assert "triggers" not in staging

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
assert 'config.pop("triggers", None)' in deploy
assert '["NAV_SYNC_ENABLED"] = "false"' in deploy

production_smoke = (ROOT / "scripts/smoke-production.sh").read_text()
assert 'demo_status == "403"' in production_smoke
assert 'nav_status == "403"' in production_smoke
assert "source_code_url" in production_smoke

connector = (ROOT / "crates/job-index-worker/src/nav_connector.rs").read_text()
assert 'var("NAV_BASE_URL")' in connector
assert "DEFAULT_NAV_BASE_URL" in connector

print("Environment-safety checks passed: local/test/staging/production boundaries are explicit.")
