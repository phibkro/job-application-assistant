#!/usr/bin/env sh
set -eu
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git config core.hooksPath .githooks
  chmod +x .githooks/pre-commit
  printf '%s\n' 'Repository hooks installed.'
fi
