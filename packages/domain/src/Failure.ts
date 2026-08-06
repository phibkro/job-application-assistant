import * as Data from "effect/Data";

/**
 * Failures as types.
 *
 * These mirror the `failure_class` values already stored in `source_failures`.
 * The taxonomy exists either way; the difference is that a tagged error makes
 * the compiler check that a caller handled it, and makes "retryable" a
 * property of the variant rather than a boolean somebody remembered to set.
 */

/** The source answered, but not usefully. Retry later. */
export class SourceUnavailable extends Data.TaggedError("SourceUnavailable")<{
  readonly source: string;
  readonly status?: number;
}> {}

/** The source asked us to slow down and said for how long. */
export class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly source: string;
  readonly retryAfterMs: number;
}> {}

/** Credentials were rejected. Retrying without changing them is pointless. */
export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly source: string;
}> {}

/**
 * The payload did not match its declared shape.
 *
 * This is the failure that hid for an entire release: every live detail fetch
 * failed to decode and fell back to summary data, while the counters reported
 * success. It carries the field so the log names what disagreed.
 */
export class DecodeFailed extends Data.TaggedError("DecodeFailed")<{
  readonly source: string;
  readonly field: string;
  readonly detail: string;
}> {}

/** No adapter can read this platform yet. Not an error to retry. */
export class AdapterUnavailable extends Data.TaggedError("AdapterUnavailable")<{
  readonly platform: string;
  readonly tier: string;
}> {}

/** Agent acquisition was required but no renderer is configured. */
export class RendererUnavailable extends Data.TaggedError("RendererUnavailable")<{
  readonly platform: string;
}> {}

/** The platform's terms forbid what was asked. Paying does not change this. */
export class PolicyProhibited extends Data.TaggedError("PolicyProhibited")<{
  readonly platform: string;
  readonly policy: string;
}> {}

/** The account's tier does not include this capability. */
export class EntitlementRequired extends Data.TaggedError("EntitlementRequired")<{
  readonly capability: string;
}> {}

/** Another run holds the source lease. */
export class LeaseHeld extends Data.TaggedError("LeaseHeld")<{
  readonly source: string;
  readonly owner: string;
}> {}

export class ProfileIncomplete extends Data.TaggedError("ProfileIncomplete")<{
  readonly missing: string;
}> {}

export class DraftMissing extends Data.TaggedError("DraftMissing")<{
  readonly savedJob: string;
}> {}
