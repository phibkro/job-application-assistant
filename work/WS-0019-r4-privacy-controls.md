# WorkScope: Privacy controls — final allowed-file correction

- ID: WS-0019
- Revision: r4
- Status: **Frozen governance replacement.** This revision retains the owner-approved r1 goal, D1–D3 decisions, r2 design, acceptance, and remediation.
- Gate status: Human acceptance, integration, and release remain **OPEN**. This revision does not approve those gates.
- Owner: Project maintainer
- Risk tier: **R3**
- Repository/ref: `job-index` on the current worktree
- Attempt budget: The r1 implementation pass and r2 security-remediation pass are complete. This governance correction authorizes no new product mutation.
- Mutation rule: No git mutation, install, deployment, provider call, or other network call.

## Authority and replacement rule

This file is the complete frozen replacement for WS-0019 r3. It supersedes r3 for execution instructions and evidence only.

`work/WS-0019-r1-privacy-controls.md`, `work/WS-0019-r2-privacy-controls.md`, and `work/WS-0019-r3-privacy-controls.md` remain unchanged as historical records. Do not append execution deviations to these files.

The owner-approved r1 goal, D1–D3 decisions, R3 classification, r2 design, acceptance, and remediation remain unchanged. This revision corrects the final confinement list. It also records the completed token-clear and root-notice invariants.

Human acceptance, integration, and release remain open. This revision does not approve those gates or authorize new scope.

The independent R3 security review returned **FAIL**. A remediation review must pass before a human can close acceptance, integration, or release.

## Goal

Close the privacy loop that the previous slices opened. The four controls ship together because they form one privacy posture:

1. **AI consent toggle (D1).** AI processing is an owner-controlled switch that defaults to **OFF**. A model request requires consent ON and the existing capability.
2. **Key-based deidentification (D2).** The Studio model receives stable fact keys, not raw profile, answer, or saved-vacancy values. Local code substitutes values after the model session ends.
3. **Self-service account deletion (D3).** `DELETE /api/v1/me/account` synchronously revokes access, erases registered account data, and writes the tombstone in one transaction.
4. **Whole-workspace export (D3).** `GET /api/v1/me/workspace/export` returns every in-scope account artifact in one schema-versioned JSON document.

### Binding owner decisions

- Consent OFF plus model capability returns `ConsentRequired` with HTTP 403.
- Consent and capability are separate dimensions. Consent is evaluated first.
- Existing entitlement definitions and capability literals do not change.
- D2 applies to the Studio model tier in this slice.
- S1 inference is consent-gated but keeps its submitted-document model input.
- Deletion is immediate and synchronous after typed owner confirmation.
- The unwired scheduled grace-period sweep remains out of scope.
- Workspace export is one buffered JSON value. It is not NDJSON, ZIP, or PDF.

## R3 classification and gates

This work directly handles personal data, an authentication boundary, and irreversible production mutation. These are direct R3 examples under `policy/risk-tiers.json`.

R3 requires:

- a threat model;
- a least-capability grant;
- independent security review;
- human acceptance, integration, and release decisions;
- observed rollout before release closure.

Source completion and passing local checks do not close a human gate. A prior failed security review is not approval.

## Non-goals

- No Firecrawl, new model provider, or AI binding.
- No infrastructure change, cron, queue, alarm, or scheduled-sweep wiring.
- No capability, subscription, or tier change.
- No model gate on deterministic template or heuristic engines.
- No S1 prompt redesign or deidentification of submitted free text.
- No authentication middleware redesign.
- No anonymized aggregate replacement for erased submissions or judgements.
- No workspace import, PDF export, ZIP export, or streaming export.
- No new dependency or package installation.
- No new CSS file, dialog primitive, i18n system, or design-system work.
- No change under `infra/**`, `packages/adapters/**`, `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, or `openapi/**`.
- No mutation of migrations `0001` through `0004`.

## Threat model

| ID | Threat | Required control | Residual risk |
| --- | --- | --- | --- |
| T1 | A model processor retains owner data | Studio prompts contain only sent fact keys. Local code performs substitution after the model call. | The processor sees key structure and fact count. |
| T2 | Model egress occurs without informed consent | Consent defaults OFF. The gate runs before capability and model calls. The interface visibly names the processor and payloads before interaction. | The owner relies on Cloudflare processor terms after enabling consent. |
| T3 | A deleted account remains accessible | One atomic batch revokes principals, deletes sessions and data, and writes the tombstone. The root interface clears the matching session and every owner cache. | An in-flight server request that passed authentication can complete. |
| T4 | Deletion fails after a partial sweep | One `Database.atomic` batch contains every write in fixed order. Repeated writes are idempotent. | None beyond D1 transaction guarantees. |
| T5 | Export increases exfiltration impact | The route uses existing owner authentication and `profileId` predicates for every section. The response excludes credentials and operational records. | A stolen owner token already permits the underlying reads. |
| T6 | Stale interface responses misstate consent | Consent GET and PUT results obey the generation and session-epoch contract below. | None after a current authoritative response is applied. |
| T7 | Prompt truncation severs or invents grounding | The prompt builder includes whole token lines only. Finalization uses the exact sent map. | Later facts can be omitted when the prompt reaches its bound. |

Least capability remains unchanged. The new routes use `CurrentPrincipal.profileId`; there is no administrator or cross-profile surface.

## Design

### A. Consent storage and API

Add `profiles.aiAssist` as `INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1))`. Expose it as `ProfileRecord.aiAssist: Model.BooleanSqlite`.

The profile row is the correct aggregate. Consent is account configuration, not a principal identity or CV field.

Every existing and new account starts with consent OFF. An absent field or column is treated as OFF during rollout compatibility.

Any authenticated credential for the profile can change the setting. The route authority matches the other `/me` routes.

Wire contract:

- `GET /api/v1/me` includes `aiConsent: boolean`.
- `PUT /api/v1/me/privacy/ai-consent` accepts `{ enabled: boolean }`.
- The PUT response is `{ aiConsent: boolean }` and is authoritative.
- `Profiles` provides `aiConsent(profileId)` and `setAiConsent(profileId, enabled)`.

The model evaluation order is normative:

1. Resolve `Authenticated` and `CurrentPrincipal`.
2. Read consent for explicit `engine: "model"` requests.
3. Return `ConsentRequired` with HTTP 403 when consent is OFF.
4. Apply the existing capability check.
5. Run the engine with the existing downgrade behavior.

Use one constant message: `ai assistance is switched off for this account`.

The outcome matrix is:

| Consent | Capability | Result |
| --- | --- | --- |
| OFF | yes | 403 `ConsentRequired` |
| ON | no | 402 `UpgradeRequired` |
| OFF | no | 403 `ConsentRequired` |
| ON | yes, model unavailable | deterministic output with `downgradeReason` |
| ON | yes, model available | model result |

Default-engine requests do not read consent or entitlements. Consent OFF takes effect on the next request that evaluates the gate.

#### Visible disclosure

The following complete text must be visibly rendered next to the toggle before interaction:

> When enabled, model-powered features (document drafting with the Model engine, and document import with Model extraction) send your content to Cloudflare Workers AI for processing under Cloudflare's processor terms. Drafting sends fact keys, not your actual profile values; import sends the document you submit. Responses are processed in your account. When disabled, these features run without any model service.

The text must not use `sr-only` or another visually hidden class. The checkbox keeps an accessible name and relationship to this visible description.

#### Consent GET/PUT generation contract

The root session epoch and a consent generation jointly own consent state.

- Disable the toggle until the current `/me` request succeeds.
- Disable the toggle while a consent PUT is pending.
- Each `/me` request captures the current session epoch and consent generation.
- A PUT start advances the consent generation and records the previous value for rollback.
- Do not apply a GET consent value while a PUT is pending.
- Do not apply a GET value when its captured epoch or generation differs from the current values.
- A PUT success uses the server-returned `aiConsent`. Do not reconstruct the value from the request.
- A PUT settlement advances the generation again. This invalidates every GET that started before settlement.
- A PUT failure restores the prior value only for its matching epoch and generation.
- Ignore every late response from an older session epoch.

These rules cover GET-before-PUT and PUT-before-GET response order. They prevent stale OFF from replacing a committed ON value.

### B. Key-based deidentification

`apps/worker/src/drafting/studio/keys.ts` contains pure grounding and finalization functions.

#### Exact single-segment answer grammar

Token grammar is exact:

```text
TOKEN       := "{{" KEY "}}"
KEY         := ANSWER_KEY | DATA_KEY
ANSWER_KEY  := "answer." QUESTION_KEY
DATA_KEY    := DATA_ROOT "." SEGMENT ("." SEGMENT)*
DATA_ROOT   := "profile" | "job"
QUESTION_KEY := [A-Za-z0-9_-]+
SEGMENT     := [A-Za-z0-9_-]+
INDEX       := unsigned decimal integer used only at enumerated array positions
```

`ANSWER_KEY` has exactly one segment after `answer`. The enumerated key space further restricts profile and job paths.

Exclude empty, dotted, repeated-dot, leading-dot, slash, brace, whitespace, and Unicode question keys. Their values never enter the prompt.

The enumerated fact space remains:

- `profile.headline`, `profile.summary`, `profile.location`, and `profile.languages`;
- `profile.skills.N` and `profile.education.N`;
- `profile.preferences.desiredRoles.N`, `desiredLocations.N`, and `excludedTerms.N`;
- `profile.experience.N.title`, `employer`, `period`, and `highlights.M`;
- one valid `answer.<questionKey>` per stored answer;
- `job.title`, `job.employerName`, `job.location`, and `job.description` for targeted documents.

Only nonempty values produce fact keys. Saved-vacancy values use keys because the frozen account copy is registered owner data.

The prompt names the document kind, forbids invented facts, lists fact tokens, requires verbatim placeholders, and requests document text only. It never interpolates owner values.

#### Token-line-safe bounded prompt

`MAX_MODEL_INPUT_CHARS` remains the bound. An arbitrary slice of the rendered prompt is prohibited.

The prompt builder must:

1. Reserve space for the complete fixed preamble and closing instruction.
2. Add a fact only when its complete token line fits in the remaining space.
3. Never split a token, line ending, or UTF-16 surrogate pair.
4. Preserve the complete closing instruction.
5. Build `sentFacts` from only the complete token lines in the final prompt.
6. Return a typed unavailable result before an AI call when a safe prompt cannot fit.

The finalizer must use `sentFacts`, not the full candidate fact map. A guessed token that was omitted from the prompt is unresolved and causes deterministic downgrade.

Finalization order remains:

1. Scan model text for verbatim raw values of at least four characters from `sentFacts`.
2. Return `RawValueLeak` with the matching keys when a value occurs.
3. Replace known tokens from `sentFacts` once.
4. Return `UnresolvedPlaceholder` when `{{` remains.
5. Apply `MAX_MODEL_OUTPUT_CHARS` to finalized text.
6. Return `Finalized` only after all checks pass.

Inserted owner values are not scanned again. Brace-bearing values remain byte-exact.

A raw-value leak, unresolved token, unsafe prompt, or output-bound failure maps to `StudioModelUnavailable`. The handler returns deterministic content with `downgradeReason`; it does not store model placeholders or return 500.

The leak scan detects verbatim values of at least four characters. It does not claim to detect paraphrases, translations, partial echoes, or shorter values.

### C. Account deletion

`DELETE /api/v1/me/account` accepts only `{ confirm: "DELETE" }`. Other payloads fail decoding with HTTP 400 before a database effect.

Success is `200 { erased: true, at: "<iso>" }`. A repeated call with the revoked credential returns 401.

The handler submits exactly one atomic batch in this order:

1. Revoke every principal for the profile.
2. Execute all writes from `purgeWritesFor(profileId)`.
3. Tombstone the profile with an empty CV, `Purged` erasure state, and `aiAssist = 0`.

The tombstone profile and revoked principal verifier rows remain. Platform rows without `profileId` remain.

Every current table with `profileId` is classified by the schema-derived erasure coverage test. `RETAINED_TABLES_WITH_PROFILE_ID` stays exactly `['profiles', 'principals']`.

#### Root-owned deletion success

A child profile update must not own deletion success or storage clearing. The root update owns the transition.

- The delete request captures the current `sessionEpoch`.
- Success emits a root-owned account-deleted event with that epoch.
- The root ignores the event when its epoch does not equal the current epoch.
- A matching event changes the session to `Anonymous` and increments the epoch atomically.
- The same transition schedules token clearing through an epoch-bound root command.
- The command carries `expectedToken`, captured from the current authenticated root model before the reset.
- The command reads the current stored token before it performs a storage effect.
- The command clears storage only when the stored token equals `expectedToken`.
- A missing token or a different token causes no storage effect.
- The same transition resets every owner-scoped cache.
- The reset includes profile, saved jobs, feed, match detail, applications, and Studio documents/state.
- The transition stores only the root-owned notice `Your account has been deleted.`.
- The application shell renders the notice visibly while the session is Anonymous.
- The notice contains no former-owner data and survives the owner-cache reset.
- A user can dismiss the notice. A new authenticated session also clears it.

A late delete completion must not clear a newer session token, a newer-owner cache, or the state of a newer session.

### D. Workspace export

`GET /api/v1/me/workspace/export` uses the authenticated profile identity. It returns one parsed response object:

```jsonc
{
  "schema": "job-index.workspace-export",
  "version": 1,
  "exportedAt": "<iso>",
  "data": {
    "profile": {},
    "answers": [],
    "savedJobs": [],
    "applications": [],
    "applicationEvents": [],
    "documents": [],
    "proposals": [],
    "labels": [],
    "labelAssignments": []
  }
}
```

`WorkspaceExport.data` uses one named nine-field `Schema.Struct`. Its aggregate leaves use `Schema.Any` because the pinned HTTP encoder strips nested `Schema.Unknown` values to `{}`.

The client serializes the response once. A reader does not parse a JSON string inside the JSON response.

Every array has deterministic ordering by descending `createdAt`, then ascending identifier. Decided and pending proposals are included.

The export excludes submissions, judgements, freshness, subscriptions, active-application pointers, sessions, principals, hashes, provider references, and ingestion state. These exclusions preserve the r1 portability decision.

### E. Privacy interface

Render the Privacy section after Appearance and give it the `privacy` fragment target.

The section contains:

1. The consent toggle and visible disclosure from section A.
2. `Download workspace export (JSON)`, which downloads `workspace-export-<YYYY-MM-DD>.json`.
3. An inline delete confirmation with no dialog primitive.

The delete warning remains:

> This removes everything registered to your account and revokes your access immediately. It cannot be undone. Download an export first if you want to keep your data.

The confirmation checkbox remains:

> I understand this permanently deletes my profile, answers, saved jobs, applications, documents, and history, and cannot be undone

The three model outcomes remain visibly distinct:

- `UpgradeRequired` shows the existing Premium card.
- `ConsentRequired` shows `AI assistance is switched off — enable it in Privacy settings` and links to the Privacy section.
- `downgradeReason` shows deterministic content and the existing note.

This distinction applies to Studio and the proposal/import surface.

#### Lead E2E amendment

The privacy E2E must switch consent OFF immediately before it selects the Studio model engine. It then asserts the `ConsentRequired` Privacy link.

The existing Studio E2E must use consent-first behavior. It must not retain the obsolete upgrade-first assertion.

The destructive delete confirmation remains excluded from shared-database E2E. Route-real SQLite tests provide that proof.

### F. S1 inference exception

S1 inference keeps the submitted document as model input. This input is request-transient material supplied for extraction.

The handler applies the same consent-first gate before the `model-inference` capability check. Candidate outputs remain reviewable and purge-registered.

Revisit this decision if raw submissions become persistent. No S1 prompt or extraction-engine file changes in this slice.

## Schema and migration plan

1. Add `ProfileRecord.aiAssist: Model.BooleanSqlite` in `packages/domain/src/Profile.ts`.
2. Add the checked integer column and migration marker in `scripts/ts/schema.ts`.
3. Regenerate `db/schema.sql`.
4. Add `db/migrations/0005_profile-consent.sql` with:

```sql
ALTER TABLE profiles ADD COLUMN aiAssist INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1));
```

All profile-row builders preserve `aiAssist` during unrelated writes. Fixtures include the new binding.

No new table exists. Erasure classifications do not change.

## Final confined file list

This list replaces the r3 allowed-file list. It matches the current final WS-0019 paths and adds only this r4 governance file.

`apps/web/src/main.ts` is an allowed root web file. The root-owned deletion notice necessarily renders in the application shell.

### WS-0019 implementation and test files

- `apps/web/src/Commands.ts`
- `apps/web/src/Message.ts`
- `apps/web/src/Model.ts`
- `apps/web/src/RequestStatus.ts`
- `apps/web/src/main.ts`
- `apps/web/src/profile/Message.ts`
- `apps/web/src/profile/Model.ts`
- `apps/web/src/profile/update.test.ts`
- `apps/web/src/profile/update.ts`
- `apps/web/src/profile/view.ts`
- `apps/web/src/update.test.ts`
- `apps/web/src/update.ts`
- `apps/web/src/view/Shared.ts`
- `apps/worker/src/Api.ts`
- `apps/worker/src/accounts/accounts.test.ts`
- `apps/worker/src/accounts/fixtures.ts`
- `apps/worker/src/accounts/live.test.ts`
- `apps/worker/src/accounts/profileRow.test.ts`
- `apps/worker/src/accounts/profileRow.ts`
- `apps/worker/src/accounts/profiles.ts`
- `apps/worker/src/accounts/sql.ts`
- `apps/worker/src/applications/live.test.ts`
- `apps/worker/src/db/Erase.ts`
- `apps/worker/src/db/repositories/Documents.ts`
- `apps/worker/src/db/repositories/Proposals.ts`
- `apps/worker/src/drafting/studio/model.test.ts`
- `apps/worker/src/drafting/studio/model.ts`
- `apps/worker/src/handlers/applications.test.ts`
- `apps/worker/src/handlers/auth.test.ts`
- `apps/worker/src/handlers/documents.test.ts`
- `apps/worker/src/handlers/documents.ts`
- `apps/worker/src/handlers/feed.test.ts`
- `apps/worker/src/handlers/index.ts`
- `apps/worker/src/handlers/profile.test.ts`
- `apps/worker/src/handlers/profile.ts`
- `apps/worker/src/handlers/proposals.test.ts`
- `apps/worker/src/handlers/proposals.ts`
- `apps/worker/src/handlers/testSupport.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/services/Accounts.ts`
- `db/schema.sql`
- `e2e/document-studio.spec.ts`
- `packages/domain/src/Profile.ts`
- `scripts/ts/schema.ts`
- `vitest.config.ts`
- `vitest.workers.config.ts`
- `apps/web/src/view/Shared.test.ts`
- `apps/worker/src/db/Erase.sweep.test.ts`
- `apps/worker/src/db/repositories/Principals.ts`
- `apps/worker/src/drafting/studio/keys.test.ts`
- `apps/worker/src/drafting/studio/keys.ts`
- `apps/worker/src/handlers/account.test.ts`
- `apps/worker/src/handlers/account.ts`
- `db/migrations/0005_profile-consent.sql`
- `e2e/privacy.spec.ts`

### Current governance file

- `work/WS-0019-r4-privacy-controls.md`

### Historical WS-0019 records

These files are historical records. Preserve them unchanged and exclude them from r4 product-change counts.

- `work/WS-0019-r1-privacy-controls.md`
- `work/WS-0019-r2-privacy-controls.md`
- `work/WS-0019-r3-privacy-controls.md`

### Unrelated WS-0015 record

This file is unrelated live fixture fallout. Preserve it unchanged and exclude it from all WS-0019 evidence counts.

- `work/WS-0015-r1-closed-loop-assistance.md`

The reconciled list contains 55 WS-0019 implementation and test paths, one current governance path, three historical WS-0019 records, and one unrelated WS-0015 record.

Evidence files under `.artifacts/ws-0019/` remain permitted evidence outputs. They are ignored outputs, not final worktree paths.

Any other product, test, or governance path is a deviation that requires a new revision.

## Authorized deviations from r1

This section authorizes the corrected implementation shape. It is not a post-hoc edit to r1.

1. `WorkspaceExport.data` uses a named object with `Schema.Any` leaves, not nested `Schema.Unknown`.
2. `RequestStatus.ts` and `view/Shared.ts` preserve and visibly render the distinct `ConsentRequired` problem.
3. `profile/view.ts` adds the `privacy` fragment target.
4. `e2e/document-studio.spec.ts` changes from obsolete upgrade-first behavior to consent-first behavior.
5. `e2e/privacy.spec.ts` includes the lead amendment that switches consent OFF immediately before Studio model selection.
6. `db/repositories/Documents.ts` adds the complete-profile document read required by export.
7. `Erase.sweep.test.ts` and the Vitest partition files keep complete-table SQLite coverage in the workerd pool.
8. Existing account, application, handler, and root web tests can receive required fixture-field updates.
9. Root web files can change for epoch-bound deletion, complete owner-cache reset, and the consent generation contract.
10. Security-remediation tests can change `apps/worker/src/accounts/live.test.ts` and add `view/Shared.test.ts` when needed for the specified counterexamples.

No other expansion is authorized.

## Acceptance criteria

Every criterion is independently checkable. All checkboxes remain open until current r4 evidence and the applicable gate decisions exist.

- [ ] **A. Visible informed consent.** The exact processor and payload disclosure is visible before interaction. A browser assertion uses visibility, not DOM presence alone.
- [ ] **B. Consent matrix.** Both model handlers cover OFF+capable 403, ON+incapable 402, OFF+incapable 403, ON+unavailable downgrade, and ON+available success.
- [ ] **C. Deterministic bypass.** Default-engine requests invoke neither consent nor entitlement services. Die-loudly fakes prove both absences.
- [ ] **D. Consent race contract.** Tests cover GET-before-PUT and PUT-before-GET completion orders. Stale GET cannot replace the authoritative PUT response.
- [ ] **E. Consent epoch contract.** A late consent GET or PUT from an older session changes no state and performs no storage effect.
- [ ] **F. Exact answer grammar.** Tests reject empty, dotted, repeated-dot, leading-dot, slash, brace, whitespace, and Unicode question keys.
- [ ] **G. Key round trip.** Property tests cover arbitrary profiles, answers, saved jobs, braces, Unicode values, raw noise, referenced subsets, and unreferenced values.
- [ ] **H. Safe prompt bound.** Tests cover exact boundary, one character over, long indices, Unicode or surrogate inputs, preserved closing text, and no severed token line.
- [ ] **I. Exact sent map.** A guessed token omitted by the bound cannot be substituted. It produces typed unavailability and deterministic downgrade.
- [ ] **J. Placeholder failures.** Raw values and unknown placeholders produce handler-level HTTP 200 deterministic fallback with `downgradeReason`. No placeholder text is stored.
- [ ] **K. Valid model output.** Proper sent tokens finalize locally and store substituted content with `engine: "model"`.
- [ ] **L. Deletion payload and atomicity.** Wrong confirmation returns 400 with zero effects. Correct confirmation submits exactly one complete atomic batch.
- [ ] **M. Route-real deletion.** A real SQLite route test seeds all erased tables and a control owner. It proves erasure, isolation, tombstone state, session rejection, and API-key rejection.
- [ ] **N. Root deletion success.** A matching completion changes the root to Anonymous and increments the epoch. It resets every owner cache and shows the root-owned deletion notice. The notice remains visible in the application shell while signed out. A user action or a new authenticated session clears it.
- [ ] **O. Complete browser reset.** The root test seeds every owner cache, including Studio, then proves that deletion resets each cache.
- [ ] **P. Late deletion counterexample.** The clear command compares the stored token with its captured `expectedToken`. A newer token survives an old clear effect. An old-epoch delete completion changes no newer-session state or cache.
- [ ] **Q. Export completeness.** One parsed response contains all nine sections, decided proposals, frozen vacancy snapshots, deterministic order, and schema/version literals.
- [ ] **R. Export confinement.** A second owner never appears. Credentials, hashes, principals, sessions, provider references, and operational records never appear.
- [ ] **S. Capability posture.** Capability literals, subscription decisions, and entitlement service behavior have zero product diff.
- [ ] **T. Distinct web outcomes.** Studio and proposal/import surfaces distinguish `ConsentRequired`, `UpgradeRequired`, and model downgrade.
- [ ] **U. Lead E2E journey.** Privacy E2E persists consent, switches it OFF before Studio selection, asserts the Privacy link, downloads one-parse export JSON, and cancels deletion.
- [ ] **V. Accessibility.** Axe passes at each changed screen. The consent disclosure remains visible to sighted users and associated with the control.
- [ ] **W. Full local gates.** `bun run check`, `bun run test:workers`, and `bun run e2e` pass for the same final worktree.
- [ ] **X. Status-inclusive confinement.** Evidence includes tracked, staged, unstaged, and untracked paths. It proves that only this allowed list changed for WS-0019.
- [ ] **Y. R3 security review.** An independent reviewer verifies findings 1–7 and returns PASS on the final worktree.
- [ ] **Z. Human gates.** Human acceptance, integration, and release decisions are recorded separately. Local evidence does not self-approve them.

## Mandatory R3 counterexample set

The focused test transcript must name and pass these counterexamples:

1. Consent OFF before capability for both model handlers.
2. Deterministic paths with consent and entitlement fakes that fail on invocation.
3. Stale GET after successful PUT and successful PUT after stale GET.
4. Dotted and other invalid answer question keys.
5. Exact prompt boundary, one-over-boundary, and guessed omitted token.
6. Raw model value and unresolved model token at handler level.
7. Wrong deletion payload with no database call.
8. Real route deletion followed by session and API-key authentication failure.
9. Matching root deletion with every owner cache populated.
10. Old-epoch deletion after a new session starts.
11. Visible disclosure before consent interaction.
12. Distinct consent cards in Studio and proposal/import surfaces.

Archive focused Vitest output with test names, counts, and results. A log that contains only the runtime banner is invalid.

## Status-inclusive confinement evidence

Evidence must describe the exact final worktree. It must include:

- `git status --short` output with staged, unstaged, and untracked paths;
- tracked and staged name-status and diff-stat output;
- a manifest of every untracked file and content evidence for each WS-0019 untracked file;
- an allowed-list comparison that identifies the unrelated WS-0015 file separately;
- exact forbidden-path checks with their command, worktree identity, and an explicit PASS result when no path matches;
- proof that capability files, `infra/**`, adapters, old migrations, stylesheets, lockfiles, and package manifests have no WS-0019 diff;
- proof that `RETAINED_TABLES_WITH_PROFILE_ID` remains exactly `['profiles', 'principals']`;
- proof that touched Worker files add no Firecrawl or direct `fetch(` path.

A tracked-only `git diff --stat` is insufficient. An empty log without command or provenance is insufficient.

## Verification and evidence

Required final evidence under `.artifacts/ws-0019/`:

- focused R3 counterexample transcript;
- `bun run check` log;
- `bun run test:workers` log;
- `bun run e2e` log;
- status-inclusive confinement manifest and forbidden-path report;
- one-parse workspace export fixture;
- screenshots of consent OFF, consent ON, visible disclosure, distinct consent card, export download, and delete confirmation.

Do not use an external provider in verification. Model tests use fakes only.

## Rollback

The source change is additive except for behavior behind the new routes and consent gates. A source revert removes those routes and gates.

Migration `0005` can leave an unused `aiAssist` column after rollback. That residue has no active effect.

Rollback cannot restore an erased account. Any account deleted while the feature is active remains deleted.

A rollback must include operator communication about permanent deletions. It must not claim data restoration.

## Release constraints

Do not integrate or release after source completion alone. The required order is:

1. Complete the bounded remediation pass.
2. Produce current r4 evidence.
3. Obtain an independent R3 security PASS.
4. Obtain human acceptance.
5. Obtain human integration approval.
6. Obtain human release approval and observed-rollout authority.

## Supersedes

This r4 supersedes r3 only for WS-0019 execution instructions and evidence. It retains the owner-approved r1 goal and decisions, plus the r2 design, acceptance, and remediation.

The r1, r2, and r3 files remain historical records. This revision does not supersede WS-0015, WS-0016, or WS-0018 outside the explicit consent and Studio-grounding changes in this contract.

The scheduled grace sweep, workspace import, submissions/judgements portability design, and provider provisioning remain open future work.
