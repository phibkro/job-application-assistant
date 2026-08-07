import * as Schema from "effect/Schema";
import {
  ApplicationId,
  CanonicalJobId,
  ProfileId,
  SavedJobId,
  Sequence,
} from "@job-index/domain/Ids";

/**
 * The one place wire strings become domain ids.
 *
 * Every id here is `Schema.String.pipe(Schema.brand(...))` with no
 * refinement, so decoding a string can never fail — these exist to keep the
 * cast in one named place per id kind rather than an `as CanonicalJobId`
 * scattered through every handler, and to be the seam a future refined brand
 * would only need to change once.
 */
export const decodeCanonicalJobId = Schema.decodeUnknownSync(CanonicalJobId);
export const decodeProfileId = Schema.decodeUnknownSync(ProfileId);
export const decodeSavedJobId = Schema.decodeUnknownSync(SavedJobId);
export const decodeApplicationId = Schema.decodeUnknownSync(ApplicationId);

const decodeSequence = Schema.decodeUnknownSync(Sequence);

/** A page's cursor is an opaque, stringified `Sequence`; absent means "from the start". */
export const decodeCursor = (cursor: string | undefined): Sequence =>
  cursor === undefined ? decodeSequence(0) : decodeSequence(Number(cursor));

/** `nextCursor` is unset once a page comes back short — nothing more to walk. */
export const nextCursorOf = (
  items: ReadonlyArray<{ readonly sequence: Sequence }>,
  limit: number,
): string | null => (items.length < limit ? null : String(items[items.length - 1]?.sequence ?? ""));

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/** Clamped rather than rejected: an out-of-range `limit` has an obvious, safe answer. */
export const decodeLimit = (raw: string | undefined, fallback = DEFAULT_PAGE_LIMIT): number => {
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), MAX_PAGE_LIMIT);
};

/**
 * Enum-shaped wire fields decode strictly and default when absent: an
 * out-of-range `limit` has an obvious safe reading, but an unrecognized
 * `decision`/`verdict`/`method` does not, and none of these endpoints
 * declares a validation error to reject one with (see the per-handler
 * comments). A bad value therefore fails loud as a defect rather than being
 * silently coerced into one of the valid options.
 */
export const decodeEnum =
  <const A extends ReadonlyArray<string>>(...values: A) =>
  (raw: string | undefined, fallback?: A[number]): A[number] => {
    const value = raw ?? fallback;
    if (value === undefined || !(values as ReadonlyArray<string>).includes(value)) {
      throw new Error(`expected one of ${values.join(", ")}, got ${JSON.stringify(value)}`);
    }
    return value;
  };
