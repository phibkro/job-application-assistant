import * as Data from "effect/Data";
import type { D1Database } from "../db/D1.ts";
import type { SourceLeaseNamespace } from "../ingestion/SourceLeaseObject.ts";
import type { WorkersAi } from "../inference/model/index.ts";
import { DEFAULT_ATTEMPT_FLOOR_MS } from "../ingestion/lazy.ts";

/**
 * The Worker's environment, checked at the edge of the program.
 *
 * A Worker's `env` arrives as an untyped bag from the platform: a binding that
 * was never declared is `undefined`, not an error. Left unchecked, a missing
 * D1 binding surfaces later as `undefined is not a function` inside a query,
 * on whichever request happened to touch the database first. So the shape is
 * asserted once, at the boundary, and a deployment that is wired wrong fails
 * on its first request with a message naming what is missing.
 */
export interface Env {
  readonly DB: D1Database;
  /**
   * One Durable Object per source, admitting one `Ingestion.collect` run at
   * a time for it. See `ingestion/SourceLeaseObject.ts`.
   */
  readonly SOURCE_LEASE: SourceLeaseNamespace;
  /** `staging` or `production`; whatever the deploy set, reported as-is. */
  readonly ENVIRONMENT: string;
  /**
   * Optional runtime NAV consumer token. A non-empty value selects private
   * mode; absence selects the public token endpoint at request time. The
   * token is never bundled or copied into deployment evidence.
   */
  readonly NAV_API_TOKEN?: string;
  /**
   * Minimum interval between lazy ingestion *attempts*, in milliseconds
   * (WS-0017). Default 21_600_000 (6 hours): the gate fires at most once per
   * floor per platform, and failures back off through the same floor because
   * an attempt stamps the marker whether it succeeded or not. The success
   * target — corpus staleness of roughly a day — is a consequence of this
   * floor plus owner usage, not a second timer; there is deliberately no
   * success-staleness knob. Absence keeps the default.
   */
  readonly INGESTION_ATTEMPT_FLOOR_MS: number;
  /** Optional native Workers AI binding. Absence keeps the deterministic
   * heuristic fallback available; presence enables entitled model requests. */
  readonly AI?: WorkersAi;
}

export class EnvironmentIncomplete extends Data.TaggedError("EnvironmentIncomplete")<{
  readonly missing: ReadonlyArray<string>;
}> {
  override get message(): string {
    return `worker environment is missing: ${this.missing.join(", ")}`;
  }
}

/**
 * A D1 binding is recognised by the methods this service actually calls, not
 * by an instanceof: the runtime class is not exported by the platform, and a
 * duck-typed check is what a test double must satisfy anyway.
 */
const isD1 = (value: unknown): value is D1Database =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { prepare?: unknown }).prepare === "function" &&
  typeof (value as { batch?: unknown }).batch === "function";

/** Same duck-typed reasoning as `isD1`: recognised by the methods this
 *  workspace actually calls, not by an `instanceof` the platform's runtime
 *  class does not export. */
const isSourceLeaseNamespace = (value: unknown): value is SourceLeaseNamespace =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { idFromName?: unknown }).idFromName === "function" &&
  typeof (value as { get?: unknown }).get === "function";

const isWorkersAi = (value: unknown): value is WorkersAi =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { run?: unknown }).run === "function";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * The lazy-ingestion attempt floor, in milliseconds. A plain environment
 * variable, not a binding — but a malformed override is still a deployment
 * wiring bug, so it fails with the same named error as a missing D1 binding
 * rather than silently running at some accidental cadence. Absent keeps the
 * documented default (six hours).
 */
const decodeFloorMs = (value: unknown): number => {
  if (value === undefined) {
    return DEFAULT_ATTEMPT_FLOOR_MS;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EnvironmentIncomplete({
      missing: ["INGESTION_ATTEMPT_FLOOR_MS (a positive integer millisecond count)"],
    });
  }
  return parsed;
};

export const decodeEnv = (env: unknown): Env => {
  const bag = (typeof env === "object" && env !== null ? env : {}) as Record<string, unknown>;
  const missing: Array<string> = [];

  if (!isD1(bag.DB)) {
    missing.push("DB (a D1 binding)");
  }
  if (!isSourceLeaseNamespace(bag.SOURCE_LEASE)) {
    missing.push("SOURCE_LEASE (a Durable Object namespace binding)");
  }
  if (!isNonEmptyString(bag.ENVIRONMENT)) {
    missing.push("ENVIRONMENT");
  }
  if (missing.length > 0) {
    throw new EnvironmentIncomplete({ missing });
  }

  return {
    DB: bag.DB as D1Database,
    ENVIRONMENT: bag.ENVIRONMENT as string,
    SOURCE_LEASE: bag.SOURCE_LEASE as SourceLeaseNamespace,
    NAV_API_TOKEN: isNonEmptyString(bag.NAV_API_TOKEN) ? bag.NAV_API_TOKEN : undefined,
    INGESTION_ATTEMPT_FLOOR_MS: decodeFloorMs(bag.INGESTION_ATTEMPT_FLOOR_MS),
    AI: isWorkersAi(bag.AI) ? bag.AI : undefined,
  };
};
