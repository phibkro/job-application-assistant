import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { CanonicalJobId, ProfileId, Sequence } from "./Ids.ts";

/**
 * What a person has already seen, held per profile rather than per search.
 *
 * Per profile because a person is one person: a vacancy they dismissed in a
 * saved search should not reappear because a chat asked the question a
 * different way. Per-search state would make "show me something new" mean
 * something different in each surface, which is precisely the friction this
 * product exists to remove.
 *
 * The high-water mark makes the common case cheap — everything above it is
 * unseen by definition — while the exception set records the individual
 * judgements a person made below it.
 */
export class Freshness extends Model.Class<Freshness>("Freshness")({
  profileId: ProfileId,
  /** Everything at or below this sequence has been offered to this person. */
  seenThrough: Sequence,
  updatedAt: Model.DateTimeUpdate,
}) {}

/**
 * A judgement a person made about one vacancy.
 *
 * Distinct from "seen": dismissing something is information worth keeping, and
 * worth feeding back into what gets surfaced next. Saved and applied live in
 * the shortlist; this records the negatives, which are otherwise lost.
 */
export class Judgement extends Model.Class<Judgement>("Judgement")({
  profileId: ProfileId,
  jobId: CanonicalJobId,
  verdict: Schema.Literals(["dismissed", "not_now", "irrelevant"]),
  /** Free text the person gave, if any; useful for tuning a match model. */
  reason: Model.Sensitive(Schema.String),
  createdAt: Model.DateTimeInsert,
}) {}
