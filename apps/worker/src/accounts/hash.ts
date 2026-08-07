import * as Effect from "effect/Effect";

/**
 * The two primitives every credential check in this slot is built from.
 *
 * Both use Web Crypto (`crypto.subtle`, `crypto.getRandomValues`), which
 * exists identically in Workers and in Bun — no dependency, no polyfill, and
 * the same code path runs in tests and in production.
 *
 * `crypto.subtle` reads no ambient state the way `Date.now()` or
 * `crypto.randomUUID()` do: `digest(algorithm, bytes)` is a pure function of
 * its two arguments, same input always same output, so a test never needs to
 * fix or fake it — `sha256Hex`'s own inline test below asserts the digest
 * directly rather than substituting a stub. That is why this module keeps the
 * ambient `crypto` global (the lint rule scoped by directory allows it here
 * specifically) while `Ids`/`Clock` sites elsewhere route through a service:
 * this is a digest, not a capability.
 */

/**
 * SHA-256 of a UTF-8 string, hex-encoded.
 *
 * This is the only form a presented secret (a session token, an API key) is
 * ever compared against what is stored: the row holds `sha256Hex(secret)`,
 * never `secret` itself. A one-way digest is what makes "the stored form
 * cannot be the presented form" true by construction rather than by promise —
 * see `hash.test.ts`, which proves it against the actual output rather than
 * trusting this comment.
 *
 * ```ts import.meta.vitest
 * const digest = await Effect.runPromise(sha256Hex("correct horse battery staple"))
 * digest.length // => 64
 * /^[0-9a-f]+$/.test(digest) // => true
 * ```
 */
export const sha256Hex = (secret: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const bytes = new TextEncoder().encode(secret);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  });

/**
 * Constant-time string equality.
 *
 * `===` on strings returns as soon as it finds a differing byte (or a
 * differing length), which turns "is this the right secret" into a clock a
 * remote attacker can read: measure enough attempts and the response time
 * reveals how many leading bytes matched. This walks every byte of the
 * longer input regardless of where — or whether — a difference appears, and
 * folds a length mismatch into the same accumulator rather than branching on
 * it early, so the number of iterations depends only on input length, never
 * on content.
 *
 * Used wherever this slot re-checks a hash it already looked up by equality
 * in SQL: the database index is not an application-level guarantee, so the
 * match is verified again here before it is trusted.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  // Folded in up front so a length difference never short-circuits the loop below.
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
};

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;

  it("hashes deterministically and never reproduces the input", () => {
    return Effect.runPromise(
      Effect.gen(function* () {
        const digest = yield* sha256Hex("a shared secret");
        expect(digest).not.toBe("a shared secret");
        expect(digest).toBe(yield* sha256Hex("a shared secret"));
      }),
    );
  });

  it("timingSafeEqual agrees with === on equal, differing-content, and differing-length inputs", () => {
    expect(timingSafeEqual("same-secret", "same-secret")).toBe(true);
    expect(timingSafeEqual("same-secret", "sbme-secret")).toBe(false);
    expect(timingSafeEqual("short", "much-longer-string")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
}
