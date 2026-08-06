import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { AnswerShape, QuestionKey } from "./Answer.ts";
import { DeliveryPlatformId, ProfileId, SubmissionId } from "./Ids.ts";

/**
 * Delivering an application, which is the mirror of acquiring a listing.
 *
 * Both are ports over heterogeneous platforms, and both climb the same ladder:
 * an agent discovers how a platform works, what it learns is persisted, and
 * the next attempt is scripted. The ladder is the system's actual job — an
 * agent run that leaves nothing behind is a cost; one that leaves a mapping is
 * an investment.
 */
export const DeliveryTier = Schema.Union([
  Schema.TaggedStruct("Api", {}),
  Schema.TaggedStruct("Scripted", {}),
  Schema.TaggedStruct("Agent", {}),
  Schema.TaggedStruct("Unknown", {}),
]);
export type DeliveryTier = typeof DeliveryTier.Type;

/**
 * One field on one platform's application form, and the question it asks.
 *
 * This is what an agent run produces and what a scripted run consumes. The
 * selector is how to find the field; the question is what it means. Learning
 * is the act of pairing them.
 */
export const FieldMapping = Schema.Struct({
  selector: Schema.String,
  label: Schema.String,
  question: QuestionKey,
  shape: AnswerShape,
  required: Schema.Boolean,
  /**
   * How the pairing was established. A mapping confirmed by the person who
   * watched the agent fill it is worth more than one a model guessed, and a
   * filler should prefer accordingly.
   */
  evidence: Schema.Literals(["confirmed", "inferred", "guessed"]),
});
export type FieldMapping = typeof FieldMapping.Type;

/**
 * A platform we can deliver applications to, and what we have learned about it.
 *
 * `mappings` starts empty. The first application is driven by an agent with the
 * person watching; what they confirm is written here; subsequent applications
 * are scripted. `tier` is therefore not fixed — it is the current rung, and it
 * should climb.
 */
export class DeliveryPlatform extends Model.Class<DeliveryPlatform>("DeliveryPlatform")({
  id: DeliveryPlatformId,
  name: Schema.String,
  /** Host pattern that identifies an advert as belonging to this platform. */
  hostPattern: Schema.String,
  tier: Model.JsonFromString(DeliveryTier),
  mappings: Model.JsonFromString(Schema.Array(FieldMapping)),
  /** Set when the platform's terms forbid automated submission entirely. */
  automationProhibited: Model.BooleanSqlite,
  learnedAt: Model.FieldOption(Schema.String),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

/**
 * One attempt to deliver one application.
 *
 * Recorded per attempt rather than per application because the interesting
 * history is the attempts: which tier was used, what it cost, and whether a
 * human had to intervene. That record is what tells us a platform is ready to
 * be promoted from agent to scripted.
 */
export class Submission extends Model.Class<Submission>("Submission")({
  id: SubmissionId,
  profileId: ProfileId,
  platformId: DeliveryPlatformId,
  applicationUrl: Schema.String,
  viaTier: Model.JsonFromString(DeliveryTier),
  outcome: Schema.Literals(["prepared", "submitted", "needs_human", "failed"]),
  /** Present when a person took over a live agent session to finish it. */
  humanIntervened: Model.BooleanSqlite,
  /** Fields the run could not answer; the backlog for the next question set. */
  unanswered: Model.JsonFromString(Schema.Array(QuestionKey)),
  detail: Schema.String,
  createdAt: Model.DateTimeInsert,
}) {}
