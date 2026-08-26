# WorkScope: Privacy controls — self-service erasure, workspace export, AI consent toggle, key-based model assistance

- ID: WS-0019
- Revision: r1 (frozen contract — implementer executes verbatim; deviations require a new revision)
- Owner: Project maintainer
- Risk tier: **R3** (high — `policy/risk-tiers.json:57-79` hits three examples head-on, not adjacently: *personal data* (this slice deletes, exports, and gates the movement of all of it), *security boundary* (principal and session revocation), *production mutation* (irreversible bulk deletion). Triggers threat model, least-capability grant, independent security review, human release, observed rollout; human gates `scope` + `capability` + `acceptance` + `integration` + `release`.) It does **not** stay at R2 despite WS-0018's R2 precedent for model features: WS-0018 stored owner-authored *outputs* behind an existing entitlement; this slice wires the *kill switch* for model egress, completes GDPR erasure/portability self-service, and revokes credentials — the policy's own R3 examples. Downgrading it would be the reviewer having to reconstruct courage, not reasoning.
- Repository/ref: `job-index` — executes on the current tree. **No git mutations of any kind.**
- Attempt budget: 2 (one implementation pass + one remediation pass)

## Goal

Close the privacy loop the previous slices opened. WS-0016/0018 gave the owner model assistance whose default posture was "capability decides"; WS-0008/0015 gave erasure a state machine and a purge batch, but no self-service trigger; WS-0006's ruling promised export parity for account-registered data, delivered so far only for profile + history. Four controls ship together because they are one posture:

1. **AI consent toggle (D1)** — AI ingestion/processing becomes an owner-controlled switch, default **OFF**, governing *any* outbound owner-data path to model processors (Workers AI today via `env.AI`; Firecrawl-class later). The existing capability entitlements stay untouched; the toggle is a separate consent dimension. A model-path request requires **both** the capability **and** consent ON.
2. **Key-based deidentification (D2)** — application assistance keeps working even with AI enabled by never sending raw profile values: when the model tier composes, the model receives only stable **key references** (`{{profile.headline}}`, `{{profile.skills.0}}`, `{{job.title}}`, `{{answer.notice-period}}`) and returns text containing those placeholders; substitution with real values happens locally **after** the model session terminates. Placeholder-deidentifier architecture.
3. **Self-service account deletion (D3)** — `DELETE /api/v1/me/account` runs the full erasure sweep, revokes every principal and session, and tombstones the account, synchronously, in one transaction.
4. **Whole-workspace export (D3)** — `GET /api/v1/me/workspace/export` delivers every account-registered artifact as one schema-versioned JSON document.

### Binding owner decisions carried in (do not re-litigate)

- **D1** as stated above. Consent OFF + capable ⇒ the model path refuses with a **new** `ConsentRequired` error (403) — semantic chosen and justified in §Consent model. Capability checks are neither weakened nor duplicated: `Entitlements` (`apps/worker/src/services/Entitlements.ts:17-38`), `ALL_CAPABILITIES` (`apps/worker/src/handlers/profile.ts:19-25`), `grants.Premium` (`packages/domain/src/decide/Access.ts:26-35`), and the `Subscription.ts` literals all diff-zero.
- **D2** governs the **studio** model tier (`drafting/studio/model.ts`) this slice. The **S1 inference** tier (`inference/model/index.ts`) is consent-gated but **not** deidentified — deferred with reasons stated in §S1 model tier below, including the `evidenceExcerpt` analysis.
- **D3**: deletion and export ship in this slice; the scheduled post-grace sweep (`Requested` → `Purged` via cron, `packages/domain/src/Access.ts:38-65`) remains unwired and out of scope — self-service deletion here is immediate and synchronous, which *supersedes* nothing (grace-period recovery was for a sweep nobody could trigger; an explicit owner confirmation needs no 30-day undo window).

## Non-goals

- **No Firecrawl, no new model provider, no infra change** — `infra/**` untouched; `env.AI` stays optional and unprovisioned until the operator's standing prompt-review gate. Until bound, entitled-and-consenting accounts transparently receive template/heuristic output + `downgradeReason` exactly as today.
- **No scheduled-sweep wiring** — no cron, queue, or alarm; the `Requested.purgeAfter` machinery is left for whoever wires it (see Goal 3).
- **No capability or tier changes** — zero diff in `Subscription.ts`, `decide/Access.ts`, `Entitlements.ts`, `ALL_CAPABILITIES`.
- **No change to the deterministic tiers' authority** — template documents and heuristic proposals remain free, ungated by consent *and* by entitlements (both gates live exclusively on the `engine: "model"` paths). A consent-OFF account loses nothing it ever had for free.
- **No S1 prompt redesign** — the inference engine keeps sending the pasted document (see §S1 model tier); no key-ification of free-text extraction.
- **No auth-middleware redesign** — `Authenticated` and `CurrentPrincipal` consumed as-is; revocation works through the existing collapse-to-`undefined` semantics (`apps/worker/src/handlers/auth.ts:23-43`).
- **No anonymised aggregates** — submissions/judgements history is erased, not transformed (the standing ruling in `apps/worker/src/db/Erase.ts:35-46`); this slice builds no replacement signal.
- **No PDF/zip export formats, no import counterpart for workspace export** — one JSON document; re-import is future work and the envelope is versioned so it can be designed later without breaking readers.
- **No new npm dependency. Package installation prohibited.** (Property tests use `fast-check`, already present.)
- **Zero new CSS files, no overlay/dialog primitive, no i18n, no design-system work** (WS-0013-r1 rule 4); token-only styling through existing `view/Shared.ts` helpers.
- `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, `openapi/**`, `packages/adapters/**`, `e2e/playwright.config.ts` untouched.

## Threat model (R3 requirement)

| # | Threat | Control | Residual, stated |
| --- | --- | --- | --- |
| T1 | Model processor retains owner data sent in prompts | Key-based deidentification: prompt carries placeholders, never values (§Deidentification); vacancy snapshots — account-registered per the WS-0006 ruling — are keyed too | Model observes structure (fact counts, string lengths), not contents; accepted and recorded |
| T2 | Egress without informed consent | Default-OFF flag; 403 gate evaluated **before** any model call; UI copy names the processor (Cloudflare Workers AI) and what enabling sends | None beyond trusting the processor under its terms — that is what the toggle documents |
| T3 | Deleted account remains accessible via live tokens | Sessions purged + principals revoked **in the same atomic batch** as the data purge; `authenticate()` collapses revoked/expired/unknown to `undefined` (`accounts/accounts.ts:96-132`) | In-flight requests already past auth complete; stateless workers mean the next request is the boundary |
| T4 | Partial deletion on mid-request failure | One `Database.atomic` batch — D1 commits it whole or not at all (`Erase.ts:65-70` establishes the property) | Retry is safe: every write is idempotent (`DELETE WHERE profileId=?`, `UPDATE … SET revokedAt` guarded by `IS NULL`) |
| T5 | Export as exfiltration amplifier | No new authority: export reads exactly what the owner's existing `/me` routes already read, under the same middleware | Token theft already exposes everything via existing reads; export changes breadth, not authority |

Least-capability: both new routes are owner-scoped by construction (`CurrentPrincipal.profileId` predicates only); no admin surface, no cross-profile read, no new capability literal anywhere in the diff.

## Design

### A. Consent model

**Field, location, type.** One column on the account's own row: `profiles.aiAssist`, `INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1))`, exposed in the domain as `ProfileRecord.aiAssist: Model.BooleanSqlite` (`packages/domain/src/Profile.ts:66-78` gains one field; `Model.BooleanSqlite` is the established 0/1 encoding, `packages/domain/src/Delivery.ts:61`). Storage alternatives considered and rejected:

- *New `consents` table* — a second row keyed by `profileId` that always coexists 1:1 with `profiles` buys a join, a repository, an erasure-registration entry, and an `Erase.test.ts` classification for zero flexibility: the flag is per-account scalar config, exactly what the profile row already is. Migration cost: one `ALTER TABLE ADD COLUMN` versus a whole table + bookkeeping.
- *On `principals`* — wrong aggregate: consent is account configuration, not authentication identity; multiple principals share one profile.
- *Inside the `cv` JSON* — wrong layer: consent is not CV content; embedding it would force it through `setProfile`'s compare-and-swap and make it importable/exportable as if the owner had authored it.

**Default.** Absent/absent-column ⇒ **OFF**. Every existing account and every fresh account starts with model processing disallowed; enabling is an explicit act.

**Who can change it.** Any credential that authenticates as the profile — session or API key, the same authority as every `/me` route. No separate elevation: the toggle's worst case is enabling processing of the owner's own data for the owner's own requests, which is strictly less authority than editing the profile.

**Wire representation.**

- `GET /api/v1/me` success gains `aiConsent: Schema.Boolean` (`Api.ts:412-419` struct extension; additive, clients tolerant).
- `PUT /api/v1/me/privacy/ai-consent` — payload `{ enabled: Schema.Boolean }`, success `{ aiConsent: Schema.Boolean }`, errors `Unauthorized`. Deliberately **not** folded into `PUT /me/profile`: that route is whole-CV compare-and-swap, and consent is not CV data — a separate idempotent route keeps the CAS contract byte-compatible and makes the consent change a single auditable statement. Endpoint sits in the `profile` group.

Service surface: `Profiles` (`apps/worker/src/services/Accounts.ts:42-80`) gains `aiConsent(profileId): Effect<boolean>` and `setAiConsent(profileId, enabled): Effect<void>`; implementations in `accounts/profileRow.ts` beside the existing row writers (single-column read; `UPDATE profiles SET aiAssist = ?, updatedAt = ? WHERE profileId = ?`), threaded through `accounts/profiles.ts`'s layer.

**Evaluation order (normative, both model call sites — `handlers/proposals.ts:95-106` and `handlers/documents.ts:83-101` insert the same two-step prefix):**

1. Principal resolved by `Authenticated` (unchanged).
2. **Consent gate:** `aiConsent(profileId)`; `false` ⇒ fail `ConsentRequired` — new taxonomy member beside `ForbiddenByPlatform` (`Api.ts:114-117`), the one new error class this slice:
   ```ts
   export class ConsentRequired extends Schema.TaggedError<ConsentRequired>()(
     "ConsentRequired",
     { message: Schema.String },
     { httpApiStatus: 403 },
   ) {}
   ```
   Raised only as `new ConsentRequired({ message: CONSENT_OFF_MESSAGE })` with `CONSENT_OFF_MESSAGE = "ai assistance is switched off for this account"` declared once in `Api.ts` — a deterministic constant, so tests assert the response body deep-equal.
3. **Capability gate:** the existing `entitlements.require(profileId, …)` → `UpgradeRequired` (402), verbatim.
4. Engine execution with existing degrade semantics.

Order rationale: consent-first means the privacy answer is always given first — an OFF+incapable account learns "enable AI in Privacy settings" rather than being told to pay for a feature that would then still refuse; it also keeps commercial state (tier) out of the refusal a privacy-minded owner sees. Matrix: OFF+capable → 403 `ConsentRequired`; ON+incapable → 402 `UpgradeRequired`; OFF+incapable → 403 (consent answered first); ON+capable+unbound → template/heuristic + `downgradeReason` as today; default-engine requests → steps 2–4 skipped entirely.

**In-flight semantics.** Workers are stateless and there is no server-side model session: toggling OFF takes effect at the **next request that evaluates the gate**. A compose/extraction request already past the gate completes — its outbound call was authorized when made, and the response is substituted/stored locally regardless of the flag's new value. Stated once here so no handler invents a cancellation story.

### B. Key-based deidentification (studio model tier)

New module `apps/worker/src/drafting/studio/keys.ts` (+ `keys.test.ts`). Pure functions, no services, no clock.

**Placeholder grammar (normative).** Token := `{{` KEY `}}`; KEY := SEGMENT (`.` SEGMENT)*; first SEGMENT ∈ {`profile`, `answer`, `job`}; later SEGMENTs match `[A-Za-z0-9_-]+` or are unsigned integers (zero-based array indices). Enumerated key space:

- `profile.headline`, `profile.summary`, `profile.location`, `profile.languages`
- `profile.skills.N`, `profile.education.N`, `profile.preferences.desiredRoles.N`, `profile.preferences.desiredLocations.N`, `profile.preferences.excludedTerms.N` (`preferences` via `preferencesOf`, so older profiles key identically)
- `profile.experience.N.title`, `profile.experience.N.employer`, `profile.experience.N.period`, `profile.experience.N.highlights.M`
- `answer.<questionKey>` — one key per stored answer; answers whose question key fails the SEGMENT charset are **excluded from keying entirely** (their values never travel; the model-tier `ADDITIONAL INFORMATION` section omits them — deterministic, documented limitation)
- `job.title`, `job.employerName`, `job.location`, `job.description` — targeted documents only. Vacancy fields are keyed although the underlying adverts are public: the *frozen saved copy* is account-registered data under the WS-0006 ruling, and which vacancies a person targets is itself revealing.

**Escaping.** Owner values never appear in the prompt, so no value-side escaping exists. On the substitution side the rule is total and mechanical: only tokens whose KEY is present in the compose-time key map are rewritten; after rewriting, any remaining `{{` in the text is a validation failure (below). A model-invented `{{profile.headline}}` is indistinguishable from an instructed one and is substituted — harmless, since substitution is exactly the operation the owner requested. Values containing `{{` or `}}` are inert: they are written into the output verbatim and never re-scanned.

**Composer changes (`drafting/studio/model.ts`).** `promptFor` is rewritten: the PROFILE/advert interpolation blocks (`model.ts:59-89`) are replaced by a key inventory (one `{{key}}` per line, only keys whose values are non-empty) plus instructions, in this normative skeleton:

```text
You are drafting ONE ${kind === "cv" ? "CV" : "covering letter"} for a job applicant.
Use ONLY the fact keys listed below. Never invent employers, dates, skills, or claims.
CRITICAL: facts appear ONLY as double-brace placeholders such as {{profile.headline}}.
Copy placeholders VERBATIM. Never write out a real value for any fact; placeholders are
replaced with the real values locally, after you finish.
${ask}${targetLine}        // targeted: "The document targets the vacancy {{job.title}} at {{job.employerName}}."
FACT KEYS:
${inventory}
Return only the document text.
```

`MAX_MODEL_INPUT_CHARS` truncation and `STUDIO_MODEL` are unchanged. The module exports `keyGrounding(profile, answers, job): KeyedGrounding` where `KeyedGrounding = { prompt: string, finalize: (modelText: string) => FinalizeResult }`, and the model **layer** runs `finalize` on the model's reply *inside* `layer(ai)` — the handler is untouched by substitution mechanics.

**Post-session substitution — typed result (not exceptions):**

```ts
type FinalizeResult =
  | { _tag: "Finalized"; content: string }                       // placeholders replaced; ready to store
  | { _tag: "UnresolvedPlaceholder" }                            // residual {{ after known-key rewrite
  | { _tag: "RawValueLeak"; keys: ReadonlyArray<string> };       // model echoed raw values
```

Pipeline inside `finalize`, in order: **(1) leak scan** — for every key whose value string is ≥ 4 characters, if the model text contains that value verbatim, fail `RawValueLeak` naming the keys; **(2)** rewrite known tokens; **(3)** if `{{` survives anywhere, fail `UnresolvedPlaceholder`; **(4)** enforce `MAX_MODEL_OUTPUT_CHARS` on the *finalized* text (post-substitution, so the bound is honest). Both failures map to `StudioModelUnavailable({ reason })`, so the handler's existing degrade-to-template-plus-`downgradeReason` branch (`documents.ts:96-100`) absorbs them with **zero new handler logic** — a misbehaving model is indistinguishable, from the route's perspective, from an unavailable one.

**Honest limits of validation (stated, not oversold).** The leak scan detects exactly the material at risk — every value in the key map is known locally, so their *verbatim* presence in model output is fully checkable. It cannot detect paraphrases, translations, truncated echoes, or values < 4 chars; those pass. This is detection-in-depth behind the primary control (the values were never sent), not a guarantee about model behaviour.

**Testing strategy.** Unit (`keys.test.ts`): grammar acceptance/rejection table; empty-value omission from inventory; unsafe question keys excluded; finalize happy path; both failure tags; bound enforcement. Property (`fast-check`, house style of `accounts/hash.test.ts`): generate arbitrary profiles/answers/snapshots including adversarial strings (`"{{"`, `"}}"`, `"{{profile.headline}}"` as a *value*, unicode) and a model response referencing a random subset of keys by copying inventory tokens plus arbitrary noise — then `finalize` yields `Finalized` iff no raw values appeared, and the round-trip property holds: **every value of every referenced key occurs in the finalized text, no value of any unreferenced key occurs, and no `{{` remains**. Layer test (`model.test.ts`): fake `WorkersAi` returning keyed text finalizes through; returning raw values or unresolved braces degrades.

### C. Account deletion — `DELETE /api/v1/me/account`

New one-endpoint `account` group in `Api.ts`, closed with `.middleware(Authenticated)` (group assembly mirrors `documents`, `Api.ts:721-766`).

- **Payload (typed confirmation, not a click):** `{ confirm: Schema.Literals(["DELETE"]) }`. Anything else fails payload decoding → 400 before any effect runs. One field, deliberate: the server cannot verify a download happened or a person read a warning, so the payload carries exactly what the server enforces — an unambiguous, schema-checked statement of intent; the gravity signalling lives in the UI (§E).
- **Success:** `200 { erased: true, at: "<iso>" }`. **Errors:** `Unauthorized` (and payload-decode 400). Repeating the call afterwards answers 401 — the credential died with the account; there is no second-delete state to design.
- **Sweep — one atomic batch, fixed order.** The handler composes `db.atomic([...])` from Write-level primitives (the statement-not-execution house pattern, `db/Erase.ts:72-89`):
  1. `Principals.revokeAllForProfileWrite(profileId)` — `UPDATE principals SET revokedAt = ?, updatedAt = ? WHERE profileId = ? AND revokedAt IS NULL` (new `db/repositories/Principals.ts`; `principals` previously had no repository because nothing wrote it — deletion is the first legitimate writer).
  2. `purgeWritesFor(profileId)` — the existing thirteen-entry purge batch, newly **exported** from `db/Erase.ts` (refactor: `eraseProfile` is redefined as `atomic(purgeWritesFor(id))`; its behaviour and `ERASED_TABLES` derivation are unchanged, `Erase.ts:99-115`). Sessions die here — access goes before the data it protects, the order `Erase.ts:65-70` already documents.
  3. `tombstoneWrite(profileId, at)` — new `accounts/profileRow.ts` writer beside `writeErasureRequested` (`profileRow.ts:206-222`): `UPDATE profiles SET cv = <emptyProfile>, erasure = {"_tag":"Purged","at":…}, aiAssist = 0, updatedAt = ? WHERE profileId = ?`. The row's survival in `Purged` state is the record that erasure happened (`Erase.ts:53-58`); the transition moves from "deferred to a scheduled sweep" to "executed by the owner's own confirmed request".
- **What remains afterwards (explicit survivor enumeration):**
  - `profiles` — the tombstone: empty CV, `Purged` marker. Config, not content; the `aiAssist` column resets to 0 with it (choice documented: the consent flag is configuration and does not survive deletion meaningfully either way; zeroing it costs nothing and leaves the tombstone uniform).
  - `principals` — rows retained with `revokedAt` set, `apiKeyHash` intact: the hash is a one-way verifier whose UNIQUE constraint still blocks re-registration collisions and whose presence proves non-authenticity; it is not reversible to the secret. Revocation, not deletion, is the auth-correct treatment (`Erase.ts:59-63` defers to exactly this kind of coordinated change).
  - Platform rows with no `profileId`: `source_catalog`, `canonical_jobs`, `occurrences`, `delivery_platforms`, `platform_policies`, `source_state`, `ingestion_runs`, `ingestion_failures`, `ingestion_gate`, `d1_migrations` — NAV-derived corpus and operational state, never owner data (`Erase.ts:53-63` + WS-0017's identical classification).
  - Nothing else. Every `ERASED_TABLES` member is purged; `RETAINED_TABLES_WITH_PROFILE_ID` stays exactly `["profiles", "principals"]` (`Erase.ts:109`).
- **Handler:** new `handlers/account.ts` (+ `account.test.ts`), wired in `handlers/index.ts` and the `src/index.ts` layer merge. Uses `CurrentPrincipal`, `Database`, and the Write primitives; `Accounts.requestErasure` (the grace-period marker) is **not** involved — this is immediate execution, not a request for later sweeping.

### D. Workspace export — `GET /api/v1/me/workspace/export`

Endpoint in the `profile` group beside `exportProfile` (`Api.ts:458-465`); same `Authenticated` middleware, errors `Unauthorized`.

**Shape — one buffered, schema-versioned JSON document:**

```jsonc
{
  "schema": "job-index.workspace-export",
  "version": 1,
  "exportedAt": "<iso>",
  "data": {
    "profile":     { /* full Profile, via toJson encoder */ },
    "answers":     [ /* Answer[] */ ],
    "savedJobs":   [ /* SavedJob[] incl. frozen jobSnapshot + note */ ],
    "applications":[ /* ApplicationRecord[] incl. cv/letter text */ ],
    "applicationEvents": [ /* history entries: applicationId, status, method, updatedAt */ ],
    "documents":   [ /* StudioDocument[] incl. content */ ],
    "proposals":   [ /* Proposal[], pending AND decided */ ],
    "labels":      [ /* CustomLabel[] */ ],
    "labelAssignments": [ /* { savedJobId, labelId } */ ]
  }
}
```

Declared once in `Api.ts` (`WorkspaceExport` view; embedded aggregates typed as `Schema.Unknown` with the completeness test asserting real shapes — strict restating of nine models in the wire layer would be a second declaration of each, which the single-declaration rule exists to prevent). Orderings deterministic: every array `createdAt DESC`, id ascending as tiebreak.

**Streaming vs buffered — decided: buffered.** Realistic workspaces are far below Workers' response ceilings (200k-char documents × dozens ≈ low MB); the typed client, the envelope versioning, and the completeness test all want one parseable value. Streaming (NDJSON/zip) breaks the success-schema contract for no measured need. Revisit condition stated: if a workspace ever approaches response limits, paginate `documents` first — not built now.

**Sources:** every read exists today except one: `profiles.get`, `profiles.answers`, `SavedJobs.list`, `ApplicationRecords.findByProfile` (`applicationRecords.ts:103`), `Applications.history` (event projections), `DocumentsRepo.findByProfile` (uncursoried by design, unlike the 50-per-page route), `Proposals.findPendingByProfile`'s all-status sibling `findByProfile` (**the one new repository read**, `db/repositories/Proposals.ts`), and `Labels.findByProfile` + `Labels.assigned` for labels and their `{savedJobId, labelId}` assignments (`applications/labels.ts:20,119` — both exist, consumed by a handler for the first time here).

**Conscious scope note (challenge recorded):** `submissions` and `judgements` are purged by erasure but **omitted** from this export — the ticket enumerates authored/curated artifacts; the attempt ledger and match verdicts are system-derived interaction records whose useful portable form (if any) deserves its own design. Named here so the gap is a decision, not an oversight; `freshness`, `subscriptions`, `active_applications` are operational pointers with no portability value.

### E. Settings UI — Privacy section

`apps/web/src/profile/view.ts`, rendered immediately after `appearanceSection` in the authenticated page stack (`view.ts:581-586`), same `h.section` + `aria-label` pattern (`view.ts:205-213`):

1. **AI assistance toggle.** Checkbox labelled "Enable AI processing of my data", wired to `Commands.SetAiConsent { enabled }` → `PUT /me/privacy/ai-consent`; optimistic flip rolled back on failure. Honest description copy, verbatim requirement: *"When enabled, model-powered features (document drafting with the Model engine, and document import with Model extraction) send your content to Cloudflare Workers AI for processing under Cloudflare's processor terms. Drafting sends fact keys, not your actual profile values; import sends the document you submit. Responses are processed in your account. When disabled, these features run without any model service."*
2. **Export.** Button "Download workspace export (JSON)" → `Commands.ExportWorkspace` fetches the route and saves `workspace-export-<YYYY-MM-DD>.json` via a Blob in the command effect (failure surfaces as a problem, never silence).
3. **Danger zone — delete account.** Button "Delete account…" reveals an inline confirm step (no dialog primitive): a checkbox *"I understand this permanently deletes my profile, answers, saved jobs, applications, documents, and history, and cannot be undone"* plus button "Permanently delete account" issuing `Commands.DeleteAccount { confirm: "DELETE" }`. Warning copy, verbatim requirement: *"This removes everything registered to your account and revokes your access immediately. It cannot be undone. Download an export first if you want to keep your data."* Success: `Session.clearToken()` + signed-out state + status line "Your account has been deleted."
4. **Downgrade-path distinction (normative).** Wherever a model request fails, three visibly different outcomes: `UpgradeRequired` → the existing Premium/upgrade card; `ConsentRequired` → new card *"AI assistance is switched off — enable it in Privacy settings"* linking to the Profile page (distinct from unentitled, distinct from unbound); `downgradeReason` → existing template-with-note rendering. Applies to both studio and proposal-queue surfaces.

Cluster edits: `profile/Model.ts` (consent field on the fetched model + confirm-flow state), `Message.ts` (toggle/delete/export messages), `update.ts`, `Commands.ts`, `update.test.ts` arms (optimistic toggle + rollback, confirm sequencing incl. cancel no-op, export command shape, epoch-guarded forwarding per root pattern). `Client.ts` gains the routes automatically.

### S1 model tier — decided: consent-gated, deidentification deferred (with reasoning)

`inference/model/index.ts` keeps sending the pasted document. This is a deliberate exception to D2's generalization, on three grounds: **(1)** extraction's input is *request-transient* material the owner supplies for the express purpose of being analyzed — the same act, in authority terms, as pasting it into any assistant themselves; there is no stored-owner-data egress, which is what D1/D2 govern (OQ-4's sources/outputs distinction, `work/WS-0015-r1-closed-loop-assistance.md:288-292`). **(2)** Its outputs are *candidate* values reviewed per field before entering the record (WS-0016's confirmation UX), and every stored trace — value and excerpt alike — sits in purge-registered `proposals` rows. **(3)** Deidentification needs a pre-existing key space to reference; free text has none — key-ifying extraction is undefined, and faking it would destroy the feature. The `evidenceExcerpt` interaction resolves cleanly under the same frame: an excerpt quotes **the submitted document** — user-supplied transient input, not platform-stored personal data — so quoting it back in a proposal row is the same act WS-0016 already classified, covered by erasure registration and export, not a D2 violation. What S1 **does** get this slice: the consent gate (step 2 of §A) ahead of its `model-inference` capability check (`proposals.ts:95-106`), and the `ConsentRequired` UI card. Revisit trigger: any future persistence of raw submissions.

## Schema and migration plan

Order fixed per WS-0016/0017/0018 — domain model first, regenerate snapshot, emit migration:

1. `packages/domain/src/Profile.ts` — `ProfileRecord` gains `aiAssist: Model.BooleanSqlite` (rationale docstring: consent dimension, default off, survives CV rewrites, zeroed at tombstone). No new module; barrel unchanged.
2. `scripts/ts/schema.ts` — `columnTypes.aiAssist = "INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1))"` (beside the other booleans, `:121-124`); `migrations` append:
   ```ts
   { name: "0005_profile-consent.sql",
     currentWhen: "EXISTS (SELECT 1 FROM pragma_table_info('profiles') WHERE name = 'aiAssist')" }
   ```
3. `bun run schema` regenerates `db/schema.sql`; `bun run schema:check` and `bun run catalog:check` green.
4. `db/migrations/0005_profile-consent.sql` (new; `0001`–`0004` untouchable):
   ```sql
   ALTER TABLE profiles ADD COLUMN aiAssist INTEGER NOT NULL DEFAULT 0 CHECK (aiAssist IN (0,1));
   ```
   Additive; existing databases migrate by Wrangler, fresh databases get the column from the re-marked snapshot. Default 0 **is** the D1 default-OFF rollout for every existing account.

Mechanical fallout of the new model field (each preserves prior values on unrelated writes, exactly as `erasure` is preserved today, `profileRow.ts:89,105-108,132-135,173-176`): `accounts/profileRow.ts` row builders carry `aiAssist` through (`existing?.aiAssist ?? false`); `accounts/fixtures.ts` `insertProfile`/`insertProfileIfMissing`/`updateProfile*` fake cases gain the binding; `accounts/sql.ts` derives automatically from `PROFILE_FIELDS`. Erasure registration: **none** — no new table exists; `ERASED_TABLES`/`RETAINED_TABLES_WITH_PROFILE_ID` unchanged and `Erase.test.ts`'s schema-derived coverage check passes untouched.

## Files touched (complete list; anything else is a deviation)

- `work/WS-0019-r1-privacy-controls.md` — this revision.
- `packages/domain/src/Profile.ts` (one field).
- `scripts/ts/schema.ts` + generated `db/schema.sql`; `db/migrations/0005_profile-consent.sql` (new only).
- `apps/worker/src/accounts/profileRow.ts` (consent read/write + `tombstoneWrite` + aiAssist passthrough); `accounts/profiles.ts` (service impl); `accounts/fixtures.ts` (binding arity); `accounts/sql.ts` only if derivation demands.
- `apps/worker/src/services/Accounts.ts` (`Profiles` tag: `aiConsent`, `setAiConsent`).
- `apps/worker/src/db/Erase.ts` (export `purgeWritesFor`; `eraseProfile` redefined on it — no behavioural diff); `apps/worker/src/db/repositories/Principals.ts` (new); `apps/worker/src/db/repositories/Proposals.ts` (`findByProfile`, all statuses — the only repository addition).
- `apps/worker/src/Api.ts` (`ConsentRequired`; `account` group with `deleteAccount`; `workspaceExport` + `setAiConsent` endpoints in `profile` group; `/me` gains `aiConsent`; `WorkspaceExport` view).
- `apps/worker/src/handlers/account.ts` (new) + `account.test.ts`; `apps/worker/src/handlers/profile.ts` (workspace-export, consent set, `/me` consent field); `apps/worker/src/handlers/documents.ts` + `handlers/proposals.ts` (consent-gate prefix only).
- `apps/worker/src/handlers/testSupport.ts` (`aiConsent`/`setAiConsent` join `defaultProfiles`'s die-loudly defaults; consent-ON suites override them, `Fakes.profiles` entry already exists); `apps/worker/src/handlers/index.ts`; `apps/worker/src/index.ts` (merge line).
- `apps/web/src/Commands.ts`; `apps/web/src/profile/{Model,Message,update,view}.ts`; `apps/web/src/profile/update.test.ts`.
- `e2e/privacy.spec.ts` (new; existing three specs pass unmodified).

Explicitly forbidden even though adjacent: `packages/domain/src/**` beyond the one field; `apps/worker/src/services/{Entitlements,Studio,Inference,Drafting,Extraction}.ts`; `inference/**` (consent gate lives in the handler, engine untouched); `extraction/**`; `runtime/{Env,Layers,Telemetry,Ids,Platform}.ts` (no new service tags — the gate reads `Profiles`, already wired); `applications/**` including `labels.ts` (its existing reads are consumed as-is); `db/migrations/000[1-4]*`; `infra/**`; `packages/adapters/**`; `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, `openapi/**`; `apps/web/src/styles.css`, `view/Shared.ts`, `view/Chrome.ts`, `view/icons.ts` (`Session.clearToken` already exists and is used as-is); dot-files, lockfiles, `package.json` (zero dependency changes). **No git mutations** (`git add/reset/commit/stash` included). No network calls to Cloudflare/NAV/Firecrawl/model endpoints — model paths exercise fakes only.

## Acceptance criteria (each independently checkable)

- [ ] **(a) Consent matrix** (`handlers/documents.test.ts` + `handlers/proposals.test.ts` through `buildHandler`): `engine:"model"` with consent OFF + entitled fake → exact body `{_tag:"ConsentRequired", …}` HTTP 403; consent ON + incapable → `{_tag:"UpgradeRequired", capability:…}` 402; consent OFF + incapable → 403 (order proof); consent ON + entitled + unavailable model fake → 200, template engine, non-null `downgradeReason` (unchanged); consent ON + proposing fake → model output; default-engine create with consent OFF → 200 and **neither** `Entitlements` nor `Profiles.aiConsent` invoked (die-loudly stubs prove absence). `PUT /me/privacy/ai-consent` round-trip flips `/me`'s `aiConsent`.
- [ ] **(b) Key-based round-trip property** (`keys.test.ts`, fast-check): for arbitrary inputs + model text referencing a random key subset — finalize succeeds iff no raw value appeared; every referenced key's value present in output; no unreferenced key's value present; zero residual `{{`; adversarial brace-bearing values survive byte-exact; unsafe question keys absent from inventory.
- [ ] **(c) Placeholder-leak tests** (`model.test.ts`): fake `WorkersAi` returning raw values → layer yields `StudioModelUnavailable` mentioning the leaked keys → handler responds 200 template + `downgradeReason` (never 500, never stored placeholder text); returning `{{nonexistent.key}}` → same degrade; returning proper keyed text → stored content equals substituted text with `engine:"model"`.
- [ ] **(d) Deletion sweep** (`handlers/account.test.ts` on the SQLite TestLayer, `Erase.test.ts` seeding pattern): full seeded account (all thirteen tables incl. documents + proposals) + second control profile; `DELETE /me/account` with wrong payload → 400 and zero effects; with `{confirm:"DELETE"}` → 200 `{erased:true,…}`, every `ERASED_TABLES` count 0 for the profile, control profile untouched, `profiles` row = empty cv + `Purged`, `principals.revokedAt` set, and the presented token authenticates to `undefined` afterwards; `db.atomic` receives exactly one batch (fake Database asserts single call). `Erase.test.ts` coverage check still green with zero list changes.
- [ ] **(e) Export completeness** (`handlers/profile.test.ts` + repository tests): seeded fixture spanning all nine sections → response deep-equals seeded domain objects per deterministic ordering; `proposals` includes decided rows; `savedJobs[].jobSnapshot` round-trips; envelope literals `schema`/`version` asserted; unauthenticated → 401; another principal's data never appears (second seeded profile absent from output).
- [ ] **(f) Capability posture unchanged:** `permits({_tag:"Free"}, …) === false`, Premium `true` — zero diff in `Subscription.ts`/`Access.ts`/`Entitlements.ts`/`ALL_CAPABILITIES` (diff-stat proof); `/me` capabilities array byte-compatible.
- [ ] **(g) Web units** (`profile/update.test.ts`): optimistic consent toggle + failure rollback; delete confirm sequencing incl. cancel no-op and success clearing the session; export command shape; `ConsentRequired` problem maps to the distinct settings-linking card (and not the upgrade card) in both studio and proposal surfaces.
- [ ] **(h) E2e journey** (`e2e/privacy.spec.ts`, `shortlist.spec.ts:11-15` helper style, `assertAccessible` at every screen): sign in → Profile → Privacy section renders with consent off → toggle on → reload persists on → studio model option shows the consent-aware path per (g)'s mapping → export click yields a download named `workspace-export-*.json` → delete-account reveal + cancel leaves session intact. The destructive confirm is **deliberately excluded** from e2e (shared seeded demo database; workers:1) — criterion (d) is its proof. Existing specs pass unmodified.
- [ ] **(i) Full gates:** `bun run check` (fmt, lint, imports, typecheck, schema:check, catalog:check, bundle:check, coverage:all) and `bun run test:workers` green; WS-0013 zero-new-CSS grep reports zero new stylesheets.
- [ ] **(j) Diff confinement:** diff stat confined to the allowed list; greps prove no new capability literal, no `Firecrawl`/`fetch(` additions in touched worker files, and `RETAINED_TABLES_WITH_PROFILE_ID` still exactly `["profiles","principals"]`.

## Rollback

Single-revert, additive-only: new files plus enumerated small edits; reverting restores the prior Worker and UI exactly; `bun run schema:check` green (snapshot tolerates the column via `IF NOT EXISTS` regeneration; the `0005` marker is inert to older code, the `0001`-established property). Post-revert residue: `profiles.aiAssist` survives as an unused column (zero effect), and accounts deleted while the feature lived stay deleted — **rollback cannot resurrect erased data, and must not pretend otherwise**; the runbook pairs the revert with the operator communication that deletion performed during the window is permanent. Consent toggled during the window revert to OFF-semantics (no code reads the flag). Export/deletion routes vanish; no orphan rows are created by them (deletion only removed rows; export only read).

## Required evidence

- Full-pass logs: `bun run check`, `bun run test:workers`, `bun run e2e`.
- Transcripts: consent matrix (a), round-trip property + leak tests (b, c), deletion sweep incl. single-batch assertion (d), export completeness (e), diff stat + greps (f, j).
- Screenshots: Privacy section (toggle off/on states), consent-required card in studio, export download, delete-account confirm step with warning copy.
- Archived `.artifacts/ws-0019/` per house convention. Independent security review + human release gates per R3 executed before integration closes.

## Supersedes

Nothing wholesale. Executes the owner's D1–D3 decisions over the WS-0015 family's model-assistance slices, leaving WS-0016/0018 contracts intact except where §B/§S1 explicitly redefine the studio prompt and add the consent gate. Leaves the scheduled-grace-sweep wiring, workspace-import, and submissions/judgements export design open and unblocked.

## Open questions for the lead

None. Every design area resolved during scoping: consent storage (profiles column; alternatives rejected with reasons), gate order and the 403-vs-402 semantic (chosen: consent-first, justified), placeholder grammar and escaping (total residual-brace rule), substitution error model (typed `FinalizeResult`, degrade-absorbed), S1 treatment (consent-gated, deidentification deferred with three grounds), deletion survivors (enumerated), export omissions (named as decisions, not gaps). Workers AI provisioning timing remains the operator gate already recorded in `memory-bank/activeContext.md` — outside this scope, non-blocking.

## Deviations from r1

- `WorkspaceExport.data` uses a named nine-field `Schema.Struct` whose aggregate leaves are `Schema.Any`, not `Schema.Unknown`. The pinned Effect HTTP API encoder strips nested `Unknown` values to `{}`; `Any` is its documented escape hatch and preserves the frozen, once-parsed `{ data: { ... } }` wire contract. The temporary string-within-JSON implementation was removed.
- `apps/web/src/RequestStatus.ts` and `apps/web/src/view/Shared.ts` changed so `ConsentRequired` remains a typed client problem and renders as a distinct privacy-settings card. This was required for acceptance (g) and the lead-directed browser amendment; keeping those files untouched would collapse the 403 into a network error.
- `apps/web/src/profile/view.ts` adds the `privacy` fragment target used by that card. `e2e/document-studio.spec.ts` now expects consent-first behavior instead of its obsolete upgrade-first assertion; `e2e/privacy.spec.ts` covers the lead amendment by switching consent OFF before selecting the model engine.
- `apps/worker/src/db/repositories/Documents.ts` adds the uncursored complete-profile read required by the export design; the frozen touched-file list incorrectly described that read as already present.
- `apps/worker/src/db/Erase.sweep.test.ts`, `vitest.workers.config.ts`, and the matching `vitest.config.ts` exclusion keep the complete-table SQLite sweep in the workerd pool. `apps/worker/src/handlers/account.test.ts` separately proves payload rejection, one handler atomic call, batch shape, and post-delete token rejection.
- Existing account/application/handler tests and `apps/web/src/update.test.ts` received only fixture-arity/default-field updates required by the new `Profiles.aiConsent` contract. No production behavior outside the frozen control paths changed.
