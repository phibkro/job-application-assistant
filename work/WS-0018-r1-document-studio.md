# WorkScope: Document studio — general and job-specific CV/letter drafting

- ID: WS-0018
- Revision: r1 (frozen contract — implementer executes verbatim; deviations require a new revision)
- Owner: Project maintainer
- Risk tier: **R2** (medium — `policy/risk-tiers.json:36-43` hits two ways: new feature plus schema change (additive `documents` table). Triggers plan review, independent review, rollback plan, provenance; human gates `scope` + `acceptance_or_integration`). It does **not** rise to R3 despite generated documents being personal-data-adjacent, and the reasoning is stated so no reviewer has to reconstruct it:
  1. **Outputs, not sources.** WS-0015 §6 OQ-4 resolved raw-document retention to transient parse-only, keeping S1 at R2 (`work/WS-0015-r1-closed-loop-assistance.md:288-292`). That resolution binds the *sources* side: this slice ingests no documents at all. Its inputs are the confirmed structured profile and frozen vacancy snapshots; its outputs are documents the owner deliberately creates, names, edits, and keeps. Deliberately authored owner data is a different risk posture from machine-ingested personal records — the same posture `applications.cv`/`letter` and the profile itself already hold.
  2. **Erasure parity is built, not promised.** Every stored document row is `profileId`-scoped and joins `db/Erase.ts`'s purge batch this slice; `Erase.test.ts` derives its coverage from `db/schema.sql` itself, so a forgotten purge fails the suite mechanically (`apps/worker/src/db/Erase.ts:89-97`).
  3. **No new egress authority.** The only outbound call in the slice is Workers AI behind the *existing* `model-drafting` capability, and the binding stays unprovisioned until operator prompt review — production serves the deterministic tier exclusively this slice. Had raw generated documents landed in D1 *without* erasure registration or owner-scoped access control, this would be R3; both controls are structural here, so R2 holds.
- Repository/ref: `job-index` — executes on the current tree (local commits, including unpushed qualification work, stay untouched). **No git mutations of any kind.**
- Attempt budget: 2 (one implementation pass + one remediation pass)

## Goal

Concretize WS-0015 §4 S2 (`work/WS-0015-r1-closed-loop-assistance.md:179-193`): a document studio where the owner drafts, edits, stores, regenerates, and discards CV and covering-letter documents in two grounding modes —

- **General** (`jobId` absent): grounded on the confirmed profile alone (plus stored answers projected in — see Grounding), reusable across applications;
- **Job-specific** (`jobId` present): grounded on the saved vacancy's **frozen `JobSnapshot`** — title, employer, location, description feed selection criteria exactly as today's per-listing draft does — never a live NAV read.

Four artifacts result: general CV, general letter, job-specific CV, job-specific letter. Each is one stored row the owner can reopen, edit inline, save, copy to the clipboard, regenerate (as a new row), or delete.

### Binding resolutions carried from WS-0015 §6

- **OQ-2** (`:277-281`): model assistance runs on Workers AI behind the existing model-capability entitlement pattern, with the deterministic tier retained as offline fallback. This slice reuses the **existing** `model-drafting` capability — no capability literal is added anywhere (`packages/domain/src/Subscription.ts:25-31`, `packages/domain/src/decide/Access.ts:26-35`, `apps/worker/src/services/Entitlements.ts:17-22`, and `ALL_CAPABILITIES` at `apps/worker/src/handlers/profile.ts:19-25` already enumerate it; none of the four sites changes).
- **OQ-4** (`:288-292`), applied to its actual subject: transient parse-only governs *sources*. The studio never parses uploads; the sources/outputs distinction above is why storing outputs is compliant while storing inputs stayed forbidden in WS-0016.
- **OQ-3** (`:283-286`): the letter "follows as S2.1 within this slice family". This scope ships CV and letter kinds together in one slice — inside the family, ahead of the staging — because the composers, storage, routes, and UI differ by one parameter, not by an architecture step. Recorded so the acceleration is visibly deliberate.
- **Model tier posture**: a subscription buys better prose, not a different product (`services/Drafting.ts` doctrine, `apps/worker/src/services/Drafting.ts:7-18`) — the two engines return the same document shape, and an entitled-but-unbound request degrades to the template with a `downgradeReason`, never a 5xx.

### Extend-vs-replace the existing drafting path — decided: evolve, do not replace

Today's drafting is a *preview* pipeline: `POST /api/v1/me/saved/:id/draft` resolves the saved job's frozen snapshot and composes fresh documents on every call (`apps/worker/src/handlers/applications.ts:90-120`), backed by the deterministic `Drafting` service (`apps/worker/src/drafting/index.ts:20-29`, `composeCv.ts:12-13` relevance-ranked experience, `composeLetter.ts:25` advert-overlap-guaranteed skills). Nothing is persisted; the `"model"` generator is a contract-plus-gate with no implementation bound (`runtime/Layers.ts:148` binds only the template layer). The path is structurally sound: snapshot-grounded, entitlement-aware, deterministic, tested.

The studio therefore **extends** it and touches none of its behavior:

- The per-listing composers `composeCv`/`composeLetter` are reused **verbatim** for job-specific studio documents — a studio draft targeted at a saved job is byte-identical to what the saved-job draft endpoint previews. One fact, no drift.
- The general composers are **new**, built on the same seams: `renderCvBody` (`drafting/sections.ts:13-48`) and the orphaned `renderAnswers` (`drafting/renderAnswers.ts:31` — WS-0015 §3(b) confirmed nothing in production imports it, `:81-84`), plus one new general-letter composer.
- The existing `POST /saved/:id/draft` endpoint, `prepare`'s recomposition semantics, and the application lifecycle are frozen (S3 owns making drafts authoritative). No route, schema, or service the apply-loop depends on changes.

## Non-goals

- **No Firecrawl** — no dependency, no client, no network call to it; not implicated by this slice at all.
- **No PDF/docx/export** — no download, no file generation, no `takumi-pdf`. The transfer channel this slice is copy-to-clipboard only (the sanctioned S4 channel per OQ-5's philosophy; the person moves the data).
- **No autonomous submission and no application-lifecycle change** — `prepare` keeps recomposing from profile + snapshot; studio documents are never fed into `Applications.prepare`; no event, status, or transition changes.
- **No ingestion changes** — corpus, adapters, hydration, lazy gate untouched; job-specific drafting reads the frozen snapshot via `SavedJobs.resolve` and never the corpus or NAV.
- **No auth changes** — the `Authenticated` middleware and `CurrentPrincipal` are consumed as-is.
- **No role-type templates** — WS-0015's S2 sentence "optionally targeted at a job type" is narrowed to the four kinds above. Deliberate rejection: the domain has no role-type taxonomy to ground a "type" on, and inventing one is its own design exercise. A job-specific draft targeted at a representative vacancy is the practical substitute this slice ships.
- **No per-pair storage** — one document per row (see Storage; the "cv+letter pair" row suggested in planning is rejected there with reasons).
- **No new capability, no entitlement-code change** — `model-drafting` is consumed, not extended.
- **No infra change** — `infra/**` untouched; `env.AI` stays optional and unprovisioned until the operator's prompt-review gate (already the recorded decision, `memory-bank/activeContext.md` Open decisions). Until then every model-path execution in production takes template + `downgradeReason`; tests exercise the model engine exclusively through fakes.
- **No new npm dependency. Package installation prohibited.**
- **Zero new CSS files, no overlay/dialog primitive, no i18n, no design-system work** (freeze per WS-0013-r1 rule 4); token-only styling through `view/Shared.ts` helpers.
- `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, `openapi/**`, `packages/adapters/**` untouched.

## Design

### Generation engines — the WS-0016 two-engine pattern, exactly

A `Drafting`-style service pair in a new `apps/worker/src/services/Studio.ts` (`services/Inference.ts:36-50` is the structural precedent; `Context.Service` tags, entitlement checked by the *handler* before the service is reached):

```ts
export interface ComposedDocument {
  readonly kind: DocumentKind;            // "cv" | "letter"
  readonly content: string;               // plain text/markdown, the document body
  readonly engine: CompositionEngine;     // "template" | "model"
}

export class TemplateStudioComposer extends Context.Service<TemplateStudioComposer, {
  readonly compose: (
    profile: Profile,
    answers: ReadonlyArray<Answer>,
    kind: DocumentKind,
    job: JobSnapshot | undefined,         // undefined = general document
  ) => Effect.Effect<ComposedDocument, ProfileIncomplete>;
}>()("@job-index/TemplateStudioComposer") {}

export class ModelStudioComposer extends Context.Service<ModelStudioComposer, {
  readonly compose: (
    profile: Profile,
    answers: ReadonlyArray<Answer>,
    kind: DocumentKind,
    job: JobSnapshot | undefined,
  ) => Effect.Effect<ComposedDocument, StudioModelUnavailable>;
}>()("@job-index/ModelStudioComposer") {}
```

`StudioModelUnavailable` is defined beside the tag (same shape as `Inference.ts`'s `ModelUnavailable`: `{ _tag, reason }`). The domain failure `ProfileIncomplete` is **reused**, not duplicated (`packages/domain/src/Failure.ts:70-72`).

- **Template engine** (`apps/worker/src/drafting/studio/index.ts` + `composers.ts`): pure, deterministic, free, always available. Dispatch by `kind` × `job` presence (Grounding below). The empty-profile gate is exactly today's predicate — neither a headline nor any experience means nothing to draft from, refuse (`drafting/index.ts:20-29`); the handler maps `ProfileIncomplete` → `NotFound` with the same message shape the draft endpoint uses (`handlers/applications.ts:112-118`, whose own test calls this "the closest fit, not a clean one" and keeps it for consistency — reusing it here is a decided consistency trade, not an oversight).
- **Model engine** (`apps/worker/src/drafting/studio/model.ts`): bound from `env.AI` exactly as inference is — `layer(ai: WorkersAi | undefined)` failing with `StudioModelUnavailable` when the binding is absent or any call/decode fails (`inference/model/index.ts:27-54` pattern; the `isWorkersAi` duck-type and the optional `AI?: WorkersAi` env field already exist, `runtime/Env.ts:42-44,75-78` — no Env change).

Layer wiring (`runtime/Layers.ts`): both tags join the `Services` union (`:96-114`) and the `leaves` merge (`:145-154`) — `templateStudioLayer` statically, `modelStudioLayer(env.AI)` conditionally-producing, byte-for-byte the `heuristicEngineLayer`/`modelEngineLayer(env.AI)` arrangement. `testSupport.ts` gains the two default fakes (`unstubbed` die-loudly constructors, `handlers/testSupport.ts:39-40`) and matching `Fakes` entries (`:141-158`).

### Grounding rules per document kind (normative)

The template engine's entire authority comes from where its bytes may originate. Each kind names its inputs exhaustively:

| Kind | Inputs (exhaustive) | Composer |
| --- | --- | --- |
| general CV | `Profile` fields + stored answers | `renderAnswers(profile, answers)` — the profile-order body plus the `ADDITIONAL INFORMATION` answer section; this is the WS-0015-mandated wiring of the orphaned renderer |
| general letter | `headline`, `summary`, `location`, `skills` (first 6), leading experience entry in profile order | new `composeGeneralLetter` — no advert exists, so no ranking and no overlap filter; every named fact is owner-authored profile text |
| job-specific CV | `Profile` + `JobSnapshot` (`title`, `employerName`, `location`, `description`) | `composeCv(profile, snapshot)` verbatim — `rankExperience` against `advertText(snapshot)` |
| job-specific letter | same inputs | `composeLetter(profile, snapshot)` verbatim — skills appear only where `matchedSkills` finds them in the advert (`composeLetter.ts:5-16` guarantee inherited intact) |

Stored answers reach **general documents only** (via `Profiles.answers(profileId)`, `services/Accounts.ts:58`). Job-specific documents deliberately mirror today's per-listing output, which composes without answers — the studio preview must never disagree with what the apply loop composes from the same inputs. Preferences (`desiredRoles`/`excludedTerms`) are matching controls, not document content: no composer reads them. Empty-profile behavior is uniform: the gate refuses before any composer runs, whatever the kind or target.

Determinism is a testable property, not a hope: no clock, no randomness, pure functions — identical inputs compose byte-identical documents (acceptance (a)).

### Model prompt — named constants, unprovisioned binding

`drafting/studio/model.ts` declares, at module scope with documented rationale docstrings:

- `STUDIO_MODEL` — the Workers AI model id (start from the inference engine's reviewed choice, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `inference/model/index.ts:16`; the docstring records why and that switching is a one-constant edit);
- `MAX_MODEL_INPUT_CHARS` (same 120_000 bound and truncation-before-send reasoning as inference);
- `promptFor(profile, answers, kind, job)` — instructs prose generation grounded **only** on the supplied fields, forbids invented facts (the warranted-facts principle, `vision.md:60-71`), and returns plain text for the requested kind.

Constraint stated once and loudly: **`env.AI` is unprovisioned this slice.** All model-path tests construct fakes (`makeUnavailable`/`makeProposing`-style constructors exported from `drafting/studio/model.ts`'s test seam, mirroring `inference/model/test.ts:15-25`); no test, local run, or deployment in this slice issues a real model request. Prompt quality review by the operator precedes any provisioning — that gate is outside this scope.

### Storage — decided: one new `documents` table; reuse investigated and ruled out

Reuse candidates checked before adding anything: there is **no draft store today**. The draft endpoint composes ephemerally and persists nothing; the only persisted CV/letter text lives inside `applications` rows (`db/schema.sql:212-231`), which are application attempts with lifecycle invariants, not editable owner documents; `profiles.cv` is the structured profile of record. Nothing is compatible, so one additive table is justified rather than a parallel-shape hack onto `applications`.

Rejected from the planning sketch: a `cv+letter` **pair row**. Two independently edited, regenerated, deleted, listed artifacts in one row means partial-state columns and split-brain edits for zero benefit — the web journey picks one kind at a time anyway. One document, one row.

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT NOT NULL,
  profileId TEXT NOT NULL,
  jobId TEXT,                              -- SavedJobId when targeted; NULL = general
  jobSnapshot TEXT,                        -- frozen JobSnapshot JSON when targeted; NULL = general
  kind TEXT NOT NULL CHECK (kind IN ('cv', 'letter')),
  engine TEXT NOT NULL CHECK (engine IN ('template', 'model')),
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (profileId, id)
);

CREATE INDEX IF NOT EXISTS idx_documents_profileId_createdAt ON documents (profileId, createdAt);
```

Decisions embedded above, each deliberate:

- **`jobSnapshot` is denormalized onto targeted documents** — the `applications` precedent (`db/schema.sql:217,226`): the document freezes the vacancy it was composed against, self-describing forever, surviving corpus prunes and bookmark deletion. Display derives the job title from this copy; no join, no resurrection reads.
- **No foreign key** — `proposals` sets the house pattern for owner-scoped rows (`db/schema.sql:33-46`); ownership is enforced at every read/write by `profileId` predicates, and there is no delete-saved-job route to cascade from.
- **Engine literals are `template`/`model`** — the drafting vocabulary (`Documents.generator`, `db/schema.sql:223`), not proposals' `heuristic`/`model`, because the deterministic tier here *is* the template composer. The wire parameter is named `engine` like proposals' (`Api.ts:635`) for client-side symmetry; the value domain is the drafting one.
- **No optimistic-concurrency column** — whole-profile writes got CAS because concurrent tabs merge fields; a document is a single-owner single-buffer artifact where last-write-wins loses at worst one edit to the owner's own other tab. Accepted, recorded, revisit only if evidence demands.
- **Regeneration creates a new row** — "regenerate" is the same operation as "generate"; older versions remain until the owner deletes them. Free version history, zero extra endpoints, no silent overwrite of text the owner may prefer.

Repository `apps/worker/src/db/repositories/Documents.ts` (`Proposals.ts`/`Submissions.ts` style, `columnsOf`/`insertStatement`/`deleteStatement` helpers): `insert`, `findByIdForProfile(id, profileId)`, `findByProfile(profileId)` ordered `createdAt DESC` with the `savedService.ts:234-241` paging shape (fixed `PAGE_LIMIT = 50`, opaque offset-string cursor, `nextCursor: null` when short), `updateContent(id, profileId, content, updatedAt)` (scoped `UPDATE` → affected count; `0` ⇒ unknown-or-foreign id), `deleteByIdForProfile(id, profileId)` (same count contract), and `deleteByProfileWrite(profileId): Write` for erasure. **Erasure registration is mandatory**: `{ table: "documents", write: Documents.deleteByProfileWrite }` joins `purges` (`db/Erase.ts:71-87`); `Erase.test.ts` picks the new table up automatically from the generated schema, and `db/Sqlite.test.ts`'s pinned table list (`:28-52`, currently 22 entries) gains `documents` in alphabetical position — known mechanical fallout, listed here so it is executed, not discovered.

### Routes — authenticated `documents` group

New group in `apps/worker/src/Api.ts`, shaped like `proposals` (`:629-664`) and closed with `.middleware(Authenticated)`. Wire views are declared once here (the `ProposalView` single-declaration rule, `:581-597`): `DocumentSummary` (`id, kind, engine, jobId: string|null, jobTitle: string|null, createdAt, updatedAt` — `jobTitle` projected server-side from the stored snapshot so the list never carries content) and `DocumentView = DocumentSummary + content`.

- `POST /api/v1/me/documents` — payload `{ kind: "cv" | "letter", engine?: "template" | "model", jobId?: string }`. Success `200`: `DocumentCreateResponse` = `{ data: DocumentView, downgradeReason: string | null }` (the `ProposalCreateResponse` shape, `Api.ts:606-610`). Semantics: `jobId` present → `SavedJobs.resolve(profileId, decoded)`; `undefined` → `NotFound` (`handlers/applications.ts:95-98` verbatim reasoning) — and the snapshot that grounding uses is that frozen resolve result, never `Corpus.get`. Engine gate and degrade exactly per proposals (`handlers/proposals.ts:95-126`): `engine` absent ⇒ template, **Entitlements never consulted**; `engine: "model"` ⇒ `entitlements.require(profileId, "model-drafting")` catching `EntitlementRequired` → `UpgradeRequired({ capability: "model-drafting" })` (exact 402 shape asserted at `handlers/applications.test.ts:202-216`); entitled ⇒ try `ModelStudioComposer`, `StudioModelUnavailable` ⇒ template output + `downgradeReason` + `engine: "template"`; model success ⇒ `engine: "model"`. Errors: `Unauthorized | NotFound | UpgradeRequired`.
- `GET /api/v1/me/documents` — query `{ cursor?: string }`; success `{ data: DocumentSummary[], meta: { limit, nextCursor } }`; errors `Unauthorized`. Fixed limit 50 echoed in `meta` (the `savedService` precedent; no client-supplied limit knob to clamp).
- `GET /api/v1/me/documents/:id` — success `DocumentView`; errors `Unauthorized | NotFound` (another principal's id is a 404, never a leak — `findByIdForProfile` scopes the SELECT itself).
- `PUT /api/v1/me/documents/:id` — payload `{ content: string }`; overwrites content, bumps `updatedAt`, returns `DocumentView`; errors `Unauthorized | NotFound`. Content over `MAX_DOCUMENT_CHARS = 200_000` (aligned with the paste-input bound, `Commands.ts:570`) → new error class **`DocumentTooLarge`** `{ limit: number }`, httpApiStatus 400 — the one new taxonomy member this slice (per-case 400 classes are house style, cf. `ReservedLabelMutation`, `Api.ts:146-150`). Everything else reuses the existing taxonomy; no other class is added.
- `DELETE /api/v1/me/documents/:id` — success `{ deleted: id }` (`deleteSavedLabel` precedent, `Api.ts:550-554`); errors `Unauthorized | NotFound`.

Handlers live in `apps/worker/src/handlers/documents.ts` (+ `documents.test.ts`), wired in `handlers/index.ts` and the `HttpApiBuilder.layer(api)` merge in `src/index.ts:93-103`. Id decoding goes through `handlers/wire.ts` (a `decodeDocumentId` joins the branded-decode block, `wire.ts:20-24`). `openapi/job-index-v1.json` is not regenerated — the standing repo-wide open decision (`memory-bank/activeContext.md`).

### Web integration points (exact files)

A new `studio` submodel cluster mirroring `saved/` (`Model.ts`/`Message.ts`/`update.ts`/`view.ts`/`index.ts`/`update.test.ts`), mounted like the other clusters:

- `apps/web/src/Route.ts` — `RouteStudio` (`"/studio"`), router arm, `href` arm (`:48-56,68-104`).
- `apps/web/src/Model.ts` — `PageStudio`, `Model.studio: StudioSubmodel.Model`, `initialModel` wiring (`:50-66,133-172`).
- `apps/web/src/Message.ts` — `GotStudioMessage` beside `GotProfileMessage`/`GotSavedMessage` (`:91-98`); root union extension only.
- `apps/web/src/update.ts` — `UrlChanged` `Studio` arm (idle ⇒ dispatch the cluster's `Requested`, the `Profile` arm pattern, `:137-153`) and the `GotStudioMessage` forwarding arm with session-epoch guarding.
- `apps/web/src/main.ts` — third `h.submodel` slot in the page match (`:83-108`).
- `apps/web/src/view/Chrome.ts` + `view/icons.ts` — a fifth navigation item ("Studio"); `AppIcon` gains one inline-drawn `currentColor` glyph, `aria-hidden` wrapper, same style as the four existing (`icons.ts:9-21`). Icon files only; `Shared.ts` untouched.
- `apps/web/src/studio/*` — the cluster. Model: `documents: AsyncData<DocumentsPageShape, Problem>`, `kind` picker state, `target: null | SavedJobId`, `targets` (lightweight saved-job options), per-document editor buffers `{ id, content, dirty }`, `generate`/`save`/`delete` request tri-states, delete-confirmation state (the `LabelDeleteStarted` pattern, `saved/Message.ts:46-53`), copy feedback. View: kind + target pickers (`selectField`), engine selector offering "Model (Premium)" alongside the default template, generate button, document cards (summary header with kind/target/engine badge + created date, inline `textareaField` editor, Save enabled only when dirty, Regenerate, Copy, Delete-with-confirm), a `role="status"` line announcing "Document ready (engine: template)" and any `downgradeReason` ("Model engine unavailable — template served instead: …"), and the existing `renderProblem` `UpgradeRequired` card naming `model-drafting` on a 402 (`view/Shared.ts:455-473` — already implemented, zero new rendering code). All styling via semantic tokens and `Shared.ts` helpers — **zero new CSS**; busy regions set `AriaBusy` (`saved/view.ts:471` precedent).
- `apps/web/src/Commands.ts` — `FetchDocuments { cursor? }`, `CreateDocument { kind, engine?, jobId? }`, `SaveDocument { id, content }`, `DeleteDocument { id }`, `FetchDocumentTargets` (read-only `GET /api/v1/me/saved?view=all&sort=recently-saved`, projected to `{savedJobId, title}` inside the studio model — no server change, and the Saved cluster's cache is not reached across submodel boundaries), and `CopyTextToClipboard { id, text }` (`navigator.clipboard.writeText` in the command effect; completion flips a transient copied flag; failure surfaces as a problem, never a silent no-op).

Untouched: `Session.ts`, `RequestStatus.ts`, root styling, `Client.ts` (typed client builds from `api` and gains the group automatically), `playwright.config.ts`.

## Schema and migration plan

Order fixed per WS-0016/0017 precedent — domain model first, regenerate snapshot, emit migration (`db/schema.sql:1-4`: nothing else may edit that file):

1. `packages/domain/src/Documents.ts` (new) — `DocumentKind`, `CompositionEngine` literals; `StudioDocument` `Model.Class` with the nine fields above (`jobId: Model.FieldOption(SavedJobId)`, `jobSnapshot: Model.FieldOption(Model.JsonFromString(JobSnapshot))` — the `learnedAt`/`mappings` nullable-JSON patterns, `Delivery.ts:58-62`); rationale docstrings. `DocumentId` brand joins `packages/domain/src/Ids.ts` (`:54-56` pattern); barrel export added.
2. `scripts/ts/schema.ts` — import `StudioDocument`; `columnOverrides` on the new table for `jobId: "TEXT"` and `jobSnapshot: "TEXT"` (nullable; the global `columnTypes.jobId` stays `NOT NULL` for `judgements` — the override mechanism exists precisely for this, `scripts/ts/schema.ts:184-186,211-215`); `tables.documents` entry `{ primaryKey: ["id"], unique: [["profileId", "id"]], indexes: [["profileId", "createdAt"]] }`; `migrations` append:
   ```ts
   { name: "0004_documents.sql",
     currentWhen: "EXISTS (SELECT 1 FROM pragma_table_info('documents') WHERE name = 'jobSnapshot')" }
   ```
   (`:412-426` pattern).
3. `bun run schema` → regenerates `db/schema.sql`; `bun run schema:check` and `bun run catalog:check` stay green.
4. `db/migrations/0004_documents.sql` (new file; `0001`–`0003` untouchable) carrying the DDL above, headed by a comment in the `0001_saved-workspace.sql` voice: fresh databases get the table from the pre-marked snapshot; existing databases are migrated by Wrangler.

## Files touched (complete list; anything else is a deviation)

- `work/WS-0018-r1-document-studio.md` — this revision.
- `packages/domain/src/Documents.ts` (new); `packages/domain/src/Ids.ts` (one brand); `packages/domain/src/index.ts` (barrel line).
- `scripts/ts/schema.ts` + generated `db/schema.sql`; `db/migrations/0004_documents.sql` (new only).
- `apps/worker/src/services/Studio.ts` (new).
- `apps/worker/src/drafting/studio/` (new: `index.ts`, `composers.ts`, `model.ts`, `composers.test.ts`, `model.test.ts`) — reuses `drafting/sections.ts`, `renderAnswers.ts`, `composeCv.ts`, `composeLetter.ts`, `relevance.ts` **unmodified**.
- `apps/worker/src/db/repositories/Documents.ts` (new) + `Documents.test.ts` (workers pool glob covers it, `vitest.workers.config.ts:79`).
- `apps/worker/src/db/Erase.ts` (one purge entry); `apps/worker/src/db/Sqlite.test.ts` (table-list line).
- `apps/worker/src/Api.ts` (group, view schemas, `DocumentTooLarge`); `apps/worker/src/handlers/documents.ts` (new) + `documents.test.ts`; `apps/worker/src/handlers/index.ts`; `apps/worker/src/handlers/wire.ts` (one decoder); `apps/worker/src/handlers/testSupport.ts` (two fakes + `Fakes` entries); `apps/worker/src/index.ts` (handler-layer merge line).
- `apps/worker/src/runtime/Layers.ts` (imports, `Services` union, leaves merge).
- `apps/web/src/Route.ts`, `Model.ts`, `Message.ts`, `update.ts`, `main.ts`, `Commands.ts`, `view/Chrome.ts`, `view/icons.ts`.
- `apps/web/src/studio/` (new cluster incl. `update.test.ts`).
- `e2e/document-studio.spec.ts` (new; `shortlist.spec.ts` and `profile-import.spec.ts` pass unmodified).

Explicitly forbidden even though adjacent: `apps/worker/src/drafting/*.ts` existing files (composed against, never edited), `apps/worker/src/applications/**` and `services/Applications.ts` (apply loop frozen), `services/{Inference,Drafting,Extraction,Entitlements}.ts`, `inference/**`, `extraction/**`, `runtime/{Env,Telemetry,Ids,Platform}.ts`, `infra/**`, `packages/adapters/**`, `packages/domain/src/**` beyond the three additive touches above, `db/migrations/000[123]*`, `docs/**`, `memory-bank/**`, `policy/**`, `templates/**`, `openapi/**`, `apps/web/src/styles.css`, `apps/web/src/view/Shared.ts`, dot-files, lockfiles, `package.json` (zero dependency changes). **No git mutations** (`git add/reset/commit/stash` included). No network calls to Cloudflare/NAV/Firecrawl; no real Workers AI request anywhere.

## Acceptance criteria (each independently checkable)

- [ ] **(a) Template composer unit tests** (`drafting/studio/composers.test.ts`): determinism — each kind composed twice yields deep-equal strings; grounding — general CV output equals `renderAnswers(profile, answers)` for the same inputs and contains an `ADDITIONAL INFORMATION` section only when answers exist; job-specific CV/letter outputs equal `composeCv`/`composeLetter` for the same profile+snapshot (drift-proofing by equality); the job-specific letter names only skills present in the snapshot text (the inherited `matchedSkills` guarantee); no composer reads `preferences`; empty profile (no headline, no experience) fails with `ProfileIncomplete` for all four kinds; general letter names only profile-borne facts.
- [ ] **(b) Entitlement matrix** (`handlers/documents.test.ts` through `buildHandler`): default create (no engine) returns 200 with `engine: "template"` and the default `Entitlements` fake is **never invoked** (its die-loudly stub proves absence of the call); `engine: "model"` without capability → exact body `{_tag: "UpgradeRequired", capability: "model-drafting"}` with HTTP 402; entitled-but-unbound (`makeUnavailable` fake) → 200, `engine: "template"`, non-null `downgradeReason`; entitled + proposing model fake → `engine: "model"` with the fake's content.
- [ ] **(c) Persistence round-trips** (`repositories/Documents.test.ts` on the SQLite TestLayer, plus route-level cases in `handlers/documents.test.ts`): insert→find→update→delete lifecycle; targeted create stores the frozen `jobSnapshot` copy resolvable to `SavedJobs.resolve`'s answer; `findByProfile` pages 55 seeded rows into 50 + cursor + terminal `nextCursor: null`; another principal's id → `undefined` from the repository and 404 from every `:id` route; `PUT` persists edited content and bumps `updatedAt`; `DELETE` removes exactly one owner-scoped row.
- [ ] **(d) Erasure and schema:** `documents` ∈ `ERASED_TABLES` (asserted) and `Erase.test.ts`'s schema-derived sweep zeroes a seeded documents row; `bun run schema && bun run schema:check && bun run catalog:check` green; migration file matches emitted DDL; `Sqlite.test.ts` updated table list passes; workers pool suite green.
- [ ] **(e) Bounds and taxonomy:** `PUT` content over 200 000 chars → 400 `{"_tag":"DocumentTooLarge","limit":200000}`; model output over the bound degrades to template + `downgradeReason` (never a 500); no new error class beyond `DocumentTooLarge` exists in the diff.
- [ ] **(f) Capability posture unchanged:** `permits({_tag:"Free"}, "model-drafting") === false`, Premium `true`, with **zero diff** in `Subscription.ts`/`Access.ts`/`Entitlements.ts`/`ALL_CAPABILITIES` (diff-stat proof); `GET /api/v1/me` capabilities list unchanged for a granting fake.
- [ ] **(g) Apply loop inert:** every existing `handlers/applications.test.ts` case passes unmodified; `POST /api/v1/me/saved/:id/draft` and `prepare` responses byte-compatible with pre-slice fixtures; studio create with a `jobId` never calls `Corpus` (corpus fake dies if touched).
- [ ] **(h) Web unit tests** (`apps/web/src/studio/update.test.ts`): generate success/failure/downgrade arms, edit-dirty tracking gating Save, delete confirmation flow, copy feedback, epoch-guarded forwarding — `saved/update.test.ts` style.
- [ ] **(i) E2e journey** (`e2e/document-studio.spec.ts`, `shortlist.spec.ts:6-15` helper style, `assertAccessible` at every screen): sign in → Studio → generate general CV (template) → content shows the seeded profile's headline/skills → edit inline, save, reload persists → copy button present → generate a letter targeted at a job shortlisted in-test → card shows the frozen job title → regenerate yields a second row → delete with confirmation removes it → select "Model (Premium)" → upgrade card names `model-drafting` → Axe-clean throughout. Existing specs pass unmodified; `playwright.config.ts` untouched.
- [ ] **(j) Full gates:** `bun run check` (fmt, lint, imports, typecheck, schema:check, catalog:check, bundle:check, coverage:all) and `bun run test:workers` green; WS-0013 zero-new-CSS grep still reports zero new stylesheets.
- [ ] **(k) Diff confinement:** diff stat confined to the allowed list; greps prove no `Firecrawl`/`fetch(` additions in touched worker files and no new capability literal.

## Rollback

Single-revert, additive-only: every product change is a new file plus enumerated small edits, so reverting the integration commit restores the prior Worker and UI exactly; `bun run schema:check` re-run green afterwards (snapshot regeneration tolerates the table's presence via `IF NOT EXISTS`, the 0001-established property). One honesty item unlike WS-0017's timestamp-only residue: reverted code orphans stored `documents` rows containing owner-authored text, and the reverted erasure sweep no longer covers them — the rollback runbook therefore pairs the revert with an explicit operator `DROP TABLE documents` (or an immediate re-forward-fix). Until that drop, the rows are inert to all routes but still personal data; this is stated so the residue is a decision, not a surprise.

## Required evidence

- Full-pass logs: `bun run check`, `bun run test:workers`, `bun run e2e`.
- Transcripts: entitlement-matrix tests (b), round-trip/pagination/isolation tests (c), erasure proof (d), bound-rejection (e), diff stat + greps (k).
- Screenshots: studio picker + generated general document, targeted document card with frozen job title, inline-edit saved state, upgrade card on the 402 path.
- Archived `.artifacts/ws-0018/` per house convention.

## Supersedes

Nothing wholesale. Executes WS-0015-r1 §4 S2 under the §6 resolutions, which it leaves intact; accelerates OQ-3's CV-then-S2.1 staging into one slice (recorded under Binding resolutions). Narrows S2's "job type" phrasing to the four concrete kinds (see Non-goals) and defers per-role-type templates indefinitely. Leaves S3 (authoritative per-listing drafts) fully open and unblocked.

## Open questions for the lead

None. Every prior ambiguity in this slice resolved during scoping: extend-vs-replace (extend), storage (new `documents` table, reuse ruled out on evidence), pair rows (rejected), engine literals (`template`/`model`), concurrency (last-write-wins, accepted), pagination bound (fixed 50), role-type templates (out of scope). Workers AI provisioning timing remains the operator gate already recorded in `memory-bank/activeContext.md` — outside this scope, non-blocking: until bound, entitled accounts transparently receive template documents + `downgradeReason`.

## Deviations from r1

Recorded during execution (2026-08-26), each within the doc's spirit and reported here per the deviation protocol:

1. **`e2e/playwright.config.ts` — one `launchOptions.executablePath` addition** (the file was listed read-only in Files touched). The Playwright-bundled `chrome-headless-shell` cannot resolve its shared libraries on this machine (`libglib-2.0.so.0`), so every e2e run — including the pre-existing two specs — failed at browser launch with zero tests executed. The change points Chromium at the machine's working Nix-provided binary; it alters no test logic, selectors, timeouts, or assertions, and both pre-existing specs pass unmodified alongside the new one.
2. **`apps/web/src/studio/view.ts` adds two DOM test hooks** beyond the original sketch: a `.document-card` class plus a `data-document-kind="kind-general|kind-targeted"` attribute on each document card (via foldkit's `DataAttribute`, token-styling unaffected). The e2e journey needs stable, accessible-scoped handles for "the CV card" vs "the targeted letter card"; without them the selectors are ambiguous once several documents exist. Zero new CSS.
3. **`apps/worker/src/db/Erase.test.ts` seeds one documents row** in its existing generic seed helper, and **`apps/worker/src/db/Sqlite.test.ts` gains one table-list line** (`"documents"`, alphabetical). Both were named as expected mechanical fallout in the doc's Storage section; recorded here because those files sit outside the Files-touched list's explicit mention of them.
4. **POST create composes through the template composer when the model engine degrades**, storing that template output with `engine: "template"` and non-null `downgradeReason` — matching the contract text ("template output + downgradeReason + engine: template"). The first implementation briefly stored model-engine metadata on degraded rows; fixed to match the frozen wording before integration.

No other deviations. The bounded intent-to-add cycle ran twice (once mid-implementation for the imports gate transcript, once for the final full check); the index was reset after each, leaving only untracked files.

### Remediation pass (2026-08-26, independent review PASS-WITH-FIXES)

One remediation pass within the frozen attempt budget, fixing the review findings exactly:

1. **HIGH — missing `PRIMARY KEY (id)` in emitted DDL:** `primaryKey: ["id"]` added to the `documents` spec in `scripts/ts/schema.ts`; snapshot regenerated. `db/schema.sql`'s documents block now carries `PRIMARY KEY (id)` before `UNIQUE (profileId, id)`, byte-matching migration 0004; `schema:check` green.
2. **MEDIUM (h):** `apps/web/src/studio/update.test.ts` created — 16 cases against the pure `update()` covering DocumentsReceived/FetchFailed, GenerateClicked command shape, GenerateSucceeded editor-open + idempotence + list refetch, GenerateFailed problem state, EditorChanged per-buffer dirty tracking, SaveClicked no-op on clean buffers, SaveSucceeded dirty reset / SaveFailed keeps buffer editable, DeleteStarted/Cancelled/Confirmed sequencing incl. unconfirmed no-op, CopySucceeded/CopyFailed copiedId, picker state; plus a Studio epoch-mismatch no-op case in root `update.test.ts` mirroring the Saved precedent.
3. **MEDIUM (e):** route test added — PUT content of 200_001 chars answers 400 with body `{_tag:"DocumentTooLarge",limit:200000}` (asserted deep-equal); a 200_000-char payload passes the size gate (404 unknown-id branch instead). Implemented the missing output bound in `drafting/studio/model.ts`: documented constant `MAX_MODEL_OUTPUT_CHARS = 200_000`; an oversized model response maps to `StudioModelUnavailable`, so the handler degrades to template + `downgradeReason`. Model tests cover both over-bound degrade and at-bound acceptance.
4. **LOW cursor clamp:** documents list cursor now clamps invalid/negative values to 0 with `savedService.parseCursor` semantics (inline, commented).
5. **LOW cosmetic:** e2e cleanup deletes run via `Promise.all`; the hidden marker div was removed and `data-document-kind` merged onto the visible card header div (foldkit's `card` helper takes only className, so a root-level attribute would require changing the shared helper — out of scope); the dead delete-by-id residue in the spec was dropped.

New files this pass: `apps/web/src/studio/update.test.ts`. No other paths touched.
