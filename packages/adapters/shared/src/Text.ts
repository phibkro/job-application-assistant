/**
 * Text normalization shared by every feed adapter.
 *
 * Every adapter in this package decodes payloads where a field can be
 * present, `null`, an empty string, or whitespace, and all four must reach
 * the rest of the pipeline as the same "not provided" value. Recorded NAV
 * data proves this is not a hypothetical: `workLocations[].city` arrives as
 * an explicit JSON `null` in one capture and as a missing key in another for
 * the same field. A decoder that treats those two differently silently loses
 * data the next time the source happens to pick the other shape.
 */

/** Absent, `null`, and blank all collapse to `undefined`: one "not provided". */
export const presence = (value: string | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** The first candidate that is actually present, trimmed. */
export const firstPresent = (
  values: ReadonlyArray<string | null | undefined>,
): string | undefined => {
  for (const value of values) {
    const found = presence(value);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * Joins the present, de-duplicated candidates into one display string.
 *
 * Used to build a location out of parts that individually may be absent
 * (a workLocation's city) or redundant (city and municipal are often the
 * same word in Norwegian addresses).
 */
export const joinPresence = (
  values: ReadonlyArray<string | null | undefined>,
  separator = ", ",
): string | undefined => {
  const seen: Array<string> = [];
  for (const value of values) {
    const found = presence(value);
    if (found !== undefined && !seen.includes(found)) seen.push(found);
  }
  return seen.length === 0 ? undefined : seen.join(separator);
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The leading `YYYY-MM-DD` of a timestamp, or `undefined` when the value is
 * not shaped like a calendar date at all.
 *
 * Exists because a deadline field routinely holds free text instead of a
 * date ("Snarest" — "as soon as possible" — is common on NAV adverts). Text
 * must not become a date: this only ever returns a value it can prove is one.
 *
 * ```ts import.meta.vitest
 * isoDatePrefix("2026-08-25T23:59:59Z") // => "2026-08-25"
 * isoDatePrefix("Snarest") // => undefined
 * isoDatePrefix(undefined) // => undefined
 * ```
 */
export const isoDatePrefix = (value: string | null | undefined): string | undefined => {
  const found = presence(value);
  if (found === undefined) return undefined;
  const candidate = found.slice(0, 10);
  return ISO_DATE.test(candidate) ? candidate : undefined;
};

/**
 * Placeholders shared by every adapter, so "we don't know" reads identically
 * everywhere in the corpus instead of drifting into per-adapter wording.
 */
export const UNKNOWN_EMPLOYER = "Unknown employer";
export const NO_DESCRIPTION = "See source listing for details.";

/** Whether a string is usable as an application URL: absolute, not relative. */
export const isAbsoluteUrl = (value: string | null | undefined): value is string => {
  const found = presence(value);
  return found !== undefined && (found.startsWith("https://") || found.startsWith("http://"));
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("presence", () => {
    it("collapses null, undefined, and blank to the same value", () => {
      expect(presence(null)).toBeUndefined();
      expect(presence(undefined)).toBeUndefined();
      expect(presence("")).toBeUndefined();
      expect(presence("   ")).toBeUndefined();
      expect(presence(" Oslo ")).toBe("Oslo");
    });
  });

  describe("isoDatePrefix", () => {
    it("accepts only a genuine calendar date", () => {
      expect(isoDatePrefix("2026-08-25")).toBe("2026-08-25");
      expect(isoDatePrefix("2026-08-25T23:59:59Z")).toBe("2026-08-25");
      expect(isoDatePrefix("Snarest")).toBeUndefined();
      expect(isoDatePrefix("26-08-25")).toBeUndefined();
    });
  });
}
