#!/usr/bin/env bash
set -euo pipefail
python3 scripts/check_repo.py
./scripts/test_bootstrap.sh
./scripts/test_nav_key.sh
./scripts/test_admin_key.sh
./scripts/test_deploy_preflight.sh
python3 scripts/test_environment_safety.py
python3 scripts/test_d1_migrations.py
shellcheck deploy bootstrap scripts/*.sh
