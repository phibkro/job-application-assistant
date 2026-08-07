import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ApplicationId, SavedJobId, UserId } from "@job-index/domain/Ids";
import type { Documents } from "./Drafting.ts";
import type {
  ApplicationMissing,
  DraftMissing,
  EntitlementRequired,
  PolicyProhibited,
} from "@job-index/domain/Failure";

/**
 * Preparing and recording an application.
 *
 * `prepare` deliberately returns what was actually done rather than what was
 * asked for. A request to submit automatically may come back assisted, because
 * the platform's policy forbids automation — and the caller must be able to
 * tell the person why. Returning a bare success would lose that, and returning
 * a failure would be wrong: an assisted package is a good outcome.
 */
export type Method = "assisted" | "automated";

export interface Prepared {
  readonly application: ApplicationId;
  readonly method: Method;
  readonly documents: Documents;
  readonly applicationUrl: string;
  /** Set when the requested method was downgraded, naming the platform and why. */
  readonly downgradeReason?: string;
}

export type ApplicationStatus =
  | "ready"
  | "submitted"
  | "rejected"
  | "interview"
  | "offer"
  | "withdrawn";

/**
 * The human step in an automated run, and what it does to the application.
 *
 * Two vocabularies meet here: a person approves, reworks, or declines; the
 * application moves through a lifecycle. Nothing stated how they line up, so
 * the handler was making the call — which put a product rule in the layer
 * whose job is decoding strings.
 *
 * Approving is what submission means, so it submits. Declining ends this
 * application rather than pausing it, so it withdraws — a person who changes
 * their mind saves the job again. Rework returns it to `ready`, the state a
 * freshly prepared application is already in, because "draft it again" is the
 * same work as drafting it the first time.
 */
export type Decision = "approve" | "rework" | "decline";

export const statusForDecision = (decision: Decision): ApplicationStatus =>
  decision === "approve" ? "submitted" : decision === "decline" ? "withdrawn" : "ready";

export class Applications extends Context.Service<
  Applications,
  {
    readonly prepare: (
      user: UserId,
      savedJob: SavedJobId,
      requested: Method,
    ) => Effect.Effect<Prepared, DraftMissing | EntitlementRequired | PolicyProhibited>;

    /**
     * Fails when the application is not this profile's. It used to return
     * `Effect<void>` and treat an unknown id as a no-op, which made the wire's
     * declared `NotFound` unreachable: a decision on an application that does
     * not exist answered 200, and the person who mistyped an id was told their
     * decision had been recorded.
     */
    readonly setStatus: (
      user: UserId,
      application: ApplicationId,
      status: ApplicationStatus,
      notes: string,
    ) => Effect.Effect<void, ApplicationMissing>;
  }
>()("@job-index/Applications") {}
