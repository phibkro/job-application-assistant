import * as Schema from "effect/Schema";

/**
 * Branded identifiers.
 *
 * Every id in this system is a string, which is why they are branded: a
 * `SavedJobId` passed where a `CanonicalJobId` belongs is the kind of mistake
 * that reads correctly and behaves wrongly. Three of the defects found while
 * building the Rust implementation were positional arguments of the same
 * primitive type; branding removes that class rather than testing for it.
 */

export const CanonicalJobId = Schema.String.pipe(Schema.brand("CanonicalJobId"));
export type CanonicalJobId = typeof CanonicalJobId.Type;

export const OccurrenceId = Schema.String.pipe(Schema.brand("OccurrenceId"));
export type OccurrenceId = typeof OccurrenceId.Type;

export const SourceId = Schema.String.pipe(Schema.brand("SourceId"));
export type SourceId = typeof SourceId.Type;

/** A catalogued platform, e.g. `arbeidsplassen-nav`. Distinct from SourceId. */
export const PlatformId = Schema.String.pipe(Schema.brand("PlatformId"));
export type PlatformId = typeof PlatformId.Type;

/**
 * The profile is the root of the system, so its id is the one most other
 * aggregates carry. `UserId` is retained as its alias while the migration is
 * in progress; new code should reach for `ProfileId`.
 */
export const ProfileId = Schema.String.pipe(Schema.brand("ProfileId"));
export type ProfileId = typeof ProfileId.Type;

export const UserId = ProfileId;
export type UserId = ProfileId;

export const DeliveryPlatformId = Schema.String.pipe(Schema.brand("DeliveryPlatformId"));
export type DeliveryPlatformId = typeof DeliveryPlatformId.Type;

export const SubmissionId = Schema.String.pipe(Schema.brand("SubmissionId"));
export type SubmissionId = typeof SubmissionId.Type;

export const PrincipalId = Schema.String.pipe(Schema.brand("PrincipalId"));
export type PrincipalId = typeof PrincipalId.Type;

export const SavedJobId = Schema.String.pipe(Schema.brand("SavedJobId"));
export type SavedJobId = typeof SavedJobId.Type;

export const ApplicationId = Schema.String.pipe(Schema.brand("ApplicationId"));
export type ApplicationId = typeof ApplicationId.Type;

export const SavedSearchId = Schema.String.pipe(Schema.brand("SavedSearchId"));
export type SavedSearchId = typeof SavedSearchId.Type;

export const ScheduleId = Schema.String.pipe(Schema.brand("ScheduleId"));
export type ScheduleId = typeof ScheduleId.Type;

/**
 * The corpus sequence. Saved searches evaluate only what changed after the
 * sequence they last saw, so it is ordered and monotonic by contract.
 */
export const Sequence = Schema.Number.pipe(Schema.brand("Sequence"));
export type Sequence = typeof Sequence.Type;
