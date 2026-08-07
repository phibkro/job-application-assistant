import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { firstPresent, isAbsoluteUrl, isoDatePrefix, joinPresence, presence } from "./Text.ts";

/**
 * These specify the property the NAV live payload exists to prove: `null`
 * and an absent key must decode identically. A crafted fixture can only
 * assert this for the cases someone thought to write; the law holds for
 * every string, which is what actually protects the next capture that picks
 * the other shape.
 */

const arbText = fc.string();

describe("presence", () => {
  it("null and undefined are indistinguishable from each other", () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (value) => {
        expect(presence(value)).toBe(presence(undefined));
      }),
    );
  });

  it("any non-blank string round-trips trimmed", () => {
    fc.assert(
      fc.property(
        arbText.filter((value) => value.trim().length > 0),
        (value) => {
          expect(presence(value)).toBe(value.trim());
        },
      ),
    );
  });

  it("is idempotent: presence of a present value never needs a second pass", () => {
    fc.assert(
      fc.property(arbText, (value) => {
        const once = presence(value);
        expect(presence(once)).toBe(once);
      }),
    );
  });
});

describe("firstPresent", () => {
  it("null-padding a candidate list never changes the winner", () => {
    fc.assert(
      fc.property(fc.array(arbText), (values) => {
        const padded: Array<string | null | undefined> = [];
        for (const value of values) padded.push(null, undefined, value);
        expect(firstPresent(padded)).toBe(firstPresent(values));
      }),
    );
  });

  it("returns undefined only when every candidate is absent", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(null, undefined, "", "   ")), (values) => {
        expect(firstPresent(values)).toBeUndefined();
      }),
    );
  });
});

describe("joinPresence", () => {
  it("drops nulls and de-duplicates without ever throwing on empty input", () => {
    expect(joinPresence([null, "Oslo", undefined, "Oslo", "Norway"])).toBe("Oslo, Norway");
    expect(joinPresence([null, undefined, ""])).toBeUndefined();
  });
});

describe("isAbsoluteUrl", () => {
  it("accepts only http(s), never a relative or empty path", () => {
    fc.assert(
      fc.property(fc.webPath(), (path) => {
        expect(isAbsoluteUrl(path)).toBe(false);
      }),
    );
    expect(isAbsoluteUrl("https://example.com/job/1")).toBe(true);
    expect(isAbsoluteUrl("")).toBe(false);
    expect(isAbsoluteUrl(null)).toBe(false);
  });
});

describe("isoDatePrefix", () => {
  it("a value it accepts is always exactly 10 characters of digits and dashes", () => {
    fc.assert(
      fc.property(arbText, (value) => {
        const result = isoDatePrefix(value);
        if (result !== undefined) {
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }),
    );
  });
});
