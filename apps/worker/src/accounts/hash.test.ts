import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import { sha256Hex, timingSafeEqual } from "./hash.ts";

describe("sha256Hex", () => {
  /**
   * The security property this slot exists to guarantee: what gets stored
   * is never the thing someone typed. Proven directly against the output,
   * across a wide range of inputs, rather than trusted from the function's
   * name.
   */
  it("never returns the input it was given", () =>
    fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 200 }), async (secret) => {
        const digest = await Effect.runPromise(sha256Hex(secret));
        expect(digest).not.toBe(secret);
        // A digest of a different shape (fixed hex length) than most inputs
        // is itself evidence of a transform, not a copy.
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
      }),
    ));

  it("is deterministic: the same secret always hashes to the same stored form", () =>
    fc.assert(
      fc.asyncProperty(fc.string(), async (secret) => {
        const [first, second] = await Effect.runPromise(
          Effect.all([sha256Hex(secret), sha256Hex(secret)]),
        );
        expect(first).toBe(second);
      }),
    ));

  it("distinguishes distinct secrets (no collision in this sample space)", async () => {
    const a = await Effect.runPromise(sha256Hex("secret-a"));
    const b = await Effect.runPromise(sha256Hex("secret-b"));
    expect(a).not.toBe(b);
  });
});

describe("timingSafeEqual", () => {
  // The three cases the slot's brief calls out explicitly: equal, differing
  // content of the same length, and differing length.
  it.each([
    { a: "abc123", b: "abc123", expected: true, why: "equal" },
    { a: "abc123", b: "abc124", expected: false, why: "differing content, same length" },
    { a: "abc123", b: "abc12", expected: false, why: "differing length" },
    { a: "", b: "", expected: true, why: "both empty" },
    { a: "x", b: "", expected: false, why: "one empty" },
  ])("returns $expected for $why", ({ a, b, expected }) => {
    expect(timingSafeEqual(a, b)).toBe(expected);
  });

  /**
   * Functional correctness across the input space: whatever the timing
   * behaviour, the boolean answer must always agree with `===`. A unit test
   * cannot observe timing directly (CI noise would make it flaky by
   * construction — see `Model.Sensitive` for the other kind of test that
   * would rather assert structure than a stopwatch); this pins the one thing
   * that *can* be asserted reliably: the algorithm computes the same
   * verdict as strict equality for every pair.
   */
  it("agrees with === for arbitrary string pairs", () =>
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(timingSafeEqual(a, b)).toBe(a === b);
      }),
    ));

  it("agrees with === when the two strings are equal by construction", () =>
    fc.assert(
      fc.property(fc.string(), (a) => {
        expect(timingSafeEqual(a, a)).toBe(true);
      }),
    ));
});
