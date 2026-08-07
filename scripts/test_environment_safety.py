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

# Every stage's database gets its schema from the same place: one generated
# snapshot, applied by the deploy script that publishes the Worker.
#
# Alchemy must NOT apply migrations. It used to, for the Rust stages, and that
# is how the first preview deploy failed — the ten ordered migrations ran
# against a new database, `CREATE TABLE IF NOT EXISTS` kept the legacy shape,
# and the generated snapshot's next index failed against it.
# Comments are not code: the file explains at length why it does not set this,
# and an assertion that reads prose would be satisfied by the explanation.
infra_code = re.sub(r"/\*[\s\S]*?\*/", "", infra)
infra_code = re.sub(r"(^|[^:])//.*$", r"\1", infra_code, flags=re.MULTILINE)
assert "migrationsDir" not in infra_code, (
    "Alchemy must not apply migrations; the deploy applies the generated snapshot"
)

# ...which makes the deploy scripts the only thing standing between a published
# Worker and an empty database. Both paths, because collapsing the stages onto
# TypeScript once removed this for staging and production while leaving preview
# working, and nothing would have failed until a query ran.
for script in ("scripts/deploy.sh", "scripts/deploy-preview.sh"):
    text = (ROOT / script).read_text()
    assert "db/schema.sql" in text, f"{script} must apply the generated schema"
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
