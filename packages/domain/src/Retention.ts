/**
 * How long a vacancy is worth keeping after it stops being live.
 *
 * The operator's decision: a year. Someone may want to look back at what they
 * applied to; nobody needs a listing that expired two years ago, and storing
 * one costs money to no purpose.
 *
 * It bounds reading as much as storing, and that is the more useful half. If
 * we will not keep a vacancy that expired over a year ago, there is no reason
 * to fetch one — which is what makes a feed published as a multi-year history
 * tractable to a service that only cares about the recent end of it.
 *
 * NAV's own documentation puts a shorter ceiling on the same idea: "An ad can
 * never be active for more than 6 months." A year is therefore comfortably
 * conservative for that source rather than a guess, and leaves room for
 * platforms with longer-lived adverts.
 *
 * An application's own snapshot is unaffected. That copy belongs to the person
 * who applied, is stored with their account, and outlives the corpus entry it
 * was taken from — see `SavedJob.jobSnapshot`.
 */
export const RETENTION_WINDOW_DAYS = 365;

export const RETENTION_WINDOW_MS = RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * The instant before which a vacancy is no longer worth reading or keeping.
 *
 * Takes `now` rather than reading a clock: this is domain code, and a boundary
 * a caller cannot control is a boundary a test cannot assert.
 */
export const retentionBoundary = (now: Date): Date => new Date(now.getTime() - RETENTION_WINDOW_MS);
