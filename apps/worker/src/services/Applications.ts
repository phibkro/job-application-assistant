import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ApplicationId, SavedJobId, UserId } from "@job-index/domain/Ids";
import type { Documents } from "./Drafting.ts";
import type {
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

export class Applications extends Context.Service<
  Applications,
  {
    readonly prepare: (
      user: UserId,
      savedJob: SavedJobId,
      requested: Method,
    ) => Effect.Effect<Prepared, DraftMissing | EntitlementRequired | PolicyProhibited>;

    readonly setStatus: (
      user: UserId,
      application: ApplicationId,
      status: ApplicationStatus,
      notes: string,
    ) => Effect.Effect<void>;
  }
>()("@job-index/Applications") {}
