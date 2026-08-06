#!/usr/bin/env bash
set -euo pipefail
python3 scripts/check_repo.py
python3 scripts/check_migrations.py
python3 scripts/test_ingestion_control.py
./scripts/test_bootstrap.sh
./scripts/test_nav_token.sh
./scripts/test_nav_key.sh
./scripts/test_admin_key.sh
./scripts/test_principal_key.sh
./scripts/test_deploy_preflight.sh
./scripts/test_nav_stub.sh
python3 scripts/test_environment_safety.py
shellcheck deploy bootstrap scripts/*.sh
