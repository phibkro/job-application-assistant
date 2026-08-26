import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { DocumentId, ProfileId, SavedJobId } from "./Ids.ts";
import { JobSnapshot } from "./Job.ts";

/**
 * A document the owner drafts, edits, and keeps (WS-0015 §4 S2 / WS-0018).
 *
 * Two grounding modes share one shape: a general document carries no vacancy
 * (`jobId`/`jobSnapshot` both absent) and composes from the confirmed profile
 * alone; a targeted document freezes the saved vacancy's `JobSnapshot` at
 * creation — the same denormalization `applications` rows carry (`db/schema.sql`
 * `applications.jobSnapshot`) — so the stored copy describes the advert as it
 * stood when drafted and survives corpus prunes and bookmark deletion without
 * a join or a resurrection read.
 *
 * One document per row, never a CV+letter pair: two independently edited,
 * regenerated, deleted artifacts in one row would mean partial-state columns
 * for zero benefit.
 *
 * These are outputs the owner deliberately creates — not machine-ingested
 * sources — so persistence here is the WS-0015 OQ-4-compliant side of the
 * sources/outputs split. Every row is `profileId`-scoped and joins the
 * erasure sweep's purge batch (`db/Erase.ts`).
 */

/** What kind of document this is. */
export const DocumentKind = Schema.Literals(["cv", "letter"]);
export type DocumentKind = typeof DocumentKind.Type;

/**
 * Which tier produced the document. The drafting vocabulary (`template` |
 * `model`, cf. `applications.generator`), not proposals' `heuristic`/`model`:
 * the deterministic tier here *is* the template composer. The wire parameter
 * is named `engine` like proposals' for client-side symmetry; the value
 * domain stays the drafting one.
 */
export const CompositionEngine = Schema.Literals(["template", "model"]);
export type CompositionEngine = typeof CompositionEngine.Type;

export class StudioDocument extends Model.Class<StudioDocument>("StudioDocument")({
  id: DocumentId,
  profileId: ProfileId,
  /** The saved vacancy this document targets; absent means a general document. */
  jobId: Model.FieldOption(SavedJobId),
  /**
   * The frozen advert as it stood at creation, present exactly when `jobId`
   * is. JSON text in the column, structured on decode — the `mappings`
   * precedent (`Delivery.ts`).
   */
  jobSnapshot: Model.FieldOption(Model.JsonFromString(JobSnapshot)),
  kind: DocumentKind,
  engine: CompositionEngine,
  /** The document body as plain text/markdown — what the owner edits inline. */
  content: Schema.String,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
