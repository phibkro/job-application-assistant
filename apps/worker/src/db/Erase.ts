import * as Effect from "effect/Effect";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import * as Answers from "./repositories/Answers.ts";
import * as Sessions from "./repositories/Sessions.ts";

/**
 * The personal-data rows a profile's erasure sweep must remove from this
 * slot's tables, in one transaction — `Access.ts`'s `Erasure` docstring: "a
 * genuine one completes without anyone running a script."
 *
 * Scope, deliberately narrow: only `answers` and `sessions` hold data
 * `Model.Sensitive` marks personal (CV answers; a session's `tokenHash`).
 * `submissions` and `judgements` are this profile's history rather than
 * their current state — `Submissions.ts` and `Judgements.ts` are append-only
 * by design (see their docstrings) precisely because that history feeds
 * platform-readiness and match-tuning decisions that outlive one profile's
 * presence; whether an erasure sweep should also purge or anonymize those
 * belongs to whichever slot owns the erasure policy, not to this repository.
 * `freshness` and `subscriptions` are operational state a purged profile has
 * no further use for, but neither is marked `Sensitive` by the domain model
 * — left as-is here rather than this slot inventing a purge scope the
 * domain didn't declare.
 *
 * No foreign key currently ties these tables together (`db/schema.sql`
 * declares none), so there is no DB-enforced ordering constraint yet. Still
 * deletes `sessions` before `answers`: a session is what a caller
 * authenticates with, so revoking access first and removing the underlying
 * profile data second is the safer order if this sweep is ever interrupted
 * partway through.
 */
export const eraseProfile = (profileId: ProfileId): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    yield* db.transaction(
      Effect.gen(function* () {
        yield* Sessions.deleteByProfile(profileId);
        yield* Answers.deleteByProfile(profileId);
      }),
    );
  });
