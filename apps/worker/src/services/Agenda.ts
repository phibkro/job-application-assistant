import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { SavedSearchId, ScheduleId, UserId } from "@job-index/domain/Ids";
import type { EntitlementRequired } from "@job-index/domain/Failure";
import type { Method } from "./Applications.ts";

/**
 * Scheduled preparation of applications for a subscriber.
 *
 * The cadence is a closed set rather than a cron string: a subscriber chooses
 * how often, not when precisely, and accepting arbitrary crons would let them
 * choose "every minute" with the drafting cost that implies.
 */
export type Cadence = "daily" | "weekly" | "monthly";

export interface Schedule {
  readonly id: ScheduleId;
  readonly search: SavedSearchId;
  readonly cadence: Cadence;
  /** Bounded per run: each prepared application costs drafting work. */
  readonly maxPerRun: number;
  readonly method: Method;
  readonly enabled: boolean;
  readonly nextRunAt: number;
}

export interface SweepReport {
  readonly due: number;
  readonly ran: number;
  readonly prepared: number;
  /** Subscriptions that lapsed since the schedule was created. */
  readonly skippedUnentitled: number;
}

export class Agenda extends Context.Service<
  Agenda,
  {
    readonly create: (
      user: UserId,
      search: SavedSearchId,
      cadence: Cadence,
      maxPerRun: number,
      method: Method,
    ) => Effect.Effect<Schedule, EntitlementRequired>;

    readonly cancel: (user: UserId, schedule: ScheduleId) => Effect.Effect<void>;

    /**
     * Runs everything now due. Re-checks entitlement per schedule, so a lapsed
     * subscription stops the work and records that it did, rather than
     * continuing because it was entitled when the schedule was made.
     */
    readonly runDue: (now: number) => Effect.Effect<SweepReport>;
  }
>()("@job-index/Agenda") {}
