import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Judgement } from "@job-index/domain/Freshness";
import type { CanonicalJobId, ProfileId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import { Judgements } from "../services/Judgements.ts";
import * as JudgementRows from "../db/repositories/Judgements.ts";

/**
 * What a person thought of a vacancy they were shown.
 *
 * A thin layer over the repository on purpose: the table is append-only and
 * the verdict arrives already decided, so there is no rule to enforce between
 * the wire and the row. What it does add is the boundary — the feed handler
 * asks for `Judgements`, not for `Database`, so dismissing a job cannot grow
 * into arbitrary SQL.
 */
export const layer = Layer.effect(
  Judgements,
  Effect.gen(function* () {
    // Resolved once here rather than required per call: the frozen tag
    // promises `Effect<void>` with no environment, so the dependency has to
    // be discharged at layer construction.
    const database = yield* Database;

    const record = (
      profile: ProfileId,
      job: CanonicalJobId,
      verdict: Judgement["verdict"],
      reason: string | undefined,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        const judgement = new Judgement({
          profileId: profile,
          jobId: job,
          verdict,
          // The column is NOT NULL with an empty default: "no reason given"
          // and "reason erased" would otherwise be two spellings of one fact.
          reason: reason ?? "",
          createdAt: now,
        });
        yield* Effect.provideService(JudgementRows.record(judgement), Database, database);
      });

    return Judgements.of({ record });
  }),
);
