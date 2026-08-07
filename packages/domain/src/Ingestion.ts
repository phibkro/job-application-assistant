import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { PlatformId, Sequence, SourceId } from "./Ids.ts";

/**
 * `Ingestion`'s own state: three facts, three tables, matching
 * `Applications.ts`'s shape for the same reason — none of them were owned by
 * an earlier slot.
 *
 * - `SourceState` is the resumable position of one platform's sweep: where
 *   the cursor is, which external ids this sweep has accumulated so far, and
 *   who currently holds the right to advance it. `Corpus.closeAbsent` may
 *   only be called with a *complete* enumeration (see its own doc comment),
 *   and a sweep can span more than one bounded `collect` invocation — a
 *   worker that dies mid-sweep must resume it, not restart it, or its next
 *   attempt would call `closeAbsent` having forgotten everything the earlier,
 *   interrupted attempts already saw. So "which ids has this sweep seen so
 *   far" has to survive between invocations the same way the cursor does.
 * - `IngestionRun` is a log of every `collect` invocation: what it decided
 *   (`RunReport`, stored as it was reported), because a quiet week and a
 *   broken connector produce the same empty corpus and are only
 *   distinguishable from *why* a run stopped.
 * - `IngestionFailure` is a log of what an `Acquisition.page` call actually
 *   failed with. "Budget exhausted" on the run ledger cannot say whether that
 *   was rate-limiting, a credential rejection, or a payload NAV changed shape
 *   on — and those need different people to look at them, which is the
 *   question this table exists to answer: is NAV down, or is nobody hiring.
 */

export class SourceState extends Model.Class<SourceState>("SourceState")({
  platformId: PlatformId,
  /** Opaque to everything but the adapter that produced it; see `AcquiredPage.cursor`. */
  cursor: Schema.String,
  /** Accumulated across every run in the current sweep; emptied once `closeAbsent` runs. */
  seenExternalIds: Model.JsonFromString(Schema.Array(Schema.String)),
  /**
   * Learned from the first listing this platform ever produced, not reset
   * between sweeps: which corpus source a platform's listings belong to is a
   * fact about the platform, not about any one sweep. Nothing in
   * `SourceCatalog` records this mapping today (`CatalogEntry` has no
   * `SourceId` field) — the alternative to learning it empirically was
   * inventing one, which would have been a guess the first observed listing
   * makes unnecessary. Named distinctly from `occurrences.sourceId` (a
   * required column there) because `scripts/ts/schema.ts` declares column
   * types once per field name across every table, and this one is nullable
   * until a listing has actually been seen.
   */
  resolvedSourceId: Model.FieldOption(SourceId),
  leaseOwner: Model.FieldOption(Schema.String),
  /** Epoch ms. A run that dies mid-sweep must not lock its source forever. */
  leaseExpiresAt: Model.FieldOption(Schema.Number),
  updatedAt: Model.DateTimeUpdate,
}) {}

export class IngestionRun extends Model.Class<IngestionRun>("IngestionRun")({
  platformId: PlatformId,
  startedAt: Model.DateTimeInsert,
  pages: Schema.Number,
  observations: Schema.Number,
  canonicalChanges: Schema.Number,
  cursorBefore: Schema.String,
  cursorAfter: Schema.String,
  highestSequence: Sequence,
  /** Reached tail, budget exhausted (and which boundary), or a failure tag. Free text, not a union column: this is a log for a person to read, not a state a query branches on. */
  stoppedReason: Schema.String,
  durationMs: Schema.Number,
}) {}

export class IngestionFailure extends Model.Class<IngestionFailure>("IngestionFailure")({
  platformId: PlatformId,
  occurredAt: Model.DateTimeInsert,
  /** One of `Failure.ts`'s tags (`SourceUnavailable`, `DecodeFailed`, ...). */
  failureTag: Schema.String,
  detail: Schema.String,
  /** The cursor being fetched when this failure happened — which page broke. */
  cursor: Schema.String,
}) {}
