import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CanonicalJobId, ProfileId, SavedJobId } from "@job-index/domain/Ids";

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
 */
export class SavedJobs extends Context.Service<
  SavedJobs,
  {
    readonly save: (
      profile: ProfileId,
      job: CanonicalJobId,
      note: string,
    ) => Effect.Effect<SavedJobId>;
    /** The vacancy this saved job points at, or `undefined` if it is not this profile's. */
    readonly resolve: (
      profile: ProfileId,
      saved: SavedJobId,
    ) => Effect.Effect<CanonicalJobId | undefined>;
  }
>()("@job-index/SavedJobs") {}
