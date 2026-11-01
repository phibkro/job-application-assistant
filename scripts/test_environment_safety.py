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
preview_script = (ROOT / "scripts/preview.sh").read_text()
assert '"/__scheduled*"' in preview_config
assert "--test-scheduled" in preview_script

infra = (ROOT / "infra/alchemy.run.ts").read_text()

# RFC 0015 starts the TypeScript service on a new database. Keep the legacy
# `Db` resource declared so Alchemy cannot delete it, and bind the Worker to a
# separately identified resource whose physical name cannot adopt the Rust D1.
assert 'Cloudflare.D1.Database("Db"' in infra
assert 'Cloudflare.D1.Database("TypeScriptDb"' in infra
assert "job-index-${STAGE}-typescript-db" in infra

# Production must not expose the demo mutations or stale public-token
# fallback bindings. Private mode remains available through the explicit
# NAV_API_TOKEN secret.
assert 'ALLOW_DEMO_MUTATIONS: PRODUCTION ? "false" : "true"' in infra
assert '"NAV_API_TOKEN"' in infra
for obsolete in ("ALLOW_NAV_SYNC_WITHOUT_TOKEN", "NAV_USE_PUBLIC_TOKEN"):
    assert obsolete not in infra, obsolete

# WS-0017 retired the ingestion trigger: no stage declares a cron. The gate
# pins the exact empty literal (a renamed trigger array would evade a
# name-based check) and rejects any five-field cron-looking string in the
# infra program outright. The local preview hook above (`/__scheduled*`,
# `--test-scheduled`) is deliberately still protected: the scheduled export
# survives for local testing only.
EMPTY_CRONS_LITERAL = "const CRONS: ReadonlyArray<string> = [];"
assert EMPTY_CRONS_LITERAL in infra, "infra must declare exactly " + EMPTY_CRONS_LITERAL
for retired in (
    "JOB_INDEX_ACTIVATE_SCHEDULES",
    "INGESTION_CRON",
    "SCHEDULES_ALLOWED",
):
    assert retired not in infra, retired
infra_code_for_crons = re.sub(r"/\*[\s\S]*?\*/", "", infra)
infra_code_for_crons = re.sub(r"(^|[^:])//.*$", r"\1", infra_code_for_crons, flags=re.MULTILINE)
cron_pattern = re.compile(r"[\"'][0-9*/,-]+(?:\s+[0-9*/,-]+){4}[\"']")
assert not cron_pattern.search(infra_code_for_crons), (
    "cron-looking schedule literal found in infra; no stage may declare a trigger"
)

# WS-0029@4: Alchemy beta.84 adds `new_module_registry` to every JS Worker
# unless `legacy_module_registry` is declared. Pin the exact opt-out (and
# today's date) so the runtime module registry cannot change silently;
# adopting the new registry is its own ticket.
COMPATIBILITY_LITERAL = 'compatibility: { date: "2026-05-25", flags: ["legacy_module_registry"] },'
assert infra_code_for_crons.count(COMPATIBILITY_LITERAL) == 1, (
    "infra must declare exactly " + COMPATIBILITY_LITERAL
)
assert "new_module_registry" not in infra_code_for_crons, (
    "new_module_registry must not be opted into in infra"
)

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
# WS-0029@4: Alchemy beta.84 renamed the D1 prop to `migrations` and applies
# pending migrations on every deploy (@alchemy.run/cloudflare D1/Database.ts).
assert not re.search(r"\bmigrations\s*:", infra_code), (
    "Alchemy must not apply migrations (`migrations:` prop); the deploy establishes the snapshot first"
)

# The deploy paths must establish the snapshot, apply ordered migrations, and
# seed the catalogue. Otherwise a new relation can exist beside an old parent
# table until the first authenticated request finds the mismatch.
for script in ("scripts/deploy.sh", "scripts/deploy-preview.sh"):
    text = (ROOT / script).read_text()
    assert "db/schema.sql" in text, f"{script} must apply the generated schema"
    assert "migrate-d1.sh" in text, f"{script} must apply ordered D1 migrations"
    assert "db/catalog-seed.sql" in text, f"{script} must seed the researched catalogue"
    # WS-0029@4: alchemy beta.84 removed `state get`; resource attributes are read with `state read <stack>/<stage>/<fqn>`.
    assert "alchemy state get" not in text, f"{script} uses the removed `alchemy state get`"
    assert "bun run alchemy state read \"JobIndex/" in text, f"{script} must read resource state via `alchemy state read`"

# Pull-request previews contain deterministic seed data, never live NAV
# ingestion, and teardown can target only a validated numeric PR stage.
preview_deploy = (ROOT / "scripts/deploy-preview.sh").read_text()
preview_destroy = (ROOT / "scripts/destroy-preview.sh").read_text()
preview_host = (ROOT / "scripts/deploy-preview-host.sh").read_text()
preview_seed = (ROOT / "scripts/seed-preview-db.sh").read_text()
preview_smoke = (ROOT / "scripts/smoke-preview.sh").read_text()
preview_workflow = (ROOT / ".github/workflows/pr-preview.yml").read_text()
for text in (preview_deploy, preview_host, preview_seed):
    assert "NAV_API_TOKEN" not in text
assert 'STAGE="pr-$1"' in preview_deploy
assert "job-index-${STAGE}-typescript-db" in infra
assert 'bun run alchemy destroy --stage "$STAGE" --yes' in preview_destroy
for forbidden_stage in ("preview", "staging", "production", "pr-previews"):
    assert f'STAGE="{forbidden_stage}"' not in preview_destroy
assert "types: [opened, reopened, synchronize, closed]" in preview_workflow
assert "cancel-in-progress: false" in preview_workflow
assert './scripts/deploy-preview.sh "${{ github.event.pull_request.number }}"' in preview_workflow
assert './scripts/destroy-preview.sh "${{ github.event.pull_request.number }}"' in preview_workflow

# WS-0029@2 pass B: a PR is a Cloudflare Worker Preview of one parent Worker,
# bound to one shared seeded preview D1, private behind Cloudflare Access.
# (1) The PR stage uploads a Preview of the host stage's Worker and owns no
# Worker or database of its own: both are references to the host stage.
PREVIEW_HOST_LITERAL = 'const PREVIEW_HOST_STAGE = "pr-previews";'
assert infra_code.count(PREVIEW_HOST_LITERAL) == 1, "infra must declare exactly " + PREVIEW_HOST_LITERAL
assert re.search(
    r"const scriptSettings = PR_STAGE\s*\?\s*\{\s*preview: \{\s*of: yield\* Cloudflare\.Worker\.ref\(\"Api\", \{ stage: PREVIEW_HOST_STAGE \}\),",
    infra_code,
), "a PR stage must be a Worker Preview of the pr-previews host's Api Worker"
assert re.search(
    r"const database = PR_STAGE\s*\?\s*yield\* Cloudflare\.D1\.Database\.ref\(\"TypeScriptDb\", \{ stage: PREVIEW_HOST_STAGE \}\)",
    infra_code,
), "a PR stage must bind the host's shared preview D1 by reference, never own a database"
# (2) The Durable Object binding is declared for every stage, Previews
# included (a Preview inherits no bindings), never only in a
# production-only branch.
assert re.findall(r"^\s*SOURCE_LEASE: sourceLease,\s*$", infra_code, flags=re.MULTILINE) == [
    "        SOURCE_LEASE: sourceLease,"
], "SOURCE_LEASE must be bound unconditionally in the Worker env, Previews included"
# (3) Access is the owner's Worker-level setting, not an Alchemy resource.
assert not re.search(r"\baccess\s*:", infra_code), "infra must not declare Worker Access (owner's dashboard setting)"
assert "Cloudflare.Access" not in infra_code, "infra must not declare an Access application"
# (4) The shared D1 is seeded only through the guarded script: it accepts only
# the preview D1's name, serialises writers with a lease, and never deletes
# fixture rows other Previews read.
for script, text in (("scripts/deploy-preview.sh", preview_deploy), ("scripts/deploy-preview-host.sh", preview_host)):
    assert './scripts/seed-preview-db.sh "$DB_NAME" "$DB_ID"' in text, f"{script} must seed through seed-preview-db.sh"
assert "  job-index-pr-previews-typescript-db) ;;" in preview_seed, "seed-preview-db.sh must accept only the shared preview D1"
for needed in ("db/schema.sql", "migrate-d1.sh", "db/catalog-seed.sql", "dev/preview-seed.sql"):
    assert needed in preview_seed, f"seed-preview-db.sh must apply {needed}"
assert "grep -v '^DELETE FROM ' dev/preview-seed.sql | sed 's/^INSERT INTO /INSERT OR IGNORE INTO /'" in preview_seed, (
    "the shared seed must be insert-only (no DELETE)"
)
assert "--file dev/preview-seed.sql" not in preview_seed, "the resetting local fixture must not run on the shared D1"
assert "ON CONFLICT(id) DO UPDATE SET holder = excluded.holder" in preview_seed, "shared seeding must take the lease"
# (4b) Review round 1, M1 (lead decision): only the host deploy applies D1
# migrations to the shared D1. A PR deploy refuses when one is pending, and
# its path never calls migrate-d1.sh. scripts/test_seed_preview_db.sh tests
# both modes against a stub wrangler.
preview_pr_path = preview_deploy.split('echo "==> preview ready: ${DEPLOYMENT_URL}"\n  exit 0\nfi\n', 1)
assert len(preview_pr_path) == 2, "deploy-preview.sh must keep the preview stage path separate from the PR path"
assert "migrate-d1.sh" not in preview_pr_path[1], "the PR deploy path must never call migrate-d1.sh"
assert './scripts/seed-preview-db.sh "$DB_NAME" "$DB_ID" "$STAGE" refuse' in preview_pr_path[1], (
    "the PR deploy must seed with migrations refused"
)
assert './scripts/seed-preview-db.sh "$DB_NAME" "$DB_ID" "host" apply' in preview_host, "only the host deploy applies migrations"
assert preview_seed.count("migrate-d1.sh") == 1 and (
    'if [ "$MIGRATIONS" = "apply" ]; then\n  ./scripts/migrate-d1.sh remote "$DB_NAME" "$DB_ID"\nfi' in preview_seed
), "seed-preview-db.sh may migrate only in apply mode"
# (4c) Review round 1, I3: neither the host nor a PR Preview binds a secret,
# whatever the deploying shell exports.
assert re.search(
    r"const secretBindings = \(\) => \{\n  const bindings: Record<string, Redacted\.Redacted<string>> = \{\};\n"
    r"(?:  //.*\n)*  if \(PR_STAGE \|\| PREVIEW_HOST\) \{\n    return bindings;\n  \}\n",
    infra,
), "secretBindings() must return {} for the PR Preview host and every PR stage"
# (5) The deploy ends with the Access smoke, and teardown proves the Preview
# is gone; the smoke's behaviour is tested by scripts/test_smoke_preview.sh.
vite_policy = (ROOT / "vite.config.ts").read_text()
assert '"bash scripts/test_smoke_preview.sh",' in vite_policy, "policy must run the smoke-preview tests"
assert '"bash scripts/test_seed_preview_db.sh",' in vite_policy, "policy must run the seed-preview-db tests"
assert preview_deploy.rstrip().endswith('./scripts/smoke-preview.sh deployed "$DEPLOYMENT_URL" "$STAGE"'), (
    "deploy-preview.sh must end with the Access smoke"
)
assert './scripts/smoke-preview.sh deleted "$DEPLOYMENT_URL"' in preview_destroy
assert 'ACCESS_TEAM_HOST="phibkro.cloudflareaccess.com"' in preview_smoke
# (6) `alchemy state read` prints Redacted secrets (WS-0029 L5): every read is
# piped straight into a parser.
for script, text in (
    ("scripts/deploy-preview.sh", preview_deploy),
    ("scripts/deploy-preview-host.sh", preview_host),
    ("scripts/destroy-preview.sh", preview_destroy),
):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if "alchemy state read" in line and not line.lstrip().startswith("#"):
            window = "\n".join(lines[index : index + 2])
            assert ") | python3 -c" in window, f"{script}:{index + 1}: pipe `alchemy state read` into the parser"
# (7) Fork safety on every job, and no secret beyond Cloudflare's and the two
# Access service-token ones.
preview_jobs = re.findall(r"^  [a-z][\w-]*:\s*$", preview_workflow.split("\njobs:\n", 1)[1], flags=re.MULTILINE)
assert preview_jobs, "pr-preview.yml must declare jobs"
assert preview_workflow.count("github.event.pull_request.head.repo.full_name == github.repository") == len(preview_jobs), (
    "every pr-preview job must carry the same-repository guard"
)
assert set(re.findall(r"secrets\.([A-Z_]+)", preview_workflow)) == {
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET",
}, "pr-preview.yml may use only the Cloudflare and Access service-token secrets"


# WS-0027@2: the deploy entry points are Vite+ tasks. Each must fail closed
# outside the pinned devenv toolchain, then run the verify-equivalent gates in
# its own command (a `dependsOn` would be skipped by `--ignore-depends-on`),
# and only then the deploy script. verify must chain the policy gates, the
# static checks and the coverage-gated tests.
vite_config = (ROOT / "vite.config.ts").read_text()
guard_definition = next(
    (line for line in vite_config.splitlines() if line.strip().startswith('"bash -c \'test -n')), ""
)
assert r'test -n \"$DEVENV_ROOT\" ||' in guard_definition and "exit 1" in guard_definition, (
    "vite.config.ts must define requireDevenv: fail when DEVENV_ROOT is unset"
)
assert "const requireDevenv =" in vite_config
for task, stage in (("deploy", "staging"), ('"deploy-production"', "production")):
    line = next(
        (line for line in vite_config.splitlines() if line.strip().startswith(f"{task}: {{")), None
    )
    assert line is not None, f"vite.config.ts must declare the {task} task"
    assert (
        f"command: `${{requireDevenv}} && vp run verify && bash scripts/deploy.sh {stage}`" in line
    ), f"{task} must require devenv, then run verify, then deploy: {line}"
    assert "dependsOn" not in line, f"{task} must not rely on dependsOn for its gates"
verify_block = vite_config.split("verify: {", 1)[1].split("cache: false", 1)[0]
for gate in ("vp run policy", "vp check", "vp run typecheck", "vp run effect:check", "vp run coverage"):
    assert gate in verify_block, f"verify must run {gate}"

deploy = (ROOT / "scripts/deploy.sh").read_text()
# Remote D1 creation is eventually consistent in the account listing. Schema
# application must use Alchemy's exact database id rather than immediately
# trying to rediscover the new database by name.
assert '"database_id": "${database_id}"' in deploy
assert '--config "${database_config}"' in deploy
assert 'mktemp --suffix=.jsonc' in deploy
assert 'wrangler d1 execute "${database_name}" --remote --config' in deploy
assert './scripts/migrate-d1.sh remote "${database_name}" "${database_id}"' in deploy
assert "local database_id" not in deploy

migrate_d1 = (ROOT / "scripts/migrate-d1.sh").read_text()
assert 'database_id="${3:-}"' in migrate_d1
assert 'wrangler d1 migrations apply "$database_name"' in migrate_d1
assert 'mktemp --suffix=.jsonc' in migrate_d1
assert 'environment="${1:-staging}"' in deploy
assert "Production requires a NAV-issued private consumer token" in deploy
assert "smoke-production.sh" in deploy
assert "JOB_INDEX_DEV_VARS_FILE" in deploy
assert "bootstrap-publish" in deploy
# WS-0021@4 retired the legacy apps/web interface (owner-authorized); guard
# against it coming back. WS-0025@2 added the index client, whose build is the
# Worker's asset directory, so it must be built fresh before publication.
assert "apps/web" not in deploy
# The old ban kept at full strength: no `web-build` anywhere except the one
# allowed client build step (WS-0025@2 review L1).
INDEX_WEB_BUILD = "run_logged index-web-build bash scripts/build-index-web.sh"
assert deploy.count(INDEX_WEB_BUILD) == 1, "deploy must build the index client exactly once"
assert "web-build" not in deploy.replace(INDEX_WEB_BUILD, ""), "only the index-client build may say web-build"
assert deploy.index(INDEX_WEB_BUILD) < deploy.index("deploy_stack 0")

# The Worker's assets are the index client's build output in every stage, and
# every path that bundles the Worker builds that output first (review L2).
CLIENT_DIST = "apps/index-web/dist"
infra = (ROOT / "infra/alchemy.run.ts").read_text()
infra_assets = re.findall(r'^\s*directory:\s*"([^"]+)"', infra, flags=re.MULTILINE)
assert infra_assets == [f"../{CLIENT_DIST}"], f"infra assets must be the client build: {infra_assets}"
preview_config = (ROOT / "dev/preview.wrangler.jsonc").read_text()
preview_assets = re.findall(r'"directory":\s*"([^"]+)"', preview_config)
assert preview_assets == [f"../{CLIENT_DIST}"], f"preview assets must be the client build: {preview_assets}"
for script in ("scripts/preview.sh", "scripts/deploy-preview.sh"):
    text = (ROOT / script).read_text()
    assert "bash scripts/build-index-web.sh" in text, f"{script} must build the index client"
    assert text.index("bash scripts/build-index-web.sh") < text.index("bun build apps/worker/src/index.ts"), (
        f"{script} must build the index client before bundling the Worker"
    )
build_index_web = (ROOT / "scripts/build-index-web.sh").read_text()
assert "apps/web" not in build_index_web.replace("apps/index-web", ""), "build-index-web.sh must not build apps/web"
assert 'cd "$ROOT/apps/index-web"' in build_index_web
assert "test -f dist/index.html" in build_index_web
assert "run_logged worker-build bun build apps/worker/src/index.ts" in deploy
assert deploy.index("run_logged worker-build") < deploy.index("deploy_stack 0")
# The two-phase production publication: a first version before the database
# upgrade, then the final publication once the schema is current. WS-0017
# removed schedule activation — both phases are now trigger-free, but the
# ordered publication itself stays asserted.
assert "deploy_stack 0" in deploy
assert '"${deployment_url}" "${environment}"' in deploy
assert "deploy_stack 1" in deploy
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
assert 'EXPECTED_ENVIRONMENT="${2:-production}"' in production_smoke
assert 'health["environment"] == expected_environment' in production_smoke
assert 'about["environment"] == expected_environment' in production_smoke
assert "/api/health" in production_smoke
assert "/api/about" in production_smoke
assert 'about["license"] == "proprietary"' in production_smoke

# Fork safety on a public repository (owner decision 2026-11-01): no
# `pull_request_target` (it runs with secrets and bypasses fork-approval
# settings) and GitHub-hosted runners only (fork code must never reach a
# self-hosted runner). Applies to every workflow, present and future.
import re as _re

_workflows = sorted((ROOT / ".github/workflows").glob("*.y*ml"))
assert _workflows, "expected at least one workflow"
for _workflow in _workflows:
    _text = _workflow.read_text()
    assert "pull_request_target" not in _text, f"{_workflow.name}: pull_request_target is forbidden"
    assert "self-hosted" not in _text, f"{_workflow.name}: self-hosted runners are forbidden"
    for _runner in _re.findall(r"^\s*runs-on:\s*(.+?)\s*$", _text, _re.MULTILINE):
        assert _re.fullmatch(r"(ubuntu|windows|macos)-[\w.-]+", _runner), (
            f"{_workflow.name}: runs-on {_runner!r} must be a GitHub-hosted label"
        )

print("Environment-safety checks passed: staging/production boundaries are explicit.")
