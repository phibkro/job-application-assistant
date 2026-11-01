import * as Config from "effect/Config";
import * as Schema from "effect/Schema";

/**
 * Bounded background hydration (WS-0022 §5, option A): how many NAV detail fetches one ingestion run may make, into
 * the observation store, so workload facts do not wait for someone to open a vacancy.
 *
 * **Provisional (lead amendment L4).** The real default is set from the first staging measurement. This one is
 * conservative by construction, from what is measured in this repository, not from a live load test:
 *
 * - The lazy driver's run reads exactly one NAV feed page (`DEFAULT_RUN_BUDGET.maxPages = 1`), and a page holds at
 *   most `FEED_PAGE_SIZE = 5` entries (`packages/adapters/nav/src/index.ts`). Five detail fetches per run keep pace
 *   with what one run can add, so the hydration backlog does not grow from lazy ingestion alone.
 * - Subrequests per run, counted in `observations/hydration.live.test.ts` against the scripted NAV: 1 feed request
 *   plus 1 per detail fetch; in production add at most 1 public-token request and the 2 `SourceLease` Durable Object
 *   calls. With 5 that is ≤ 9, under a fifth of the Workers Free per-invocation limit of 50 that
 *   `design-specs/deferred-hydration.md` designs against.
 * - Every fetch is also bounded by what is left of the run's 25 s duration budget, so a slow NAV shortens hydration,
 *   never the page commit before it.
 *
 * `INGESTION_HYDRATION_PER_RUN` overrides it per deployment; 0 turns bounded hydration off. Values above
 * `MAX_HYDRATION_PER_RUN` are a wiring error, not a request to fetch more.
 */
export const PROVISIONAL_HYDRATION_PER_RUN = 5;

/** The ceiling an override may ask for: 40 details + the run's own ≤ 4 subrequests stays under 50. */
export const MAX_HYDRATION_PER_RUN = 40;

export const HYDRATION_PER_RUN_KEY = "INGESTION_HYDRATION_PER_RUN";

export const hydrationPerRun: Config.Config<number> = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_HYDRATION_PER_RUN })),
  HYDRATION_PER_RUN_KEY,
).pipe(Config.withDefault(PROVISIONAL_HYDRATION_PER_RUN));
