#!/usr/bin/env python3
"""Static policy checks for the explicit disposable D1 recovery command."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "scripts/restore-d1.py").read_text(encoding="utf-8")
JUSTFILE = (ROOT / "justfile").read_text(encoding="utf-8")

assert "argparse.ArgumentParser" in SCRIPT
assert "--confirm" in SCRIPT
assert "source.casefold() == args.target.casefold()" in SCRIPT
assert "shared_target_name(args.target)" in SCRIPT
assert "db/schema.sql" in SCRIPT
assert "sqlite_master" in SCRIPT
assert "PRAGMA foreign_key_list" in SCRIPT
assert "MAX_INSERT_ROWS" in SCRIPT
assert "MAX_INSERT_BYTES" in SCRIPT
assert '["d1", "create", args.target, "--location", "weur"]' in SCRIPT
assert '["d1", "delete", args.target, "--skip-confirmation"]' in SCRIPT
assert '"source_database": []' in SCRIPT
assert "target_database" in SCRIPT
assert "provider_limitations" in SCRIPT
assert "profile-qualification" in SCRIPT
assert "arbeidsplassen-nav" in SCRIPT
assert "d1-restore source target:" in JUSTFILE
assert "_d1-restore source target: _setup" in JUSTFILE

print("D1 restore policy checks passed.")
