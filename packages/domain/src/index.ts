/**
 * The domain, re-exported for callers that want the whole vocabulary.
 *
 * Individual modules remain importable directly — `@job-index/domain/Job` —
 * and that is the preferred form, because it keeps an import list honest about
 * what a module actually depends on.
 */
export * as Access from "./Access.ts";
export * as Answer from "./Answer.ts";
export * as Applications from "./Applications.ts";
export * as Delivery from "./Delivery.ts";
export * as Saved from "./Saved.ts";
export * as SetExpression from "./SetExpression.ts";
export * as TransitionSystem from "./TransitionSystem.ts";
export * as Failure from "./Failure.ts";
export * as Freshness from "./Freshness.ts";
export * as Ids from "./Ids.ts";
export * as Job from "./Job.ts";
export * as Profile from "./Profile.ts";
export * as Source from "./Source.ts";
export * as Subscription from "./Subscription.ts";
