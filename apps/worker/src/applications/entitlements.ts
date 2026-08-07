import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { EntitlementRequired } from "@job-index/domain/Failure";
import { permits } from "@job-index/domain/decide/Access";
import { Database } from "../services/Database.ts";
import * as SubscriptionsRepo from "../db/repositories/Subscriptions.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { effectiveTier } from "./decide.ts";
import { withDatabase } from "./db.ts";

/**
 * What an account's subscription permits, re-asked on every call: `has`
 * reads the row and checks expiry each time rather than caching a decision,
 * which is the only way a schedule made while premium stops working the
 * instant the subscription lapses (`Entitlements.ts`'s own contract).
 */
export const layer = Layer.effect(
  Entitlements,
  Effect.gen(function* () {
    const database = yield* Database;
    const withDb = withDatabase(database);

    const has: Effect.Success<typeof Entitlements>["has"] = (user, capability) =>
      Effect.gen(function* () {
        const subscription = yield* withDb(SubscriptionsRepo.findByProfile(user));
        const tier = subscription === undefined ? { _tag: "Free" as const } : subscription.tier;
        // `effectiveTier` is a total function of its arguments (see
        // `decide.ts`) — `now` is read once, here, through `Clock`, so a test
        // can fix it and assert the exact instant a subscription lapses.
        const now = yield* DateTime.now;
        return permits(effectiveTier(tier, DateTime.toDate(now)), capability);
      });

    const require: Effect.Success<typeof Entitlements>["require"] = (user, capability) =>
      Effect.gen(function* () {
        const granted = yield* has(user, capability);
        if (!granted) {
          return yield* Effect.fail(new EntitlementRequired({ capability }));
        }
      });

    return Entitlements.of({ has, require });
  }),
);
