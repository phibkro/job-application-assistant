# WorkScope: Document→profile inference with per-field confirmation

- ID: WS-0016
- Revision: r1 (frozen contract — implementer executes verbatim; deviations require a new revision)
- Owner: Project maintainer
- Risk tier: **R2** (medium — `policy/risk-tiers.json:36-43` examples hit three ways: new feature, schema change, dependency addition; triggers plan review, independent review, rollback plan, provenance; gates `scope` + `acceptance_or_integration`). It stays R2 rather than becoming R3-postured personal data **only because** raw documents are parsed transiently and never persisted (WS-0015-r1 §6 OQ-4, `work/WS-0015-r1-closed-loop-assistance.md:289-292`). Persisting a raw document anywhere in this slice is a scope breach that re-tiering cannot fix.
- Repository/ref: `job-index` — executes on the current tree (4 unpushed commits stay untouched; no git mutations of any kind).
- Attempt budget: 2 (one implementation pass + one remediation pass)

## Goal

Concretize WS-0015 §4 S1 (`work/WS-0015-r1-closed-loop-assistance.md:111-130`): a person pastes CV/letter text or uploads a PDF on the Profile page; the system extracts text (transiently — parse, propose, discard), proposes structured `Profile` facts, each marked inferred with an evidence excerpt and a confidence label; the person reviews a proposal queue and accepts, edits, or discards **per field**; only accepted values enter the profile of record; discarded and ignored proposals never appear in exports, drafts, or matches (WS-0015 §5: "unconfirmed proposals never leak into exports, drafts, or matches", `work/WS-0015-r1-closed-loop-assistance.md:256-258`).

Binding resolutions carried from WS-0015 §6: paste/plain-text **and** PDF in scope, `unpdf` primary (empirically verified `unpdf@1.8.1` under Bun, `work/WS-0015-r1-closed-loop-assistance.md:132-151`); `.docx` deferred; Workers AI behind the model-capability entitlement pattern with deterministic heuristics as offline fallback (OQ-2, `:277-281`); transient parse-only (OQ-4); every proposal marked inferred until individually confirmed. Firecrawl Parse is the escalation tier and is **explicitly out of scope** (operator data-processor approval pending, `:162-172`) — but the text extractor sits behind an interface so it slots in later without touching handlers.

### Merge mechanism — decided: server-side merge in the decision endpoint

Accepted values merge through a server-side decision handler that composes the **same existing write contract** (`Profiles.set`, `apps/worker/src/services/Accounts.ts:35`; used verbatim by `PUT /api/v1/me/profile`, `apps/worker/src/handlers/profile.ts:44-49`). No new write path into `profiles` is introduced. Not client-side merge via `PUT /api/v1/me/profile`, because:

1. The web client edits an **edit-buffer copy**, not the record (`apps/web/src/profile/Model.ts:18-22`); merging client-side means refetch `/me` → apply one field → re-upload the whole CV: three round trips and a lost-update window against any concurrent tab saving the form.
2. The proposal row must flip `pending→accepted` together with the merge. Doing both in one handler makes "no accepted proposal without a merged value, no value merged from a discarded proposal" an invariant of one code path instead of a protocol the client must remember.
3. `Profile` itself carries no per-field provenance (`packages/domain/src/Profile.ts:38-47`; confirmed by WS-0015 §2 stage 2 and §3(a)), so confirmed values write through the existing contract exactly as WS-0015 §3(a) prescribes (`work/WS-0015-r1-closed-loop-assistance.md:70-75`); the durable provenance lives in the `proposals` row, not in the profile.

## Non-goals

- **No Firecrawl integration** of any kind — no dependency, no client, no egress; the escalation tier waits on operator data-processor approval (`work/WS-0015-r1-closed-loop-assistance.md:162-172`). Only the `Extraction` interface below anticipates it.
- **No `.docx`** (or .doc/ODF/RTF/etc.) ingestion — OQ-1 defers it (`:274`).
- **No raw-document retention** — no raw-content column, no document table, no blob store, no log line carrying document text or bytes; parse happens inside the create-proposals handler and the bytes are garbage afterwards.
- **No autonomous anything** — inference only ever *proposes*; nothing writes to the profile without a human decision message; principle 2/3 of `vision.md` (automate repetition, not authority) as restated in WS-0015 §5.
- **No changes to existing export/draft/match behavior** — `GET /api/v1/me/profile/export`, drafting, and matching keep reading `profiles`/`answers` exactly as today; they gain nothing and lose nothing; the only observable difference is that a confirmed merge changes the profile a person deliberately accepted.
- No answer (`answers` table) proposals — S1 scopes profile facts only (headline, summary, location, languages, skills, experience, education, preferences); question/answer proposals belong to a later slice.
- No vision/OCR pass for scanned PDFs — an image-only PDF yields zero extractable text → empty proposal set with a human-readable reason, not a model image call (that escalation belongs to the Firecrawl-tier decision).
- No infra change: `infra/**` untouched; the optional Workers AI binding is provisioned by a later operator step when the model tier is switched on (see Open questions). Until then `ModelInference` is exercised by test doubles only.
- No new npm dependency besides `unpdf` (pinned `1.8.1`, the empirically probed version).
- No overlay/dialog primitive, no i18n, no design-system work (freeze per WS-0013-r1 rule 4).

## Domain mapping

Not applicable — no cross-domain port in this slice. The mapping work is field-path alignment between free text and the existing `Profile` shape (`packages/domain/src/Profile.ts:38-47`), which is specified in the field-path grammar below, not a domain translation table.

## Schema and migration plan

Order is fixed: **domain model first**, regenerate snapshot, emit migration — the generated snapshot is derived from models (`db/schema.sql:1-4`: "Nothing else may edit this file"), and `scripts/ts/schema.ts` verifies keys/indexes against model fields and runs the file through a real SQLite engine in tests (`scripts/ts/schema.ts:10-20`).

### Domain model — new `packages/domain/src/Proposals.ts`

Following the `Submission`/`DeliveryPlatform` `Model.Class` precedents (`packages/domain/src/Delivery.ts:53-88`):

```ts
export const SourceKind   = Schema.Literals(["text", "pdf"]);
export const ProposalStatus = Schema.Literals(["pending", "accepted", "discarded"]);
export const Confidence   = Schema.Literals(["high", "medium", "low"]);
export const Engine       = Schema.Literals(["heuristic", "model"]);

/**
 * Where a proposal lands in the profile. Grammar, validated against this
 * array; `targetOf(path)` is the one place that maps a path to the schema its
 * value must satisfy — the decision endpoint decodes edited values against it.
 */
// "headline" | "summary" | "location" | "languages"
// | `skills.${number}` | `education.${number}`
// | `experience.${number}`
// | `preferences.desiredRoles.${number}`
// | `preferences.desiredLocations.${number}`
// | `preferences.excludedTerms.${number}`

export class Proposal extends Model.Class<Proposal>("Proposal")({
  id: ProposalId,                    // new brand in packages/domain/src/Ids.ts
  profileId: ProfileId,
  sourceKind: SourceKind,
  fieldPath: Schema.String,          // grammar above; validated by targetOf
  proposedValue: Model.JsonFromString(Schema.Unknown), // JSON text in the column
  evidenceExcerpt: Schema.String,    // <= 300 chars, clamped at creation
  confidence: Confidence,
  engine: Engine,
  status: ProposalStatus,
  createdAt: Model.DateTimeInsert,
  decidedAt: Model.FieldOption(Schema.String), // same nullable pattern as learnedAt, Delivery.ts:62
}) {}
```

`confidence` and `engine` are deliberate additions beyond the minimal column list in the directive: the slice text requires a confidence label per proposal and the engine marking is what keeps "which machine said this" auditable. `ProposalId` joins the branded ids (`packages/domain/src/Ids.ts:13-65`). Export from the domain barrel per its existing pattern.

### Table DDL sketch (what regeneration emits)

```sql
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT NOT NULL,
  profileId TEXT NOT NULL,
  sourceKind TEXT NOT NULL CHECK (sourceKind IN ('text','pdf')),
  fieldPath TEXT NOT NULL,
  proposedValue TEXT NOT NULL,
  evidenceExcerpt TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  engine TEXT NOT NULL DEFAULT 'heuristic' CHECK (engine IN ('heuristic','model')),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','discarded')),
  createdAt TEXT NOT NULL,
  decidedAt TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_profileId_status ON proposals (profileId, status);
```

The CHECK forms mirror the declared-type precedent (`tierTag`/`policyTag`/`hydrationTag` in `db/schema.sql:119-144`). **No raw-document column exists** — `proposedValue` holds one structured fact, `evidenceExcerpt` a ≤300-char quote; that is derived, owner-scoped, erasure-purged data of the same kind the profile already stores, not a retained document.

### Regeneration commands (exact sequence)

1. `scripts/ts/schema.ts` gains: the `Proposal` import; `columnTypes` entries for all eleven columns (with the CHECK strings above); a `tables` entry `{ model: Proposal, primaryKey: ["id"], indexes: [["profileId", "status"]] }`; and a `migrations` array append mirroring the 0001 pattern (`scripts/ts/schema.ts:382-387`):

   ```ts
   {
     name: "0002_profile-proposals.sql",
     currentWhen: "EXISTS (SELECT 1 FROM pragma_table_info('proposals') WHERE name = 'decidedAt')",
   },
   ```

2. `bun run schema` (writes `db/schema.sql`), then `bun run schema:check` (drift gate), then `bun run catalog:check` (must stay green; the source catalog is untouched).
3. New migration `db/migrations/0002_profile-proposals.sql` containing the `CREATE TABLE IF NOT EXISTS proposals …` + index statements above, headed by a comment in the voice of `db/migrations/0001_saved-workspace.sql:1-5` (fresh databases get the table from the snapshot, which pre-marks the migration via `currentWhen`; existing databases are migrated by Wrangler after the snapshot runs).
4. Erasure registration — mandatory, and mechanically enforced: `apps/worker/src/db/Erase.ts:70-95` purges every `profileId`-bearing table and `Erase.test.ts` derives its coverage check from `db/schema.sql` itself (`apps/worker/src/db/Erase.ts:87-95`), so a forgotten `proposals` purge fails the suite. Add `{ table: "proposals", write: Proposals.deleteByProfileWrite }` to `purges` and a `deleteByProfileWrite` to the new repository (`apps/worker/src/db/repositories/Submissions.ts:77-78` is the pattern).

## Route contracts

New authenticated group `proposals` in `apps/worker/src/Api.ts`, following the `feed` group's shape (endpoints + `.middleware(Authenticated)`, `apps/worker/src/Api.ts:303-322`) and the error-taxonomy classes at the top of the same file (`UpgradeRequired`, `NotFound`, `Unauthorized`, `apps/worker/src/Api.ts:61-106`). Wired in `handlers/index.ts` and the handler merge in `src/index.ts:92-101`.

Two new error classes beside the existing ones (per-case 4xx classes are house style — cf. `LabelConflict` 409, `ReservedLabelMutation` 400):

- `UnsupportedDocument` — `{ message: string }`, httpApiStatus **400**: mime not in the supported pair, size over bound, or extraction failure.
- `ProposalAlreadyDecided` — `{ id: string, status: string }`, httpApiStatus **409**.

`NotFound` (404) is reused for a proposal id that does not exist or belongs to another profile.

### POST /api/v1/me/profile/proposals

Payload:

```ts
{
  content: Schema.String,                                  // text/plain: UTF-8 text (<= 200_000 chars);
                                                           // application/pdf: base64 of the bytes (decoded <= 512 KiB)
  mimeType: Schema.Literals(["text/plain", "application/pdf"]),
  engine: Schema.optional(Schema.Literals(["heuristic", "model"])), // default "heuristic"
}
```

Success `200`:

```ts
{
  data: ReadonlyArray<{
    id: string, sourceKind: "text" | "pdf", fieldPath: string,
    proposedValue: string,        // JSON text; fieldPath names its shape (heterogeneous leaves travel as one encoding end to end)
    evidenceExcerpt: string,      // the quote from the document this came from
    confidence: "high" | "medium" | "low",
    engine: "heuristic" | "model",
    status: "pending", createdAt: string,
  }>,
  downgradeReason: Schema.optional(Schema.String), // present when engine "model" was requested+entitled but the model engine is unbound; heuristics ran instead (downgrade precedent: applications.downgradeReason, db/schema.sql:207)
}
```

Errors: `Unauthorized` | `UnsupportedDocument` | **`UpgradeRequired`** (only when `engine: "model"`).

Semantics: extraction and inference run entirely inside this handler against the request body — bytes/text never outlive the invocation (OQ-4). Empty extraction result is a `200` with `{ data: [] }` (nothing to review is not an error). Proposal count capped at 64 per submission; excess silently truncated (bounded response).

Entitlement gate — exact `model-drafting` precedent (`apps/worker/src/handlers/applications.ts:100-109`, tested at `handlers/applications.test.ts:205-215`): when `engine === "model"`, `entitlements.require(principal.profileId, "model-inference")`, catching `EntitlementRequired` → `UpgradeRequired({ capability })`. The heuristic tier is never gated: default requests touch no entitlement check at all.

### GET /api/v1/me/profile/proposals

Success `200`: `{ data: [same proposal view] }` — **pending rows only**, ordered `createdAt DESC`. Decided rows stay in the table as audit trail but no route ever serves them again; "discard hides forever" is therefore structural (there is no query parameter that resurrects them). Errors: `Unauthorized`.

### POST /api/v1/me/profile/proposals/:id/decision

Params `{ id }`; payload:

```ts
{
  decision: Schema.Literals(["accepted", "discarded"]),
  value: Schema.optional(Schema.String), // JSON text; allowed only with "accepted";
                                         // decoded against targetOf(fieldPath) — failure => 400
}
```

Success `200`: `{ decision: "accepted" | "discarded", profile: Profile }` — the post-merge profile, so the web updates its buffer in one round trip (the cluster already rebuilds its form from a `Profile` via `ProfileFormCodec.fromProfile`, `apps/web/src/profile/update.ts:135-142`).

Errors: `Unauthorized` | `NotFound` | `ProposalAlreadyDecided` | **`InvalidProposalValue`** `{ fieldPath: string, message: string }`, 400 — value-decode failure against `targetOf(fieldPath)` is its own case rather than overloading `InvalidProfileJson`, which names profile imports. Three new error classes total across the group (`UnsupportedDocument`, `ProposalAlreadyDecided`, `InvalidProposalValue`); every other failure reuses the existing taxonomy.

Merge semantics on accept (the normative core):

- Scalar paths (`headline`, `summary`, `location`, `languages`): replace the field.
- Array-item paths (`skills.N`, `education.N`, `preferences.*.N`): **append** the value to the corresponding array (preferences start from `preferencesOf(profile)`, `packages/domain/src/Profile.ts:51-53`). No silent dedupe — duplicates are the reviewer's call, not the machine's.
- `experience.N`: append the whole `Experience` object (`title/employer/period/highlights[]`, `packages/domain/src/Profile.ts:16-21`).
- The merge calls `Profiles.set(profileId, merged)` — the identical validation and `updatedAt` behavior as `PUT /api/v1/me/profile`; then marks the row `accepted` + `decidedAt`. Discard marks `discarded` + `decidedAt` and touches nothing else.

A subsequent `GET /api/v1/me` reflects merged values automatically (it reads `Profiles.get`, `handlers/profile.ts:28-43`).

## Inference engine interface and layer binding

### Extraction seam (Firecrawl-ready, no Firecrawl)

`apps/worker/src/services/Extraction.ts`:

```ts
export interface ExtractedText { readonly text: string; readonly sourceKind: SourceKind }
export class Extraction extends Context.Service<Extraction, {
  readonly extract: (input: { content: string; mimeType: "text/plain" | "application/pdf" })
    => Effect.Effect<ExtractedText, UnsupportedDocumentShape>;
}>()("@job-index/Extraction") {}
```

Single binding `UnpdfExtraction` (`apps/worker/src/extraction/index.ts`): `text/plain` passes through; `application/pdf` base64-decodes and calls `unpdf`'s serverless `extractText` (probe-verified path, WS-0015 §4 S1 PDF tooling direction). Size bounds enforced here. A future `FirecrawlExtraction` satisfies the same tag; handlers never learn which parser ran.

### Inference engines

`apps/worker/src/services/Inference.ts` — a `Drafting`-style tag (`apps/worker/src/services/Drafting.ts:34-42`):

```ts
export interface ProposalDraft {           // in-memory, pre-id, pre-status
  readonly fieldPath: string;
  readonly proposedValue: unknown;          // validated against targetOf(fieldPath) before persistence
  readonly evidenceExcerpt: string;
  readonly confidence: Confidence;
}
export class HeuristicInference extends Context.Service<HeuristicInference, {
  readonly propose: (text: string) => Effect.Effect<ReadonlyArray<ProposalDraft>>;
}>()("@job-index/HeuristicInference") {}
export class ModelInference extends Context.Service<ModelInference, {
  readonly propose: (text: string) => Effect.Effect<ReadonlyArray<ProposalDraft>, ModelUnavailable>;
}>()("@job-index/ModelInference") {}
```

- `HeuristicInference` (`apps/worker/src/inference/heuristic/index.ts`): pure deterministic function — normalize newlines, detect bilingual EN/NO section headings (EXPERIENCE/ARBEIDSERFARING, EDUCATION/UTDANNING, SKILLS/FERDIGHETER, SUMMARY/SAMMENDRAG/OM MEG, LANGUAGES/SPRÅK), split skills/education on bullets/commas, split experience entries on date-range/blank-line boundaries capturing `period` verbatim, headline = first non-empty line ≤ 80 chars. Confidence: heading-anchored → `high`, structure-inferred → `medium`, date-pattern guesses → `low`; preferences only from explicit "seeking/ønsker"-style lines. No clock, no randomness: identical input ⇒ byte-identical proposal sets.
- `ModelInference` (`apps/worker/src/inference/model/index.ts`): prompts for a JSON array of `{fieldPath, proposedValue, evidenceExcerpt, confidence}`, validates each item against the same `targetOf` map, drops malformed items individually; Workers AI model id is a named module constant with selection rationale in its docstring. Any model-call failure fails with `ModelUnavailable` — the handler then serves heuristic proposals plus `downgradeReason` (never a 5xx for a premium feature that can degrade).

### Layer wiring — `apps/worker/src/runtime/Layers.ts`

Both engines join the `leaves` merge beside `draftingLayer` (`runtime/Layers.ts:135-141`), and both tags join the `Services` union (`:90-104`):

```ts
const modelEngineLayer = env.AI === undefined
  ? Layer.succeed(ModelInference, modelUnavailableStub)   // fails with ModelUnavailable
  : Layer.succeed(ModelInference, makeWorkersAiInference(env.AI));
const inferenceLayers = Layer.mergeAll(heuristicEngineLayer, modelEngineLayer, extractionLayer);
```

`runtime/Env.ts` gains an **optional** `readonly AI?: unknown` binding, duck-typed the way `isD1`/`isSourceLeaseNamespace` are (`runtime/Env.ts:45-58`); absence never trips `EnvironmentIncomplete`. Per-request selection is entitlement-driven in the handler (capability `model-inference`), exactly as the `model-drafting` gate sits in the handler rather than the layer (`handlers/applications.ts:74-78`); the layer merely decides what *exists*.

### Capability registration — four sites, all touched

Adding `"model-inference"` follows the literal everywhere it is enumerated: `packages/domain/src/Subscription.ts:25-31` (schema literal), `packages/domain/src/decide/Access.ts:26-28` (`grants.Premium`), `apps/worker/src/services/Entitlements.ts:17-21` (union), `apps/worker/src/handlers/profile.ts:19-24` (`ALL_CAPABILITIES`, so `/me` advertises it). Free accounts hold nothing (`permits({_tag:"Free"}, …) === false` is property-tested, `packages/domain/src/decide/Access.test.ts:80-94`) — the free heuristic tier needs no capability at all.

## Web integration points (exact files)

Everything lives in the profile cluster's Model/Message/update/view split (`apps/web/src/profile/*`), plus `Commands.ts` for the three server calls (precedent: `FetchProfile` `apps/web/src/Commands.ts:171-184`, `SaveProfile` `:186-205`). The typed client needs no change — `Client.ts` builds from `api`, which gains the group automatically.

- `apps/web/src/profile/Model.ts` — add `proposals: ProposalAsyncData` (AsyncData over a `ProposalsResponse` schema mirroring the route success shape), `importText: string`, `importFileName: Option<string>`, `importBase64: Option<string>`, `importing: RequestStatus`, `editedValues: Record<string, string>` (proposal id → edited JSON text), and init values. `MeResponse` stays untouched (`Model.ts:14`).
- `apps/web/src/profile/Message.ts` — add, in the cluster's prefix-free naming convention (`Message.ts:8-12`): `ImportTextChanged`, `ImportFileSelected { name, base64 }` (file bytes base64-encoded at the event boundary — Command/Message args are Schema fields), `ImportClicked`, `ImportSucceeded { data }`, `ImportFailed { problem }`, `ProposalsRequested`, `ProposalsFetchSucceeded { data }`, `ProposalsFetchFailed { problem }`, `ProposalEditChanged { id, value }`, `ProposalDecided { id, decision }`, `ProposalDecisionSucceeded { id, response }`, `ProposalDecisionFailed { id, problem }`; extend the union (`Message.ts:52-73`).
- `apps/web/src/profile/update.ts` — arms for each; `ImportClicked` schedules `Commands.ImportProfileDocument`; `ProposalDecisionSucceeded` drops the row locally, clears its edit state, and rebuilds the form buffer from `response.profile` (the `SaveSucceeded` pattern, `update.ts:135-142`); `ImportSucceeded` stores the queue and schedules the fetch refresh. No `OutMessage` channel (none needed, per `update.ts:15-23`).
- `apps/web/src/view.ts`-side rendering goes in `apps/web/src/profile/view.ts` — an **"Import from past document"** card (textarea + `input[type=file] accept=".pdf,.txt"` + submit button) rendered inside the authenticated branch above `profileForm` (`view.ts:305-330`), followed by the **proposal review queue**: one card per pending proposal showing the field path, the inferred badge (token-styled chip: `bg-secondary-container text-on-secondary-container`), the evidence quote as a blockquote, the confidence label, and Edit (inline input populating `editedValues`)/Accept/Discard controls. All styling via existing semantic tokens and `Shared.ts` helpers — **zero new CSS** (WS-0013 criterion (a) grep must stay at zero).
- `apps/web/src/Commands.ts` — `ImportProfileDocument { content, mimeType, engine? }` → `POST …/proposals` (completions `ImportSucceeded`/`ImportFailed`); `FetchProposals` → GET (completions `ProposalsFetch*`); `DecideProposal { id, decision, value? }` (completions `ProposalDecisionSucceeded`/`…Failed`). 402 surfaces through the existing problem rendering — the card shows an upgrade notice naming `model-inference` when the model toggle is refused.
- `apps/web/src/profile/index.ts` — extend the explicit barrel (`index.ts:7-32`).
- Untouched: root `Message.ts`/`update.ts`/`main.ts` (all completions land inside the cluster union — `ThemePersisted` precedent, `Message.ts:45-50`), `Route.ts`, `Session.ts`, `styles.css`, `view/Shared.ts`.

## Acceptance criteria (each independently checkable)

- [ ] **(a) Heuristic extractor unit tests** (`apps/worker/src/inference/heuristic/heuristic.test.ts`) against a realistic multi-section pasted-CV fixture embedded in the file: extracts headline, summary, ≥3 skills, ≥2 experience entries with title/employer/period, ≥1 education line, and a preference line; determinism — running twice yields deep-equal proposal sets; garbage/empty input yields `[]` without throwing; every draft's `fieldPath` validates against `targetOf`.
- [ ] **(b) Proposal lifecycle tests** (`db/repositories/Proposals.test.ts` on the live-SQLite TestLayer, `Answers.test.ts` pattern, plus `handlers/proposals.test.ts` through the full HttpApi stack with `testSupport.ts` fakes): accept merges the value through `Profiles.set` (visible in `GET /api/v1/me`) and marks `accepted` + `decidedAt`; discard marks `discarded` and the value never reaches the profile; GET serves pending only — after a decision the row is unreachable by any route; accept-with-edited-value persists the edited value; double decision → 409 `ProposalAlreadyDecided`; another profile's proposal id → 404.
- [ ] **(c) Transient-parse proof.** All four greps report exactly the expected result, transcripts archived:
  1. `grep -rniE "rawdoc|raw_doc|document_bytes|sourcecontent|cv_blob" db/schema.sql packages/domain/src apps/worker/src` → **zero matches**;
  2. `grep -c "CREATE TABLE" db/schema.sql` → 23 (22 prior + `proposals`), and the emitted `proposals` DDL contains no column beyond the eleven above (no `content`, `bytes`, `raw*`, `text` column);
  3. `grep -rn "INSERT INTO" apps/worker/src/db/repositories/Proposals.ts` → the sole insert targets `proposals` with the fixed column list; `grep -rn "FROM proposals" apps/worker/src` → reads only in `repositories/Proposals.ts`;
  4. `grep -rn "extractText\|atob\|base64" apps/worker/src/extraction apps/worker/src/handlers/proposals.ts` → call sites confined to the extraction module and the create handler (request-scoped), none in repositories, export, drafting, or match code.
- [ ] **(d) PDF ingestion tests:** an integration test posts a minimal valid PDF (embedded base64 fixture) with `application/pdf` and receives proposals; `text/plain` passthrough; `text/docx` mime → 400 `UnsupportedDocument`; oversized content → 400 `UnsupportedDocument`; corrupt PDF bytes → 400 `UnsupportedDocument` (never a 500).
- [ ] **(e) 402 path:** `POST …/proposals` with `engine: "model"` and no capability → `402 {"_tag":"UpgradeRequired","capability":"model-inference"}` (assertion mirrors `handlers/applications.test.ts:211-215`); with a granting `Entitlements` fake the `ModelInference` fake is invoked and its proposals carry `engine: "model"`; entitled-but-unbound engine → heuristic proposals + `downgradeReason` present; default (no engine field) never consults `Entitlements`.
- [ ] **(f) Capability wiring:** `permits({_tag:"Free"}, "model-inference") === false`, Premium `true` (extends `decide/Access.test.ts`); `GET /api/v1/me` `capabilities` includes `model-inference` for a granting fake (`handlers/profile.test.ts:40-59` pattern).
- [ ] **(g) Schema/migration:** `bun run schema && bun run schema:check && bun run catalog:check` green; `db/migrations/0002_profile-proposals.sql` exists and matches the emitted DDL; the worker SQLite-schema test (`apps/worker/src/db/Sqlite.ts` runs the snapshot, `scripts/ts/schema.ts:14-16`) and `Erase.test.ts` (now covering `proposals`) pass inside `coverage:all`.
- [ ] **(h) `bun run check` fully green** (fmt:check, lint, imports:check, typecheck, schema:check, catalog:check, bundle:check — proving `unpdf` bundles under the worker browser target — and coverage:all).
- [ ] **(i) E2e journey** — new `e2e/profile-import.spec.ts` in the `shortlist.spec.ts` style (`signIn` helper, `assertAccessible` Axe checkpoints at every screen, `e2e/shortlist.spec.ts:6-15`): sign in → Profile → paste CV text into the import card → proposals appear each with inferred badge + evidence quote → edit one proposal's value and accept it → accept a second → discard the rest → reload → the profile form shows the merged values → reload of GET shows the discarded ones gone → `assertAccessible` clean throughout. Existing `e2e/shortlist.spec.ts` passes **unmodified** (`playwright.config.ts` untouched).
- [ ] **(j) No leakage into existing consumers:** `GET /api/v1/me/profile/export` output for a profile with pending proposals is byte-identical to the same profile's export before the slice (test asserting export equality pre/post proposal creation); drafting and match tests pass untouched.

## Explicit forbidden paths

Everything outside the following is forbidden to create, modify, or delete:

- `work/WS-0016-r1-document-profile-inference.md` (this doc's revision).
- `packages/domain/src/**` — additive: new `Proposals.ts`; edits confined to `Ids.ts` (brand), `Subscription.ts` (literal), `decide/Access.ts` (grant), `index.ts` (barrel).
- `apps/worker/src/**` — `Api.ts` (group + error classes), `handlers/proposals.ts` (new) + `handlers/index.ts` + `src/index.ts` (wiring) + `handlers/testSupport.ts` (fakes) + their `*.test.ts`, `services/{Extraction,Inference}.ts` (new), `inference/` and `extraction/` (new), `db/repositories/Proposals.ts` (new) + test, `db/Erase.ts` (purge entry), `runtime/{Layers,Env}.ts`.
- `scripts/ts/schema.ts` (imports, `columnTypes`, `tables`, `migrations`) and its generated output `db/schema.sql`.
- `db/migrations/0002_profile-proposals.sql` (new file only; `0001` untouchable).
- `apps/web/src/profile/**` and `apps/web/src/Commands.ts`.
- Root `package.json` + `bun.lock` — **solely** to add `"unpdf": "1.8.1"` to dependencies. Any other manifest change is a deviation.
- `e2e/` — new `profile-import.spec.ts`; `playwright.config.ts` and `shortlist.spec.ts` read-only.

Explicitly forbidden even though adjacent: `infra/**`, `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, `openapi/**`, `apps/web/src` outside the listed files (including `styles.css`, `view/Shared.ts`, `Route.ts`, `Client.ts`, root `Message.ts`/`update.ts`/`main.ts`), `packages/adapters/**`, dot-files, lockfile churn beyond the `unpdf` entry. Package installation beyond the single pinned dependency is prohibited. **No git mutations of any kind** (`git add/reset/commit/stash` included — the tree carries 4 unpushed commits and must stay byte-clean-tracked); no network calls to Cloudflare/NAV/Firecrawl.

## Rollback

Single-revert, additive-only. Every product change is a new file plus enumerated small edits; reverting the integration commit restores the prior Worker and UI exactly. Database: `profiles`/`answers` are never altered, so no data operation exists to undo — the leftover `proposals` table and its `d1_migrations` marker are inert to older code (the snapshot's `IF NOT EXISTS` regeneration tolerates the table's presence, the same property `db/schema.sql:439-457` already guarantees for 0001). Post-revert, `bun run schema:check` must be re-run green after the domain model reverts. Worst-case data residue — decided proposal values — lives inside the person's own profile, which predates the slice.

## Required evidence

- Full-pass logs: `bun run check`, `bun run e2e`.
- Transcripts for criteria (c) greps and (g) regeneration sequence.
- Lifecycle + 402 test transcripts (criteria b, e) and PDF/error-path transcripts (d).
- Export-equality proof (j).
- Screenshots: import card with pasted text, proposal queue showing inferred badge + evidence quote + confidence label, post-acceptance merged form.
- Diff stat confirming touched-path confinement to the allowed list.

## Supersedes

Nothing. First frozen scope for WS-0016; executes WS-0015-r1 §4 S1 under the §6 resolutions (OQ-1, OQ-2, OQ-4), which it leaves intact.

## Open questions for the lead

1. **Workers AI binding timing:** this scope deliberately excludes `infra/**`, so `env.AI` is provisioned by a later operator step. Should the binding be added to staging at the next scheduled deploy so the model tier is live immediately after this slice's integration, or stay unprovisioned until the model prompt quality is reviewed? (Either answer works: until bound, entitled accounts transparently receive heuristic proposals + `downgradeReason`.)
   **Resolved by lead 2026-08-24:** binding deferred until model prompt quality is reviewed; the heuristic tier carries the slice's user value; provisioning is a later operator step. `infra/**` is untouched; `env.AI` remains absent this slice, so every production request takes the heuristic + `downgradeReason` path while the model tier stays exercisable through test doubles.

## Deviations from r1

Lead authorization temporarily adds intent-to-add entries for the explicit WS-0016 new-file list. This lets the git-index-based imports checker inspect them.

After the checks, the same paths are reset. No file content is staged, and no commit is created.

`e2e/shortlist.spec.ts:65` had a strict-mode failure. Its global visible selector resolved to the feed and detail assessments.

Line 65 now uses `page.locator("[data-match-assessment]").last()` to select the detail assessment. The existing fit and text assertions did not change.

The observed full e2e suite passed 2/2 after this one-line test change.

The lead authorized an R2 correctness deviation for profile writes. Proposal acceptance now uses an owner-scoped, affected-row D1 CAS batch against the current profile.

All whole-profile replacements now use optimistic profile versions. A stale replacement returns a typed 409 and does not retry.

An empty or image-only PDF now returns stable OCR-unavailable feedback. It no longer returns a silent empty success.

The lead authorized `.artifacts/ws-0016/**` only for the evidence required at lines 300-307.

`apps/web/src/update.test.ts` received fixture-only maintenance: the legacy `/me` response fixture now includes `profileUpdatedAt: null`, as required by the versioned response contract. This changes no product behavior.

After the independent review, the lead authorized one narrowly bounded second remediation beyond the original attempt budget. It changes only Profile UI request causality and dirty-buffer preservation, the plain-text browser preflight to 800,000 raw bytes followed by the existing 200,000-character contract, focused tests, and this deviation/evidence record; no server, domain, schema, migration, inference, or entitlement behavior changes.
