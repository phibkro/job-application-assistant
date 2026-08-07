#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Directories whose contents are not this repository's source: vendored
# dependencies and build output. Auditing them reports other projects' broken
# documentation links and their example credentials as if they were ours, which
# buries real findings under thousands of irrelevant ones.
NOT_OUR_SOURCE = {
    ".git",
    "node_modules",
    ".wrangler",
    ".artifacts",
    ".alchemy",
    ".direnv",
    ".preview",
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
    "flake.nix",
    "flake.lock",
    "justfile",
    "bootstrap",
    "deploy",
    "VERSION",
    "RELEASE-MANIFEST.json",
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
    "scripts/capture-nav-fixture.sh",
    "scripts/setup.sh",
    "scripts/configure-nav-key.sh",
    "scripts/configure-admin-key.sh",
    "scripts/dispatch.sh",
    "scripts/test_bootstrap.sh",
    "scripts/deploy.sh",
    "scripts/soak.py",
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
    "docs/internal/rfcs/0015-implementation-language-for-the-application-product.md",
    "work/WS-0006-r1-corpus-integrity-and-bounded-maintenance.md",
    "work/WS-0007-r1-versioned-production-read-api.md",
    "work/WS-0008-r1-principal-and-administrative-security-boundary.md",
    "work/WS-0009-r1-owned-saved-searches.md",
    "work/WS-0010-r1-transactional-webhook-outbox.md",
    "work/WS-0011-r1-production-qualification-gates.md",
    "work/WS-0012-r1-typescript-migration-plan.md",
    "evidence/WS-0006/evidence.md",
    "evidence/WS-0007/evidence.md",
    "evidence/WS-0008/evidence.md",
    "evidence/WS-0009/evidence.md",
    "evidence/WS-0010/evidence.md",
    "evidence/WS-0011/evidence.md",
    "package.json",
    "tsconfig.json",
    "vitest.config.ts",
    "db/schema.sql",
    "infra/alchemy.run.ts",
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


release_manifest_path = ROOT / "RELEASE-MANIFEST.json"
if release_manifest_path in parsed and isinstance(parsed[release_manifest_path], dict):
    manifest = parsed[release_manifest_path]
    expected = {
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

for executable in [
    "bootstrap", "deploy", "deploy-production", "scripts/setup.sh",
    "scripts/dispatch.sh", "scripts/test_bootstrap.sh", "scripts/deploy.sh",
    "scripts/soak.py",
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
    for public_recipe in ["setup:", "check:", "verify:", "preview:", "deploy:", "clean:"]:
        if public_recipe not in justfile_text:
            errors.append(f"justfile missing public recipe {public_recipe!r}")
    if "./scripts/dispatch.sh" not in justfile_text:
        errors.append("public just recipes must transparently dispatch through the Nix environment")

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
        }
        for node, revision in expected_revisions.items():
            actual = nodes.get(node, {}).get("locked", {}).get("rev")
            if actual != revision:
                errors.append(f"flake.lock {node} revision mismatch: {actual!r}")

flake_path = ROOT / "flake.nix"
if flake_path.is_file():
    flake_text = flake_path.read_text(encoding="utf-8")
    for required_fragment in [
        'bun',
        'wrangler',
        'just',
        'shellcheck',
        '9e57802f3e12163dde815353165ae89e14a585f0',
    ]:
        if required_fragment not in flake_text:
            errors.append(f"flake.nix missing declared development dependency: {required_fragment}")
    for forbidden_fragment in ['rust-overlay', 'rust-bin', 'worker-build', 'cargo-audit']:
        if forbidden_fragment in flake_text:
            errors.append(f"flake.nix must not carry the retired Rust toolchain: {forbidden_fragment}")
    # `nodejs` alongside `bun` makes Vitest's worker pool resolve to Node for
    # any test importing `bun:sqlite`, failing every apps/worker/src/db-
    # adjacent live/repository test — reproduced with and without Node on
    # PATH in this exact devShell. Nothing here invokes `node` directly.
    if 'nodejs' in flake_text:
        errors.append("flake.nix must not add nodejs: it breaks bun:sqlite tests under `nix develop`")

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
    if path.suffix.lower() not in {".md", ".json", ".jsonc", ".yml", ".yaml", ".toml", ".sh", ".py", ".ts", ".tsx", ".sql"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for marker in secret_markers:
        if marker in text:
            errors.append(f"possible secret marker {marker!r} in {path.relative_to(ROOT)}")

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

if errors:
    print("Repository checks failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"Repository checks passed: {len(json_files)} JSON files, documentation links valid.")
