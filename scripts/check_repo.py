#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Directories whose contents are not this repository's source: vendored
# dependencies and build output. Auditing them reports other projects' broken
# documentation links and their example credentials as if they were ours, which
# buries real findings under thousands of irrelevant ones.
NOT_OUR_SOURCE = {
    ".git",
    "node_modules",
    "target",
    ".wrangler",
    ".artifacts",
    ".alchemy",
    ".direnv",
    "__pycache__",
}


def ours(path: Path) -> bool:
    return not any(part in NOT_OUR_SOURCE for part in path.parts)


REQUIRED = [
    "README.md",
    "LICENSE",
    "AGENTS.md",
    "docs/index.md",
    "memory-bank/projectbrief.md",
    "memory-bank/productContext.md",
    "memory-bank/activeContext.md",
    "memory-bank/systemPatterns.md",
    "memory-bank/techContext.md",
    "memory-bank/progress.md",
    "policy/lifecycle.json",
    "policy/risk-tiers.json",
    "policy/authority.json",
    "docs/internal/rfcs/README.md",
    "templates/rfc.md",
    "Cargo.toml",
    "flake.nix",
    "flake.lock",
    "rust-toolchain.toml",
    "justfile",
    "wrangler.jsonc",
    "bootstrap",
    "deploy",
    "VERSION",
    "RELEASE-MANIFEST.json",
    "migrations/0001_initial.sql",
    "migrations/0002_source_state.sql",
    "migrations/0003_saved_searches.sql",
    "migrations/0004_ingestion_control.sql",
    "docs/internal/rfcs/0007-reliable-ingestion-control.md",
    "docs/public/how-to/operate-nav-ingestion.md",
    "work/WS-0004-r1-reliable-ingestion.md",
    "work/WS-0004-r1-execution-plan.md",
    "evidence/WS-0004/evidence.md",
    "research/decisions/2026-08-05-cloudflare-product-fit.md",
    "fixtures/initial.json",
    "fixtures/nav/feed-page.json",
    "fixtures/nav/detail-active.json",
    "fixtures/nav/detail-updated.json",
    "fixtures/nav/live-detail.json",
    "migrations/0006_source_catalog.sql",
    "migrations/0007_source_catalog_seed.sql",
    "scripts/import_source_index.py",
    "scripts/probe_sources.py",
    "crates/job-index-worker/src/catalog.rs",
    "crates/job-index-worker/src/application.rs",
    "crates/job-index-worker/src/adapters.rs",
    "crates/job-index-worker/src/agenda.rs",
    "crates/job-index-worker/src/linkedin.rs",
    "migrations/0009_application_agenda.sql",
    "migrations/0010_linkedin_identity.sql",
    "migrations/0008_application_flow.sql",
    "scripts/capture-nav-fixture.sh",
    "crates/job-index-core/src/lib.rs",
    "crates/job-index-worker/src/lib.rs",
    "scripts/setup.sh",
    "scripts/configure-nav-key.sh",
    "scripts/dispatch.sh",
    "scripts/test_bootstrap.sh",
    "scripts/check_migrations.py",
    "scripts/test_ingestion_control.py",
    "scripts/verify-local.sh",
    "scripts/deploy.sh",
    "migrations/0005_production_platform.sql",
    "crates/job-index-worker/src/auth.rs",
    "crates/job-index-worker/src/maintenance.rs",
    "crates/job-index-worker/src/outbox.rs",
    "crates/job-index-worker/src/public_api.rs",
    "scripts/create-principal.sh",
    "scripts/test_principal_key.sh",
    "scripts/query_plan_test.py",
    "scripts/restore_drill.py",
    "scripts/soak.py",
    "openapi/job-index-v1.json",
    "ops/slo.json",
    "docs/internal/lifecycle/production-release-checklist.md",
    "docs/public/reference/api-v1.md",
    "docs/public/how-to/manage-principals.md",
    "docs/public/how-to/corpus-maintenance.md",
    "docs/public/how-to/webhooks.md",
    "docs/public/how-to/production-qualification.md",
    "docs/internal/rfcs/0009-corpus-integrity-and-bounded-maintenance.md",
    "docs/internal/rfcs/0010-versioned-production-read-api.md",
    "docs/internal/rfcs/0011-principal-and-administrative-security-boundary.md",
    "docs/internal/rfcs/0012-owned-saved-searches.md",
    "docs/internal/rfcs/0013-transactional-webhook-outbox.md",
    "docs/internal/rfcs/0014-production-qualification-gates.md",
    "work/WS-0006-r1-corpus-integrity-and-bounded-maintenance.md",
    "work/WS-0007-r1-versioned-production-read-api.md",
    "work/WS-0008-r1-principal-and-administrative-security-boundary.md",
    "work/WS-0009-r1-owned-saved-searches.md",
    "work/WS-0010-r1-transactional-webhook-outbox.md",
    "work/WS-0011-r1-production-qualification-gates.md",
    "evidence/WS-0006/evidence.md",
    "evidence/WS-0007/evidence.md",
    "evidence/WS-0008/evidence.md",
    "evidence/WS-0009/evidence.md",
    "evidence/WS-0010/evidence.md",
    "evidence/WS-0011/evidence.md",
]

errors: list[str] = []

for relative in REQUIRED:
    if not (ROOT / relative).is_file():
        errors.append(f"missing required file: {relative}")

# JSON syntax and basic lifecycle integrity.
json_files = sorted(path for path in ROOT.rglob("*.json") if ours(path))
parsed: dict[Path, object] = {}
for path in json_files:
    try:
        parsed[path] = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")

lifecycle_path = ROOT / "policy/lifecycle.json"
if lifecycle_path in parsed:
    lifecycle = parsed[lifecycle_path]
    if isinstance(lifecycle, dict):
        states = set(lifecycle.get("states", []))
        gate_ids: set[str] = set()
        for gate in lifecycle.get("gates", []):
            gate_id = gate.get("id")
            if gate_id in gate_ids:
                errors.append(f"duplicate lifecycle gate id: {gate_id}")
            gate_ids.add(gate_id)
            for source in gate.get("from", []):
                if source not in states:
                    errors.append(f"gate {gate_id} references unknown source state {source}")
            target = gate.get("to")
            if target not in states:
                errors.append(f"gate {gate_id} references unknown target state {target}")
        for transition in lifecycle.get("exception_transitions", []):
            for source in transition.get("from", []):
                if source not in states:
                    errors.append(f"exception transition references unknown source state {source}")
            if transition.get("to") not in states:
                errors.append(f"exception transition references unknown target state {transition.get('to')}")



# RFC structure and status integrity.
rfc_dir = ROOT / "docs/internal/rfcs"
rfc_statuses = {
    "Draft",
    "Proposed",
    "Final Comment",
    "Accepted",
    "Implementing",
    "Implemented",
    "Rejected",
    "Postponed",
    "Withdrawn",
    "Superseded",
}
rfc_required_sections = [
    "## Summary",
    "## Motivation",
    "## Goals",
    "## Non-goals",
    "## Guide-level explanation",
    "## Reference-level explanation",
    "## ADLC and operational impact",
    "## Security, privacy, and capabilities",
    "## Drawbacks",
    "## Rationale and alternatives",
    "## Unresolved questions",
    "## Implementation plan",
    "## Verification and evidence",
    "## Rollout and rollback",
    "## Decision record",
    "## Amendments",
]
rfc_number_pattern = re.compile(r"^(\d{4})-[a-z0-9][a-z0-9-]*\.md$")
seen_rfc_numbers: set[str] = set()
for path in sorted(rfc_dir.glob("*.md")):
    if path.name == "README.md":
        continue
    match = rfc_number_pattern.match(path.name)
    if not match:
        errors.append(f"invalid RFC filename: {path.relative_to(ROOT)}")
        continue
    number = match.group(1)
    if number in seen_rfc_numbers:
        errors.append(f"duplicate RFC number: {number}")
    seen_rfc_numbers.add(number)
    rfc_text = path.read_text(encoding="utf-8")
    if not rfc_text.startswith(f"# RFC {number}:"):
        errors.append(f"RFC title/filename number mismatch: {path.relative_to(ROOT)}")
    status_match = re.search(r"^- Status: (.+)$", rfc_text, re.MULTILINE)
    if not status_match:
        errors.append(f"RFC missing Status metadata: {path.relative_to(ROOT)}")
    elif status_match.group(1).strip() not in rfc_statuses:
        errors.append(
            f"RFC has invalid status {status_match.group(1).strip()!r}: {path.relative_to(ROOT)}"
        )
    for section in rfc_required_sections:
        if section not in rfc_text:
            errors.append(f"RFC missing required section {section!r}: {path.relative_to(ROOT)}")
    if "- Status: Accepted" in rfc_text:
        for field in ["- Decision: Accepted", "- Decision date:", "- Decision owner:", "- Final rationale:"]:
            if field not in rfc_text:
                errors.append(f"accepted RFC missing decision field {field!r}: {path.relative_to(ROOT)}")



# Toolchain and runtime dependency pins must agree across operator surfaces.
try:
    workspace_manifest = tomllib.loads((ROOT / "Cargo.toml").read_text(encoding="utf-8"))
    toolchain_manifest = tomllib.loads((ROOT / "rust-toolchain.toml").read_text(encoding="utf-8"))
    core_manifest = tomllib.loads((ROOT / "crates/job-index-core/Cargo.toml").read_text(encoding="utf-8"))
except Exception as exc:
    errors.append(f"invalid Cargo/toolchain TOML: {exc}")
else:
    rust_version = workspace_manifest.get("workspace", {}).get("package", {}).get("rust-version")
    toolchain = toolchain_manifest.get("toolchain", {}).get("channel")
    if rust_version != toolchain:
        errors.append(f"Rust version mismatch: Cargo {rust_version!r}, toolchain {toolchain!r}")

    worker_dependency = (
        workspace_manifest.get("workspace", {})
        .get("dependencies", {})
        .get("worker", {})
        .get("version")
    )
    if not isinstance(worker_dependency, str) or not worker_dependency.startswith("="):
        errors.append("workers-rs must use an exact workspace dependency version")

    core_dependencies = set(core_manifest.get("dependencies", {}))
    if core_dependencies != {"serde", "serde_json"}:
        errors.append(
            "job-index-core dependency boundary changed; expected serde and serde_json, found "
            f"{sorted(core_dependencies)}"
        )

    clippy_lints = workspace_manifest.get("workspace", {}).get("lints", {}).get("clippy", {})
    if clippy_lints.get("all") != {"level": "warn", "priority": -1}:
        errors.append("workspace Clippy group 'all' must use priority -1 so explicit deny lints override it")

release_manifest_path = ROOT / "RELEASE-MANIFEST.json"
if release_manifest_path in parsed and isinstance(parsed[release_manifest_path], dict):
    manifest = parsed[release_manifest_path]
    expected = {
        "rust_version": "1.97.1",
        "workers_rs_version": "0.8.5",
        "worker_build_version": "0.8.5",
        "wrangler_version": "4.93.0",
        "entrypoint": "./deploy",
        "compatibility_date": "2026-05-25",
    }
    for field, value in expected.items():
        if manifest.get(field) != value:
            errors.append(f"release manifest {field} mismatch: {manifest.get(field)!r}")
    version_file = ROOT / "VERSION"
    if version_file.is_file():
        release_version = version_file.read_text(encoding="utf-8").strip()
        if manifest.get("version") != release_version:
            errors.append(
                f"release manifest/version file mismatch: {manifest.get('version')!r} != {release_version!r}"
            )

workspace_dependencies = workspace_manifest.get("workspace", {}).get("dependencies", {}) if 'workspace_manifest' in locals() else {}
for dependency, expected in {
    "js-sys": "=0.3.102",
    "serde_json": "=1.0.150",
    "sha2": "=0.11.0",
    "hmac": "=0.13.0",
    "futures-util": "=0.3.33",
}.items():
    if workspace_dependencies.get(dependency) != expected:
        errors.append(f"workspace dependency {dependency} must be pinned to {expected}")
serde_dependency = workspace_dependencies.get("serde", {})
if not isinstance(serde_dependency, dict) or serde_dependency.get("version") != "=1.0.228":
    errors.append("workspace dependency serde must be pinned to =1.0.228")

for executable in [
    "bootstrap", "deploy", "deploy-production", "scripts/setup.sh",
    "scripts/dispatch.sh", "scripts/test_bootstrap.sh", "scripts/deploy.sh",
    "scripts/verify-local.sh", "scripts/create-principal.sh",
    "scripts/test_principal_key.sh", "scripts/query_plan_test.py",
    "scripts/restore_drill.py", "scripts/soak.py",
]:
    path = ROOT / executable
    if path.is_file() and not path.stat().st_mode & 0o111:
        errors.append(f"operator command is not executable: {executable}")

setup_path = ROOT / "scripts/setup.sh"
if setup_path.is_file():
    setup_text = setup_path.read_text(encoding="utf-8")
    for forbidden_fragment in ["SOURCE-MANIFEST.sha256", "sha256sum --check", "Setup must run through"]:
        if forbidden_fragment in setup_text:
            errors.append(f"setup must not reject legitimate source changes: {forbidden_fragment!r}")

justfile_path = ROOT / "justfile"
if justfile_path.is_file():
    justfile_text = justfile_path.read_text(encoding="utf-8")
    for public_recipe in ["setup:", "build:", "fmt:", "fix:", "lint:", "check:", "audit:", "qualification:", "verify:", "dev:", "deploy:", "clean:"]:
        if public_recipe not in justfile_text:
            errors.append(f"justfile missing public recipe {public_recipe!r}")
    if "./scripts/dispatch.sh" not in justfile_text:
        errors.append("public just recipes must transparently dispatch through the Nix environment")
    if "cargo fmt --all --check" not in justfile_text:
        errors.append("check must use non-mutating cargo fmt --check")
    if "cargo clippy -p job-index-core --all-targets --fix" not in justfile_text:
        errors.append("fix must run Clippy's safe rewrite mode for job-index-core")
    if "--allow-no-vcs" not in justfile_text:
        errors.append("fix must work from the source-only ZIP without Git history")
    if "cargo audit" not in justfile_text:
        errors.append("qualification must audit Cargo.lock against RustSec")

source_manifest = ROOT / "SOURCE-MANIFEST.sha256"
if source_manifest.exists():
    errors.append("source checksum manifests must not gate editable source releases")

bootstrap_path = ROOT / "bootstrap"
if bootstrap_path.is_file():
    bootstrap_text = bootstrap_path.read_text(encoding="utf-8")
    for required_fragment in [
        'develop',
        '--extra-experimental-features',
        'nix-command flakes',
        'JOB_INDEX_NIX_SHELL',
        '--no-write-lock-file',
    ]:
        if required_fragment not in bootstrap_text:
            errors.append(f"bootstrap must enter the Nix flake; missing {required_fragment!r}")
    for forbidden_fragment in ['rustup-init', 'cargo install just', '--no-modify-path']:
        if forbidden_fragment in bootstrap_text:
            errors.append(f"bootstrap must not install user-level tooling: {forbidden_fragment!r}")

flake_lock_path = ROOT / "flake.lock"
if flake_lock_path.is_file():
    try:
        flake_lock = json.loads(flake_lock_path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid flake.lock: {exc}")
    else:
        nodes = flake_lock.get("nodes", {})
        expected_revisions = {
            "nixpkgs": "9e57802f3e12163dde815353165ae89e14a585f0",
            "rust-overlay": "c5cb13481d718fac906aa9cfd85f9b60e1a546cb",
        }
        for node, revision in expected_revisions.items():
            actual = nodes.get(node, {}).get("locked", {}).get("rev")
            if actual != revision:
                errors.append(f"flake.lock {node} revision mismatch: {actual!r}")

flake_path = ROOT / "flake.nix"
if flake_path.is_file():
    flake_text = flake_path.read_text(encoding="utf-8")
    for required_fragment in [
        'rust-overlay',
        'rust-bin.stable."1.97.1"',
        'stdenv.cc',
        'worker-build',
        'wrangler',
        'just',
        'binaryen',
        'cargo-audit',
        '9e57802f3e12163dde815353165ae89e14a585f0',
        'c5cb13481d718fac906aa9cfd85f9b60e1a546cb',
    ]:
        if required_fragment not in flake_text:
            errors.append(f"flake.nix missing declared development dependency: {required_fragment}")

# Memory bank remains intentionally small.
for path in sorted((ROOT / "memory-bank").glob("*.md")):
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) > 180:
        errors.append(f"memory-bank file exceeds 180-line context budget: {path.name} ({len(lines)})")

# Check relative Markdown links. Ignore anchors, schemes, mail, and template placeholders.
link_pattern = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
for path in sorted(path for path in ROOT.rglob("*.md") if ours(path)):
    text = path.read_text(encoding="utf-8")
    for target in link_pattern.findall(text):
        target = target.strip().split()[0].strip("<>")
        if not target or target.startswith(("#", "http://", "https://", "mailto:")):
            continue
        if "<" in target or ">" in target:
            continue
        file_target = target.split("#", 1)[0]
        resolved = (path.parent / file_target).resolve()
        try:
            resolved.relative_to(ROOT.resolve())
        except ValueError:
            errors.append(f"link escapes repository in {path.relative_to(ROOT)}: {target}")
            continue
        if not resolved.exists():
            errors.append(f"broken relative link in {path.relative_to(ROOT)}: {target}")

# Prevent obvious secrets in committed text. This is deliberately narrow and not a secret scanner.
secret_markers = ["BEGIN PRIVATE KEY", "AKIA", "sk-proj-"]
for path in sorted(path for path in ROOT.rglob("*") if ours(path)):
    if not path.is_file() or path == Path(__file__).resolve():
        continue
    if path.suffix.lower() not in {".md", ".json", ".jsonc", ".yml", ".yaml", ".toml", ".sh", ".py", ".rs", ".sql"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for marker in secret_markers:
        if marker in text:
            errors.append(f"possible secret marker {marker!r} in {path.relative_to(ROOT)}")

# Executable command surface and runtime boundary checks.
justfile = (ROOT / "justfile").read_text(encoding="utf-8") if (ROOT / "justfile").is_file() else ""
for recipe in ["setup:", "build:", "fix:", "lint:", "check:", "audit:", "qualification:", "verify:", "dev:", "deploy:"]:
    if recipe not in justfile:
        errors.append(f"justfile missing required recipe: {recipe[:-1]}")

wrangler_path = ROOT / "wrangler.jsonc"
if wrangler_path.is_file():
    try:
        wrangler = json.loads(wrangler_path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid wrangler.jsonc: {exc}")
    else:
        bindings = wrangler.get("d1_databases", [])
        if not any(binding.get("binding") == "DB" for binding in bindings):
            errors.append("wrangler.jsonc must define the D1 binding DB")
        if wrangler.get("main") != "crates/job-index-worker/build/index.js":
            errors.append("wrangler.jsonc main must target the workers-rs build output")
        if wrangler.get("compatibility_date") != "2026-05-25":
            errors.append("wrangler compatibility_date must match the pinned local runtime maximum 2026-05-25")


# Production API and delivery boundaries must remain bounded and indexed.
public_api_path = ROOT / "crates/job-index-worker/src/public_api.rs"
if public_api_path.is_file():
    text = public_api_path.read_text(encoding="utf-8")
    for fragment in [
        "const MAX_LIMIT: i32 = 100",
        "const MAX_FILTER_LENGTH: usize = 200",
        "build_jobs_query",
        "bind_text",
        "bind_i64",
    ]:
        if fragment not in text:
            errors.append(f"production read API missing bounded/indexed query invariant: {fragment}")
    if re.search(r"\?\d+ IS NULL OR", text):
        errors.append("production read API must not use optional OR predicates that defeat indexes")

outbox_path = ROOT / "crates/job-index-worker/src/outbox.rs"
if outbox_path.is_file():
    text = outbox_path.read_text(encoding="utf-8")
    for fragment in [
        "const DELIVERY_BATCH_SIZE: i64 = 20",
        "const DELIVERY_LEASE_MS: i64 = 300_000",
        "const DELIVERY_PAGE_DEFAULT: i64 = 50",
        "const DELIVERY_PAGE_MAX: i64 = 100",
        "const WEBHOOK_TIMEOUT_MS: u64 = 10_000",
        "const SUBSCRIPTION_QUOTA: i64 = 10",
        "const WEBHOOK_SECRET_MIN: usize = 16",
        "const WEBHOOK_SECRET_MAX: usize = 512",
        "send_with_signal",
        "webhook_target_allowed",
        "value.is_private()",
    ]:
        if fragment not in text:
            errors.append(f"webhook outbox missing bounded delivery invariant: {fragment}")

maintenance_path = ROOT / "crates/job-index-worker/src/maintenance.rs"
if maintenance_path.is_file():
    text = maintenance_path.read_text(encoding="utf-8")
    for fragment in [
        '"invalid_json"',
        "fail_run",
        "status = 'failed'",
        "const MAX_REPAIRS: usize = 100",
        "const MAX_PURGE_ROWS: i64 = 500",
    ]:
        if fragment not in text:
            errors.append(f"maintenance control missing safety invariant: {fragment}")

searches_path = ROOT / "crates/job-index-worker/src/searches.rs"
if searches_path.is_file():
    text = searches_path.read_text(encoding="utf-8")
    for fragment in [
        "const EVALUATION_BATCH_SIZE: usize = 100",
        "const SCHEDULED_SEARCH_BATCH_SIZE: i64 = 4",
        "const MATCH_PAGE_MAX: i64 = 100",
        "evaluate_due_searches",
        "notification_outbox",
    ]:
        if fragment not in text:
            errors.append(f"owned saved searches missing bounded/scheduled invariant: {fragment}")
    if re.search(r"\?\d+ IS NULL OR", text):
        errors.append("owned saved-search pagination must not use optional OR predicates")

api_path = ROOT / "crates/job-index-worker/src/api.rs"
if api_path.is_file():
    text = api_path.read_text(encoding="utf-8")
    if "legacy unbounded job route is disabled" not in text:
        errors.append("production must disable the legacy unbounded /api/jobs route")
    if "constant_time_eq" not in text:
        errors.append("administrator bearer-token comparison must be constant-time")

# Production safety is declared in the Alchemy program rather than a Wrangler
# config, so it is asserted against that file. These are the properties a
# production deploy must not lose: no demo mutations, no public-token
# fallback, and the three staggered bounded triggers.
production_config = ROOT / "infra/alchemy.run.ts"
if production_config.is_file():
    infra_text = production_config.read_text(encoding="utf-8")
    if 'ALLOW_DEMO_MUTATIONS: PRODUCTION ? "false" : "true"' not in infra_text:
        errors.append("production must disable demo mutations")
    if 'NAV_USE_PUBLIC_TOKEN: PRODUCTION ? "false" : "true"' not in infra_text:
        errors.append("production must not use NAV's rotating public token")
    for cron in (
        '"0,15,30,45 * * * *"',
        '"2,7,12,17,22,27,32,37,42,47,52,57 * * * *"',
        '"4,9,14,19,24,29,34,39,44,49,54,59 * * * *"',
    ):
        if cron not in infra_text:
            errors.append("production must declare the three staggered bounded scheduled triggers")
            break
    # Ingestion must not start before the second phase of a production deploy.
    if 'NAV_SYNC_ENABLED: PRODUCTION && ACTIVATE_SCHEDULES ? "true" : "false"' not in infra_text:
        errors.append("production ingestion must activate only with its schedules")
else:
    errors.append("missing infra/alchemy.run.ts")

for path in sorted((ROOT / "crates").rglob("*.rs")):
    text = path.read_text(encoding="utf-8")
    if "unsafe {" in text or "unsafe fn" in text:
        errors.append(f"unsafe Rust is forbidden in {path.relative_to(ROOT)}")

if errors:
    print("Repository checks failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"Repository checks passed: {len(json_files)} JSON files, documentation links valid.")
