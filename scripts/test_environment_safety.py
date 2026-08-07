#!/usr/bin/env python3
from __future__ import annotations

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

# Every stage's database gets its schema from somewhere, and the two stages get
# it from different places on purpose.
#
# The Rust stages apply the ten ordered migrations in the same step that
# declares the database, so the Worker is never live against an unmigrated
# schema. The TypeScript stage must NOT apply them: it starts on a new
# database with nothing back-filled, and applying both leaves a database
# matching neither — `CREATE TABLE IF NOT EXISTS` keeps the legacy shape and
# the generated snapshot's next index fails against it. That is not
# hypothetical; it is how the first preview deploy failed.
assert 'migrationsDir: TYPESCRIPT ? undefined : "../migrations"' in infra

# ...so the TypeScript stage's schema has to come from its own deploy step.
# Without this the conditional above would be a silent way to deploy against
# an empty database.
deploy_preview = (ROOT / "scripts/deploy-preview.sh").read_text()
assert "db/schema.sql" in deploy_preview

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
