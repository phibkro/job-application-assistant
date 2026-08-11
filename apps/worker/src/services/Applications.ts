import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ApplicationRecord } from "@job-index/domain/Applications";
import type { ApplicationId, SavedJobId, UserId } from "@job-index/domain/Ids";
import type { Documents } from "./Drafting.ts";
import type {
  ApplicationMissing,
  DraftMissing,
  EntitlementRequired,
  InvalidApplicationTransition,
  PolicyProhibited,
  SavedJobMissing,
  StaleApplicationUpdate,
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

export type ApplicationEventName =
  | "confirm-submission"
  | "record-interview"
  | "record-offer"
  | "record-rejection"
  | "withdraw";
export interface ApplicationEventResult {
  readonly applicationId: ApplicationId;
  readonly status: ApplicationStatus;
  readonly updatedAt: string;
}

export interface SavedApplicationHistoryEntry {
  readonly applicationId: ApplicationId;
  readonly status: ApplicationStatus;
  readonly method: Method;
  readonly applicationUrl: string;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isCurrent: boolean;
}

/** Compatibility decisions for the original preparation endpoint. */
export type Decision = "approve" | "rework" | "decline";

/** Approval reviews the prepared package; only confirmation submits it. */
export const statusForDecision = (decision: Decision): ApplicationStatus =>
  decision === "decline" ? "withdrawn" : "ready";

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
    readonly recordEvent: (
      user: UserId,
      application: ApplicationId,
      event: ApplicationEventName,
      notes: string | undefined,
      expectedUpdatedAt: string,
    ) => Effect.Effect<
      ApplicationEventResult,
      ApplicationMissing | InvalidApplicationTransition | StaleApplicationUpdate
    >;
    readonly setStatus: (
      user: UserId,
      application: ApplicationId,
      status: ApplicationStatus,
      notes: string,
    ) => Effect.Effect<void, ApplicationMissing>;

    /** Every attempt for one owned saved vacancy, newest first. */
    readonly historyForSaved: (
      user: UserId,
      savedJob: SavedJobId,
    ) => Effect.Effect<ReadonlyArray<SavedApplicationHistoryEntry>, SavedJobMissing>;

    /** Every application this profile has prepared, for their own history/export. */
    readonly history: (user: UserId) => Effect.Effect<ReadonlyArray<ApplicationRecord>>;
  }
>()("@job-index/Applications") {}
