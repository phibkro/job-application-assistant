import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { AutomationPolicy } from "@job-index/domain/Source";
import { PolicyProhibited } from "@job-index/domain/Failure";
import type { PlatformId } from "@job-index/domain/Ids";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { Policy } from "../services/Policy.ts";
import * as PlatformPolicies from "./platformPolicies.ts";
import { withDatabase } from "./db.ts";

interface PlatformRow {
  readonly id: string;
}

/**
 * Which delivery platform a job's `applicationUrl` belongs to. Reuses
 * `delivery_platforms.hostPattern` — an existing, already-general mechanism
 * for "which platform does this URL belong to" — without reading anything
 * else from that table: `automationProhibited`/`learnedAt` answer a
 * mechanical question (can we fill this platform's form) this slot does not
 * conflate with the contractual one `Policy` answers. See the report for why
 * that table cannot back `Policy` directly.
 */
const SELECT_DELIVERY_PLATFORM_BY_URL = `SELECT id FROM delivery_platforms WHERE ? LIKE '%' || hostPattern || '%' LIMIT 1`;

const toAutomationPolicy = (tag: string): AutomationPolicy => ({ _tag: tag }) as AutomationPolicy;

export const layer = Layer.effect(
  Policy,
  Effect.gen(function* () {
    const database = yield* Database;
    const corpus = yield* Corpus;
    const withDb = withDatabase(database);

    const forJob: Effect.Success<typeof Policy>["forJob"] = (job) =>
      Effect.gen(function* () {
        const canonical = yield* corpus.get(job);
        if (canonical === undefined) {
          return { platform: "" as PlatformId, policy: toAutomationPolicy("Unreviewed") };
        }

        const rows = yield* database.query<PlatformRow>(SELECT_DELIVERY_PLATFORM_BY_URL, [
          canonical.applicationUrl,
        ]);
        const platform = (rows[0]?.id ?? "") as PlatformId;
        if (platform === "") {
          // No catalogued platform matches this URL: nobody has researched
          // it, which is exactly what `Unreviewed` means.
          return { platform, policy: toAutomationPolicy("Unreviewed") };
        }

        const record = yield* withDb(PlatformPolicies.findById(platform));
        return { platform, policy: toAutomationPolicy(record?.policy ?? "Unreviewed") };
      });

    const requireAutomatable: Effect.Success<typeof Policy>["requireAutomatable"] = (job) =>
      Effect.gen(function* () {
        const { platform, policy } = yield* forJob(job);
        if (policy._tag !== "Allowed") {
          return yield* Effect.fail(new PolicyProhibited({ platform, policy: policy._tag }));
        }
      });

    return Policy.of({ forJob, requireAutomatable });
  }),
);
