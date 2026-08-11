import * as Effect from "effect/Effect";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import * as Answers from "./repositories/Answers.ts";
import * as Sessions from "./repositories/Sessions.ts";
import * as Freshness from "./repositories/Freshness.ts";
import * as Judgements from "./repositories/Judgements.ts";
import * as Submissions from "./repositories/Submissions.ts";
import * as Subscriptions from "./repositories/Subscriptions.ts";
import * as ApplicationRecords from "../applications/applicationRecords.ts";
import * as ActiveApplications from "../applications/activeApplications.ts";
import * as Labels from "../applications/labels.ts";
import * as SavedJobRows from "../applications/savedJobs.ts";

/**
 * The personal-data rows a profile's erasure sweep must remove, in one
 * transaction — `Access.ts`'s `Erasure` docstring: "a genuine one completes
 * without anyone running a script."
 *
 * Scope, decided (operator ruling, this change): "when a person saves or
 * applies to a vacancy... that stored copy counts as data registered to
 * their account... [and] falls under erasure and under export. Not
 * eventually — in this change." Every table below whose row exists *because*
 * this profile acted is purged:
 *
 * - `sessions`, `answers` — as before this ruling.
 * - `saved_jobs`, `applications` — the bookmark and the application, each
 *   now carrying a frozen `Job.JobSnapshot` of the vacancy. A pointer
 *   (`canonicalJobId` alone, the previous shape) would have let this survive
 *   erasure by accident, because the corpus row it pointed at lives in a
 *   different table this sweep does not — and should not — touch.
 * - `submissions`, `judgements` — the previous version of this docstring
 *   argued these should be *deferred* because their history "feeds
 *   platform-readiness and match-tuning decisions that outlive one profile's
 *   presence." That is an argument for retaining an anonymised, aggregate
 *   SIGNAL, not for retaining a ROW STAMPED WITH THIS PROFILE'S ID — and
 *   nothing in this change builds that aggregate. An anonymisation that
 *   still lets a row be traced back to a person (an `applicationUrl` plus a
 *   timestamp plus an outcome is not automatically unlinkable) would be
 *   worse than deletion, because it *looks* erased while not being. Until
 *   someone designs and gates that aggregate separately, the honest default
 *   is what this sweep does: erase the row. See each repository's own
 *   `deleteByProfileWrite` docstring for the per-table version of this.
 * - `freshness`, `subscriptions` — operational state with no further use
 *   once the profile is gone. `subscriptions.providerRef` (`Model.Sensitive`)
 *   is a billing-provider reference; the provider itself remains the system
 *   of record for its own billing/tax history under its own retention
 *   rules, so erasing this row does not touch that.
 *
 * Deliberately NOT purged here, despite each carrying `profileId`:
 * `profiles` and `principals`. `profiles` is the account's own tombstone —
 * `Access.Erasure`'s state machine marks the row `Purged` (with its `cv`
 * emptied) rather than deleting it, because the row's continued existence in
 * that state is itself the record that erasure happened; that transition is
 * a different mechanism than a row delete and belongs to whoever wires the
 * scheduled sweep this docstring has always deferred to. `principals` is
 * authentication identity, under active, concurrent development elsewhere
 * (a Better Auth adapter) — reaching into it here would make this a second,
 * uncoordinated writer on a table this slot does not own; see `Erase.test.ts`
 * for how both exclusions are checked, not merely asserted in prose.
 *
 * Every write travels as one batch. D1 runs a batch sequentially and commits
 * it as one transaction, so the ordering matters for nothing observable —
 * but stating it costs nothing: `sessions` first (access goes before the
 * data it protects), `applications` before `saved_jobs` (a bookmark
 * outlives, however briefly, the application prepared from it), everything
 * else in no particular order.
 */
const purges: ReadonlyArray<{
  readonly table: string;
  readonly write: (profileId: ProfileId) => Write;
}> = [
  { table: "sessions", write: Sessions.deleteByProfileWrite },
  { table: "answers", write: Answers.deleteByProfileWrite },
  { table: "label_assignments", write: Labels.deleteAssignmentsByProfileWrite },
  { table: "active_applications", write: ActiveApplications.deleteByProfileWrite },
  { table: "applications", write: ApplicationRecords.deleteByProfileWrite },
  { table: "custom_labels", write: Labels.deleteByProfileWrite },
  { table: "saved_jobs", write: SavedJobRows.deleteByProfileWrite },
  { table: "submissions", write: Submissions.deleteByProfileWrite },
  { table: "judgements", write: Judgements.deleteByProfileWrite },
  { table: "freshness", write: Freshness.deleteByProfileWrite },
  { table: "subscriptions", write: Subscriptions.deleteByProfileWrite },
];

/**
 * The table names `eraseProfile` purges, derived from `purges` above rather
 * than typed out a second time — `Erase.test.ts` reads this to check that
 * every `profileId`-bearing table in `db/schema.sql` is accounted for by
 * either this list or the exclusions this docstring names, so a table added
 * later with nobody remembering to purge it fails that test instead of
 * silently retaining personal data.
 */
export const ERASED_TABLES: ReadonlyArray<string> = purges.map((purge) => purge.table);

/**
 * The `profileId`-bearing tables this sweep deliberately does not purge, and
 * why — see this file's own docstring above for each. Exported, not
 * restated in `Erase.test.ts`: that test's coverage check compares
 * `db/schema.sql`'s own `profileId` columns against `ERASED_TABLES` plus
 * this list, so the two lists here and the schema can only ever agree or
 * fail loudly, never silently drift apart.
 */
export const RETAINED_TABLES_WITH_PROFILE_ID: ReadonlyArray<string> = ["profiles", "principals"];

export const eraseProfile = (profileId: ProfileId): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    yield* db.atomic(purges.map((purge) => purge.write(profileId)));
  });
