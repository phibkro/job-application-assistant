import type {
  AdapterUnavailable,
  DecodeFailed,
  RateLimited,
  RendererUnavailable,
  SourceUnavailable,
  Unauthorized,
} from "@job-index/domain/Failure";

/** Everything `Acquisition.page` can fail with — see `Acquisition.ts`'s own union. */
export type PageFailure =
  | AdapterUnavailable
  | DecodeFailed
  | RateLimited
  | RendererUnavailable
  | SourceUnavailable
  | Unauthorized;

/** Which of these are worth a bounded retry within the same page attempt. */
export const isRetryable = (failure: PageFailure): boolean =>
  failure._tag === "SourceUnavailable" || failure._tag === "RateLimited";

/**
 * A one-line, human-readable account of a page failure, for the failure
 * ledger. Each tag names a different fact — an HTTP status, a rejected
 * field, a retry-after window — because "AdapterUnavailable" alone cannot
 * answer whether NAV is down or nobody configured this platform's tier.
 */
export const describeFailure = (failure: PageFailure): string => {
  switch (failure._tag) {
    case "SourceUnavailable":
      return failure.status === undefined ? "no response" : `HTTP ${failure.status}`;
    case "RateLimited":
      return `rate limited; retry after ${failure.retryAfterMs}ms`;
    case "Unauthorized":
      return "credentials rejected";
    case "DecodeFailed":
      return `${failure.field}: ${failure.detail}`;
    case "AdapterUnavailable":
      return `no adapter registered for tier ${failure.tier}`;
    case "RendererUnavailable":
      return "agent tier requested but no renderer is configured";
  }
};
