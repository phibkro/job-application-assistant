import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CanonicalJob, JobSnapshot } from "@job-index/domain/Job";
import type { SavedJob } from "@job-index/domain/Applications";
import type { ProfileId, SavedJobId } from "@job-index/domain/Ids";

/**
 * Saved jobs: the step between seeing a vacancy and applying for one.
 *
 * `Applications` takes a `SavedJobId` as given — it prepares and tracks, it
 * does not mint. Something has to create the row and resolve it back to the
 * vacancy it points at, and the handlers slot found the gap by having no way
 * to implement `save` and `draft`. The table (`saved_jobs`) has existed since
 * migration 0008 with nothing wrapping it.
 *
 * `resolve` is scoped to the profile deliberately: a saved job belongs to
 * whoever saved it, and an id that resolves for anyone is an access-control
 * hole disguised as a lookup.
 *
 * `save` takes the whole `CanonicalJob`, not just its id: the operator's
 * decision that an advert is snapshotted, not referenced, means the moment of
 * saving is the one place `Job.snapshotOf` can be called — the caller (the
 * `save` handler) already holds the job it just fetched from `Corpus` to
 * confirm it exists, so no second corpus read is needed here to take the copy.
 * `resolve` answers with that frozen `JobSnapshot`, not a live `CanonicalJobId`
 * lookup: what a saved job "points at" is now the vacancy as it stood when it
 * was saved, which is also what makes it survive the corpus row being edited
 * or, eventually, pruned.
 */
export class SavedJobs extends Context.Service<
  SavedJobs,
  {
    readonly save: (
      profile: ProfileId,
      job: CanonicalJob,
      note: string,
    ) => Effect.Effect<SavedJobId>;
    /** The vacancy this saved job points at, as it stood when it was saved — or `undefined` if it is not this profile's. */
    readonly resolve: (
      profile: ProfileId,
      saved: SavedJobId,
    ) => Effect.Effect<JobSnapshot | undefined>;
    /** Every job this profile has bookmarked, for their own history/export. */
    readonly list: (profile: ProfileId) => Effect.Effect<ReadonlyArray<SavedJob>>;
  }
>()("@job-index/SavedJobs") {}
