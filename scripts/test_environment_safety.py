#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The Rust worker's local/test Wrangler configs (wrangler.local.jsonc,
# wrangler.test.jsonc) are gone with the crate that built against them. The
# TypeScript service's local config is dev/preview.wrangler.jsonc, asserted
# below; staging and production remain declared in infra/alchemy.run.ts, so
# the safety properties for those are asserted against that file: a second
# copy here is exactly the drift this test exists to stop.
preview_config = (ROOT / "dev/preview.wrangler.jsonc").read_text()
assert '"ENVIRONMENT": "local"' in preview_config
assert "triggers" not in preview_config

infra = (ROOT / "infra/alchemy.run.ts").read_text()

# RFC 0015 starts the TypeScript service on a new database. Keep the legacy
# `Db` resource declared so Alchemy cannot delete it, and bind the Worker to a
# separately identified resource whose physical name cannot adopt the Rust D1.
assert 'Cloudflare.D1Database("Db"' in infra
assert 'Cloudflare.D1Database("TypeScriptDb"' in infra
assert "job-index-${STAGE}-typescript-db" in infra

# Production must not expose the demo mutations or stale public-token
# fallback bindings. Private mode remains available through the explicit
# NAV_API_TOKEN secret.
assert 'ALLOW_DEMO_MUTATIONS: PRODUCTION ? "false" : "true"' in infra
assert '"NAV_API_TOKEN"' in infra
for obsolete in ("ALLOW_NAV_SYNC_WITHOUT_TOKEN", "NAV_USE_PUBLIC_TOKEN"):
    assert obsolete not in infra, obsolete

# Triggers activate only on the second phase of a production deploy, so
# scheduled ingestion cannot run before its credentials exist.
production_cron_guard = (
    "const CRONS = PRODUCTION && ACTIVATE_SCHEDULES ? [INGESTION_CRON] : [];"
)
assert production_cron_guard in infra
assert 'process.env.JOB_INDEX_ACTIVATE_SCHEDULES === "1"' in infra
assert 'const INGESTION_CRON = "0,15,30,45 * * * *";' in infra
for inactive_cron in (
    '"2,7,12,17,22,27,32,37,42,47,52,57 * * * *"',
    '"4,9,14,19,24,29,34,39,44,49,54,59 * * * *"',
):
    assert inactive_cron not in infra, inactive_cron

# Every stage starts from one generated snapshot. Ordered TypeScript-era
# migrations then preserve databases created by an earlier snapshot. Alchemy
# must not apply them: it provisions the resource before the deploy script can
# establish the generated baseline, so a migration that alters an application
# table would run too early on a new database.
# Comments are not code: the file explains at length why it does not set this,
# and an assertion that reads prose would be satisfied by the explanation.
infra_code = re.sub(r"/\*[\s\S]*?\*/", "", infra)
infra_code = re.sub(r"(^|[^:])//.*$", r"\1", infra_code, flags=re.MULTILINE)
assert "migrationsDir" not in infra_code, (
    "Alchemy must not apply migrations; the deploy establishes the snapshot first"
)

# The deploy paths must establish the snapshot, apply ordered migrations, and
# seed the catalogue. Otherwise a new relation can exist beside an old parent
# table until the first authenticated request finds the mismatch.
for script in ("scripts/deploy.sh", "scripts/deploy-preview.sh"):
    text = (ROOT / script).read_text()
    assert "db/schema.sql" in text, f"{script} must apply the generated schema"
    assert "migrate-d1.sh" in text, f"{script} must apply ordered D1 migrations"
    assert "db/catalog-seed.sql" in text, f"{script} must seed the researched catalogue"

justfile = (ROOT / "justfile").read_text()
for recipe in ["deploy-staging:", "deploy-production:", "admin-key:"]:
    assert recipe in justfile, recipe

deploy = (ROOT / "scripts/deploy.sh").read_text()
assert 'environment="${1:-staging}"' in deploy
assert "Production requires a NAV-issued private consumer token" in deploy
assert "Production requires ADMIN_SYNC_TOKEN" in deploy
assert "smoke-production.sh" in deploy
assert "JOB_INDEX_DEV_VARS_FILE" in deploy
assert "bootstrap-publish" in deploy
# The two-phase production publication: schedules off, then on.
assert "deploy_stack 0" in deploy
assert "deploy_stack 1" in deploy
assert "JOB_INDEX_ACTIVATE_SCHEDULES" in deploy
production_phase = deploy.rsplit('if [ "${environment}" = "production" ]; then', 1)[
    1
].split("else", 1)[0]
assert (
    production_phase.index("deploy_stack 0")
    < production_phase.index("apply_database")
    < production_phase.index("deploy_stack 1")
)
# A freshly published Worker is smoked only once it answers.
assert "/api/health" in deploy

# smoke-production.sh only knows the two routes deliberately mirrored across
# the cutover (see apps/worker/src/index.ts); the Rust-only demo/NAV-status
# checks it used to run went with the crate that served them.
production_smoke = (ROOT / "scripts/smoke-production.sh").read_text()
assert "/api/health" in production_smoke
assert "/api/about" in production_smoke
assert 'about["license"] == "proprietary"' in production_smoke

print("Environment-safety checks passed: staging/production boundaries are explicit.")
