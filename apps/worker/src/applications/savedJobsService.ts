import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SavedJob } from "@job-index/domain/Applications";
import { snapshotOf } from "@job-index/domain/Job";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { ProfileId, SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import * as SavedJobRows from "./savedJobs.ts";

/**
 * Saving a vacancy, and resolving a saved one back to the vacancy it points at.
 *
 * Lives beside `Applications` because both work the same table and the same
 * lifecycle: a saved job is what `prepare` takes as its argument. Splitting
 * them would put two owners on `saved_jobs`.
 *
 * `resolve` is scoped to the profile and returns `undefined` for anything
 * else's saved job — not a failure, and deliberately indistinguishable from
 * an id that does not exist. A caller learning that someone else's saved job
 * is real would be an enumeration oracle, and the endpoint above this needs
 * exactly one answer: is this yours, and what does it point at.
 */
export const layer = Layer.effect(
  SavedJobs,
  Effect.gen(function* () {
    const database = yield* Database;
    const ids = yield* Ids;
    const withDatabase = <A>(effect: Effect.Effect<A, never, Database>): Effect.Effect<A> =>
      Effect.provideService(effect, Database, database);

    const save = (profile: ProfileId, job: CanonicalJob, note: string): Effect.Effect<SavedJobId> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        const id = (yield* ids.next) as SavedJobId;
        yield* withDatabase(
          SavedJobRows.insert(
            new SavedJob({
              id,
              profileId: profile,
              canonicalJobId: job.id,
              jobSnapshot: snapshotOf(job),
              note,
              createdAt: now,
            }),
          ),
        );
        return id;
      });

    const resolve = (profile: ProfileId, saved: SavedJobId) =>
      Effect.map(withDatabase(SavedJobRows.findById(saved)), (row) =>
        row === undefined || row.profileId !== profile ? undefined : row.jobSnapshot,
      );

    const list = (profile: ProfileId) => withDatabase(SavedJobRows.findByProfile(profile));

    return SavedJobs.of({ save, resolve, list });
  }),
);
