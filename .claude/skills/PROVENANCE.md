# Provenance of the Foldkit agent skills

| Field | Value |
| --- | --- |
| Source | https://github.com/foldkit/foldkit, directory `skills/` |
| Skills | `foldkit`, `generate-program`, `audit-program` (copied unmodified, including `agents/openai.yaml`) |
| Tag | `foldkit@0.170.0` |
| Commit | `a471adb24d750ab9e8d8312edad53ff6f26d961b` (the tag also marks `@foldkit/ui@0.170.0` and `@foldkit/devtools@0.170.0`) |
| Fetched | 2026-11-01 (WS-0026) |
| License | MIT, Copyright (c) 2025 Devin Jameson (upstream `LICENSE`) |

Verification: `git ls-remote --tags https://github.com/foldkit/foldkit` lists `refs/tags/foldkit@0.170.0` at the commit above. The copies are byte-identical to `skills/*` in a `--depth 1` clone of that tag (`diff -r` clean).

To update: bump the tag with `FOLDKIT_TAG` in `scripts/setup.sh` and `AGENTS.md`, refetch, recopy the three directories, and edit this file. Do not hand-edit the skill files.

The skills reference the Foldkit source at `repos/foldkit/`, a git-ignored checkout created by `scripts/setup.sh`.
