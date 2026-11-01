#!/usr/bin/env python3
"""Static policy checks for the explicit disposable D1 recovery command."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "scripts/restore-d1.py").read_text(encoding="utf-8")
VITE_CONFIG = (ROOT / "vite.config.ts").read_text(encoding="utf-8")

assert "argparse.ArgumentParser" in SCRIPT
assert "--confirm" in SCRIPT
assert "source.casefold() == args.target.casefold()" in SCRIPT
assert "shared_target_name(args.target)" in SCRIPT
assert "db/schema.sql" in SCRIPT
assert "sqlite_master" in SCRIPT
assert "PRAGMA foreign_key_list" in SCRIPT
assert "MAX_INSERT_ROWS" in SCRIPT
assert (
    "substr(name, 1, 4) <> '_cf_'" in SCRIPT
), "provider-internal _cf_ tables must be filtered from the manifest"
assert "job-index-restore-drill-" in SCRIPT, "epilog must recommend the compliant disposable target form"
assert (
    "job-index-staging-restore-" not in SCRIPT
), "examples must not recommend a shared-stage-prefixed target"
assert "MAX_INSERT_BYTES" in SCRIPT
assert '["d1", "create", args.target, "--location", "weur"]' in SCRIPT
assert '["d1", "delete", args.target, "--skip-confirmation"]' in SCRIPT
assert '"source_database": []' in SCRIPT
assert "target_database" in SCRIPT
assert "provider_limitations" in SCRIPT
assert "profile-qualification" in SCRIPT
assert "arbeidsplassen-nav" in SCRIPT
# `vp run d1-restore <source> <target>`: the confirmation flag is part of the
# task, the names are the operator's explicit arguments (WS-0027@2).
assert '"d1-restore": { command: "python3 scripts/restore-d1.py --confirm"' in VITE_CONFIG

print("D1 restore policy checks passed.")
