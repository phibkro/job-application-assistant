# WorkScope: Secrets as code (SecretSpec + SOPS/age + Alchemy)

- ID: WS-0028
- Revision: 1
- Status: **Approved in principle** (owner decision 2026-11-01). Its scope follows WS-0027 and is refined from WS-0027's final config before execution.
- Owner: Human product owner (phibkro)
- Risk tier: **R3**: credentials and capability boundaries.
- Roles: implementer and independent reviewer at the `complex-reasoning` tier. **The owner provisions every private key.**
- Attempt budget: 2

## Outcome

Secrets are declared in `secretspec.toml` and stored encrypted in the repo (`secrets/{preview,staging,production}.enc.yaml`, SOPS + age). They load through devenv/SecretSpec and are consumed by Alchemy `alchemy.secret()`. Each client decrypts only its tier:

| Secret set | Workstation | GitHub Actions | Claude cloud |
| --- | --- | --- | --- |
| preview | ✅ | ✅ | ✅ |
| staging | ✅ | ✅ | ✅ |
| production | ✅ | ✅ (protected `production` environment, required reviewers) | ❌ |

## Scope

1. `.sops.yaml` `creation_rules` per file, with the three tiers' **public** age recipients. Public keys only; the owner supplies them.
2. `secretspec.toml` profiles (`preview`, `staging`, `production`) and devenv integration, with SOPS-decrypted values feeding SecretSpec. Verify and cite the supported provider path. If none exists for SOPS, use the smallest documented bridge, e.g. `sops exec-env`, and record why.
3. Alchemy reads secrets via `alchemy.secret()`. Record the state password variable name as verified against the pinned Alchemy version (docs disagree: `ALCHEMY_PASSWORD` vs `SECRET_PASSPHRASE`).
4. CI: `SOPS_AGE_KEY` per GitHub environment (preview/staging vs. production); the production deploy job uses the protected `production` environment.
5. Migrate existing GitHub repo secrets into the encrypted files **via the owner** (an agent never sees production values). Document the rotation and recipient-removal runbook (`sops updatekeys`).

## Acceptance

- [ ] With only the cloud key, the preview and staging files decrypt and the production file fails (a negative control seen failing).
- [ ] A secret-scanning gate (e.g. gitleaks in `vp check`) passes, and fails on a planted plaintext secret.
- [ ] A PR Preview deploys using only preview-tier secrets.
- [ ] The production deploy requires the protected environment's reviewer approval (evidence: workflow config plus one dry run).
- [ ] No plaintext secret, and no private key, appears in git history or evidence.

## Exclusions

No new external services, and no change to the application's secret usage beyond its source.
